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

/** Parsea margen USD cargado a mano (acepta coma). */
export function parseAsicMarginUsd(raw: string | number | undefined | null): number | undefined {
  if (raw == null) return undefined;
  const s = typeof raw === "number" ? String(raw) : String(raw).replace(",", ".").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100) / 100;
}

/** Costo de la operación = |total| − margen. Solo si hay margen cargado. */
export function asicOperationCostUsd(
  total: number,
  marginUsd: number | undefined | null
): number | undefined {
  if (marginUsd == null || !Number.isFinite(marginUsd)) return undefined;
  return Math.round(Math.max(0, Math.abs(Number(total) || 0) - Math.abs(marginUsd)) * 100) / 100;
}

/** El margen de la operación vive en Factura / Comp. pago, no en Recibo ni NC. */
export function asicInvoiceCarriesOperationMargin(inv: Pick<Invoice, "type">): boolean {
  return inv.type === "Factura";
}
