import { useRef, useState, type DragEvent } from "react";
import type { Key } from "../i18n";

interface Props {
  t: (k: Key) => string;
  maxLabel: string;
  compact: boolean;
  onFiles: (files: File[]) => void;
}

export default function DropZone({ t, maxLabel, compact, onFiles }: Props) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${t("drop")} ${t("or")} ${t("choose")}`}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handle}
      className={`cursor-pointer rounded-2xl border-2 border-dashed text-center transition-colors ${compact ? "px-6 py-5" : "px-6 py-14"} ${
        over ? "border-brand bg-brand-soft/60 dark:bg-brand/10" : "border-neutral-300 bg-white hover:border-brand dark:border-neutral-700 dark:bg-neutral-900"
      }`}
    >
      <input ref={input} type="file" multiple accept="image/*,video/*,audio/*,.heic,.heif,.avif,.mkv,.opus,.flac,.qoi" className="sr-only" tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }} />
      <div className={`mx-auto flex items-center justify-center rounded-full bg-brand-soft text-brand-strong dark:bg-brand/15 dark:text-brand ${compact ? "mb-2 size-9 text-lg" : "mb-4 size-14 text-2xl"}`} aria-hidden>
        ⇅
      </div>
      <p className={compact ? "text-sm font-medium" : "text-lg font-medium"}>
        {t("drop")} <span className="text-neutral-500">{t("or")}</span> <span className="text-brand underline-offset-2 hover:underline">{t("choose")}</span>
      </p>
      {!compact && (
        <p className="mt-2 text-sm text-neutral-500">
          {t("hint")} {maxLabel}
        </p>
      )}
    </div>
  );
}
