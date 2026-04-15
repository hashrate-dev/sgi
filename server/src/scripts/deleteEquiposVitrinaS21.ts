/**
 * Borra de `equipos_asic` los tres códigos vitrina Antminer S21 (VIT-S21-235, VIT-S21-245, VIT-S21XP-270).
 *
 * Desde `server/`: npx tsx src/scripts/deleteEquiposVitrinaS21.ts [--dry-run]
 */
import { initDb, getDb } from "../db.js";

const NUMEROS_SERIE = ["VIT-S21-235", "VIT-S21-245", "VIT-S21XP-270"] as const;
const IDS = ["vitrina_s21_pro_235", "vitrina_s21_pro_245", "vitrina_s21_xp_270"] as const;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  await initDb();
  const db = getDb();
  const w = `(trim(numero_serie) IN (${NUMEROS_SERIE.map(() => "?").join(",")}) OR id IN (${IDS.map(() => "?").join(",")}))`;
  const params = [...NUMEROS_SERIE, ...IDS];

  const rows = (await db.prepare(`SELECT id, numero_serie, modelo FROM equipos_asic WHERE ${w}`).all(...params)) as Array<{
    id: string;
    numero_serie: string | null;
    modelo: string;
  }>;

  // eslint-disable-next-line no-console
  console.log(`[delete-s21-vit] Coincidencias: ${rows.length}`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  - ${r.id} | ${r.numero_serie ?? "—"} | ${r.modelo}`);
  }

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log("[delete-s21-vit] --dry-run: no se borró nada.");
    return;
  }

  const result = await db.prepare(`DELETE FROM equipos_asic WHERE ${w}`).run(...params);
  // eslint-disable-next-line no-console
  console.log(`[delete-s21-vit] Eliminadas: ${result.changes} fila(s).`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[delete-s21-vit]", e);
  process.exit(1);
});
