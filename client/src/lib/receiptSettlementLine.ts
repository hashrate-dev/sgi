import type { ComprobanteType, LineItem, ReciboSettlementLineKind } from "./types";
import { buildReciboPaymentLineDescription } from "./reciboConceptText";

/** Texto de ítem: UI usa `serviceName`; API/DB a veces solo `service`. */
function itemServiceLabel(it: LineItem & { service?: string }): string {
  return String(it.serviceName ?? it.service ?? "").trim();
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseFacturaFromInvoiceRefLine(text: string): string | null {
  const m = text.match(/[Ff]actura\s+n[°º]?\s*([A-Z0-9-]+)/i);
  return m ? m[1] : null;
}

/**
 * Detecta líneas de liquidación de recibo (en memoria o reimpresión desde texto guardado en `service`).
 * Criterios flexibles: N°/Nº/ASCII, tildes, guiones -/—, para no caer al flujo "Descuento HASHRATE" del PDF.
 */
export function getReceiptSettlementRowKind(it: LineItem & { service?: string }): ReciboSettlementLineKind | null {
  if (
    it.reciboLineKind === "invoice_ref" ||
    it.reciboLineKind === "credit_note" ||
    it.reciboLineKind === "prior_receipt" ||
    it.reciboLineKind === "payment_line"
  ) {
    return it.reciboLineKind;
  }
  const n = itemServiceLabel(it);
  if (!n) return null;
  const low = n.toLowerCase();
  if (low.startsWith("pago de factura ")) {
    if (/\(nc\s+[^)]*aplicad/i.test(low) || low.includes("recibo previo") || low.includes("recibos previos") || low.includes("liquidación de saldo")) {
      return "payment_line";
    }
  }
  if (low.includes("total documento") && /factura\s+n/i.test(n)) return "invoice_ref";
  if (low.includes("importe descontado") && /nota\s+de\s+cr[eé]dito/i.test(n)) return "credit_note";
  if (low.includes("pago previo") && /recibo\s+n/i.test(n)) return "prior_receipt";
  return null;
}

/**
 * Recibos guardados con el formato antiguo (fila factura + fila NC / recibo previo):
 * al armar el PDF, una sola fila "Pago de factura … (NC …)" con importe neto.
 * No modifica el documento en BD; solo la vista del PDF.
 */
export function collapseLegacyReciboSettlementItemsForPdf(
  type: ComprobanteType,
  items: LineItem[],
  relatedInvoiceNumber: string | undefined
): LineItem[] {
  if (type !== "Recibo" || items.length === 0) return items;
  if (items.some((it) => getReceiptSettlementRowKind(it) === "payment_line")) return items;

  const kinds = items.map((it) => getReceiptSettlementRowKind(it));
  const hasInv = kinds.includes("invoice_ref");
  const hasCn = kinds.includes("credit_note");
  const hasPrior = kinds.includes("prior_receipt");
  if (!hasInv || (!hasCn && !hasPrior)) return items;
  if (!items.every((it) => getReceiptSettlementRowKind(it) != null)) return items;

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const disc = items.reduce((s, it) => s + it.discount * it.quantity, 0);
  const net = roundMoney(subtotal - disc);

  const ncNumbers: string[] = [];
  const priorRecNums: string[] = [];
  for (const it of items) {
    const k = getReceiptSettlementRowKind(it);
    const text = itemServiceLabel(it);
    if (k === "credit_note") {
      const m =
        text.match(/nota\s+de\s+cr[eé]dito\s+n[°º]?\s*([A-Z0-9-]+)/i) ||
        text.match(/n[°º]?\s*([A-Z0-9-]+)(?:\s*[-\u2014])/i);
      if (m) ncNumbers.push(m[1]);
    }
    if (k === "prior_receipt") {
      const m = text.match(/[Rr]ecibo\s+n[°º]?\s*([A-Z0-9-]+)/i);
      if (m) priorRecNums.push(m[1]);
    }
  }
  ncNumbers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  priorRecNums.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let factNum = (relatedInvoiceNumber ?? "").trim();
  if (!factNum) {
    const invLine = items.find((it) => getReceiptSettlementRowKind(it) === "invoice_ref");
    if (invLine) {
      const parsed = parseFacturaFromInvoiceRefLine(itemServiceLabel(invLine));
      if (parsed) factNum = parsed;
    }
  }
  if (!factNum) factNum = "Factura";

  const serviceName = buildReciboPaymentLineDescription(factNum, ncNumbers, priorRecNums);
  const month = items[0]?.month ?? "";
  return [
    {
      reciboLineKind: "payment_line",
      serviceName,
      month,
      quantity: 1,
      price: net,
      discount: 0,
    },
  ];
}

/** Recibo con una sola fila de pago (neto); no mostrar caja "Concepto: …" arriba de la tabla. */
export function reciboIsPaymentLineSettledTable(items: LineItem[]): boolean {
  return items.some((it) => getReceiptSettlementRowKind(it) === "payment_line");
}

/** True si el recibo está en modo liquidación (viejo o nuevo). */
export function reciboHasSettlementRows(items: LineItem[]): boolean {
  return items.some((it) => getReceiptSettlementRowKind(it) != null);
}

/** Filas de tabla PDF/vista previa: liquidación = 1 fila; ítem normal puede sumar fila de descuento. */
export function countItemTableRows(it: LineItem): number {
  if (getReceiptSettlementRowKind(it) != null) return 1;
  return 1 + (it.discount > 0 ? 1 : 0);
}
