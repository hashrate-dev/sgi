import { jsPDF } from "jspdf";
import type { ComprobanteType, LineItem } from "./types";

/** Colores HRS (verde marca) */
const HRS_GREEN = { r: 0, g: 166, b: 82 };

const MESES = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"
];

function formatDDMMYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatFechaTexto(d: Date): string {
  const mes = MESES[d.getMonth()];
  const dia = d.getDate();
  const anio = d.getFullYear();
  return `${mes} ${dia}, ${anio}`;
}

function monthToRange(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `01/${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function formatUSD(n: number): string {
  return `USD ${n.toFixed(2).replace(".", ",")}`;
}

export type FacturaPdfData = {
  number: string;
  type: ComprobanteType;
  clientName: string;
  date: Date;
  items: LineItem[];
  subtotal: number;
  discounts: number;
  total: number;
};

export type FacturaPdfImages = {
  logoBase64?: string;
  fajaBase64?: string;
};

const EMISOR = {
  nombre: "HRS GROUP S.A",
  direccion: "Juan de Salazar 1857",
  ciudad: "Asunción - Paraguay",
  telefono: "Teléfono: (+595) 993 358 387",
  email: "sales@hashrate.space",
  ruc: "RUC EMISOR: 80144251-6",
  web: "https://hashrate.space",
};

const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const COL_DESC = 95;
const COL_PRECIO = 32;
const COL_CANT = 22;
const COL_TOTAL = 38;
const TABLE_LEFT = MARGIN;
const ROW_H = 7;
const HEADER_ROW_H = 8;
const LOGO_HEIGHT_MM = 20;
const FAJA_HEIGHT_MM = 18;

/**
 * Genera el PDF de la factura con diseño HRS a color:
 * logo arriba, colores verde marca, tabla con encabezado verde, faja abajo.
 * Los textos se rellenan con data del formulario.
 */
export function generateFacturaPdf(data: FacturaPdfData, images?: FacturaPdfImages): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const now = data.date;
  const vencimiento = new Date(now);
  vencimiento.setDate(vencimiento.getDate() + 7);

  let y = 10;

  // ---------- Logo HRS (arriba, ancho de página) ----------
  if (images?.logoBase64) {
    try {
      const logoW = PAGE_W - 2 * MARGIN;
      doc.addImage(images.logoBase64, "PNG", MARGIN, y, logoW, LOGO_HEIGHT_MM);
      y += LOGO_HEIGHT_MM + 6;
    } catch {
      y += 4;
    }
  } else {
    y += 4;
  }

  // ---------- Fila: izquierda = emisor, derecha = FACTURA CREDITO + VIA CLIENTE + FECHA + TOTAL ----------
  const tipoLabel = data.type === "Factura" ? "FACTURA CREDITO" : "RECIBO";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text(EMISOR.nombre, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(`${tipoLabel} - ${data.number}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(EMISOR.direccion, MARGIN, y);
  doc.text("VIA CLIENTE", PAGE_W - MARGIN, y, { align: "right" });
  y += 5;

  doc.text(EMISOR.ciudad, MARGIN, y);
  doc.text("FECHA", PAGE_W - MARGIN, y, { align: "right" });
  y += 5;

  doc.text(EMISOR.telefono, MARGIN, y);
  doc.text(formatFechaTexto(now), PAGE_W - MARGIN, y, { align: "right" });
  y += 5;

  doc.text(EMISOR.email, MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text(`TOTAL ${formatUSD(data.total)}`, PAGE_W - MARGIN, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  y += 5;

  doc.text(EMISOR.ruc, PAGE_W - MARGIN, y, { align: "right" });
  y += 8;

  // ---------- Línea servicio (igual que referencia: "Servicio alojamiento y mantenimiento L7 - 01/09-30/09") ----------
  const firstItem = data.items[0];
  const code = firstItem?.serviceName?.match(/L7|L9|S21/i)?.[0]?.toUpperCase() || "L7";
  const servicioTitulo = firstItem
    ? `Servicio alojamiento y mantenimiento ${code} - ${firstItem.month ? monthToRange(firstItem.month) : ""}`.trim()
    : "Servicio alojamiento y mantenimiento";
  doc.setFontSize(10);
  doc.text(servicioTitulo, MARGIN, y);
  y += 8;

  // ---------- Tabla: encabezado con fondo verde ----------
  const tableTop = y;
  doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.rect(TABLE_LEFT, tableTop, COL_DESC + COL_PRECIO + COL_CANT + COL_TOTAL, HEADER_ROW_H, "F");
  doc.setDrawColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.line(TABLE_LEFT + COL_DESC, tableTop, TABLE_LEFT + COL_DESC, tableTop + HEADER_ROW_H);
  doc.line(TABLE_LEFT + COL_DESC + COL_PRECIO, tableTop, TABLE_LEFT + COL_DESC + COL_PRECIO, tableTop + HEADER_ROW_H);
  doc.line(TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT, tableTop, TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT, tableTop + HEADER_ROW_H);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("DESCRIPCION", TABLE_LEFT + 2, tableTop + 5.5);
  doc.text("PRECIO", TABLE_LEFT + COL_DESC + 2, tableTop + 5.5);
  doc.text("CANTIDAD", TABLE_LEFT + COL_DESC + COL_PRECIO + 2, tableTop + 5.5);
  doc.text("TOTAL", TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT + 2, tableTop + 5.5);
  doc.setTextColor(0, 0, 0);

  y = tableTop + HEADER_ROW_H;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setDrawColor(0, 0, 0);

  for (const it of data.items) {
    const lineTotal = (it.price - it.discount) * it.quantity;
    const desc = it.month ? `${it.serviceName} - ${it.month}` : it.serviceName;
    doc.rect(TABLE_LEFT, y, COL_DESC + COL_PRECIO + COL_CANT + COL_TOTAL, ROW_H);
    doc.text(desc.substring(0, 52), TABLE_LEFT + 2, y + 4.5);
    doc.text(formatUSD(it.price), TABLE_LEFT + COL_DESC + 2, y + 4.5);
    doc.text(String(it.quantity), TABLE_LEFT + COL_DESC + COL_PRECIO + 2, y + 4.5);
    doc.text(formatUSD(lineTotal), TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT + 2, y + 4.5);
    doc.line(TABLE_LEFT + COL_DESC, y, TABLE_LEFT + COL_DESC, y + ROW_H);
    doc.line(TABLE_LEFT + COL_DESC + COL_PRECIO, y, TABLE_LEFT + COL_DESC + COL_PRECIO, y + ROW_H);
    doc.line(TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT, y, TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT, y + ROW_H);
    y += ROW_H;
  }

  if (data.discounts > 0) {
    const descDescuento = data.items.length === 1 && data.items[0]?.month
      ? `Descuento HASHRATE - ${data.items[0].serviceName} - ${data.items[0].month ? monthToRange(data.items[0].month) : ""}`.trim()
      : "Descuento HASHRATE";
    doc.rect(TABLE_LEFT, y, COL_DESC + COL_PRECIO + COL_CANT + COL_TOTAL, ROW_H);
    doc.text(descDescuento.substring(0, 52), TABLE_LEFT + 2, y + 4.5);
    doc.text("- " + formatUSD(data.discounts), TABLE_LEFT + COL_DESC + 2, y + 4.5);
    doc.text("1", TABLE_LEFT + COL_DESC + COL_PRECIO + 2, y + 4.5);
    doc.text("- " + formatUSD(data.discounts), TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT + 2, y + 4.5);
    doc.line(TABLE_LEFT + COL_DESC, y, TABLE_LEFT + COL_DESC, y + ROW_H);
    doc.line(TABLE_LEFT + COL_DESC + COL_PRECIO, y, TABLE_LEFT + COL_DESC + COL_PRECIO, y + ROW_H);
    doc.line(TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT, y, TABLE_LEFT + COL_DESC + COL_PRECIO + COL_CANT, y + ROW_H);
    y += ROW_H;
  }

  y += 6;

  // ---------- Fechas (como en referencia) ----------
  doc.setFontSize(9);
  doc.text(`FECHA DE EMISIÓN: ${formatDDMMYY(now)}`, MARGIN, y);
  y += 6;
  doc.text(`FECHA DE VENCIMIENTO: ${formatDDMMYY(vencimiento)}`, MARGIN, y);
  y += 10;

  // ---------- Bloque CLIENTE (nombre del formulario + web) ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text("CLIENTE:", MARGIN, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.clientName, MARGIN + 20, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(EMISOR.web, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // ---------- Total destacado (verde, derecha) ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.text(`TOTAL ${formatUSD(data.total)}`, PAGE_W - MARGIN, y, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // ---------- Faja HRS (abajo de la hoja) ----------
  if (images?.fajaBase64 && y + FAJA_HEIGHT_MM < PAGE_H - 15) {
    try {
      doc.addImage(images.fajaBase64, "PNG", 0, PAGE_H - FAJA_HEIGHT_MM - 10, PAGE_W, FAJA_HEIGHT_MM);
    } catch {
      // ignorar si falla la imagen
    }
  }

  return doc;
}

/**
 * Carga una imagen desde la URL pública y la devuelve en base64 para usar en el PDF.
 */
export function loadImageAsBase64(url: string): Promise<string> {
  return fetch(url)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );
}
