import { getReceiptSettlementRowKind } from "./receiptSettlementLine";
import type { LineItem } from "./types";

function lineDiscountTotal(it: LineItem): number {
  return (Number(it.discount) || 0) * (Number(it.quantity) || 1);
}

/**
 * Alinea `item.discount` con el total de descuentos de la factura cuando en BD el encabezado
 * (`invoices.discounts`) tiene monto pero las líneas vienen con discount en 0 (facturas legacy o sync incompleto).
 */
export function alignLineItemDiscountsForDisplay(items: LineItem[], invoiceDiscounts: number): LineItem[] {
  const target = Math.abs(Number(invoiceDiscounts) || 0);
  if (target < 0.0001 || items.length === 0) return items;

  const normalIdx: number[] = [];
  let current = 0;
  items.forEach((it, i) => {
    if (getReceiptSettlementRowKind(it) != null) return;
    normalIdx.push(i);
    current += lineDiscountTotal(it);
  });
  if (normalIdx.length === 0) return items;

  const orphan = Math.round((target - current) * 100) / 100;
  if (orphan < 0.0001) return items;

  const grossTotal = normalIdx.reduce((s, i) => {
    const it = items[i]!;
    return s + (Number(it.price) || 0) * (Number(it.quantity) || 1);
  }, 0);
  if (grossTotal < 0.0001) return items;

  const next = items.map((it) => ({ ...it }));
  for (const i of normalIdx) {
    const it = next[i]!;
    const lineGross = (Number(it.price) || 0) * (Number(it.quantity) || 1);
    const share = (lineGross / grossTotal) * orphan;
    const q = Number(it.quantity) || 1;
    it.discount = Math.round(((Number(it.discount) || 0) + share / q) * 100) / 100;
  }

  const after = normalIdx.reduce((s, i) => s + lineDiscountTotal(next[i]!), 0);
  const drift = Math.round((target - after) * 100) / 100;
  if (Math.abs(drift) >= 0.01) {
    const last = normalIdx[normalIdx.length - 1]!;
    const q = Number(next[last]!.quantity) || 1;
    next[last]!.discount = Math.round(((Number(next[last]!.discount) || 0) + drift / q) * 100) / 100;
  }

  return next;
}
