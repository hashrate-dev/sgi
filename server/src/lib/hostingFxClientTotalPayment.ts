/**
 * Monto que el cliente paga / se transfiere al banco (client_total_payment).
 *
 * - Cambio USDT/USD: HRS retiene el % → transferencia = operación − comisión.
 * - 4% hosting (envío a banco): el cliente paga hosting + % → transferencia = operación + comisión.
 */
export function hostingFxClientTotalPayment(
  operationAmount: number,
  hrsCommissionPct: number,
  compraFlowHostingCommission: boolean
): number {
  const op = Number.isFinite(operationAmount) ? operationAmount : 0;
  const pct = Number.isFinite(hrsCommissionPct) ? hrsCommissionPct : 0;
  const commission = (op * pct) / 100;
  if (compraFlowHostingCommission) {
    return Math.max(0, op + commission);
  }
  return Math.max(0, op - commission);
}
