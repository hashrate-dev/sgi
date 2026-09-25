import { roxyNewsTiltScore, type RoxyFact } from "./roxyMind";

export type RoxyVoteSide = "long" | "short";

type CheckLike = { id: string; label: string; bias: "buy" | "sell" | "wait"; detail?: string };

type SignalLike = {
  symbol: string;
  bias?: "buy" | "sell" | "wait";
  confidence?: number;
  checks?: CheckLike[];
};

const WEIGHT: Record<string, number> = {
  ema200: 2.2,
  supertrend: 2,
  ichimoku: 2,
  "ema-cross": 1.25,
  "ema-slope": 0.85,
  psar: 1.15,
  macd: 1.35,
  jerry: 1.15,
  rsi: 1.05,
  bollinger: 0.9,
  volume: 1.05,
  zigzag: 0.75,
  fib: 1.45,
  divergence: 1.7,
  news: 1.55,
};

export type RoxyToolChip = {
  id: string;
  label: string;
  weight: number;
  forSide: RoxyVoteSide;
};

export type RoxySideTally = {
  score: number;
  yes: number;
  tools: RoxyToolChip[];
};

export type RoxyCoinBallot = {
  symbol: string;
  name: string;
  long: RoxySideTally;
  short: RoxySideTally;
  pick: RoxyVoteSide | "wait";
  margin: number;
  lead: boolean;
  confidence: number;
};

function wOf(id: string): number {
  return WEIGHT[id] ?? 1;
}

function tallySide(sig: SignalLike, side: RoxyVoteSide, facts: RoxyFact[] | undefined): RoxySideTally {
  const want = side === "long" ? "buy" : "sell";
  const against = side === "long" ? "sell" : "buy";
  let yesW = 0;
  let noW = 0;
  let yes = 0;
  const tools: RoxyToolChip[] = [];
  for (const c of sig.checks ?? []) {
    const w = wOf(c.id);
    if (c.bias === want) {
      yesW += w;
      yes += 1;
      tools.push({ id: c.id, label: c.label, weight: w, forSide: side });
    } else if (c.bias === against) {
      noW += w;
    }
  }
  const tilt = roxyNewsTiltScore(facts, sig.symbol);
  if ((side === "long" && tilt > 0.45) || (side === "short" && tilt < -0.45)) {
    const w = wOf("news") * Math.min(1.4, Math.abs(tilt) / 1.4);
    yesW += w;
    yes += 1;
    tools.push({ id: "news", label: "Noticias 24h", weight: w, forSide: side });
  } else if ((side === "long" && tilt < -0.45) || (side === "short" && tilt > 0.45)) {
    noW += wOf("news") * Math.min(1.4, Math.abs(tilt) / 1.4);
  }
  const score = Math.round((yesW - noW * 0.62) * 10) / 10;
  tools.sort((a, b) => b.weight - a.weight);
  return { score, yes, tools: tools.slice(0, 8) };
}

export type RoxyVoteGate = { long: boolean; short: boolean };

function pickSide(long: RoxySideTally, short: RoxySideTally, gate?: RoxyVoteGate): RoxyVoteSide | "wait" {
  const allowL = gate?.long !== false;
  const allowS = gate?.short !== false;
  const longOk = allowL && long.yes >= 3 && long.score >= 1.4;
  const shortOk = allowS && short.yes >= 3 && short.score >= 1.4;
  if (allowL && !allowS) return longOk ? "long" : "wait";
  if (allowS && !allowL) return shortOk ? "short" : "wait";
  if (longOk && long.score >= short.score + 0.55) return "long";
  if (shortOk && short.score >= long.score + 0.55) return "short";
  return "wait";
}

/** Una papeleta por moneda: largo vs corto. `lead` marca la operación ganadora del universo. */
export function rankRoxyBallots(signals: SignalLike[], facts?: RoxyFact[], gate?: RoxyVoteGate): RoxyCoinBallot[] {
  const rows: RoxyCoinBallot[] = signals.map((sig) => {
    const long = tallySide(sig, "long", facts);
    const short = tallySide(sig, "short", facts);
    const margin = Math.abs(long.score - short.score);
    const pick = pickSide(long, short, gate);
    return {
      symbol: sig.symbol,
      name: sig.symbol.replace(/USDT$/i, ""),
      long,
      short,
      pick,
      margin,
      lead: false,
      confidence: Number(sig.confidence) || 0,
    };
  });
  const contenders = rows
    .filter((r) => r.pick !== "wait")
    .sort((a, b) => {
      const as = a.pick === "long" ? a.long.score : a.short.score;
      const bs = b.pick === "long" ? b.long.score : b.short.score;
      if (bs !== as) return bs - as;
      return b.confidence - a.confidence;
    });
  if (contenders[0]) {
    const top = contenders[0];
    const row = rows.find((r) => r.symbol === top.symbol);
    if (row) row.lead = true;
  }
  rows.sort((a, b) => {
    if (a.lead !== b.lead) return a.lead ? -1 : 1;
    const as = Math.max(a.long.score, a.short.score);
    const bs = Math.max(b.long.score, b.short.score);
    return bs - as;
  });
  return rows;
}

export function roxyBallotOpenKey(ballots: RoxyCoinBallot[]): string | null {
  const lead = ballots.find((b) => b.lead && b.pick !== "wait");
  if (!lead || lead.pick === "wait") return null;
  return `${lead.symbol}:${lead.pick}`;
}

export function parseRoxyOpenKey(key: string | null | undefined): { symbol: string; side: RoxyVoteSide } | null {
  if (!key) return null;
  const i = key.lastIndexOf(":");
  if (i < 1) return null;
  const symbol = key.slice(0, i);
  const side = key.slice(i + 1);
  if (side !== "long" && side !== "short") return null;
  return { symbol, side };
}
