import { initDb, db } from "../db.js";

await initDb();

const costos = (await db
  .prepare(
    `SELECT id, created_at, marca, modelo, procesador, precio_venta
     FROM asic_costos_equipos
     WHERE LOWER(procesador) LIKE '%270%'
     ORDER BY created_at DESC
     LIMIT 15`
  )
  .all()) as Record<string, unknown>[];

console.log("=== Cotizaciones con 270 (últimas) ===");
for (const r of costos) {
  console.log(
    `${r.created_at} | ${r.marca} ${r.modelo} ${r.procesador} | precio_venta=${r.precio_venta}`
  );
}

const eqs = (await db
  .prepare(
    `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_visible, numero_serie
     FROM equipos_asic
     WHERE LOWER(procesador) LIKE '%270%' OR (LOWER(modelo) LIKE '%s21%' AND LOWER(procesador) LIKE '%270%')`
  )
  .all()) as Record<string, unknown>[];

console.log("\n=== Equipos marketplace ~270 ===");
for (const r of eqs) {
  console.log(
    `visible=${r.mp_visible} | ${r.marca_equipo} ${r.modelo} ${r.procesador} | precio_usd=${r.precio_usd} | ${r.numero_serie}`
  );
}

const latest5642 = (await db
  .prepare(
    `SELECT id, created_at, marca, modelo, procesador, precio_venta
     FROM asic_costos_equipos
     WHERE ROUND(precio_venta) = 5642 OR ABS(precio_venta - 5642) < 0.6
     ORDER BY created_at DESC
     LIMIT 10`
  )
  .all()) as Record<string, unknown>[];

console.log("\n=== Cotizaciones cerca de 5642 ===");
for (const r of latest5642) {
  console.log(
    `${r.created_at} | ${r.marca} ${r.modelo} ${r.procesador} | precio_venta=${r.precio_venta}`
  );
}
