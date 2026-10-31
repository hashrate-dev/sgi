import type { HostingFxOperation } from "./api";

export type HostingFxCommissionKind = "hosting" | "reparaciones";

/** 4% Hosting y 4% Reparaciones usan el mismo cálculo; el kind solo cambia el nombre. */
export function hostingFxCommissionKind(
  op: Pick<HostingFxOperation, "compraFlowHostingCommission" | "compraFlowCommissionKind">
): HostingFxCommissionKind | null {
  if (op.compraFlowCommissionKind === "reparaciones") return "reparaciones";
  if (op.compraFlowHostingCommission || op.compraFlowCommissionKind === "hosting") return "hosting";
  return null;
}

export function hostingFxClientCompraLabel(
  op: Pick<HostingFxOperation, "compraFlowHostingCommission" | "compraFlowCommissionKind" | "usdtSide">,
  style: "full" | "short" = "full"
): string {
  const kind = hostingFxCommissionKind(op);
  if (kind === "reparaciones") return "4% Reparaciones";
  if (kind === "hosting") return "4% Comisión por Hosting";
  if (op.usdtSide === "buy_usdt") return style === "short" ? "Compra USDT" : "Compra de USDT";
  return style === "short" ? "Compra USD" : "Compra de USD";
}

/**
 * Operaciones 4% (Hosting o Reparaciones) con envío USD a banco: el cliente liquidó en USD
 * (transferencia bancaria), no pagando USDT a Binance. No deben sumarse al volumen «cliente paga con USDT».
 */
export function hostingFxIsHostingCommissionUsdBank(
  op: Pick<HostingFxOperation, "compraFlowHostingCommission" | "deliveryMethod">
): boolean {
  return Boolean(op.compraFlowHostingCommission && op.deliveryMethod === "usd_to_bank");
}

/** Columna «Tipo» en tablas (compacto). */
export function hostingFxTipoTableLabel(op: HostingFxOperation): string {
  if (hostingFxIsHostingCommissionUsdBank(op)) {
    return hostingFxCommissionKind(op) === "reparaciones"
      ? "USD vía banco (4% Reparaciones)"
      : "USD vía banco (4% Hosting)";
  }
  return op.operationType === "usdt_to_usd" ? "USDT → USD" : "USD → USDT";
}

/** Ticket modal / PDF (frase legible). */
export function hostingFxTipoDescripcionLarga(op: HostingFxOperation): string {
  if (hostingFxIsHostingCommissionUsdBank(op)) {
    return hostingFxCommissionKind(op) === "reparaciones"
      ? "Pago USD vía banco (comisión 4% Reparaciones)"
      : "Pago USD vía banco (comisión 4% Hosting)";
  }
  return op.operationType === "usdt_to_usd" ? "Cambio USDT a USD" : "Cambio USD a USDT";
}
