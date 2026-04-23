import type { Invoice } from "./types";
import { isLinkedToInvoice } from "./invoiceLinks";

export type ReciboConceptParts = {
  facturaNumber: string;
  creditNoteNumbers: string[];
  priorReceiptNumbers: string[];
};

/**
 * NC y recibos previos vinculados a la misma factura (para texto de concepto del recibo).
 * @param excludeReciboId — id del recibo actual al reimprimir (no cuenta como “previo”).
 */
export function getReciboConceptParts(
  factura: Invoice,
  all: Invoice[],
  options?: { excludeReciboId?: string }
): ReciboConceptParts {
  const exclude = options?.excludeReciboId;
  const creditNoteNumbers = all
    .filter((i) => i.type === "Nota de Crédito" && isLinkedToInvoice(i, factura))
    .map((i) => i.number)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const priorReceiptNumbers = all
    .filter(
      (i) =>
        i.type === "Recibo" &&
        isLinkedToInvoice(i, factura) &&
        (exclude == null || String(i.id) !== String(exclude))
    )
    .map((i) => i.number)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    facturaNumber: factura.number,
    creditNoteNumbers,
    priorReceiptNumbers,
  };
}

/**
 * Texto para el PDF / pantalla: explica pago sobre factura y documentos que afectan el saldo.
 * Ej.: "Concepto: Pago de factura F100204 — nota de crédito N001007 aplicada"
 */
export function buildReciboConceptLine(parts: ReciboConceptParts): string {
  const { facturaNumber, creditNoteNumbers, priorReceiptNumbers } = parts;
  const segs: string[] = [`Pago de factura ${facturaNumber}`];
  if (creditNoteNumbers.length === 1) {
    segs.push(`nota de crédito ${creditNoteNumbers[0]} aplicada`);
  } else if (creditNoteNumbers.length > 1) {
    segs.push(`notas de crédito ${creditNoteNumbers.join(", ")} aplicadas`);
  }
  if (priorReceiptNumbers.length === 1) {
    segs.push(`recibo previo ${priorReceiptNumbers[0]} ya registrado`);
  } else if (priorReceiptNumbers.length > 1) {
    segs.push(`recibos previos ${priorReceiptNumbers.join(", ")} ya registrados`);
  }
  return `Concepto: ${segs.join(" — ")}`;
}

/** True si hay al menos una NC sobre la factura (p. ej. NC parcial que exige liquidación en el recibo). */
export function facturaHasLinkedCreditNotes(factura: Invoice, all: Invoice[]): boolean {
  return all.some((i) => i.type === "Nota de Crédito" && isLinkedToInvoice(i, factura));
}

/**
 * Un solo renglón de ítem en recibos con liquidación (NC y/o recibos previos).
 * Ej.: "Pago de factura F100204 (NC N001007 aplicada)"
 */
export function buildReciboPaymentLineDescription(
  facturaNumber: string,
  creditNoteNumbers: string[],
  priorReceiptNumbers: string[]
): string {
  const base = `Pago de factura ${facturaNumber}`;
  const parts: string[] = [];
  if (creditNoteNumbers.length === 1) {
    parts.push(`NC ${creditNoteNumbers[0]} aplicada`);
  } else if (creditNoteNumbers.length > 1) {
    parts.push(`NC ${creditNoteNumbers.join(", ")} aplicadas`);
  }
  if (priorReceiptNumbers.length === 1) {
    parts.push(`recibo previo ${priorReceiptNumbers[0]}`);
  } else if (priorReceiptNumbers.length > 1) {
    parts.push(`recibos previos ${priorReceiptNumbers.join(", ")}`);
  }
  if (parts.length === 0) {
    return `${base} (liquidación de saldo)`;
  }
  return `${base} (${parts.join("; ")})`;
}
