//! Hedef format kataloğu — TEK doğruluk kaynağı.
//! Ön yüz bu kataloğu `/api/formats`'tan okur; seçenekler burada doğrulanır.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Image,
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Image,
    Ffmpeg,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum OptKind {
    Int {
        min: i64,
        max: i64,
        default: i64,
        step: i64,
    },
    Float {
        min: f64,
        max: f64,
        default: f64,
        step: f64,
    },
    Enum {
        values: Vec<&'static str>,
        default: &'static str,
    },
    Bool {
        default: bool,
    },
    Color {
        default: &'static str,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct OptionSpec {
    pub key: &'static str,
    pub label: &'static str,
    pub help: &'static str,
    pub advanced: bool,
    #[serde(flatten)]
    pub kind: OptKind,
}

#[derive(Debug, Clone, Serialize)]
pub struct Target {
    pub id: &'static str,
    pub label: &'static str,
    pub kind: Kind,
    pub ext: &'static str,
    pub mime: &'static str,
    pub engine: Engine,
    /// Hangi giriş türlerinden üretilebilir.
    pub accepts: Vec<Kind>,
    pub options: Vec<OptionSpec>,
}

// ---- seçenek yardımcıları -------------------------------------------------

const fn int(
    key: &'static str,
    label: &'static str,
    help: &'static str,
    min: i64,
    max: i64,
    default: i64,
    advanced: bool,
) -> OptionSpec {
    OptionSpec {
        key,
        label,
        help,
        advanced,
        kind: OptKind::Int {
            min,
            max,
            default,
            step: 1,
        },
    }
}
#[allow(clippy::too_many_arguments)]
const fn float(
    key: &'static str,
    label: &'static str,
    help: &'static str,
    min: f64,
    max: f64,
    default: f64,
    step: f64,
    advanced: bool,
) -> OptionSpec {
    OptionSpec {
        key,
        label,
        help,
        advanced,
        kind: OptKind::Float {
            min,
            max,
            default,
            step,
        },
    }
}
fn enm(
    key: &'static str,
    label: &'static str,
    help: &'static str,
    values: &[&'static str],
    default: &'static str,
    advanced: bool,
) -> OptionSpec {
    OptionSpec {
        key,
        label,
        help,
        advanced,
        kind: OptKind::Enum {
            values: values.to_vec(),
            default,
        },
    }
}
const fn boolean(
    key: &'static str,
    label: &'static str,
    help: &'static str,
    default: bool,
    advanced: bool,
) -> OptionSpec {
    OptionSpec {
        key,
        label,
        help,
        advanced,
        kind: OptKind::Bool { default },
    }
}
const fn color(
    key: &'static str,
    label: &'static str,
    help: &'static str,
    default: &'static str,
    advanced: bool,
) -> OptionSpec {
    OptionSpec {
        key,
        label,
        help,
        advanced,
        kind: OptKind::Color { default },
    }
}

fn image_common(needs_background: bool) -> Vec<OptionSpec> {
    let mut v = vec![
        int("width", "Genişlik (px)", "0 = orijinal", 0, 16384, 0, false),
        int(
            "height",
            "Yükseklik (px)",
            "0 = orijinal",
            0,
            16384,
            0,
            false,
        ),
        enm(
            "fit",
            "Sığdırma",
            "contain: oranı koru, cover: kırp, fill: ger",
            &["contain", "cover", "fill"],
            "contain",
            true,
        ),
        boolean(
            "upscale",
            "Büyütmeye izin ver",
            "Kapalıysa görsel yalnızca küçülür",
            false,
            true,
        ),
        boolean(
            "rotate_from_exif",
            "EXIF yönünü uygula",
            "Telefon fotoğraflarını doğru çevirir",
            true,
            true,
        ),
    ];
    if needs_background {
        v.push(color(
            "background",
            "Arka plan",
            "Saydam alanların altına dolgu",
            "#ffffff",
            true,
        ));
    }
    v
}

fn video_common() -> Vec<OptionSpec> {
    vec![
        enm(
            "resolution",
            "Çözünürlük",
            "Yükseklik; orijinal = değiştirme",
            &["original", "2160", "1440", "1080", "720", "480", "360"],
            "original",
            false,
        ),
        int("fps", "Kare hızı", "0 = orijinal", 0, 120, 0, true),
        float(
            "trim_start",
            "Başlangıç (sn)",
            "Kesim başı",
            0.0,
            86400.0,
            0.0,
            0.1,
            true,
        ),
        float(
            "trim_end",
            "Bitiş (sn)",
            "0 = sona kadar",
            0.0,
            86400.0,
            0.0,
            0.1,
            true,
        ),
        float(
            "speed",
            "Hız",
            "1 = normal; 2 = iki kat hızlı",
            0.25,
            4.0,
            1.0,
            0.25,
            true,
        ),
        boolean("mute", "Sesi kaldır", "", false, true),
    ]
}

fn audio_common() -> Vec<OptionSpec> {
    vec![
        enm(
            "sample_rate",
            "Örnekleme",
            "Hz; orijinal = değiştirme",
            &["original", "44100", "48000", "22050", "16000"],
            "original",
            true,
        ),
        enm(
            "channels",
            "Kanal",
            "",
            &["original", "1", "2"],
            "original",
            true,
        ),
        boolean(
            "normalize",
            "Ses seviyesini eşitle",
            "EBU R128 loudnorm",
            false,
            true,
        ),
        float(
            "trim_start",
            "Başlangıç (sn)",
            "",
            0.0,
            86400.0,
            0.0,
            0.1,
            true,
        ),
        float(
            "trim_end",
            "Bitiş (sn)",
            "0 = sona kadar",
            0.0,
            86400.0,
            0.0,
            0.1,
            true,
        ),
    ]
}

fn with(mut base: Vec<OptionSpec>, extra: Vec<OptionSpec>) -> Vec<OptionSpec> {
    let mut v = extra;
    v.append(&mut base);
    v
}

/// Tüm hedefler. Sıra ön yüzde gösterim sırasıdır.
pub fn catalog() -> Vec<Target> {
    use Kind::*;
    vec![
        // ---------------- görsel ----------------
        Target {
            id: "jpeg",
            label: "JPEG",
            kind: Image,
            ext: "jpg",
            mime: "image/jpeg",
            engine: Engine::Image,
            accepts: vec![Image],
            options: with(
                image_common(true),
                vec![int("quality", "Kalite", "1–100", 1, 100, 85, false)],
            ),
        },
        Target {
            id: "png",
            label: "PNG",
            kind: Image,
            ext: "png",
            mime: "image/png",
            engine: Engine::Image,
            accepts: vec![Image],
            options: with(
                image_common(false),
                vec![enm(
                    "compression",
                    "Sıkıştırma",
                    "",
                    &["fast", "default", "best"],
                    "default",
                    true,
                )],
            ),
        },
        Target {
            id: "webp",
            label: "WebP",
            kind: Image,
            ext: "webp",
            mime: "image/webp",
            engine: Engine::Image,
            accepts: vec![Image],
            options: with(
                image_common(false),
                vec![
                    int(
                        "quality",
                        "Kalite",
                        "1–100 (kayıpsızda yok sayılır)",
                        1,
                        100,
                        82,
                        false,
                    ),
                    boolean("lossless", "Kayıpsız", "", false, false),
                ],
            ),
        },
        Target {
            id: "avif",
            label: "AVIF",
            kind: Image,
            ext: "avif",
            mime: "image/avif",
            engine: Engine::Image,
            accepts: vec![Image],
            options: with(
                image_common(false),
                vec![
                    int("quality", "Kalite", "1–100", 1, 100, 70, false),
                    int("speed", "Hız", "1 yavaş/iyi … 10 hızlı", 1, 10, 6, true),
                ],
            ),
        },
        Target {
            id: "gif",
            label: "GIF",
            kind: Image,
            ext: "gif",
            mime: "image/gif",
            engine: Engine::Image,
            accepts: vec![Image],
            options: image_common(true),
        },
        Target {
            id: "bmp",
            label: "BMP",
            kind: Image,
            ext: "bmp",
            mime: "image/bmp",
            engine: Engine::Image,
            accepts: vec![Image],
            options: image_common(true),
        },
        Target {
            id: "tiff",
            label: "TIFF",
            kind: Image,
            ext: "tiff",
            mime: "image/tiff",
            engine: Engine::Image,
            accepts: vec![Image],
            options: image_common(false),
        },
        Target {
            id: "ico",
            label: "ICO",
            kind: Image,
            ext: "ico",
            mime: "image/x-icon",
            engine: Engine::Image,
            accepts: vec![Image],
            options: with(
                image_common(false),
                vec![int(
                    "size",
                    "Boyut",
                    "Kare kenar, en çok 256",
                    16,
                    256,
                    256,
                    false,
                )],
            ),
        },
        Target {
            id: "qoi",
            label: "QOI",
            kind: Image,
            ext: "qoi",
            mime: "image/qoi",
            engine: Engine::Image,
            accepts: vec![Image],
            options: image_common(false),
        },
        // ---------------- video ----------------
        Target {
            id: "mp4",
            label: "MP4 (H.264)",
            kind: Video,
            ext: "mp4",
            mime: "video/mp4",
            engine: Engine::Ffmpeg,
            accepts: vec![Video],
            options: with(
                video_common(),
                vec![
                    int(
                        "crf",
                        "Kalite (CRF)",
                        "18 çok iyi … 32 küçük",
                        18,
                        32,
                        23,
                        false,
                    ),
                    enm(
                        "preset",
                        "Kodlama hızı",
                        "",
                        &["ultrafast", "veryfast", "fast", "medium", "slow"],
                        "medium",
                        true,
                    ),
                    enm(
                        "audio_bitrate",
                        "Ses bit hızı",
                        "kbps",
                        &["96", "128", "192", "256", "320"],
                        "128",
                        true,
                    ),
                ],
            ),
        },
        Target {
            id: "webm",
            label: "WebM (VP9)",
            kind: Video,
            ext: "webm",
            mime: "video/webm",
            engine: Engine::Ffmpeg,
            accepts: vec![Video],
            options: with(
                video_common(),
                vec![
                    int(
                        "crf",
                        "Kalite (CRF)",
                        "VP9: 15 çok iyi … 45 küçük",
                        15,
                        45,
                        32,
                        false,
                    ),
                    enm(
                        "audio_bitrate",
                        "Ses bit hızı",
                        "kbps (Opus)",
                        &["64", "96", "128", "192"],
                        "128",
                        true,
                    ),
                ],
            ),
        },
        Target {
            id: "mkv",
            label: "MKV (H.264)",
            kind: Video,
            ext: "mkv",
            mime: "video/x-matroska",
            engine: Engine::Ffmpeg,
            accepts: vec![Video],
            options: with(
                video_common(),
                vec![
                    int("crf", "Kalite (CRF)", "", 18, 32, 23, false),
                    enm(
                        "preset",
                        "Kodlama hızı",
                        "",
                        &["ultrafast", "veryfast", "fast", "medium", "slow"],
                        "medium",
                        true,
                    ),
                    enm(
                        "audio_bitrate",
                        "Ses bit hızı",
                        "kbps",
                        &["96", "128", "192", "256", "320"],
                        "160",
                        true,
                    ),
                ],
            ),
        },
        Target {
            id: "mov",
            label: "MOV (H.264)",
            kind: Video,
            ext: "mov",
            mime: "video/quicktime",
            engine: Engine::Ffmpeg,
            accepts: vec![Video],
            options: with(
                video_common(),
                vec![
                    int("crf", "Kalite (CRF)", "", 18, 32, 23, false),
                    enm(
                        "preset",
                        "Kodlama hızı",
                        "",
                        &["ultrafast", "veryfast", "fast", "medium", "slow"],
                        "medium",
                        true,
                    ),
                    enm(
                        "audio_bitrate",
                        "Ses bit hızı",
                        "kbps",
                        &["96", "128", "192", "256", "320"],
                        "160",
                        true,
                    ),
                ],
            ),
        },
        Target {
            id: "gif_anim",
            label: "GIF (hareketli)",
            kind: Video,
            ext: "gif",
            mime: "image/gif",
            engine: Engine::Ffmpeg,
            accepts: vec![Video],
            options: vec![
                int("fps", "Kare hızı", "", 5, 30, 12, false),
                int("width", "Genişlik (px)", "", 64, 1280, 480, false),
                float(
                    "trim_start",
                    "Başlangıç (sn)",
                    "",
                    0.0,
                    86400.0,
                    0.0,
                    0.1,
                    true,
                ),
                float(
                    "trim_end",
                    "Bitiş (sn)",
                    "0 = sona kadar",
                    0.0,
                    86400.0,
                    0.0,
                    0.1,
                    true,
                ),
                float("speed", "Hız", "", 0.25, 4.0, 1.0, 0.25, true),
                enm(
                    "dither",
                    "Titreme (dither)",
                    "",
                    &["bayer", "floyd_steinberg", "none"],
                    "bayer",
                    true,
                ),
            ],
        },
        // ---------------- ses ----------------
        Target {
            id: "mp3",
            label: "MP3",
            kind: Audio,
            ext: "mp3",
            mime: "audio/mpeg",
            engine: Engine::Ffmpeg,
            accepts: vec![Video, Audio],
            options: with(
                audio_common(),
                vec![enm(
                    "bitrate",
                    "Bit hızı",
                    "kbps",
                    &["96", "128", "192", "256", "320"],
                    "192",
                    false,
                )],
            ),
        },
        Target {
            id: "m4a",
            label: "AAC (M4A)",
            kind: Audio,
            ext: "m4a",
            mime: "audio/mp4",
            engine: Engine::Ffmpeg,
            accepts: vec![Video, Audio],
            options: with(
                audio_common(),
                vec![enm(
                    "bitrate",
                    "Bit hızı",
                    "kbps",
                    &["96", "128", "192", "256"],
                    "160",
                    false,
                )],
            ),
        },
        Target {
            id: "opus",
            label: "Opus",
            kind: Audio,
            ext: "opus",
            mime: "audio/ogg",
            engine: Engine::Ffmpeg,
            accepts: vec![Video, Audio],
            options: with(
                audio_common(),
                vec![enm(
                    "bitrate",
                    "Bit hızı",
                    "kbps",
                    &["48", "64", "96", "128", "192"],
                    "96",
                    false,
                )],
            ),
        },
        Target {
            id: "ogg",
            label: "OGG (Vorbis)",
            kind: Audio,
            ext: "ogg",
            mime: "audio/ogg",
            engine: Engine::Ffmpeg,
            accepts: vec![Video, Audio],
            options: with(
                audio_common(),
                vec![int("vbr_quality", "Kalite", "0–10", 0, 10, 6, false)],
            ),
        },
        Target {
            id: "flac",
            label: "FLAC",
            kind: Audio,
            ext: "flac",
            mime: "audio/flac",
            engine: Engine::Ffmpeg,
            accepts: vec![Video, Audio],
            options: audio_common(),
        },
        Target {
            id: "wav",
            label: "WAV",
            kind: Audio,
            ext: "wav",
            mime: "audio/wav",
            engine: Engine::Ffmpeg,
            accepts: vec![Video, Audio],
            options: audio_common(),
        },
    ]
}

pub fn find(id: &str) -> Option<Target> {
    catalog().into_iter().find(|t| t.id == id)
}

/// Doğrulanmış seçenekler: anahtar → değer, varsayılanlar doldurulmuş.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Options(pub BTreeMap<String, Value>);

impl Options {
    pub fn int(&self, key: &str) -> i64 {
        self.0.get(key).and_then(Value::as_i64).unwrap_or(0)
    }
    pub fn float(&self, key: &str) -> f64 {
        self.0.get(key).and_then(Value::as_f64).unwrap_or(0.0)
    }
    pub fn text(&self, key: &str) -> &str {
        self.0.get(key).and_then(Value::as_str).unwrap_or("")
    }
    pub fn flag(&self, key: &str) -> bool {
        self.0.get(key).and_then(Value::as_bool).unwrap_or(false)
    }
}

fn parse_color(s: &str) -> Option<[u8; 3]> {
    let s = s.trim().trim_start_matches('#');
    if s.len() != 6 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let p = |i: usize| u8::from_str_radix(&s[i..i + 2], 16).ok();
    Some([p(0)?, p(2)?, p(4)?])
}

pub fn color_rgb(s: &str) -> [u8; 3] {
    parse_color(s).unwrap_or([255, 255, 255])
}

/// Kullanıcı seçeneklerini katalogdaki şemaya göre doğrular.
/// Bilinmeyen anahtar → hata; sınır dışı değer → hata; eksik → varsayılan.
pub fn validate(target: &Target, raw: Option<&Map<String, Value>>) -> Result<Options, AppError> {
    let empty = Map::new();
    let raw = raw.unwrap_or(&empty);
    for k in raw.keys() {
        if !target.options.iter().any(|o| o.key == k) {
            return Err(AppError::BadRequest(format!("bilinmeyen seçenek: {k}")));
        }
    }
    let mut out = BTreeMap::new();
    for spec in &target.options {
        let given = raw.get(spec.key);
        let val = match (&spec.kind, given) {
            (OptKind::Int { default, .. }, None) => Value::from(*default),
            (OptKind::Int { min, max, .. }, Some(v)) => {
                let n = v
                    .as_i64()
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                    .ok_or_else(|| {
                        AppError::BadRequest(format!("{}: tam sayı bekleniyor", spec.key))
                    })?;
                if n < *min || n > *max {
                    return Err(AppError::BadRequest(format!(
                        "{}: {min}–{max} aralığında olmalı",
                        spec.key
                    )));
                }
                Value::from(n)
            }
            (OptKind::Float { default, .. }, None) => Value::from(*default),
            (OptKind::Float { min, max, .. }, Some(v)) => {
                let n = v
                    .as_f64()
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                    .ok_or_else(|| {
                        AppError::BadRequest(format!("{}: sayı bekleniyor", spec.key))
                    })?;
                if !n.is_finite() || n < *min || n > *max {
                    return Err(AppError::BadRequest(format!(
                        "{}: {min}–{max} aralığında olmalı",
                        spec.key
                    )));
                }
                Value::from(n)
            }
            (OptKind::Enum { default, .. }, None) => Value::from(*default),
            (OptKind::Enum { values, .. }, Some(v)) => {
                let s = v
                    .as_str()
                    .map(str::to_string)
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
                    .ok_or_else(|| {
                        AppError::BadRequest(format!("{}: metin bekleniyor", spec.key))
                    })?;
                if !values.contains(&s.as_str()) {
                    return Err(AppError::BadRequest(format!(
                        "{}: geçerli değerler {}",
                        spec.key,
                        values.join(", ")
                    )));
                }
                Value::from(s)
            }
            (OptKind::Bool { default }, None) => Value::from(*default),
            (OptKind::Bool { .. }, Some(v)) => {
                let b = v
                    .as_bool()
                    .or_else(|| v.as_str().map(|s| matches!(s, "true" | "1" | "on")))
                    .ok_or_else(|| {
                        AppError::BadRequest(format!("{}: doğru/yanlış bekleniyor", spec.key))
                    })?;
                Value::from(b)
            }
            (OptKind::Color { default }, None) => Value::from(*default),
            (OptKind::Color { .. }, Some(v)) => {
                let s = v.as_str().ok_or_else(|| {
                    AppError::BadRequest(format!("{}: renk bekleniyor", spec.key))
                })?;
                parse_color(s).ok_or_else(|| {
                    AppError::BadRequest(format!("{}: #rrggbb biçiminde olmalı", spec.key))
                })?;
                Value::from(format!(
                    "#{}",
                    s.trim().trim_start_matches('#').to_lowercase()
                ))
            }
        };
        out.insert(spec.key.to_string(), val);
    }
    Ok(Options(out))
}

/// Giriş türü bu hedefe dönüştürülebilir mi?
pub fn accepts(target: &Target, input: Kind) -> bool {
    target.accepts.contains(&input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ids_unique_and_nonempty() {
        let c = catalog();
        let mut ids: Vec<_> = c.iter().map(|t| t.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), c.len());
        assert!(c.len() >= 15);
    }

    #[test]
    fn option_keys_unique_per_target() {
        for t in catalog() {
            let mut keys: Vec<_> = t.options.iter().map(|o| o.key).collect();
            let n = keys.len();
            keys.sort_unstable();
            keys.dedup();
            assert_eq!(n, keys.len(), "{} içinde tekrar eden seçenek", t.id);
        }
    }

    #[test]
    fn defaults_fill_in() {
        let t = find("jpeg").unwrap();
        let o = validate(&t, None).unwrap();
        assert_eq!(o.int("quality"), 85);
        assert_eq!(o.text("fit"), "contain");
        assert!(o.flag("rotate_from_exif"));
        assert_eq!(o.text("background"), "#ffffff");
    }

    #[test]
    fn rejects_out_of_range_and_unknown() {
        let t = find("mp4").unwrap();
        let bad = json!({"crf": 99});
        assert!(validate(&t, bad.as_object()).is_err());
        let unknown = json!({"nope": 1});
        assert!(validate(&t, unknown.as_object()).is_err());
        let bad_enum = json!({"preset": "placebo"});
        assert!(validate(&t, bad_enum.as_object()).is_err());
        let ok = json!({"crf": "20", "preset": "fast", "mute": "true"});
        let o = validate(&t, ok.as_object()).unwrap();
        assert_eq!(o.int("crf"), 20);
        assert!(o.flag("mute"));
    }

    #[test]
    fn color_parsing() {
        assert_eq!(color_rgb("#FF0000"), [255, 0, 0]);
        assert_eq!(color_rgb("00ff00"), [0, 255, 0]);
        assert_eq!(color_rgb("zzz"), [255, 255, 255]);
        let t = find("jpeg").unwrap();
        assert!(validate(&t, json!({"background": "red"}).as_object()).is_err());
    }

    #[test]
    fn accepts_matrix() {
        assert!(accepts(&find("mp3").unwrap(), Kind::Video));
        assert!(accepts(&find("mp3").unwrap(), Kind::Audio));
        assert!(!accepts(&find("mp3").unwrap(), Kind::Image));
        assert!(!accepts(&find("webp").unwrap(), Kind::Video));
    }
}
