//! Durağan görsel dönüşümü — saf Rust (`image` + `webp` + `ravif`), bloklayıcı iş parçacığında.
//! Meta veri (EXIF vb.) hiçbir hedefe taşınmaz; yön bilgisi istenirse piksellere uygulanır.

use std::{
    fs::File,
    io::{BufWriter, Cursor, Write},
    path::Path,
};

use image::{
    DynamicImage, GenericImageView, ImageDecoder, ImageEncoder, ImageFormat, Rgb, RgbImage,
    codecs::{
        avif::AvifEncoder,
        jpeg::JpegEncoder,
        png::{CompressionType, FilterType as PngFilter, PngEncoder},
    },
    imageops::FilterType,
};

use crate::{
    error::{AppError, AppResult},
    formats::{Options, Target, color_rgb},
};

fn conv(e: image::ImageError) -> AppError {
    AppError::Conversion(format!("görsel işlenemedi: {e}"))
}

/// HEIC/HEIF okuma (yalnız `heic` özelliğiyle derlenir).
#[cfg(feature = "heic")]
fn decode_heic(path: &Path) -> AppResult<DynamicImage> {
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};
    let lib = LibHeif::new();
    let ctx = HeifContext::read_from_file(
        path.to_str()
            .ok_or_else(|| AppError::Internal("yol".into()))?,
    )
    .map_err(|e| AppError::Conversion(format!("HEIC okunamadı: {e}")))?;
    let handle = ctx
        .primary_image_handle()
        .map_err(|e| AppError::Conversion(format!("HEIC: {e}")))?;
    let img = lib
        .decode(&handle, ColorSpace::Rgb(RgbChroma::Rgba), None)
        .map_err(|e| AppError::Conversion(format!("HEIC çözülemedi: {e}")))?;
    let plane = img
        .planes()
        .interleaved
        .ok_or_else(|| AppError::Conversion("HEIC düzlemi yok".into()))?;
    let (w, h, stride) = (plane.width, plane.height, plane.stride);
    let mut buf = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h as usize {
        let row = &plane.data[y * stride..y * stride + (w as usize) * 4];
        buf.extend_from_slice(row);
    }
    let rgba = image::RgbaImage::from_raw(w, h, buf)
        .ok_or_else(|| AppError::Conversion("HEIC tampon".into()))?;
    Ok(DynamicImage::ImageRgba8(rgba))
}

/// HEIC/HEIF boyutu (kodu çözmeden, yalnız `heic` özelliğiyle).
#[cfg(feature = "heic")]
pub fn heic_dimensions(path: &Path) -> Option<(u32, u32)> {
    use libheif_rs::HeifContext;
    let ctx = HeifContext::read_from_file(path.to_str()?).ok()?;
    let handle = ctx.primary_image_handle().ok()?;
    Some((handle.width(), handle.height()))
}

#[cfg(not(feature = "heic"))]
pub fn heic_dimensions(_path: &Path) -> Option<(u32, u32)> {
    None
}

#[cfg(not(feature = "heic"))]
fn decode_heic(_path: &Path) -> AppResult<DynamicImage> {
    Err(AppError::Unsupported(
        "HEIC/HEIF desteği bu derlemede yok (cargo --features heic + libheif)".into(),
    ))
}

pub fn heic_supported() -> bool {
    cfg!(feature = "heic")
}

fn decode(path: &Path, mime: &str, rotate: bool) -> AppResult<DynamicImage> {
    if matches!(
        mime,
        "image/heic" | "image/heif" | "image/heic-sequence" | "image/heif-sequence"
    ) {
        return decode_heic(path);
    }
    let reader = image::ImageReader::open(path)?.with_guessed_format()?;
    let mut decoder = reader.into_decoder().map_err(conv)?;
    let orientation = if rotate {
        decoder.orientation().ok()
    } else {
        None
    };
    let mut img = DynamicImage::from_decoder(decoder).map_err(conv)?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    Ok(img)
}

/// Hedef boyutları hesapla; (0,0) → değişiklik yok.
fn target_size(orig: (u32, u32), w: i64, h: i64, upscale: bool) -> Option<(u32, u32)> {
    let (ow, oh) = orig;
    let (mut w, mut h) = (w.max(0) as u32, h.max(0) as u32);
    if w == 0 && h == 0 {
        return None;
    }
    if w == 0 {
        w = ((ow as f64) * (h as f64) / (oh as f64)).round().max(1.0) as u32;
    }
    if h == 0 {
        h = ((oh as f64) * (w as f64) / (ow as f64)).round().max(1.0) as u32;
    }
    if !upscale && (w > ow || h > oh) {
        // orana sadık kalarak orijinalin içine sığdır
        let scale = (ow as f64 / w as f64).min(oh as f64 / h as f64).min(1.0);
        w = ((w as f64) * scale).round().max(1.0) as u32;
        h = ((h as f64) * scale).round().max(1.0) as u32;
    }
    if (w, h) == (ow, oh) {
        None
    } else {
        Some((w, h))
    }
}

