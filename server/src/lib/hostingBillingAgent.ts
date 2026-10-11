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
  const k = String(key || "").trim().toUpperCase();
  const n = `${k} ${name}`.toUpperCase();
  if (k === "E" || /\bZ15/.test(n)) return "Z15";
  if (k === "C" || /\bS21\b/.test(n)) return "S21";
  if (k === "B" || /\bL9\b/.test(n)) return "L9";
  if (k === "A" || /\bL7\b/.test(n)) return "L7";
  const m = n.match(/\b([A-Z]{1,4}\d{1,3}[A-Z]?)\b/);
  return m?.[1] ?? "";
}

function blobOf(row: Pick<GarantiaConsumoRow, "marca" | "modelo" | "procesador">): string {
  return `${row.marca} ${row.modelo} ${row.procesador}`.toUpperCase().replace(/[-_]/g, " ");
}

function garantiaMatchScore(row: GarantiaConsumoRow, token: string): number {
  if (!token) return 0;
  const modelo = String(row.modelo || "").toUpperCase().replace(/[-_]/g, " ").trim();
  const blob = blobOf(row);
  const tok = token.toUpperCase();
  const word = new RegExp(`(?:^|[^A-Z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Z0-9])`);
  if (!word.test(blob)) return 0;
  let score = 1;
  if (modelo === tok || modelo.endsWith(` ${tok}`) || modelo.endsWith(tok)) score += 8;
  if (modelo.includes(tok)) score += 3;
  return score;
}

/** Consumo W vigente en Valores de garantías ASIC para el modelo del servicio (L7/L9/S21/Z15…). */
export function wattsFromGarantiaAsic(rows: GarantiaConsumoRow[], key: string, name = ""): number {
  const token = hostingModelToken(key, name);
  if (!token) return 0;
  let best: GarantiaConsumoRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const w = Number(row.consumoW);
    if (!Number.isFinite(w) || w <= 0) continue;
    const score = garantiaMatchScore(row, token);
    if (score <= 0) continue;
    if (score > bestScore) {
      best = row;
      bestScore = score;
      continue;
    }
    if (score === bestScore && best) {
      const newer = String(row.fecha || "") > String(best.fecha || "") || (row.fecha === best.fecha && row.id > best.id);
      if (newer) best = row;
    }
  }
  return best ? Number(best.consumoW) || 0 : 0;
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
  storedWatts = 0
): { watts: number; source: "garantia-asic" | "stored" | "fallback" | "none" } {
  const fromTable = wattsFromGarantiaAsic(rows, key, name);
  if (fromTable > 0) return { watts: fromTable, source: "garantia-asic" };
  const stored = Math.max(0, Number(storedWatts) || 0);
  if (stored > 0) return { watts: stored, source: "stored" };
  const fb = defaultWattsForServiceKey(key) || wattsFromServiceName(name);
  if (fb > 0) return { watts: fb, source: "fallback" };
  return { watts: 0, source: "none" };
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
