import type { BtcTradeSignal } from "./api";
import type { RoxyCoinBallot } from "./roxyBallot";
import { isRoxyNewsToday, roxyNewsTiltScore, type RoxyFact } from "./roxyMind";

export type RoxyHorizonId = "1d" | "1w" | "1m" | "12m";

export type RoxyHorizonBand = {
  id: RoxyHorizonId;
  label: string;
  play: string;
  min: number;
  max: number;
  mid: number;
  now: number;
  minPct: number;
  maxPct: number;
  midPct: number;
  upPct: number;
  downPct: number;
  bias: "buy" | "sell" | "wait";
  note: string;
};

export type RoxyHorizonCoin = {
  symbol: string;
  name: string;
  price: number;
  conviction: number;
  bias: "buy" | "sell" | "wait";
  drivers: string[];
  news: string[];
  thesis: string;
  bands: RoxyHorizonBand[];
};

const HORIZONS: Array<{
  id: RoxyHorizonId;
  label: string;
  play: string;
  days: number;
  volMul: number;
  driftMul: number;
  z: number;
}> = [
  { id: "1d", label: "1 día", play: "Scalp", days: 1, volMul: 1.06, driftMul: 0.38, z: 1.08 },
  { id: "1w", label: "1 semana", play: "Swing", days: 5, volMul: 1.14, driftMul: 0.92, z: 1.28 },
  { id: "1m", label: "1 mes", play: "Posición", days: 21, volMul: 1.2, driftMul: 1.55, z: 1.42 },
  { id: "12m", label: "12 meses", play: "Régimen", days: 252, volMul: 0.74, driftMul: 2.15, z: 1.68 },
];

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function coinName(symbol: string): string {
  return symbol.replace(/USDT$/i, "");
}

function dailyAtrPct(s: BtcTradeSignal): number {
  const px = s.price || 0;
  if (!(px > 0)) return 0.02;
  const day =
    Number.isFinite(s.rangeDayHigh) && Number.isFinite(s.rangeDayLow) && (s.rangeDayHigh as number) > (s.rangeDayLow as number)
      ? ((s.rangeDayHigh as number) - (s.rangeDayLow as number)) / px
      : 0;
  const stopW = s.stop > 0 ? Math.abs(px - s.stop) / px : 0;
  const invW = s.invalidation > 0 ? Math.abs(px - s.invalidation) / px : 0;
  let v = Math.max(day, stopW * 1.55, invW * 1.15, 0.011);
  if ((s.volRatio ?? 1) > 1.45) v *= 1.14;
  if ((s.volRatio ?? 1) < 0.72) v *= 0.9;
  if (s.rsi > 78 || s.rsi < 22) v *= 1.08;
  return clamp(v, 0.007, 0.14);
}

function signedEdge(s: BtcTradeSignal, ballot: RoxyCoinBallot | undefined, news: number): number {
  const desk = s.bias === "buy" ? 1 : s.bias === "sell" ? -1 : 0;
  const st = s.supertrendDir === 1 ? 1 : -1;
  const ema = s.price >= s.ema200 ? 1 : -1;
  const macd = s.macdHist > 0 ? 1 : s.macdHist < 0 ? -1 : 0;
  const rsi = s.rsi >= 62 ? 0.45 : s.rsi <= 38 ? -0.45 : (s.rsi - 50) / 80;
  const cloud = s.ichiCloud === "above" ? 0.55 : s.ichiCloud === "below" ? -0.55 : 0;
  const psar = s.psarDir === 1 ? 0.35 : s.psarDir === -1 ? -0.35 : 0;
  const conf = clamp((s.confidence || 0) / 100, 0, 1);
  const tally = ballot ? (ballot.long.score - ballot.short.score) / 12 : 0;
  const newsN = clamp(news / 2.4, -1, 1);
  const raw =
    0.18 * desk +
    0.14 * st +
    0.12 * ema +
    0.1 * macd +
    0.07 * rsi +
    0.09 * cloud +
    0.05 * psar +
    0.13 * newsN +
    0.12 * clamp(tally, -1, 1);
  return clamp(raw * (0.5 + 0.5 * conf), -1, 1);
}

function voteLean(ballot: RoxyCoinBallot | undefined): number {
  if (!ballot) return 0;
  const span = Math.abs(ballot.long.score) + Math.abs(ballot.short.score) || 1;
  return clamp((ballot.long.score - ballot.short.score) / span, -1, 1);
}

