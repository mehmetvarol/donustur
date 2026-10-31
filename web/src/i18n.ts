// Sözlük + yerel biçimler. Türkçe varsayılan, İngilizce ikinci dil.
// Türkçe yazım: yüzde önde (%90), ondalık virgül (3,1 MB), boyut çarpıyla (4032 × 3024).

export type Lang = "tr" | "en";

const tr = {
  title: "Dönüştür",
  heroTitle: "Dosyanı bırak, formatı seç, indir.",
  heroText: "Görsel, video ve ses dosyalarını kendi sunucunda dönüştür. Hesap açmazsın, dosyan üçüncü bir servise gitmez.",
  step1Title: "Dosyayı bırak",
  step1Text: "ya da bilgisayarından seç.",
  step2Title: "Hedef formatı seç.",
  step2Text: "Emin değilsen önerileni bırak; ayarlar zaten dengeli.",
  step3Title: "İndir.",
  step3Text: "Dosyalar {n} dakika sonra sunucudan silinir.",

  dropTitle: "Dosyaları buraya sürükle",
  dropOr: "ya da bilgisayarından seç",
  dropActive: "Bırak, listeye ekleyelim",
  choose: "Dosya seç",
  dropHint: "Görsel, video, ses · tek dosya en çok {max} · birden çok dosya seçebilirsin",
  addMoreTitle: "Başka dosya ekle:",
  addMoreText: "buraya sürükle ya da seç. En çok {max}.",

  whatTitle: "Ne dönüştürebilirim?",
  whatText: "Dosya türünü uzantısından değil içeriğinden tanır. Uzantısı yanlış yazılmış bir dosya da doğru işlenir.",
  kind_image: "Görsel",
  kind_image_sub: "Fotoğraf, ekran görüntüsü, ikon",
  kind_video: "Video",
  kind_video_sub: "Ekran kaydı, telefon videosu, klip",
  kind_audio: "Ses",
  kind_audio_sub: "Kayıt, podcast, müzik",
  convertsTo: "Şunlara çevirir",
  noteImageHeic: "iPhone fotoğrafları (HEIC) dahil. EXIF yönü kendiliğinden düzeltilir.",
  noteImageNoHeic: "EXIF yönü kendiliğinden düzeltilir. HEIC okuma bu kurulumda kapalı.",
  noteVideo: "Kırp, küçült, hızlandır ya da yalnız sesini al.",
  noteVideoHw: "Kırp, küçült, hızlandır ya da yalnız sesini al. Donanım hızlandırma açık.",
  noteAudio: "Ses seviyesini eşitle, kanal ve örnekleme hızını seç.",
  noFfmpeg: "ffmpeg kurulu değil; bu tür şu an kapalı.",

  trust1Title: "Kendi sunucunda kalır",
  trust1Text: "Dosyalar bu sunucuda işlenir. Hiçbir dış servise yüklenmez, reklam ya da takip yok.",
  trust2Title: "Kendiliğinden silinir",
  trust2Text: "Yüklenen ve üretilen dosyalar {n} dakika sonra silinir. Sunucu yeniden başlayınca da temizlenir.",
  trust3Title: "Varsayılanlar dengeli",
  trust3Text: "Ayarlara dokunmadan da iyi sonuç alırsın. Kalite, boyut ve kırpma istersen elinin altında.",

  listTitle: "Dönüştürme listesi",
  countFiles: "{n} dosya",
  countIdle: "{n} ayar bekliyor",
  countBusy: "{n} sürüyor",
  countDone: "{n} hazır",
  countFailed: "{n} hata",
  clearDone: "Bitenleri temizle",
  convertAll: "Hepsini dönüştür ({n})",

  asideFilesTitle: "Dosyalarına ne olur?",
  asideLocal: "Yalnız bu sunucuda işlenir, dışarı gönderilmez.",
  asideTtl: "Yüklenen ve üretilen dosyalar {n} dakika sonra silinir.",
  asideRefresh: "Sayfayı yenilersen liste sıfırlanır; bitenleri önce indir.",
  asideServerTitle: "Sunucu",
  srvStatus: "Durum",
  srvRunning: "Çalışıyor",
  srvOffline: "Ulaşılamıyor",
  srvVersion: "Sürüm",
  srvAccel: "Hızlandırma",
  srvHeic: "HEIC okuma",
  srvQueue: "Kuyruk",
  srvQueueVal: "{r} çalışıyor · {q} bekliyor",
  srvConcurrency: "Eşzamanlı",
  srvLimit: "Sınır",
  srvLimitVal: "Dosya başına {max}",
  on: "Açık",
  off: "Kapalı",

  statusReady: "Sunucu hazır",
  statusReadyShort: "Hazır",
  statusOfflineShort: "Bağlantı yok",
  statusOffline: "Sunucuya ulaşılamıyor",
  offlineBanner: "Sunucuya ulaşılamıyor. Sunucu yeniden açılınca bu sayfa kendiliğinden bağlanır.",
  footerRunning: "Sunucu çalışıyor",
  footerAccel: "Donanım hızlandırma açık",
  footerQueueEmpty: "Kuyruk boş",
  footerQueue: "{r} çalışıyor · {q} bekliyor",
  footerWorkers: "{n} işçi",
  footerTtl: "Dosyalar {n} dk sonra silinir",
  ffmpegMissing: "ffmpeg yok, yalnız görsel",
  langGroup: "Dil",

  removeItem: "{name} dosyasını listeden kaldır",
  chooseTarget: "Neye dönüştürelim?",
  targetGroup: "Hedef format",
  recommended: "Önerilen",
  moreFormats: "Diğer formatlar",
  fewerFormats: "Daha az göster",
  fewerHint: "Yalnız sık kullanılanlar",
  audioOnly: "Yalnız sesi al",
  advanced: "Gelişmiş ayarlar",

  sizeLabel: "Boyut",
  sizeSub: "uzun kenar",
  sizeOriginal: "Orijinal",
  sizeCustom: "Özel…",
  sizeHint: "Küçük görsel büyütülmez; oran korunur.",
  sizeHintUpscale: "Büyütme açık: küçük görsel de bu boyuta getirilir.",
  sizeHintCustom: "0 = orijinal. Oranın korunması için birini 0 bırak.",
  qualitySmall: "Küçük dosya",
  qualityHigh: "Yüksek kalite",
  qHint90: "Çok yüksek kalite; dosya belirgin biçimde büyür.",
  qHint70: "Dengeli: çoğu fotoğrafta fark gözle seçilmez.",
  qHint45: "Küçük dosya; yakından bakınca ayrıntı kaybı görülebilir.",
  qHintLow: "Çok küçük dosya; bozulma açıkça görünür.",
  losslessOn: "Kayıpsız açık; kalite ayarı kullanılmaz.",

  uploading: "Yükleniyor",
  queued: "Sırada",
  running: "Dönüştürülüyor",
  done: "Hazır",
  failed: "Dönüştürülemedi",
  cancelled: "İptal edildi",
  left: "yaklaşık {t} kaldı",
  waiting: "boş işçi bekleniyor",
  elapsed: "{t} geçti",
  noDuration: "süre bilinmiyor, yüzde hesaplanamıyor",
  cancel: "İptal et",
  download: "İndir",
  otherFormat: "Başka formata çevir",
  retry: "Tekrar dene",
  remove: "Kaldır",
  smaller: "{p} küçüldü",
  larger: "{p} büyüdü",
  sameSize: "boyut aynı",
  source: "Kaynak: {name}",
  expires: "Sunucudan silinme: {time}",
  failGeneric: "Dosya dönüştürülemedi. Dosya bozuk ya da bu dönüşüme uygun olmayabilir.",
  failTooLarge: "Dosya {max} sınırından büyük.",
  failNetwork: "Bağlantı koptu. Sunucunun açık olduğundan emin olup tekrar dene.",
  failRejected: "Sunucu bu dosyayı kabul etmedi.",
  failUnsupportedMedia: "Dosyanın içeriği tanınmadı. Uzantısı doğru görünse de dosya bozuk ya da başka bir türde olabilir.",
  technical: "Teknik ayrıntı",
  unsupported: "Bu dosya türü için uygun hedef yok.",
  unsupportedHint: "Görsel, video ya da ses dosyası seç.",
  mediaImage: "Görsel",
  mediaVideo: "Video",
  mediaAudio: "Ses",

  passwordTitle: "Bu sunucu şifreli",
  passwordHint: "Sunucuyu kuran kişinin verdiği şifreyi gir. Şifre yalnız bu sekmede tutulur; sekmeyi kapatınca unutulur.",
  password: "Şifre",
  wrongPassword: "Şifre yanlış. Büyük/küçük harfe dikkat et.",
  enter: "Giriş yap",
  checking: "Kontrol ediliyor…",
  showPassword: "Şifreyi göster",
  hidePassword: "Şifreyi gizle",
  askAdmin: "Şifreyi bilmiyorsan sunucunun yöneticisine sor.",
};

