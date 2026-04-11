import { db } from "../db.js";

let precioHistorialEnsured = false;

function pricesDiffer(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Math.abs(a - b) > 1e-6;
}

/** Crea tabla de historial de precios de ítems garantía ANDE y hace backfill desde precio_garantia si no hay filas. */
export async function ensureItemsGarantiaAndePrecioHistorial(): Promise<void> {
  if (precioHistorialEnsured) return;
  const adapter = db as { isPostgres?: boolean; exec?: (sql: string) => Promise<void> };

  try {
    if (adapter.isPostgres) {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS items_garantia_ande_precio_historial (
            id BIGSERIAL PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items_garantia_ande(id) ON DELETE CASCADE,
            precio_usd DOUBLE PRECISION NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_gar_ande_precio_hist_item ON items_garantia_ande_precio_historial(item_id, recorded_at)`
        )
        .run();
    } else if (typeof adapter.exec === "function") {
      await adapter.exec(`
CREATE TABLE IF NOT EXISTS items_garantia_ande_precio_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  precio_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items_garantia_ande(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gar_ande_precio_hist_item ON items_garantia_ande_precio_historial(item_id, recorded_at);
`);
    }

    /* Backfill: un registro por ítem con precio y sin historial (datos legacy). */
    const backfillSql = adapter.isPostgres
      ? `INSERT INTO items_garantia_ande_precio_historial (item_id, precio_usd, recorded_at)
         SELECT g.id, g.precio_garantia, (g.fecha_ingreso || 'T12:00:00.000Z')::timestamptz
         FROM items_garantia_ande g
         WHERE g.precio_garantia IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM items_garantia_ande_precio_historial h WHERE h.item_id = g.id)`
      : `INSERT INTO items_garantia_ande_precio_historial (item_id, precio_usd, recorded_at)
         SELECT id, precio_garantia, fecha_ingreso || 'T12:00:00.000Z'
         FROM items_garantia_ande
         WHERE precio_garantia IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM items_garantia_ande_precio_historial h WHERE h.item_id = items_garantia_ande.id)`;

    try {
      await db.prepare(backfillSql).run();
    } catch (be) {
      const bm = be instanceof Error ? be.message : String(be);
      // eslint-disable-next-line no-console
      console.warn("[items_garantia_ande_precio_historial] Backfill omitido o parcial:", bm);
    }

    precioHistorialEnsured = true;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (
      m.includes("no such table") ||
      (m.includes("does not exist") && m.toLowerCase().includes("items_garantia_ande"))
    ) {
      return;
    }
    // eslint-disable-next-line no-console
    console.warn("[items_garantia_ande_precio_historial] No se pudo asegurar tabla:", m);
  }
}

export { pricesDiffer };
