/**
 * Sentimiento de mercado a partir del wire de noticias.
 * Lexicón cripto ES/EN + ventanas temporal (corto / mediano / largo)
 * → índice HRS de sesgo alcista (-100..+100). No es consejo financiero.
 */

export type SentimentHorizonId = "corto" | "mediano" | "largo";

export type SentimentArticleInput = {
  id: number;
  title: string;
  summary: string;
  titleEs?: string;
  summaryEs?: string;
  topics: string[];
  publishedAt: string;
};

export type HorizonSentiment = {
  id: SentimentHorizonId;
  label: string;
  windowLabel: string;
  score: number; // -100..+100
  bias: "alcista" | "neutral" | "bajista";
  biasLabel: string;
  articles: number;
  positive: number;
  negative: number;
  neutral: number;
  coverage: number; // 0..1 fraction of scored vs total in window
};

export type MarketSentimentReport = {
  signal: {
    score: number;
    bias: "alcista_fuerte" | "alcista" | "neutral" | "bajista" | "bajista_fuerte";
    biasLabel: string;
    momentum: number; // corto - mediano
    momentumLabel: string;
    confidence: number; // 0..100
    verdict: string;
  };
  horizons: HorizonSentiment[];
  chart: {
    labels: string[];
    scores: number[];
    positivePct: number[];
    negativePct: number[];
  };
  drivers: {
    bullish: Array<{ id: number; title: string; score: number; publishedAt: string }>;
    bearish: Array<{ id: number; title: string; score: number; publishedAt: string }>;
  };
  sampleSize: number;
  computedAt: string;
};

const BULL: Array<[RegExp, number]> = [
  [/\b(all[-\s]?time high|ath|máximo hist[oó]rico|record high)\b/i, 2.4],
  [/\b(etf\s+(approved|approval|inflow|inflows)|aprobaci[oó]n\s+del?\s+etf|flujos?\s+netos?\s+positivos)\b/i, 2.2],
  [/\b(bull(?:ish|run)?|alcista|rally|surge|soar|skyrocket|dispar(a|ó|arse)|rompe(?:r)?\s+resistencia)\b/i, 1.8],
  [/\b(institutional\s+buying|compra\s+institucional|whale\s+accumulat|acumulaci[oó]n)\b/i, 1.7],
  [/\b(adoption|adopci[oó]n|partnership|alianza|integration|integraci[oó]n)\b/i, 1.3],
  [/\b(rate\s+cut|recorte\s+de\s+tasas|dovish|liquidity\s+injection|inyecci[oó]n\s+de\s+liquidez)\b/i, 1.5],
  [/\b(gains?|sube|subida|up\s+\d|%\s*up|green\s+day|cierra\s+en\s+verde|rebote|recovery|recupera)\b/i, 1.2],
  [/\b(buy\s+the\s+dip|oportunidad\s+de\s+compra|undervalued|infravalorad[oa])\b/i, 1.1],
  [/\b(breakthrough|hito|milestone|launch\s+success|mainnet\s+success)\b/i, 1.0],
  [/\b(inflows?|entradas?\s+de\s+capital|capital\s+inflow)\b/i, 1.4],
];

const BEAR: Array<[RegExp, number]> = [
  [/\b(hack(?:ed|ing)?|exploit|breach|filtraci[oó]n|stolen|robad[oa]s?)\b/i, 2.4],
  [/\b(ban(?:ned|ning)?|prohibici[oó]n|crackdown|represi[oó]n|outlaw)\b/i, 2.1],
  [/\b(lawsuit|demanda|sec\s+charges?|indictment|fraud|estafa|ponzi|scam)\b/i, 2.0],
  [/\b(crash|dump|plunge|collapse|derrumbe|desplome|sell[-\s]?off|liquidaci[oó]n(?:es)?)\b/i, 1.9],
  [/\b(bear(?:ish|market)?|bajista|correction\s+deep|ca[ií]da\s+fuerte)\b/i, 1.7],
  [/\b(outflows?|salidas?\s+de\s+capital|etf\s+outflow)\b/i, 1.6],
  [/\b(default|bancarrota|bankrupt|insolven|delisting|deslist)\b/i, 1.8],
  [/\b(rate\s+hike|subida\s+de\s+tasas|hawkish|tightening|restricci[oó]n\s+monetaria)\b/i, 1.4],
  [/\b(losses?|cae|ca[ií]da|down\s+\d|%\s*down|red\s+day|cierra\s+en\s+rojo|slides?|slump)\b/i, 1.2],
  [/\b(warning|alerta|risk\s+off|miedo|panic|p[aá]nico|fud)\b/i, 1.0],
];

