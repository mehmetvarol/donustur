import { useState, type ReactNode } from "react";
import type { OptionSpec, Target } from "../api";
import type { I18n } from "../i18n";
import { invertedQuality, isQualityKey, noQualityNote, optHelp, optLabel, valueLabel } from "../meta";
import { IconChevronRight } from "./Icons";

interface Props {
  target: Target;
  values: Record<string, unknown>;
  showAdvanced: boolean;
  disabled: boolean;
  idPrefix: string;
  i: I18n;
  onChange: (key: string, value: unknown) => void;
  onToggleAdvanced: () => void;
}

type NumSpec = Extract<OptionSpec, { type: "int" | "float" }>;

const numOf = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const inputCls =
  "box-border h-11 w-full rounded-[10px] border border-control-strong bg-surface px-3 text-[15px] text-ink disabled:cursor-not-allowed disabled:opacity-50";
const chipCls = (sel: boolean) =>
  `h-10 cursor-pointer rounded-[10px] border-[1.5px] px-3.5 font-mono text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    sel ? "border-ink bg-ink text-ground" : "border-tile-line bg-surface text-ink hover:border-control-strong"
  }`;

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-[10px] bg-ground px-3 py-2 text-[13px] leading-5 text-ink">{children}</p>;
}

// ---------- kalite kaydırıcısı: sol = küçük dosya, sağ = yüksek kalite ----------
function QualityField({ spec, target, value, disabled, id, i, lossless, onChange }: { spec: NumSpec; target: Target; value: unknown; disabled: boolean; id: string; i: I18n; lossless: boolean; onChange: (v: number) => void }) {
  const { t } = i;
  const v = numOf(value, spec.default);
  const inv = invertedQuality(spec.key);
  const pos = inv ? spec.max + spec.min - v : v;
  const help = optHelp(spec, target, i.lang);
  let hint = help;
  if (lossless) hint = t("losslessOn");
  else if (spec.key === "quality" && target.kind === "image") {
    hint = v >= 90 ? t("qHint90") : v >= 70 ? t("qHint70") : v >= 45 ? t("qHint45") : t("qHintLow");
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-bold">{optLabel(spec, target, i.lang)}</label>
        <span className="font-mono font-semibold tabular-nums">{inv ? `CRF ${v}` : i.num(v)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={pos}
        disabled={disabled || lossless}
        aria-describedby={hint ? `${id}-hint` : undefined}
        aria-valuetext={inv ? `CRF ${v}` : String(v)}
        className="m-0 h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(e) => {
          const p = spec.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          onChange(inv ? spec.max + spec.min - p : p);
        }}
      />
      <div className="flex justify-between text-[13px] leading-[18px] text-muted" aria-hidden="true">
        <span>{t("qualitySmall")}</span>
        <span>{t("qualityHigh")}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="m-0 rounded-[10px] bg-ground px-3 py-2 text-[13px] leading-5 text-ink">
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------- görsel boyutu: uzun kenar ön ayarları ----------
const PRESETS = [2560, 1920, 1280];

function SizeField({ target, values, disabled, idPrefix, i, onChange }: { target: Target; values: Record<string, unknown>; disabled: boolean; idPrefix: string; i: I18n; onChange: (k: string, v: unknown) => void }) {
  const { t } = i;
  const w = numOf(values.width, 0);
  const h = numOf(values.height, 0);
  const fit = String(values.fit ?? "contain");
  const derived = w === 0 && h === 0 ? "orig" : w === h && PRESETS.includes(w) && fit === "contain" ? String(w) : "custom";
  const [custom, setCustom] = useState(derived === "custom");
  const mode = custom ? "custom" : derived;
  const presetsOk = fit === "contain";
  const wSpec = target.options.find((o) => o.key === "width") as NumSpec | undefined;
  const hSpec = target.options.find((o) => o.key === "height") as NumSpec | undefined;

  const choose = (m: string) => {
    if (m === "custom") return setCustom(true);
    setCustom(false);
    const n = m === "orig" ? 0 : Number(m);
    onChange("width", n);
    onChange("height", n);
  };
  const chips: [string, string][] = [["orig", t("sizeOriginal")], ...PRESETS.map((p): [string, string] => [String(p), `${p} px`]), ["custom", t("sizeCustom")]];
  const hint = mode === "custom" ? t("sizeHintCustom") : values.upscale ? t("sizeHintUpscale") : t("sizeHint");

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
      <legend className="mb-2.5 p-0 font-bold">
        {t("sizeLabel")} <span className="font-normal text-muted">· {t("sizeSub")}</span>
      </legend>
      <div role="radiogroup" aria-label={t("sizeLabel")} className="flex flex-wrap gap-1.5">
        {chips.map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={disabled || (!presetsOk && m !== "custom" && m !== "orig")}
            onClick={() => choose(m)}
            className={chipCls(mode === m)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "custom" && wSpec && hSpec && (
        <div className="grid grid-cols-2 gap-3">
          {[wSpec, hSpec].map((s) => (
            <div key={s.key} className="flex flex-col gap-1.5">
              <label htmlFor={`${idPrefix}-${s.key}`} className="text-[13px] leading-[18px] font-bold">{optLabel(s, target, i.lang)}</label>
              <input
                id={`${idPrefix}-${s.key}`}
                type="number"
                inputMode="numeric"
                min={s.min}
                max={s.max}
                step={s.step}
                value={numOf(values[s.key], s.default)}
                disabled={disabled}
                className={`${inputCls} font-mono`}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  onChange(s.key, Number.isNaN(v) ? 0 : Math.min(s.max, Math.max(s.min, v)));
                }}
              />
            </div>
          ))}
        </div>
      )}
      <p className="m-0 text-[13px] leading-5 text-muted">{hint}</p>
    </fieldset>
  );
}

