//! ffmpeg alt süreci: yetenek tespiti, argüman üretimi, ilerleme ayrıştırma, iptal/zaman aşımı.
//! Argümanlar her zaman liste olarak verilir; kabuk yok.

use std::{collections::HashSet, path::Path, process::Stdio, time::Duration};

use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::Command,
};
use tokio_util::sync::CancellationToken;

use crate::{
    error::{AppError, AppResult},
    formats::{Options, Target},
    probe::FfprobeInfo,
};

/// Başlangıçta bir kez tespit edilen ffmpeg yetenekleri.
#[derive(Debug, Clone, Default)]
pub struct Capabilities {
    pub version: Option<String>,
    pub encoders: HashSet<String>,
}

impl Capabilities {
    pub fn available(&self) -> bool {
        self.version.is_some()
    }
    pub fn has(&self, enc: &str) -> bool {
        self.encoders.contains(enc)
    }

    /// Bu hedef için gerekli kodlayıcılar var mı?
    pub fn supports(&self, target: &Target) -> bool {
        if !self.available() {
            return false;
        }
        match target.id {
            "mp4" | "mkv" | "mov" => self.has("libx264") || self.has("h264_videotoolbox"),
            "webm" => self.has("libvpx-vp9") && self.has("libopus"),
            "gif_anim" => self.has("gif"),
            "mp3" => self.has("libmp3lame"),
            "m4a" => self.has("aac"),
            "opus" => self.has("libopus"),
            "ogg" => self.has("libvorbis") || self.has("vorbis"),
            "flac" => self.has("flac"),
            "wav" => self.has("pcm_s16le"),
            _ => true,
        }
    }
}

pub async fn detect(ffmpeg_bin: &str) -> Capabilities {
    let version = Command::new(ffmpeg_bin)
        .arg("-version")
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout);
            s.lines()
                .next()
                .and_then(|l| l.split_whitespace().nth(2))
                .map(str::to_string)
        });
    let Some(version) = version else {
        return Capabilities::default();
    };
    let encoders = Command::new(ffmpeg_bin)
        .args(["-hide_banner", "-encoders"])
        .output()
        .await
        .ok()
        .map(|o| parse_encoders(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default();
    Capabilities {
        version: Some(version),
        encoders,
    }
}

fn parse_encoders(text: &str) -> HashSet<String> {
    // Satır biçimi: " V....D libx264              libx264 H.264 / ..."
    text.lines()
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            let flags = it.next()?;
            let name = it.next()?;
            (flags.len() == 6 && flags.starts_with(['V', 'A', 'S'])).then(|| name.to_string())
        })
        .collect()
}

/// Çalıştırma planı: birincil argümanlar, isteğe bağlı yedek (örn. donanım → yazılım).
#[derive(Debug, Clone)]
pub struct Plan {
    pub args: Vec<String>,
    pub fallback: Option<Vec<String>>,
    /// İlerleme yüzdesi için beklenen çıktı süresi (sn).
    pub expected_duration: Option<f64>,
}

fn s(x: impl ToString) -> String {
    x.to_string()
}

fn trim_args(opts: &Options, total: Option<f64>) -> (Vec<String>, Vec<String>, Option<f64>) {
    let start = opts.float("trim_start");
    let end = opts.float("trim_end");
    let mut before_input = Vec::new();
    let mut after_input = Vec::new();
    if start > 0.0 {
        before_input.extend(["-ss".into(), format!("{start:.3}")]);
    }
    let mut dur = total.map(|t| (t - start).max(0.0));
    if end > start {
        let len = end - start;
        after_input.extend(["-t".into(), format!("{len:.3}")]);
        dur = Some(match dur {
            Some(d) => d.min(len),
            None => len,
        });
    }
    (before_input, after_input, dur)
}

fn atempo_chain(speed: f64) -> Vec<String> {
    // atempo 0.5–100 arası; 0.25 için iki kez 0.5
    let mut out = Vec::new();
    let mut rem = speed;
    while rem < 0.5 {
        out.push("atempo=0.5".to_string());
        rem /= 0.5;
    }
    if (rem - 1.0).abs() > f64::EPSILON {
        out.push(format!("atempo={rem}"));
    }
    out
}