const TOPIC_WEIGHT: Record<string, number> = {
  bitcoin: 1.35,
  inversion: 1.2,
  gobierno_usa: 1.15,
  usa: 1.1,
  cripto: 1.05,
  litecoin: 0.95,
  dogecoin: 0.9,
  zcash: 0.9,
  uruguay: 0.85,
};

const MS_HOUR = 3600_000;
const MS_DAY = 24 * MS_HOUR;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function topicWeight(topics: string[]): number {
  if (!topics.length) return 1;
  let max = 0.9;
  for (const t of topics) max = Math.max(max, TOPIC_WEIGHT[t] ?? 0.95);
  return max;
}

/** Score bruto de un texto: positivo si >0, negativo si <0. */
export function scoreNewsText(title: string, summary: string): number {
  const hay = `${title}\n${summary}`.trim();
  if (!hay) return 0;
  let score = 0;
  for (const [re, w] of BULL) {
    const m = hay.match(re);
    if (m) score += w * Math.min(2, m.length);
  }
  for (const [re, w] of BEAR) {
    const m = hay.match(re);
    if (m) score -= w * Math.min(2, m.length);
  }
  // Negaciones simples
  if (/\b(no|not|sin|without)\b.{0,24}\b(crash|dump|ban|hack|rally|surge)\b/i.test(hay)) {
    score *= 0.55;
  }
  return clamp(score, -6, 6);
}

function articleDisplayTitle(a: SentimentArticleInput): string {
  return (a.titleEs || a.title || "").trim() || a.title;
}

function articleScore(a: SentimentArticleInput): { score: number; title: string } {
  const title = a.titleEs || a.title;
  const summary = a.summaryEs || a.summary;
  const raw = scoreNewsText(title, summary);
  const weighted = raw * topicWeight(a.topics);
  return { score: weighted, title: articleDisplayTitle(a) };
}

function biasFromScore(score: number): { bias: HorizonSentiment["bias"]; biasLabel: string } {
  if (score >= 18) return { bias: "alcista", biasLabel: "Alcista" };
  if (score <= -18) return { bias: "bajista", biasLabel: "Bajista" };
  return { bias: "neutral", biasLabel: "Neutral" };
}

function signalFromScore(score: number): MarketSentimentReport["signal"]["bias"] {
  if (score >= 45) return "alcista_fuerte";
  if (score >= 15) return "alcista";
  if (score <= -45) return "bajista_fuerte";
  if (score <= -15) return "bajista";
  return "neutral";
}

function signalLabel(bias: MarketSentimentReport["signal"]["bias"]): string {
  switch (bias) {
    case "alcista_fuerte":
      return "Alcista fuerte";
    case "alcista":
      return "Alcista";
    case "bajista_fuerte":
      return "Bajista fuerte";
    case "bajista":
      return "Bajista";
    default:
      return "Neutral";
  }
}

function horizonBucket(
  id: SentimentHorizonId,
  label: string,
  windowLabel: string,
  articles: SentimentArticleInput[],
  now: number,
  maxAgeMs: number,
  minAgeMs = 0
): HorizonSentiment {
  const inWindow = articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    if (!Number.isFinite(t)) return false;
    const age = now - t;
    return age >= minAgeMs && age <= maxAgeMs;
  });

  let weightedSum = 0;
  let weightTotal = 0;
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const a of inWindow) {
    const { score } = articleScore(a);
    const age = Math.max(0, now - Date.parse(a.publishedAt));
    // Más peso a lo más reciente dentro de la ventana
    const recency = 1 - (age / Math.max(maxAgeMs, 1)) * 0.45;
    const w = Math.max(0.35, recency) * topicWeight(a.topics);
    weightedSum += score * w;
    weightTotal += w;
    if (score > 0.35) positive += 1;
    else if (score < -0.35) negative += 1;
    else neutral += 1;
  }

  const avg = weightTotal > 0 ? weightedSum / weightTotal : 0;
  // Escala ~[-6..6] → [-100..100]
  const score = Math.round(clamp((avg / 3.2) * 100, -100, 100));
  const { bias, biasLabel } = biasFromScore(score);
  const scored = positive + negative + neutral;

  return {
    id,
    label,
    windowLabel,
    score,
    bias,
    biasLabel,
    articles: inWindow.length,
    positive,
    negative,
    neutral,
    coverage: inWindow.length ? scored / inWindow.length : 0,
  };
}

