/**
 * Formato de montos: separador de miles "." y decimales "," con dos dígitos (ej. 1.234,56).
 */

/** Solo la parte numérica (ej. "1.234,56" o "- 1.234,56" si es negativo) */
export function formatAmount(n: number): string {
  const num = Number(n);
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart}`;
  return num < 0 ? `- ${s}` : s;
}

/** Monto con " USD" al final (ej. "1.234,56 USD") */
export function formatUSD(n: number): string {
  return `${formatAmount(n)} USD`;
}

/** Para tablas: miles con "." y decimales con "," (ej. "1.234,56" o "-1.234,56") */
export function formatCurrencyNumber(n: number): string {
  const num = Number(n);
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart}`;
  return num < 0 ? `-${s}` : s;
}

/** formatCurrency: incluye " USD", formato 1.234,56 USD */
export function formatCurrency(n: number): string {
  const num = Number(n);
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart}`;
  return num < 0 ? `-${s} USD` : `${s} USD`;
}

/** `in` cobros/ingresos; `out` costos/gastos; `pnl` ganancia/resultado (signo del valor). */
export function formatSignedCurrency(n: number, role: "in" | "out" | "pnl"): string {
  const body = formatCurrency(Math.abs(Number(n) || 0));
  if (role === "out") return `- ${body}`;
  if (role === "in") return `+ ${body}`;
  const v = Number(n) || 0;
  if (v < 0) return `- ${body}`;
  if (v > 0) return `+ ${body}`;
  return body;
}