// ---------- genel alanlar ----------
function Field({ spec, target, value, disabled, id, i, compact, onChange }: { spec: OptionSpec; target: Target; value: unknown; disabled: boolean; id: string; i: I18n; compact: boolean; onChange: (v: unknown) => void }) {
  const label = optLabel(spec, target, i.lang);
  const help = optHelp(spec, target, i.lang);
  const helpEl = help ? <span id={`${id}-help`} className="text-[13px] leading-5 text-muted">{help}</span> : null;
  const describedBy = help ? `${id}-help` : undefined;

  switch (spec.type) {
    case "int":
    case "float": {
      const v = numOf(value, spec.default);
      const slider = !compact && spec.max - spec.min <= 200;
      const parse = (s: string) => (spec.type === "int" ? parseInt(s, 10) : parseFloat(s));
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={id} className={compact ? "text-[13px] leading-[18px] font-bold" : "font-bold"}>{label}</label>
            {slider && <span className="font-mono font-semibold tabular-nums">{i.num(v, 2)}</span>}
          </div>
          {slider ? (
            <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={v} disabled={disabled} aria-describedby={describedBy}
              className="m-0 h-6 w-full cursor-pointer disabled:opacity-50"
              onChange={(e) => onChange(parse(e.target.value))} />
          ) : (
            <input id={id} type="number" inputMode="decimal" min={spec.min} max={spec.max} step={spec.step} value={v} disabled={disabled} aria-describedby={describedBy}
              className={`${inputCls} font-mono`}
              onChange={(e) => {
                const n = parse(e.target.value);
                if (!Number.isNaN(n)) onChange(Math.min(spec.max, Math.max(spec.min, n)));
              }} />
          )}
          {helpEl}
        </div>
      );
    }
    case "enum": {
      const cur = String(value ?? spec.default);
      if (!compact) {
        return (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" aria-describedby={describedBy}>
            <legend className="mb-2 p-0 font-bold">{label}</legend>
            <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
              {spec.values.map((x) => (
                <button key={x} type="button" role="radio" aria-checked={cur === x} disabled={disabled} onClick={() => onChange(x)} className={chipCls(cur === x)}>
                  {valueLabel(spec.key, x, i.lang, i.num)}
                </button>
              ))}
            </div>
            {helpEl}
          </fieldset>
        );
      }
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-[13px] leading-[18px] font-bold">{label}</label>
          <select id={id} value={cur} disabled={disabled} aria-describedby={describedBy} className={inputCls} onChange={(e) => onChange(e.target.value)}>
            {spec.values.map((x) => (
              <option key={x} value={x}>{valueLabel(spec.key, x, i.lang, i.num)}</option>
            ))}
          </select>
          {helpEl}
        </div>
      );
    }
    case "bool":
      return (
        <label className={`flex cursor-pointer items-start gap-2.5 ${compact ? "pt-6" : ""}`}>
          <input type="checkbox" checked={Boolean(value ?? spec.default)} disabled={disabled} aria-describedby={describedBy}
            className="mt-0.5 size-5 shrink-0 cursor-pointer" onChange={(e) => onChange(e.target.checked)} />
          <span className="flex flex-col">
            <span className="font-semibold">{label}</span>
            {helpEl}
          </span>
        </label>
      );
    case "color": {
      const c = String(value ?? spec.default);
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-[13px] leading-[18px] font-bold">{label}</label>
          <div className="flex items-center gap-2.5">
            <input id={id} type="color" value={c} disabled={disabled} aria-describedby={describedBy}
              className="h-11 w-14 cursor-pointer rounded-[10px] border border-control-strong bg-surface p-1" onChange={(e) => onChange(e.target.value)} />
            <span className="font-mono text-[13px] text-muted uppercase">{c}</span>
          </div>
          {helpEl}
        </div>
      );
    }
  }
}

