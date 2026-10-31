import type { Health, Kind, Target } from "../api";
import type { I18n, Key } from "../i18n";
import { shortLabel } from "../meta";
import DropZone from "./DropZone";
import { IconClock, IconLock, IconSliders, KindIcon } from "./Icons";

interface Props {
  i: I18n;
  health: Health | null;
  targets: Target[];
  maxLabel: string;
  onFiles: (files: File[]) => void;
}

const KINDS: Kind[] = ["image", "video", "audio"];
const LEAD: Record<Kind, string> = { image: "webp", video: "mp4", audio: "mp3" };

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-control-strong font-mono text-[13px] font-semibold">{n}</span>
      <span className="pt-0.5">
        <strong className="font-semibold">{title}</strong> <span className="text-muted">{text}</span>
      </span>
    </li>
  );
}

export default function Start({ i, health, targets, maxLabel, onFiles }: Props) {
  const { t } = i;
  const ttl = health?.ttl_min ?? 60;

  const note = (kind: Kind, any: boolean): string => {
    if (!any && kind !== "image") return t("noFfmpeg");
    if (kind === "image") return t(health?.heic === false ? "noteImageNoHeic" : "noteImageHeic");
    if (kind === "video") return t(health?.hwaccel ? "noteVideoHw" : "noteVideo");
    return t("noteAudio");
  };

  return (
    <main className="mx-auto box-border w-full max-w-[1200px] flex-1 px-[clamp(16px,4vw,48px)] pt-[clamp(40px,7vw,72px)]">
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-center gap-14">
        <div className="flex flex-col gap-7">
          <h1 className="m-0 font-display text-[clamp(38px,5vw,58px)] leading-[1.04] font-semibold tracking-[-0.035em] text-balance">{t("heroTitle")}</h1>
          <p className="m-0 max-w-[32em] text-lg leading-7 text-muted text-pretty">{t("heroText")}</p>
          <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
            <Step n={1} title={t("step1Title")} text={t("step1Text")} />
            <Step n={2} title={t("step2Title")} text={t("step2Text")} />
            <Step n={3} title={t("step3Title")} text={t("step3Text", { n: ttl })} />
          </ol>
        </div>
        <DropZone i={i} maxLabel={maxLabel} variant="hero" onFiles={onFiles} />
      </section>

      <section className="mt-[clamp(64px,9vw,104px)] flex flex-col gap-6" aria-labelledby="what-title">
        <div className="flex flex-col gap-1.5">
          <h2 id="what-title" className="m-0 font-display text-[30px] leading-9 font-semibold tracking-[-0.02em]">{t("whatTitle")}</h2>
          <p className="m-0 max-w-[44em] text-muted">{t("whatText")}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
          {KINDS.map((kind) => {
            const all = targets.filter((x) => x.kind === kind);
            const avail = all.filter((x) => x.available);
            return (
              <article key={kind} className="flex flex-col gap-[18px] rounded-[18px] border border-line bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-ground text-ink">
                    <KindIcon kind={kind} size={22} />
                  </span>
                  <div>
                    <h3 className="m-0 text-[17px] leading-6 font-bold">{t(`kind_${kind}` as Key)}</h3>
                    <p className="m-0 text-[13px] leading-5 text-muted">{t(`kind_${kind}_sub` as Key)}</p>
                  </div>
                </div>
                {all.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] leading-[18px] font-semibold text-muted">{t("convertsTo")}</span>
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                      {all.map((x) => (
                        <li
                          key={x.id}
                          className={`rounded-lg px-[9px] font-mono text-[13px] leading-5 font-medium ${
                            x.id === LEAD[kind] && x.available ? "bg-accent-soft py-[3px] text-accent-ink" : "border border-line bg-ground py-0.5"
                          } ${x.available ? "" : "opacity-60"}`}
                        >
                          {shortLabel(x)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="m-0 mt-auto border-t border-line-soft pt-3.5 text-[13px] leading-5 text-muted">{note(kind, avail.length > 0)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-[clamp(56px,8vw,88px)] grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-8 border-t border-line pt-10">
        {[
          { icon: <IconLock size={20} />, title: t("trust1Title"), text: t("trust1Text") },
          { icon: <IconClock size={20} />, title: t("trust2Title"), text: t("trust2Text", { n: ttl }) },
          { icon: <IconSliders size={20} />, title: t("trust3Title"), text: t("trust3Text") },
        ].map((x) => (
          <div key={x.title} className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{x.icon}</span>
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-[17px] leading-6 font-bold">{x.title}</h3>
              <p className="m-0 text-muted text-pretty">{x.text}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
