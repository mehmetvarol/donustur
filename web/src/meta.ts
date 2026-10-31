// Arayüz metinleri: hedef açıklamaları, seçenek etiketleri, değer adları.
// Katalog (id, seçenek anahtarları, sınırlar) sunucudan gelir; burada yalnız insan diline çeviri var.
// Bilinmeyen bir id/anahtar gelirse sunucunun etiketi kullanılır.

import type { Kind, OptionSpec, Target } from "./api";
import type { Lang } from "./i18n";

type Pair = [tr: string, en: string];

const pick = (p: Pair | undefined, lang: Lang): string | undefined => (p ? p[lang === "tr" ? 0 : 1] : undefined);

// ---------------- hedefler ----------------

const SHORT: Record<string, string> = { m4a: "M4A", ogg: "OGG", gif_anim: "GIF" };

export function shortLabel(t: Target): string {
  return SHORT[t.id] ?? t.label.replace(/\s*\(.*\)\s*$/, "");
}

const DESC: Record<string, Pair> = {
  jpeg: ["Fotoğraf; her cihazda açılır", "Photos; opens everywhere"],
  png: ["Kayıpsız; ekran görüntüsü, logo", "Lossless; screenshots, logos"],
  webp: ["Web için küçük dosya; şeffaflık korunur", "Small files for the web; keeps transparency"],
  avif: ["En küçük dosya; yeni tarayıcılar", "Smallest files; modern browsers"],
  gif: ["Tek kare; eski sistemler", "Single frame; legacy systems"],
  bmp: ["Sıkıştırmasız görüntü", "Uncompressed image"],
  tiff: ["Baskı ve arşiv; büyük dosya", "Print and archive; large files"],
  ico: ["Site ve uygulama simgesi", "Site and app icon"],
  qoi: ["Hızlı, kayıpsız biçim", "Fast lossless format"],
  mp4: ["H.264; her yerde oynar", "H.264; plays everywhere"],
  webm: ["VP9 + Opus; web için küçük", "VP9 + Opus; small for the web"],
  mkv: ["H.264; esnek kap, arşiv", "H.264; flexible container"],
  mov: ["H.264; Apple uygulamaları", "H.264; Apple apps"],
  gif_anim: ["Hareketli; sohbet ve sunum", "Animated; chats and slides"],
  mp3: ["Her cihazda çalar", "Plays on every device"],
  m4a: ["AAC; Apple ve telefonlar", "AAC; Apple and phones"],
  opus: ["Konuşmada en küçük dosya", "Smallest for speech"],
  ogg: ["Vorbis; açık biçim", "Vorbis; open format"],
  flac: ["Kayıpsız; arşiv", "Lossless; archive"],
  wav: ["Sıkıştırmasız; ses düzenleme", "Uncompressed; audio editing"],
};

export function targetDesc(t: Target, sourceKind: Kind | null, lang: Lang): string {
  const d = pick(DESC[t.id], lang) ?? "";
  if (sourceKind === "video" && t.kind === "audio") return (lang === "tr" ? "Yalnız ses · " : "Audio only · ") + d;
  return d;
}

// Türkçe ek okunuşa göre: "WebP'ye", "JPEG'e", "ICO'ya", "MOV'a"
const DATIVE_TR: Record<string, string> = {
  jpeg: "JPEG'e",
  png: "PNG'ye",
  webp: "WebP'ye",
  avif: "AVIF'e",
  gif: "GIF'e",
  bmp: "BMP'ye",
  tiff: "TIFF'e",
  ico: "ICO'ya",
  qoi: "QOI'ye",
  mp4: "MP4'e",
  webm: "WebM'e",
  mkv: "MKV'ye",
  mov: "MOV'a",
  gif_anim: "hareketli GIF'e",
  mp3: "MP3'e",
  m4a: "M4A'ya",
  opus: "Opus'a",
  ogg: "OGG'ye",
  flac: "FLAC'a",
  wav: "WAV'a",
};

export function convertLabel(t: Target, lang: Lang): string {
  if (lang === "tr") return `${DATIVE_TR[t.id] ?? `${shortLabel(t)} biçimine`} dönüştür`;
  return `Convert to ${t.id === "gif_anim" ? "animated GIF" : shortLabel(t)}`;
}

