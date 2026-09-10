import type { ComprobanteType } from "./types";

/** Contexto de documento para adaptar títulos/frases sin cambiar el tipo interno. */
export type InvoiceDocumentContext = "garantia-ande";

/** Texto legal corto para depósito en garantía (sin nombrar ANDE) — emisión. */
export const GARANTIA_DEPOSITO_LEGAL =
  "El monto recibido se destina a depósito en garantía de potencia energética vinculado al servicio de hosting. Se restituye al finalizar el alojamiento y liberarse la potencia asociada; el plazo de devolución depende de los tiempos en que se efectivice la liberación de dicha garantía energética. El monto puede ajustarse por tipo de cambio del Guaraní a la fecha de devolución.";

/** Texto legal corto — devolución (mismo tono/estilo que la emisión). */
export const GARANTIA_DEVOLUCION_LEGAL =
  "El monto restituido corresponde al depósito en garantía de potencia energética vinculado al servicio de hosting. Se efectúa al finalizar el alojamiento y liberarse la potencia asociada; el plazo de devolución depende de los tiempos en que se efectivice la liberación de dicha garantía energética. El monto puede ajustarse por tipo de cambio del Guaraní a la fecha de devolución.";

export function invoiceTipoLabel(
  type: ComprobanteType,
  documentContext?: InvoiceDocumentContext
): string {
  if (documentContext === "garantia-ande") {
    if (type === "Recibo") return "COMPROBANTE GARANTIA";
    if (type === "Recibo Devolución") return "COMPROBANTE DEVOLUCION";
  }
  if (type === "Factura") return "FACTURA CREDITO";
  if (type === "Recibo") return "RECIBO";
  if (type === "Recibo Devolución") return "RECIBO DEVOLUCIÓN";
  return "NOTA DE CRÉDITO";
}

/** Bloque legal según emisión o devolución (mismo layout de documento). */
export function garantiaLegalText(type: ComprobanteType): string {
  return type === "Recibo Devolución" ? GARANTIA_DEVOLUCION_LEGAL : GARANTIA_DEPOSITO_LEGAL;
}
