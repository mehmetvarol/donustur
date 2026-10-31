import { useEffect, useState, type ReactNode } from "react";
import { api, type Target } from "../api";
import type { I18n, Key } from "../i18n";
import { convertLabel, shortLabel, splitTargets, targetDesc } from "../meta";
import { safeStem, targetsFor, type Item } from "../state";
import { IconAlert, IconArrowRight, IconCheck, IconChevronRight, IconDownload, IconRetry, IconX, KindIcon } from "./Icons";
import OptionsForm from "./OptionsForm";

interface Props {
  item: Item;
  targets: Target[];
  i: I18n;
  ttlMin: number;
  maxLabel: string;
  onSetTarget: (id: string) => void;
  onSetOption: (key: string, value: unknown) => void;
  onToggleAdvanced: () => void;
  onConvert: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onReset: () => void;
  onRetry: () => void;
}

interface LocalMeta {
  w?: number;
  h?: number;
  dur?: number;
}

const btnSecondary =
  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-control bg-surface px-4 font-semibold text-ink transition-colors hover:border-control-strong hover:bg-surface-2";
const btnGhost = "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-semibold text-ink transition-colors hover:bg-ground";
const btnPrimary =
  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 font-semibold text-on-accent no-underline transition-colors hover:bg-accent-hover";

function Thumb({ item, tone, onMeta }: { item: Item; tone: "plain" | "done" | "failed"; onMeta: (m: LocalMeta) => void }) {
  const [broken, setBroken] = useState(false);
  const base = "size-14 shrink-0 rounded-[14px] object-cover";
  if (!broken && item.previewUrl && item.kind === "image")
    return <img src={item.previewUrl} alt="" className={`${base} bg-sunken`} onLoad={(e) => onMeta({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} onError={() => setBroken(true)} />;
  if (!broken && item.previewUrl && item.kind === "video")
    return (
      <video
        src={item.previewUrl}
        muted
        preload="metadata"
        aria-hidden="true"
        className={`${base} bg-sunken`}
        onLoadedMetadata={(e) => onMeta({ w: e.currentTarget.videoWidth || undefined, h: e.currentTarget.videoHeight || undefined, dur: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : undefined })}
        onError={() => setBroken(true)}
      />
    );
  const cls = tone === "done" ? "bg-accent-soft text-accent-ink" : tone === "failed" ? "bg-danger-soft text-danger-ink" : "bg-sunken text-muted";
  return (
    <span className={`flex size-14 shrink-0 items-center justify-center rounded-[14px] ${cls}`} aria-hidden="true">
      {tone === "done" ? <IconCheck size={24} /> : tone === "failed" ? <IconAlert size={24} /> : <KindIcon kind={item.kind} size={22} />}
    </span>
  );
}

/** Kalan süre; süre bilinmiyorsa (yüzde gelmez) geçen süre. */
function useEta(item: Item, i: I18n, indeterminate: boolean): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (item.phase !== "running") return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [item.phase]);
  if (item.phase !== "running" || !item.job?.started_at) return "";
  const elapsed = (Date.now() - new Date(item.job.started_at).getTime()) / 1000;
  if (indeterminate) return elapsed >= 1 ? i.t("elapsed", { t: i.span(elapsed) }) : "";
  const p = item.job.progress;
  if (p < 3) return "";
  const remain = Math.max(0, (elapsed / p) * (100 - p));
  return remain < 1 ? "" : i.t("left", { t: i.span(remain) });
}

function Badge({ tone, children }: { tone: "done" | "failed" | "muted"; children: ReactNode }) {
  const cls = tone === "done" ? "bg-accent-soft text-accent-ink" : tone === "failed" ? "bg-danger-soft text-danger-ink" : "bg-sunken text-ink";
  return <span className={`rounded-md px-2 text-xs leading-[22px] font-bold ${cls}`}>{children}</span>;
}

