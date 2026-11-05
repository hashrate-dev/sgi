import { db } from "../db.js";

const EMAIL = "sergohot79@gmail.com";
const PHONE = "+593 99 010 9891";
const ADDRESS = "Casa 15, Urbanización Barú Caribe,";
const CITY = "Manta";
const COUNTRY = "ECUADOR";
const INVOICE_NUMBER = "F100357";

function alreadyRestored(address: unknown): boolean {
  return String(address ?? "").includes("Barú");
}

/** Devuelve el domicilio que se había perdido en la ficha y en la factura F100357. */
export async function restoreKhodtsevClient(): Promise<void> {
  const clients = (await db
    .prepare(
      `SELECT id, address FROM clients
       WHERE lower(trim(coalesce(email, ''))) = ?
          OR upper(trim(coalesce(name, ''))) = 'KHODTSEV, SERGEI'`
    )
    .all(EMAIL)) as Array<{ id?: number; address?: string | null }>;
  for (const row of clients) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || alreadyRestored(row.address)) continue;
    await db
      .prepare("UPDATE clients SET phone = ?, address = ?, city = ?, country = ? WHERE id = ?")
      .run(PHONE, ADDRESS, CITY, COUNTRY, id);
  }

  const docs = (await db
    .prepare("SELECT id, invoice_json FROM emitted_documents WHERE invoice_json LIKE ?")
    .all(`%${INVOICE_NUMBER}%`)) as Array<{ id?: number; invoice_json?: string }>;
  for (const doc of docs) {
    const id = Number(doc.id);
    if (!Number.isFinite(id) || !doc.invoice_json) continue;
    let inv: Record<string, unknown>;
    try {
      inv = JSON.parse(doc.invoice_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    const number = String(inv.number ?? "")
      .replace(/^FACTURA\s+/i, "")
      .trim();
    if (number !== INVOICE_NUMBER || alreadyRestored(inv.clientAddress)) continue;
    inv.clientPhone = PHONE;
    inv.clientAddress = ADDRESS;
    inv.clientCity = CITY;
    inv.clientCountry = COUNTRY;
    await db.prepare("UPDATE emitted_documents SET invoice_json = ? WHERE id = ?").run(JSON.stringify(inv), id);
  }
}
