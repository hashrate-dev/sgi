import type { Invoice } from "./types";
import { isLinkedToInvoice } from "./invoiceLinks";

const EPS = 0.0001;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function absTotal(inv: Invoice): number {
  return Math.abs(Number(inv.total) || 0);
}

/** Recibo emitido como cuota (no cierra toda la deuda). */
export function isPartialReceiptDocument(inv: Pick<Invoice, "type" | "documentContext" | "items">): boolean {
  if (inv.type !== "Recibo") return false;
  if (inv.documentContext === "recibo-parcial") return true;
  return (inv.items || []).some((it) => {
    const label = String(it.serviceName ?? it.service ?? it.reparacionNombre ?? "").toLowerCase();
    return label.startsWith("pago parcial de factura ");
  });
}

export type InvoiceCollectionState = {
  factura: Invoice;
  originalTotal: number;
  creditApplied: number;
  paidApplied: number;
  pendingAmount: number;
  receipts: Invoice[];
  creditNotes: Invoice[];
  partialReceipts: Invoice[];
  partialPaidAmount: number;
  /** Hay recibos y todavía queda saldo. */
  hasPartialBalance: boolean;
  isFullySettled: boolean;
};

export function invoiceCollectionState(factura: Invoice, all: Invoice[]): InvoiceCollectionState {
  const creditNotes = all.filter((inv) => inv.type === "Nota de Crédito" && isLinkedToInvoice(inv, factura));
  const receipts = all.filter((inv) => inv.type === "Recibo" && isLinkedToInvoice(inv, factura));
  const originalTotal = roundMoney(absTotal(factura));
  const creditApplied = roundMoney(creditNotes.reduce((s, nc) => s + absTotal(nc), 0));
  const paidApplied = roundMoney(receipts.reduce((s, r) => s + absTotal(r), 0));
  const pendingAmount = roundMoney(Math.max(0, originalTotal - creditApplied - paidApplied));

  const flagged = receipts.filter((r) => isPartialReceiptDocument(r));
  let partialReceipts: Invoice[];
  if (flagged.length > 0) {
    partialReceipts = flagged;
  } else if (pendingAmount > EPS && receipts.length > 0) {
    partialReceipts = receipts;
  } else if (receipts.length > 1) {
    partialReceipts = receipts.slice(0, -1);
  } else {
    partialReceipts = [];
  }

  const partialPaidAmount = roundMoney(partialReceipts.reduce((s, r) => s + absTotal(r), 0));
  const hasPartialBalance = receipts.length > 0 && pendingAmount > EPS;
  const isFullySettled = pendingAmount <= EPS;

  return {
    factura,
    originalTotal,
    creditApplied,
    paidApplied,
    pendingAmount,
    receipts,
    creditNotes,
    partialReceipts,
    partialPaidAmount,
    hasPartialBalance,
    isFullySettled,
  };
}

export function relatedFacturaForDocument(inv: Invoice, all: Invoice[]): Invoice | null {
  if (inv.type === "Factura") return inv;
  return (
    all.find(
      (f) =>
        f.type === "Factura" &&
        (isLinkedToInvoice(inv, f) ||
          (inv.relatedInvoiceId != null && String(f.id) === String(inv.relatedInvoiceId)) ||
          (inv.relatedInvoiceNumber != null && f.number === inv.relatedInvoiceNumber))
    ) ?? null
  );
}
