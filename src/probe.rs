//! Giriş dosyasının türünü ve temel bilgisini çıkarır.
//! Tür tespiti uzantıyla değil sihirli baytlarla (`infer`), ayrıntı ffprobe / image ile.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::{
    error::{AppError, AppResult},
    formats::Kind,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputInfo {
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub kind: Kind,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// saniye
    pub duration: Option<f64>,
    pub codec: Option<String>,
    pub has_audio: Option<bool>,
}

/// Sihirli baytlardan MIME ve tür. Desteklenmeyen tür → 415.
pub fn sniff(head: &[u8]) -> AppResult<(String, Kind)> {
    let Some(t) = infer::get(head) else {
        return Err(AppError::Unsupported("dosya türü tanınmadı".into()));
    };
    let mime = t.mime_type().to_string();
    let kind = match t.matcher_type() {
        infer::MatcherType::Image => Kind::Image,
        infer::MatcherType::Video => Kind::Video,
        infer::MatcherType::Audio => Kind::Audio,
        _ => return Err(AppError::Unsupported(format!("desteklenmeyen tür: {mime}"))),
    };
    Ok((mime, kind))
}

#[derive(Deserialize)]
struct FfprobeOut {
    #[serde(default)]
    streams: Vec<FfStream>,
    format: Option<FfFormat>,
}
#[derive(Deserialize)]
struct FfStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    duration: Option<String>,
    #[serde(default)]
    disposition: Option<serde_json::Value>,
}
#[derive(Deserialize)]
struct FfFormat {
    duration: Option<String>,
}

/// ffprobe ile süre/çözünürlük/kodek. ffprobe yoksa hata döner (çağıran karar verir).
pub async fn ffprobe(ffprobe_bin: &str, path: &Path) -> AppResult<FfprobeInfo> {
    let out = Command::new(ffprobe_bin)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| AppError::Conversion(format!("ffprobe çalıştırılamadı: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Unsupported(format!(
            "ffprobe dosyayı okuyamadı: {}",
            err.trim()
        )));
    }
    let parsed: FfprobeOut = serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::Conversion(format!("ffprobe çıktısı okunamadı: {e}")))?;
    let video = parsed.streams.iter().find(|s| {
        s.codec_type.as_deref() == Some("video")
            // kapak resmi gibi ekli görseller video değildir
            && !s.disposition.as_ref().and_then(|d| d.get("attached_pic")).and_then(|v| v.as_i64()).is_some_and(|v| v == 1)
    });
    let audio = parsed
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"));
    let duration = parsed
        .format
        .as_ref()
        .and_then(|f| f.duration.as_deref())
        .or_else(|| video.and_then(|s| s.duration.as_deref()))
        .or_else(|| audio.and_then(|s| s.duration.as_deref()))
        .and_then(|d| d.parse::<f64>().ok())
        .filter(|d| d.is_finite() && *d > 0.0);
    Ok(FfprobeInfo {
        width: video.and_then(|s| s.width),
        height: video.and_then(|s| s.height),
        duration,
        codec: video.or(audio).and_then(|s| s.codec_name.clone()),
        has_video: video.is_some(),
        has_audio: audio.is_some(),
    })
}

#[derive(Debug, Clone, Default)]
pub struct FfprobeInfo {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub codec: Option<String>,
    pub has_video: bool,
    pub has_audio: bool,
}

/// Görsel boyutları (image crate, bloklayıcı iş parçacığında).
pub async fn image_dimensions(path: &Path) -> Option<(u32, u32)> {
    let p = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        image::ImageReader::open(&p)
            .ok()?
            .with_guessed_format()
            .ok()?
            .into_dimensions()
            .ok()
            .or_else(|| crate::engine::image::heic_dimensions(&p))
    })
    .await
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniff_png_and_reject_zip() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
        let (mime, kind) = sniff(&png).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(kind, Kind::Image);
        let zip = [b'P', b'K', 3, 4, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(matches!(sniff(&zip), Err(AppError::Unsupported(_))));
        assert!(sniff(b"hello world text").is_err());
    }
}
