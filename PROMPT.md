---
type: research
title: "Dönüştür — Rust medya dönüştürücü için Claude Code promptu (nihai)"
tags: [rust, axum, ffmpeg, medya, web, docker, prompt]
created: 2026-10-31
project: "[[donustur]]"
related_concepts: ["[[claude-code]]", "[[rust]]", "[[ffmpeg]]"]
---

# Dönüştür — Claude Code promptu (nihai sürüm)

> Kullanıcının ham isteği: "Rust ile, web'den görsel/video yükleyip istediğim formata çeviren
> bir sistem. Mac'te ya da sunucuda, Docker olabilir. Web tarafı serbest. Her şey sana kalmış."
> Aşağıdaki prompt bu isteğin araştırılmış, kararları verilmiş, tek seferde bitmiş ürün
> çıkaracak hâlidir. Araştırma gerekçeleri en altta.

---

## PROMPT

```
Sen kıdemli bir Rust + web mühendisisin. Aşağıdaki ürünü sıfırdan, bitmiş ve çalışır hâlde
teslim et. Soru sorma; kararlar verildi. Bir şey belirsizse en sade, en güvenli seçeneği uygula ve
README'de "Varsayımlar" başlığına yaz.

# ÜRÜN: Dönüştür — kendi sunucunda çalışan medya dönüştürücü

Tarayıcıdan görsel, video veya ses dosyası yüklenir; hedef format ve birkaç seçenek seçilir;
dosya sunucuda dönüştürülür; ilerleme canlı gösterilir; sonuç indirilir. Hesap yok, veritabanı
yok, dış servis yok. Tek ikili dosya (binary) olarak da, Docker imajı olarak da çalışır.

# MİMARİ (değiştirme)

- Dil/çatı: Rust 2024 edition, axum 0.8, tokio. Tek crate, `src/` altında modüller.
- Görsel motoru: `image` crate (decode: png/jpeg/gif/bmp/tiff/ico/tga/qoi/webp/avif(dav1d yok →
  sadece encode); encode: png/jpeg/gif/bmp/tiff/ico/tga/qoi/avif via `ravif`). Kayıplı WebP için
  `webp` crate (libwebp gömülü, sistem bağımlılığı yok). HEIC/HEIF okuma: `libheif-rs` ile opsiyonel
  cargo feature `heic` (sistem libheif ister; varsayılan kapalı, Dockerfile'da açık).
- Video/ses motoru: sistemdeki `ffmpeg` + `ffprobe` ikilileri, `tokio::process` ile alt süreç.
  FFI bağlama (ffmpeg-next) KULLANMA. İlerleme: `-progress pipe:1 -nostats` çıktısını satır satır
  oku, `out_time_us` / ffprobe süresi = yüzde. `progress=end` + çıkış kodu 0 = bitti.
  İptal: önce stdin'e `q`, 3 sn sonra kill.
- İş kuyruğu: süreç içi. `tokio::sync::Semaphore` ile eşzamanlılık = CPU çekirdeği / 2 (en az 1,
  `DONUSTUR_WORKERS` ile ezilebilir). İş durumu `DashMap<JobId, Job>`; ilerleme
  `tokio::sync::watch` kanalıyla SSE'ye akar. Yeniden başlatmada işler kaybolur; bu kabul.
- Depolama: `DONUSTUR_DATA_DIR` (vars. `./data`) altında `uploads/<job>/` ve `outputs/<job>/`.
  TTL temizleyici: `DONUSTUR_TTL_MIN` (vars. 60) dakikadan eski işleri ve dosyaları siler.
- Ön yüz: Vite + React 19 + TypeScript + Tailwind v4. `cargo build --release` ön yüzü
  `rust-embed` ile ikiliye gömer (`build.rs` değil; `web/dist` önceden derlenir, Makefile/just ile).
  Geliştirmede Vite dev server `/api`'yi 8080'e proxy'ler.
- Günlük: `tracing` + `tracing-subscriber` (env filter). Hatalar `thiserror` ile tipli, API'de
  `{ "error": { "code", "message" } }`.

# API (JSON, `/api` öneki)

GET  /api/health                → { ok, version, ffmpeg: "9.0.2"|null, heic: bool }
GET  /api/formats               → yetenek kataloğu: her hedef format için { id, label, kind:
                                   image|video|audio, ext, mime, options: [...] , available: bool }
                                   (ffmpeg yoksa video/ses `available:false`)
POST /api/jobs  (multipart)     → alanlar: `file` (zorunlu, akışla diske yaz, RAM'e alma),
                                   `target` (format id), `options` (JSON string, opsiyonel).
                                   Dönen: { id, status:"queued" }. Boyut sınırı
                                   `DONUSTUR_MAX_UPLOAD_MB` (vars. 2048). Tür tespiti uzantıyla
                                   değil `infer` ile sihirli bayttan; uyuşmazsa 415.
GET  /api/jobs/:id              → { id, status: queued|running|done|failed|cancelled, progress:0-100,
                                   input:{name,size,mime,width,height,duration}, output:{name,size,
                                   mime}|null, error:string|null, created_at, finished_at }
GET  /api/jobs/:id/events (SSE) → her ilerleme değişiminde `job` olayı (yukarıdaki nesne), bitince
                                   kapanır. 15 sn'de bir `: ping`.
GET  /api/jobs/:id/download     → Content-Disposition attachment, doğru MIME, Range desteği.
DELETE /api/jobs/:id            → çalışıyorsa iptal, dosyaları sil.

# DÖNÜŞÜM SEÇENEKLERİ

Görsel hedefleri: jpeg (quality 1-100, vars. 85), png (compression fast|default|best), webp
(quality 1-100 | lossless), avif (quality 1-100, speed 1-10), gif, bmp, tiff, ico (≤256px), qoi.
Ortak: resize { width?, height?, fit: contain|cover|fill, upscale:false }, strip_metadata (vars. true),
rotate_from_exif (vars. true), background (alfa düzleştirme için renk, jpeg/bmp'de şart).

Video hedefleri: mp4 (h264: crf 18-32 vars. 23, preset; ses aac 128-320k), webm (vp9 crf +
opus), mkv (h264 kopya/transcode), mov (h264), gif (fps 5-30, width, palette iki geçiş),
mp3/aac/opus/flac/wav (ses çıkar). Ortak: resolution (orijinal|2160|1440|1080|720|480|360),
fps, trim { start, end } saniye, mute, speed (0.25-4). Donanım hızlandırma: macOS'ta
`h264_videotoolbox` varsa `DONUSTUR_HWACCEL=auto` ile kullan, yoksa libx264.

Ses hedefleri: mp3 (bitrate|vbr), aac/m4a, opus, flac, wav, ogg. Seçenek: bitrate, sample_rate,
channels, normalize (loudnorm), trim.

Hedef kataloğu TEK yerde tanımlı (`src/formats.rs`); ön yüz bunu `/api/formats`'tan okur,
kopyalamaz.

# ÖN YÜZ (tek sayfa)

1. Sürükle-bırak alanı + dosya seçici; çoklu dosya (her dosya ayrı iş). Yüklenirken yüzde.
2. Dosya kartı: önizleme (görsel/video küçük resmi tarayıcıda), tür, boyut, çözünürlük/süre.
3. Hedef format seçimi: dosya türüne göre filtrelenir; seçenekler katalogdan türetilen basit
   form (slider/select/toggle). "Gelişmiş" katlanır bölüm.
4. Dönüştür → ilerleme çubuğu (SSE), hız/kalan süre tahmini, iptal.
5. Bitti → indir düğmesi, çıktı boyutu ve % kazanç, "yeni dönüşüm".
6. Sunucu durumu çubuğu: ffmpeg var/yok, kuyruk uzunluğu, aktif iş.
7. Türkçe arayüz, İngilizce ikinci dil (basit sözlük nesnesi). Koyu/açık tema sisteme uyar.
8. Erişilebilirlik: klavye ile tüm akış, aria etiketleri, odak halkası. Mobilde çalışır.
Tasarım: sakin, araç gibi; marka rengi tek (nane yeşili), sistem fontu. Süsleme yok.

# GÜVENLİK

- Yolu kullanıcı girdisinden türetme: job id = UUID v4, dosya adı sunucuda üretilir; indirmede
  orijinal ad yalnızca Content-Disposition'da, temizlenmiş.
- ffmpeg argümanları liste olarak verilir, kabuk yok; kullanıcı seçenekleri beyaz listeden ve
  sayısal aralıktan geçer. Giriş dosyasının önüne `file:` öneki; `-nostdin` dışında stdin yalnız
  iptal için.
- Zaman sınırı: iş `DONUSTUR_JOB_TIMEOUT_MIN` (vars. 30) aşarsa iptal.
- Zip/arşiv kabul etme; yalnız tespit edilen görsel/video/ses MIME'ları.
- İsteğe bağlı tek şifre: `DONUSTUR_PASSWORD` tanımlıysa tüm `/api/*` için `Authorization: Bearer`
  veya `?token=` ister; ön yüz şifre ekranı gösterir.
- CORS kapalı (aynı kaynak). Güvenlik başlıkları: nosniff, frame-ancestors none.

# DAĞITIM

- `Dockerfile`: 3 aşama (node:22-alpine ön yüz → rust:1-bookworm derleme → debian:bookworm-slim
  çalışma, `apt-get install ffmpeg libheif1`, root olmayan kullanıcı, `/data` volume,
  HEALTHCHECK /api/health). `compose.yaml`: port 8080, volume, env.
- Yerel macOS: `brew install ffmpeg` + `cargo run --release`; `launchd` plist örneği
  `deploy/` altında.
- `Makefile` veya `justfile`: `web`, `build`, `run`, `dev`, `test`, `docker`, `lint`.
- `.github/workflows/ci.yml`: fmt, clippy -D warnings, test, ön yüz tsc+build, docker build.

# KALİTE

- Rust testleri: format kataloğu (her hedef için argüman üretimi), ffmpeg progress ayrıştırıcı,
  seçenek doğrulama (sınır dışı değer reddi), TTL temizleyici, API entegrasyon testi (axum
  `oneshot` + küçük PNG + ffmpeg varsa 1 sn test videosu `ffmpeg -f lavfi` ile üretilerek).
- `cargo clippy -- -D warnings` ve `cargo fmt --check` temiz.
- Ön yüz: `tsc --noEmit` temiz, bileşenler küçük, durum tek `useReducer`.
- README (Türkçe): ne, neden bu mimari, kurulum (Mac/Docker/Linux), env değişkenleri tablosu,
  API özeti, format matrisi, bilinen sınırlar, Varsayımlar.

# TESLİM KRİTERİ

`make build && ./target/release/donustur` çalışır; tarayıcıda PNG→WebP, JPG→AVIF, MP4→WebM,
MP4→GIF, MP4→MP3 akışları uçtan uca çalışır ve ilerleme görünür. `docker compose up` aynı sonucu
verir. Testler yeşil. Çalıştırmadan "bitti" deme.
```

---

## Araştırma gerekçeleri (promptun neden böyle olduğu)

| Karar | Gerekçe |
|---|---|
| ffmpeg'i **alt süreç** olarak çağır, FFI (`ffmpeg-next`) kullanma | 2026 Rust medya ekosistemi anketi ve Rust forumu: alt süreç en güvenilir yol; FFI derleme/sürüm kırılganlığı taşır. İlerleme `-progress pipe:1` ile standart. |
| Görseller için `image` + `webp` + `ravif`, ffmpeg değil | Bu Mac'teki Homebrew ffmpeg 9.0.2'de **libwebp encoder yok**, HEIF demuxer yok; Debian paketinde de değişken. Saf Rust yol taşınabilir ve Docker'da bağımlılık istemez. |
| HEIC opsiyonel feature | `libheif` LGPL + sistem kütüphanesi; iPhone fotoğrafları için değerli ama zorunlu kılmak derlemeyi kırılganlaştırır. |
| Süreç içi kuyruk, Redis/DB yok | Tek kullanıcı/ev sunucusu ölçeği; dış servis = bakım yükü. Yeniden başlatmada iş kaybı kabul edilebilir. |
| Tek ikili + `rust-embed` | Mac'te `cargo run` ile, sunucuda Docker ile aynı artefakt; ön yüz ayrı servis gerektirmez. |
| Docker **isteğe bağlı**, zorunlu değil | Bu Mac'te Docker yok; Colima/OrbStack kurulabilir ama ürün onsuz da çalışmalı. Sunucuya taşımada Dockerfile hazır. |
| Vite+React, Next.js değil | SSR/route gerekmiyor; Next.js ikinci bir sunucu süreci demek. Statik SPA ikiliye gömülür. |
| ffmpeg bu Mac'te | 9.0.2: libx264/x265/vpx/svtav1/opus/mp3lame/dav1d var, `h264_videotoolbox` var. |

Kaynaklar: [State of media processing in Rust (2026)](https://transloadit.com/devtips/converting-videos-to-hls-and-mpeg-dash-with-rust/) ·
[axum Multipart docs](https://docs.rs/axum/latest/src/axum/extract/multipart.rs.html) ·
[rust-embed](https://github.com/pyros2097/rust-embed) · [axum-vite](https://github.com/gko/axum-vite) ·
[ffmpeg progress parsing (deepshrink-ffmpeg)](https://docs.rs/deepshrink-ffmpeg/0.3.3/deepshrink_ffmpeg/progress/) ·
[image crate 0.25](https://docs.rs/crate/image/latest) · [Docker Desktop alternatifleri 2026](https://betterstack.com/community/comparisons/docker-desktop-alternative/)
