import { db } from "../db.js";

let marketplaceEquipoColumnEnsured = false;

/** Asegura columna de vínculo explícito con equipo marketplace (equipos_asic.id). */
export async function ensureItemsGarantiaAndeMarketplaceEquipoColumn(): Promise<void> {
  if (marketplaceEquipoColumnEnsured) return;
  const adapter = db as { isPostgres?: boolean; exec?: (sql: string) => Promise<void> };
  try {
    if (adapter.isPostgres) {
      await db
        .prepare("ALTER TABLE items_garantia_ande ADD COLUMN IF NOT EXISTS marketplace_equipo_id TEXT")
        .run();
    } else if (typeof adapter.exec === "function") {
      try {
        await adapter.exec("ALTER TABLE items_garantia_ande ADD COLUMN marketplace_equipo_id TEXT");
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (!m.includes("duplicate column")) throw e;
      }
    }
    marketplaceEquipoColumnEnsured = true;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("no such table") || (m.includes("does not exist") && m.toLowerCase().includes("items_garantia_ande"))) {
      return;
    }
    // eslint-disable-next-line no-console
    console.warn("[items_garantia_ande] No se pudo asegurar columna marketplace_equipo_id:", m);
  }
}