/** Kalite ayarı olmayan hedefte gösterilen açıklama. */
const NO_QUALITY: Record<string, Pair> = {
  png: ["PNG kayıpsızdır; görüntüden hiçbir şey eksilmez, kalite ayarı gerekmez.", "PNG is lossless; nothing is lost, so there is no quality setting."],
  tiff: ["TIFF sıkıştırmasız kaydeder; dosya büyük olur, kalite kaybı olmaz.", "TIFF stores uncompressed; large file, no quality loss."],
  gif: ["GIF en çok 256 renk kullanır; fotoğraflarda renk geçişleri bozulabilir.", "GIF uses at most 256 colors; gradients in photos may band."],
  bmp: ["BMP sıkıştırmaz; kalite kaybı olmaz, dosya çok büyük olur.", "BMP is uncompressed; no quality loss, very large file."],
  qoi: ["QOI kayıpsızdır; kalite ayarı gerekmez.", "QOI is lossless; no quality setting needed."],
  flac: ["FLAC kayıpsızdır; ses olduğu gibi korunur.", "FLAC is lossless; the audio is kept exactly."],
  wav: ["WAV sıkıştırmasızdır; ses olduğu gibi korunur, dosya büyük olur.", "WAV is uncompressed; exact audio, large file."],
};
export const noQualityNote = (id: string, lang: Lang) => pick(NO_QUALITY[id], lang);

/** Kartta önce gösterilen hedefler; gerisi "Diğer formatlar"ın arkasında. */
const PRIMARY: Record<Kind, string[]> = {
  image: ["webp", "jpeg", "png", "avif", "tiff"],
  video: ["mp4", "webm", "gif_anim", "mp3"],
  audio: ["mp3", "m4a", "opus", "flac"],
};
export function splitTargets(kind: Kind | null, list: Target[], selected: string | null): { primary: Target[]; more: Target[] } {
  if (!kind) return { primary: list, more: [] };
  const want = PRIMARY[kind];
  const rank = (id: string) => {
    const i = want.indexOf(id);
    return i < 0 ? want.length : i;
  };
  const primary = list.filter((t) => want.includes(t.id) || t.id === selected);
  primary.sort((a, b) => rank(a.id) - rank(b.id));
  const more = list.filter((t) => !primary.includes(t));
  return { primary, more };
}

// ---------------- seçenekler ----------------

const LABEL: Record<string, Pair> = {
  quality: ["Kalite", "Quality"],
  crf: ["Kalite", "Quality"],
  vbr_quality: ["Kalite", "Quality"],
  lossless: ["Kayıpsız sıkıştır", "Lossless"],
  size: ["Simge boyutu (px)", "Icon size (px)"],
  fps: ["Kare hızı", "Frame rate"],
  width: ["Genişlik (px)", "Width (px)"],
  height: ["Yükseklik (px)", "Height (px)"],
  fit: ["Sığdırma", "Fit"],
  upscale: ["Büyütmeye izin ver", "Allow upscaling"],
  rotate_from_exif: ["Fotoğrafı doğru yöne çevir", "Apply photo orientation"],
  background: ["Arka plan rengi", "Background color"],
  compression: ["Sıkıştırma", "Compression"],
  resolution: ["Çözünürlük", "Resolution"],
  trim_start: ["Başlangıç (sn)", "Start (s)"],
  trim_end: ["Bitiş (sn)", "End (s)"],
  mute: ["Sesi kaldır", "Remove audio"],
  preset: ["Kodlama hızı", "Encoding speed"],
  audio_bitrate: ["Ses kalitesi", "Audio bitrate"],
  bitrate: ["Bit hızı", "Bitrate"],
  sample_rate: ["Örnekleme hızı", "Sample rate"],
  channels: ["Kanal", "Channels"],
  normalize: ["Ses seviyesini eşitle", "Normalize loudness"],
  dither: ["Renk geçişi (dither)", "Dithering"],
};