/// Hedef + seçenekler → ffmpeg argümanları.
pub fn build_plan(
    target: &Target,
    opts: &Options,
    input: &Path,
    output: &Path,
    info: &FfprobeInfo,
    caps: &Capabilities,
    hwaccel: bool,
) -> AppResult<Plan> {
    let (ss, t, mut expected) = trim_args(opts, info.duration);
    let speed = {
        let v = opts.float("speed");
        if v > 0.0 { v } else { 1.0 }
    };
    if (speed - 1.0).abs() > f64::EPSILON {
        expected = expected.map(|d| d / speed);
    }

    let mut base: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ];
    base.extend(ss);
    base.extend(["-i".into(), format!("file:{}", input.display())]);
    base.extend(t);

    let mut sw: Vec<String> = Vec::new();
    let mut hw: Option<Vec<String>> = None;

    match target.kind {
        crate::formats::Kind::Video if target.id == "gif_anim" => {
            let fps = opts.int("fps").max(1);
            let width = opts.int("width").max(16);
            let dither = match opts.text("dither") {
                "floyd_steinberg" => "floyd_steinberg",
                "none" => "none",
                _ => "bayer:bayer_scale=5",
            };
            let mut chain = vec![
                format!("fps={fps}"),
                format!("scale={width}:-2:flags=lanczos"),
            ];
            if (speed - 1.0).abs() > f64::EPSILON {
                chain.push(format!("setpts=PTS/{speed}"));
            }
            let fc = format!(
                "[0:v:0]{},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither={dither}",
                chain.join(",")
            );
            sw.extend([
                "-filter_complex".into(),
                fc,
                "-an".into(),
                "-sn".into(),
                "-dn".into(),
                "-f".into(),
                "gif".into(),
            ]);
        }
        crate::formats::Kind::Video => {
            if !info.has_video {
                return Err(AppError::Unsupported("dosyada video akışı yok".into()));
            }
            let mut vf: Vec<String> = Vec::new();
            let fps = opts.int("fps");
            if fps > 0 {
                vf.push(format!("fps={fps}"));
            }
            if let Ok(h) = opts.text("resolution").parse::<u32>() {
                // yalnız küçült, oranı koru, çift sayıya yuvarla
                vf.push(format!("scale=-2:'min({h},ih)'"));
            }
            if (speed - 1.0).abs() > f64::EPSILON {
                vf.push(format!("setpts=PTS/{speed}"));
            }
            // yuv420p ve çift boyut: tüm oynatıcılar için
            vf.push("scale=trunc(iw/2)*2:trunc(ih/2)*2".into());
            vf.push("format=yuv420p".into());

            let mute = opts.flag("mute") || !info.has_audio;
            let mut common = vec!["-map".to_string(), "0:v:0".into()];
            if !mute {
                common.extend(["-map".into(), "0:a:0".into()]);
            }
            common.extend(["-sn".into(), "-dn".into(), "-vf".into(), vf.join(",")]);
            if mute {
                common.push("-an".into());
            } else {
                let mut af = atempo_chain(speed);
                if !af.is_empty() {
                    common.extend(["-af".into(), std::mem::take(&mut af).join(",")]);
                }
            }

            let crf = opts.int("crf");
            let preset = opts.text("preset");
            let ab = opts.text("audio_bitrate");
            match target.id {
                "webm" => {
                    sw.extend(common.clone());
                    sw.extend([
                        "-c:v".into(),
                        "libvpx-vp9".into(),
                        "-crf".into(),
                        s(crf),
                        "-b:v".into(),
                        "0".into(),
                        "-row-mt".into(),
                        "1".into(),
                        "-deadline".into(),
                        "good".into(),
                        "-cpu-used".into(),
                        "2".into(),
                    ]);
                    if !mute {
                        sw.extend([
                            "-c:a".into(),
                            "libopus".into(),
                            "-b:a".into(),
                            format!("{ab}k"),
                        ]);
                    }
                    sw.extend(["-f".into(), "webm".into()]);
                }
                _ => {
                    // mp4 / mkv / mov → H.264 + AAC
                    let container = match target.id {
                        "mkv" => "matroska",
                        "mov" => "mov",
                        _ => "mp4",
                    };
                    let mut tail: Vec<String> = Vec::new();
                    if !mute {
                        tail.extend(["-c:a".into(), "aac".into(), "-b:a".into(), format!("{ab}k")]);
                    }
                    if container != "matroska" {
                        tail.extend(["-movflags".into(), "+faststart".into()]);
                    }
                    tail.extend(["-f".into(), container.into()]);

                    let mut soft = common.clone();
                    soft.extend([
                        "-c:v".into(),
                        "libx264".into(),
                        "-preset".into(),
                        preset.into(),
                        "-crf".into(),
                        s(crf),
                    ]);
                    soft.extend(tail.clone());

                    if hwaccel && caps.has("h264_videotoolbox") {
                        // CRF yok; 18→100, 32→40 arası kaliteye kabaca eşle
                        let q = (100 - (crf - 18) * 4).clamp(40, 100);
                        let mut fast = common.clone();
                        fast.extend([
                            "-c:v".into(),
                            "h264_videotoolbox".into(),
                            "-q:v".into(),
                            s(q),
                            "-allow_sw".into(),
                            "1".into(),
                        ]);
                        fast.extend(tail);
                        hw = Some(fast);
                    }
                    sw = soft;
                }
            }
        }
        crate::formats::Kind::Audio => {
            if !info.has_audio {
                return Err(AppError::Unsupported("dosyada ses akışı yok".into()));
            }
            sw.extend([
                "-map".into(),
                "0:a:0".into(),
                "-vn".into(),
                "-sn".into(),
                "-dn".into(),
            ]);
            if let Ok(sr) = opts.text("sample_rate").parse::<u32>() {
                sw.extend(["-ar".into(), s(sr)]);
            }
            if let Ok(ch) = opts.text("channels").parse::<u32>() {
                sw.extend(["-ac".into(), s(ch)]);
            }
            if opts.flag("normalize") {
                sw.extend(["-af".into(), "loudnorm=I=-16:TP=-1.5:LRA=11".into()]);
            }
            let br = opts.text("bitrate");
            match target.id {
                "mp3" => sw.extend([
                    "-c:a".into(),
                    "libmp3lame".into(),
                    "-b:a".into(),
                    format!("{br}k"),
                    "-f".into(),
                    "mp3".into(),
                ]),
                "m4a" => sw.extend([
                    "-c:a".into(),
                    "aac".into(),
                    "-b:a".into(),
                    format!("{br}k"),
                    "-movflags".into(),
                    "+faststart".into(),
                    "-f".into(),
                    "ipod".into(),
                ]),
                "opus" => sw.extend([
                    "-c:a".into(),
                    "libopus".into(),
                    "-b:a".into(),
                    format!("{br}k"),
                    "-f".into(),
                    "opus".into(),
                ]),
                "ogg" => {
                    let q = opts.int("vbr_quality");
                    if caps.has("libvorbis") {
                        sw.extend(["-c:a".into(), "libvorbis".into(), "-q:a".into(), s(q)]);
                    } else {
                        sw.extend([
                            "-c:a".into(),
                            "vorbis".into(),
                            "-strict".into(),
                            "-2".into(),
                            "-q:a".into(),
                            s(q),
                        ]);
                    }
                    sw.extend(["-f".into(), "ogg".into()]);
                }
                "flac" => sw.extend(["-c:a".into(), "flac".into(), "-f".into(), "flac".into()]),
                "wav" => sw.extend(["-c:a".into(), "pcm_s16le".into(), "-f".into(), "wav".into()]),
                other => return Err(AppError::Internal(format!("bilinmeyen ses hedefi {other}"))),
            }
        }
        crate::formats::Kind::Image => {
            return Err(AppError::Internal("görseller ffmpeg ile işlenmez".into()));
        }
    }

    let out = format!("file:{}", output.display());
    let mut primary = base.clone();
    let mut fallback = None;
    if let Some(mut hw_args) = hw {
        primary.append(&mut hw_args);
        let mut fb = base;
        fb.extend(sw);
        fb.push(out.clone());
        fallback = Some(fb);
    } else {
        primary.extend(sw);
    }
    primary.push(out);
    Ok(Plan {
        args: primary,
        fallback,
        expected_duration: expected,
    })
}

