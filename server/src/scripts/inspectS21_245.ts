import { initDb, db } from "../db.js";
import {
  scoreCotizadorEquipoMatch,
  resolveCotizadorMarketplaceTarget,
} from "../lib/syncCotizadorPrecioToMarketplace.js";

await initDb();

const costos = (await db
  .prepare(
    `SELECT id, created_at, marca, modelo, procesador, precio_venta
     FROM asic_costos_equipos
     WHERE LOWER(procesador) LIKE '%245%'
        OR ABS(precio_venta - 4068) < 1
     ORDER BY created_at DESC
     LIMIT 20`
  )
  .all()) as Record<string, unknown>[];

console.log("=== Cotizaciones ~245 o ~4068 ===");
for (const r of costos) {
  console.log(
    `${r.created_at} | ${r.marca} ${r.modelo} ${r.procesador} | precio_venta=${r.precio_venta}`
  );
}

const eqs = (await db
  .prepare(
    `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_visible, numero_serie
     FROM equipos_asic
     WHERE LOWER(procesador) LIKE '%245%'
        OR LOWER(numero_serie) LIKE '%245%'
        OR (LOWER(modelo) LIKE '%s21%' AND LOWER(procesador) LIKE '%245%')`
  )
  .all()) as Record<string, unknown>[];

console.log("\n=== Equipos marketplace ~245 ===");
for (const r of eqs) {
  const score = scoreCotizadorEquipoMatch(
    { marca: "Bitmain", modelo: "S21", procesador: "245 ths" },
    {
      marca_equipo: String(r.marca_equipo ?? ""),
      modelo: String(r.modelo ?? ""),
      procesador: String(r.procesador ?? ""),
    }
  );
  console.log(
    `visible=${r.mp_visible} | ${r.marca_equipo} ${r.modelo} ${r.procesador} | precio_usd=${r.precio_usd} | ${r.numero_serie} | matchScore=${score}`
  );
}

const latest = (await db
  .prepare(
    `SELECT marca, modelo, procesador, precio_venta, created_at
     FROM asic_costos_equipos
     WHERE LOWER(modelo) LIKE '%s21%' AND LOWER(procesador) LIKE '%245%'
     ORDER BY created_at DESC
     LIMIT 1`
  )
  .get()) as Record<string, unknown> | undefined;

console.log("\n=== Última cotiz S21 245 ===");
console.log(latest ?? "(ninguna en esta DB)");

const cotiz = latest
  ? {
      marca: String(latest.marca ?? ""),
      modelo: String(latest.modelo ?? ""),
      procesador: String(latest.procesador ?? ""),
    }
  : { marca: "Bitmain", modelo: "S21", procesador: "245 ths" };

const allEq = eqs as import("../lib/syncCotizadorPrecioToMarketplace.js").CotizadorMatchCandidate[];
const target = resolveCotizadorMarketplaceTarget(cotiz, allEq);
console.log("\n=== Match marketplace (sync) ===");
console.log(JSON.stringify(target, null, 2));

const near4068 = (await db
  .prepare(
    `SELECT id, created_at, marca, modelo, procesador, precio_venta
     FROM asic_costos_equipos
     WHERE ABS(precio_venta - 4068) < 1
     ORDER BY created_at DESC
     LIMIT 10`
  )
  .all()) as Record<string, unknown>[];

console.log("\n=== Cotizaciones exactamente ~4068 ===");
for (const r of near4068) {
  console.log(
    `${r.created_at} | ${r.marca} ${r.modelo} ${r.procesador} | precio_venta=${r.precio_venta}`
  );
}
if (!near4068.length) console.log("(ninguna)");
