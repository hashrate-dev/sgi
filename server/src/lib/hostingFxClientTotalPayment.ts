function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Monto transferencia.
 *
 * - Compra o venta de USDT/USD: el % ya está incluido en lo que paga el cliente.
 *   transferencia = monto operación / (1 + %/100). Ej.: 206 / 1,03 = 200.
 * - 4% hosting o reparaciones: el cliente paga el monto más el %.
 *   transferencia = monto operación × (1 + %/100).
 */
export function hostingFxClientTotalPayment(
  operationAmount: number,
  hrsCommissionPct: number,
  compraFlowHostingCommission: boolean
): number {
  const op = Number.isFinite(operationAmount) ? operationAmount : 0;
  const pct = Number.isFinite(hrsCommissionPct) ? hrsCommissionPct : 0;
  const factor = 1 + pct / 100;
  if (compraFlowHostingCommission) {
    return Math.max(0, roundUsd(op * factor));
  }
  if (factor <= 0) return 0;
  return Math.max(0, roundUsd(op / factor));
}
