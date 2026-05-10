import type { HostingFxOperation } from "./api";

/**
 * Operaciones registradas como 4% Hosting con envío USD a banco: el cliente liquidó en USD
 * (transferencia bancaria), no pagando USDT a Binance. No deben sumarse al volumen «cliente paga con USDT».
 */
export function hostingFxIsHostingCommissionUsdBank(
  op: Pick<HostingFxOperation, "compraFlowHostingCommission" | "deliveryMethod">
): boolean {
  return Boolean(op.compraFlowHostingCommission && op.deliveryMethod === "usd_to_bank");
}

/** Columna «Tipo» en tablas (compacto). */
export function hostingFxTipoTableLabel(op: HostingFxOperation): string {
  if (hostingFxIsHostingCommissionUsdBank(op)) return "USD vía banco (4% Hosting)";
  return op.operationType === "usdt_to_usd" ? "USDT → USD" : "USD → USDT";
}

/** Ticket modal / PDF (frase legible). */
export function hostingFxTipoDescripcionLarga(op: HostingFxOperation): string {
  if (hostingFxIsHostingCommissionUsdBank(op)) return "Pago USD vía banco (comisión 4% Hosting)";
  return op.operationType === "usdt_to_usd" ? "Cambio USDT a USD" : "Cambio USD a USDT";
}
