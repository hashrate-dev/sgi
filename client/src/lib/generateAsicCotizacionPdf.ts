import { jsPDF } from "jspdf";
import type { AsicCostoEquipoItem } from "./api";
import { loadImageAsBase64 } from "./generateFacturaPdf";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - 2 * M;

const HRS_GREEN = { r: 45, g: 93, b: 70 };
const HRS_ACCENT = { r: 0, g: 166, b: 82 };
const HRS_SOFT = { r: 232, g: 245, b: 236 };
const HRS_SOFT_ALT = { r: 246, g: 250, b: 247 };
const LINE_SOFT = { r: 214, g: 226, b: 218 };
const TEXT_MAIN = { r: 30, g: 41, b: 59 };
const TEXT_MUTED = { r: 100, g: 116, b: 139 };
const LEGAL_BG = { r: 255, g: 251, b: 235 };
const LEGAL_BORDER = { r: 251, g: 191, b: 36 };
const LEGAL_TITLE = { r: 146, g: 64, b: 14 };

const DEFAULT_LEGAL =
  "Condiciones de precio (importante): Los importes de esta cotización son referenciales y no constituyen oferta firme, reserva de stock ni compromiso de precio cerrado. Los precios de equipos ASIC se ajustan de forma continua según la demanda, la disponibilidad y las condiciones del mercado internacional, pudiendo subir o bajar de un día para otro. Hashrate Space / HRS GROUP S.A. se reserva el derecho de modificar, actualizar o dejar sin efecto esta cotización en cualquier momento hasta la confirmación escrita del pedido y de las condiciones comerciales. La demora del destinatario en responder, aceptar o formalizar la compra no garantiza ni fija el precio aquí informado. Los precios no incluyen garantía ANDE ni instalación, salvo indicación expresa.";

export type AsicCotizacionPdfItem = Pick<
  AsicCostoEquipoItem,
  "id" | "marca" | "modelo" | "procesador" | "observaciones" | "precioVenta" | "createdAt"
>;

export type AsicCotizacionPdfOptions = {
  items: AsicCotizacionPdfItem[];
  /** Nombre del cliente o potencial cliente (opcional). */
  destinatario?: string;
  /** Nota corta al pie (opcional). Reemplaza el aviso legal por defecto si se indica. */
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

function roundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: "S" | "F" | "FD" = "F"
) {
  const radius = Math.min(r, w / 2, h / 2);
  doc.roundedRect(x, y, w, h, radius, radius, style);
}

/**
 * PDF formal de cotización ASIC para enviar a cliente / potencial cliente.
 * Muestra solo datos comerciales (equipo, procesador, precio de venta, observaciones).
 */
