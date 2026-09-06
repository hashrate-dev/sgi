import { jsPDF } from "jspdf";
import type { AsicCostoEquipoItem } from "./api";
import { loadImageAsBase64 } from "./generateFacturaPdf";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const HRS_GREEN = { r: 45, g: 93, b: 70 };
const HRS_ACCENT = { r: 0, g: 166, b: 82 };

export type AsicCotizacionPdfItem = Pick<
  AsicCostoEquipoItem,
  "id" | "marca" | "modelo" | "procesador" | "observaciones" | "precioVenta" | "createdAt"
>;

export type AsicCotizacionPdfOptions = {
  items: AsicCotizacionPdfItem[];
  /** Nombre del cliente o potencial cliente (opcional). */
  destinatario?: string;
  /** Nota corta al pie (opcional). */
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

  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, y, 54, 15.5);
    } catch {
      try {
        doc.addImage(logo, "JPEG", M, y, 54, 15.5);
      } catch {
        /* sin logo */
      }
    }
  }

  const rx = PAGE_W - M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text("HRS GROUP S.A.", rx, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text("Hashrate Space", rx, y + 8.5, { align: "right" });
  doc.text("Juan de Salazar 1857 — Asunción, Paraguay", rx, y + 12.5, { align: "right" });
  doc.text("sales@hashrate.space · (+595) 993 358 387", rx, y + 16.5, { align: "right" });

  y += 22;
  doc.setDrawColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
  doc.setLineWidth(0.7);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text("Cotización de equipos ASIC", M, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text(`Fecha: ${formatFechaLarga()}`, M, y);
  y += 5;

  const dest = (opts.destinatario || "").trim();
  if (dest) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("Destinatario:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(dest, M + 28, y);
    y += 5;
  }

  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  doc.text("Precios de referencia en USD. Cotización sujeta a disponibilidad y confirmación comercial.", M, y);
  y += 7;

  // Tabla
  const col = {
    n: M,
    equipo: M + 10,
    proc: M + 62,
    precio: M + 118,
    obs: M + 148,
  };
  const colW = {
    equipo: 50,
    proc: 54,
    precio: 28,
    obs: PAGE_W - M - (M + 148),
  };

  const drawHeader = () => {
    doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
    doc.rect(M, y - 4.2, PAGE_W - 2 * M, 7.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("#", col.n + 1, y);
    doc.text("Equipo", col.equipo, y);
    doc.text("Procesador / Hashrate", col.proc, y);
    doc.text("Precio USD", col.precio + colW.precio, y, { align: "right" });
    doc.text("Observaciones", col.obs, y);
    y += 6;
  };

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let total = 0;
  let rowIndex = 0;

  const ensureSpace = (need: number) => {
    if (y + need < PAGE_H - 28) return;
    doc.addPage();
    y = M;
    drawHeader();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
  };

  for (const item of items) {
    const equipo = equipoLabel(item);
    const proc = (item.procesador || "—").trim() || "—";
    const obs = (item.observaciones || "").trim() || "—";
    const precio = Number(item.precioVenta) || 0;
    total += precio;

    const equipoLines = doc.splitTextToSize(equipo, colW.equipo);
    const procLines = doc.splitTextToSize(proc, colW.proc);
    const obsLines = doc.splitTextToSize(obs, colW.obs);
    const lines = Math.max(equipoLines.length, procLines.length, obsLines.length, 1);
    const rowH = Math.max(7, lines * 4 + 2.5);

    ensureSpace(rowH + 2);
    rowIndex += 1;

    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 248, 246);
      doc.rect(M, y - 3.5, PAGE_W - 2 * M, rowH, "F");
    }

    doc.setTextColor(25, 25, 25);
    doc.setFont("helvetica", "normal");
    doc.text(String(rowIndex), col.n + 1, y);
    doc.setFont("helvetica", "bold");
    doc.text(equipoLines, col.equipo, y);
    doc.setFont("helvetica", "normal");
    doc.text(procLines, col.proc, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
    doc.text(moneyUsd(precio), col.precio + colW.precio, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(obsLines, col.obs, y);

    y += rowH;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(M, y - 3.2, PAGE_W - M, y - 3.2);
  }

  ensureSpace(18);
  y += 2;
  doc.setFillColor(240, 253, 244);
  doc.rect(M, y - 4, PAGE_W - 2 * M, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text("TOTAL COTIZACIÓN", M + 3, y + 2.2);
  doc.setFontSize(12);
  doc.setTextColor(HRS_ACCENT.r, HRS_ACCENT.g, HRS_ACCENT.b);
  doc.text(moneyUsd(total), PAGE_W - M - 3, y + 2.2, { align: "right" });
  y += 14;

  const nota =
    (opts.nota || "").trim() ||
    "Esta cotización es referencial. Los precios no incluyen garantía ANDE ni instalación salvo que se indique expresamente. Válida sujeta a stock y confirmación del equipo comercial.";
  ensureSpace(22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  const notaLines = doc.splitTextToSize(nota, PAGE_W - 2 * M);
  doc.text(notaLines, M, y);
  y += notaLines.length * 3.4 + 6;

  doc.setDrawColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.setLineWidth(0.4);
  doc.line(M, Math.max(y, PAGE_H - 18), PAGE_W - M, Math.max(y, PAGE_H - 18));
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Hashrate Space · HRS GROUP S.A. · www.hashrate.space", PAGE_W / 2, PAGE_H - 12, {
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
