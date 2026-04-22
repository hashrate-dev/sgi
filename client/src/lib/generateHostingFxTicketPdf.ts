import { jsPDF } from "jspdf";
import type { HostingFxOperation } from "./api";
import { loadImageAsBase64 } from "./generateFacturaPdf";

const PAGE_W = 210;
const M = 16;
const LINE_H = 4.1;

function money(n: number): string {
  return new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(n);
}

/** Monto transferencia: USDT si el envío es a Binance; USD si es a banco. */
function moneyTransferencia(op: HostingFxOperation, n: number): string {
  if (op.deliveryMethod === "usdt_to_hrs_binance") {
    return `${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} USDT`;
  }
  return money(n);
}

/** Número de ticket seguro para el nombre de archivo (sin ruta / caracteres raros). */
function ticketFileSuffix(op: HostingFxOperation): string {
  const t = (op.ticketCode || `id${op.id}`).replace(/[^a-zA-Z0-9._-]/g, "");
  return t || `id${op.id}`;
}

/**
 * Genera y descarga un PDF del ticket de operación de cambio (mismos campos que el modal).
 */
export async function downloadHostingFxTicketPdf(op: HostingFxOperation): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  let y = M;

  let logo: string | undefined;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  try {
    logo = await loadImageAsBase64(`${base}images/LOGO-HASHRATE.png`);
  } catch {
    try {
      logo = await loadImageAsBase64("https://hashrate.space/wp-content/uploads/hashrate-LOGO.png");
    } catch {
      /* sin logo */
    }
  }
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, y, 52, 15);
    } catch {
      try {
        doc.addImage(logo, "JPEG", M, y, 52, 15);
      } catch {
        /* omitir */
      }
    }
  }

  const rx = PAGE_W - M;
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("N° Ticket", rx, y + 1, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(String(op.ticketCode || "—"), rx, y + 6.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("Fecha", rx, y + 12.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(op.operationDate, rx, y + 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 22;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.25);
  doc.line(M, y, PAGE_W - M, y);
  y += 5.5;
  doc.setFontSize(9);

  const cliente = `${op.clientCode || ""} ${op.clientName || ""} ${op.clientLastName || ""}`.trim();
  const tipo = op.operationType === "usdt_to_usd" ? "Cambio USDT a USD" : "Cambio USD a USDT";
  const usdt = op.usdtSide === "buy_usdt" ? "Compra de USDT" : "Compra de USD";
  const envio = op.deliveryMethod === "usd_to_bank" ? "Envio USD a Banco" : "USDT a Binance";

  const GAP = 8;
  const colW = (PAGE_W - 2 * M - GAP) / 2;
  const xL = M;
  const xR = M + colW + GAP;

  const L = [
    `Cliente: ${cliente}`,
    `Tipo: ${tipo}`,
    `Compra de USDT / Compra de USD: ${usdt}`,
    `Monto operación: ${money(op.operationAmount)}`,
    `% comisión Hashrate: ${op.hrsCommissionPct.toFixed(2)}%`,
    `Comisión bancaria: ${money(op.bankFeeAmount)}`,
    `Monto transferencia: ${moneyTransferencia(op, op.clientTotalPayment)}`,
  ];
  const R =
    op.deliveryMethod === "usdt_to_hrs_binance"
      ? [`Envío: ${envio}`]
      : [
          `Envío: ${envio}`,
          `Banco: ${op.bankName}`,
          `Sucursal: ${op.bankBranch}`,
          `Nombre completo de cuenta: ${op.accountHolderName}`,
          `Moneda: ${op.currency}`,
          `N° Cuenta: ${op.accountNumber}`,
        ];

  const n = Math.max(L.length, R.length);
  for (let i = 0; i < n; i++) {
    const leftStr = L[i] ?? "";
    const rightStr = R[i] ?? "";
    const a = doc.splitTextToSize(leftStr, colW);
    const b = doc.splitTextToSize(rightStr, colW);
    const lines = Math.max(a.length, b.length, 1);
    for (let j = 0; j < lines; j++) {
      const tL = a[j];
      const tR = b[j];
      if (tL) doc.text(tL, xL, y + j * LINE_H);
      if (tR) doc.text(tR, xR, y + j * LINE_H);
    }
    y += lines * LINE_H + 2.5;
  }

  const fname = `HASHRATE_TICKET_${ticketFileSuffix(op)}.pdf`;
  doc.save(fname);
}
