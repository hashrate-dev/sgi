/** Playbook operativo de Roxy: indicadores del desk + reglas clásicas de riesgo y disciplina. */

export type RoxyTape = {
  symbol: string;
  interval: string;
  price: number;
  confidence: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  ema25: number;
  ema50: number;
  ema200: number;
  supertrend: number;
  supertrendDir: 1 | -1;
  psar: number;
  psarDir: 1 | -1;
  zigzagLast?: { kind: "high" | "low"; price: number };
  ichiCloud?: "above" | "inside" | "below";
  ichiTenkan?: number;
  ichiKijun?: number;
  bbMid?: number;
  bbPctB?: number;
  volRatio?: number;
  rr1?: number;
  stop: number;
  target1: number;
  buyVotes?: number;
  sellVotes?: number;
  waitVotes?: number;
  checks?: Array<{ id: string; bias: string }>;
};

export type RoxyHit = { id: string; ok: boolean; label: string };

export type RoxyDeskRead = {
  hits: RoxyHit[];
  aligned: number;
  total: number;
  score: number;
  veto: string | null;
  canon: string;
};

const MIN_ALIGN = 7;

export const ROXY_LIBRARY = [
  { id: "livermore", title: "Livermore · tendencia y no pelear el tape" },
  { id: "dow", title: "Dow / Murphy · el régimen manda (EMA200)" },
  { id: "wyckoff", title: "Wyckoff · esfuerzo vs resultado (volumen)" },
  { id: "elder", title: "Elder · no perseguir RSI extremo" },
  { id: "douglas", title: "Douglas · una pérdida no es un insulto" },
  { id: "tharp", title: "Van Tharp · no entrar si el R:R es pobre" },
  { id: "schwager", title: "Schwager · el stop se pone antes, no después" },
  { id: "minervini", title: "Minervini · esperar alineación, no adivinar" },
  { id: "otero", title: "O'Neil · no promediar perdedoras" },
  { id: "steenbarger", title: "Steenbarger · si hay tilt, no hay orden" },
] as const;

