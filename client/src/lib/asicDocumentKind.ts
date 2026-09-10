import type { Invoice, LineItem } from "./types";

/** Ítem de reparación o flete (requiere Factura + Recibo de cobro). */
export function isAsicServiceLineItem(it: LineItem): boolean {
  return Boolean(it.reparacionTipoId || it.transporteFleteTipoId);
}

/** Ítem de venta de equipo ASIC (y setup asociado). */
export function isAsicEquipmentSaleLineItem(it: LineItem): boolean {
  if (isAsicServiceLineItem(it)) return false;
  return Boolean(it.equipoId || it.setupId || (it.marcaEquipo && it.modeloEquipo));
}

/**
 * Comprobante de pago por venta de equipos ASIC: no lleva recibo;
 * queda cerrado (check verde) al emitirse.
 * Si hay reparación o flete, el documento sigue el flujo Factura + Recibo.
 */
export function isAsicEquipmentSaleDocument(items: LineItem[] | undefined | null): boolean {
  const list = items ?? [];
  if (list.length === 0) return false;
  if (list.some(isAsicServiceLineItem)) return false;
  return list.some(isAsicEquipmentSaleLineItem);
}

export function isAsicEquipmentSaleInvoice(inv: Pick<Invoice, "type" | "items">): boolean {
  return inv.type === "Factura" && isAsicEquipmentSaleDocument(inv.items);
}