export async function downloadAsicCotizacionPdf(opts: AsicCotizacionPdfOptions): Promise<void> {
  const items = opts.items.filter(Boolean);
  if (items.length === 0) {
    throw new Error("Seleccioná al menos un equipo para generar la cotización.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadHashrateLogo();
  let y = M;

  // Fondo decorativo superior
  doc.setFillColor(HRS_SOFT.r, HRS_SOFT.g, HRS_SOFT.b);
  doc.rect(0, 0, PAGE_W, 38, "F");
  doc.setFillColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
  doc.rect(0, 0, 3.2, 38, "F");

  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, y + 1, 52, 15);
    } catch {
      try {
        doc.addImage(logo, "JPEG", M, y + 1, 52, 15);
      } catch {
        /* sin logo */
      }
    }
  }

  const rx = PAGE_W - M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text("HRS GROUP S.A.", rx, y + 4.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
  doc.text("Hashrate Space", rx, y + 9, { align: "right" });
  doc.text("Juan de Salazar 1857 — Asunción, Paraguay", rx, y + 13, { align: "right" });
  doc.text("sales@hashrate.space · (+595) 993 358 387", rx, y + 17, { align: "right" });

  y = 42;

  // Título + meta
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text("Cotización de equipos ASIC", M, y);
  y += 1.8;
  doc.setDrawColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
  doc.setLineWidth(1.1);
  doc.line(M, y + 1.5, M + 42, y + 1.5);
  y += 8;

  // Chip de fecha
  doc.setFillColor(HRS_SOFT.r, HRS_SOFT.g, HRS_SOFT.b);
  roundedRect(doc, M, y - 3.6, 78, 7.2, 1.8, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text(`Fecha: ${formatFechaLarga()}`, M + 3, y + 1);

  const dest = (opts.destinatario || "").trim();
  if (dest) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(LINE_SOFT.r, LINE_SOFT.g, LINE_SOFT.b);
    doc.setLineWidth(0.3);
    roundedRect(doc, M + 82, y - 3.6, CONTENT_W - 82, 7.2, 1.8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
    doc.text("Para:", M + 85, y + 1);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TEXT_MAIN.r, TEXT_MAIN.g, TEXT_MAIN.b);
    const destClip = doc.splitTextToSize(dest, CONTENT_W - 100);
    doc.text(destClip[0] || dest, M + 96, y + 1);
  }
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
  doc.text("Precios de referencia en USD · Sujetos a disponibilidad y condiciones de mercado", M, y);
  y += 7;

  // Columnas de la tabla
  const gap = 2;
  const colW = {
    n: 9,
    equipo: 46,
    proc: 48,
    precio: 28,
    obs: 0,
  };
  colW.obs = CONTENT_W - (colW.n + colW.equipo + colW.proc + colW.precio + gap * 3);

  const colX = {
    n: M,
    equipo: M + colW.n,
    proc: M + colW.n + colW.equipo + gap,
    precio: M + colW.n + colW.equipo + colW.proc + gap * 2,
    obs: M + colW.n + colW.equipo + colW.proc + colW.precio + gap * 3,
  };

  const headerH = 9;

  const drawTableFrameTop = (yy: number) => {
    doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
    roundedRect(doc, M, yy, CONTENT_W, headerH, 2.2, "F");
    // Cubre la parte inferior del redondeo para conectar con filas
    doc.rect(M, yy + headerH - 2.5, CONTENT_W, 2.5, "F");
  };

  const drawHeaderLabels = (yy: number) => {
    const ty = yy + 5.8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(255, 255, 255);
    doc.text("#", colX.n + colW.n / 2, ty, { align: "center" });
    doc.text("EQUIPO", colX.equipo + 1.5, ty);
    doc.text("PROCESADOR / HASHRATE", colX.proc + 1.5, ty);
    doc.text("PRECIO USD", colX.precio + colW.precio - 1.5, ty, { align: "right" });
    doc.text("OBSERVACIONES", colX.obs + 1.5, ty);
  };

  const drawHeader = () => {
    drawTableFrameTop(y);
    drawHeaderLabels(y);
    y += headerH;
  };

  drawHeader();

  let total = 0;
  let rowIndex = 0;

  const ensureSpace = (need: number) => {
    if (y + need < PAGE_H - 36) return;
    // cierre visual de página
    doc.setDrawColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
    doc.setLineWidth(0.5);
    doc.line(M, y, PAGE_W - M, y);
    doc.addPage();
    y = M;
    drawHeader();
  };

  for (const item of items) {
    const equipo = equipoLabel(item);
    const proc = (item.procesador || "—").trim() || "—";
    const obs = (item.observaciones || "").trim() || "—";
    const precio = Number(item.precioVenta) || 0;
    total += precio;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    const equipoLines = doc.splitTextToSize(equipo, colW.equipo - 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    const procLines = doc.splitTextToSize(proc, colW.proc - 3);
    const obsLines = doc.splitTextToSize(obs, colW.obs - 3);
    const lines = Math.max(equipoLines.length, procLines.length, obsLines.length, 1);
    const rowH = Math.max(9.5, lines * 3.8 + 4.2);

    ensureSpace(rowH + 1);
    rowIndex += 1;

    const rowTop = y;
    if (rowIndex % 2 === 0) {
      doc.setFillColor(HRS_SOFT_ALT.r, HRS_SOFT_ALT.g, HRS_SOFT_ALT.b);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(M, rowTop, CONTENT_W, rowH, "F");

    // Acento izquierdo suave en filas pares
    if (rowIndex % 2 === 0) {
      doc.setFillColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
      doc.rect(M, rowTop, 1.1, rowH, "F");
    }

    // Separador inferior
    doc.setDrawColor(LINE_SOFT.r, LINE_SOFT.g, LINE_SOFT.b);
    doc.setLineWidth(0.25);
    doc.line(M, rowTop + rowH, PAGE_W - M, rowTop + rowH);

    const textY = rowTop + 5.2;

    // #
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
    doc.text(String(rowIndex), colX.n + colW.n / 2, textY, { align: "center" });

    // Equipo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(TEXT_MAIN.r, TEXT_MAIN.g, TEXT_MAIN.b);
    doc.text(equipoLines, colX.equipo + 1.5, textY);

    // Procesador
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    doc.text(procLines, colX.proc + 1.5, textY);

    // Precio con “pill” suave
    const precioTxt = moneyUsd(precio);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.3);
    const precioW = Math.min(colW.precio - 2, doc.getTextWidth(precioTxt) + 5);
    const precioX = colX.precio + colW.precio - precioW - 1;
    doc.setFillColor(HRS_SOFT.r, HRS_SOFT.g, HRS_SOFT.b);
    roundedRect(doc, precioX, rowTop + 2.2, precioW, 5.6, 1.4, "F");
    doc.setTextColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
    doc.text(precioTxt, colX.precio + colW.precio - 2.2, textY, { align: "right" });

    // Observaciones
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
    doc.text(obsLines, colX.obs + 1.5, textY);

    y = rowTop + rowH;
  }

  // Borde inferior de tabla
  doc.setDrawColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.setLineWidth(0.55);
  doc.line(M, y, PAGE_W - M, y);

  ensureSpace(20);
  y += 4;

  // Total
  doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  roundedRect(doc, M, y, CONTENT_W, 12, 2.4, "F");
  doc.setFillColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
  doc.rect(M, y, 3, 12, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(220, 245, 230);
  doc.text("TOTAL COTIZACIÓN", M + 7, y + 7.5);
  doc.setFontSize(8);
  doc.setTextColor(190, 230, 205);
  doc.text(`${items.length} equipo${items.length === 1 ? "" : "s"}`, M + 58, y + 7.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(moneyUsd(total), PAGE_W - M - 5, y + 7.8, { align: "right" });
  y += 16;

  // Aviso legal
  const nota = (opts.nota || "").trim() || DEFAULT_LEGAL;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  const notaLines = doc.splitTextToSize(nota, CONTENT_W - 8);
  const legalH = Math.max(22, notaLines.length * 3.15 + 10);

  ensureSpace(legalH + 16);
  doc.setFillColor(LEGAL_BG.r, LEGAL_BG.g, LEGAL_BG.b);
  doc.setDrawColor(LEGAL_BORDER.r, LEGAL_BORDER.g, LEGAL_BORDER.b);
  doc.setLineWidth(0.45);
  roundedRect(doc, M, y, CONTENT_W, legalH, 2.2, "FD");
  doc.setFillColor(LEGAL_BORDER.r, LEGAL_BORDER.g, LEGAL_BORDER.b);
  doc.rect(M, y, 2.2, legalH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(LEGAL_TITLE.r, LEGAL_TITLE.g, LEGAL_TITLE.b);
  doc.text("Aviso comercial y de precios", M + 5, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.1);
  doc.setTextColor(120, 90, 40);
  doc.text(notaLines, M + 5, y + 9.2);
  y += legalH + 8;

  // Pie
  const footerY = Math.max(y, PAGE_H - 16);
  doc.setDrawColor(LINE_SOFT.r, LINE_SOFT.g, LINE_SOFT.b);
  doc.setLineWidth(0.35);
  doc.line(M, footerY, PAGE_W - M, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
  doc.text("Hashrate Space · HRS GROUP S.A. · www.hashrate.space", PAGE_W / 2, footerY + 5, {
    align: "center",
  });
  doc.setFontSize(6.5);
  doc.text("Documento generado automáticamente — precios no vinculantes hasta confirmación escrita", PAGE_W / 2, footerY + 9, {
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