export function buildMarketSentimentReport(articles: SentimentArticleInput[]): MarketSentimentReport {
  const now = Date.now();
  const sorted = [...articles].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const corto = horizonBucket("corto", "Corto plazo", "Últimas 48 h", sorted, now, 48 * MS_HOUR);
  const mediano = horizonBucket("mediano", "Mediano plazo", "Últimos 14 días", sorted, now, 14 * MS_DAY);
  const largo = horizonBucket("largo", "Largo plazo", "Últimos 45 días", sorted, now, 45 * MS_DAY);

  const horizons = [corto, mediano, largo];

  // Índice HRS: prioriza el corto (flujo de noticias reciente) con ancla en mediano/largo
  const composite = corto.score * 0.5 + mediano.score * 0.3 + largo.score * 0.2;
  const momentum = corto.score - mediano.score;
  const compositeAdj = clamp(composite + clamp(momentum * 0.18, -12, 12), -100, 100);
  const score = Math.round(compositeAdj);
  const bias = signalFromScore(score);

  const confidence = Math.round(
    clamp(
      25 +
        Math.min(40, corto.articles * 2.2) +
        Math.min(20, mediano.articles * 0.35) +
        Math.min(15, Math.abs(corto.score) * 0.12),
      0,
      100
    )
  );

  let momentumLabel = "Sin aceleración clara";
  if (momentum >= 20) momentumLabel = "Aceleración alcista";
  else if (momentum >= 8) momentumLabel = "Sesgo alcista reciente";
  else if (momentum <= -20) momentumLabel = "Aceleración bajista";
  else if (momentum <= -8) momentumLabel = "Sesgo bajista reciente";

  let verdict = "El wire no muestra un sesgo dominante: mercado en espera.";
  if (bias === "alcista_fuerte") {
    verdict = "La narrativa del wire es claramente alcista: más noticias de impulso que de riesgo.";
  } else if (bias === "alcista") {
    verdict = "Sesgo alcista moderado: el flujo de noticias favorece escenarios de suba.";
  } else if (bias === "bajista_fuerte") {
    verdict = "Narrativa bajista dominante: alertas, caídas o riesgos pesan más en el wire.";
  } else if (bias === "bajista") {
    verdict = "Sesgo bajista moderado: el tono del wire inclina a cautela / presión vendedora.";
  }

  const scoredAll = sorted.map((a) => {
    const s = articleScore(a);
    return { id: a.id, title: s.title, score: s.score, publishedAt: a.publishedAt };
  });
  const bullish = scoredAll
    .filter((x) => x.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => ({
      id: x.id,
      title: x.title,
      score: Math.round(x.score * 10) / 10,
      publishedAt: x.publishedAt,
    }));
  const bearish = scoredAll
    .filter((x) => x.score < -0.4)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((x) => ({
      id: x.id,
      title: x.title,
      score: Math.round(x.score * 10) / 10,
      publishedAt: x.publishedAt,
    }));

  return {
    signal: {
      score,
      bias,
      biasLabel: signalLabel(bias),
      momentum: Math.round(momentum),
      momentumLabel,
      confidence,
      verdict,
    },
    horizons,
    chart: {
      labels: horizons.map((h) => h.label),
      scores: horizons.map((h) => h.score),
      positivePct: horizons.map((h) =>
        h.articles ? Math.round((h.positive / h.articles) * 100) : 0
      ),
      negativePct: horizons.map((h) =>
        h.articles ? Math.round((h.negative / h.articles) * 100) : 0
      ),
    },
    drivers: { bullish, bearish },
    sampleSize: sorted.length,
    computedAt: new Date().toISOString(),
  };
}