export default function FileCard(p: Props) {
  const { item, targets, i, ttlMin, maxLabel } = p;
  const { t } = i;
  const [meta, setMeta] = useState<LocalMeta>({});
  const [more, setMore] = useState(false);
  const list = targetsFor(item.kind, targets);
  const target = targets.find((x) => x.id === item.target);
  const job = item.job;
  const busy = item.phase === "uploading" || item.phase === "queued" || item.phase === "running";
  // ffmpeg süreyi bilmezse ilerleme yüzdesi gelmez: belirsiz çubuk göster
  const indeterminate =
    item.phase === "running" && target?.engine === "ffmpeg" && !job?.input.duration && (job?.progress ?? 0) < 0.5;
  const eta = useEta(item, i, indeterminate);
  const unsupported = item.error === "unsupported" || list.length === 0;

  // dosya bilgisi: sunucunun ölçtüğü varsa o, yoksa tarayıcının
  const w = job?.input.width ?? meta.w;
  const h = job?.input.height ?? meta.h;
  const dur = job?.input.duration ?? meta.dur;
  const metaParts = [i.bytes(item.file.size)];
  if (w && h) metaParts.push(i.dims(w, h));
  if (dur && Number.isFinite(dur)) metaParts.push(i.clock(dur));
  if (item.kind) metaParts.push(t(item.kind === "image" ? "mediaImage" : item.kind === "video" ? "mediaVideo" : "mediaAudio"));

  const tone = item.phase === "done" ? "done" : item.phase === "failed" ? "failed" : "plain";
  const title = item.phase === "done" && job?.output ? job.output.name : item.file.name;

  // ---------------- başlık ----------------
  const header = (
    <div className="flex items-center gap-4">
      <Thumb item={item} tone={tone} onMeta={setMeta} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 truncate text-[17px] leading-6 font-bold" title={title}>{title}</span>
          {busy && target && <span className="rounded-md border border-control px-2 font-mono text-xs leading-5 font-semibold">→ {shortLabel(target)}</span>}
          {item.phase === "done" && <Badge tone="done">{t("done")}</Badge>}
          {item.phase === "failed" && <Badge tone="failed">{t("failed")}</Badge>}
          {item.phase === "cancelled" && <Badge tone="muted">{t("cancelled")}</Badge>}
        </p>
        {item.phase === "done" && job?.output ? (
          <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[13px] leading-5 text-muted">
            <span>{i.bytes(job.input.size)}</span>
            <IconArrowRight size={14} />
            <span className="font-semibold text-ink">{i.bytes(job.output.size)}</span>
            <Gain i={i} inSize={job.input.size} outSize={job.output.size} />
          </p>
        ) : (
          <p className="m-0 font-mono text-[13px] leading-5 text-muted">{metaParts.join(" · ")}</p>
        )}
      </div>
      {!busy && (
        <button type="button" onClick={p.onRemove} aria-label={t("removeItem", { name: item.file.name })} title={t("remove")}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-ground hover:text-ink">
          <IconX size={20} />
        </button>
      )}
    </div>
  );

  // ---------------- desteklenmeyen ----------------
  if (unsupported) {
    return (
      <li className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
        {header}
        <div className="flex flex-col gap-0.5 rounded-xl bg-warn-soft px-3.5 py-3">
          <p className="m-0 font-bold text-warn-ink">{t("unsupported")}</p>
          <p className="m-0 text-ink">{t("unsupportedHint")}</p>
        </div>
      </li>
    );
  }

  // ---------------- ayar (idle) ----------------
  if (item.phase === "idle") {
    const { primary, more: rest } = splitTargets(item.kind, list, item.target);
    const shown = more ? [...primary, ...rest] : primary;
    const outName = target ? `${safeStem(item.file.name)}.${target.ext}` : "";
    return (
      <li className="overflow-clip rounded-[20px] border border-line bg-surface shadow-[0_1px_0_rgba(22,24,26,0.03),0_16px_40px_-24px_rgba(22,24,26,0.22)]">
        <div className="px-5 pt-5">{header}</div>
        <div className="flex flex-col gap-[22px] p-5">
          <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
            <legend className="mb-2.5 p-0 font-bold">{t("chooseTarget")}</legend>
            <div role="radiogroup" aria-label={t("targetGroup")} className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2">
              {shown.map((x) => {
                const sel = x.id === item.target;
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => p.onSetTarget(x.id)}
                    className={`relative flex min-h-[84px] cursor-pointer flex-col gap-1 rounded-[14px] border-[1.5px] px-3.5 py-3 text-left transition-colors ${
                      sel ? "border-accent bg-accent-tint" : "border-tile-line bg-surface hover:border-control-strong"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2 pr-6">
                      <span className="font-mono text-[15px] leading-[22px] font-semibold">{shortLabel(x)}</span>
                      {x.id === item.recommended && <span className="rounded-md bg-accent-soft px-[7px] text-xs leading-5 font-semibold text-accent-ink">{t("recommended")}</span>}
                    </span>
                    <span className="text-[13px] leading-[18px] text-muted">{targetDesc(x, item.kind, i.lang)}</span>
                    {sel && (
                      <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden="true">
                        <IconCheck size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
              {rest.length > 0 && (
                <button
                  type="button"
                  aria-expanded={more}
                  onClick={() => setMore((m) => !m)}
                  className="flex min-h-[84px] cursor-pointer flex-col justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-control px-3.5 py-3 text-left transition-colors hover:border-control-strong"
                >
                  <span className="font-semibold">{more ? t("fewerFormats") : t("moreFormats")}</span>
                  <span className="font-mono text-[13px] leading-[18px] text-muted">{more ? t("fewerHint") : rest.map(shortLabel).join(" · ")}</span>
                </button>
              )}
            </div>
          </fieldset>

          {target && (
            <div className="border-t border-line-soft pt-5">
              <OptionsForm key={target.id} target={target} values={item.options} showAdvanced={item.showAdvanced} disabled={false} idPrefix={item.localId} i={i} onChange={p.onSetOption} onToggleAdvanced={p.onToggleAdvanced} />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-line-soft bg-surface-2 px-5 py-4 shadow-[0_-12px_24px_-18px_rgba(22,24,26,0.28)]">
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-2 font-mono text-[13px] leading-5 text-muted">
            <span className="truncate">{item.file.name}</span>
            {outName && (
              <>
                <IconArrowRight size={16} />
                <span className="truncate font-semibold text-ink">{outName}</span>
              </>
            )}
          </p>
          <button type="button" onClick={p.onConvert} disabled={!target}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-accent px-6 text-base font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {target ? convertLabel(target, i.lang) : t("chooseTarget")}
            <IconArrowRight size={18} />
          </button>
        </div>
      </li>
    );
  }

  // ---------------- sürüyor ----------------
  if (busy) {
    const pct = item.phase === "uploading" ? item.uploadPct : (job?.progress ?? 0);
    const label = t(item.phase as Key);
    const detail = item.phase === "queued" ? t("waiting") : item.phase === "running" ? eta : "";
    const showPct = item.phase !== "queued" && !indeterminate;
    const sliding = item.phase === "queued" || indeterminate;
    return (
      <li className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5" aria-busy="true">
        {header}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-semibold">{label}</span>
            <span className="font-mono text-[13px] leading-5 text-muted tabular-nums">
              {showPct && <span className="font-semibold text-ink">{i.pct(Math.round(pct))}</span>}
              {showPct && detail ? " · " : ""}
              {detail}
              {indeterminate && <span className="sr-only"> · {t("noDuration")}</span>}
            </span>
          </div>
          <div role="progressbar" aria-label={`${item.file.name}: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={sliding ? undefined : Math.round(pct)}
            className="relative h-2 overflow-hidden rounded-full bg-sunken">
            {sliding ? (
              <div className={`absolute inset-y-0 w-1/3 rounded-full ${item.phase === "queued" ? "bg-control-strong" : "bg-accent"} animate-indeterminate`} />
            ) : (
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, pct)}%` }} />
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={p.onCancel} className={btnSecondary}>{t("cancel")}</button>
        </div>
      </li>
    );
  }

  // ---------------- bitti ----------------
  if (item.phase === "done" && job?.output) {
    const finished = job.finished_at ? new Date(job.finished_at) : new Date();
    const expires = new Date(finished.getTime() + ttlMin * 60_000);
    return (
      <li className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
        {header}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-line-soft pt-4">
          <p className="m-0 text-[13px] leading-5 text-muted">
            {t("source", { name: item.file.name })} · {t("expires", { time: i.time(expires) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={p.onReset} className={btnSecondary}>{t("otherFormat")}</button>
            <a href={api.downloadUrl(job.id)} download={job.output.name} className={btnPrimary}>
              <IconDownload size={18} />
              {t("download")}
            </a>
          </div>
        </div>
      </li>
    );
  }

  // ---------------- hata / iptal ----------------
  const failed = item.phase === "failed";
  const friendly =
    item.errorCode === "too_large" ? t("failTooLarge", { max: maxLabel })
    : item.errorCode === "network" ? t("failNetwork")
    : item.errorCode === "unsupported_media" ? t("failUnsupportedMedia")
    : item.errorCode && item.errorCode !== "job" ? t("failRejected")
    : t("failGeneric");
  return (
    <li className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
      {header}
      {failed && (
        <div role="alert" className="flex flex-col gap-1 rounded-xl bg-danger-soft px-3.5 py-3">
          <p className="m-0 text-ink">{friendly}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {failed && item.error ? (
          <details className="min-w-0 text-[13px] leading-5 text-muted">
            <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-ink">
              <IconChevronRight size={16} className="details-chevron" />
              {t("technical")}
            </summary>
            <code className="mt-1 block rounded-lg bg-ground px-2.5 py-2 font-mono break-words whitespace-pre-wrap text-ink">{item.error}</code>
          </details>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={p.onRemove} className={btnGhost}>{t("remove")}</button>
          <button type="button" onClick={p.onRetry} className={btnSecondary}>
            <IconRetry size={18} />
            {t("retry")}
          </button>
        </div>
      </div>
    </li>
  );
}

function Gain({ i, inSize, outSize }: { i: I18n; inSize: number; outSize: number }) {
  if (inSize <= 0) return null;
  const d = 1 - outSize / inSize;
  if (Math.abs(d) < 0.005) return <span>· {i.t("sameSize")}</span>;
  const p = i.pct(Math.round(Math.abs(d) * 100));
  return d > 0 ? <span className="font-semibold text-accent-ink">· {i.t("smaller", { p })}</span> : <span className="font-semibold text-warn-ink">· {i.t("larger", { p })}</span>;
}
