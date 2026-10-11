/** Periodo a mes vencido, energía y días reales del mes cerrado (America/Asuncion). */

export const HOSTING_AGENT_TZ = "America/Asuncion";
export const DEFAULT_USD_PER_KWH = 0.078;
export const DEFAULT_DUE_DATE_DAYS = 6;

/** Fallback solo si Valores de garantías ASIC no tiene ese modelo. */
const FALLBACK_WATTS: Record<string, number> = {
  A: 3425,
  B: 3360,
  C: 3510,
  E: 1510,
};

export type GarantiaConsumoRow = {
  marca: string;
  modelo: string;
  procesador: string;
  consumoW: number;
  fecha: string;
  id: number;
};

export type HostingAgentLine = {
  serviceKey: string;
  serviceName: string;
  month: string;
  quantity: number;
  price: number;
  discount: number;
  watts: number;
  kwhMonth: number;
  daysInMonth: number;
  usdPerKwh: number;
  wattsSource?: "garantia-asic" | "stored" | "fallback" | "none";
  garantiaLabel?: string;
};

export function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = String(ym || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function daysInYearMonth(ym: string): number {
  const p = parseYearMonth(ym);
  if (!p) return 30;
  return daysInCalendarMonth(p.year, p.month);
}

export function ymdInAsuncion(d = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSTING_AGENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function previousClosedMonth(from = new Date()): string {
  const { year, month } = ymdInAsuncion(from);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isClosedMonth(ym: string, from = new Date()): boolean {
  const p = parseYearMonth(ym);
  if (!p) return false;
  const cur = ymdInAsuncion(from);
  return p.year < cur.year || (p.year === cur.year && p.month < cur.month);
}

export function formatPyDate(d: Date): string {
  const { year, month, day } = ymdInAsuncion(d);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatPyTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOSTING_AGENT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

export function addDaysPy(base: Date, days: number): string {
  const { year, month, day } = ymdInAsuncion(base);
  const utc = Date.UTC(year, month - 1, day + days);
  return formatPyDate(new Date(utc));
}

export function roundUsd(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function hostingModelToken(key: string, name = ""): string {
  const n = `${key} ${name}`.toUpperCase().replace(/[-_]/g, " ");
  const found = n.match(/[A-Z]{1,4}\d{1,3}[A-Z]*/g) || [];
  const unique = [...new Set(found.filter((t) => t !== "A" && t !== "B" && t !== "C" && t !== "D" && t !== "E"))];
  unique.sort((a, b) => b.length - a.length);
  if (unique[0]) return unique[0];
  const k = String(key || "").trim().toUpperCase();
  if (k === "E") return "Z15";
  if (k === "C") return "S21";
  if (k === "B") return "L9";
  if (k === "A") return "L7";
  return "";
}

function blobOf(row: Pick<GarantiaConsumoRow, "marca" | "modelo" | "procesador">): string {
  return `${row.marca} ${row.modelo} ${row.procesador}`.toUpperCase().replace(/[-_]/g, " ");
}

function compactAlnum(s: string): string {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function compactHasToken(hay: string, tok: string): boolean {
  if (!hay || !tok) return false;
  const i = hay.indexOf(tok);
  if (i < 0) return false;
  const after = hay[i + tok.length];
  if (after && /[A-Z0-9]/.test(after)) return false;
  const before = hay[i - 1];
  if (before && /[A-Z0-9]/.test(before)) return false;
  return true;
}

function garantiaMatchScore(row: GarantiaConsumoRow, token: string): number {
  if (!token) return 0;
  const modelo = String(row.modelo || "").toUpperCase().replace(/[-_]/g, " ").trim();
  const blob = blobOf(row);
  const tok = token.toUpperCase();
  const compactModelo = compactAlnum(row.modelo);
  const compactBlob = compactAlnum(blob);
  const compactTok = compactAlnum(tok);
  const word = new RegExp(`(?:^|[^A-Z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Z0-9])`);
  const wordHit = word.test(blob);
  const compactHit = compactHasToken(compactModelo, compactTok) || compactHasToken(compactBlob, compactTok);
  if (!wordHit && !compactHit) return 0;
  let score = wordHit ? 2 : 1;
  if (compactModelo === compactTok || modelo === tok) score += 10;
  else if (modelo.endsWith(` ${tok}`) || modelo.endsWith(tok) || compactModelo.startsWith(compactTok)) score += 8;
  if (modelo.includes(tok) || compactHit) score += 3;
  return score;
}

/** Fila vigente en Valores de garantías ASIC para el modelo del servicio (L7/L9/S21/Z15…). */
export function bestGarantiaRow(rows: GarantiaConsumoRow[], key: string, name = "", garantiaId = 0): GarantiaConsumoRow | null {
  if (garantiaId > 0) {
    const exact = rows.find((r) => r.id === garantiaId && Number(r.consumoW) > 0);
    if (exact) return exact;
  }
  const token = hostingModelToken(key, name);
  if (!token) return null;
  const hits: Array<{ row: GarantiaConsumoRow; score: number }> = [];
  for (const row of rows) {
    const w = Number(row.consumoW);
    if (!Number.isFinite(w) || w <= 0) continue;
    const score = garantiaMatchScore(row, token);
    if (score <= 0) continue;
    hits.push({ row, score });
  }
  if (hits.length === 0) return null;
  const top = Math.max(...hits.map((h) => h.score));
  const topHits = hits.filter((h) => h.score === top);
  const watts = new Set(topHits.map((h) => Number(h.row.consumoW)));
  if (watts.size > 1) return null;
  topHits.sort((a, b) => {
    const fd = String(b.row.fecha || "").localeCompare(String(a.row.fecha || ""));
    if (fd !== 0) return fd;
    return b.row.id - a.row.id;
  });
  return topHits[0]?.row ?? null;
}

/** Consumo W vigente en Valores de garantías ASIC para el modelo del servicio (L7/L9/S21/Z15…). */
export function wattsFromGarantiaAsic(rows: GarantiaConsumoRow[], key: string, name = "", garantiaId = 0): number {
  return Number(bestGarantiaRow(rows, key, name, garantiaId)?.consumoW) || 0;
}

export function defaultWattsForServiceKey(key: string): number {
  const k = String(key || "").trim().toUpperCase();
  return FALLBACK_WATTS[k] ?? 0;
}

export function wattsFromServiceName(name: string): number {
  const n = String(name || "").toUpperCase();
  if (/\bZ15/.test(n)) return FALLBACK_WATTS.E ?? 1510;
  if (/\bS21\b/.test(n)) return FALLBACK_WATTS.C ?? 3510;
  if (/\bL9\b/.test(n)) return FALLBACK_WATTS.B ?? 3360;
  if (/\bL7\b/.test(n)) return FALLBACK_WATTS.A ?? 3425;
  return 0;
}

export function resolveServiceWatts(
  rows: GarantiaConsumoRow[],
  key: string,
  name = "",
  storedWatts = 0,
  garantiaId = 0
): { watts: number; source: "garantia-asic" | "stored" | "fallback" | "none"; garantia?: GarantiaConsumoRow | null } {
  const row = bestGarantiaRow(rows, key, name, garantiaId);
  if (row && Number(row.consumoW) > 0) {
    return { watts: Number(row.consumoW), source: "garantia-asic", garantia: row };
  }
  if (rows.length > 0) {
    return { watts: 0, source: "none", garantia: null };
  }
  const stored = Math.max(0, Number(storedWatts) || 0);
  if (stored > 0) return { watts: stored, source: "stored", garantia: null };
  const fb = defaultWattsForServiceKey(key) || wattsFromServiceName(name);
  if (fb > 0) return { watts: fb, source: "fallback", garantia: null };
  return { watts: 0, source: "none", garantia: null };
}

/** kWh del mes = kW × 24 h × días del mes (28/29/30/31). */
export function kwhForMonth(watts: number, days: number): number {
  const w = Math.max(0, Number(watts) || 0);
  const d = Math.max(0, Number(days) || 0);
  return (w / 1000) * 24 * d;
}

export function priceFromEnergy(watts: number, days: number, usdPerKwh: number): number {
  return roundUsd(kwhForMonth(watts, days) * Math.max(0, Number(usdPerKwh) || 0));
}

export function scalePriceByDays(lastPrice: number, lastDays: number, nextDays: number): number {
  const ld = Math.max(1, Number(lastDays) || 30);
  return roundUsd((Number(lastPrice) || 0) * (Math.max(1, nextDays) / ld));
}

export function monthSuffixLabel(ym: string): string {
  const p = parseYearMonth(ym);
  if (!p) return ym;
  return `${String(p.month).padStart(2, "0")}-${p.year}`;
}

export function storedServiceDescription(name: string, month: string): string {
  const base = String(name || "Servicio").trim() || "Servicio";
  return `${base} - ${monthSuffixLabel(month)}`.replace(/\s+-\s+(\d{2}-\d{4})\s*$/, "-$1");
}

export function lineTotals(items: Array<{ quantity: number; price: number; discount: number }>): {
  subtotal: number;
  discounts: number;
  total: number;
} {
  let subtotal = 0;
  let discounts = 0;
  for (const it of items) {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const price = Number(it.price) || 0;
    const disc = Number(it.discount) || 0;
    subtotal += price * qty;
    discounts += disc * qty;
  }
  subtotal = roundUsd(subtotal);
  discounts = roundUsd(discounts);
  return { subtotal, discounts, total: roundUsd(subtotal - discounts) };
}
