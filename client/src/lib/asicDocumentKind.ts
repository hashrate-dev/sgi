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
 * Emisión ASIC: ya no hay Recibo.
 * Toda Factura se trata como COMPROBANTE DE PAGO (cerrado al emitir, sin cobro posterior).
 */
export function isAsicEquipmentSaleDocument(_items?: LineItem[] | null): boolean {
  return true;
}

export function isAsicEquipmentSaleInvoice(inv: Pick<Invoice, "type" | "items">): boolean {
  return inv.type === "Factura";
}
