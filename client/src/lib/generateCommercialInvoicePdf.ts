import { jsPDF } from "jspdf";
import type { CommercialInvoiceFields } from "./commercialInvoice";
import {
  COMMERCIAL_INVOICE_DECLARATION_EN,
  COMMERCIAL_INVOICE_DECLARATION_ES,
  commercialInvoiceDateLong,
  commercialInvoiceLineAmount,
  commercialInvoiceMoney,
  commercialInvoicePartyTitle,
  commercialInvoiceRecipientRows,
  commercialInvoiceSenderRows,
  commercialInvoiceSerialLabel,
  commercialInvoiceTotals,
  commercialInvoiceUsdInWords,
} from "./commercialInvoice";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 12;
const NAVY = { r: 27, g: 54, b: 93 };
const BORDER = { r: 163, g: 176, b: 191 };
const HEAD_BG = { r: 236, g: 241, b: 247 };
const TOTAL_BG = { r: 236, g: 241, b: 247 };

function navy(doc: jsPDF) {
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
}

export async function downloadCommercialInvoicePdf(fields: CommercialInvoiceFields & { number: string }): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { total } = commercialInvoiceTotals(fields.items, 0);
  const innerW = PAGE_W - 2 * M;
  let y = 11;

  navy(doc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("COMMERCIAL INVOICE / FACTURA COMERCIAL", PAGE_W / 2, y, { align: "center" });
  y += 3.2;
  doc.setDrawColor(NAVY.r, NAVY.g, NAVY.b);
  doc.setLineWidth(0.55);
  doc.line(M, y, PAGE_W - M, y);
  y += 0.7;
  doc.setLineWidth(0.18);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  const metaH = 14;
  const metaW = innerW / 3;
  const meta = [
    ["Date / Fecha:", commercialInvoiceDateLong(fields.invoiceDate)],
    ["Invoice Number / Número de Factura:", fields.number],
    ["Status of Goods / Estado:", fields.goodsStatus.trim() || "—"],
  ];
  doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
  doc.setLineWidth(0.28);
  meta.forEach((cell, i) => {
    const x = M + i * metaW;
    doc.setFillColor(250, 252, 254);
    doc.rect(x, y, metaW, metaH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    navy(doc);
    doc.text(cell[0]!, x + 2.2, y + 4.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 40, 55);
    const wrapped = doc.splitTextToSize(cell[1]!, metaW - 4.4) as string[];
    wrapped.slice(0, 2).forEach((line, li) => doc.text(line, x + 2.2, y + 8.8 + li * 3.6));
  });
  y += metaH + 5;

  const gap = 3.5;
  const colW = (innerW - gap) / 2;

  const drawParty = (title: string, rows: Array<[string, string]>, x: number, startY: number): number => {
    const padX = 3;
    const valueGap = 1.8;
    const valueMinW = 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    const longestLabel = Math.max(...rows.map(([label]) => doc.getTextWidth(`${label}:`)), 28);
    const labelW = Math.min(longestLabel, colW - padX * 2 - valueMinW - valueGap);
    let body = 3.5;
    const prepared = rows.map(([label, value]) => {
      const val = (value.trim() || "—").replace(/\s+/g, " ");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      const labelLines = doc.splitTextToSize(`${label}:`, labelW) as string[];
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(val, colW - padX * 2 - labelW - valueGap) as string[];
      const h = Math.max(4.1, Math.max(labelLines.length, wrapped.length) * 3.6);
      body += h + 1.15;
      return { labelLines, wrapped, h };
    });
    const headH = 7.4;
    const cardH = headH + body + 1;
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, startY, colW, cardH, 0.8, 0.8, "FD");
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    doc.roundedRect(x, startY, colW, headH, 0.8, 0.8, "F");
    doc.rect(x, startY + 2.4, colW, headH - 2.4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.3);
    doc.text(title, x + padX, startY + 5);
    let yy = startY + headH + 4.6;
    for (const row of prepared) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      navy(doc);
      row.labelLines.forEach((line, i) => doc.text(line, x + padX, yy + i * 3.6));
      doc.setFont("helvetica", "normal");
      doc.setTextColor(35, 48, 68);
      row.wrapped.forEach((line, i) => doc.text(line, x + padX + labelW + valueGap, yy + i * 3.6));
      yy += row.h + 1.15;
    }
    return startY + cardH;
  };

  const yL = drawParty(
    commercialInvoicePartyTitle("sender", fields.originCountry || fields.sellerCountry),
    commercialInvoiceSenderRows(fields),
    M,
    y
  );
  const yR = drawParty(
    commercialInvoicePartyTitle("recipient", fields.destinationCountry || fields.buyerCountry),
    commercialInvoiceRecipientRows(fields),
    M + colW + gap,
    y
  );
  y = Math.max(yL, yR) + 5;

  const boxHead = (title: string) => {
    if (y > PAGE_H - 40) {
      doc.addPage();
      y = M;
    }
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    doc.roundedRect(M, y, innerW, 7.2, 0.6, 0.6, "F");
    doc.rect(M, y + 2.2, innerW, 5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.text(title, M + 3, y + 4.8);
    y += 7.2;
  };

  boxHead("3. DESCRIPTION OF GOODS / DESCRIPCIÓN DE LAS MERCANCÍAS");

  const cols = [
    { w: innerW - 18 - 32 - 32 },
    { w: 18 },
    { w: 32 },
    { w: 32 },
  ];
  const tableW = innerW;
  const drawGoodsHeader = () => {
    doc.setFillColor(HEAD_BG.r, HEAD_BG.g, HEAD_BG.b);
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.rect(M, y, tableW, 9, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    navy(doc);
    let x = M;
    doc.text("Full Description of Goods / Descripción Detallada", x + 2, y + 5.5);
    x += cols[0]!.w;
    doc.text("Qty / Cant", x + cols[1]!.w / 2, y + 5.5, { align: "center" });
    x += cols[1]!.w;
    doc.text("Unit Price (USD)", x + cols[2]!.w - 1.5, y + 5.5, { align: "right" });
    x += cols[2]!.w;
    doc.text("Total (USD)", x + cols[3]!.w - 1.5, y + 5.5, { align: "right" });
    y += 9;
  };
  drawGoodsHeader();

  const items = fields.items.filter((it) => it.description.trim() || it.unitPrice);
  const drawRowBorder = (yy: number, h: number) => {
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.setLineWidth(0.22);
    let x = M;
    cols.forEach((c) => {
      doc.rect(x, yy, c.w, h);
      x += c.w;
    });
  };

  if (!items.length) {
    drawRowBorder(y, 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Agregá ítems para verlos en el documento", PAGE_W / 2, y + 5.2, { align: "center" });
    y += 8;
  } else {
    items.forEach((item) => {
      const sn = commercialInvoiceSerialLabel(item);
      const descLines = doc.splitTextToSize(item.description || "—", cols[0]!.w - 4) as string[];
      const snLines = sn ? (doc.splitTextToSize(sn, cols[0]!.w - 4) as string[]) : [];
      const rowH = Math.max(9, descLines.length * 3.8 + snLines.length * 3.4 + 4.4);
      if (y + rowH > PAGE_H - 28) {
        doc.addPage();
        y = M;
        boxHead("3. DESCRIPTION OF GOODS / DESCRIPCIÓN DE LAS MERCANCÍAS");
        drawGoodsHeader();
      }
      drawRowBorder(y, rowH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 40, 55);
      let x = M;
      descLines.forEach((line, li) => doc.text(line, x + 2, y + 4.6 + li * 3.8));
      if (snLines.length) {
        doc.setFontSize(7.2);
        doc.setTextColor(70, 85, 105);
        const snTop = y + 4.6 + descLines.length * 3.8;
        snLines.forEach((line, li) => doc.text(line, x + 2, snTop + li * 3.4));
      }
      x += cols[0]!.w;
      doc.setFontSize(8);
      doc.setTextColor(30, 40, 55);
      doc.text(String(item.quantity), x + cols[1]!.w / 2, y + 5.4, { align: "center" });
      x += cols[1]!.w;
      doc.text(commercialInvoiceMoney(item.unitPrice), x + cols[2]!.w - 1.6, y + 5.4, { align: "right" });
      x += cols[2]!.w;
      doc.text(commercialInvoiceMoney(commercialInvoiceLineAmount(item)), x + cols[3]!.w - 1.6, y + 5.4, { align: "right" });
      y += rowH;
    });
  }

  const totH = 8;
  doc.setFillColor(TOTAL_BG.r, TOTAL_BG.g, TOTAL_BG.b);
  doc.rect(M, y, tableW, totH, "F");
  doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
  doc.rect(M, y, cols[0]!.w + cols[1]!.w + cols[2]!.w, totH);
  doc.rect(M + cols[0]!.w + cols[1]!.w + cols[2]!.w, y, cols[3]!.w, totH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  navy(doc);
  const totLabelX = M + cols[0]!.w + cols[1]!.w + cols[2]!.w - 2;
  doc.text("TOTAL:", totLabelX, y + 5.3, { align: "right" });
  doc.text(commercialInvoiceMoney(total), M + tableW - 1.6, y + 5.3, { align: "right" });
  y += totH + 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  navy(doc);
  const amountTxt = commercialInvoiceMoney(total);
  const prefix = `TOTAL VALUE / VALOR TOTAL: ${amountTxt}`;
  const wordsPart = `(${commercialInvoiceUsdInWords(total)})`;
  const prefixW = doc.getTextWidth(prefix);
  doc.setFont("helvetica", "normal");
  const wordsW = doc.getTextWidth(` ${wordsPart}`);
  const amountGap = 1.6;
  if (prefixW + amountGap + wordsW <= innerW) {
    doc.setFont("helvetica", "bold");
    doc.text(prefix, M, y);
    doc.setFont("helvetica", "normal");
    doc.text(` ${wordsPart}`, M + prefixW + amountGap, y);
    y += 6;
  } else {
    doc.setFont("helvetica", "bold");
    doc.text(prefix, M, y);
    y += 4.4;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(wordsPart, innerW) as string[];
    doc.text(lines, M, y);
    y += lines.length * 4 + 2;
  }

  boxHead("4. SHIPPING & DECLARATION / ENVÍO Y DECLARACIÓN");
  const shipRows: Array<[string, string]> = [
    ["Terms of Delivery / Incoterms:", fields.incoterms.trim() || "—"],
    ["Purpose of Shipment / Propósito del envío:", fields.shipmentPurpose.trim() || "—"],
    ["Country of Origin / País de origen:", fields.goodsOriginCountry.trim() || "—"],
  ];
  const shipH = shipRows.length * 7.2 + 4;
  doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
  doc.setFillColor(255, 255, 255);
  doc.rect(M, y, innerW, shipH, "FD");
  let sy = y + 6;
  shipRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    navy(doc);
    doc.text(k, M + 3.2, sy);
    const kw = doc.getTextWidth(k) + 2;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(35, 48, 68);
    doc.text(doc.splitTextToSize(v, innerW - kw - 8) as string[], M + 3.2 + kw, sy);
    sy += 7.2;
  });
  y += shipH + 5;

  if (y > PAGE_H - 55) {
    doc.addPage();
    y = M;
  }
  boxHead("5. DECLARATION STATEMENT / DECLARACIÓN JURADA");
  const declH = 42;
  doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
  doc.setFillColor(255, 255, 255);
  doc.rect(M, y, innerW, declH, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40, 52, 70);
  let dy = y + 6;
  (doc.splitTextToSize(COMMERCIAL_INVOICE_DECLARATION_EN, innerW - 8) as string[]).forEach((line) => {
    doc.text(line, M + 3.5, dy);
    dy += 3.8;
  });
  dy += 2;
  (doc.splitTextToSize(COMMERCIAL_INVOICE_DECLARATION_ES, innerW - 8) as string[]).forEach((line) => {
    doc.text(line, M + 3.5, dy);
    dy += 3.8;
  });
  const signY = y + declH - 10;
  doc.setDrawColor(NAVY.r, NAVY.g, NAVY.b);
  doc.setLineWidth(0.28);
  doc.line(M + 3.5, signY, M + 48, signY);
  doc.setFontSize(6.6);
  navy(doc);
  doc.text("Sender's Signature / Firma del Expedidor", M + 3.5, signY + 4);

  const safe = fields.number.replace(/[^\w.-]+/g, "_");
  doc.save(`Commercial_Invoice_${safe}.pdf`);
}
