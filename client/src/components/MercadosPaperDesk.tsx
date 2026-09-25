import { useEffect, useMemo, useRef, useState } from "react";
import type { BtcTradeSignal } from "../lib/api";
import {
  loadPaperBook,
  paperEquity,
  resetPaperBook,
  savePaperBook,
  tickPaper,
  type PaperBook,
} from "../lib/mercadosPaperAgent";
import { showToast } from "./ToastNotification";
import { playMarketplaceCartItemAddedSound, playMarketplaceCartItemRemovedSound } from "../lib/marketplaceCartSound";

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
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

export function MercadosPaperDesk({
  userId,
  signal,
  pairLabel,
  binance,
}: {
  userId: number;
  signal: BtcTradeSignal | null;
  pairLabel: string;
  binance: string;
}) {
  const symbol = binance;
  const [open, setOpen] = useState(false);
  const [book, setBook] = useState<PaperBook>(() => loadPaperBook(userId, symbol));
  const [fund, setFund] = useState(() => String(Math.round(loadPaperBook(userId, symbol).initialUsd)));
  const bookRef = useRef(book);
  bookRef.current = book;

  useEffect(() => {
    const b = loadPaperBook(userId, symbol);
    setBook(b);
    setFund(String(Math.round(b.initialUsd)));
  }, [userId, symbol]);

  useEffect(() => {
    if (!signal || signal.symbol !== symbol) return;
    const { book: next, events } = tickPaper(bookRef.current, signal);
    const changed =
      events.length > 0 ||
      next.cashUsd !== book.cashUsd ||
      next.confirm !== book.confirm ||
      next.position?.stop !== book.position?.stop ||
      next.equityHist.length !== book.equityHist.length;
    if (!changed) return;
    setBook(next);
    savePaperBook(userId, symbol, next);
    for (const ev of events) {
      if (ev.kind === "open") {
        playMarketplaceCartItemAddedSound();
        showToast(`${ev.note} ${pairLabel} @ ${usd(ev.price)}`, "success", "Agente paper");
      } else {
        playMarketplaceCartItemRemovedSound();
        const pnl = ev.pnl ?? 0;
        showToast(
          `${ev.note} ${pnl >= 0 ? "+" : ""}${usd(pnl)}`,
          pnl >= 0 ? "success" : "warning",
          "Agente paper",
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick only on new confluence snapshot
  }, [signal?.updatedAt, signal?.price, signal?.bias, symbol, userId, pairLabel]);

  const px = signal?.price ?? 0;
  const eq = paperEquity(book, px || book.cashUsd);
  const ret = book.initialUsd > 0 ? ((eq - book.initialUsd) / book.initialUsd) * 100 : 0;
  const dd = book.peakUsd > 0 ? ((eq - book.peakUsd) / book.peakUsd) * 100 : 0;
  const trades = book.wins + book.losses;
  const wr = trades > 0 ? (book.wins / trades) * 100 : 0;
  const pos = book.position;
  const uPnl = pos && px ? pos.qty * (px - pos.entry) : 0;

  const status = useMemo(() => {
    if (!book.armed) return "PAUSA";
    if (pos) return pos.side === "long" ? "LARGO" : "CORTO";
    if (book.lastFire === "wait") return "ESPERA";
    return "BUSCANDO";
  }, [book.armed, book.lastFire, pos]);

  return (
    <div className={`tv-paper hrs-card sgi-glass-panel tv-paper--${pos?.side ?? "flat"}${open ? " is-open" : ""}`}>
      <button type="button" className="tv-paper__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          Agente paper
          <em>Simulación</em>
        </span>
        <strong className={ret >= 0 ? "is-up" : "is-down"}>{usd(eq)}</strong>
        <i className={`tv-paper__chev${open ? " is-open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <>
      <div className="tv-paper__top">
        <p className="tv-paper__disc">
          Opera {pairLabel} con la confluencia del escritorio. 1% de riesgo, stop ATR, T1 50% y T2. No es dinero real.
        </p>
        <button
          type="button"
          className={`tv-paper__arm${book.armed ? " is-on" : ""}`}
          onClick={() => {
            const next = { ...book, armed: !book.armed };
            setBook(next);
            savePaperBook(userId, symbol, next);
          }}
        >
          {book.armed ? "ON" : "OFF"}
        </button>
      </div>
      <div className="tv-paper__eq">
        <strong className={ret >= 0 ? "is-up" : "is-down"}>{usd(eq)}</strong>
        <span className={ret >= 0 ? "is-up" : "is-down"}>
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
          <strong>{trades ? `${wr.toFixed(0)}%` : "—"}</strong>
        </div>
        <div>
          <span>DD</span>
          <strong className={dd < 0 ? "is-down" : ""}>{dd.toFixed(1)}%</strong>
        </div>
        <div>
          <span>Ops</span>
          <strong>
            {book.wins}W {book.losses}L
          </strong>
        </div>
      </div>
      {pos ? (
        <div className="tv-paper__pos">
          <span>
            {pos.side === "long" ? "Largo" : "Corto"} · {Math.abs(pos.qty).toFixed(6)}
          </span>
          <strong className={uPnl >= 0 ? "is-up" : "is-down"}>
            {uPnl >= 0 ? "+" : ""}
            {usd(uPnl)}
          </strong>
          <em>
            Entrada {usd(pos.entry)} · Stop {usd(pos.stop)} · T1 {usd(pos.t1)}
            {pos.t1Done ? " · BE" : ""}
          </em>
        </div>
      ) : (
        <div className="tv-paper__pos is-flat">Sin posición · espera COMPRAR/VENDER con alineación ≥ 58%</div>
      )}
      <div className="tv-paper__fund">
        <label>
          Fondeo USD
          <input
            type="number"
            min={100}
            step={100}
            value={fund}
            onChange={(e) => setFund(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const n = Number(fund);
            if (!Number.isFinite(n) || n < 100) return;
            const next = resetPaperBook(n);
            next.armed = book.armed;
            setBook(next);
            savePaperBook(userId, symbol, next);
            showToast(`Cuenta paper en ${usd(n)}`, "info", "Agente paper");
          }}
        >
          Reiniciar
        </button>
      </div>
      {book.fills.length ? (
        <ul className="tv-paper__fills">
          {book.fills.slice(0, 6).map((f) => (
            <li key={f.id} className={f.pnl != null && f.pnl < 0 ? "is-down" : "is-up"}>
              <span>
                {f.action === "open" ? "IN" : f.action === "scale" ? "T1" : "OUT"} {f.side === "long" ? "L" : "C"}
              </span>
              <em>{usd(f.price)}</em>
              <strong>{f.pnl != null ? usd(f.pnl) : f.reason}</strong>
            </li>
          ))}
        </ul>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
