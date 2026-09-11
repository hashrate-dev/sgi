import { isAsicEquipmentSaleDocument } from "./asicDocumentKind";
import type { InvoiceDocumentContext } from "./invoiceDocumentContext";
import type { ComprobanteType, LineItem } from "./types";

/** Prefijo de empresa en nombres de PDF ASIC (emisión / descarga). */
const ASIC_PDF_COMPANY = "HRS GROUP S.A";

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
    if (ctx === "comprobante-pago" || isAsicEquipmentSaleDocument(opts?.items)) {
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

/**
 * Nombre de archivo al guardar PDF ASIC:
 * `HRS GROUP S.A - COMPROBANTE PAGO - BITMAIN S21 235 THS - F100324 - GUBBA GONZALEZ IGNACIO.pdf`
 * `HRS GROUP S.A - COMPROBANTE GARANTIA - BITMAIN S21 235 THS - RG0201 - GUBBA GONZALEZ IGNACIO.pdf`
 */
export function buildAsicComprobantePdfFilename(opts: {
  number: string;
  clientName: string;
  type: ComprobanteType;
  items?: LineItem[] | null;
  documentContext?: InvoiceDocumentContext;
}): string {
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