export function roxyReadTape(sig: RoxyTape, side: "long" | "short"): RoxyDeskRead {
  const long = side === "long";
  const px = sig.price;
  const hits: RoxyHit[] = [];
  const add = (id: string, ok: boolean, label: string) => hits.push({ id, ok, label });

  add("ema200", long ? px > sig.ema200 : px < sig.ema200, "EMA200 régimen");
  add("ema-stack", long ? sig.ema25 > sig.ema50 : sig.ema25 < sig.ema50, "EMA 25/50");
  add("supertrend", long ? sig.supertrendDir === 1 : sig.supertrendDir === -1, "Supertrend");
  add("psar", long ? sig.psarDir === 1 && sig.psar <= px : sig.psarDir === -1 && sig.psar >= px, "PSAR");
  add("macd-hist", long ? sig.macdHist > 0 : sig.macdHist < 0, "MACD hist");
  add("macd-cross", long ? sig.macd >= sig.macdSignal : sig.macd <= sig.macdSignal, "MACD cruce");
  add("cloud", long ? sig.ichiCloud !== "below" : sig.ichiCloud !== "above", "Ichimoku");
  if (Number.isFinite(sig.ichiKijun)) {
    add("kijun", long ? px >= (sig.ichiKijun as number) : px <= (sig.ichiKijun as number), "Kijun");
  }
  add("rsi", long ? sig.rsi < 74 : sig.rsi > 26, "RSI");
  add("vol", !Number.isFinite(sig.volRatio) || (sig.volRatio as number) >= 0.88, "Volumen");
  add("rr", !Number.isFinite(sig.rr1) || (sig.rr1 as number) >= 1.5, "R:R");
  if (sig.zigzagLast) {
    add("zigzag", long ? sig.zigzagLast.kind === "low" : sig.zigzagLast.kind === "high", "ZigZag");
  }
  if (Number.isFinite(sig.bbPctB)) {
    const b = sig.bbPctB as number;
    add("bb", long ? b < 0.88 : b > 0.12, "Bollinger");
  }
  const buy = sig.buyVotes ?? 0;
  const sell = sig.sellVotes ?? 0;
  add("votes", long ? buy >= sell : sell >= buy, "Votos desk");

  const aligned = hits.filter((h) => h.ok).length;
  const total = hits.length;
  const score = total ? Math.round((aligned / total) * 100) : 0;

  let veto: string | null = null;
  const wait = sig.waitVotes ?? 0;
  if (wait > buy + sell && sig.confidence < 70) veto = "Más votos de espera que de lado: Minervini diría que no hay setup.";
  else if (long && sig.rsi >= 76) veto = "RSI de euforia. Elder: no persigo el techo.";
  else if (!long && sig.rsi <= 24) veto = "RSI de pánico. No vendo el suelo.";
  else if (long && sig.ichiCloud === "below") veto = "Debajo de la nube no compro. Régimen primero.";
  else if (!long && sig.ichiCloud === "above") veto = "Sobre la nube no corto. No peleo el tape.";
  else if (long && px < sig.ema200) veto = "Precio bajo EMA200. Dow: la marea no es alcista.";
  else if (!long && px > sig.ema200) veto = "Precio sobre EMA200. No vendo la tendencia mayor.";
  else if (Number.isFinite(sig.rr1) && (sig.rr1 as number) < 1.4) veto = "R:R flaco. Tharp: si no paga 1.5R, no es oficio.";
  else if (Number.isFinite(sig.volRatio) && (sig.volRatio as number) < 0.72) veto = "Volumen anémico. Wyckoff: sin esfuerzo, no hay trade.";
  else if (Number.isFinite(sig.bbPctB) && Number.isFinite(sig.volRatio)) {
    const b = sig.bbPctB as number;
    if (b > 0.42 && b < 0.58 && (sig.volRatio as number) < 0.85) {
      veto = "Bollinger comprimida y volumen flojo. Espero expansión, no adivino el break.";
    }
  } else if (aligned < MIN_ALIGN) {
    veto = `Solo ${aligned}/${total} indicadores a favor. La biblioteca pide confluencia, no un indicador héroe.`;
  } else if (long && sig.macdHist < 0 && sig.macd < sig.macdSignal) {
    veto = "MACD en contra. El momentum no firma el largo.";
  } else if (!long && sig.macdHist > 0 && sig.macd > sig.macdSignal) {
    veto = "MACD en contra. El momentum no firma el corto.";
  }

  const canon = ROXY_LIBRARY[(aligned + Math.round(sig.confidence)) % ROXY_LIBRARY.length]!.title;
  return { hits, aligned, total, score, veto, canon };
}

export function roxyDeskPass(sig: RoxyTape, side: "long" | "short"): { ok: boolean; read: RoxyDeskRead } {
  const read = roxyReadTape(sig, side);
  return { ok: !read.veto && read.aligned >= MIN_ALIGN, read };
}

export function roxyStackLine(read: RoxyDeskRead): string {
  const yes = read.hits.filter((h) => h.ok).map((h) => h.label);
  const no = read.hits.filter((h) => !h.ok).map((h) => h.label);
  const a = yes.length ? `A favor: ${yes.join(", ")}.` : "Nada alineado.";
  const b = no.length ? ` En contra: ${no.join(", ")}.` : "";
  return `Desk ${read.aligned}/${read.total} (${read.score}%). ${a}${b}`;
}

export function roxyCanonLine(read: RoxyDeskRead, seed: number): string {
  if (read.veto) return read.veto;
  const lines = [
    `Hoy aplico ${read.canon}.`,
    `Biblioteca abierta: ${read.canon}.`,
    `Si no está en el mapa de indicadores, no está. ${read.canon}.`,
    `Riesgo primero, ego después. ${read.canon}.`,
    `Las emociones firman malas órdenes. Yo firmo con el stack. ${read.canon}.`,
  ];
  return lines[Math.abs(seed) % lines.length]!;
}

export function roxyPrepBoost(sig: RoxyTape, side: "buy" | "sell"): { extra: number; stage: string } {
  const read = roxyReadTape(sig, side === "buy" ? "long" : "short");
  if (read.veto) return { extra: -18, stage: read.veto.slice(0, 72) };
  return {
    extra: Math.round((read.score - 50) * 0.22),
    stage: `Stack ${read.aligned}/${read.total} · ${read.canon.split("·")[0]!.trim()}`,
  };
}
