import { useState } from "react";
import { api, setToken } from "../api";
import type { I18n } from "../i18n";
import { IconAlert, IconEye, IconEyeOff, IconLock } from "./Icons";

export default function PasswordGate({ i, onOk }: { i: I18n; onOk: () => void }) {
  const { t } = i;
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex flex-1 flex-col items-center gap-7 px-4 py-[clamp(40px,8vw,96px)]">
      <form
        className="box-border flex w-full max-w-[400px] flex-col gap-5 rounded-[22px] border border-line bg-surface p-8 shadow-[0_1px_0_rgba(22,24,26,0.03),0_16px_40px_-24px_rgba(22,24,26,0.25)]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await api.checkPassword(pw).catch(() => false);
          setBusy(false);
          if (ok) {
            setToken(pw);
            onOk();
          } else setErr(true);
        }}
      >
        <div className="flex flex-col gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <IconLock size={22} />
          </span>
          <h1 className="m-0 font-display text-[26px] leading-8 font-semibold tracking-[-0.02em]">{t("passwordTitle")}</h1>
          <p className="m-0 text-muted text-pretty">{t("passwordHint")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw" className="text-[13px] leading-[18px] font-bold">
            {t("password")}
          </label>
          <div className="relative">
            <input
              id="pw"
              type={show ? "text" : "password"}
              autoFocus
              autoComplete="current-password"
              value={pw}
              aria-invalid={err}
              aria-describedby={err ? "pw-err" : undefined}
              onChange={(e) => {
                setPw(e.target.value);
                setErr(false);
              }}
              className={`box-border h-12 w-full rounded-xl border-[1.5px] bg-surface pr-[52px] pl-3.5 font-mono text-base text-ink ${err ? "border-danger" : "border-control-strong"}`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? t("hidePassword") : t("showPassword")}
              aria-pressed={show}
              className="absolute top-0.5 right-0.5 flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:text-ink"
            >
              {show ? <IconEyeOff size={20} /> : <IconEye size={20} />}
            </button>
          </div>
          {err && (
            <p id="pw-err" role="alert" className="m-0 flex items-start gap-2 text-[13px] leading-5 text-danger-ink">
              <IconAlert size={16} className="mt-0.5 shrink-0" />
              {t("wrongPassword")}
            </p>
          )}
        </div>

        <button type="submit" disabled={busy || !pw} className="h-12 cursor-pointer rounded-xl bg-accent text-base font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? t("checking") : t("enter")}
        </button>
      </form>
      <p className="m-0 text-center text-[13px] leading-5 text-muted">{t("askAdmin")}</p>
    </main>
  );
}
