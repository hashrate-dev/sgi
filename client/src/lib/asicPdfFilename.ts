import { isAsicEquipmentSaleDocument } from "./asicDocumentKind";
import type { InvoiceDocumentContext } from "./invoiceDocumentContext";
import { stripTrailingInvoiceMonth } from "./invoiceLineItemDescription";
import { getReceiptSettlementRowKind } from "./receiptSettlementLine";
import type { ComprobanteType, LineItem } from "./types";

/** Prefijo de empresa en nombres de PDF ASIC (emisión / descarga). */
const ASIC_PDF_COMPANY = "HRS GROUP S.A";

/** Prefijo de recibos de billing ASIC: `HRS_GROUP_RC001161_PIROTTO_PABLO_BITMAIN_S21_….pdf` */
const ASIC_RECEIPT_PDF_PREFIX = "HRS_GROUP";

/** Caracteres inválidos en nombres de archivo (Windows + control). */
function stripInvalidFilenameChars(s: string): string {
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Segmento en MAYÚSCULAS, sin basura de filesystem. */
function filenameSegment(raw: string, fallback = ""): string {
  const cleaned = stripInvalidFilenameChars(String(raw ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.toUpperCase();
}

/** Etiqueta de tipo de documento para el nombre de archivo (como en los PDF de referencia). */
export function asicPdfDocumentTypeLabel(
  type: ComprobanteType,
  opts?: {
    documentContext?: InvoiceDocumentContext;
    items?: LineItem[] | null;
  }
): string {
  const ctx = opts?.documentContext;
  if (ctx === "garantia-ande") {
    if (type === "Recibo Devolución") return "COMPROBANTE DEVOLUCION";
    return "COMPROBANTE GARANTIA";
  }
  if (type === "Factura") {
    if (ctx === "comprobante-pago" || isAsicEquipmentSaleDocument(opts?.items, ctx)) {
      return "COMPROBANTE PAGO";
    }
    return "FACTURA CREDITO";
  }
  if (type === "Recibo") return "RECIBO";
  if (type === "Recibo Devolución") return "RECIBO DEVOLUCION";
  return "NOTA DE CREDITO";
}

/** Descripción de equipo(s) para el nombre: MARCA MODELO PROCESADOR (espacios). */
export function asicPdfEquipmentLabel(items: LineItem[] | undefined | null): string {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const it of items ?? []) {
    let label = "";
    if (it.marcaEquipo || it.modeloEquipo || it.procesadorEquipo) {
      label = [it.marcaEquipo, it.modeloEquipo, it.procesadorEquipo].filter(Boolean).join(" ");
    } else if (it.garantiaMarca || it.garantiaModelo) {
      label = [it.garantiaMarca, it.garantiaModelo].filter(Boolean).join(" ");
    } else if (it.setupNombre) {
      label = it.setupNombre;
    } else if (it.reparacionNombre) {
      label = it.reparacionNombre;
    } else if (it.transporteFleteNombre) {
      label = it.transporteFleteNombre;
    } else if (it.serviceName) {
      label = it.serviceName;
    }
    const seg = filenameSegment(label);
    if (seg && !seen.has(seg)) {
      seen.add(seg);
      labels.push(seg);
    }
  }

  if (labels.length === 0) return "";
  // Varios equipos distintos: unir con + (sigue siendo un solo segmento legible).
  return labels.join(" + ");
}

/** MAYÚSCULAS y un solo `_` entre palabras. Sin tildes ni signos. */
function underscoreToken(raw: string): string {
  return stripInvalidFilenameChars(String(raw ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

/** "PIROTTO, PABLO" → PIROTTO_PABLO. "RIBBO DREYER, MERCEDES" → RIBBO_DREYER_MERCEDES. */
function receiptClientToken(clientName: string): string {
  const raw = String(clientName ?? "").trim();
  if (!raw) return "CLIENTE";
  const comma = raw.indexOf(",");
  if (comma >= 0) {
    const last = underscoreToken(raw.slice(0, comma));
    const first = underscoreToken(raw.slice(comma + 1));
    return [last, first].filter(Boolean).join("_") || "CLIENTE";
  }
  return underscoreToken(raw) || "CLIENTE";
}

function isReceiptPaymentOrAdjustmentLine(it: LineItem): boolean {
  if (getReceiptSettlementRowKind(it)) return true;
  const label = String(it.serviceName ?? it.service ?? it.reparacionNombre ?? "").trim();
  if (!label) return false;
  return (
    /^pago(\s+parcial)?\s+de\s+factura\b/i.test(label) ||
    /^ajuste\s*:/i.test(label) ||
    /^total\s+comprobante\b/i.test(label) ||
    /^servicio\s+asic$/i.test(label)
  );
}

/** Texto comercial del ítem (equipo, setup, reparación o flete), sin el mes de facturación. */
function receiptItemSourceLabel(it: LineItem): string {
  if (isReceiptPaymentOrAdjustmentLine(it)) return "";
  if (it.marcaEquipo || it.modeloEquipo || it.procesadorEquipo) {
    return [it.marcaEquipo, it.modeloEquipo, it.procesadorEquipo].filter(Boolean).join(" ");
  }
  if (it.setupNombre) return it.setupNombre;
  if (it.reparacionNombre) return it.reparacionNombre;
  if (it.transporteFleteNombre) return it.transporteFleteNombre;
  if (it.garantiaMarca || it.garantiaModelo) {
    return [it.garantiaMarca, it.garantiaModelo].filter(Boolean).join(" ");
  }
  return String(it.serviceName ?? it.service ?? "").trim();
}

/** Ítem(s) del recibo para el nombre del PDF. Varios ítems se concatenan con `_`. */
export function asicReciboPdfItemToken(items: LineItem[] | undefined | null): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const it of items ?? []) {
    const { label } = stripTrailingInvoiceMonth(receiptItemSourceLabel(it));
    const token = underscoreToken(label);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    parts.push(token);
  }
  const joined = parts.join("_");
  if (joined.length <= 140) return joined;
  return joined.slice(0, 140).replace(/_+$/g, "");
}

function isAsicBillingRecibo(type: ComprobanteType, documentContext?: InvoiceDocumentContext): boolean {
  return type === "Recibo" && documentContext !== "garantia-ande";
}

/**
 * Nombre de archivo al guardar PDF ASIC.
 * Recibos de billing: `HRS_GROUP_RC001161_PIROTTO_PABLO_BITMAIN_S21_FUENTE_DE_PODER_PSU.pdf`
 * Resto: `HRS GROUP S.A - COMPROBANTE PAGO - BITMAIN S21 235 THS - F100324 - GUBBA GONZALEZ IGNACIO.pdf`
 */
export function buildAsicComprobantePdfFilename(opts: {
  number: string;
  clientName: string;
  type: ComprobanteType;
  items?: LineItem[] | null;
  /** Ítems de la factura abonada, cuando el recibo solo guarda la línea de pago. */
  productItems?: LineItem[] | null;
  documentContext?: InvoiceDocumentContext;
}): string {
  if (isAsicBillingRecibo(opts.type, opts.documentContext)) {
    const number = underscoreToken(opts.number) || "SIN_NUMERO";
    const client = receiptClientToken(opts.clientName);
    const item = asicReciboPdfItemToken(opts.items) || asicReciboPdfItemToken(opts.productItems);
    const parts = [ASIC_RECEIPT_PDF_PREFIX, number, client];
    if (item) parts.push(item);
    return `${parts.join("_")}.pdf`;
  }

  const docType = asicPdfDocumentTypeLabel(opts.type, {
    documentContext: opts.documentContext,
    items: opts.items,
  });
  const equipment = asicPdfEquipmentLabel(opts.items);
  const number = filenameSegment(opts.number, "SIN-NUMERO");
  const client = filenameSegment(opts.clientName, "CLIENTE");

  const parts = [ASIC_PDF_COMPANY, docType];
  if (equipment) parts.push(equipment);
  parts.push(number, client);

  return `${parts.join(" - ")}.pdf`;
}