/** Imán de precio: EMAs, nube, Supertrend, PSAR, bandas. */
function toolMagnets(s: BtcTradeSignal): number[] {
  const out: number[] = [];
  if (s.ema25 > 0) out.push(s.ema25);
  if (s.ema50 > 0) out.push(s.ema50);
  if (s.ema200 > 0) out.push(s.ema200);
  if ((s.ichiTenkan ?? 0) > 0) out.push(s.ichiTenkan as number);
  if ((s.ichiKijun ?? 0) > 0) out.push(s.ichiKijun as number);
  if ((s.bbMid ?? 0) > 0) out.push(s.bbMid as number);
  if (s.supertrend > 0) out.push(s.supertrend);
  if (s.psar > 0) out.push(s.psar);
  return out;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Precio que Roxy apunta en esa temporalidad, con el mix de herramientas. */
function predictMark(
  s: BtcTradeSignal,
  ballot: RoxyCoinBallot | undefined,
  news: number,
  atr: number,
  h: (typeof HORIZONS)[number],
  edge: number,
): number {
  const px = s.price;
  const vote = voteLean(ballot);
  const magnets = toolMagnets(s);
  const magnet = magnets.length ? mean(magnets) : px;
  const path = Math.sqrt(h.days);
  const lean = clamp(0.46 * edge + 0.34 * vote + 0.2 * Math.sign(magnet - px || edge), -1, 1);
  const stretch = atr * path * h.driftMul * (0.72 + 0.55 * Math.abs(lean));
  let pred = px * (1 + lean * stretch);

  const t1 = s.target1 > 0 ? s.target1 : 0;
  const t2 = s.target2 > 0 ? s.target2 : 0;
  const stop = s.stop > 0 ? s.stop : 0;

  if (h.id === "1d") {
    const scalp = t1 > 0 ? t1 : px * (1 + lean * atr * 1.15);
    pred = pred * 0.42 + scalp * 0.38 + magnet * 0.2;
  } else if (h.id === "1w") {
    const swing = t2 > 0 ? t2 : t1 > 0 ? t1 : magnet;
    pred = pred * 0.38 + swing * 0.34 + magnet * 0.18 + (t1 || px) * 0.1;
  } else if (h.id === "1m") {
    const ema = s.ema200 > 0 ? s.ema200 : magnet;
    pred = pred * 0.4 + ema * 0.28 + (t2 || magnet) * 0.2 + magnet * 0.12;
  } else {
    const lo = Number.isFinite(s.range52Low) ? (s.range52Low as number) : px * 0.62;
    const hi = Number.isFinite(s.range52High) ? (s.range52High as number) : px * 1.55;
    const mid52 = (lo + hi) / 2;
    const regime = lean >= 0 ? lo + (hi - lo) * (0.52 + 0.28 * lean) : hi - (hi - lo) * (0.52 - 0.28 * lean);
    pred = pred * 0.32 + regime * 0.4 + mid52 * 0.18 + (s.ema200 > 0 ? s.ema200 : magnet) * 0.1;
  }

  if (stop > 0 && lean < -0.15 && h.id === "1d") {
    pred = pred * 0.82 + stop * 0.18;
  }

  const cap =
    h.id === "1d" ? 0.085 : h.id === "1w" ? 0.19 : h.id === "1m" ? 0.36 : 0.92;
  pred *= 1 + clamp(news / 2.4, -1, 1) * (h.id === "1d" ? 0.006 : h.id === "1w" ? 0.014 : h.id === "1m" ? 0.022 : 0.04);
  pred = clamp(pred, px * (1 - cap), px * (1 + cap));
  if (!(pred > 0) || !Number.isFinite(pred)) pred = px;
  return pred;
}

function driversOf(s: BtcTradeSignal, news: number, ballot: RoxyCoinBallot | undefined): string[] {
  const out: string[] = [];
  out.push(s.supertrendDir === 1 ? "SuperT alcista" : "SuperT bajista");
  out.push(s.price >= s.ema200 ? "Precio > EMA200" : "Precio < EMA200");
  out.push(`RSI ${s.rsi.toFixed(0)}`);
  out.push(s.macdHist >= 0 ? "MACD +" : "MACD −");
  if (s.ichiCloud === "above") out.push("Nube arriba");
  if (s.ichiCloud === "below") out.push("Nube abajo");
  if (s.ichiCloud === "inside") out.push("Dentro de nube");
  if (news > 0.4) out.push("Noticias a favor");
  if (news < -0.4) out.push("Noticias en contra");
  if (!news) out.push("Noticias neutras");
  if (ballot?.pick === "long") out.push("Voto LONG");
  if (ballot?.pick === "short") out.push("Voto SHORT");
  const vol = s.volRatio ?? 1;
  if (vol > 1.4) out.push("Volumen alto");
  if (vol < 0.7) out.push("Volumen flojo");
  return out.slice(0, 8);
}

function newsLines(facts: RoxyFact[] | undefined, symbol: string, now: number): string[] {
  if (!facts?.length) return [];
  return facts
    .filter((f) => f.kind === "news" && isRoxyNewsToday(Number(f.at), now) && (!f.symbol || f.symbol === symbol || f.symbol === "BTCUSDT"))
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
    .map((f) => f.text.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 12);
}

function directionOdds(
  s: BtcTradeSignal,
  ballot: RoxyCoinBallot | undefined,
  news: number,
  h: (typeof HORIZONS)[number],
  edge: number,
  midPct: number,
): { up: number; down: number } {
  const vote = voteLean(ballot);
  const pred = clamp(midPct / (h.id === "1d" ? 3.2 : h.id === "1w" ? 7 : h.id === "1m" ? 14 : 26), -1, 1);
  const newsN = clamp(news / 2.4, -1, 1);
  const rsi = (s.rsi - 50) / 50;
  const rsiPart = h.id === "1d" || h.id === "1w" ? -rsi * 0.22 : rsi * 0.12;
  const st = s.supertrendDir === 1 ? 0.12 : -0.12;
  const ema = s.price >= s.ema200 ? 0.1 : -0.1;
  const z = clamp(0.32 * edge + 0.24 * vote + 0.22 * pred + 0.12 * newsN + rsiPart + st + ema, -1, 1);
  const spread = h.id === "12m" ? 38 : h.id === "1m" ? 40 : 44;
  const up = Math.round(clamp(50 + z * spread, 8, 92));
  return { up, down: 100 - up };
}

function bandNote(name: string, h: (typeof HORIZONS)[number], bias: "buy" | "sell" | "wait"): string {
  if (h.id === "1d") {
    if (bias === "wait") return `${name}: rango. No persigo.`;
    if (bias === "buy") return `${name}: longs en dips.`;
    return `${name}: vendo rebotes.`;
  }
  if (h.id === "1w") {
    if (bias === "wait") return `${name}: bordes del canal.`;
    if (bias === "buy") return `${name}: swing en recortes.`;
    return `${name}: shorts en fuerza.`;
  }
  if (h.id === "1m") {
    if (bias === "wait") return `${name}: tamaño chico.`;
    if (bias === "buy") return `${name}: acumulo flojo.`;
    return `${name}: no peleo la caída.`;
  }
  if (bias === "wait") return `${name}: ciclo mixto.`;
  if (bias === "buy") return `${name}: régimen a favor.`;
  return `${name}: régimen defensivo.`;
}

function thesisOf(name: string, s: BtcTradeSignal, edge: number, news: number): string {
  const side = edge > 0.12 ? "alcista" : edge < -0.12 ? "bajista" : "lateral";
  const n = news > 0.45 ? "news +" : news < -0.45 ? "news −" : "news =";
  return `${name}: ${side} · ST ${s.supertrendDir === 1 ? "↑" : "↓"} · RSI ${s.rsi.toFixed(0)} · MACD ${s.macdHist >= 0 ? "+" : "−"} · ${n}`;
}

export function buildRoxyHorizons(
  signals: BtcTradeSignal[],
  ballots: RoxyCoinBallot[],
  facts: RoxyFact[] | undefined,
  now = Date.now(),
): RoxyHorizonCoin[] {
  const bySym = new Map(ballots.map((b) => [b.symbol, b]));
  return signals
    .filter((s) => Number.isFinite(s.price) && s.price > 0)
    .map((s) => {
      const ballot = bySym.get(s.symbol);
      const news = roxyNewsTiltScore(facts, s.symbol, now);
      const edge = signedEdge(s, ballot, news);
      const atr = dailyAtrPct(s);
      const px = s.price;
      const name = coinName(s.symbol);
      const newsTxt = newsLines(facts, s.symbol, now);
      const bias: "buy" | "sell" | "wait" = edge > 0.14 ? "buy" : edge < -0.14 ? "sell" : "wait";
      const bands: RoxyHorizonBand[] = HORIZONS.map((h) => {
        const path = Math.sqrt(h.days);
        const vol = atr * path * h.volMul;
        const mid = predictMark(s, ballot, news, atr, h, edge);
        let half = Math.max(px * vol * h.z * 0.92, Math.abs(mid - px) * 1.15 + px * atr * 0.45);
        if (h.id === "12m" && Number.isFinite(s.range52Low) && Number.isFinite(s.range52High)) {
          const lo = s.range52Low as number;
          const hi = s.range52High as number;
          if (hi > lo && lo > 0) half = Math.max(half, (hi - lo) * 0.34);
        }
        let min = mid - half;
        let max = mid + half;
        min = Math.max(px * (h.id === "12m" ? 0.18 : 0.52), min);
        max = Math.min(px * (h.id === "12m" ? 6.8 : 2.45), max);
        if (min >= mid) min = mid * 0.94;
        if (max <= mid) max = mid * 1.06;
        const minPct = ((min - px) / px) * 100;
        const maxPct = ((max - px) / px) * 100;
        const midPct = ((mid - px) / px) * 100;
        const odds = directionOdds(s, ballot, news, h, edge, midPct);
        return {
          id: h.id,
          label: h.label,
          play: h.play,
          min,
          max,
          mid,
          now: px,
          minPct,
          maxPct,
          midPct,
          upPct: odds.up,
          downPct: odds.down,
          bias,
          note: bandNote(name, h, bias),
        };
      });
      return {
        symbol: s.symbol,
        name,
        price: px,
        conviction: Math.round(clamp(Math.abs(edge) * 100, 8, 96)),
        bias,
        drivers: driversOf(s, news, ballot).slice(0, 4),
        news: newsTxt,
        thesis: thesisOf(name, s, edge, news),
        bands,
      };
    });
}
