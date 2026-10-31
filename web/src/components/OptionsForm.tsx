import type { OptionSpec, Target } from "../api";
import type { Key } from "../i18n";

interface Props {
  target: Target;
  values: Record<string, unknown>;
  showAdvanced: boolean;
  disabled: boolean;
  idPrefix: string;
  t: (k: Key) => string;
  onChange: (key: string, value: unknown) => void;
  onToggleAdvanced: () => void;
}

const inputCls =
  "h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

function Field({ spec, value, disabled, id, onChange }: { spec: OptionSpec; value: unknown; disabled: boolean; id: string; onChange: (v: unknown) => void }) {
  const label = (
    <label htmlFor={id} className="text-xs font-medium text-neutral-600 dark:text-neutral-400" title={spec.help}>
      {spec.label}
    </label>
  );
  switch (spec.type) {
    case "int":
    case "float": {
      const num = typeof value === "number" ? value : spec.default;
      const wide = spec.max - spec.min <= 200; // kaydırıcı yalnız küçük aralıklarda anlamlı
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            {label}
            <span className="font-mono text-xs tabular-nums text-neutral-500">{num}</span>
          </div>
          {wide ? (
            <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={num} disabled={disabled} aria-describedby={spec.help ? `${id}-help` : undefined}
              onChange={(e) => onChange(spec.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))} />
          ) : (
            <input id={id} type="number" min={spec.min} max={spec.max} step={spec.step} value={num} disabled={disabled} className={inputCls}
              onChange={(e) => { const v = spec.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(Math.min(spec.max, Math.max(spec.min, v))); }} />
          )}
          {spec.help && <span id={`${id}-help`} className="text-[11px] text-neutral-500">{spec.help}</span>}
        </div>
      );
    }
    case "enum":
      return (
        <div className="flex flex-col gap-1">
          {label}
          <select id={id} value={String(value ?? spec.default)} disabled={disabled} className={inputCls} onChange={(e) => onChange(e.target.value)}>
            {spec.values.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {spec.help && <span className="text-[11px] text-neutral-500">{spec.help}</span>}
        </div>
      );
    case "bool":
      return (
        <div className="flex items-center gap-2 pt-5">
          <input id={id} type="checkbox" checked={Boolean(value ?? spec.default)} disabled={disabled} className="size-4 accent-brand" onChange={(e) => onChange(e.target.checked)} />
          <label htmlFor={id} className="text-sm" title={spec.help}>{spec.label}</label>
        </div>
      );
    case "color":
      return (
        <div className="flex flex-col gap-1">
          {label}
          <div className="flex items-center gap-2">
            <input id={id} type="color" value={String(value ?? spec.default)} disabled={disabled} className="h-8 w-10 cursor-pointer rounded border border-neutral-300 bg-transparent dark:border-neutral-700" onChange={(e) => onChange(e.target.value)} />
            <span className="font-mono text-xs text-neutral-500">{String(value ?? spec.default)}</span>
          </div>
        </div>
      );
  }
}

export default function OptionsForm({ target, values, showAdvanced, disabled, idPrefix, t, onChange, onToggleAdvanced }: Props) {
  const basic = target.options.filter((o) => !o.advanced);
  const adv = target.options.filter((o) => o.advanced);
  return (
    <div className="flex flex-col gap-3">
      {basic.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {basic.map((s) => (
            <Field key={s.key} spec={s} value={values[s.key]} disabled={disabled} id={`${idPrefix}-${s.key}`} onChange={(v) => onChange(s.key, v)} />
          ))}
        </div>
      )}
      {adv.length > 0 && (
        <div>
          <button type="button" aria-expanded={showAdvanced} onClick={onToggleAdvanced}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-brand dark:text-neutral-400">
            <span aria-hidden className={`inline-block transition-transform ${showAdvanced ? "rotate-90" : ""}`}>▸</span>
            {t("advanced")}
          </button>
          {showAdvanced && (
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-dashed border-neutral-300 p-3 sm:grid-cols-3 dark:border-neutral-700">
              {adv.map((s) => (
                <Field key={s.key} spec={s} value={values[s.key]} disabled={disabled} id={`${idPrefix}-${s.key}`} onChange={(v) => onChange(s.key, v)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