/// `-progress pipe:1` satırı.
#[derive(Debug, PartialEq)]
pub enum ProgressLine {
    OutTimeUs(i64),
    Continue,
    End,
    Other,
}

pub fn parse_progress_line(line: &str) -> ProgressLine {
    let line = line.trim();
    let Some((k, v)) = line.split_once('=') else {
        return ProgressLine::Other;
    };
    match k.trim() {
        // out_time_ms de aslında mikrosaniyedir (ffmpeg tuhaflığı); ikisini de kabul et
        "out_time_us" | "out_time_ms" => v
            .trim()
            .parse::<i64>()
            .map(ProgressLine::OutTimeUs)
            .unwrap_or(ProgressLine::Other),
        "progress" => match v.trim() {
            "end" => ProgressLine::End,
            _ => ProgressLine::Continue,
        },
        _ => ProgressLine::Other,
    }
}

/// Bir ffmpeg çalıştırması. `on_progress` 0–100 arası yüzde alır.
pub async fn run(
    ffmpeg_bin: &str,
    args: &[String],
    expected_duration: Option<f64>,
    cancel: CancellationToken,
    timeout: Duration,
    mut on_progress: impl FnMut(f32),
) -> AppResult<()> {
    tracing::debug!(args = ?args, "ffmpeg");
    let mut child = Command::new(ffmpeg_bin)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::Conversion(format!("ffmpeg başlatılamadı: {e}")))?;

    let mut stdin = child.stdin.take();
    let stdout = child.stdout.take().expect("stdout piped");
    let mut stderr = child.stderr.take().expect("stderr piped");

    // stderr'i ayrı görevde topla (son 4 KB yeter)
    let err_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf).await;
        let start = buf.len().saturating_sub(4096);
        String::from_utf8_lossy(&buf[start..]).trim().to_string()
    });

    let mut lines = BufReader::new(stdout).lines();
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);
    let mut last_pct = -1.0f32;
    let mut aborted: Option<AppError> = None;

    loop {
        tokio::select! {
            line = lines.next_line() => {
                match line {
                    Ok(Some(l)) => {
                        if let ProgressLine::OutTimeUs(us) = parse_progress_line(&l) {
                            if let Some(d) = expected_duration.filter(|d| *d > 0.0) {
                                let pct = ((us as f64 / 1_000_000.0) / d * 100.0).clamp(0.0, 99.5) as f32;
                                if pct - last_pct >= 0.5 {
                                    last_pct = pct;
                                    on_progress(pct);
                                }
                            }
                        }
                    }
                    _ => break, // stdout kapandı → süreç bitiyor
                }
            }
            _ = cancel.cancelled() => {
                aborted = Some(AppError::Conversion("iptal edildi".into()));
                break;
            }
            _ = &mut deadline => {
                aborted = Some(AppError::Conversion("zaman aşımı".into()));
                break;
            }
        }
    }

    if let Some(err) = aborted {
        // nazikçe: 'q', sonra 3 sn içinde ölmezse kill
        if let Some(mut si) = stdin.take() {
            let _ = si.write_all(b"q\n").await;
            let _ = si.flush().await;
        }
        if tokio::time::timeout(Duration::from_secs(3), child.wait())
            .await
            .is_err()
        {
            let _ = child.kill().await;
        }
        let _ = err_task.await;
        return Err(err);
    }

    drop(stdin);
    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Conversion(e.to_string()))?;
    let err_tail = err_task.await.unwrap_or_default();
    if !status.success() {
        let msg = if err_tail.is_empty() {
            format!("ffmpeg çıkış kodu {}", status.code().unwrap_or(-1))
        } else {
            err_tail
        };
        return Err(AppError::Conversion(msg));
    }
    on_progress(100.0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::{find, validate};
    use serde_json::json;
    use std::path::PathBuf;

    fn info(dur: f64, audio: bool) -> FfprobeInfo {
        FfprobeInfo {
            width: Some(1920),
            height: Some(1080),
            duration: Some(dur),
            codec: Some("h264".into()),
            has_video: true,
            has_audio: audio,
        }
    }
    fn caps(encs: &[&str]) -> Capabilities {
        Capabilities {
            version: Some("9.0".into()),
            encoders: encs.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn progress_lines() {
        assert_eq!(
            parse_progress_line("out_time_us=1500000"),
            ProgressLine::OutTimeUs(1_500_000)
        );
        assert_eq!(
            parse_progress_line(" out_time_ms=1500000"),
            ProgressLine::OutTimeUs(1_500_000)
        );
        assert_eq!(
            parse_progress_line("progress=continue"),
            ProgressLine::Continue
        );
        assert_eq!(parse_progress_line("progress=end"), ProgressLine::End);
        assert_eq!(parse_progress_line("frame=12"), ProgressLine::Other);
        assert_eq!(parse_progress_line("garbage"), ProgressLine::Other);
    }

    #[test]
    fn encoders_parse() {
        let txt = "Encoders:\n V....D libx264              libx264 H.264\n A....D aac                  AAC\n ------\n";
        let e = parse_encoders(txt);
        assert!(e.contains("libx264") && e.contains("aac"));
        assert!(!e.contains("Encoders:"));
    }

    #[test]
    fn mp4_plan_software() {
        let t = find("mp4").unwrap();
        let o = validate(
            &t,
            json!({"crf": 20, "resolution": "720", "trim_start": 2, "trim_end": 7}).as_object(),
        )
        .unwrap();
        let p = build_plan(
            &t,
            &o,
            &PathBuf::from("/in/a.mov"),
            &PathBuf::from("/out/a.mp4"),
            &info(60.0, true),
            &caps(&["libx264", "aac"]),
            false,
        )
        .unwrap();
        let a = p.args.join(" ");
        assert!(a.contains("-ss 2.000"), "{a}");
        assert!(a.contains("-t 5.000"), "{a}");
        assert!(a.contains("-c:v libx264 -preset medium -crf 20"), "{a}");
        assert!(a.contains("min(720,ih)"), "{a}");
        assert!(
            a.contains("file:/in/a.mov") && a.ends_with("file:/out/a.mp4"),
            "{a}"
        );
        assert!(p.fallback.is_none());
        assert_eq!(p.expected_duration, Some(5.0));
    }

    #[test]
    fn mp4_plan_hw_with_fallback() {
        let t = find("mp4").unwrap();
        let o = validate(&t, None).unwrap();
        let p = build_plan(
            &t,
            &o,
            &PathBuf::from("/in/a.mov"),
            &PathBuf::from("/out/a.mp4"),
            &info(10.0, false),
            &caps(&["libx264", "aac", "h264_videotoolbox"]),
            true,
        )
        .unwrap();
        assert!(p.args.join(" ").contains("h264_videotoolbox"));
        let fb = p.fallback.unwrap().join(" ");
        assert!(fb.contains("libx264"));
        assert!(fb.contains("-an"), "sessiz girişte -an bekleniyor: {fb}");
    }

    #[test]
    fn speed_affects_duration_and_filters() {
        let t = find("webm").unwrap();
        let o = validate(&t, json!({"speed": 2}).as_object()).unwrap();
        let p = build_plan(
            &t,
            &o,
            &PathBuf::from("/in/a.mp4"),
            &PathBuf::from("/out/a.webm"),
            &info(20.0, true),
            &caps(&["libvpx-vp9", "libopus"]),
            false,
        )
        .unwrap();
        let a = p.args.join(" ");
        assert!(a.contains("setpts=PTS/2"), "{a}");
        assert!(a.contains("atempo=2"), "{a}");
        assert_eq!(p.expected_duration, Some(10.0));
        assert_eq!(atempo_chain(0.25), vec!["atempo=0.5", "atempo=0.5"]);
        assert!(atempo_chain(1.0).is_empty());
    }

    #[test]
    fn gif_and_audio_plans() {
        let g = find("gif_anim").unwrap();
        let o = validate(&g, json!({"fps": 10, "width": 320}).as_object()).unwrap();
        let p = build_plan(
            &g,
            &o,
            &PathBuf::from("/in/a.mp4"),
            &PathBuf::from("/out/a.gif"),
            &info(5.0, true),
            &caps(&["gif"]),
            false,
        )
        .unwrap();
        let a = p.args.join(" ");
        assert!(
            a.contains("fps=10,scale=320:-2") && a.contains("palettegen") && a.contains("-an"),
            "{a}"
        );

        let m = find("mp3").unwrap();
        let o = validate(&m, json!({"bitrate": "320", "normalize": true}).as_object()).unwrap();
        let p = build_plan(
            &m,
            &o,
            &PathBuf::from("/in/a.mp4"),
            &PathBuf::from("/out/a.mp3"),
            &info(5.0, true),
            &caps(&["libmp3lame"]),
            false,
        )
        .unwrap();
        let a = p.args.join(" ");
        assert!(
            a.contains("-vn") && a.contains("-b:a 320k") && a.contains("loudnorm"),
            "{a}"
        );

        let no_audio = build_plan(
            &m,
            &o,
            &PathBuf::from("/in/a.mp4"),
            &PathBuf::from("/out/a.mp3"),
            &info(5.0, false),
            &caps(&["libmp3lame"]),
            false,
        );
        assert!(no_audio.is_err());
    }

    #[test]
    fn capability_gate() {
        let c = caps(&["libx264", "aac"]);
        assert!(c.supports(&find("mp4").unwrap()));
        assert!(!c.supports(&find("webm").unwrap()));
        assert!(!Capabilities::default().supports(&find("mp3").unwrap()));
    }
}
