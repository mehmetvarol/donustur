import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ApiError, api, fmtBytes, loadToken, setToken, type Health, type JobView, type Target } from "./api";
import DropZone from "./components/DropZone";
import FileCard from "./components/FileCard";
import { detectLang, makeT, type Lang } from "./i18n";
import { reducer, type Item } from "./state";

function PasswordGate({ t, onOk }: { t: ReturnType<typeof makeT>; onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await api.checkPassword(pw);
        setBusy(false);
        if (ok) {
          setToken(pw);
          onOk();
        } else setErr(true);
      }}
    >
      <h2 className="text-lg font-semibold">{t("password")}</h2>
      <p className="text-sm text-neutral-500">{t("passwordHint")}</p>
      <input type="password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} aria-invalid={err} aria-label={t("password")}
        className="h-10 rounded-md border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-950" />
      {err && <p className="text-sm text-red-600" role="alert">{t("wrongPassword")}</p>}
      <button type="submit" disabled={busy || !pw} className="h-10 rounded-md bg-brand font-medium text-white hover:bg-brand-strong disabled:opacity-50">{t("enter")}</button>
    </form>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = makeT(lang);
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
    return () => { alive = false; clearInterval(id); };
  }, []);

  // katalog (yetki sonrası)
  useEffect(() => {
    if (!authed) return;
    api.formats().then(setTargets).catch((e: ApiError) => {
      if (e.status === 401) { setToken(null); setAuthed(false); }
    });
  }, [authed]);

  useEffect(() => {
    try { localStorage.setItem("donustur.lang", lang); } catch { /* yok */ }
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
      api.job(jobId).then((job) => dispatch({ type: "jobUpdate", localId, job })).catch(() => dispatch({ type: "fail", localId, error: t("offline") }));
    };
  }, [t]);

  const convert = useCallback(async (item: Item) => {
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
      else if (err.status === 401) { setToken(null); setAuthed(false); dispatch({ type: "reset", localId: item.localId }); }
      else dispatch({ type: "fail", localId: item.localId, error: err.code === "too_large" ? `${t("tooLarge")} (${fmtBytes(health?.max_upload_bytes ?? 0)})` : err.message });
    } finally {
      aborts.current.delete(item.localId);
    }
  }, [health, subscribe, t]);

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

  const idle = state.items.filter((i) => i.phase === "idle" && i.target);
  const finished = state.items.some((i) => i.phase === "done" || i.phase === "failed" || i.phase === "cancelled");
  const maxLabel = health ? fmtBytes(health.max_upload_bytes) : "";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-7" />
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{t("tagline")}</p>
        </div>
        <button type="button" onClick={() => setLang(lang === "tr" ? "en" : "tr")} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" aria-label="Language / Dil">
          {t("language")}
        </button>
      </header>

      {offline && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{t("offline")}</p>}

      {authed === false ? (
        <PasswordGate t={t} onOk={() => setAuthed(true)} />
      ) : (
        <main className="flex flex-1 flex-col gap-4">
          <DropZone t={t} maxLabel={maxLabel} compact={state.items.length > 0} onFiles={(files) => dispatch({ type: "add", files, targets })} />

          {state.items.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {finished && (
                  <button type="button" onClick={() => dispatch({ type: "clearDone" })} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                    {t("clearDone")}
                  </button>
                )}
                {idle.length > 1 && (
                  <button type="button" onClick={() => idle.forEach(convert)} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-strong">
                    {t("convertAll")} ({idle.length})
                  </button>
                )}
              </div>
              <ul className="flex flex-col gap-3" aria-live="polite">
                {state.items.map((item) => (
                  <FileCard key={item.localId} item={item} targets={targets} t={t}
                    onSetTarget={(id) => dispatch({ type: "setTarget", localId: item.localId, target: id, targets })}
                    onSetOption={(k, v) => dispatch({ type: "setOption", localId: item.localId, key: k, value: v })}
                    onToggleAdvanced={() => dispatch({ type: "toggleAdvanced", localId: item.localId })}
                    onConvert={() => convert(item)}
                    onCancel={() => cancel(item)}
                    onRemove={() => remove(item)}
                    onReset={() => dispatch({ type: "reset", localId: item.localId })} />
                ))}
              </ul>
            </>
          )}
        </main>
      )}

      <footer className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-800">
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block size-2 rounded-full ${offline ? "bg-red-500" : "bg-brand"}`} aria-hidden />
          {t("server")} {health ? `v${health.version}` : ""}
        </span>
        {health && (
          <>
            <span>{health.ffmpeg ? `ffmpeg ${health.ffmpeg}${health.hwaccel ? " • GPU" : ""}` : t("ffmpegMissing")}</span>
            <span>{t("queue")} {health.queued} • {t("active")} {health.running}/{health.workers} {t("workers")}</span>
            <span>{t("ttl", { n: health.ttl_min })}</span>
          </>
        )}
      </footer>
    </div>
  );
}
