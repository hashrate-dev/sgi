import type { InvoiceDocumentContext } from "./invoiceDocumentContext";
import type { Invoice, LineItem } from "./types";

/** Ítem de reparación o flete. */
export function isAsicServiceLineItem(it: LineItem): boolean {
  return Boolean(it.reparacionTipoId || it.transporteFleteTipoId);
}

/** Ítem de venta de equipo ASIC (y setup asociado). */
export function isAsicEquipmentSaleLineItem(it: LineItem): boolean {
  if (isAsicServiceLineItem(it)) return false;
  return Boolean(it.equipoId || it.setupId || (it.marcaEquipo && it.modeloEquipo));
}

/**
 * Factura ASIC persistida: crédito ("factura") vs pago anticipado ("comprobante-pago").
 * Las Facturas ASIC antiguas sin contexto se tratan como comprobante de pago.
 */
export function resolveAsicInvoiceDocumentContext(
  inv: Pick<Invoice, "type" | "documentContext">
): InvoiceDocumentContext | undefined {
  if (inv.documentContext === "garantia-ande") return "garantia-ande";
  if (inv.type !== "Factura") return inv.documentContext;
  if (inv.documentContext === "factura") return "factura";
  return "comprobante-pago";
}

/** True si el PDF/nombre debe usar COMPROBANTE DE PAGO (pago anticipado, sin Recibo). */
export function isAsicEquipmentSaleDocument(
  _items?: LineItem[] | null,
  documentContext?: InvoiceDocumentContext
): boolean {
  return documentContext === "comprobante-pago";
}

/** Factura ASIC de pago anticipado: cerrada al emitir, no entra a Pendientes ni admite Recibo. */
export function isAsicEquipmentSaleInvoice(
  inv: Pick<Invoice, "type" | "items" | "documentContext">
): boolean {
  return inv.type === "Factura" && resolveAsicInvoiceDocumentContext(inv) === "comprobante-pago";
}
