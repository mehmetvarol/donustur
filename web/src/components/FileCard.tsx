import { useEffect, useState } from "react";
import { api, fmtBytes, fmtDuration, type Target } from "../api";
import type { Key } from "../i18n";
import { targetsFor, type Item } from "../state";
import OptionsForm from "./OptionsForm";

interface Props {
  item: Item;
  targets: Target[];
  t: (k: Key, vars?: Record<string, string | number>) => string;
  onSetTarget: (id: string) => void;
  onSetOption: (key: string, value: unknown) => void;
  onToggleAdvanced: () => void;
  onConvert: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onReset: () => void;
}

const kindIcon: Record<string, string> = { image: "🖼", video: "🎬", audio: "🎧" };

function Preview({ item }: { item: Item }) {
  const cls = "size-16 shrink-0 rounded-lg object-cover bg-neutral-200 dark:bg-neutral-800";
  if (item.previewUrl && item.kind === "image") return <img src={item.previewUrl} alt="" className={cls} />;
  if (item.previewUrl && item.kind === "video") return <video src={item.previewUrl} muted preload="metadata" className={cls} aria-hidden />;
  return (
    <div className={`${cls} flex items-center justify-center text-2xl`} aria-hidden>
      {kindIcon[item.kind ?? ""] ?? "📄"}
    </div>
  );
}

function useEta(item: Item): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (item.phase !== "running") return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [item.phase]);
  if (item.phase !== "running" || !item.job?.started_at) return "";
  const p = item.job.progress;
  if (p < 3) return "";
  const elapsed = (Date.now() - new Date(item.job.started_at).getTime()) / 1000;
  const remain = Math.max(0, (elapsed / p) * (100 - p));
  return remain < 1 ? "" : fmtDuration(Math.round(remain));
}

export default function FileCard({ item, targets, t, onSetTarget, onSetOption, onToggleAdvanced, onConvert, onCancel, onRemove, onReset }: Props) {
  const list = targetsFor(item.kind, targets);
  const target = targets.find((x) => x.id === item.target);
  const busy = item.phase === "uploading" || item.phase === "queued" || item.phase === "running";
  const eta = useEta(item);
  const job = item.job;

  const pct = item.phase === "uploading" ? item.uploadPct : job?.progress ?? 0;
  const phaseLabel: Record<Item["phase"], string> = {
    idle: "",
    uploading: t("uploading"),
    queued: t("queued"),
    running: t("running"),
    done: t("done"),
    failed: t("failed"),
    cancelled: t("cancelled"),
  };

  const meta: string[] = [fmtBytes(item.file.size)];
  if (job?.input.width && job.input.height) meta.push(`${job.input.width}×${job.input.height}`);
  if (job?.input.duration) meta.push(fmtDuration(job.input.duration));
  if (job?.input.codec) meta.push(job.input.codec);

  let gain: string | null = null;
  if (job?.output && job.input.size > 0) {
    const d = 1 - job.output.size / job.input.size;
    gain = d >= 0 ? `−${Math.round(d * 100)}% ${t("saved")}` : `+${Math.round(-d * 100)}% ${t("grew")}`;
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900" aria-busy={busy}>
      <div className="flex gap-4">
        <Preview item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium" title={item.file.name}>{item.file.name}</p>
              <p className="text-xs text-neutral-500">{meta.join(" • ")}</p>
            </div>
            <button type="button" onClick={onRemove} aria-label={t("remove")} title={t("remove")}
              className="shrink-0 rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800">
              ✕
            </button>
          </div>

          {item.error === "unsupported" || list.length === 0 ? (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">{t("unsupported")}</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor={`${item.localId}-target`} className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{t("target")}</label>
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-labelledby={`${item.localId}-target`}>
                  {list.map((x) => {
                    const sel = x.id === item.target;
                    return (
                      <button key={x.id} type="button" role="radio" aria-checked={sel} disabled={busy || item.phase === "done"} onClick={() => onSetTarget(x.id)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${sel ? "border-brand bg-brand text-white" : "border-neutral-300 hover:border-brand hover:text-brand dark:border-neutral-700"}`}>
                        {x.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {target && item.phase === "idle" && (
                <div className="mt-3">
                  <OptionsForm target={target} values={item.options} showAdvanced={item.showAdvanced} disabled={busy} idPrefix={item.localId} t={t} onChange={onSetOption} onToggleAdvanced={onToggleAdvanced} />
                </div>
              )}
            </>
          )}

          {item.phase !== "idle" && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className={item.phase === "failed" ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}>
                  {phaseLabel[item.phase]}
                  {item.phase === "running" && eta ? ` • ${eta} ${t("remaining")}` : ""}
                </span>
                {busy && <span className="font-mono tabular-nums text-neutral-500">{Math.round(pct)}%</span>}
              </div>
              {busy && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <div className={`h-full rounded-full bg-brand transition-[width] duration-300 ${item.phase === "queued" ? "animate-pulse-soft" : ""}`} style={{ width: `${item.phase === "queued" ? 100 : Math.max(2, pct)}%` }} />
                </div>
              )}
              {item.phase === "failed" && item.error && item.error !== "unsupported" && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{item.error}</p>
              )}
              {item.phase === "done" && job?.output && (
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium">{job.output.name}</span> • {fmtBytes(job.output.size)} {gain && <span className={gain.startsWith("−") ? "text-brand-strong dark:text-brand" : "text-amber-700 dark:text-amber-400"}>• {gain}</span>}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {item.phase === "idle" && list.length > 0 && (
              <button type="button" onClick={onConvert} disabled={!item.target}
                className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50">
                {t("convert")}
              </button>
            )}
            {busy && (
              <button type="button" onClick={onCancel} className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                {t("cancel")}
              </button>
            )}
            {item.phase === "done" && job && (
              <>
                <a href={api.downloadUrl(job.id)} download={job.output?.name} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-strong">
                  {t("download")}
                </a>
                <button type="button" onClick={onReset} className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                  {t("again")}
                </button>
              </>
            )}
            {(item.phase === "failed" || item.phase === "cancelled") && (
              <button type="button" onClick={onReset} className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                {t("again")}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