const HELP: Record<string, Pair> = {
  crf: ["Düşük sayı daha iyi kalite, daha büyük dosya.", "Lower number means better quality and a larger file."],
  vbr_quality: ["0 küçük dosya … 10 en iyi kalite.", "0 smallest … 10 best quality."],
  lossless: ["Kalite ayarı devre dışı kalır.", "The quality setting is ignored."],
  size: ["Kare simgenin kenarı; en çok 256.", "Edge of the square icon; at most 256."],
  fps: ["0 = orijinal.", "0 = original."],
  upscale: ["Kapalıysa görsel yalnız küçülür.", "When off, images only shrink."],
  rotate_from_exif: ["Telefonun kaydettiği EXIF yönünü uygular.", "Applies the EXIF orientation the phone saved."],
  background: ["Saydam alanların altına gelir.", "Fills transparent areas."],
  trim_end: ["0 = sona kadar.", "0 = until the end."],
  preset: ["Yavaş daha küçük dosya verir.", "Slower gives a smaller file."],
  normalize: ["Yayın standardına (EBU R128) göre.", "To the EBU R128 broadcast standard."],
  resolution: ["Yükseklik. Video yalnız küçültülür, büyütülmez.", "Height. Video is only scaled down, never up."],
  sample_rate: ["Orijinal = değiştirme.", "Original = keep as is."],
};

const SPEED: { video: Pair; avif: Pair; videoHelp: Pair; avifHelp: Pair } = {
  video: ["Oynatma hızı", "Playback speed"],
  avif: ["Kodlama hızı", "Encoding speed"],
  videoHelp: ["1 = normal, 2 = iki kat hızlı.", "1 = normal, 2 = twice as fast."],
  avifHelp: ["1 yavaş ve küçük … 10 hızlı.", "1 slow and small … 10 fast."],
};

export function optLabel(spec: OptionSpec, target: Target, lang: Lang): string {
  if (spec.key === "speed") return pick(target.id === "avif" ? SPEED.avif : SPEED.video, lang)!;
  return pick(LABEL[spec.key], lang) ?? spec.label;
}

export function optHelp(spec: OptionSpec, target: Target, lang: Lang): string {
  if (spec.key === "speed") return pick(target.id === "avif" ? SPEED.avifHelp : SPEED.videoHelp, lang)!;
  return pick(HELP[spec.key], lang) ?? (lang === "tr" ? spec.help : "");
}

const VALUE: Record<string, Record<string, Pair>> = {
  fit: { contain: ["İçine sığdır (kırpma yok)", "Fit inside (no crop)"], cover: ["Kırparak doldur", "Fill and crop"], fill: ["Esnet", "Stretch"] },
  compression: { fast: ["Hızlı", "Fast"], default: ["Dengeli", "Balanced"], best: ["En küçük dosya", "Smallest file"] },
  preset: { ultrafast: ["En hızlı", "Fastest"], veryfast: ["Çok hızlı", "Very fast"], fast: ["Hızlı", "Fast"], medium: ["Dengeli", "Balanced"], slow: ["Yavaş, küçük dosya", "Slow, smaller file"] },
  dither: { bayer: ["Bayer (düzenli)", "Bayer (ordered)"], floyd_steinberg: ["Floyd–Steinberg (yumuşak)", "Floyd–Steinberg (smooth)"], none: ["Yok", "None"] },
  channels: { "1": ["Mono", "Mono"], "2": ["Stereo", "Stereo"] },
};

export function valueLabel(key: string, value: string, lang: Lang, num: (n: number, d?: number) => string): string {
  if (value === "original") return lang === "tr" ? "Orijinal" : "Original";
  const v = pick(VALUE[key]?.[value], lang);
  if (v) return v;
  if (key === "resolution") return `${value}p`;
  if (key === "bitrate" || key === "audio_bitrate") return `${value} kbps`;
  if (key === "sample_rate") return `${num(Number(value) / 1000, 1)} kHz`;
  return value;
}

/** Değerine göre kalite kaydırıcısının yönü: crf'de küçük sayı = yüksek kalite. */
export const invertedQuality = (key: string) => key === "crf";
export const isQualityKey = (key: string) => key === "quality" || key === "crf" || key === "vbr_quality";
