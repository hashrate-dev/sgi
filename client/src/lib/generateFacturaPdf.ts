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

/** Convierte YYYY-MM a MM-YYYY para mostrar en descripción */
function ymToMonthYear(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${m}-${y}`;
}

function formatUSD(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} USD`;
}

/** Número con USD al final (ej. "100,00 USD") para la línea TOTAL abajo */
function formatTotalUSD(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} USD`;
}

export type FacturaPdfData = {
  number: string;
  type: ComprobanteType;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  clientName2?: string;
  clientPhone2?: string;
  clientEmail2?: string;
  clientAddress2?: string;
  clientCity2?: string;
  date: Date;
  items: LineItem[];
  subtotal: number;
  discounts: number;
  total: number;
};

export type FacturaPdfImages = {
  logoBase64?: string;
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
const TABLE_W = COL_DESC + COL_PRECIO + COL_CANT + COL_TOTAL;
const ROW_H = 9;
const HEADER_ROW_H = 10;
/** Gris suave para bordes de la tabla (estilo moderno) */
const TABLE_BORDER = { r: 226, g: 232, b: 240 };
/** Radio solo para las 4 esquinas extremas de la tabla (mm) */
const TABLE_RADIUS = 2;
/** Logo hashrate: arriba a la izquierda; manteniendo proporción original */
const LOGO_WIDTH_MM = 50; // Ancho ajustado para mejor proporción
const LOGO_HEIGHT_MM = 14; // Altura ajustada para mantener proporción (relación ~3.57:1)

/**
 * Genera el PDF de la factura con diseño HRS a color:
 * logo arriba a la izquierda, colores verde marca, tabla con encabezado verde.
 * Los textos se rellenan con data del formulario.
 */
export function generateFacturaPdf(data: FacturaPdfData, images?: FacturaPdfImages): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const now = data.date;
  const vencimiento = new Date(now);
  vencimiento.setDate(vencimiento.getDate() + 7);

  const yTop = MARGIN; // Alineado al margen superior (18mm)
  const contentRight = PAGE_W - MARGIN + 5; // Alineado al margen derecho + 0.5 cm hacia la derecha
  const tableLeft = (PAGE_W - TABLE_W) / 2;
  
  // ---------- Logo hashrate (arriba, alineado exactamente al margen izquierdo y superior) ----------
  if (images?.logoBase64) {
    try {
      // Movido 1 cm (10mm) más a la izquierda desde el margen
      const logoX = MARGIN - 10; // 18mm - 10mm = 8mm desde el borde izquierdo
      const logoY = MARGIN; // Margen superior (18mm)
      
      // Usar altura fija para mantener proporción sin deformar
      doc.addImage(
        images.logoBase64, 
        "PNG", 
        logoX, 
        logoY, 
        LOGO_WIDTH_MM, 
        LOGO_HEIGHT_MM
      );
    } catch {
      // sin logo
    }
  }
  
  const LOGO_RIGHT = (MARGIN - 10) + LOGO_WIDTH_MM + 5; // Espacio después del logo (ajustado por la nueva posición)
  const COMPANY_INFO_X = LOGO_RIGHT + 10; // Movido 1 cm (10mm) a la derecha desde el logo

  // ---------- Misma información pero al lado derecho del logo (arriba de la hoja) ----------
  // Orden: izquierda = emisor, derecha = FACTURA CREDITO + VIA CLIENTE + FECHA + TOTAL + RUC
  let y = yTop; // Comenzar desde el margen superior
  const tipoLabel = 
    data.type === "Factura" ? "FACTURA CREDITO" : 
    data.type === "Recibo" ? "RECIBO" : 
    "NOTA DE CRÉDITO";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(EMISOR.nombre, COMPANY_INFO_X, y);
  doc.setFontSize(11);
  doc.text(`${tipoLabel} - ${data.number}`, contentRight, y, { align: "right" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(EMISOR.direccion, COMPANY_INFO_X, y);
  doc.text("VIA CLIENTE", contentRight, y, { align: "right" });
  y += 5;

  doc.text(EMISOR.ciudad, COMPANY_INFO_X, y);
  doc.text("FECHA", contentRight, y, { align: "right" });
  y += 5;

  doc.text(EMISOR.telefono, COMPANY_INFO_X, y);
  doc.text(formatFechaTexto(now), contentRight, y, { align: "right" });
  y += 5;

  doc.text(EMISOR.email, COMPANY_INFO_X, y);
  y += 5; // Línea en blanco antes de RUC EMISOR

  doc.text(EMISOR.ruc, contentRight, y, { align: "right" });
  y += 5;
  // bajar hasta debajo del encabezado (logo o texto, el que baje más) + margen
  y = Math.max(yTop + LOGO_HEIGHT_MM, y) + 8;
  
  // ---------- Línea horizontal gris debajo del encabezado ----------
  // Alineada con los márgenes del contenido (tabla y clientes) - mismo margen que los nombres de clientes
  const tableRight = tableLeft + TABLE_W; // Margen derecho de la tabla
  doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
  doc.setLineWidth(0.5); // Grosor de línea delgado
  doc.line(tableLeft, y, tableRight, y); // Línea alineada con los márgenes del contenido (donde empiezan los clientes)
  y += 4; // Espacio después de la línea
  
  y += 20; // bajar 2 cm el bloque cliente + tabla (2 cm más arriba que antes)

  // ---------- Datos del cliente (arriba de la tabla verde); alineado al margen izquierdo de la tabla ----------
  const hasText = (s?: string) => Boolean(s && s.trim());
  const toLines = (txt: string, maxW: number): string[] => {
    const clean = String(txt ?? "").trim();
    if (!clean) return [];
    // splitTextToSize maneja wrap para que entre en la columna
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return doc.splitTextToSize(clean, maxW) as unknown as string[];
  };

  const drawClientColumn = (
    x: number,
    yStart: number,
    colW: number,
    block: { name?: string; phone?: string; email?: string; address?: string; city?: string }
  ): number => {
    const any =
      hasText(block.name) ||
      hasText(block.phone) ||
      hasText(block.email) ||
      hasText(block.address) ||
      hasText(block.city);
    if (!any) return 0; // deja la columna en blanco

    let yy = yStart;
    doc.setTextColor(0, 0, 0);

    // Nombre sin negrita (wrap dentro de la columna)
    // Si tiene guion y es largo, dividir en dos líneas sin el guion
    if (hasText(block.name)) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const nameStr = String(block.name).trim();
      const hasHyphen = nameStr.includes(" - ");
      let nameLines: string[] = [];
      
      if (hasHyphen) {
        // Dividir por " - " y quitar espacios extra
        const parts = nameStr.split(" - ").map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          // Verificar si necesita más de una línea
          const testLines = doc.splitTextToSize(nameStr, colW) as unknown as string[];
          if (testLines.length > 1) {
            // Usar las partes sin el guion
            nameLines = parts;
          } else {
            // Si cabe en una línea, usar el nombre completo
            nameLines = [nameStr];
          }
        } else {
          nameLines = [nameStr];
        }
      } else {
        // Sin guion, usar wrap normal
        nameLines = toLines(nameStr, colW);
      }
      
      for (const line of nameLines) {
        doc.text(line, x, yy);
        yy += 5;
      }
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lineH = 5;
    const add = (v?: string, upper = false) => {
      if (!hasText(v)) return;
      const text = upper ? String(v).toUpperCase() : String(v);
      for (const line of toLines(text, colW)) {
        doc.text(line, x, yy);
        yy += lineH;
      }
    };

    add(block.phone);
    add(block.email);
    add(block.address);
    add(block.city, true);

    return yy - yStart;
  };

  const yClientStart = y;
  const colGap = 4; // mm entre columnas
  const colW = (TABLE_W - colGap * 2) / 3;
  
  // Calcular la altura del nombre de cada cliente
  const getClientNameHeight = (name: string | undefined): number => {
    if (!hasText(name)) return 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const nameStr = String(name).trim();
    const hasHyphen = nameStr.includes(" - ");
    let nameLines: string[] = [];
    
    if (hasHyphen) {
      const parts = nameStr.split(" - ").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const testLines = doc.splitTextToSize(nameStr, colW) as unknown as string[];
        if (testLines.length > 1) {
          nameLines = parts;
        } else {
          nameLines = [nameStr];
        }
      } else {
        nameLines = [nameStr];
      }
    } else {
      nameLines = toLines(nameStr, colW);
    }
    return nameLines.length * 5; // 5mm por línea
  };
  
  const client1NameHeight = getClientNameHeight(data.clientName);

  // Si ambos tienen nombre, alinearlos a la misma altura
  // Si solo el primero tiene nombre, el segundo comienza después del nombre del primero
  const yClient2Start = (hasText(data.clientName) && hasText(data.clientName2))
    ? yClientStart // Ambos tienen nombre: misma altura
    : yClientStart + client1NameHeight; // Solo el primero tiene nombre: segundo después
  
  const h1 = drawClientColumn(tableLeft, yClientStart, colW, {
    name: data.clientName,
    phone: data.clientPhone,
    email: data.clientEmail,
    address: data.clientAddress,
    city: data.clientCity
  });
  
  const h2 = drawClientColumn(tableLeft + colW + colGap, yClient2Start, colW, {
    name: data.clientName2,
    phone: data.clientPhone2,
    email: data.clientEmail2,
    address: data.clientAddress2,
    city: data.clientCity2
  });
  
  // Calcular altura máxima considerando el desplazamiento del segundo cliente
  const hMax = Math.max(h1, h2 + (yClient2Start - yClientStart));
  y = yClientStart + hMax;
  if (hMax > 0) y += 10;
  y += 8; // separación antes de la tabla
  const tableTop = y;

  // ---------- Tabla: encabezado verde; solo los 2 extremos de arriba redondeados, resto rectos ----------
  const centerPrecio = tableLeft + COL_DESC + COL_PRECIO / 2;
  const centerCant = tableLeft + COL_DESC + COL_PRECIO + COL_CANT / 2;
  const centerTotal = tableLeft + COL_DESC + COL_PRECIO + COL_CANT + COL_TOTAL / 2;
  const numDiscountRows = data.items.filter((it) => it.discount > 0).length;
  const numDataRows = data.items.length + numDiscountRows;
  const tableTotalH = HEADER_ROW_H + numDataRows * ROW_H;
  const R = TABLE_RADIUS;
  const k = 0.5522847498; // Bezier para arco 90°

  const pathTableOutline = [
    { op: "m" as const, c: [tableLeft + R, tableTop] },
    { op: "l" as const, c: [tableLeft + TABLE_W - R, tableTop] },
    { op: "c" as const, c: [tableLeft + TABLE_W - R + R * k, tableTop, tableLeft + TABLE_W, tableTop + R - R * k, tableLeft + TABLE_W, tableTop + R] },
    { op: "l" as const, c: [tableLeft + TABLE_W, tableTop + tableTotalH] },
    { op: "l" as const, c: [tableLeft, tableTop + tableTotalH] },
    { op: "l" as const, c: [tableLeft, tableTop + R] },
    { op: "c" as const, c: [tableLeft, tableTop + R - R * k, tableLeft + R - R * k, tableTop, tableLeft + R, tableTop] },
    { op: "h" as const, c: [] },
  ];
  const pathHeader = [
    { op: "m" as const, c: [tableLeft + R, tableTop] },
    { op: "l" as const, c: [tableLeft + TABLE_W - R, tableTop] },
    { op: "c" as const, c: [tableLeft + TABLE_W - R + R * k, tableTop, tableLeft + TABLE_W, tableTop + R - R * k, tableLeft + TABLE_W, tableTop + R] },
    { op: "l" as const, c: [tableLeft + TABLE_W, tableTop + HEADER_ROW_H] },
    { op: "l" as const, c: [tableLeft, tableTop + HEADER_ROW_H] },
    { op: "l" as const, c: [tableLeft, tableTop + R] },
    { op: "c" as const, c: [tableLeft, tableTop + R - R * k, tableLeft + R - R * k, tableTop, tableLeft + R, tableTop] },
    { op: "h" as const, c: [] },
  ];

  doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
  doc.path(pathTableOutline);
  doc.stroke();

  doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.path(pathHeader);
  doc.fill();

  doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
  doc.line(tableLeft + COL_DESC, tableTop, tableLeft + COL_DESC, tableTop + tableTotalH);
  doc.line(tableLeft + COL_DESC + COL_PRECIO, tableTop, tableLeft + COL_DESC + COL_PRECIO, tableTop + tableTotalH);
  doc.line(tableLeft + COL_DESC + COL_PRECIO + COL_CANT, tableTop, tableLeft + COL_DESC + COL_PRECIO + COL_CANT, tableTop + tableTotalH);
  doc.line(tableLeft, tableTop + HEADER_ROW_H, tableLeft + TABLE_W, tableTop + HEADER_ROW_H);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("DESCRIPCION", tableLeft + 3, tableTop + 6.5);
  doc.text("PRECIO", centerPrecio, tableTop + 6.5, { align: "center" });
  doc.text("CANTIDAD", centerCant, tableTop + 6.5, { align: "center" });
  doc.text("TOTAL", centerTotal, tableTop + 6.5, { align: "center" });
  doc.setTextColor(0, 0, 0);

  y = tableTop + HEADER_ROW_H;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  for (const it of data.items) {
    const lineTotalServicio = it.price * it.quantity;
    const desc = it.month ? `${it.serviceName} - ${ymToMonthYear(it.month)}` : it.serviceName;
    doc.text(desc.substring(0, 52), tableLeft + 3, y + 5.5);
    doc.text(formatUSD(it.price), centerPrecio, y + 5.5, { align: "center" });
    doc.text(String(it.quantity), centerCant, y + 5.5, { align: "center" });
    doc.text(formatUSD(lineTotalServicio), centerTotal, y + 5.5, { align: "center" });
    if (y + ROW_H < tableTop + tableTotalH) {
      doc.line(tableLeft, y + ROW_H, tableLeft + TABLE_W, y + ROW_H);
    }
    y += ROW_H;

    if (it.discount > 0) {
      const discountAmount = it.discount * it.quantity;
      const serviceLabel = it.serviceKey === "A" ? "L7" : it.serviceKey === "B" ? "L9" : "S21";
      const descDescuento = `Descuento HASHRATE ${serviceLabel}`;
      doc.text(descDescuento, tableLeft + 3, y + 5.5);
      doc.text("- " + formatUSD(it.discount), centerPrecio, y + 5.5, { align: "center" });
      doc.text(String(it.quantity), centerCant, y + 5.5, { align: "center" });
      doc.text("- " + formatUSD(discountAmount), centerTotal, y + 5.5, { align: "center" });
      if (y + ROW_H < tableTop + tableTotalH) {
        doc.line(tableLeft, y + ROW_H, tableLeft + TABLE_W, y + ROW_H);
      }
      y += ROW_H;
    }
  }

  y += 6;

  // ---------- Fechas: mismo lenguaje visual que la tabla (solo 2 esquinas superiores redondeadas, mismo ancho y borde) ----------
  const yFechas = PAGE_H / 2 + 12 + 50 + 30;
  const datesBlockH = 14;
  const datesBlockTop = yFechas - datesBlockH / 2;
  const datesColW = TABLE_W / 2;
  const leftCenterX = tableLeft + datesColW / 2;
  const rightCenterX = tableLeft + datesColW + datesColW / 2;
  const Rd = TABLE_RADIUS;
  const kd = 0.5522847498;

  const pathDatesHeaderGreen = [
    { op: "m" as const, c: [tableLeft + Rd, datesBlockTop] },
    { op: "l" as const, c: [tableLeft + TABLE_W - Rd, datesBlockTop] },
    { op: "c" as const, c: [tableLeft + TABLE_W - Rd + Rd * kd, datesBlockTop, tableLeft + TABLE_W, datesBlockTop + Rd - Rd * kd, tableLeft + TABLE_W, datesBlockTop + Rd] },
    { op: "l" as const, c: [tableLeft + TABLE_W, datesBlockTop + datesBlockH / 2] },
    { op: "l" as const, c: [tableLeft, datesBlockTop + datesBlockH / 2] },
    { op: "l" as const, c: [tableLeft, datesBlockTop + Rd] },
    { op: "c" as const, c: [tableLeft, datesBlockTop + Rd - Rd * kd, tableLeft + Rd - Rd * kd, datesBlockTop, tableLeft + Rd, datesBlockTop] },
    { op: "h" as const, c: [] },
  ];
  const pathDatesOutline = [
    { op: "m" as const, c: [tableLeft + Rd, datesBlockTop] },
    { op: "l" as const, c: [tableLeft + TABLE_W - Rd, datesBlockTop] },
    { op: "c" as const, c: [tableLeft + TABLE_W - Rd + Rd * kd, datesBlockTop, tableLeft + TABLE_W, datesBlockTop + Rd - Rd * kd, tableLeft + TABLE_W, datesBlockTop + Rd] },
    { op: "l" as const, c: [tableLeft + TABLE_W, datesBlockTop + datesBlockH] },
    { op: "l" as const, c: [tableLeft, datesBlockTop + datesBlockH] },
    { op: "l" as const, c: [tableLeft, datesBlockTop + Rd] },
    { op: "c" as const, c: [tableLeft, datesBlockTop + Rd - Rd * kd, tableLeft + Rd - Rd * kd, datesBlockTop, tableLeft + Rd, datesBlockTop] },
    { op: "h" as const, c: [] },
  ];

  doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.path(pathDatesHeaderGreen);
  doc.fill();

  doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
  doc.path(pathDatesOutline);
  doc.stroke();

  doc.line(tableLeft, datesBlockTop + datesBlockH / 2, tableLeft + TABLE_W, datesBlockTop + datesBlockH / 2);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text("FECHA DE EMISIÓN:", leftCenterX, datesBlockTop + 5, { align: "center" });
  doc.text("FECHA DE VENCIMIENTO:", rightCenterX, datesBlockTop + 5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  const datesDataRowTop = datesBlockTop + datesBlockH / 2;
  const datesDataRowH = datesBlockH / 2;
  const datesRowCenterY = datesDataRowTop + datesDataRowH / 2;
  const fs = doc.getFontSize();
  const baselineOffset = fs * 0.12;
  const datesBaselineY = datesRowCenterY + baselineOffset;
  const dateEmisionStr = formatDDMMYY(now);
  const dateVencStr = formatDDMMYY(vencimiento);
  const wEmision = doc.getTextWidth(dateEmisionStr);
  const wVenc = doc.getTextWidth(dateVencStr);
  doc.text(dateEmisionStr, leftCenterX - wEmision / 2, datesBaselineY);
  doc.text(dateVencStr, rightCenterX - wVenc / 2, datesBaselineY);

  // ---------- TOTAL al pie: recuadro corto, borde derecho alineado con la tabla de arriba ----------
  const totalTableRight = tableLeft + TABLE_W;
  const TOTAL_ROW_H = 10;
  const TOTAL_BOX_W = 58;
  const TOTAL_LABEL_W = 24;
  const totalBoxLeft = totalTableRight - TOTAL_BOX_W;
  const yTotal = PAGE_H - MARGIN;
  const totalBoxTop = yTotal - TOTAL_ROW_H;
  const totalBoxBottom = totalBoxTop + TOTAL_ROW_H;
  const Rt = TABLE_RADIUS;
  const kt = 0.5522847498;

  const pathTotalOutline = [
    { op: "m" as const, c: [totalBoxLeft, totalBoxTop] },
    { op: "l" as const, c: [totalTableRight, totalBoxTop] },
    { op: "l" as const, c: [totalTableRight, totalBoxBottom - Rt] },
    { op: "c" as const, c: [totalTableRight, totalBoxBottom - Rt + Rt * kt, totalTableRight - Rt + Rt * kt, totalBoxBottom, totalTableRight - Rt, totalBoxBottom] },
    { op: "l" as const, c: [totalBoxLeft + Rt, totalBoxBottom] },
    { op: "c" as const, c: [totalBoxLeft + Rt - Rt * kt, totalBoxBottom, totalBoxLeft, totalBoxBottom - Rt + Rt * kt, totalBoxLeft, totalBoxBottom - Rt] },
    { op: "l" as const, c: [totalBoxLeft, totalBoxTop] },
    { op: "h" as const, c: [] },
  ];
  const pathTotalLabelGreen = [
    { op: "m" as const, c: [totalBoxLeft, totalBoxTop] },
    { op: "l" as const, c: [totalBoxLeft + TOTAL_LABEL_W, totalBoxTop] },
    { op: "l" as const, c: [totalBoxLeft + TOTAL_LABEL_W, totalBoxBottom] },
    { op: "l" as const, c: [totalBoxLeft + Rt, totalBoxBottom] },
    { op: "c" as const, c: [totalBoxLeft + Rt - Rt * kt, totalBoxBottom, totalBoxLeft, totalBoxBottom - Rt + Rt * kt, totalBoxLeft, totalBoxBottom - Rt] },
    { op: "l" as const, c: [totalBoxLeft, totalBoxTop] },
    { op: "h" as const, c: [] },
  ];

  doc.setFillColor(HRS_GREEN.r, HRS_GREEN.g, HRS_GREEN.b);
  doc.path(pathTotalLabelGreen);
  doc.fill();

  doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
  doc.path(pathTotalOutline);
  doc.stroke();
  doc.line(totalBoxLeft + TOTAL_LABEL_W, totalBoxTop, totalBoxLeft + TOTAL_LABEL_W, totalBoxBottom);

  const totalLabelCenterX = totalBoxLeft + TOTAL_LABEL_W / 2;
  const totalAmountRight = totalTableRight - 4;
  const totalCenterY = totalBoxTop + TOTAL_ROW_H / 2;
  const totalBaselineY = totalCenterY + doc.getFontSize() * 0.12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", totalLabelCenterX, totalBaselineY, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.text(formatTotalUSD(data.total), totalAmountRight, totalBaselineY, { align: "right" });

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
