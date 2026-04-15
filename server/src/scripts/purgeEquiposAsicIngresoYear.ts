/**
 * Borra filas de `equipos_asic` cuyo `fecha_ingreso` corresponde al año indicado:
 * - ISO: 2024-12-31T…, 2024-01-01
 * - Texto tipo Excel / UI: 31/12/2024… o 31/12/24, … (año corto yy = últimos 2 dígitos del año)
 *
 * SQLite local y PostgreSQL (Supabase): mismos placeholders `?` (el adaptador PG los convierte).
 *
 * Desde la carpeta `server/`:
 *   npx tsx src/scripts/purgeEquiposAsicIngresoYear.ts 2024 --dry-run
 *   npx tsx src/scripts/purgeEquiposAsicIngresoYear.ts 2024
 */
import { initDb, getDb } from "../db.js";

function matchIngresoYearClause(year: string): { sql: string; params: string[] } {
  const yy = String(Number(year) % 100).padStart(2, "0");
  const sql = `(
    substr(trim(fecha_ingreso), 1, 4) = ?
    OR trim(fecha_ingreso) LIKE ?
    OR trim(fecha_ingreso) LIKE ?
    OR trim(fecha_ingreso) LIKE ?
    OR trim(fecha_ingreso) LIKE ?
  )`;
  const params = [
    year,
    `%/${year}%`,
    `%/${yy},%`,
    `%/${yy} %`,
    `%/${yy}.%`,
  ];
  return { sql, params };
}

async function main(): Promise<void> {
  const year = (process.argv[2] || "2024").trim();
  const dryRun = process.argv.includes("--dry-run");

  if (!/^\d{4}$/.test(year)) {
    // eslint-disable-next-line no-console
    console.error('Uso: npx tsx src/scripts/purgeEquiposAsicIngresoYear.ts [AAAA] [--dry-run]   (ej. 2024)');
    process.exit(1);
  }

  await initDb();
  const db = getDb();
  const { sql: w, params } = matchIngresoYearClause(year);

  const rows = (await db
    .prepare(`SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo FROM equipos_asic WHERE ${w}`)
    .all(...params)) as Array<{
    id: string;
    numero_serie: string | null;
    fecha_ingreso: string;
    marca_equipo: string;
    modelo: string;
  }>;

  // eslint-disable-next-line no-console
  console.log(`[purge] Año ${year}: ${rows.length} equipo(s) (ISO o texto con /${year} o /${String(Number(year) % 100).padStart(2, "0")}).`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  - ${r.id} | ${r.numero_serie ?? "—"} | ${r.fecha_ingreso} | ${r.marca_equipo} ${r.modelo}`);
  }

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log("[purge] --dry-run: no se borró nada.");
    return;
  }

  const result = await db.prepare(`DELETE FROM equipos_asic WHERE ${w}`).run(...params);
  // eslint-disable-next-line no-console
  console.log(`[purge] Eliminados: ${result.changes} fila(s).`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[purge] Error:", e);
  process.exit(1);
});
