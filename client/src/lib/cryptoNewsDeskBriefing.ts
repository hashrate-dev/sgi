import type { CryptoNewsLivePrice, CryptoNewsSentimentReport } from "./api";

export type DeskPlayTone = "up" | "down" | "flat";

export type DeskHorizonNote = {
  id: "corto" | "mediano" | "largo";
  label: string;
  window: string;
  play: string;
  playTone: DeskPlayTone;
  text: string;
};

export type DeskBriefing = {
  notes: DeskHorizonNote[];
  invalidation: string;
  tapeLine: string;
};

type Horizon = CryptoNewsSentimentReport["horizons"][number];

function hz(report: CryptoNewsSentimentReport, id: Horizon["id"]): Horizon | undefined {
  return report.horizons.find((h) => h.id === id);
}

function fmtChg(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function clipTitle(s: string, n = 88): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

function tapeOf(prices: CryptoNewsLivePrice[]) {
  const btc = prices.find((p) => p.symbol === "BTC");
  const alts = prices.filter((p) => p.symbol !== "BTC" && Number.isFinite(p.changePct24h));
  const btcChg = Number(btc?.changePct24h) || 0;
  const altAvg = alts.length ? alts.reduce((a, p) => a + p.changePct24h, 0) / alts.length : 0;
  const weakest = [...alts].sort((a, b) => a.changePct24h - b.changePct24h)[0];
  const strongest = [...alts].sort((a, b) => b.changePct24h - a.changePct24h)[0];
  let regime: "risk_off" | "risk_on" | "btc_bid" | "alt_bid" | "mixed" = "mixed";
  if (btcChg <= -1.8 && altAvg <= -1.2) regime = "risk_off";
  else if (btcChg >= 1.4 && altAvg >= 0.8) regime = "risk_on";
  else if (btcChg >= 0.35 && altAvg <= -0.6) regime = "btc_bid";
  else if (btcChg <= -0.35 && altAvg >= 0.6) regime = "alt_bid";
  return { btcChg, altAvg, weakest, strongest, regime, hasTape: prices.some((p) => p.priceUsd > 0) };
}

function newsVsTape(score: number, btcChg: number): "aligned_up" | "aligned_down" | "price_leads" | "news_leads" | "flat" {
  const newsUp = score >= 12;
  const newsDown = score <= -12;
  const pxUp = btcChg >= 1.2;
  const pxDown = btcChg <= -1.2;
  if (newsUp && pxUp) return "aligned_up";
  if (newsDown && pxDown) return "aligned_down";
  if (!newsUp && !newsDown && (pxUp || pxDown)) return "price_leads";
  if ((newsUp || newsDown) && !pxUp && !pxDown) return "news_leads";
  return "flat";
}

function cortoNote(h: Horizon, tape: ReturnType<typeof tapeOf>, div: ReturnType<typeof newsVsTape>): DeskHorizonNote {
  const mix = h.articles
    ? `${Math.round((h.positive / h.articles) * 100)}% alcistas vs ${Math.round((h.negative / h.articles) * 100)}% bajistas`
    : "muestra chica";
  let play = "ESPERAR";
  let playTone: DeskPlayTone = "flat";
  let text = "";

  if (!tape.hasTape) {
    play = "LEER WIRE";
    text = `Sin tape de precios: operá con el índice 48 h (${h.score > 0 ? "+" : ""}${h.score}, ${h.biasLabel}). ${mix}. No armar tamaño hasta ver BTC en vivo.`;
  } else if (div === "aligned_down" || (h.score <= -12 && tape.regime === "risk_off")) {
    play = "NO CAZAR";
    playTone = "down";
    text = `Wire y tape alineados a la baja (BTC ${fmtChg(tape.btcChg)}). No recoger cuchillos ni promediar alts: priorizá liquidez y BTC. ${mix}.`;
  } else if (div === "aligned_up" || (h.score >= 12 && tape.regime === "risk_on")) {
    play = "SESGO LONG";
    playTone = "up";
    text = `Narrativa y precio confirman. Long táctico solo en pullback de BTC, no en vela vertical. Evitá apalancar alts débiles (${tape.weakest ? `${tape.weakest.symbol} ${fmtChg(tape.weakest.changePct24h)}` : "beta alto"}).`;
  } else if (div === "price_leads" && tape.btcChg <= -1.2) {
    play = "NO CAZAR";
    playTone = "down";
    text = `El precio se mueve más que el wire (BTC ${fmtChg(tape.btcChg)}, news ${h.score > 0 ? "+" : ""}${h.score}). Stop-run o risk-off: esperá absorción. No long de rebote en el primer verde.`;
  } else if (div === "price_leads" && tape.btcChg >= 1.2) {
    play = "NO PERSEGUIR";
    playTone = "flat";
    text = `Rally de 24 h sin titulares que lo justifiquen. Recortá tamaño / trailing. Si no estás adentro, no persigas: el 48 h sigue ${h.biasLabel.toLowerCase()}.`;
  } else if (h.score >= 12 && tape.regime === "risk_off") {
    play = "ESPERAR CONFIRMA";
    playTone = "flat";
    text = `Wire 48 h alcista, tape en risk-off: el precio niega la narrativa. No promediar. Invalidación táctica = BTC deja de hacer mínimos y el índice 48 h se sostiene.`;
  } else if (h.score <= -12 && tape.regime === "risk_on") {
    play = "NO PERSEGUIR SHORT";
    playTone = "flat";
    text = `Squeeze o cobertura: titulares feos y BTC verde. No short chase. Si hay short, apretá stop; el tape manda hasta que el wire se alinee.`;
  } else if (tape.regime === "btc_bid") {
    play = "ROTAR A BTC";
    playTone = "flat";
    text = `BTC ${fmtChg(tape.btcChg)} y alts promedio ${fmtChg(tape.altAvg)}: el bid está en el índice, no en beta. Recortá DOGE/ZEC si sangran; el 48 h es ${h.biasLabel.toLowerCase()} (${mix}).`;
  } else if (tape.regime === "alt_bid") {
    play = "DESCONFIAR BETA";
    playTone = "flat";
    text = `Alts aguantan mejor que BTC. Suele ser rotación especulativa: tamaño chico y salida rápida. El wire 48 h no da un catalizador limpio (${h.biasLabel}, ${mix}).`;
  } else {
    play = "RANGO";
    playTone = "flat";
    text = `Mercado en espera: wire 48 h ${h.biasLabel.toLowerCase()} (${h.score > 0 ? "+" : ""}${h.score}) y BTC ${fmtChg(tape.btcChg)}. Operá bordes, no el medio. ${tape.weakest ? `El lastre es ${tape.weakest.symbol} ${fmtChg(tape.weakest.changePct24h)}.` : ""}`;
  }

  return { id: "corto", label: "Corto", window: h.windowLabel, play, playTone, text };
}

function medianoNote(
  h: Horizon,
  corto: Horizon,
  tape: ReturnType<typeof tapeOf>
): DeskHorizonNote {
  const mom = corto.score - h.score;
  const mix = h.articles
    ? `${h.positive} notas + / ${h.negative} − sobre ${h.articles}`
    : "poca muestra";
  let play = "SWING NEUTRO";
  let playTone: DeskPlayTone = "flat";
  let text = "";

  if (Math.abs(mom) < 8 && Math.abs(h.score) < 12) {
    play = "NO FORZAR SWING";
    text = `14 d y 48 h coinciden en lateral (${h.score > 0 ? "+" : ""}${h.score}). El swing no paga dirección: scalps o cash. ${mix}.`;
  } else if (mom >= 8 && h.score >= 8) {
    play = "HOLD SWING";
    playTone = "up";
    text = `Aceleración reciente sobre un 14 d ya constructivo. El swing sigue válido; no lo mates por ruido de un día. Trailing, no all-in.`;
  } else if (mom >= 8 && h.score < 8) {
    play = "RUIDO DE TITULARES";
    playTone = "flat";
    text = `El 48 h se calentó más que el 14 d. Tratalo como headline risk, no como cambio de régimen. El swing ancla en ${h.biasLabel.toLowerCase()} (${h.score > 0 ? "+" : ""}${h.score}).`;
  } else if (mom <= -8 && h.score <= -8) {
    play = "REDUCIR BETA";
    playTone = "down";
    text = `Deterioro reciente sobre un 14 d ya pesado. Bajá exposición a alts; el swing no es para recoger cuchillos. ${mix}.`;
  } else if (mom <= -8 && h.score > 0) {
    play = "DEFENDER SWING";
    playTone = "flat";
    text = `El 14 d sigue ${h.biasLabel.toLowerCase()} pero el 48 h enfría. Recortá lo táctico, no el core. Invalidación de swing: el índice 14 d bajo cero con tape risk-off.`;
  } else if (h.score >= 12) {
    play = "SESGO SWING LONG";
    playTone = "up";
    text = `Base de 14 d alcista. Las entradas se hacen en retroceso de BTC, no en FOMO. ${tape.hasTape ? `Tape 24 h: BTC ${fmtChg(tape.btcChg)}.` : ""} ${mix}.`;
  } else if (h.score <= -12) {
    play = "SWING DEFENSIVO";
    playTone = "down";
    text = `14 d con narrativa de presión. Preferí BTC a alts y no girar inventario. ${mix}.`;
  } else {
    play = "SWING EN ESPERA";
    text = `14 d sin tesis fuerte (${h.biasLabel}, ${h.score > 0 ? "+" : ""}${h.score}). El dinero está en no sobreoperar: ${mix}.`;
  }

  return { id: "mediano", label: "Mediano", window: h.windowLabel, play, playTone, text };
}

function largoNote(h: Horizon, corto: Horizon, mediano: Horizon): DeskHorizonNote {
  const alignedUp = h.score >= 8 && mediano.score >= 5 && corto.score >= 0;
  const alignedDown = h.score <= -8 && mediano.score <= -5 && corto.score <= 0;
  const mix = h.articles ? `${h.articles} notas · ${Math.round((h.positive / Math.max(h.articles, 1)) * 100)}% +` : "";
  let play = "CORE NEUTRO";
  let playTone: DeskPlayTone = "flat";
  let text = "";

  if (alignedUp) {
    play = "CORE BTC";
    playTone = "up";
    text = `45 d, 14 d y 48 h no pelean: fondo constructivo. Posicionamiento de operador: mantener core BTC / hash, alts como satélite. No palanquear equipos ni inventario por un titular.`;
  } else if (alignedDown) {
    play = "PRESERVAR CAJA";
    playTone = "down";
    text = `Régimen de 45 d pesado. Priorizá liquidez, no expansión de capex ni beta. El largo se recompone cuando el 14 d deja de hacer mínimos de sesgo, no en el primer rebote.`;
  } else if (h.score >= 10 && corto.score < 0) {
    play = "BASE INTACTA";
    playTone = "up";
    text = `El 45 d sigue ${h.biasLabel.toLowerCase()} (${h.score > 0 ? "+" : ""}${h.score}) aunque el 48 h haga ruido. No liquidar el core por una rueda. Sí: bajar apalancamiento táctico. ${mix}.`;
  } else if (h.score <= -10 && corto.score > 8) {
    play = "REBOTE ≠ RÉGIMEN";
    playTone = "flat";
    text = `Mejora táctica contra un 45 d todavía flojo. Tratá el largo como reparación, no como nuevo bull. Subí exposición solo si el 14 d confirma.`;
  } else if (Math.abs(h.score) < 10) {
    play = "SIN TESIS LARGA";
    text = `45 d lateral (${h.score > 0 ? "+" : ""}${h.score}). Para minería e inventario: operar el rango, no apostar dirección. Core chico, caja lista, alts solo con stop. ${mix}.`;
  } else if (h.score > 0) {
    play = "SESGO DE FONDO +";
    playTone = "up";
    text = `Fondo 45 d levemente constructivo. Acumulá calidad (BTC) en debilidad, no alts ilíquidas. ${mix}.`;
  } else {
    play = "SESGO DE FONDO −";
    playTone = "down";
    text = `Fondo 45 d con más presión que impulso. Defensa de capital primero; el largo no se “promedia” con beta. ${mix}.`;
  }

  return { id: "largo", label: "Largo", window: h.windowLabel, play, playTone, text };
}

export function buildDeskBriefing(
  report: CryptoNewsSentimentReport,
  prices: CryptoNewsLivePrice[]
): DeskBriefing | null {
  const corto = hz(report, "corto");
  const mediano = hz(report, "mediano");
  const largo = hz(report, "largo");
  if (!corto || !mediano || !largo) return null;

  const tape = tapeOf(prices);
  const div = newsVsTape(corto.score, tape.btcChg);
  const notes = [cortoNote(corto, tape, div), medianoNote(mediano, corto, tape), largoNote(largo, corto, mediano)];

  const bull = report.drivers.bullish[0]?.title;
  const bear = report.drivers.bearish[0]?.title;
  const watch =
    bull || bear
      ? `Watch: ${bull ? `+ ${clipTitle(bull, 70)}` : ""}${bull && bear ? " · " : ""}${bear ? `− ${clipTitle(bear, 70)}` : ""}`
      : "";

  const tapeLine = tape.hasTape
    ? `Tape 24 h: BTC ${fmtChg(tape.btcChg)} · alts ${fmtChg(tape.altAvg)}${tape.weakest ? ` · peor ${tape.weakest.symbol} ${fmtChg(tape.weakest.changePct24h)}` : ""}${tape.strongest && tape.strongest.symbol !== tape.weakest?.symbol ? ` · mejor ${tape.strongest.symbol} ${fmtChg(tape.strongest.changePct24h)}` : ""}.`
    : "Tape 24 h: precios aún no cargaron.";

  const invalidation = [
    `Confianza ${report.signal.confidence}% · ${report.signal.momentumLabel}.`,
    tapeLine,
    `Invalidación táctica: índice 48 h cruza ±15 en contra o BTC 24 h > 3% contra el sesgo.`,
    watch,
  ]
    .filter(Boolean)
    .join(" ");

  return { notes, invalidation, tapeLine };
}
