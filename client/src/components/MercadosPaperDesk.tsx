import { useEffect, useMemo, useRef, useState } from "react";
import type { BtcTradeSignal } from "../lib/api";
import { getBtcTradeSignal, getPaperBook, putPaperBook } from "../lib/api";
import {
  clampPaperLev,
  clampPaperMaxOps,
  clampPaperMaxOpsDay,
  clampPaperMinConf,
  clampPaperRiskPct,
  clampPaperSizePct,
  clampPaperT1Pct,
  composePaperMode,
  loadPaperBook,
  narratePaper,
  paperAtDayCap,
  paperAtOpsCap,
  paperDirOf,
  paperEffectiveLev,
  paperEntryAlert,
  paperPrepProcess,
  paperEquity,
  paperOpsLeft,
  paperOpsToday,
  paperVenueOf,
  savePaperBook,
  splitPaperTrades,
  type PaperBook,
  type PaperDir,
  type PaperLev,
  type PaperNote,
  type PaperStyle,
  type PaperTrade,
  type PaperUniverse,
  type PaperVenue,
} from "../lib/mercadosPaperAgent";
import { showToast } from "./ToastNotification";
import { playMarketplaceCartItemAddedSound, playMarketplaceCartItemRemovedSound } from "../lib/marketplaceCartSound";
import { playRoxyTypeTick } from "../lib/roxyTypeSound";
import { hushRoxy, isRoxyMuted, setRoxyMuted, speakRoxy, subscribeRoxySpeech } from "../lib/roxyVoice";

export type PaperPairOpt = { binance: string; label: string };

const ROXY = "Roxy";

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtStamp(ms: number): { date: string; time: string; iso: string } {
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    iso: d.toISOString(),
  };
}

