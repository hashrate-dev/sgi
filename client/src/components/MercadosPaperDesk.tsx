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
  paperAtDayCap,
  paperAtOpsCap,
  paperDirOf,
  paperEffectiveLev,
  paperEntryAlert,
  paperPrepProcess,
  paperEquity,
  paperOpsLeft,
  paperOpsToday,
  paperStyleOf,
  paperVenueOf,
  resetPaperBook,
  roxyLiveDesk,
  savePaperBook,
  splitPaperTrades,
  type PaperBook,
  type PaperDir,
  type PaperLev,
  type PaperNote,
  type PaperTrade,
  type PaperUniverse,
  type PaperVenue,
} from "../lib/mercadosPaperAgent";
import { rankRoxyBallots, type RoxyCoinBallot } from "../lib/roxyBallot";
import { AppModal } from "./ui";
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
  if (reason === "swing") return "Swing";
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
    if (notes.length) return notes;
    return [{ ...live, id: "live" } as PaperNote];
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
    const line = (current.body || "").trim();
    if (!line || current.title === "Silencio") return;
    speakRoxy(line);
  }, [muted, current.id, current.title, current.body]);

  const older = i < feed.length - 1;
  const newer = i > 0;
  const when = fmtStamp(current.at);
  const text = isLive ? shown : current.body;
  const silent = !String(current.body || "").trim();
  const chunks = silent
    ? ["En silencio. Si no hay nada nuevo que hacer, no hablo."]
    : (text || "").split(/\n+/).filter((p) => p.length > 0);

  return (
    <blockquote className={`tv-paper-opine tv-paper-opine--${current.tone}`}>
      <RoxyFace talking={Boolean(!silent && (voicing || (isLive && !done && !muted)))} />
      <div className="tv-paper-opine__ident">
        <p className="tv-paper-opine__kicker">Opinión de {ROXY}</p>
        <p className="tv-paper-opine__title">{silent ? "Silencio" : current.title}</p>
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

function tradePnlOf(trade: PaperTrade, mark?: number): number {
  if (trade.status !== "open") return trade.realizedPnl;
  const px = mark ?? trade.entry;
  return trade.qtyLeft * (px - trade.entry) + trade.realizedPnl;
}

function TradeRow({
  trade,
  tag,
  mark,
}: {
  trade: PaperTrade;
  tag: string;
  mark?: number;
}) {
  const open = trade.status === "open";
  const pnl = tradePnlOf(trade, mark);
  const why = open ? "Abierta" : exitLabel(trade.exitReason);
  let note = open
    ? `Marca ${usd(mark ?? trade.entry)} · stop ${usd(trade.stop)}`
    : `Entró ${usd(trade.entry)} · salió ${usd(trade.exit ?? 0)}`;
  if (!open && Number.isFinite(mark) && mark != null && trade.exit != null) {
    const after = trade.side === "long" ? mark > trade.exit : mark < trade.exit;
    if (after && trade.exitReason === "stop") {
      note =
        trade.side === "long"
          ? `${note} · ahora ${usd(mark)} (subió después del stop; esa subida no entra en el P&L)`
          : `${note} · ahora ${usd(mark)} (bajó después del stop; esa baja no entra en el P&L)`;
    } else {
      note = `${note} · ahora ${usd(mark)}`;
    }
  }
  return (
    <article className={`tv-paper-row tv-paper-row--${trade.side}${open ? " is-open" : " is-closed"}`}>
      <b>
        {tag} · {trade.side === "long" ? "Largo" : "Corto"}
      </b>
      <em>{why}</em>
      <span className={pnl >= 0 ? "is-up" : "is-down"}>
        {pnl >= 0 ? "+" : ""}
        {usd(pnl)}
      </span>
      <p>{note}</p>
    </article>
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

function LiveIcon({ kind }: { kind: "do" | "see" | "think" | "news" | "chart" }) {
  if (kind === "do") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden>
        <circle className="tv-paper-live__ring" cx="16" cy="16" r="11" />
        <circle className="tv-paper-live__core" cx="16" cy="16" r="3.2" />
        <path d="M16 5.5v3.2M16 23.3v3.2M5.5 16h3.2M23.3 16h3.2" />
      </svg>
    );
  }
  if (kind === "see") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden>
        <path d="M4 16s5.2-8 12-8 12 8 12 8-5.2 8-12 8S4 16 4 16Z" />
        <circle cx="16" cy="16" r="3.4" />
      </svg>
    );
  }
  if (kind === "think") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden>
        <path d="M11.2 21.5c-2.6-1.2-4.4-3.8-4.4-6.8A7.2 7.2 0 0 1 16 7.6a7.2 7.2 0 0 1 9.2 7.1c0 3-1.8 5.6-4.4 6.8" />
        <path d="M12.5 22.4h7v3.1c0 .8-.7 1.5-1.5 1.5h-4c-.8 0-1.5-.7-1.5-1.5Z" />
        <path d="M16 11.2v4.2M13.6 13.8 16 16l2.4-2.2" />
      </svg>
    );
  }
  if (kind === "chart") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden>
        <path d="M5 24 V10 M5 24 H27" />
        <path d="M8 20 V16 M12 18 V11 M16 19 V14 M20 17 V9 M24 18 V13" />
        <path d="M6 12 H26 M6 15.5 H26 M6 19 H26" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <path d="M7 21.5V10.8L16 7.2l9 3.6v10.7L16 25.1Z" />
      <path d="M16 12.2v8.4M11.4 14.4h9.2" />
    </svg>
  );
}

