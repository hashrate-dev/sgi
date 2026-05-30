import type { HostingFxOperation } from "./api";

/** Misma fórmula que «Ganancia operación» en el formulario y KPIs de cambio. */
export function hostingFxOperationProfitUsd(
  op: Pick<
    HostingFxOperation,
    "operationAmount" | "clientTotalPayment" | "bankFeeAmount" | "compraFlowHostingCommission"
  >
): number {
  const opAmt = Number.isFinite(op.operationAmount) ? op.operationAmount : 0;
  const transfer = Number.isFinite(op.clientTotalPayment) ? op.clientTotalPayment : 0;
  const bank = Number.isFinite(op.bankFeeAmount) ? op.bankFeeAmount : 0;
  if (op.compraFlowHostingCommission) {
    return Math.max(0, transfer - opAmt - bank);
  }
  return Math.max(0, opAmt - transfer - bank);
}
