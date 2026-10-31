// Sunucu API'si — tipler ve çağrılar. Katalog sunucudan gelir; burada kopya yok.

export type Kind = "image" | "video" | "audio";

export type OptionSpec = { key: string; label: string; help: string; advanced: boolean } & (
  | { type: "int"; min: number; max: number; default: number; step: number }
  | { type: "float"; min: number; max: number; default: number; step: number }
  | { type: "enum"; values: string[]; default: string }
  | { type: "bool"; default: boolean }
  | { type: "color"; default: string }
);

export interface Target {
  id: string;
  label: string;
  kind: Kind;
  ext: string;
  mime: string;
  engine: "image" | "ffmpeg";
  accepts: Kind[];
  options: OptionSpec[];
  available: boolean;
}

export interface Health {
  ok: boolean;
  version: string;
  ffmpeg: string | null;
  heic: boolean;
  hwaccel: boolean;
  workers: number;
  queued: number;
  running: number;
  auth_required: boolean;
  max_upload_bytes: number;
  ttl_min: number;
}

export type Status = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobView {
  id: string;
  status: Status;
  progress: number;
  target: string;
  input: {
    name: string;
    size: number;
    mime: string;
    kind: Kind;
    width: number | null;
    height: number | null;
    duration: number | null;
    codec: string | null;
    has_audio: boolean | null;
  };
  output: { name: string; size: number; mime: string } | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
  try {
    if (t) sessionStorage.setItem("donustur.token", t);
    else sessionStorage.removeItem("donustur.token");
  } catch {
    /* özel pencere */
  }
}
export function loadToken(): string | null {
  try {
    token = sessionStorage.getItem("donustur.token");
  } catch {
    token = null;
  }
  return token;
}
function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
export function withToken(url: string): string {
  if (!token) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
}

async function parseError(res: Response): Promise<ApiError> {
  let code = "http_" + res.status;
  let message = res.statusText || "istek başarısız";
  try {
    const j = await res.json();
    if (j?.error) {
      code = j.error.code ?? code;
      message = j.error.message ?? message;
    }
  } catch {
    /* gövde JSON değil */
  }
  return new ApiError(res.status, code, message);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export const api = {
  health: () => get<Health>("/api/health"),
  formats: () => get<Target[]>("/api/formats"),
  job: (id: string) => get<JobView>(`/api/jobs/${id}`),
  async checkPassword(password: string): Promise<boolean> {
    const res = await fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return res.status === 204;
  },
  async cancel(id: string): Promise<void> {
    const res = await fetch(`/api/jobs/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok && res.status !== 404) throw await parseError(res);
  },
  downloadUrl: (id: string) => withToken(`/api/jobs/${id}/download`),
  eventsUrl: (id: string) => withToken(`/api/jobs/${id}/events`),

  /** Yükleme: XHR ile (fetch yükleme ilerlemesi vermez). */
  upload(
    file: File,
    target: string,
    options: Record<string, unknown>,
    onProgress: (pct: number) => void,
    signal?: AbortSignal,
  ): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("target", target);
      fd.append("options", JSON.stringify(options));
      fd.append("file", file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/jobs");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onerror = () => reject(new ApiError(0, "network", "ağ hatası"));
      xhr.onabort = () => reject(new ApiError(0, "aborted", "iptal edildi"));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new ApiError(xhr.status, "parse", "sunucu cevabı okunamadı"));
          }
        } else {
          let code = "http_" + xhr.status;
          let message = xhr.statusText || "yükleme başarısız";
          try {
            const j = JSON.parse(xhr.responseText);
            code = j?.error?.code ?? code;
            message = j?.error?.message ?? message;
          } catch {
            /* JSON değil */
          }
          reject(new ApiError(xhr.status, code, message));
        }
      };
      signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(fd);
    });
  },
};

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function fmtDuration(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s.toFixed(1)} sn`;
}
