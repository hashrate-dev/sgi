/**
 * Verificación en seco del match cotizador → marketplace.
 * NO escribe precios. Uso: npx tsx src/scripts/verifyCotizadorMarketplaceMatch.ts
 */
import {
  extractCotizadorModelKey,
  parseCotizadorHashrate,
  resolveCotizadorMarketplaceTarget,
  scoreCotizadorEquipoMatch,
  type CotizadorMatchCandidate,
} from "../lib/syncCotizadorPrecioToMarketplace.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK  ${msg}`);
}

function runUnitCases() {
  console.log("\n=== Tests unitarios de match (sin DB) ===\n");

  assert(extractCotizadorModelKey("S21") === "s21", "modelo cotizador S21 → s21");
  assert(extractCotizadorModelKey("Antminer S21") === "s21", "Antminer S21 → s21");
  assert(extractCotizadorModelKey("Antminer S21 Pro") === "s21", "Antminer S21 Pro → s21");
  assert(extractCotizadorModelKey("L9") === "l9", "L9 → l9");

  const hr = parseCotizadorHashrate("235 ths");
  assert(!!hr && hr.value === 235 && hr.unit === "ths", "235 ths parse");
  const hr2 = parseCotizadorHashrate("235 TH/s");
  assert(!!hr2 && hr2.value === 235 && hr2.unit === "ths", "235 TH/s parse compatible");

  const cotiz = { marca: "Bitmain", modelo: "S21", procesador: "235 ths" };
  const eqOk: CotizadorMatchCandidate = {
    id: "1",
    numero_serie: "VIT-1",
    fecha_ingreso: "2026-01-01",
    marca_equipo: "Bitmain",
    modelo: "Antminer S21",
    procesador: "235 TH/s",
    precio_usd: 3690,
    mp_visible: 1,
    precio_historial_json: null,
  };
  assert(scoreCotizadorEquipoMatch(cotiz, eqOk) === 100, "S21 235 ths ↔ Antminer S21 235 TH/s = 100");

  const eqWrongHr = { ...eqOk, id: "2", procesador: "245 TH/s" };
  assert(scoreCotizadorEquipoMatch(cotiz, eqWrongHr) == null, "hashrate distinto → no match");

  const eqWrongModel = { ...eqOk, id: "3", modelo: "Antminer L9", procesador: "16.000 MH/s" };
  assert(scoreCotizadorEquipoMatch(cotiz, eqWrongModel) == null, "modelo distinto → no match");

  const hidden = { ...eqOk, id: "4", mp_visible: 0 };
  const resolvedHiddenOnly = resolveCotizadorMarketplaceTarget(cotiz, [hidden]);
  assert(resolvedHiddenOnly.status === "no_match", "solo inventario oculto → no_match (no escribe)");

  const resolvedOk = resolveCotizadorMarketplaceTarget(cotiz, [eqOk, hidden]);
  assert(resolvedOk.status === "ok" && resolvedOk.target?.id === "1", "elige solo el visible");

  const twin = { ...eqOk, id: "5", numero_serie: "VIT-2" };
  const resolvedAmb = resolveCotizadorMarketplaceTarget(cotiz, [eqOk, twin]);
  assert(resolvedAmb.status === "ambiguous", "dos visibles iguales → ambiguous (no escribe)");

  const l9Cotiz = { marca: "Bitmain", modelo: "L9", procesador: "16.000 mhs" };
  const l9Eq: CotizadorMatchCandidate = {
    ...eqOk,
    id: "6",
    modelo: "Antminer L9",
    procesador: "16.000 MH/s",
  };
  assert(scoreCotizadorEquipoMatch(l9Cotiz, l9Eq) === 100, "L9 16.000 mhs ↔ 16.000 MH/s");

  console.log("\nTodos los tests unitarios pasaron.\n");
}

async function runDryRunAgainstDb() {
  console.log("=== Dry-run contra DB local (solo lectura) ===\n");
  try {
    const { db, initDb } = await import("../db.js");
    await initDb();
    const rows = (await db
      .prepare(
        `SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, mp_visible, precio_historial_json
         FROM equipos_asic`
      )
      .all()) as CotizadorMatchCandidate[];

    const visibles = rows.filter((r) => Number(r.mp_visible) === 1 || r.mp_visible === true || r.mp_visible === "1");
    console.log(`Equipos totales: ${rows.length} · visibles tienda: ${visibles.length}`);

    const samples = [
      { marca: "Bitmain", modelo: "S21", procesador: "235 ths" },
      { marca: "Bitmain", modelo: "S21", procesador: "245 ths" },
      { marca: "Bitmain", modelo: "S21", procesador: "270 ths" },
      { marca: "Bitmain", modelo: "L9", procesador: "16.000 mhs" },
      { marca: "Bitmain", modelo: "S23", procesador: "305 ths" },
      { marca: "Bitmain", modelo: "MODELO-INEXISTENTE-XYZ", procesador: "999 ths" },
    ];

    for (const c of samples) {
      const r = resolveCotizadorMarketplaceTarget(c, rows);
      if (r.status === "ok" && r.target) {
        console.log(
          `  ${c.modelo} ${c.procesador} → OK → ${r.target.modelo} ${r.target.procesador} (precio actual ${r.target.precio_usd} USD)`
        );
      } else {
        console.log(`  ${c.modelo} ${c.procesador} → ${r.status.toUpperCase()} (no escribiría)`);
      }
    }
    console.log("\nDry-run terminado sin escribir nada.\n");
  } catch (e) {
    console.log("Dry-run DB omitido (sin conexión o sin tabla):", e instanceof Error ? e.message : e);
    console.log("(Los tests unitarios ya validan la lógica segura.)\n");
  }
}

runUnitCases();
await runDryRunAgainstDb();