export default function OptionsForm({ target, values, showAdvanced, disabled, idPrefix, i, onChange, onToggleAdvanced }: Props) {
  const { t } = i;
  const isImage = target.kind === "image";
  const hasSize = isImage && target.options.some((o) => o.key === "width") && target.options.some((o) => o.key === "height");
  const basic = target.options.filter((o) => !o.advanced && !(hasSize && (o.key === "width" || o.key === "height")));
  const adv = target.options.filter((o) => o.advanced);
  const quality = basic.find((o) => isQualityKey(o.key) && (o.type === "int" || o.type === "float")) as NumSpec | undefined;
  const rest = basic.filter((o) => o !== quality);
  const nq = !quality ? noQualityNote(target.id, i.lang) : undefined;
  const lossless = Boolean(values.lossless);
  const advId = `${idPrefix}-adv`;

  const cells: ReactNode[] = [];
  if (quality) {
    cells.push(<QualityField key="q" spec={quality} target={target} value={values[quality.key]} disabled={disabled} id={`${idPrefix}-${quality.key}`} i={i} lossless={lossless} onChange={(v) => onChange(quality.key, v)} />);
  } else if (nq) {
    cells.push(
      <div key="nq" className="flex flex-col gap-1.5">
        <span className="font-bold">{i.lang === "tr" ? "Kalite" : "Quality"}</span>
        <Note>{nq}</Note>
      </div>,
    );
  }
  if (hasSize) cells.push(<SizeField key="size" target={target} values={values} disabled={disabled} idPrefix={idPrefix} i={i} onChange={onChange} />);
  for (const s of rest) {
    cells.push(<Field key={s.key} spec={s} target={target} value={values[s.key]} disabled={disabled} id={`${idPrefix}-${s.key}`} i={i} compact={false} onChange={(v) => onChange(s.key, v)} />);
  }

  return (
    <div className="flex flex-col gap-5">
      {cells.length > 0 && <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">{cells}</div>}
      {adv.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={showAdvanced}
            aria-controls={advId}
            onClick={onToggleAdvanced}
            className="-ml-1.5 inline-flex h-10 cursor-pointer items-center gap-1.5 self-start rounded-[10px] pr-2.5 pl-1.5 text-left font-semibold text-ink hover:bg-ground"
          >
            <IconChevronRight size={18} className={`shrink-0 transition-transform duration-150 ${showAdvanced ? "rotate-90" : ""}`} />
            {t("advanced")}
            <span className="hidden font-normal text-muted sm:inline">
              · {adv.slice(0, 3).map((s) => optLabel(s, target, i.lang).replace(/\s*\(.*\)$/, "").toLocaleLowerCase(i.lang === "tr" ? "tr-TR" : "en-US")).join(", ")}
            </span>
          </button>
          {showAdvanced && (
            <div id={advId} className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-6 gap-y-4 rounded-[14px] border border-line-soft bg-surface-2 p-4">
              {adv.map((s) => (
                <Field key={s.key} spec={s} target={target} value={values[s.key]} disabled={disabled} id={`${idPrefix}-${s.key}`} i={i} compact onChange={(v) => onChange(s.key, v)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
