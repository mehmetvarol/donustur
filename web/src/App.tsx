import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiError, api, loadToken, setToken, type Health, type JobView, type Target } from "./api";
import Aside from "./components/Aside";
import DropZone from "./components/DropZone";
import FileCard from "./components/FileCard";
import { IconAlert, IconCheck, IconLogo } from "./components/Icons";
import PasswordGate from "./components/PasswordGate";
import Start from "./components/Start";
import { detectLang, makeI18n, type I18n, type Lang } from "./i18n";
import { reducer, type Item } from "./state";

const container = "mx-auto box-border w-full max-w-[1200px] px-[clamp(16px,4vw,48px)]";

function Header({ i, health, offline, lang, setLang }: { i: I18n; health: Health | null; offline: boolean; lang: Lang; setLang: (l: Lang) => void }) {
  const { t } = i;
  return (
    <header className="border-b border-line">
      <div className={`${container} flex items-center justify-between gap-3 py-3.5`}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-accent text-on-accent">
            <IconLogo size={20} />
          </span>
          <span className="font-display text-[21px] leading-7 font-semibold tracking-[-0.015em]">{t("title")}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] leading-[18px] text-muted" role="status" title={offline ? t("statusOffline") : t("statusReady")}>
            <span className={`size-2 shrink-0 rounded-full ${offline ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />
            <span className="font-semibold whitespace-nowrap text-ink">
              <span className="sm:hidden">{offline ? t("statusOfflineShort") : t("statusReadyShort")}</span>
              <span className="hidden sm:inline">{offline ? t("statusOffline") : t("statusReady")}</span>
            </span>
            {health && !offline && <span className="hidden font-mono text-xs sm:inline">v{health.version}</span>}
          </span>
          <div role="group" aria-label={t("langGroup")} className="flex gap-0.5 rounded-[10px] bg-segment p-[3px]">
            {(["tr", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`h-[30px] min-w-10 cursor-pointer rounded-lg px-2.5 text-[13px] font-semibold transition-colors ${
                  lang === l ? "bg-surface text-ink shadow-[0_1px_2px_rgba(22,24,26,0.08)]" : "text-muted hover:text-ink"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer({ i, health, offline }: { i: I18n; health: Health | null; offline: boolean }) {
  const { t } = i;
  return (
    <footer className={`${container} mt-[clamp(48px,7vw,72px)] flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 pb-7 text-[13px] leading-5 text-muted`}>
      <span className="inline-flex items-center gap-2 font-semibold text-ink">
        <span className={`size-2 rounded-full ${offline ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />
        {offline ? t("statusOffline") : t("footerRunning")}
      </span>
      {health && !offline && (
        <>
          <span className="font-mono text-xs">{health.ffmpeg ? `ffmpeg ${health.ffmpeg}` : t("ffmpegMissing")}</span>
          {health.hwaccel && <span>{t("footerAccel")}</span>}
          <span>
            {health.running + health.queued === 0 ? t("footerQueueEmpty") : t("footerQueue", { r: health.running, q: health.queued })} · {t("footerWorkers", { n: health.workers })}
          </span>
          <span>{t("footerTtl", { n: health.ttl_min })}</span>
        </>
      )}
    </footer>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const i = useMemo(() => makeI18n(lang), [lang]);
  const { t } = i;
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [state, dispatch] = useReducer(reducer, { items: [] });
  const aborts = useRef(new Map<string, AbortController>());
  const sources = useRef(new Map<string, EventSource>());

  // sağlık + şifre gereği
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setHealth(h);
        setOffline(false);
        if (!h.auth_required) setAuthed(true);
        else if (loadToken()) setAuthed(true);
        else setAuthed(false);
      } catch {
        if (alive) setOffline(true);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // katalog (yetki sonrası)
  useEffect(() => {
    if (!authed) return;
    api
      .formats()
      .then(setTargets)
      .catch((e: ApiError) => {
        if (e.status === 401) {
          setToken(null);
          setAuthed(false);
        }
      });
  }, [authed]);

  useEffect(() => {
    try {
      localStorage.setItem("morphbox.lang", lang);
    } catch {
      /* yok */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  const subscribe = useCallback((localId: string, jobId: string) => {
    const es = new EventSource(api.eventsUrl(jobId));
    sources.current.set(localId, es);
    es.addEventListener("job", (ev) => {
      const job = JSON.parse((ev as MessageEvent).data) as JobView;
      dispatch({ type: "jobUpdate", localId, job });
      if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
        es.close();
        sources.current.delete(localId);
      }
    });
    es.onerror = () => {
      // bağlantı düştüyse son durumu bir kez sor
      es.close();
      sources.current.delete(localId);
      api
        .job(jobId)
        .then((job) => dispatch({ type: "jobUpdate", localId, job }))
        .catch((e: ApiError) => dispatch({ type: "fail", localId, error: e.message, code: "network" }));
    };
  }, []);

  const convert = useCallback(
    async (item: Item) => {
      if (!item.target) return;
      const ctrl = new AbortController();
      aborts.current.set(item.localId, ctrl);
      dispatch({ type: "uploadStart", localId: item.localId });
      try {
        const { id } = await api.upload(item.file, item.target, item.options, (pct) => dispatch({ type: "uploadPct", localId: item.localId, pct }), ctrl.signal);
        const job = await api.job(id);
        dispatch({ type: "uploaded", localId: item.localId, job });
        subscribe(item.localId, id);
      } catch (e) {
        const err = e as ApiError;
        if (err.code === "aborted") dispatch({ type: "cancelled", localId: item.localId });
        else if (err.status === 401) {
          setToken(null);
          setAuthed(false);
          dispatch({ type: "reset", localId: item.localId });
        } else {
          const code = err.code === "too_large" || err.status === 413 ? "too_large" : err.status === 0 ? "network" : err.code || `http_${err.status}`;
          dispatch({ type: "fail", localId: item.localId, error: err.message, code });
        }
      } finally {
        aborts.current.delete(item.localId);
      }
    },
    [subscribe],
  );

  const cancel = useCallback(async (item: Item) => {
    aborts.current.get(item.localId)?.abort();
    sources.current.get(item.localId)?.close();
    sources.current.delete(item.localId);
    if (item.job) await api.cancel(item.job.id).catch(() => undefined);
    dispatch({ type: "cancelled", localId: item.localId });
  }, []);

  const remove = useCallback(async (item: Item) => {
    aborts.current.get(item.localId)?.abort();
    sources.current.get(item.localId)?.close();
    if (item.job) api.cancel(item.job.id).catch(() => undefined);
    dispatch({ type: "remove", localId: item.localId });
  }, []);

  const maxLabel = health ? i.bytes(health.max_upload_bytes) : "";
  const ttl = health?.ttl_min ?? 60;
  const items = state.items;
  const idle = items.filter((x) => x.phase === "idle" && x.target && x.error !== "unsupported");
  const busyN = items.filter((x) => x.phase === "uploading" || x.phase === "queued" || x.phase === "running").length;
  const doneN = items.filter((x) => x.phase === "done").length;
  const failN = items.filter((x) => x.phase === "failed").length;
  const finished = items.some((x) => x.phase === "done" || x.phase === "failed" || x.phase === "cancelled");
  const counts = [
    t("countFiles", { n: items.length }),
    idle.length ? t("countIdle", { n: idle.length }) : "",
    busyN ? t("countBusy", { n: busyN }) : "",
    doneN ? t("countDone", { n: doneN }) : "",
    failN ? t("countFailed", { n: failN }) : "",
  ].filter(Boolean);

  const addFiles = (files: File[]) => dispatch({ type: "add", files, targets });

  return (
    <div className="flex min-h-screen flex-col">
      <Header i={i} health={health} offline={offline} lang={lang} setLang={setLang} />

      {offline && (
        <div className={`${container} pt-4`}>
          <p role="alert" className="m-0 flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-ink">
            <IconAlert size={20} className="mt-0.5 shrink-0 text-danger-ink" />
            {t("offlineBanner")}
          </p>
        </div>
      )}

      {authed === false ? (
        <PasswordGate i={i} onOk={() => setAuthed(true)} />
      ) : items.length === 0 ? (
        <Start i={i} health={health} targets={targets} maxLabel={maxLabel} onFiles={addFiles} />
      ) : (
        <div className={`${container} flex flex-1 flex-wrap items-start gap-8 pt-10`}>
          <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">
            <DropZone i={i} maxLabel={maxLabel} variant="strip" onFiles={addFiles} />

            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="flex flex-col gap-1">
                <h1 className="m-0 font-display text-[30px] leading-9 font-semibold tracking-[-0.02em]">{t("listTitle")}</h1>
                <p className="m-0 text-sm leading-5 text-muted" aria-live="polite">{counts.join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {finished && (
                  <button type="button" onClick={() => dispatch({ type: "clearDone" })}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-semibold text-ink transition-colors hover:bg-surface">
                    <IconCheck size={18} />
                    {t("clearDone")}
                  </button>
                )}
                {idle.length > 1 && (
                  <button type="button" onClick={() => idle.forEach(convert)}
                    className="inline-flex h-11 cursor-pointer items-center rounded-xl bg-accent px-5 font-semibold text-on-accent transition-colors hover:bg-accent-hover">
                    {t("convertAll", { n: idle.length })}
                  </button>
                )}
              </div>
            </div>

            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {items.map((item) => (
                <FileCard
                  key={item.localId}
                  item={item}
                  targets={targets}
                  i={i}
                  ttlMin={ttl}
                  maxLabel={maxLabel}
                  onSetTarget={(id) => dispatch({ type: "setTarget", localId: item.localId, target: id, targets })}
                  onSetOption={(k, v) => dispatch({ type: "setOption", localId: item.localId, key: k, value: v })}
                  onToggleAdvanced={() => dispatch({ type: "toggleAdvanced", localId: item.localId })}
                  onConvert={() => convert(item)}
                  onCancel={() => cancel(item)}
                  onRemove={() => remove(item)}
                  onReset={() => dispatch({ type: "reset", localId: item.localId })}
                  onRetry={() => {
                    dispatch({ type: "reset", localId: item.localId });
                    convert(item);
                  }}
                />
              ))}
            </ul>
          </main>
          <Aside i={i} health={health} offline={offline} maxLabel={maxLabel} />
        </div>
      )}

      <Footer i={i} health={health} offline={offline} />
    </div>
  );
}
