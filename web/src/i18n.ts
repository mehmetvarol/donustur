// Basit sözlük: Türkçe varsayılan, İngilizce ikinci dil.

export type Lang = "tr" | "en";

const dict = {
  tr: {
    title: "Dönüştür",
    tagline: "Görsel, video ve ses dosyalarını kendi sunucunda çevir.",
    drop: "Dosyaları buraya bırak",
    or: "ya da",
    choose: "dosya seç",
    hint: "Görsel, video, ses • en çok",
    target: "Hedef format",
    advanced: "Gelişmiş",
    convert: "Dönüştür",
    convertAll: "Hepsini dönüştür",
    cancel: "İptal",
    remove: "Kaldır",
    download: "İndir",
    again: "Yeni dönüşüm",
    clearDone: "Bitenleri temizle",
    uploading: "Yükleniyor",
    queued: "Sırada",
    running: "Dönüştürülüyor",
    done: "Bitti",
    failed: "Başarısız",
    cancelled: "İptal edildi",
    saved: "kazanç",
    grew: "büyüdü",
    remaining: "kalan",
    server: "Sunucu",
    ffmpegMissing: "ffmpeg yok — yalnız görsel",
    queue: "kuyruk",
    active: "aktif",
    workers: "işçi",
    password: "Şifre",
    passwordHint: "Bu sunucu şifre koruması altında.",
    enter: "Giriş",
    wrongPassword: "Şifre yanlış.",
    unsupported: "Bu dosya türü için uygun hedef yok.",
    noTargets: "Hedef yok",
    original: "orijinal",
    offline: "Sunucuya ulaşılamıyor.",
    language: "English",
    dims: "boyut",
    duration: "süre",
    ttl: "Dosyalar {n} dk sonra silinir.",
    tooLarge: "Dosya sınırdan büyük",
    heicNo: "HEIC desteği bu derlemede kapalı",
  },
  en: {
    title: "Dönüştür",
    tagline: "Convert images, video and audio on your own server.",
    drop: "Drop files here",
    or: "or",
    choose: "choose files",
    hint: "Image, video, audio • up to",
    target: "Target format",
    advanced: "Advanced",
    convert: "Convert",
    convertAll: "Convert all",
    cancel: "Cancel",
    remove: "Remove",
    download: "Download",
    again: "New conversion",
    clearDone: "Clear finished",
    uploading: "Uploading",
    queued: "Queued",
    running: "Converting",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
    saved: "smaller",
    grew: "larger",
    remaining: "left",
    server: "Server",
    ffmpegMissing: "no ffmpeg — images only",
    queue: "queue",
    active: "active",
    workers: "workers",
    password: "Password",
    passwordHint: "This server is password protected.",
    enter: "Enter",
    wrongPassword: "Wrong password.",
    unsupported: "No target available for this file type.",
    noTargets: "No targets",
    original: "original",
    offline: "Cannot reach the server.",
    language: "Türkçe",
    dims: "size",
    duration: "duration",
    ttl: "Files are deleted after {n} min.",
    tooLarge: "File exceeds the limit",
    heicNo: "HEIC support is disabled in this build",
  },
} as const;

export type Key = keyof (typeof dict)["tr"];

export function makeT(lang: Lang) {
  return (k: Key, vars?: Record<string, string | number>): string => {
    let s: string = dict[lang][k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  };
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("donustur.lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch {
    /* yok */
  }
  return navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}
