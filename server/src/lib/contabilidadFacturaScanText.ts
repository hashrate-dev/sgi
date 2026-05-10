import path from "node:path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createWorker } from "tesseract.js";

export const FACTURA_ADJUNTO_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;

/** Acepta PDF (texto) o imagen común; normaliza .jpeg a .jpg */
export function facturaAttachmentExtFromUpload(mimetype: string, originalname: string): string {
  const mt = (mimetype || "").toLowerCase();
  if (mt === "application/pdf") return ".pdf";
  if (mt === "image/jpeg" || mt === "image/jpg") return ".jpg";
  if (mt === "image/png") return ".png";
  if (mt === "image/webp") return ".webp";
  if (mt === "image/gif") return ".gif";
  const ext = path.extname(originalname || "").toLowerCase();
  if (ext === ".pdf") return ".pdf";
  if (ext === ".jpg" || ext === ".jpeg") return ".jpg";
  if (ext === ".png") return ".png";
  if (ext === ".webp") return ".webp";
  if (ext === ".gif") return ".gif";
  return "";
}

export function isAllowedFacturaScanMime(mimetype: string, originalname: string): boolean {
  return facturaAttachmentExtFromUpload(mimetype, originalname) !== "";
}

/**
 * Extrae texto para el parser de gastos: PDF vía pdf-parse; imagen vía OCR (español + inglés).
 */
export async function extractFacturaScanText(buffer: Buffer, mimetype: string, originalname: string): Promise<string> {
  const ext = facturaAttachmentExtFromUpload(mimetype, originalname);
  if (!ext) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  if (ext === ".pdf") {
    const parsed = await pdfParse(buffer);
    return String(parsed.text ?? "");
  }
  const worker = await createWorker("spa+eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return String(text ?? "");
  } finally {
    await worker.terminate();
  }
}
