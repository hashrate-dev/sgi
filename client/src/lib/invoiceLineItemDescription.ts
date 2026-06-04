import type { LineItem } from "./types";
import { getReceiptSettlementRowKind } from "./receiptSettlementLine";

/** Convierte YYYY-MM a MM-YYYY para mostrar en descripción */
export function ymToMonthYearInvoice(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${m}-${y}`;
}

/** Quita sufijo " - MM-YYYY" / "-MM-YYYY" del final y devuelve mes en YYYY-MM si aplica. */
export function stripTrailingInvoiceMonth(text: string): { label: string; month?: string } {
  const s = String(text ?? "").trim();
  const m = s.match(/\s*-\s*(\d{2})-(\d{4})\s*$/);
  if (!m) return { label: s };
  return {
    label: s.slice(0, m.index).trim(),
    month: `${m[2]}-${m[1]}`,
  };
}

/** "… L9 - 05-2026" / "… S21 - 10-2025" → "… L9-05-2026" (sin espacios antes del mes). */
export function compactInvoiceMonthSpacing(text: string): string {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+(\d{1,2}-\d{4})/g, (_, my: string) => {
      const [mm, yyyy] = my.split("-");
      const mmPad = mm.length === 1 ? `0${mm}` : mm;
      return `-${mmPad}-${yyyy}`;
    });
}

/** Texto final para celda DESCRIPCION: compacto, una sola línea. */
export function normalizeInvoiceDescriptionForCell(text: string): string {
  return compactInvoiceMonthSpacing(text);
}

/** Sufijo de mes sin espacios: "… L9-03-2025" (evita wrap en PDF). */
export function invoiceDescWithMonth(base: string, month?: string): string {
  const { label, month: embeddedMonth } = stripTrailingInvoiceMonth(base);
  const cleanBase = label || String(base ?? "").trim();
  const effectiveMonth = month || embeddedMonth;
  if (!effectiveMonth) return compactInvoiceMonthSpacing(cleanBase || "Item");
  const suffix = ymToMonthYearInvoice(effectiveMonth);
  if (!cleanBase) return suffix;
  return `${cleanBase}-${suffix}`;
}

/** Texto final DESCRIPCION: una línea, formato compacto, sin duplicar mes. */
export function formatInvoiceItemDescription(rawLabel: string, month?: string): string {
  const raw = String(rawLabel ?? "").trim();
  if (!raw) return month ? invoiceDescWithMonth("Item", month) : "Item";
  return invoiceDescWithMonth(raw, month);
}

function lineItemServiceLabel(it: LineItem): string {
  return String(it.serviceName ?? it.service ?? "").trim();
}

/** Texto completo de la columna DESCRIPCION (sin truncar). */
export function getLineItemDescription(it: LineItem): string {
  const settlementKind = getReceiptSettlementRowKind(it);
  if (settlementKind === "payment_line") {
    return normalizeInvoiceDescriptionForCell(lineItemServiceLabel(it) || "Pago");
  }
  if (settlementKind === "invoice_ref") {
    const desc = it.month
      ? formatInvoiceItemDescription(it.serviceName ?? it.service ?? "Factura", it.month)
      : compactInvoiceMonthSpacing(it.serviceName ?? it.service ?? "Factura");
    return normalizeInvoiceDescriptionForCell(desc);
  }
  if (settlementKind === "credit_note" || settlementKind === "prior_receipt") {
    const label = it.serviceName ?? it.service ?? "";
    const desc = it.month ? formatInvoiceItemDescription(label, it.month) : compactInvoiceMonthSpacing(label);
    return normalizeInvoiceDescriptionForCell(desc);
  }
  if (it.setupId && it.setupNombre) return normalizeInvoiceDescriptionForCell(it.setupNombre);
  if (it.reparacionTipoId && it.reparacionNombre) return normalizeInvoiceDescriptionForCell(it.reparacionNombre);
  if (it.transporteFleteTipoId && it.transporteFleteNombre) return normalizeInvoiceDescriptionForCell(it.transporteFleteNombre);
  if (it.marcaEquipo && it.modeloEquipo && it.procesadorEquipo) {
    const equipoDesc = `${it.marcaEquipo} - ${it.modeloEquipo} - ${it.procesadorEquipo}`;
    return normalizeInvoiceDescriptionForCell(
      it.month ? formatInvoiceItemDescription(equipoDesc, it.month) : equipoDesc
    );
  }
  if (it.garantiaCodigo || it.garantiaMarca || it.garantiaModelo) {
    return [it.garantiaCodigo, "Garantías", it.garantiaMarca, it.garantiaModelo].filter(Boolean).join(" - ") || "Garantía";
  }
  const serviceLabel = lineItemServiceLabel(it);
  if (serviceLabel) {
    const desc = it.month ? formatInvoiceItemDescription(serviceLabel, it.month) : compactInvoiceMonthSpacing(serviceLabel);
    return normalizeInvoiceDescriptionForCell(desc);
  }
  return normalizeInvoiceDescriptionForCell(it.month ? formatInvoiceItemDescription("Item", it.month) : "Item");
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
  const serviceLabel = lineItemServiceLabel(it);
  if (serviceLabel) {
    const { label } = stripTrailingInvoiceMonth(serviceLabel);
    if (label) return `Descuento ${label}`;
  }
  return "Descuento";
}
