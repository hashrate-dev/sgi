/**
 * Borra de `equipos_asic` los cuatro códigos vitrina Antminer L9 (error de catálogo).
 * Por `numero_serie` o por `id` seed, por si hubo duplicados.
 *
 * Desde `server/`: npx tsx src/scripts/deleteEquiposVitrinaL9.ts [--dry-run]
 */
import { initDb, getDb } from "../db.js";

const NUMEROS_SERIE = ["VIT-L9-15G", "VIT-L9-165G", "VIT-L9-16G", "VIT-L9-17G"] as const;
const IDS = ["vitrina_l9_15g", "vitrina_l9_165g", "vitrina_l9_16g", "vitrina_l9_17g"] as const;

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
  console.log(`[delete-l9] Coincidencias: ${rows.length}`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  - ${r.id} | ${r.numero_serie ?? "—"} | ${r.modelo}`);
  }

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log("[delete-l9] --dry-run: no se borró nada.");
    return;
  }

  const result = await db.prepare(`DELETE FROM equipos_asic WHERE ${w}`).run(...params);
  // eslint-disable-next-line no-console
  console.log(`[delete-l9] Eliminadas: ${result.changes} fila(s).`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[delete-l9]", e);
  process.exit(1);
});