fn resize(img: DynamicImage, opts: &Options) -> DynamicImage {
    let Some((w, h)) = target_size(
        img.dimensions(),
        opts.int("width"),
        opts.int("height"),
        opts.flag("upscale"),
    ) else {
        return img;
    };
    match opts.text("fit") {
        "cover" => img.resize_to_fill(w, h, FilterType::Lanczos3),
        "fill" => img.resize_exact(w, h, FilterType::Lanczos3),
        _ => img.resize(w, h, FilterType::Lanczos3),
    }
}

/// Saydamlığı verilen renk üstüne düzleştir (jpeg/bmp/gif için).
fn flatten(img: &DynamicImage, bg: [u8; 3]) -> RgbImage {
    if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        let mut out = RgbImage::new(rgba.width(), rgba.height());
        for (x, y, p) in rgba.enumerate_pixels() {
            let a = p[3] as u32;
            let mix = |c: u8, b: u8| ((c as u32 * a + b as u32 * (255 - a)) / 255) as u8;
            out.put_pixel(
                x,
                y,
                Rgb([mix(p[0], bg[0]), mix(p[1], bg[1]), mix(p[2], bg[2])]),
            );
        }
        out
    } else {
        img.to_rgb8()
    }
}

/// Giriş → çıkış. `progress` 0–100.
pub fn convert(
    input: &Path,
    input_mime: &str,
    output: &Path,
    target: &Target,
    opts: &Options,
    mut progress: impl FnMut(f32),
) -> AppResult<()> {
    progress(5.0);
    let img = decode(input, input_mime, opts.flag("rotate_from_exif"))?;
    progress(40.0);
    let mut img = resize(img, opts);
    progress(55.0);

    let file = File::create(output)?;
    let mut w = BufWriter::new(file);
    let bg = color_rgb(opts.text("background"));

    match target.id {
        "jpeg" => {
            let rgb = flatten(&img, bg);
            let enc =
                JpegEncoder::new_with_quality(&mut w, opts.int("quality").clamp(1, 100) as u8);
            enc.write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(conv)?;
        }
        "png" => {
            let comp = match opts.text("compression") {
                "fast" => CompressionType::Fast,
                "best" => CompressionType::Best,
                _ => CompressionType::Default,
            };
            let enc = PngEncoder::new_with_quality(&mut w, comp, PngFilter::Adaptive);
            // 16-bit ve gri tonları koru
            img.write_with_encoder(enc).map_err(conv)?;
        }
        "webp" => {
            let rgba = img.to_rgba8();
            let enc = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
            let mem = if opts.flag("lossless") {
                enc.encode_lossless()
            } else {
                enc.encode(opts.int("quality").clamp(1, 100) as f32)
            };
            w.write_all(&mem)?;
        }
        "avif" => {
            let rgba = img.to_rgba8();
            let enc = AvifEncoder::new_with_speed_quality(
                &mut w,
                opts.int("speed").clamp(1, 10) as u8,
                opts.int("quality").clamp(1, 100) as u8,
            );
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(conv)?;
        }
        "gif" | "bmp" => {
            let rgb = flatten(&img, bg);
            let fmt = if target.id == "gif" {
                ImageFormat::Gif
            } else {
                ImageFormat::Bmp
            };
            let mut cur = Cursor::new(Vec::new());
            DynamicImage::ImageRgb8(rgb)
                .write_to(&mut cur, fmt)
                .map_err(conv)?;
            w.write_all(&cur.into_inner())?;
        }
        "tiff" => {
            img.write_to(&mut CursorWriter(&mut w), ImageFormat::Tiff)
                .map_err(conv)?;
        }
        "qoi" => {
            // QOI yalnız 8-bit RGB/RGBA
            if !matches!(
                img,
                DynamicImage::ImageRgb8(_) | DynamicImage::ImageRgba8(_)
            ) {
                img = DynamicImage::ImageRgba8(img.to_rgba8());
            }
            img.write_to(&mut CursorWriter(&mut w), ImageFormat::Qoi)
                .map_err(conv)?;
        }
        "ico" => {
            let size = opts.int("size").clamp(16, 256) as u32;
            let small = img.resize(size, size, FilterType::Lanczos3).to_rgba8();
            DynamicImage::ImageRgba8(small)
                .write_to(&mut CursorWriter(&mut w), ImageFormat::Ico)
                .map_err(conv)?;
        }
        other => {
            return Err(AppError::Internal(format!(
                "bilinmeyen görsel hedefi {other}"
            )));
        }
    }
    w.flush()?;
    progress(100.0);
    Ok(())
}

