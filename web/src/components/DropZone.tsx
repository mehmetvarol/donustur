import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { I18n } from "../i18n";
import { IconPlus, IconUpload } from "./Icons";

interface Props {
  i: I18n;
  maxLabel: string;
  variant: "hero" | "strip";
  onFiles: (files: File[]) => void;
}

const ACCEPT = "image/*,video/*,audio/*,.heic,.heif,.avif,.mkv,.opus,.flac,.qoi";

export default function DropZone({ i, maxLabel, variant, onFiles }: Props) {
  const { t } = i;
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const open = () => input.current?.click();
  const drag = {
    onDragEnter: (e: DragEvent) => {
      e.preventDefault();
      depth.current++;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) onFiles(files);
    },
  };

  const picker: ReactNode = (
    <input
      ref={input}
      type="file"
      multiple
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length) onFiles(files);
        e.target.value = "";
      }}
    />
  );

  const ring = over ? "border-accent bg-accent-tint" : "border-control-strong bg-surface";

  if (variant === "strip") {
    return (
      <div {...drag} className={`flex flex-wrap items-center gap-4 rounded-2xl border-[1.5px] border-dashed py-3.5 pr-4 pl-5 transition-colors ${ring}`}>
        {picker}
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <IconUpload size={20} />
        </span>
        <p className="m-0 min-w-0 flex-[1_1_240px]">
          {over ? (
            <strong className="font-semibold">{t("dropActive")}</strong>
          ) : (
            <>
              <strong className="font-semibold">{t("addMoreTitle")}</strong> <span className="text-muted">{t("addMoreText", { max: maxLabel })}</span>
            </>
          )}
        </p>
        <button type="button" onClick={open} className="h-11 cursor-pointer rounded-xl border border-control bg-surface px-[18px] font-semibold text-ink transition-colors hover:border-control-strong hover:bg-surface-2">
          {t("choose")}
        </button>
      </div>
    );
  }

  return (
    <div
      {...drag}
      onClick={(e) => {
        if (e.target === e.currentTarget) open();
      }}
      className={`flex cursor-pointer flex-col items-center gap-[18px] rounded-3xl border-[1.5px] border-dashed px-8 py-14 text-center shadow-[0_1px_0_rgba(22,24,26,0.03),0_12px_32px_-16px_rgba(22,24,26,0.18)] transition-colors ${ring}`}
    >
      {picker}
      <span className={`pointer-events-none flex size-[72px] items-center justify-center rounded-[20px] transition-colors ${over ? "bg-accent text-on-accent" : "bg-accent-soft text-accent-ink"}`}>
        <IconUpload size={32} />
      </span>
      <div className="pointer-events-none flex flex-col gap-1">
        <p className="m-0 font-display text-[26px] leading-8 font-semibold tracking-[-0.02em]">{over ? t("dropActive") : t("dropTitle")}</p>
        <p className="m-0 text-muted">{t("dropOr")}</p>
      </div>
      <button type="button" onClick={open} className="inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-xl bg-accent px-7 text-base font-semibold text-on-accent transition-colors hover:bg-accent-hover">
        <IconPlus size={18} />
        {t("choose")}
      </button>
      <p className="pointer-events-none m-0 mt-1 text-[13px] leading-5 text-muted text-pretty">{t("dropHint", { max: maxLabel })}</p>
    </div>
  );
}
