import type { ReactNode } from "react";
import type { Health } from "../api";
import type { I18n } from "../i18n";
import { IconClock, IconLock, IconRetry } from "./Icons";

interface Props {
  i: I18n;
  health: Health | null;
  offline: boolean;
  maxLabel: string;
}

export default function Aside({ i, health, offline, maxLabel }: Props) {
  const { t } = i;
  const ttl = health?.ttl_min ?? 60;
  const rows: [string, ReactNode][] = [];
  rows.push([
    t("srvStatus"),
    <span className="flex items-center gap-2 font-semibold">
      <span className={`size-2 rounded-full ${offline ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />
      {offline ? t("srvOffline") : t("srvRunning")}
    </span>,
  ]);
  if (health) {
    rows.push([t("srvVersion"), <span className="font-mono text-[13px]">{health.version}</span>]);
    rows.push(["ffmpeg", <span className="font-mono text-[13px]">{health.ffmpeg ?? "–"}</span>]);
    rows.push([t("srvAccel"), health.hwaccel ? t("on") : t("off")]);
    rows.push([t("srvHeic"), health.heic ? t("on") : t("off")]);
    rows.push([t("srvQueue"), t("srvQueueVal", { r: health.running, q: health.queued })]);
    rows.push([t("srvConcurrency"), <span className="font-mono text-[13px] tabular-nums">{health.running} / {health.workers}</span>]);
    rows.push([t("srvLimit"), t("srvLimitVal", { max: maxLabel })]);
  }

  return (
    <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4" aria-label={t("asideServerTitle")}>
      <section className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-5">
        <h2 className="m-0 font-display text-[19px] leading-[26px] font-semibold tracking-[-0.01em]">{t("asideFilesTitle")}</h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <li className="flex items-start gap-3">
            <IconLock size={20} className="mt-0.5 shrink-0 text-accent" />
            <span>{t("asideLocal")}</span>
          </li>
          <li className="flex items-start gap-3">
            <IconClock size={20} className="mt-0.5 shrink-0 text-accent" />
            <span>{t("asideTtl", { n: ttl })}</span>
          </li>
          <li className="flex items-start gap-3">
            <IconRetry size={20} className="mt-0.5 shrink-0 text-accent" />
            <span>{t("asideRefresh")}</span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-5">
        <h2 className="m-0 font-display text-[19px] leading-[26px] font-semibold tracking-[-0.01em]">{t("asideServerTitle")}</h2>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm leading-5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
