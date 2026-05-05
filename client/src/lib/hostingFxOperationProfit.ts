import type { HostingFxOperation } from "./api";

/** Misma fórmula que la columna «Ganancia operación» en operaciones de cambio USDT/USD (hosting). */
export function hostingFxOperationProfitUsd(
  op: Pick<HostingFxOperation, "operationAmount" | "clientTotalPayment" | "bankFeeAmount">
): number {
  return Math.max(0, op.operationAmount - op.clientTotalPayment - op.bankFeeAmount);
}
