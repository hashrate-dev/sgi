import { getDb } from "../db.js";

/**
 * Corrige facturas ASIC guardadas con source=hosting (emisiones anteriores al campo `source`
 * o importaciones). Idempotente: se puede ejecutar en cada arranque.
 */
export async function migrateAsicInvoiceSource(): Promise<void> {
  const db = getDb();
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  const sourceCol = "COALESCE(source, 'hosting')";
  const idCast = isPg ? "id::text" : "CAST(id AS TEXT)";
  const relIdCast = isPg ? "related_invoice_id::text" : "CAST(related_invoice_id AS TEXT)";

  await db
    .prepare(
      `UPDATE invoices SET source = 'asic'
       WHERE ${sourceCol} = 'hosting'
       AND (
         number IN (
           SELECT related_invoice_number FROM invoices
           WHERE ${sourceCol} = 'asic'
             AND related_invoice_number IS NOT NULL
             AND TRIM(related_invoice_number) != ''
         )
         OR ${idCast} IN (
           SELECT ${relIdCast} FROM invoices
           WHERE ${sourceCol} = 'asic'
             AND related_invoice_id IS NOT NULL
             AND TRIM(${relIdCast}) != ''
         )
       )`
    )
    .run();

  const emitted = (await db
    .prepare("SELECT invoice_json FROM emitted_documents WHERE source = 'asic'")
    .all()) as { invoice_json: string }[];

  const numbersToFix = new Set<string>();
  for (const row of emitted) {
    try {
      const inv = JSON.parse(row.invoice_json) as {
        number?: string;
        relatedInvoiceNumber?: string;
      };
      if (inv.number?.trim()) numbersToFix.add(inv.number.trim());
      if (inv.relatedInvoiceNumber?.trim()) numbersToFix.add(inv.relatedInvoiceNumber.trim());
    } catch {
      /* ignore malformed json */
    }
  }

  const updateStmt = db.prepare(
    `UPDATE invoices SET source = 'asic' WHERE number = ? AND ${sourceCol} = 'hosting'`
  );
  for (const num of numbersToFix) {
    await updateStmt.run(num);
  }
}
