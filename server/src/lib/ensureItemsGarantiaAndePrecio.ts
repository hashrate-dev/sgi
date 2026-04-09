import { db } from "../db.js";

let precioColumnEnsured = false;

/** Asegura columna precio_garantia en items_garantia_ande (BD existentes antes del cambio). */
export async function ensureItemsGarantiaAndePrecioColumn(): Promise<void> {
  if (precioColumnEnsured) return;
  const adapter = db as { isPostgres?: boolean; exec?: (sql: string) => Promise<void> };
  try {
    if (adapter.isPostgres) {
      await db
        .prepare("ALTER TABLE items_garantia_ande ADD COLUMN IF NOT EXISTS precio_garantia DOUBLE PRECISION")
        .run();
    } else if (typeof adapter.exec === "function") {
      try {
        await adapter.exec("ALTER TABLE items_garantia_ande ADD COLUMN precio_garantia REAL");
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (!m.includes("duplicate column")) throw e;
      }
    }
    precioColumnEnsured = true;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("no such table") || (m.includes("does not exist") && m.toLowerCase().includes("items_garantia_ande"))) {
      // La tabla aún no existe; el listado fallará hasta crear el esquema.
      return;
    }
    // eslint-disable-next-line no-console
    console.warn("[items_garantia_ande] No se pudo asegurar columna precio_garantia:", m);
  }
}
