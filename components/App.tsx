"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, persistStorage, type Entry, type Speaker } from "@/lib/db";
import { getLang, LANGUAGES } from "@/lib/languages";
import { PHRASE_GROUPS } from "@/lib/phrases";
import { Recorder } from "@/lib/recorder";
import * as I from "./Icons";

type Settings = {
  me: string;
  them: string;
  autoplay: boolean;
  apiKey: string;
};

const DEFAULTS: Settings = { me: "tr", them: "it", autoplay: true, apiKey: "" };
const SETTINGS_KEY = "ciao.settings.v1";
const HOLD_MS = 350; // shorter than this = tap, keeps recording until tapped again
const MAX_MS = 60_000;

const ERRORS: Record<string, string> = {
  no_speech: "Ses algılanamadı. Butona basılı tutup biraz daha uzun konuş.",
  missing_key: "OpenAI anahtarı gerekli. Ayarlardan ekleyebilirsin.",
  invalid_key: "OpenAI anahtarı geçersiz görünüyor. Ayarlardan kontrol et.",
  rate_limited: "Çok sık istek gönderildi, birkaç saniye sonra tekrar dene.",
  offline: "İnternet yok. Geçmiş ve kayıtlı ifadeler yine de çalışır.",
  mic_denied: "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin ver.",
  server_error: "Bir şeyler ters gitti, tekrar dene.",
};

