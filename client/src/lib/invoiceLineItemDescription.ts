import type { LineItem } from "./types";
import { getReceiptSettlementRowKind } from "./receiptSettlementLine";

/** Convierte YYYY-MM a MM-YYYY para mostrar en descripción */
export function ymToMonthYearInvoice(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${m}-${y}`;
}

/** Texto completo de la columna DESCRIPCION (sin truncar). */
export function getLineItemDescription(it: LineItem): string {
  const settlementKind = getReceiptSettlementRowKind(it);
  if (settlementKind === "payment_line") {
    return String(it.serviceName ?? "").trim() || "Pago";
  }
  if (settlementKind === "invoice_ref") {
    return it.month ? `${it.serviceName ?? "Factura"} - ${ymToMonthYearInvoice(it.month)}` : (it.serviceName ?? "Factura");
  }
  if (settlementKind === "credit_note" || settlementKind === "prior_receipt") {
    return it.month ? `${it.serviceName ?? ""} - ${ymToMonthYearInvoice(it.month)}` : (it.serviceName ?? "");
  }
  if (it.setupId && it.setupNombre) return it.setupNombre;
  if (it.reparacionTipoId && it.reparacionNombre) return it.reparacionNombre;
  if (it.transporteFleteTipoId && it.transporteFleteNombre) return it.transporteFleteNombre;
  if (it.marcaEquipo && it.modeloEquipo && it.procesadorEquipo) {
    const equipoDesc = `${it.marcaEquipo} - ${it.modeloEquipo} - ${it.procesadorEquipo}`;
    return it.month ? `${equipoDesc} - ${ymToMonthYearInvoice(it.month)}` : equipoDesc;
  }
  if (it.garantiaCodigo || it.garantiaMarca || it.garantiaModelo) {
    return [it.garantiaCodigo, "Garantías", it.garantiaMarca, it.garantiaModelo].filter(Boolean).join(" - ") || "Garantía";
  }
  if (it.serviceName) {
    return it.month ? `${it.serviceName} - ${ymToMonthYearInvoice(it.month)}` : it.serviceName;
  }
  return it.month ? `Item - ${ymToMonthYearInvoice(it.month)}` : "Item";
}

export function getLineItemDiscountDescription(it: LineItem): string {
  if (it.setupId && it.setupNombre) return `Descuento ${it.setupNombre}`;
  if (it.reparacionTipoId && it.reparacionNombre) return `Descuento ${it.reparacionNombre}`;
  if (it.transporteFleteTipoId && it.transporteFleteNombre) return `Descuento ${it.transporteFleteNombre}`;
  if (it.marcaEquipo && it.modeloEquipo) return `Descuento ${it.marcaEquipo} ${it.modeloEquipo}`;
  if (it.garantiaMarca && it.garantiaModelo) return `Descuento ${it.garantiaMarca} ${it.garantiaModelo}`;
  if (it.serviceKey === "A") return "Descuento HASHRATE L7";
  if (it.serviceKey === "B") return "Descuento HASHRATE L9";
  if (it.serviceKey) return "Descuento HASHRATE S21";
  return "Descuento";
}
