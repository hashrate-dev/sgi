import type { Invoice } from "./types";

/** Vínculo robusto: usa relatedInvoiceId o relatedInvoiceNumber. */
export function isLinkedToInvoice(comp: Invoice, factura: Invoice): boolean {
  const matchId = comp.relatedInvoiceId != null && String(comp.relatedInvoiceId) === String(factura.id);
  const matchNumber = comp.relatedInvoiceNumber != null && comp.relatedInvoiceNumber === factura.number;
  return matchId || matchNumber;
}
