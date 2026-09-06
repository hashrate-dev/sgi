import { jsPDF } from "jspdf";
import type { AsicCostoEquipoItem } from "./api";
import { loadImageAsBase64 } from "./generateFacturaPdf";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - 2 * M;

const GREEN = { r: 45, g: 93, b: 70 };
const TEXT = { r: 33, g: 37, b: 41 };
const MUTED = { r: 108, g: 117, b: 125 };
const LINE = { r: 222, g: 226, b: 230 };
const ROW_ALT = { r: 248, g: 249, b: 250 };

const DEFAULT_LEGAL =
  "Condiciones de precio: Los importes de esta cotización son referenciales y no constituyen oferta firme, reserva de stock ni compromiso de precio cerrado. Los precios de equipos ASIC se ajustan según la demanda, la disponibilidad y las condiciones del mercado internacional, pudiendo subir o bajar de un día para otro. Hashrate Space / HRS GROUP S.A. se reserva el derecho de modificar o dejar sin efecto esta cotización hasta la confirmación escrita del pedido. La demora del destinatario en responder no garantiza ni fija el precio aquí informado. Los precios no incluyen garantía ANDE ni instalación, salvo indicación expresa.";

export type AsicCotizacionPdfItem = Pick<
  AsicCostoEquipoItem,
  "id" | "marca" | "modelo" | "procesador" | "observaciones" | "precioVenta" | "createdAt"
>;

export type AsicCotizacionPdfOptions = {
  items: AsicCotizacionPdfItem[];
  destinatario?: string;
  nota?: string;
};

function moneyUsd(n: number): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(n));
}

function formatFechaLarga(d = new Date()): string {
  return new Intl.DateTimeFormat("es-PY", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(d);
}

function equipoLabel(item: AsicCotizacionPdfItem): string {
  const marca = (item.marca || "").trim();
  const modelo = (item.modelo || "").trim();
  if (marca && modelo) return `${marca} ${modelo}`;
  return marca || modelo || "Equipo ASIC";
}

async function loadHashrateLogo(): Promise<string | undefined> {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const candidates = [`${base}images/LOGO-HASHRATE.png`, `${base}images/wp-uploads/hashrate-LOGO.png`];
  for (const url of candidates) {
    try {
      return await loadImageAsBase64(url);
    } catch {
      /* siguiente */
    }
  }
  return undefined;
}

/**
 * PDF formal de cotización ASIC — diseño simple y limpio.
 */
export async function downloadAsicCotizacionPdf(opts: AsicCotizacionPdfOptions): Promise<void> {
  const items = opts.items.filter(Boolean);
  if (items.length === 0) {
    throw new Error("Seleccioná al menos un equipo para generar la cotización.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadHashrateLogo();
  let y = M;

  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, y, 50, 14.5);
    } catch {
      try {
        doc.addImage(logo, "JPEG", M, y, 50, 14.5);
      } catch {
        /* sin logo */
      }
    }
  }

  const rx = PAGE_W - M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(GREEN.r, GREEN.g, GREEN.b);
  doc.text("HRS GROUP S.A.", rx, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("sales@hashrate.space · (+595) 993 358 387", rx, y + 11.5, { align: "right" });

  y += 22;
  doc.setDrawColor(GREEN.r, GREEN.g, GREEN.b);
  doc.setLineWidth(0.55);
  doc.line(M, y, PAGE_W - M, y);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(GREEN.r, GREEN.g, GREEN.b);
  doc.text("Cotización de equipos ASIC", M, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
  doc.text(`Fecha: ${formatFechaLarga()}`, M, y);
  y += 5;

  const dest = (opts.destinatario || "").trim();
  if (dest) {
    doc.setFont("helvetica", "bold");
    doc.text("Destinatario:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(dest, M + 26, y);
    y += 5;
  }

  y += 2;

  const col = {
    n: M,
    equipo: M + 10,
    proc: M + 58,
    precio: M + 112,
    obs: M + 142,
  };
  const colW = {
    equipo: 46,
    proc: 52,
    precio: 28,
    obs: PAGE_W - M - col.obs,
  };

  const drawHeader = () => {
    doc.setFillColor(GREEN.r, GREEN.g, GREEN.b);
    doc.rect(M, y - 4, CONTENT_W, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("#", col.n + 2, y);
    doc.text("Equipo", col.equipo, y);
    doc.text("Procesador / Hashrate", col.proc, y);
    doc.text("Precio USD", col.precio + colW.precio, y, { align: "right" });
    doc.text("Observaciones", col.obs, y);
    y += 6;
  };

  drawHeader();

  let rowIndex = 0;

  const ensureSpace = (need: number) => {
    if (y + need < PAGE_H - 28) return;
    doc.addPage();
    y = M;
    drawHeader();
  };

  for (const item of items) {
    const equipo = equipoLabel(item);
    const proc = (item.procesador || "—").trim() || "—";
    const obs = (item.observaciones || "").trim() || "—";
    const precio = Number(item.precioVenta) || 0;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const equipoLines = doc.splitTextToSize(equipo, colW.equipo);
    doc.setFont("helvetica", "normal");
    const procLines = doc.splitTextToSize(proc, colW.proc);
    const obsLines = doc.splitTextToSize(obs, colW.obs);
    const lines = Math.max(equipoLines.length, procLines.length, obsLines.length, 1);
    const rowH = Math.max(7, lines * 4 + 2.5);

    ensureSpace(rowH + 2);
    rowIndex += 1;

    if (rowIndex % 2 === 0) {
      doc.setFillColor(ROW_ALT.r, ROW_ALT.g, ROW_ALT.b);
      doc.rect(M, y - 3.5, CONTENT_W, rowH, "F");
    }

    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(String(rowIndex), col.n + 2, y);

    doc.setFont("helvetica", "bold");
    doc.text(equipoLines, col.equipo, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(procLines, col.proc, y);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.text(moneyUsd(precio), col.precio + colW.precio, y, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(obsLines, col.obs, y);

    y += rowH;
    doc.setDrawColor(LINE.r, LINE.g, LINE.b);
    doc.setLineWidth(0.2);
    doc.line(M, y - 3.2, PAGE_W - M, y - 3.2);
  }

  ensureSpace(10);
  y += 2;
  doc.setDrawColor(GREEN.r, GREEN.g, GREEN.b);
  doc.setLineWidth(0.4);
  doc.line(M, y, PAGE_W - M, y);
  y += 7;

  const nota = (opts.nota || "").trim() || DEFAULT_LEGAL;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  const notaLines = doc.splitTextToSize(nota, CONTENT_W);
  ensureSpace(notaLines.length * 3.2 + 12);

  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(notaLines, M, y);
  y += notaLines.length * 3.2 + 8;

  const footerY = Math.max(y, PAGE_H - 14);
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.setLineWidth(0.3);
  doc.line(M, footerY, PAGE_W - M, footerY);
  doc.setFontSize(7);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("Hashrate Space · HRS GROUP S.A. · www.hashrate.space", PAGE_W / 2, footerY + 5, {
    align: "center",
  });

  const stamp = new Date();
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
  const safeDest = dest.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40);
  const filename = safeDest
    ? `Cotizacion_ASIC_${safeDest}_${ymd}.pdf`
    : `Cotizacion_ASIC_${ymd}_${items.length}equipos.pdf`;
  doc.save(filename);
}