export type Key = keyof typeof tr;

const en: Record<Key, string> = {
  title: "Dönüştür",
  heroTitle: "Drop a file, pick a format, download.",
  heroText: "Convert images, video and audio on your own server. No account, and your file never goes to a third-party service.",
  step1Title: "Drop the file",
  step1Text: "or pick it from your computer.",
  step2Title: "Choose a target format.",
  step2Text: "Not sure? Keep the recommended one; the defaults are balanced.",
  step3Title: "Download.",
  step3Text: "Files are deleted from the server after {n} minutes.",

  dropTitle: "Drag files here",
  dropOr: "or pick them from your computer",
  dropActive: "Drop to add them to the list",
  choose: "Choose files",
  dropHint: "Image, video, audio · up to {max} per file · multiple files are fine",
  addMoreTitle: "Add more files:",
  addMoreText: "drag them here or choose. Up to {max}.",

  whatTitle: "What can I convert?",
  whatText: "File types are detected from their content, not the extension. A file with the wrong extension still works.",
  kind_image: "Image",
  kind_image_sub: "Photos, screenshots, icons",
  kind_video: "Video",
  kind_video_sub: "Screen recordings, phone videos, clips",
  kind_audio: "Audio",
  kind_audio_sub: "Recordings, podcasts, music",
  convertsTo: "Converts to",
  noteImageHeic: "Includes iPhone photos (HEIC). EXIF orientation is fixed automatically.",
  noteImageNoHeic: "EXIF orientation is fixed automatically. HEIC reading is off in this build.",
  noteVideo: "Trim, shrink, speed up or keep just the audio.",
  noteVideoHw: "Trim, shrink, speed up or keep just the audio. Hardware acceleration is on.",
  noteAudio: "Normalize loudness, pick channels and sample rate.",
  noFfmpeg: "ffmpeg is not installed; this type is off for now.",

  trust1Title: "Stays on your server",
  trust1Text: "Files are processed on this server. Nothing is uploaded to an outside service; no ads, no tracking.",
  trust2Title: "Deleted automatically",
  trust2Text: "Uploaded and converted files are deleted after {n} minutes, and on every server restart.",
  trust3Title: "Balanced defaults",
  trust3Text: "You get good results without touching a setting. Quality, size and trimming are there when you want them.",

  listTitle: "Conversion list",
  countFiles: "{n} files",
  countIdle: "{n} waiting for settings",
  countBusy: "{n} in progress",
  countDone: "{n} ready",
  countFailed: "{n} failed",
  clearDone: "Clear finished",
  convertAll: "Convert all ({n})",

  asideFilesTitle: "What happens to your files?",
  asideLocal: "Processed only on this server, never sent elsewhere.",
  asideTtl: "Uploaded and converted files are deleted after {n} minutes.",
  asideRefresh: "Reloading the page clears this list; download finished files first.",
  asideServerTitle: "Server",
  srvStatus: "Status",
  srvRunning: "Running",
  srvOffline: "Unreachable",
  srvVersion: "Version",
  srvAccel: "Acceleration",
  srvHeic: "HEIC reading",
  srvQueue: "Queue",
  srvQueueVal: "{r} running · {q} waiting",
  srvConcurrency: "Concurrent",
  srvLimit: "Limit",
  srvLimitVal: "{max} per file",
  on: "On",
  off: "Off",

  statusReady: "Server ready",
  statusReadyShort: "Ready",
  statusOfflineShort: "Offline",
  statusOffline: "Server unreachable",
  offlineBanner: "Cannot reach the server. This page reconnects by itself once it is back.",
  footerRunning: "Server running",
  footerAccel: "Hardware acceleration on",
  footerQueueEmpty: "Queue empty",
  footerQueue: "{r} running · {q} waiting",
  footerWorkers: "{n} workers",
  footerTtl: "Files deleted after {n} min",
  ffmpegMissing: "no ffmpeg, images only",
  langGroup: "Language",

  removeItem: "Remove {name} from the list",
  chooseTarget: "Convert to what?",
  targetGroup: "Target format",
  recommended: "Recommended",
  moreFormats: "More formats",
  fewerFormats: "Show fewer",
  fewerHint: "Common ones only",
  audioOnly: "Audio only",
  advanced: "Advanced settings",

  sizeLabel: "Size",
  sizeSub: "long edge",
  sizeOriginal: "Original",
  sizeCustom: "Custom…",
  sizeHint: "Small images are never enlarged; aspect ratio is kept.",
  sizeHintUpscale: "Upscaling is on: small images are enlarged to this size too.",
  sizeHintCustom: "0 = original. Leave one at 0 to keep the aspect ratio.",
  qualitySmall: "Smaller file",
  qualityHigh: "Higher quality",
  qHint90: "Very high quality; the file gets noticeably larger.",
  qHint70: "Balanced: on most photos the difference is invisible.",
  qHint45: "Small file; up close you may see lost detail.",
  qHintLow: "Very small file; artifacts are clearly visible.",
  losslessOn: "Lossless is on; the quality setting is ignored.",

  uploading: "Uploading",
  queued: "Queued",
  running: "Converting",
  done: "Ready",
  failed: "Could not convert",
  cancelled: "Cancelled",
  left: "about {t} left",
  waiting: "waiting for a free worker",
  elapsed: "{t} elapsed",
  noDuration: "length unknown, no percentage",
  cancel: "Cancel",
  download: "Download",
  otherFormat: "Convert to another format",
  retry: "Try again",
  remove: "Remove",
  smaller: "{p} smaller",
  larger: "{p} larger",
  sameSize: "same size",
  source: "Source: {name}",
  expires: "Deleted from server at {time}",
  failGeneric: "The file could not be converted. It may be damaged or unsuitable for this conversion.",
  failTooLarge: "The file is larger than the {max} limit.",
  failNetwork: "The connection dropped. Make sure the server is running and try again.",
  failRejected: "The server did not accept this file.",
  failUnsupportedMedia: "The file's content was not recognized. Even with the right extension, it may be damaged or of another type.",
  technical: "Technical details",
  unsupported: "No target is available for this file type.",
  unsupportedHint: "Choose an image, video or audio file.",
  mediaImage: "Image",
  mediaVideo: "Video",
  mediaAudio: "Audio",

  passwordTitle: "This server is password protected",
  passwordHint: "Enter the password from whoever set up the server. It is kept only in this tab and forgotten when you close it.",
  password: "Password",
  wrongPassword: "Wrong password. Check upper and lower case.",
  enter: "Sign in",
  checking: "Checking…",
  showPassword: "Show password",
  hidePassword: "Hide password",
  askAdmin: "If you do not know the password, ask the server's admin.",
};

