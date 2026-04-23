/**
 * Reescribe un recibo vinculado a factura: una sola línea de ítem (pago neto), alineada con FacturacionPage.
 */

import { getDb } from "../db.js";

type Db = ReturnType<typeof getDb>;

const EPS = 0.0001;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(row: unknown): number {
  const n = Math.abs(Number(row));
  return Number.isFinite(n) ? n : 0;
}

/** Fila PG/SQLite con claves heterogéneas */
function pick<T>(row: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (k in row && row[k] != null) return row[k] as T;
    const low = k.toLowerCase();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === low) return row[rk] as T;
    }
  }
  return undefined;
}

function buildPaymentLineService(
  facturaNumber: string,
  ncNums: string[],
  priorRecNums: string[]
): string {
  const base = `Pago de factura ${facturaNumber}`;
  const parts: string[] = [];
  if (ncNums.length === 1) parts.push(`NC ${ncNums[0]} aplicada`);
  else if (ncNums.length > 1) parts.push(`NC ${ncNums.join(", ")} aplicadas`);
  if (priorRecNums.length === 1) parts.push(`recibo previo ${priorRecNums[0]}`);
  else if (priorRecNums.length > 1) parts.push(`recibos previos ${priorRecNums.join(", ")}`);
  if (parts.length === 0) return `${base} (liquidación de saldo)`;
  return `${base} (${parts.join("; ")})`;
}

function sortById(
  rows: Array<Record<string, unknown>>
): Array<{ id: number; number: string; total: number }> {
  return rows
    .map((r) => ({
      id: Number(pick(r, "id")),
      number: String(pick(r, "number") ?? ""),
      total: num(pick(r, "total")),
    }))
    .filter((r) => Number.isFinite(r.id))
    .sort((a, b) => a.id - b.id);
}

/**
 * @param getDb - getDb() tras initDb()
 * @param receiptNumber - ej. RC001053
 */
export async function rebuildReciboSettlementByNumber(
  getDb: () => Db,
  receiptNumber: string,
  options?: { source?: "hosting" | "asic" }
): Promise<
  | { ok: true; id: number; number: string; itemCount: number }
  | { ok: false; error: string }
> {
  const source = options?.source ?? "hosting";

  const db = getDb();
  const recRow = (await db
    .prepare(
      `SELECT id, number, type, month, related_invoice_id, related_invoice_number, source
       FROM invoices WHERE number = ? AND type = 'Recibo'`
    )
    .get(receiptNumber)) as Record<string, unknown> | null | undefined;

  if (recRow == null) {
    return { ok: false, error: `No se encontró el recibo ${receiptNumber}` };
  }
  const recSource = String(pick(recRow, "source") ?? "hosting");
  if (recSource !== source) {
    return { ok: false, error: `El recibo no es de source=${source} (es ${recSource})` };
  }
  let factId = Number(pick(recRow, "related_invoice_id", "relatedinvoiceid"));
  if (!Number.isFinite(factId) || factId <= 0) {
    const relNum = String(pick(recRow, "related_invoice_number", "relatedinvoicenumber") ?? "").trim();
    if (relNum) {
      const byNum = (await db
        .prepare(`SELECT id FROM invoices WHERE type = 'Factura' AND number = ? AND (COALESCE(source, 'hosting') = ?)`)
        .get(relNum, source)) as Record<string, unknown> | null | undefined;
      const idNum = byNum != null ? Number(pick(byNum, "id")) : NaN;
      if (Number.isFinite(idNum) && idNum > 0) factId = idNum;
    }
  }
  if (!Number.isFinite(factId) || factId <= 0) {
    return {
      ok: false,
      error: "El recibo no tiene factura relacionada (related_invoice_id o related_invoice_number con factura existente).",
    };
  }

  const factRow = (await db
    .prepare(`SELECT id, number, month, total FROM invoices WHERE id = ? AND type = 'Factura'`)
    .get(factId)) as Record<string, unknown> | null | undefined;
  if (factRow == null) {
    return { ok: false, error: `No se encontró la factura con id ${factId}` };
  }
  const factNum = {
    number: String(pick(factRow, "number") ?? ""),
    month: String(pick(factRow, "month") ?? ""),
    total: num(pick(factRow, "total")),
  };

  const invTotal = round2(num(factNum.total));
  const recMonth = String(pick(recRow, "month") ?? "");
  const month =
    (recMonth && /^\d{4}-\d{2}$/.test(recMonth) ? recMonth : null) ||
    (factNum.month && /^\d{4}-\d{2}$/.test(factNum.month) ? factNum.month : null) ||
    "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: "Mes del recibo o factura inválido (se espera YYYY-MM)" };
  }

  const reciboId = Number(pick(recRow, "id"));

  const ncs = sortById(
    (await db
      .prepare(
        `SELECT id, number, total FROM invoices
         WHERE type = 'Nota de Crédito' AND (COALESCE(source, 'hosting') = ?)
         AND (related_invoice_id = ? OR (related_invoice_number IS NOT NULL AND related_invoice_number = ?))`
      )
      .all(source, factId, factNum.number)) as unknown as Record<string, unknown>[]
  );

  const priorRecs = sortById(
    (await db
      .prepare(
        `SELECT id, number, total FROM invoices
         WHERE type = 'Recibo' AND (COALESCE(source, 'hosting') = ?)
         AND related_invoice_id = ? AND id != ?`
      )
      .all(source, factId, reciboId)) as unknown as Record<string, unknown>[]
  );

  const creditApplied = ncs.reduce((s, n) => s + round2(Math.abs(n.total)), 0);
  const paidApplied = priorRecs.reduce((s, r) => s + round2(Math.abs(r.total)), 0);
  if (creditApplied + paidApplied <= EPS) {
    return {
      ok: false,
      error: "No hay notas de crédito ni recibos previos vinculados a la factura; no aplica el formato de liquidación."
    };
  }

  const ncNums = ncs.map((n) => String(n.number));
  const priorRecNums = priorRecs.map((r) => String(r.number));
  const serviceText = buildPaymentLineService(factNum.number, ncNums, priorRecNums);
  const linePrice = round2(Math.max(0, invTotal - creditApplied - paidApplied));
  if (linePrice <= EPS) {
    return {
      ok: false,
      error: "El importe neto del recibo sería 0; revisá factura, notas de crédito y recibos previos."
    };
  }

  type Row = { service: string; month: string; quantity: number; price: number; discount: number };
  const newItems: Row[] = [
    {
      service: serviceText,
      month,
      quantity: 1,
      price: linePrice,
      discount: 0,
    },
  ];

  let subtotal = 0;
  let discounts = 0;
  for (const it of newItems) {
    subtotal += it.price * it.quantity;
    discounts += it.discount * it.quantity;
  }
  subtotal = round2(subtotal);
  discounts = round2(discounts);
  const total = round2(subtotal - discounts);

  const subtotalDb = -Math.abs(subtotal);
  const discountsDb = -Math.abs(discounts);
  const totalDb = -Math.abs(total);

  await db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(reciboId);
    const ins = tx.prepare(
      "INSERT INTO invoice_items (invoice_id, service, month, quantity, price, discount) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const it of newItems) {
      await ins.run(reciboId, it.service, it.month, it.quantity, it.price, it.discount);
    }
    await tx
      .prepare("UPDATE invoices SET subtotal = ?, discounts = ?, total = ? WHERE id = ?")
      .run(subtotalDb, discountsDb, totalDb, reciboId);
  });

  return { ok: true, id: reciboId, number: String(pick(recRow, "number") ?? receiptNumber), itemCount: newItems.length };
}