type Sheet = null | "settings" | "phrases" | "type" | "lang-me" | "lang-them";
type Showcase = { text: string; lang: string; flipped: boolean } | null;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function vibrate(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [serverKey, setServerKey] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recording, setRecording] = useState<Speaker | null>(null);
  const [tapMode, setTapMode] = useState(false);
  const [busy, setBusy] = useState<Speaker | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [faceMode, setFaceMode] = useState(false);
  const [showcase, setShowcase] = useState<Showcase>(null);
  const [online, setOnline] = useState(true);

  const recorder = useRef<Recorder | null>(null);
  const pressAt = useRef(0);
  const startPromise = useRef<Promise<void> | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const audioUnlocked = useRef(false);
  const listEnd = useRef<HTMLDivElement>(null);
  const maxTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const me = getLang(settings.me);
  const them = getLang(settings.them);

  // ---------- boot ----------
  useEffect(() => {
    setSettings(loadSettings());
    db.allEntries().then((e) => {
      setEntries(e);
      setReady(true);
    });
    persistStorage();
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setServerKey(Boolean(d.serverKey)))
      .catch(() => setServerKey(null));

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings, ready]);

  useEffect(() => {
    if (ready && serverKey === false && !settings.apiKey) setSheet("settings");
  }, [ready, serverKey, settings.apiKey]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, busy]);

  // Keep the screen awake while the conversation is on screen.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  // ---------- helpers ----------
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const headers = useCallback((): Record<string, string> => {
    return settings.apiKey ? { "x-openai-key": settings.apiKey } : {};
  }, [settings.apiKey]);

  const fail = useCallback(
    (code: string) => {
      vibrate([40, 60, 40]);
      if (code === "missing_key" || code === "invalid_key") setSheet("settings");
      showToast(ERRORS[code] ?? ERRORS.server_error);
    },
    [showToast]
  );

  // iOS only lets audio play after a user gesture; prime a shared element once.
  const unlockAudio = useCallback(() => {
    if (audioUnlocked.current) return;
    const a = audioEl.current ?? new Audio();
    audioEl.current = a;
    a.src =
      "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    a.play()
      .then(() => {
        a.pause();
        audioUnlocked.current = true;
      })
      .catch(() => {});
  }, []);

  const playBlob = useCallback((blob: Blob, id: string) => {
    const a = audioEl.current ?? new Audio();
    audioEl.current = a;
    const url = URL.createObjectURL(blob);
    a.pause();
    a.src = url;
    a.onended = a.onerror = () => {
      URL.revokeObjectURL(url);
      setPlaying((p) => (p === id ? null : p));
    };
    setPlaying(id);
    a.play().catch(() => setPlaying(null));
  }, []);

  const stopAudio = useCallback(() => {
    audioEl.current?.pause();
    setPlaying(null);
  }, []);

  const fetchSpeech = useCallback(
    async (text: string, lang: string): Promise<Blob | undefined> => {
      try {
        const r = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers() },
          body: JSON.stringify({ text, lang }),
        });
        if (!r.ok) return undefined;
        return await r.blob();
      } catch {
        return undefined;
      }
    },
    [headers]
  );

  const playEntry = useCallback(
    async (e: Entry) => {
      if (playing === e.id) return stopAudio();
      if (e.audio) return playBlob(e.audio, e.id);
      setPlaying(e.id);
      const blob = await fetchSpeech(e.translation, e.to);
      if (!blob) {
        setPlaying(null);
        return fail(navigator.onLine ? "server_error" : "offline");
      }
      const updated = { ...e, audio: blob };
      db.putEntry(updated);
      setEntries((list) => list.map((x) => (x.id === e.id ? updated : x)));
      playBlob(blob, e.id);
    },
    [playing, stopAudio, playBlob, fetchSpeech, fail]
  );

  const addEntry = useCallback(
    async (e: Entry): Promise<Blob | undefined> => {
      setEntries((list) => [...list, e]);
      await db.putEntry(e);
      const blob = await fetchSpeech(e.translation, e.to);
      if (!blob) return undefined;
      const updated = { ...e, audio: blob };
      setEntries((list) => list.map((x) => (x.id === e.id ? updated : x)));
      db.putEntry(updated);
      if (settings.autoplay) playBlob(blob, e.id);
      return blob;
    },
    [fetchSpeech, playBlob, settings.autoplay]
  );

  // ---------- recording ----------
  const stopTicker = useRef<number | null>(null);

  const beginRecording = useCallback(
    (speaker: Speaker) => {
      stopAudio();
      const r = new Recorder();
      recorder.current = r;
      setRecording(speaker);
      setTapMode(false);
      vibrate(20);
      startPromise.current = r
        .start()
        .then(() => {
          const tick = () => {
            setLevel(r.level());
            stopTicker.current = requestAnimationFrame(tick);
          };
          tick();
        })
        .catch(() => {
          recorder.current = null;
          setRecording(null);
          fail("mic_denied");
        });
      maxTimer.current = window.setTimeout(() => finishRef.current(speaker), MAX_MS);
    },
    [stopAudio, fail]
  );

  const cleanupRecording = () => {
    if (stopTicker.current) cancelAnimationFrame(stopTicker.current);
    if (maxTimer.current) window.clearTimeout(maxTimer.current);
    setLevel(0);
    setRecording(null);
    setTapMode(false);
  };

  const cancelRecording = useCallback(() => {
    recorder.current?.cancel();
    recorder.current = null;
    cleanupRecording();
  }, []);

  const finishRecording = useCallback(
    async (speaker: Speaker) => {
      await startPromise.current;
      const r = recorder.current;
      if (!r) return;
      recorder.current = null;
      const rec = await r.stop();
      cleanupRecording();
      vibrate(15);

      if (rec.duration < 500 || rec.blob.size < 1500) return fail("no_speech");
      if (!navigator.onLine) return fail("offline");

      const from = speaker === "me" ? settings.me : settings.them;
      const to = speaker === "me" ? settings.them : settings.me;
      const context = entries.slice(-6).map((e) => ({ from: e.from, text: e.source }));

      const form = new FormData();
      form.append("audio", rec.blob, rec.filename);
      form.append("from", from);
      form.append("to", to);
      form.append("context", JSON.stringify(context));

      setBusy(speaker);
      try {
        const res = await fetch("/api/translate", { method: "POST", headers: headers(), body: form });
        const data = await res.json().catch(() => ({ error: "server_error" }));
        if (!res.ok) return fail(data.error ?? "server_error");
        await addEntry({
          id: uid(),
          ts: Date.now(),
          speaker,
          from,
          to,
          source: data.source,
          translation: data.translation,
        });
      } catch {
        fail(navigator.onLine ? "server_error" : "offline");
      } finally {
        setBusy(null);
      }
    },
    [settings.me, settings.them, entries, headers, addEntry, fail]
  );

  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;

  const onPressStart = (speaker: Speaker) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    unlockAudio();
    if (busy) return;
    if (recording === speaker && tapMode) return finishRecording(speaker);
    if (recording) return;
    pressAt.current = performance.now();
    beginRecording(speaker);
  };

  const onPressEnd = (speaker: Speaker) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    if (recording !== speaker || tapMode) return;
    if (performance.now() - pressAt.current < HOLD_MS) {
      setTapMode(true); // quick tap: keep listening until tapped again
      return;
    }
    finishRecording(speaker);
  };

  // ---------- text & phrases ----------
  const translateText = useCallback(
    async (text: string, speaker: Speaker, opts: { cacheKey?: string; show?: boolean } = {}) => {
      const from = speaker === "me" ? settings.me : settings.them;
      const to = speaker === "me" ? settings.them : settings.me;
      unlockAudio();

      if (opts.cacheKey) {
        const hit = await db.getPhrase(opts.cacheKey);
        if (hit) {
          const e: Entry = { id: uid(), ts: Date.now(), speaker, from, to, source: text, translation: hit.translation, audio: hit.audio };
          setEntries((l) => [...l, e]);
          db.putEntry(e);
          if (opts.show) setShowcase({ text: hit.translation, lang: to, flipped: false });
          if (hit.audio && settings.autoplay) playBlob(hit.audio, e.id);
          return;
        }
      }
      if (!navigator.onLine) return fail("offline");

      setBusy(speaker);
      try {
        const res = await fetch("/api/text", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers() },
          body: JSON.stringify({ text, from, to }),
        });
        const data = await res.json().catch(() => ({ error: "server_error" }));
        if (!res.ok) return fail(data.error ?? "server_error");
        const e: Entry = { id: uid(), ts: Date.now(), speaker, from, to, source: text, translation: data.translation };
        if (opts.show) setShowcase({ text: data.translation, lang: to, flipped: false });
        setBusy(null);
        const audio = await addEntry(e);
        if (opts.cacheKey) db.putPhrase({ key: opts.cacheKey, translation: data.translation, audio });
      } catch {
        fail("server_error");
      } finally {
        setBusy(null);
      }
    },
    [settings, headers, fail, addEntry, playBlob, unlockAudio]
  );

  const swapLanguages = () => setSettings((s) => ({ ...s, me: s.them, them: s.me }));

  const clearHistory = async () => {
    if (!confirm("Tüm konuşma geçmişi silinsin mi?")) return;
    await db.clearEntries();
    setEntries([]);
    setSheet(null);
  };

  const removeEntry = async (id: string) => {
    await db.deleteEntry(id);
    setEntries((l) => l.filter((e) => e.id !== id));
  };

  const last = entries[entries.length - 1];
  const needsKey = serverKey === false && !settings.apiKey;

  // ---------- render pieces ----------
  const talkButton = (speaker: Speaker) => {
    const lang = speaker === "me" ? me : them;
    const isRec = recording === speaker;
    const isBusy = busy === speaker;
    const disabled = (!!recording && !isRec) || (!!busy && !isBusy);
    return (
      <button
        key={speaker}
        className={`talk talk--${speaker} ${isRec ? "is-rec" : ""} ${isBusy ? "is-busy" : ""}`}
        style={{ ["--level" as string]: level.toFixed(3) }}
        disabled={disabled}
        onPointerDown={onPressStart(speaker)}
        onPointerUp={onPressEnd(speaker)}
        onPointerLeave={(e) => e.pointerType === "mouse" && isRec && !tapMode && onPressEnd(speaker)(e)}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`${lang.native}: ${lang.holdLabel}`}
      >
        <span className="talk__ring" aria-hidden />
        <span className="talk__icon">{isBusy ? <span className="spinner" /> : <I.Mic width={28} height={28} />}</span>
        <span className="talk__text">
          <span className="talk__lang">
            <span className="flag">{lang.flag}</span> {lang.native}
          </span>
          <span className="talk__hint">
            {isRec ? (tapMode ? "Bitirmek için dokun" : lang.listening) : isBusy ? "Çevriliyor…" : lang.holdLabel}
          </span>
        </span>
      </button>
    );
  };

  const empty = (
    <div className="empty">
      <img className="empty__logo" src="/icon-192.png" alt="Ciao" width={96} height={96} />
      <h1>Konuş, anlaşılsın.</h1>
      <p>
        Kendi butonuna <b>basılı tut</b> ve {me.native} konuş. Bıraktığında {them.native} diline çevrilip sesli okunur.
        Karşındaki de kendi butonuyla cevap verir.
      </p>
      <p className="empty__them" lang={them.code}>
        {them.flag} {them.holdLabel}
      </p>
      <button className="chip" onClick={() => setSheet("phrases")}>
        <I.Bolt width={16} height={16} /> Hazır ifadeler
      </button>
    </div>
  );

  const bubbles = (
    <div className="thread">
      {entries.map((e) => (
        <article key={e.id} className={`bubble bubble--${e.speaker}`}>
          <p className="bubble__main" lang={e.to}>
            {e.translation}
          </p>
          <p className="bubble__src" lang={e.from}>
            {getLang(e.from).flag} {e.source}
          </p>
          <div className="bubble__actions">
            <button className={`icon ${playing === e.id ? "is-on" : ""}`} onClick={() => playEntry(e)} aria-label="Sesli oku">
              <I.Speaker width={18} height={18} />
            </button>
            <button
              className="icon"
              onClick={() => setShowcase({ text: e.translation, lang: e.to, flipped: false })}
              aria-label="Büyük göster"
            >
              <I.Expand width={18} height={18} />
            </button>
            <button className="icon" onClick={() => navigator.clipboard?.writeText(e.translation)} aria-label="Kopyala">
              <I.Copy width={18} height={18} />
            </button>
            <button className="icon icon--quiet" onClick={() => removeEntry(e.id)} aria-label="Sil">
              <I.Trash width={16} height={16} />
            </button>
            <time>{new Date(e.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        </article>
      ))}
      {busy && (
        <article className={`bubble bubble--${busy} bubble--pending`}>
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </article>
      )}
      <div ref={listEnd} className="thread__end" />
    </div>
  );

  // What each side should read in face-to-face mode.
  const faceText = (side: Speaker) => {
    if (!last) return side === "me" ? me.holdLabel : them.holdLabel;
    const lang = side === "me" ? settings.me : settings.them;
    return last.to === lang ? last.translation : last.source;
  };

  return (
    <div className={`app ${faceMode ? "app--face" : ""}`}>
      {!online && <div className="offline">Çevrimdışı · geçmiş cihazında güvende</div>}

      {faceMode ? (
        <main className="face">
          <section className="face__half face__half--them" lang={them.code}>
            <p className="face__text">{faceText("them")}</p>
            {talkButton("them")}
          </section>
          <div className="face__bar">
            <button className="icon" onClick={() => last && playEntry(last)} aria-label="Tekrar oynat" disabled={!last}>
              <I.Speaker />
            </button>
            <button className="pill" onClick={() => setFaceMode(false)}>
              Sohbet görünümü
            </button>
            <button className="icon" onClick={swapLanguages} aria-label="Dilleri değiştir">
              <I.Swap />
            </button>
          </div>
          <section className="face__half face__half--me" lang={me.code}>
            <p className="face__text">{faceText("me")}</p>
            {talkButton("me")}
          </section>
        </main>
      ) : (
        <>
          <header className="top">
            <div className="brand">
              <img className="brand__logo" src="/logo.png" alt="" width={28} height={28} />
              Ciao
            </div>
            <div className="pair">
              <button className="pair__lang" onClick={() => setSheet("lang-me")}>
                {me.flag} <span>{me.native}</span>
              </button>
              <button className="pair__swap" onClick={swapLanguages} aria-label="Dilleri değiştir">
                <I.Swap width={18} height={18} />
              </button>
              <button className="pair__lang" onClick={() => setSheet("lang-them")}>
                {them.flag} <span>{them.native}</span>
              </button>
            </div>
            <button className="icon" onClick={() => setSheet("settings")} aria-label="Ayarlar">
              <I.Gear />
              {needsKey && <span className="badge" />}
            </button>
          </header>

          <main className="scroll">{ready && (entries.length || busy ? bubbles : empty)}</main>

          <footer className="dock">
            <div className="dock__tools">
              <button className="tool" onClick={() => setSheet("phrases")}>
                <I.Bolt width={18} height={18} /> İfadeler
              </button>
              <button className="tool" onClick={() => setSheet("type")}>
                <I.Keyboard width={18} height={18} /> Yaz
              </button>
              <button className="tool" onClick={() => setFaceMode(true)}>
                <I.Split width={18} height={18} /> Karşılıklı
              </button>
            </div>
            <div className="dock__talk">
              {talkButton("me")}
              {talkButton("them")}
            </div>
          </footer>
        </>
      )}

      {recording && (
        <button className="cancel" onClick={cancelRecording}>
          <I.Close width={16} height={16} /> İptal
        </button>
      )}

      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {showcase && (
        <div className={`showcase ${showcase.flipped ? "is-flipped" : ""}`} onClick={() => setShowcase(null)}>
          <p className="showcase__text" lang={showcase.lang}>
            {showcase.text}
          </p>
          <div className="showcase__bar" onClick={(e) => e.stopPropagation()}>
            <button className="icon" onClick={() => setShowcase({ ...showcase, flipped: !showcase.flipped })} aria-label="Çevir">
              <I.Rotate />
            </button>
            <button className="icon" onClick={() => setShowcase(null)} aria-label="Kapat">
              <I.Close />
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <div className="scrim" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet__grip" />
            {(sheet === "lang-me" || sheet === "lang-them") && (
              <>
                <h2>{sheet === "lang-me" ? "Senin dilin" : "Karşındakinin dili"}</h2>
                <div className="langs">
                  {LANGUAGES.map((l) => {
                    const field = sheet === "lang-me" ? "me" : "them";
                    const active = settings[field] === l.code;
                    return (
                      <button
                        key={l.code}
                        className={`lang ${active ? "is-active" : ""}`}
                        onClick={() => {
                          setSettings((s) => {
                            const other = field === "me" ? "them" : "me";
                            // Picking the other side's language swaps them.
                            if (s[other] === l.code) return { ...s, [field]: l.code, [other]: s[field] };
                            return { ...s, [field]: l.code };
                          });
                          setSheet(null);
                        }}
                      >
                        <span className="flag">{l.flag}</span>
                        <span>{l.native}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {sheet === "phrases" && (
              <>
                <h2>Hazır ifadeler</h2>
                <p className="muted">Dokun: {them.native} diline çevrilir, büyük gösterilir ve okunur. Bir kez çevrilen ifade internetsiz de çalışır.</p>
                <div className="phrases">
                  {PHRASE_GROUPS.map((g) => (
                    <section key={g.title}>
                      <h3>
                        {g.emoji} {g.title}
                      </h3>
                      {g.items.map((p) => (
                        <button
                          key={p}
                          className="phrase"
                          onClick={() => {
                            setSheet(null);
                            translateText(p, "me", { cacheKey: `tr>${settings.them}:${p}`, show: true });
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              </>
            )}

            {sheet === "type" && <TypeSheet me={me.native} them={them.native} onSend={(t, s) => { setSheet(null); translateText(t, s, { show: true }); }} />}

            {sheet === "settings" && (
              <>
                <h2>Ayarlar</h2>
                <label className="row">
                  <span>
                    <b>Otomatik sesli okuma</b>
                    <small>Çeviri hazır olunca hemen okunsun</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={settings.autoplay}
                    onChange={(e) => setSettings((s) => ({ ...s, autoplay: e.target.checked }))}
                  />
                </label>

                <KeyField
                  saved={settings.apiKey}
                  serverKey={!!serverKey}
                  onSave={(apiKey) => {
                    const next = { ...settings, apiKey };
                    setSettings(next);
                    try {
                      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
                    } catch {}
                  }}
                />

                <div className="field">
                  <b>Ana ekrana ekle</b>
                  <small>
                    Safari’de Paylaş → “Ana Ekrana Ekle”. Uygulama gibi tam ekran açılır, geçmişin telefonda saklanır.
                  </small>
                </div>

                <button className="danger" onClick={clearHistory} disabled={!entries.length}>
                  <I.Trash width={16} height={16} /> Geçmişi temizle ({entries.length})
                </button>
                <p className="muted tiny">Ses → metin: gpt-4o-transcribe · Çeviri: GPT-4.1 · Ses: gpt-4o-mini-tts</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeSheet({ me, them, onSend }: { me: string; them: string; onSend: (text: string, s: Speaker) => void }) {
  const [text, setText] = useState("");
  const [side, setSide] = useState<Speaker>("me");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const placeholder = useMemo(() => (side === "me" ? `${me} yaz…` : `${them}…`), [side, me, them]);
  return (
    <>
      <h2>Yazarak çevir</h2>
      <p className="muted">Gürültülü bir yerde sesli konuşmak zorsa.</p>
      <div className="seg">
        <button className={side === "me" ? "is-active" : ""} onClick={() => setSide("me")}>
          {me} → {them}
        </button>
        <button className={side === "them" ? "is-active" : ""} onClick={() => setSide("them")}>
          {them} → {me}
        </button>
      </div>
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSend(text.trim(), side);
        }}
      >
        <textarea ref={ref} rows={3} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        <button className="send" disabled={!text.trim()} aria-label="Çevir">
          <I.Send />
        </button>
      </form>
    </>
  );
}

const KEY_ERRORS: Record<string, string> = {
  invalid_key: "OpenAI bu anahtarı kabul etmedi. Tamamını kopyaladığından emin ol.",
  no_model_access: "Anahtar geçerli ama ses modellerine erişimi yok. OpenAI hesabına bakiye yüklemen gerekebilir.",
  missing_key: "Anahtar boş.",
};

function KeyField({ saved, serverKey, onSave }: { saved: string; serverKey: boolean; onSave: (key: string) => void }) {
  const [editing, setEditing] = useState(!saved);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "ok" | "error">(saved ? "ok" : "idle");
  const [message, setMessage] = useState("");

  const save = async () => {
    const key = draft.replace(/\s+/g, "");
    if (!key) return;
    setState("checking");
    setMessage("");
    try {
      const res = await fetch("/api/check", { method: "POST", headers: { "x-openai-key": key } });
      const data = await res.json().catch(() => ({}));
      // With a server key configured the check validates that one, so only trust a 200 here.
      if (!res.ok) {
        setState("error");
        setMessage(KEY_ERRORS[data.error] ?? "Anahtar kontrol edilemedi. İnternet bağlantını kontrol edip tekrar dene.");
        return;
      }
      onSave(key);
      setState("ok");
      setEditing(false);
      setDraft("");
      vibrate(20);
    } catch {
      setState("error");
      setMessage("Bağlantı yok. İnternete bağlanıp tekrar dene.");
    }
  };

  const masked = saved ? `${saved.slice(0, 7)}…${saved.slice(-4)}` : "";

  return (
    <div className="field">
      <b>OpenAI API anahtarı</b>
      <small>
        {serverKey
          ? "Sunucuda anahtar tanımlı, burayı boş bırakabilirsin."
          : "Anahtar sadece bu telefonda saklanır. platform.openai.com → API keys’ten alabilirsin."}
      </small>

      {!editing && saved ? (
        <div className="keyrow">
          <span className="keyrow__ok">✓ Kaydedildi</span>
          <code>{masked}</code>
          <button className="linkbtn" onClick={() => { setEditing(true); setState("idle"); }}>
            Değiştir
          </button>
        </div>
      ) : (
        <form
          className="keyform"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            type="text"
            inputMode="text"
            placeholder="sk-proj-..."
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="savebtn" disabled={!draft.trim() || state === "checking"}>
            {state === "checking" ? <span className="spinner" /> : "Kaydet ve test et"}
          </button>
          {saved && (
            <button type="button" className="linkbtn" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
          )}
        </form>
      )}
      {state === "error" && <small className="keyerr">{message}</small>}
    </div>
  );
}