const dict: Record<Lang, Record<Key, string>> = { tr, en };

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("donustur.lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch {
    /* yok */
  }
  return navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export interface I18n {
  lang: Lang;
  t: (k: Key, vars?: Record<string, string | number>) => string;
  num: (n: number, digits?: number) => string;
  bytes: (n: number) => string;
  pct: (n: number) => string;
  dims: (w: number, h: number) => string;
  clock: (seconds: number) => string;
  span: (seconds: number) => string;
  time: (d: Date) => string;
}

export function makeI18n(lang: Lang): I18n {
  const locale = lang === "tr" ? "tr-TR" : "en-US";
  const num = (n: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
  const t = (k: Key, vars?: Record<string, string | number>): string => {
    let s = dict[lang][k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(typeof b === "number" ? num(b) : b);
    return s;
  };
  return {
    lang,
    t,
    num,
    bytes(n) {
      if (!Number.isFinite(n)) return "–";
      const u = ["B", "KB", "MB", "GB"];
      let i = 0;
      let v = n;
      while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
      }
      return `${num(v, v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
    },
    pct: (n) => (lang === "tr" ? `%${num(n)}` : `${num(n)}%`),
    dims: (w, h) => `${w} × ${h}`,
    clock(s) {
      if (!Number.isFinite(s)) return "";
      const total = Math.round(s);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const r = total % 60;
      const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
      return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
    },
    span(s) {
      const total = Math.max(1, Math.round(s));
      const m = Math.floor(total / 60);
      const r = total % 60;
      const [mu, su] = lang === "tr" ? ["dk", "sn"] : ["min", "s"];
      if (m === 0) return `${r} ${su}`;
      if (m >= 10 || r === 0) return `${m} ${mu}`;
      return `${m} ${mu} ${r} ${su}`;
    },
    time: (d) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
  };
}
