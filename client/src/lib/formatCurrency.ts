/**
 * Formato de montos en todo el proyecto: separador de miles con . y decimales con , (ej. 1.234,56).
 */

/** Solo la parte numérica (ej. "1.234,56" o "- 1.234,56" si es negativo) */
export function formatAmount(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart}`;
  return n < 0 ? `- ${s}` : s;
}

/** Monto con " USD" al final (ej. "1.234,56 USD") */
export function formatUSD(n: number): string {
  return `${formatAmount(n)} USD`;
}

/** Para tablas que muestran negativo sin espacio: "-1.234,56" (y " USD" en otra celda o debajo) */
export function formatCurrencyNumber(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart}`;
  return n < 0 ? `-${s}` : s;
}

/** formatCurrency para Historial/Pendientes/Reportes: incluye " USD", negativos como "-1.234,56 USD" */
export function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart}`;
  return n < 0 ? `-${s} USD` : `${s} USD`;
}
