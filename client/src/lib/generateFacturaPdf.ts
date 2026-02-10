import { jsPDF } from "jspdf";
import type { ComprobanteType, LineItem } from "./types";

const MESES = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"
];

/** Formato fecha tipo "09/01/26" */
function formatDDMMYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/** Formato fecha tipo "ENE 9, 2026" */
function formatFechaTexto(d: Date): string {
  const mes = MESES[d.getMonth()];
  const dia = d.getDate();
  const anio = d.getFullYear();
  return `${mes} ${dia}, ${anio}`;
}

/** Formato moneda USD: 185,00 */
function formatUSD(n: number): string {
  return `USD ${n.toFixed(2).replace(".", ",")}`;
}

/** Datos que se rellenan en la factura (vienen del formulario) */
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

/** Datos fijos del emisor (HRS GROUP) */
const EMISOR = {
  nombre: "HRS GROUP S.A",
  direccion: "Juan de Salazar 1857",
  ciudad: "Asunción - Paraguay",
  telefono: "Teléfono: (+595) 993 358 387",
  email: "sales@hashrate.space",
  ruc: "RUC EMISOR: 80144251-6",
};

const MARGIN = 20;
const PAGE_W = 210;
const TABLE_COL_DESC = 90;
const TABLE_COL_PRECIO = 45;
const TABLE_COL_CANT = 25;

/**
 * Genera el PDF de la factura con el diseño tipo referencia:
 * - Cabecera con HRS GROUP y datos del emisor
 * - Tipo y número de comprobante
 * - Bloque cliente
 * - Fechas (emisión, vencimiento)
 * - Tabla: Descripción | Precio | Cantidad | Total
 * - Descuentos como línea si aplica
 * - Total en USD
 */
export function generateFacturaPdf(data: FacturaPdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const now = data.date;
  const vencimiento = new Date(now);
  vencimiento.setDate(vencimiento.getDate() + 7);

  let y = 18;

  // ----- Emisor (izquierda) -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(EMISOR.nombre, MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(EMISOR.direccion, MARGIN, y);
  y += 5;
  doc.text(EMISOR.ciudad, MARGIN, y);
  y += 5;
  doc.text(EMISOR.telefono, MARGIN, y);
  y += 5;
  doc.text(EMISOR.email, MARGIN, y);
  y += 5;
  doc.text(EMISOR.ruc, MARGIN, y);

  // ----- Título comprobante (derecha, alineado con emisor) -----
  const tipoLabel = data.type === "Factura" ? "FACTURA CRÉDITO" : "RECIBO";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`${tipoLabel} - ${data.number}`, PAGE_W - MARGIN, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`FECHA: ${formatFechaTexto(now)}`, PAGE_W - MARGIN, 30, { align: "right" });
  doc.text(`TOTAL ${formatUSD(data.total)}`, PAGE_W - MARGIN, 36, { align: "right" });

  y = 52;

  // ----- Bloque CLIENTE -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CLIENTE:", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.clientName, MARGIN + 22, y);
  y += 10;

  // ----- Fechas emisión y vencimiento -----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`FECHA DE EMISIÓN: ${formatDDMMYY(now)}`, MARGIN, y);
  y += 6;
  doc.text(`FECHA DE VENCIMIENTO: ${formatDDMMYY(vencimiento)}`, MARGIN, y);
  y += 12;

  // ----- Tabla: encabezados -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DESCRIPCION", MARGIN, y);
  doc.text("PRECIO", MARGIN + TABLE_COL_DESC, y);
  doc.text("CANTIDAD", MARGIN + TABLE_COL_DESC + TABLE_COL_PRECIO, y);
  doc.text("TOTAL", MARGIN + TABLE_COL_DESC + TABLE_COL_PRECIO + TABLE_COL_CANT, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  // Línea bajo encabezado
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // ----- Filas de ítems -----
  for (const it of data.items) {
    const lineTotal = (it.price - it.discount) * it.quantity;
    const desc = it.month ? `${it.serviceName} - ${it.month}` : it.serviceName;
    doc.text(desc.substring(0, 50), MARGIN, y);
    doc.text(formatUSD(it.price), MARGIN + TABLE_COL_DESC, y);
    doc.text(String(it.quantity), MARGIN + TABLE_COL_DESC + TABLE_COL_PRECIO, y);
    doc.text(formatUSD(lineTotal), MARGIN + TABLE_COL_DESC + TABLE_COL_PRECIO + TABLE_COL_CANT, y);
    y += 6;
  }

  // ----- Fila de descuento (si hay) -----
  if (data.discounts > 0) {
    const descDescuento = data.items.length === 1 && data.items[0]?.month
      ? `Descuento HASHRATE - ${data.items[0].serviceName} - ${data.items[0].month}`
      : "Descuento";
    doc.text(descDescuento.substring(0, 45), MARGIN, y);
    doc.text("- " + formatUSD(data.discounts), MARGIN + TABLE_COL_DESC, y);
    doc.text("1", MARGIN + TABLE_COL_DESC + TABLE_COL_PRECIO, y);
    doc.text("- " + formatUSD(data.discounts), MARGIN + TABLE_COL_DESC + TABLE_COL_PRECIO + TABLE_COL_CANT, y);
    y += 6;
  }

  y += 4;
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // ----- Total final -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`TOTAL ${formatUSD(data.total)}`, PAGE_W - MARGIN, y, { align: "right" });

  return doc;
}
