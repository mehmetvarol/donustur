// Tek useReducer: dosya kartları ve işleri.

import type { JobView, Kind, Target } from "./api";

export type Phase = "idle" | "uploading" | "queued" | "running" | "done" | "failed" | "cancelled";

export interface Item {
  localId: string;
  file: File;
  kind: Kind | null; // tarayıcı MIME'ından tahmin; sunucu kesinleştirir
  previewUrl: string | null;
  target: string | null;
  recommended: string | null;
  options: Record<string, unknown>;
  showAdvanced: boolean;
  phase: Phase;
  uploadPct: number;
  job: JobView | null;
  error: string | null;
  /** too_large | network | http_4xx kodu | job (sunucuda dönüşüm hatası) */
  errorCode: string | null;
  startedAt: number | null;
}

export interface State {
  items: Item[];
}

export type Action =
  | { type: "add"; files: File[]; targets: Target[] }
  | { type: "remove"; localId: string }
  | { type: "setTarget"; localId: string; target: string; targets: Target[] }
  | { type: "setOption"; localId: string; key: string; value: unknown }
  | { type: "toggleAdvanced"; localId: string }
  | { type: "uploadStart"; localId: string }
  | { type: "uploadPct"; localId: string; pct: number }
  | { type: "uploaded"; localId: string; job: JobView }
  | { type: "jobUpdate"; localId: string; job: JobView }
  | { type: "fail"; localId: string; error: string; code: string }
  | { type: "cancelled"; localId: string }
  | { type: "reset"; localId: string }
  | { type: "clearDone" };

export function kindFromMime(mime: string, name: string): Kind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["heic", "heif", "avif", "qoi", "tga"].includes(ext)) return "image";
  if (["mkv", "mov", "webm", "m4v", "ts"].includes(ext)) return "video";
  if (["opus", "flac", "m4a", "ogg", "oga"].includes(ext)) return "audio";
  return null;
}

export function targetsFor(kind: Kind | null, targets: Target[]): Target[] {
  if (!kind) return [];
  return targets.filter((t) => t.available && t.accepts.includes(kind));
}

export function defaultOptions(t: Target | undefined): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (!t) return o;
  for (const s of t.options) o[s.key] = s.default;
  return o;
}

function defaultTarget(kind: Kind | null, mime: string, targets: Target[]): string | null {
  const list = targetsFor(kind, targets);
  if (list.length === 0) return null;
  const prefer: Record<Kind, string[]> = {
    image: mime === "image/webp" ? ["jpeg", "png"] : ["webp", "jpeg"],
    video: mime === "video/mp4" ? ["webm", "mp4"] : ["mp4", "webm"],
    audio: mime === "audio/mpeg" ? ["m4a", "opus"] : ["mp3", "m4a"],
  };
  for (const id of prefer[kind!]) if (list.some((t) => t.id === id)) return id;
  return list[0].id;
}

/** Sunucudaki `jobs::safe_stem` ile aynı kural: çıktı adını önceden göstermek için. */
export function safeStem(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const cleaned = Array.from(stem, (c) => (/^[A-Za-z0-9._-]$/.test(c) ? c : "_")).join("");
  const trimmed = cleaned.replace(/^[._-]+|[._-]+$/g, "");
  const cut = Array.from(trimmed).slice(0, 80).join("");
  return cut || "cikti";
}

let seq = 0;

export function reducer(state: State, a: Action): State {
  const upd = (localId: string, f: (i: Item) => Item): State => ({
    items: state.items.map((i) => (i.localId === localId ? f(i) : i)),
  });
  switch (a.type) {
    case "add": {
      const items = a.files.map((file): Item => {
        const kind = kindFromMime(file.type, file.name);
        const target = defaultTarget(kind, file.type, a.targets);
        const previewUrl = kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
        return {
          localId: `${Date.now()}-${seq++}`,
          file,
          kind,
          previewUrl,
          target,
          recommended: target,
          options: defaultOptions(a.targets.find((t) => t.id === target)),
          showAdvanced: false,
          phase: "idle",
          uploadPct: 0,
          job: null,
          error: kind ? null : "unsupported",
          errorCode: null,
          startedAt: null,
        };
      });
      return { items: [...state.items, ...items] };
    }
    case "remove": {
      const it = state.items.find((i) => i.localId === a.localId);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return { items: state.items.filter((i) => i.localId !== a.localId) };
    }
    case "setTarget":
      return upd(a.localId, (i) => ({
        ...i,
        target: a.target,
        options: defaultOptions(a.targets.find((t) => t.id === a.target)),
      }));
    case "setOption":
      return upd(a.localId, (i) => ({ ...i, options: { ...i.options, [a.key]: a.value } }));
    case "toggleAdvanced":
      return upd(a.localId, (i) => ({ ...i, showAdvanced: !i.showAdvanced }));
    case "uploadStart":
      return upd(a.localId, (i) => ({ ...i, phase: "uploading", uploadPct: 0, error: null, errorCode: null, startedAt: Date.now() }));
    case "uploadPct":
      return upd(a.localId, (i) => ({ ...i, uploadPct: a.pct }));
    case "uploaded":
      return upd(a.localId, (i) => ({ ...i, phase: a.job.status as Phase, job: a.job, uploadPct: 100 }));
    case "jobUpdate":
      return upd(a.localId, (i) => ({
        ...i,
        job: a.job,
        phase: a.job.status as Phase,
        error: a.job.status === "failed" ? a.job.error : i.error,
        errorCode: a.job.status === "failed" ? "job" : i.errorCode,
      }));
    case "fail":
      return upd(a.localId, (i) => ({ ...i, phase: "failed", error: a.error, errorCode: a.code }));
    case "cancelled":
      return upd(a.localId, (i) => ({ ...i, phase: "cancelled" }));
    case "reset":
      return upd(a.localId, (i) => ({ ...i, phase: "idle", job: null, error: null, errorCode: null, uploadPct: 0, startedAt: null }));
    case "clearDone": {
      for (const i of state.items) if ((i.phase === "done" || i.phase === "cancelled" || i.phase === "failed") && i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      return { items: state.items.filter((i) => !(i.phase === "done" || i.phase === "cancelled" || i.phase === "failed")) };
    }
  }
}