/// `write_to` Seek ister; BufWriter<File> Seek uygular ama borçla sarmak için küçük adaptör.
struct CursorWriter<'a>(&'a mut BufWriter<File>);
impl Write for CursorWriter<'_> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.0.flush()
    }
}
impl std::io::Seek for CursorWriter<'_> {
    fn seek(&mut self, pos: std::io::SeekFrom) -> std::io::Result<u64> {
        std::io::Seek::seek(self.0, pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::{find, validate};
    use image::RgbaImage;
    use serde_json::json;

    fn sample(path: &Path) {
        let mut img = RgbaImage::new(64, 32);
        for (x, y, p) in img.enumerate_pixels_mut() {
            *p = image::Rgba([x as u8 * 4, y as u8 * 8, 128, if x < 32 { 255 } else { 0 }]);
        }
        img.save(path).unwrap();
    }

    #[test]
    fn size_math() {
        assert_eq!(target_size((1000, 500), 0, 0, false), None);
        assert_eq!(target_size((1000, 500), 500, 0, false), Some((500, 250)));
        assert_eq!(target_size((1000, 500), 0, 100, false), Some((200, 100)));
        assert_eq!(
            target_size((1000, 500), 2000, 0, false),
            None,
            "büyütme kapalıyken orijinal kalır"
        );
        assert_eq!(target_size((1000, 500), 2000, 0, true), Some((2000, 1000)));
        assert_eq!(target_size((1000, 500), 2000, 100, false), Some((1000, 50)));
    }

    #[test]
    fn convert_png_to_all_image_targets() {
        let dir = tempfile::tempdir().unwrap();
        let inp = dir.path().join("in.png");
        sample(&inp);
        for id in [
            "jpeg", "png", "webp", "avif", "gif", "bmp", "tiff", "ico", "qoi",
        ] {
            let t = find(id).unwrap();
            let raw = json!({"width": 32});
            let o = validate(&t, raw.as_object()).unwrap();
            let out = dir.path().join(format!("out.{}", t.ext));
            let mut last = 0.0;
            convert(&inp, "image/png", &out, &t, &o, |p| last = p)
                .unwrap_or_else(|e| panic!("{id}: {e}"));
            assert_eq!(last, 100.0);
            let meta = std::fs::metadata(&out).unwrap();
            assert!(meta.len() > 0, "{id} boş çıktı");
            // kendi çözücümüzle geri okunabilir mi? (avif decode yok, ico 32px)
            if id != "avif" && id != "ico" {
                let back = image::open(&out).unwrap_or_else(|e| panic!("{id} geri okunamadı: {e}"));
                assert_eq!(back.width(), 32, "{id}");
            }
        }
    }

    #[test]
    fn webp_lossless_roundtrip_keeps_alpha() {
        let dir = tempfile::tempdir().unwrap();
        let inp = dir.path().join("in.png");
        sample(&inp);
        let t = find("webp").unwrap();
        let o = validate(&t, json!({"lossless": true}).as_object()).unwrap();
        let out = dir.path().join("o.webp");
        convert(&inp, "image/png", &out, &t, &o, |_| {}).unwrap();
        let back = image::open(&out).unwrap().to_rgba8();
        assert_eq!(back.get_pixel(40, 0)[3], 0, "saydamlık korunmalı");
        assert_eq!(back.get_pixel(0, 0)[3], 255);
    }

    #[test]
    fn jpeg_flattens_on_background() {
        let dir = tempfile::tempdir().unwrap();
        let inp = dir.path().join("in.png");
        sample(&inp);
        let t = find("jpeg").unwrap();
        let o = validate(
            &t,
            json!({"background": "#ff0000", "quality": 100}).as_object(),
        )
        .unwrap();
        let out = dir.path().join("o.jpg");
        convert(&inp, "image/png", &out, &t, &o, |_| {}).unwrap();
        let back = image::open(&out).unwrap().to_rgb8();
        let p = back.get_pixel(60, 10);
        assert!(
            p[0] > 200 && p[1] < 60 && p[2] < 60,
            "saydam bölge kırmızı olmalı: {p:?}"
        );
    }

    #[test]
    fn heic_without_feature_is_clear_error() {
        if !heic_supported() {
            let dir = tempfile::tempdir().unwrap();
            let t = find("png").unwrap();
            let o = validate(&t, None).unwrap();
            let r = convert(
                &dir.path().join("x.heic"),
                "image/heic",
                &dir.path().join("o.png"),
                &t,
                &o,
                |_| {},
            );
            assert!(matches!(r, Err(AppError::Unsupported(_))));
        }
    }
}