function fmtDur(from: number, to: number): string {
  const s = Math.max(0, Math.floor((to - from) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function Stamp({ at }: { at: number }) {
  const s = fmtStamp(at);
  return (
    <time className="tv-paper__stamp" dateTime={s.iso}>
      {s.date} <span>{s.time}</span>
    </time>
  );
}

function exitLabel(reason: string | null): string {
  if (reason === "stop") return "Stop";
  if (reason === "t2") return "T2";
  if (reason === "t1") return "T1";
  if (reason === "flip") return "Sesgo";
  if (reason === "time") return "Tiempo";
  if (reason === "day") return "Cierre del día";
  return reason || "Cierre";
}

function PrepMeter({ target, stage, intent }: { target: number; stage: string; intent: string }) {
  const [pct, setPct] = useState(1);
  const pctRef = useRef(1);
  useEffect(() => {
    const goal = Math.max(0, Math.min(100, Math.round(target)));
    const id = window.setInterval(() => {
      const cur = pctRef.current;
      if (cur === goal) return;
      const next = cur < goal ? cur + 1 : cur - 1;
      pctRef.current = next;
      setPct(next);
    }, 38);
    return () => window.clearInterval(id);
  }, [target]);
  const tone = intent === "hold" || pct >= 100 ? "go" : pct >= 62 ? "mid" : "low";
  return (
    <div className={`tv-paper-prep tv-paper-prep--${tone}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Preparación de la próxima operación">
      <div className="tv-paper-prep__top">
        <span>Preparación próxima op</span>
        <b>
          {pct}
          <small>%</small>
        </b>
      </div>
      <div className="tv-paper-prep__track">
        <i style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <em>{stage}</em>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 220;
  const h = 36;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg className="tv-paper__spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={up ? "#26a69a" : "#ef5350"} strokeWidth="1.7" />
    </svg>
  );
}

function CfgBtn({
  on,
  children,
  onClick,
  disabled,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={on ? "is-on" : ""} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function RoxyFace({ talking }: { talking: boolean }) {
  const [pose, setPose] = useState({ rot: -1.2, x: 0, y: 0, lookX: 50, lookY: 16 });
  useEffect(() => {
    let t = 0;
    const wander = () => {
      setPose({
        rot: Math.round((Math.random() * 14 - 7) * 10) / 10,
        x: Math.round((Math.random() * 5.2 - 2.6) * 10) / 10,
        y: Math.round((Math.random() * 3.4 - 1.7) * 10) / 10,
        lookX: 46 + Math.random() * 10,
        lookY: 12 + Math.random() * 10,
      });
      t = window.setTimeout(wander, 900 + Math.random() * 2600);
    };
    wander();
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className={`tv-paper-opine__face${talking ? " is-talk" : ""}`}>
      <div
        className="tv-paper-opine__head"
        style={{ transform: `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rot}deg)` }}
      >
        <img
          className="tv-paper-opine__photo"
          src="/images/paper-agent-avatar.png"
          alt={ROXY}
          width={48}
          height={48}
          style={{ objectPosition: `${pose.lookX}% ${pose.lookY}%` }}
        />
        <span className="tv-paper-opine__lid tv-paper-opine__lid--l" aria-hidden />
        <span className="tv-paper-opine__lid tv-paper-opine__lid--r" aria-hidden />
        <span className="tv-paper-opine__mouth" aria-hidden />
      </div>
    </div>
  );
}

function pairTag(pairs: PaperPairOpt[], symbol: string): string {
  return pairs.find((p) => p.binance === symbol)?.label.replace("/USDT", "") ?? symbol.replace("USDT", "");
}

function AgentOpinion({
  notes,
  live,
  muted,
}: {
  notes: PaperNote[];
  live: Omit<PaperNote, "id">;
  muted: boolean;
}) {
  const feed = useMemo(() => {
    if (!notes.length) return [{ ...live, id: "live" } as PaperNote];
    if (notes[0]!.fingerprint === live.fingerprint) return notes;
    return [{ ...live, id: "live" } as PaperNote, ...notes];
  }, [notes, live]);
  const [i, setI] = useState(0);
  const latestId = feed[0]?.id;
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  const [voicing, setVoicing] = useState(false);

  useEffect(() => subscribeRoxySpeech(setVoicing), []);

  useEffect(() => {
    setI(0);
  }, [latestId]);

  const current = feed[i] ?? feed[0]!;
  const isLive = i === 0;

  useEffect(() => {
    if (!isLive) {
      setShown(current.body);
      setDone(true);
      return;
    }
    setShown("");
    setDone(false);
    const body = current.body;
    if (!body) {
      setDone(true);
      return;
    }
    let n = 0;
    let last = 0;
    let raf = 0;
    const tick = (t: number) => {
      if (!last) last = t;
      const ch = body[n] ?? "";
      const wait = ch === "\n" ? 420 : ch === "…" ? 380 : /[.!?]/.test(ch) ? 260 : /[,;:—]/.test(ch) ? 140 : 28;
      const elapsed = t - last;
      if (elapsed >= wait) {
        const from = n;
        n = Math.min(body.length, n + 1);
        if (n > from && !muted) playRoxyTypeTick(body[from] ?? "");
        setShown(body.slice(0, n));
        last = t;
      }
      if (n < body.length) raf = window.requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isLive, current.id, current.body, muted]);

  useEffect(() => {
    if (muted) {
      hushRoxy();
      return;
    }
    const line = current.body?.trim() || current.title;
    if (!line) return;
    speakRoxy(line);
    return () => hushRoxy();
  }, [muted, current.id, current.title, current.body]);

  const older = i < feed.length - 1;
  const newer = i > 0;
  const when = fmtStamp(current.at);
  const text = isLive ? shown : current.body;
  const chunks = (text || " ").split(/\n+/).filter((p) => p.length > 0);

  return (
    <blockquote className={`tv-paper-opine tv-paper-opine--${current.tone}`}>
      <RoxyFace talking={voicing || (isLive && !done && !muted)} />
      <div className="tv-paper-opine__ident">
        <p className="tv-paper-opine__kicker">Opinión de {ROXY}</p>
        <p className="tv-paper-opine__title">{current.title}</p>
      </div>
      <div className="tv-paper-opine__tools">
        <p className="tv-paper-opine__meta">
          {i === 0 ? "Ahora" : "Antes"} · {when.time}
          {feed.length > 1 ? ` · ${i + 1}/${feed.length}` : ""}
        </p>
        <div className="tv-paper-opine__nav">
          <button
            type="button"
            className="tv-paper-opine__arrow"
            disabled={!older}
            aria-label="Comentario anterior"
            onClick={() => setI((v) => Math.min(feed.length - 1, v + 1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="tv-paper-opine__arrow"
            disabled={!newer}
            aria-label="Comentario siguiente"
            onClick={() => setI((v) => Math.max(0, v - 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="tv-paper-opine__stage">
        {i > 0 ? <div className="tv-paper-opine__peek" aria-hidden /> : null}
        <div key={current.id} className={`tv-paper-opine__slide${i === 0 ? " is-now" : " is-past"}`}>
          <div className="tv-paper-opine__body">
            {chunks.map((para, pi) => (
              <p key={pi}>
                {para}
                {isLive && pi === chunks.length - 1 ? (
                  <i className={`tv-paper-opine__caret${done ? " is-done" : ""}`} aria-hidden />
                ) : null}
              </p>
            ))}
          </div>
        </div>
      </div>
    </blockquote>
  );
}

function TradeCard({
  trade,
  tag,
  mark,
  now,
}: {
  trade: PaperTrade;
  tag: string;
  mark?: number;
  now: number;
}) {
  const open = trade.status === "open";
  const px = mark ?? trade.entry;
  const live = open ? trade.qtyLeft * (px - trade.entry) : 0;
  const pnl = open ? live + trade.realizedPnl : trade.realizedPnl;
  const end = trade.closedAt ?? now;
  return (
    <article className={`tv-paper-op tv-paper-op--${trade.side}${open ? " is-open" : " is-closed"}`}>
      <header>
        <strong>
          {tag} · {trade.side === "long" ? "Largo" : "Corto"}
        </strong>
        <em className={open ? "is-live" : ""}>{open ? "Abierta" : "Cerrada"}</em>
        <span className={pnl >= 0 ? "is-up" : "is-down"}>
          {pnl >= 0 ? "+" : ""}
          {usd(pnl)}
        </span>
      </header>
      <ol className="tv-paper-op__line" aria-label="Línea de tiempo">
        <li>
          <i />
          <div>
            <small>Apertura</small>
            <Stamp at={trade.openedAt} />
            <p>
              Entrada {usd(trade.entry)} · {Math.abs(trade.qty).toFixed(6)} · Stop {usd(trade.stop)}
            </p>
          </div>
        </li>
        {trade.t1Done && trade.t1At ? (
          <li>
            <i />
            <div>
              <small>T1 · 50%</small>
              <Stamp at={trade.t1At} />
              <p>
                {usd(trade.t1Price ?? trade.t1)}
                {trade.t1Pnl != null ? ` · ${trade.t1Pnl >= 0 ? "+" : ""}${usd(trade.t1Pnl)}` : ""} · stop a BE
              </p>
            </div>
          </li>
        ) : null}
        {open ? (
          <li className="is-now">
            <i />
            <div>
              <small>Ahora</small>
              <Stamp at={now} />
              <p>
                Marca {usd(px)} · T1 {usd(trade.t1)} · T2 {usd(trade.t2)} · lleva {fmtDur(trade.openedAt, now)}
              </p>
            </div>
          </li>
        ) : (
          <li>
            <i />
            <div>
              <small>Cierre · {exitLabel(trade.exitReason)}</small>
              <Stamp at={trade.closedAt ?? trade.openedAt} />
              <p>
                Salida {usd(trade.exit ?? 0)} · duración {fmtDur(trade.openedAt, end)}
              </p>
            </div>
          </li>
        )}
      </ol>
    </article>
  );
}

export function MercadosPaperDesk({
  userId,
  interval,
  pairs,
}: {
  userId: number;
  interval: string;
  pairs: PaperPairOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [muted, setMuted] = useState(() => isRoxyMuted());
  const [book, setBook] = useState<PaperBook>(() => loadPaperBook(userId));
  const [fund, setFund] = useState(() => String(Math.round(loadPaperBook(userId).initialUsd)));
  const [cap, setCap] = useState(() => String(loadPaperBook(userId).maxOps));
  const [dayCap, setDayCap] = useState(() => String(loadPaperBook(userId).maxOpsDay));
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [sigs, setSigs] = useState<BtcTradeSignal[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const bookRef = useRef(book);
  bookRef.current = book;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const iv = interval === "LIVE" ? "1s" : interval;
  const tag = (symbol: string) => pairTag(pairs, symbol);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hydrated.current = false;
    void (async () => {
      try {
        const remote = await getPaperBook();
        if (cancelled) return;
        if (remote.book) {
          setBook(remote.book);
          setFund(String(Math.round(remote.book.initialUsd)));
          setCap(String(remote.book.maxOps));
          setDayCap(String(remote.book.maxOpsDay));
          savePaperBook(userId, remote.book);
        } else {
          const local = loadPaperBook(userId);
          local.runInterval = iv;
          const saved = await putPaperBook({ seed: local, runInterval: iv });
          if (cancelled) return;
          setBook(saved.book);
          setFund(String(Math.round(saved.book.initialUsd)));
          setCap(String(saved.book.maxOps));
          setDayCap(String(saved.book.maxOpsDay));
          savePaperBook(userId, saved.book);
        }
      } catch {
        const b = loadPaperBook(userId);
        if (cancelled) return;
        setBook(b);
        setFund(String(Math.round(b.initialUsd)));
        setCap(String(b.maxOps));
        setDayCap(String(b.maxOpsDay));
      } finally {
        hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (book.runInterval === iv) return;
    void putPaperBook({ runInterval: iv })
      .then((r) => {
        setBook(r.book);
        savePaperBook(userId, r.book);
      })
      .catch(() => undefined);
  }, [iv, userId, book.runInterval]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const cur = bookRef.current;
      const want = new Set<string>();
      if (cur.universe === "ALL") for (const p of pairs) want.add(p.binance);
      else want.add(cur.universe);
      for (const p of cur.positions) want.add(p.symbol);
      const [remote, results] = await Promise.all([
        getPaperBook().catch(() => ({ book: null as PaperBook | null })),
        want.size
          ? Promise.allSettled([...want].map((symbol) => getBtcTradeSignal({ symbol, interval: iv })))
          : Promise.resolve([] as PromiseSettledResult<{ signal: BtcTradeSignal }>[]),
      ]);
      if (cancelled) return;
      if (remote.book) {
        const prev = bookRef.current;
        setBook(remote.book);
        savePaperBook(userId, remote.book);
        setFund(String(Math.round(remote.book.initialUsd)));
        setCap(String(remote.book.maxOps));
        if (remote.book.fills[0] && remote.book.fills[0].at !== prev.fills[0]?.at) {
          const ev = remote.book.fills[0];
          const name = tag(ev.symbol);
          if (ev.action === "open") {
            playMarketplaceCartItemAddedSound();
            showToast(`${ev.note || ev.action} ${name} @ ${usd(ev.price)}`, "success", ROXY);
            if (!mutedRef.current) speakRoxy(`Abrí ${name} a ${usd(ev.price)}`);
          } else if (ev.action === "close" || ev.action === "scale") {
            playMarketplaceCartItemRemovedSound();
            const pnl = ev.pnl ?? 0;
            showToast(`${name} ${pnl >= 0 ? "+" : ""}${usd(pnl)}`, pnl >= 0 ? "success" : "warning", ROXY);
            if (!mutedRef.current) {
              speakRoxy(
                ev.action === "scale"
                  ? `T1 en ${name}. ${pnl >= 0 ? "En verde" : "En rojo"} ${usd(pnl)}`
                  : `Cerré ${name}. ${pnl >= 0 ? "Ganancia" : "Pérdida"} ${usd(pnl)}`,
              );
            }
          }
        }
      }
      const nextSigs = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.signal] : []));
      if (nextSigs.length) {
        setSigs(nextSigs);
        const nextMarks: Record<string, number> = {};
        for (const s of nextSigs) nextMarks[s.symbol] = s.price;
        setMarks((prev) => ({ ...prev, ...nextMarks }));
      }
    };
    void poll();
    const t = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [userId, iv, pairs]);

  const eq = paperEquity(book, marks);
  const ret = book.initialUsd > 0 ? ((eq - book.initialUsd) / book.initialUsd) * 100 : 0;
  const dd = book.peakUsd > 0 ? ((eq - book.peakUsd) / book.peakUsd) * 100 : 0;
  const tradesN = book.wins + book.losses;
  const wr = tradesN > 0 ? (book.wins / tradesN) * 100 : 0;
  const posN = book.positions.length;
  const uniLabel = book.universe === "ALL" ? "todas las monedas" : tag(book.universe);
  const atCap = paperAtOpsCap(book);
  const left = paperOpsLeft(book);
  const ledger = useMemo(() => splitPaperTrades(book), [book]);
  const liveTalk = useMemo(() => narratePaper(book, sigs, [], tag), [book, sigs, pairs]);
  const alert = useMemo(() => paperEntryAlert(book, sigs), [book, sigs]);
  const prep = useMemo(() => paperPrepProcess(book, sigs), [book, sigs]);

  const status = useMemo(() => {
    if (!book.armed) return "PAUSA";
    if (atCap && !posN) return "TOPE";
    if (posN > 1) return `${posN} OPS`;
    if (posN === 1) return book.positions[0]!.side === "long" ? "LARGO" : "CORTO";
    return "ESPERA";
  }, [book.armed, book.positions, posN, atCap]);

  const persistPatch = (patch: Parameters<typeof putPaperBook>[0], fallback?: PaperBook) => {
    if (fallback) {
      setBook(fallback);
      savePaperBook(userId, fallback);
    }
    void putPaperBook(patch)
      .then((r) => {
        setBook(r.book);
        savePaperBook(userId, r.book);
        setFund(String(Math.round(r.book.initialUsd)));
        setCap(String(r.book.maxOps));
        setDayCap(String(r.book.maxOpsDay));
      })
      .catch(() => undefined);
  };

  const venue = paperVenueOf(book.mode);
  const dir = paperDirOf(book.mode);
  const lev = paperEffectiveLev(book.mode, book.leverage);
  const dayUsed = paperOpsToday(book);
  const dayHit = paperAtDayCap(book);
  const style = (book.style ?? "auto") as PaperStyle;

  const setVenue = (nextVenue: PaperVenue) => {
    if (nextVenue === "spot") {
      const mode = composePaperMode("spot", "long");
      persistPatch({ mode, leverage: 1 }, { ...book, mode, leverage: 1 });
      return;
    }
    const nextLev = (lev < 2 ? 2 : lev) as PaperLev;
    const mode = composePaperMode("futures", dir === "short" || dir === "both" ? dir : "both");
    persistPatch({ mode, leverage: nextLev }, { ...book, mode, leverage: nextLev });
  };

  const setDir = (nextDir: PaperDir) => {
    if (venue === "spot") return;
    const mode = composePaperMode("futures", nextDir);
    persistPatch({ mode }, { ...book, mode });
  };

  const setLev = (nextLev: PaperLev) => {
    if (venue === "spot") return;
    persistPatch({ leverage: nextLev }, { ...book, leverage: nextLev });
  };

  const setUniverse = (universe: PaperUniverse) => {
    persistPatch({ universe }, { ...book, universe });
  };

  const applyCap = () => {
    const n = clampPaperMaxOps(Number(cap));
    setCap(String(n));
    if (n === book.maxOps) return;
    persistPatch({ maxOps: n }, { ...book, maxOps: n });
    showToast(`Tope en ${n} operaciones`, "info", ROXY);
  };

  const applyDayCap = () => {
    const n = clampPaperMaxOpsDay(Number(dayCap));
    setDayCap(String(n));
    if (n === book.maxOpsDay) return;
    persistPatch({ maxOpsDay: n }, { ...book, maxOpsDay: n });
    showToast(`Máximo ${n} operaciones por día`, "info", ROXY);
  };

  const modeHint =
    venue === "spot" ? "Spot Long" : `Fut x${lev} · ${dir === "both" ? "L+S" : dir === "short" ? "Short" : "Long"}`;
  const dayLeft = Math.max(0, clampPaperMaxOpsDay(book.maxOpsDay) - dayUsed);

  return (
    <div className={`tv-paper hrs-card sgi-glass-panel${posN ? " tv-paper--multi" : ""}${open ? " is-open" : ""}`}>
      <div className="tv-paper__head">
        <button type="button" className="tv-paper__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span>
            {ROXY}
            <em>
              {book.armed ? "24/7 en servidor" : "Pausada"} · {book.universe === "ALL" ? "Todas" : tag(book.universe)} ·{" "}
              {book.opsUsed}/{book.maxOps} ops
            </em>
          </span>
          <strong className={ret >= 0 ? "is-up" : "is-down"}>{usd(eq)}</strong>
          <i className={`tv-paper__chev${open ? " is-open" : ""}`} aria-hidden />
        </button>
        <button
          type="button"
          className={`tv-paper__voice${muted ? " is-muted" : ""}`}
          title={muted ? "Roxy está muda" : "Roxy habla"}
          aria-pressed={!muted}
          aria-label={muted ? "Activar voz de Roxy" : "Dejar muda a Roxy"}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setRoxyMuted(next);
            if (next) hushRoxy();
          }}
        >
          {muted ? "Muda" : "Voz"}
        </button>
        {open ? (
          <button
            type="button"
            className={`tv-paper__arm${book.armed ? " is-on" : ""}`}
            onClick={() => {
              persistPatch({ armed: !book.armed }, { ...book, armed: !book.armed });
            }}
          >
            {book.armed ? "ON" : "OFF"}
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <div className="tv-paper__uni" role="group" aria-label={`Moneda de ${ROXY}`}>
            <button type="button" className={book.universe === "ALL" ? "is-on" : ""} onClick={() => setUniverse("ALL")}>
              Todas
            </button>
            {pairs.map((p) => (
              <button
                key={p.binance}
                type="button"
                className={book.universe === p.binance ? "is-on" : ""}
                onClick={() => setUniverse(p.binance)}
              >
                {p.label.replace("/USDT", "")}
              </button>
            ))}
          </div>

          <div className={`tv-paper-alert tv-paper-alert--${alert.light}`} role="status">
            <div className="tv-paper-alert__lights" aria-hidden>
              <i className={alert.light === "red" ? "is-on" : ""} />
              <i className={alert.light === "yellow" ? "is-on" : ""} />
              <i className={alert.light === "green" ? "is-on" : ""} />
            </div>
            <div className="tv-paper-alert__copy">
              <strong>{alert.headline}</strong>
              <em>{alert.detail}</em>
            </div>
            <b className="tv-paper-alert__score">{alert.score}</b>
          </div>

          <PrepMeter target={prep.pct} stage={prep.stage} intent={prep.intent} />

          <AgentOpinion notes={book.notes} live={liveTalk} muted={muted || !open} />

          <div className="tv-paper__acct">
            <div className="tv-paper__eq">
              <strong className={ret >= 0 ? "is-up" : "is-down"}>{usd(eq)}</strong>
              <span className={ret >= 0 ? "is-up" : "is-down"} title="Resultado vs el fondeo inicial">
                {ret >= 0 ? "+" : ""}
                {ret.toFixed(2)}%
              </span>
            </div>
            <Spark values={book.equityHist} />
            <div className="tv-paper__kpis">
              <div>
                <span>Estado</span>
                <strong>{status}</strong>
              </div>
              <div>
                <span>Win rate</span>
                <strong>{tradesN ? `${wr.toFixed(0)}%` : "—"}</strong>
              </div>
              <div>
                <span title="Caída desde el máximo de la cuenta">Caída</span>
                <strong className={dd < 0 ? "is-down" : ""}>
                  {dd >= 0 ? "0.00%" : `${dd.toFixed(2)}%`}
                </strong>
              </div>
              <div>
                <span>Tope</span>
                <strong className={atCap ? "is-down" : ""}>
                  {book.opsUsed}/{book.maxOps}
                </strong>
              </div>
            </div>

            <div className="tv-paper__fund">
              <label>
                Fondeo USD
                <input type="number" min={100} step={100} value={fund} onChange={(e) => setFund(e.target.value)} />
              </label>
              <label>
                Tope de ops
                <input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  onBlur={applyCap}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCap();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const n = Number(fund);
                  if (!Number.isFinite(n) || n < 100) return;
                  const maxOps = clampPaperMaxOps(Number(cap) || book.maxOps);
                  persistPatch({ reset: { fund: n, maxOps } });
                  setCap(String(maxOps));
                  showToast(`Cuenta paper en ${usd(n)} · tope ${maxOps}`, "info", ROXY);
                }}
              >
                Reiniciar
              </button>
            </div>
            <p className="tv-paper__capline">
              {atCap
                ? "Tope completo: no abre más; solo cierra o gestiona lo que ya está abierto."
                : `Puede abrir ${left} operación${left === 1 ? "" : "es"} más en esta cuenta.`}
            </p>
          </div>

          <section className="tv-paper-ledger">
            <header>
              <h3>Operaciones</h3>
              <span>
                {ledger.open.length} abiertas · {ledger.closed.length} cerradas
              </span>
            </header>
            {ledger.open.length ? (
              <div className="tv-paper-ledger__block">
                <h4>Abiertas</h4>
                {ledger.open.map((t) => (
                  <TradeCard key={t.id} trade={t} tag={tag(t.symbol)} mark={marks[t.symbol]} now={nowTick} />
                ))}
              </div>
            ) : (
              <p className="tv-paper__pos is-flat">
                {atCap
                  ? "Sin posición abierta · tope de operaciones alcanzado."
                  : `Sin posición · espera COMPRAR/VENDER con alineación ≥ 58%${book.universe === "ALL" ? " en cualquier moneda" : ` en ${uniLabel}`}.`}
              </p>
            )}
            {ledger.closed.length ? (
              <div className="tv-paper-ledger__block">
                <h4>Cerradas</h4>
                <div className="tv-paper-ledger__closed">
                  {ledger.closed.map((t) => (
                    <TradeCard key={t.id} trade={t} tag={tag(t.symbol)} now={nowTick} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="tv-paper-ledger__empty">Todavía no hay cierres en esta cuenta.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