function RoxyVoteBoard({ ballots }: { ballots: RoxyCoinBallot[] }) {
  const lead = ballots.find((b) => b.lead);
  return (
    <section className="tv-paper-vote" aria-label="Votación de Roxy">
      <header>
        <span>Votación</span>
        <em>
          {lead && lead.pick !== "wait"
            ? `Gana ${lead.name} ${lead.pick === "long" ? "LARGO" : "CORTO"}`
            : "Sin mayoría aún"}
        </em>
      </header>
      <ul>
        {ballots.map((b) => {
          const longPct = Math.max(b.long.score, 0) + Math.max(b.short.score, 0);
          const longW = longPct > 0 ? (Math.max(b.long.score, 0) / longPct) * 100 : 50;
          const pickTools = b.pick === "long" ? b.long.tools : b.pick === "short" ? b.short.tools : [];
          return (
            <li key={b.symbol} className={b.lead ? "is-lead" : b.pick === "wait" ? "is-wait" : ""}>
              <div className="tv-paper-vote__row">
                <b>{b.name}</b>
                <span className={`tv-paper-vote__pick is-${b.pick}`}>
                  {b.pick === "long" ? "Largo" : b.pick === "short" ? "Corto" : "Empate"}
                </span>
                <em>
                  {b.long.score.toFixed(1)} / {b.short.score.toFixed(1)}
                </em>
              </div>
              <div className="tv-paper-vote__bar" aria-hidden>
                <i style={{ width: `${longW}%` }} />
              </div>
              {b.lead && pickTools.length ? (
                <p className="tv-paper-vote__yes">
                  A favor: {pickTools.slice(0, 6).map((t) => t.label.replace(/Bandas de /i, "").replace(/Nube de /i, "")).join(" · ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type RoxyScanRow = ReturnType<typeof roxyLiveDesk>["rows"][number];

function ScanCoinCard({ r }: { r: RoxyScanRow }) {
  return (
    <li className={`tv-paper-scan__card is-${r.bias}${r.hot ? " is-hot" : ""}`}>
      <header className="tv-paper-scan__head">
        <div className="tv-paper-scan__who">
          <b>{r.name}</b>
          <span className={`tv-paper-scan__side is-${r.bias}`}>
            {r.bias === "buy" ? "Compra" : r.bias === "sell" ? "Venta" : "Espera"}
          </span>
        </div>
        <div className="tv-paper-scan__score">
          <strong>{r.confidence.toFixed(0)}</strong>
          <small>{r.confirm}</small>
        </div>
      </header>
      <ul className="tv-paper-scan__inds" aria-label={`Indicadores ${r.name}`}>
        {r.chips.map((ch) => (
          <li key={ch.id} className={`is-${ch.tone}`} title={ch.label}>
            <i aria-hidden />
            <span>{ch.label}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function RoxyScanRail({ rows }: { rows: RoxyScanRow[] }) {
  const VIS = 3;
  const n = rows.length;
  const maxI = Math.max(0, n - VIS);
  const [i, setI] = useState(0);

  useEffect(() => {
    setI((x) => Math.min(x, maxI));
  }, [maxI]);

  if (!n) return <p className="tv-paper-live__empty">Esperando lecturas de confluencia…</p>;

  const step = (d: number) => setI((x) => Math.max(0, Math.min(maxI, x + d)));
  const shown = rows.slice(i, i + VIS);
  const canUp = i > 0;
  const canDown = i < maxI;

  return (
    <div className="tv-paper-scan-rail">
      {n > VIS ? (
        <button
          type="button"
          className="tv-paper-scan-nav tv-paper-scan-nav--up"
          disabled={!canUp}
          onClick={() => step(-1)}
          aria-label="Subir"
          title="Subir"
        >
          ▲
        </button>
      ) : null}
      <div
        className="tv-paper-scan-view"
        onWheel={(e) => {
          if (n <= VIS) return;
          if (Math.abs(e.deltaY) < 10) return;
          step(e.deltaY > 0 ? 1 : -1);
        }}
      >
        <ul className="tv-paper-scan" aria-live="polite">
          {shown.map((r) => (
            <ScanCoinCard key={r.symbol} r={r} />
          ))}
        </ul>
      </div>
      {n > VIS ? (
        <button
          type="button"
          className="tv-paper-scan-nav tv-paper-scan-nav--down"
          disabled={!canDown}
          onClick={() => step(1)}
          aria-label="Bajar"
          title="Bajar"
        >
          ▼ <small>{i + 1}–{Math.min(i + VIS, n)}/{n}</small>
        </button>
      ) : null}
    </div>
  );
}

function RoxyLiveBoard({ live }: { live: ReturnType<typeof roxyLiveDesk> }) {
  const cards = [
    { kind: "do" as const, label: "Haciendo", text: live.doing },
    { kind: "see" as const, label: "Viendo", text: live.seeing },
    { kind: "think" as const, label: "Pensando", text: live.thinking },
    { kind: "chart" as const, label: "Gráfico", text: live.chart },
    { kind: "news" as const, label: "Noticias", text: live.news },
  ];
  return (
    <section className="tv-paper-live" aria-label="Qué está haciendo Roxy ahora">
      <header>
        <span>Ahora mismo</span>
        <em>{live.tf}</em>
      </header>
      <div className="tv-paper-live__grid">
        {cards.map((c) => (
          <article key={c.kind} className={`tv-paper-live__card tv-paper-live__card--${c.kind}`}>
            <i className="tv-paper-live__ico" aria-hidden>
              <LiveIcon kind={c.kind} />
            </i>
            <div className="tv-paper-live__copy">
              <span>{c.label}</span>
              <strong title={c.text}>{c.text}</strong>
            </div>
          </article>
        ))}
      </div>
      {live.rows.length ? <RoxyScanRail rows={live.rows} /> : <p className="tv-paper-live__empty">Esperando lecturas de confluencia…</p>}
    </section>
  );
}

export function MercadosPaperDesk({
  userId,
  interval,
  pairs,
  expand = false,
}: {
  userId: number;
  interval: string;
  pairs: PaperPairOpt[];
  expand?: boolean;
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
  const [movesOpen, setMovesOpen] = useState(false);
  const bookRef = useRef(book);
  bookRef.current = book;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const inflightRef = useRef(0);
  const iv = interval === "LIVE" ? "1s" : interval;
  const tag = (symbol: string) => pairTag(pairs, symbol);
  const hydrated = useRef(false);

  useEffect(() => {
    if (expand) setOpen(true);
  }, [expand]);

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
      if (remote.book && inflightRef.current === 0) {
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
  const previewOps = useMemo(() => {
    return [
      ...ledger.open.map((t) => ({ t, at: t.openedAt })),
      ...ledger.closed.map((t) => ({ t, at: t.closedAt ?? t.openedAt })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 4);
  }, [ledger]);
  const liveTalk = useMemo(() => {
    if (book.notes[0]) return book.notes[0];
    return {
      at: Date.now(),
      tone: "idle" as const,
      title: "Silencio",
      body: "",
      fingerprint: "hush",
    };
  }, [book.notes]);
  const alert = useMemo(() => paperEntryAlert(book, sigs), [book, sigs]);
  const prep = useMemo(() => paperPrepProcess(book, sigs), [book, sigs]);
  const liveDesk = useMemo(() => roxyLiveDesk(book, sigs, nowTick), [book, sigs, nowTick]);
  const ballots = useMemo(() => rankRoxyBallots(sigs, book.mind?.facts), [sigs, book.mind?.facts]);

  const status = useMemo(() => {
    if (!book.armed) return "PAUSA";
    if (atCap && !posN) return "TOPE";
    if (posN > 1) return `${posN} OPS`;
    if (posN === 1) return book.positions[0]!.side === "long" ? "LARGO" : "CORTO";
    return "ESPERA";
  }, [book.armed, book.positions, posN, atCap]);

  const persistPatch = (patch: Parameters<typeof putPaperBook>[0], fallback?: PaperBook) => {
    inflightRef.current += 1;
    if (fallback) {
      setBook(fallback);
      savePaperBook(userId, fallback);
      bookRef.current = fallback;
      setFund(String(Math.round(fallback.initialUsd)));
      setCap(String(fallback.maxOps));
      setDayCap(String(fallback.maxOpsDay));
    }
    void putPaperBook(patch)
      .then((r) => {
        if (inflightRef.current > 1) return;
        setBook(r.book);
        savePaperBook(userId, r.book);
        bookRef.current = r.book;
        setFund(String(Math.round(r.book.initialUsd)));
        setCap(String(r.book.maxOps));
        setDayCap(String(r.book.maxOpsDay));
      })
      .catch(() => undefined)
      .finally(() => {
        inflightRef.current = Math.max(0, inflightRef.current - 1);
      });
  };

  const venue = paperVenueOf(book.mode);
  const dir = paperDirOf(book.mode);
  const lev = paperEffectiveLev(book.mode, book.leverage);
  const dayUsed = paperOpsToday(book);
  const dayHit = paperAtDayCap(book);
  const style = paperStyleOf(book);

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
    const leverage = clampPaperLev(nextLev);
    persistPatch({ leverage }, { ...book, leverage });
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

  const restartAccount = () => {
    const n = Number(fund);
    if (!Number.isFinite(n) || n < 100) return;
    const maxOps = clampPaperMaxOps(Number(cap) || book.maxOps);
    const next = resetPaperBook(n, book.universe, maxOps, book.mode, book.leverage);
    next.armed = book.armed;
    next.runInterval = book.runInterval;
    next.riskPct = book.riskPct;
    next.sizePct = book.sizePct;
    next.minConf = book.minConf;
    next.t1Pct = book.t1Pct;
    next.style = book.style;
    next.swingDays = book.swingDays;
    next.maxOpsDay = clampPaperMaxOpsDay(Number(dayCap) || book.maxOpsDay);
    next.mind = book.mind;
    persistPatch({ reset: { fund: n, maxOps }, maxOpsDay: next.maxOpsDay }, next);
    showToast(`Cuenta paper en ${usd(n)} · tope ${maxOps}`, "info", ROXY);
  };

  const dayLeft = Math.max(0, clampPaperMaxOpsDay(book.maxOpsDay) - dayUsed);
  const dirHint = dir === "both" ? "Long y short" : dir === "short" ? "Short" : "Long";
  const venueHint = venue === "spot" ? "Spot" : `Fut ×${lev}`;

  return (
    <div className={`tv-paper hrs-card sgi-glass-panel${posN ? " tv-paper--multi" : ""}${open ? " is-open" : ""}`}>
      <div className="tv-paper__head">
        <button type="button" className="tv-paper__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span>
            {ROXY}
            <em className="tv-paper__pills" aria-label="Cómo opera Roxy">
              <i className={book.armed ? "is-live" : "is-off"} title={book.armed ? "Sigue operando en el servidor si cierras esta pantalla" : "Roxy está pausada"}>
                {book.armed ? "En vivo" : "Pausada"}
              </i>
              <i title="Estilo">{style === "swing" ? "Swing" : "Scalp"}</i>
              <i title="Mercado">{venueHint}</i>
              <i title="Dirección">{dirHint}</i>
              <i title="Universo">{book.universe === "ALL" ? "Todas" : tag(book.universe)}</i>
              <i className={atCap ? "is-warn" : ""} title="Operaciones usadas / tope de la cuenta">
                {book.opsUsed}/{book.maxOps}
              </i>
              {dayHit ? (
                <i className="is-warn" title="Llegó al máximo de operaciones de hoy">
                  Tope día
                </i>
              ) : null}
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
          {muted ? (
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
              <path d="M3.2 8.2 H6.1 L10.4 4.6 V15.4 L6.1 11.8 H3.2 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12.6 8.2 L16.6 12.2 M16.6 8.2 L12.6 12.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
              <path d="M3.2 8.2 H6.1 L10.4 4.6 V15.4 L6.1 11.8 H3.2 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12.8 7.2 A4.2 4.2 0 0 1 12.8 12.8 M14.8 5.4 A7 7 0 0 1 14.8 14.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={`tv-paper__cfg${cfgOpen ? " is-on" : ""}`}
          title="Configurar a Roxy"
          aria-pressed={cfgOpen}
          aria-label="Configuración de Roxy"
          onClick={() => {
            setCfgOpen((v) => !v);
            setOpen(true);
          }}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
            <circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10 3.2 V4.8 M10 15.2 V16.8 M3.2 10 H4.8 M15.2 10 H16.8 M5.2 5.2 L6.4 6.4 M13.6 13.6 L14.8 14.8 M14.8 5.2 L13.6 6.4 M6.4 13.6 L5.2 14.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {open ? (
          <button
            type="button"
            className={`tv-paper__arm${book.armed ? " is-on" : ""}`}
            title={book.armed ? "Roxy está encendida" : "Roxy está apagada"}
            aria-pressed={book.armed}
            aria-label={book.armed ? "Apagar a Roxy" : "Encender a Roxy"}
            onClick={() => {
              persistPatch({ armed: !book.armed }, { ...book, armed: !book.armed });
            }}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
              <path d="M10 3.4 V10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M6.2 5.6 A5.6 5.6 0 1 0 13.8 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <AgentOpinion notes={book.notes} live={liveTalk} muted={muted || !open} />

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

          {cfgOpen ? (
            <div className="tv-paper-cfg" role="form" aria-label="Configuración de Roxy">
              <div className="tv-paper-cfg__row">
                <span>Tipo</span>
                <div>
                  <CfgBtn on={venue === "spot"} onClick={() => setVenue("spot")}>
                    Spot
                  </CfgBtn>
                  <CfgBtn on={venue === "futures"} onClick={() => setVenue("futures")}>
                    Futuro
                  </CfgBtn>
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>Apalancamiento</span>
                <div>
                  <CfgBtn on={lev === 2} disabled={venue === "spot"} onClick={() => setLev(2)}>
                    x2
                  </CfgBtn>
                  <CfgBtn on={lev === 3} disabled={venue === "spot"} onClick={() => setLev(3)}>
                    x3
                  </CfgBtn>
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>Dirección</span>
                <div>
                  <CfgBtn on={dir === "long"} onClick={() => setDir("long")}>
                    Long
                  </CfgBtn>
                  <CfgBtn on={dir === "short"} disabled={venue === "spot"} onClick={() => setDir("short")}>
                    Short
                  </CfgBtn>
                  <CfgBtn on={dir === "both"} disabled={venue === "spot"} onClick={() => setDir("both")}>
                    Ambos
                  </CfgBtn>
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>Riesgo %</span>
                <div>
                  {([0.5, 1, 2, 3, 5] as const).map((n) => (
                    <CfgBtn
                      key={n}
                      on={clampPaperRiskPct(book.riskPct) === n}
                      onClick={() => persistPatch({ riskPct: n }, { ...book, riskPct: n })}
                    >
                      {n}
                    </CfgBtn>
                  ))}
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>Tamaño %</span>
                <div>
                  {([10, 25, 50, 75] as const).map((n) => (
                    <CfgBtn
                      key={n}
                      on={clampPaperSizePct(book.sizePct) === n}
                      onClick={() => persistPatch({ sizePct: n }, { ...book, sizePct: n })}
                    >
                      {n}
                    </CfgBtn>
                  ))}
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>Mín. alineación</span>
                <div>
                  {([50, 58, 65, 75] as const).map((n) => (
                    <CfgBtn
                      key={n}
                      on={clampPaperMinConf(book.minConf) === n}
                      onClick={() => persistPatch({ minConf: n }, { ...book, minConf: n })}
                    >
                      {n}
                    </CfgBtn>
                  ))}
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>T1 %</span>
                <div>
                  {([25, 50, 75] as const).map((n) => (
                    <CfgBtn
                      key={n}
                      on={clampPaperT1Pct(book.t1Pct) === n}
                      onClick={() => persistPatch({ t1Pct: n }, { ...book, t1Pct: n })}
                    >
                      {n}
                    </CfgBtn>
                  ))}
                </div>
              </div>
              <div className="tv-paper-cfg__row tv-paper-cfg__row--wide">
                <span>Operar</span>
                <div>
                  <CfgBtn
                    on={style === "intraday"}
                    onClick={() => persistPatch({ style: "intraday" }, { ...book, style: "intraday" })}
                  >
                    Scalping intradía
                  </CfgBtn>
                  <CfgBtn
                    on={style === "swing"}
                    onClick={() => persistPatch({ style: "swing" }, { ...book, style: "swing" })}
                  >
                    Swing trading
                  </CfgBtn>
                </div>
              </div>
              <div className="tv-paper-cfg__row">
                <span>Ops / día</span>
                <label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={dayCap}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDayCap(raw);
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n < 1) return;
                      const maxOpsDay = clampPaperMaxOpsDay(n);
                      if (maxOpsDay === book.maxOpsDay) return;
                      persistPatch({ maxOpsDay }, { ...book, maxOpsDay });
                    }}
                    onBlur={applyDayCap}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyDayCap();
                      }
                    }}
                  />
                </label>
              </div>
              <p>
                Spot solo long, sin apalancar. Short únicamente en futuros.{" "}
                {style === "swing"
                  ? "Swing: cierra por stop, objetivo o giro de sesgo; no por calendario."
                  : "Scalping: cierra el mismo día, velas de 1s a 1h."}{" "}
                Hoy: {dayUsed} usadas, {dayLeft} libres.
              </p>
            </div>
          ) : null}

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

          <RoxyVoteBoard ballots={ballots} />

          <RoxyLiveBoard live={liveDesk} />

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
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCap(raw);
                    const n = Number(raw);
                    if (!Number.isFinite(n) || n < 1) return;
                    const maxOps = clampPaperMaxOps(n);
                    if (maxOps === book.maxOps) return;
                    persistPatch({ maxOps }, { ...book, maxOps });
                  }}
                  onBlur={applyCap}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCap();
                    }
                  }}
                />
              </label>
              <button type="button" onClick={restartAccount}>
                Reiniciar
              </button>
            </div>
            <p className="tv-paper__capline">
              {dayHit
                ? "Tope del día: no abre más hasta mañana (horario Uruguay)."
                : atCap
                  ? "Tope completo: no abre más; solo cierra o gestiona lo que ya está abierto."
                  : `Puede abrir ${left} más en la cuenta · ${dayLeft} hoy.`}
            </p>
          </div>

          <section className="tv-paper-ledger">
            <header>
              <h3>Operaciones</h3>
              <span>
                {ledger.open.length} abiertas · {ledger.closed.length} cerradas
              </span>
            </header>
            {previewOps.length ? (
              <>
                <ul className="tv-paper-ledger__preview">
                  {previewOps.map(({ t }) => (
                    <li key={t.id}>
                      <TradeRow trade={t} tag={tag(t.symbol)} mark={marks[t.symbol]} />
                    </li>
                  ))}
                </ul>
                <button type="button" className="tv-paper-ledger__more" onClick={() => setMovesOpen(true)}>
                  Ver todos los movimientos
                </button>
              </>
            ) : (
              <p className="tv-paper__pos is-flat">
                {atCap
                  ? "Sin posición abierta · tope de operaciones alcanzado."
                  : `Sin posición · espera COMPRAR/VENDER con alineación ≥ 58%${book.universe === "ALL" ? " en cualquier moneda" : ` en ${uniLabel}`}.`}
              </p>
            )}
          </section>

          <AppModal
            open={movesOpen}
            onOpenChange={setMovesOpen}
            title={`Movimientos de ${ROXY}`}
            description={`${ledger.open.length} abiertas · ${ledger.closed.length} cerradas`}
            size="lg"
            contentMaxW="min(100%, 520px)"
            variant="nicehash_watcher"
            contentClassName="tv-paper-moves-modal"
            blurBackdrop
          >
            <div className="tv-paper-moves">
              {ledger.open.length ? (
                <section className="tv-paper-moves__block">
                  <h4>Abiertas</h4>
                  {ledger.open.map((t) => (
                    <TradeCard key={t.id} trade={t} tag={tag(t.symbol)} mark={marks[t.symbol]} now={nowTick} />
                  ))}
                </section>
              ) : null}
              {ledger.closed.length ? (
                <section className="tv-paper-moves__block">
                  <h4>Cerradas</h4>
                  {ledger.closed.map((t) => (
                    <TradeCard key={t.id} trade={t} tag={tag(t.symbol)} mark={marks[t.symbol]} now={nowTick} />
                  ))}
                </section>
              ) : (
                <p className="tv-paper-moves__empty">Todavía no hay cierres en esta cuenta.</p>
              )}
            </div>
          </AppModal>
        </>
      ) : null}
    </div>
  );
}
