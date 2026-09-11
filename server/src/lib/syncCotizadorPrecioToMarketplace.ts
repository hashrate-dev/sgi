/**
 * Tras registrar una cotización ASIC (China→PY), actualiza el precio del equipo
 * publicado en marketplace (`equipos_asic`) si hay un match único marca/modelo/hashrate.
 * Reutiliza el mismo historial de precios que PUT /equipos/:id.
 */
import type { AuthUser } from "../middleware/auth.js";
import { db } from "../db.js";
import { logEquipoAsicAudit } from "./equipoAsicAudit.js";
import { mpVisibleFromDbValue } from "./mpVisible.js";
import {
  appendPrecioHistorial,
  parsePrecioHistorialJson,
  syntheticFirstEntryFromFechaIngreso,
} from "./precioHistorialAsic.js";

export type CotizadorMarketplaceSyncResult = {
  status: "updated" | "unchanged" | "no_match" | "ambiguous" | "skipped";
  equipoId?: string;
  codigoProducto?: string | null;
  label?: string;
  oldPrecio?: number;
  newPrecio?: number;
  message: string;
};

export type CotizadorMatchCandidate = {
  id: string;
  numero_serie: string | null;
  fecha_ingreso: string;
  marca_equipo: string;
  modelo: string;
  procesador: string;
  precio_usd: number | null;
  mp_visible: unknown;
  precio_historial_json: string | null;
};

function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Misma idea que marketplaceGarantiaQuote: clave de modelo (s21, l9, …). */
export function extractCotizadorModelKey(text: string): string {
  const stop = new Set([
    "antminer",
    "bitmain",
    "microbt",
    "whatsminer",
    "canaan",
    "pro",
    "xp",
    "hydro",
    "series",
    "rack",
    "antrack",
    "antspace",
    "cap",
    "ths",
    "ghs",
    "mhs",
    "khs",
    "phs",
  ]);
  const tokens = norm(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const tk of tokens) {
    if (stop.has(tk)) continue;
    if (/[a-z]*\d+[a-z]*/i.test(tk)) return tk;
  }
  return "";
}

export function parseCotizadorHashrate(text: string): { value: number; unit: string } | null {
  const m = String(text ?? "")
    .toLowerCase()
    .match(/(\d+(?:[.,]\d+)?)\s*(th\/s|gh\/s|mh\/s|kh\/s|ph\/s|ths|ghs|mhs|khs|phs|ksol\/s|ks\/s)\b/i);
  if (!m) return null;
  const value = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(value)) return null;
  let unit = String(m[2] ?? "").toLowerCase().replace("/", "");
  if (unit === "ksols" || unit === "ks") unit = "ksol";
  return { value, unit };
}

function normProcesadorLoose(text: string): string {
  return norm(text)
    .replace(/th\/s/g, "ths")
    .replace(/mh\/s/g, "mhs")
    .replace(/gh\/s/g, "ghs")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
}

function marcaCompatible(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Puntaje de coincidencia cotizador↔equipo; null = no match. */
export function scoreCotizadorEquipoMatch(
  cotiz: { marca: string; modelo: string; procesador: string },
  eq: Pick<CotizadorMatchCandidate, "marca_equipo" | "modelo" | "procesador">
): number | null {
  if (!marcaCompatible(cotiz.marca, eq.marca_equipo)) return null;
  const keyC = extractCotizadorModelKey(cotiz.modelo);
  const keyE = extractCotizadorModelKey(eq.modelo);
  if (!keyC || !keyE || keyC !== keyE) return null;

  const hrC = parseCotizadorHashrate(cotiz.procesador);
  const hrE = parseCotizadorHashrate(eq.procesador);
  if (hrC && hrE) {
    if (hrC.unit !== hrE.unit) return null;
    if (Math.abs(hrC.value - hrE.value) > 0.051) return null;
    return 100;
  }
  if (normProcesadorLoose(cotiz.procesador) === normProcesadorLoose(eq.procesador)) return 80;
  return null;
}

/**
 * Resuelve a qué equipo de tienda actualizaría (sin escribir).
 * Solo considera `mp_visible`; si hay 0 o >1 → no actualiza.
 */
export function resolveCotizadorMarketplaceTarget(
  cotiz: { marca: string; modelo: string; procesador: string },
  rows: CotizadorMatchCandidate[]
): {
  status: "ok" | "no_match" | "ambiguous";
  target?: CotizadorMatchCandidate;
  score?: number;
  candidates: number;
} {
  type Scored = { eq: CotizadorMatchCandidate; score: number };
  const scored: Scored[] = [];
  for (const eq of rows) {
    if (!mpVisibleFromDbValue(eq.mp_visible)) continue;
    const score = scoreCotizadorEquipoMatch(cotiz, eq);
    if (score == null) continue;
    scored.push({ eq, score });
  }
  if (scored.length === 0) return { status: "no_match", candidates: 0 };
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!.score;
  const top = scored.filter((s) => s.score === best);
  if (top.length > 1) return { status: "ambiguous", candidates: top.length, score: best };
  return { status: "ok", target: top[0]!.eq, score: best, candidates: 1 };
}

/**
 * Actualiza precio + historial del equipo de tienda que coincide con la cotización.
 * Si no hay match único, no modifica nada (seguro).
 */
export async function syncCotizadorPrecioToMarketplace(params: {
  marca: string;
  modelo: string;
  procesador: string;
  precioVenta: number;
  user: AuthUser;
}): Promise<CotizadorMarketplaceSyncResult> {
  const newPrecio = Math.round(Number(params.precioVenta));
  if (!Number.isFinite(newPrecio) || newPrecio < 0) {
    return { status: "skipped", message: "Precio de venta inválido; no se actualizó marketplace." };
  }
  const modelo = String(params.modelo ?? "").trim();
  const procesador = String(params.procesador ?? "").trim();
  if (!modelo || !procesador) {
    return { status: "skipped", message: "Falta modelo/procesador; no se actualizó marketplace." };
  }

  const rows = (await db
    .prepare(
      `SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, mp_visible, precio_historial_json
       FROM equipos_asic`
    )
    .all()) as CotizadorMatchCandidate[];

  const cotiz = {
    marca: String(params.marca ?? "").trim(),
    modelo,
    procesador,
  };

  const resolved = resolveCotizadorMarketplaceTarget(cotiz, rows);
  if (resolved.status === "no_match") {
    const anyHidden = rows.some((eq) => scoreCotizadorEquipoMatch(cotiz, eq) != null);
    return {
      status: "no_match",
      message: anyHidden
        ? "Hay coincidencia en inventario pero no en tienda visible; no se actualizó."
        : "Sin equipo de marketplace coincidente (marca/modelo/hashrate).",
    };
  }
  if (resolved.status === "ambiguous") {
    return {
      status: "ambiguous",
      message: `Varios equipos de tienda coinciden (${resolved.candidates}); no se actualizó para evitar error.`,
    };
  }

  const target = resolved.target!;
  const oldPrecio = Math.round(Number(target.precio_usd) || 0);
  const label = `${target.marca_equipo} ${target.modelo} · ${target.procesador}`.trim();

  if (oldPrecio === newPrecio) {
    return {
      status: "unchanged",
      equipoId: target.id,
      codigoProducto: target.numero_serie,
      label,
      oldPrecio,
      newPrecio,
      message: `Marketplace ya tenía ${newPrecio} USD (${label}).`,
    };
  }

  let historialJson = target.precio_historial_json ?? null;
  let entries = parsePrecioHistorialJson(historialJson);
  if (entries.length === 0) {
    entries = [syntheticFirstEntryFromFechaIngreso(String(target.fecha_ingreso ?? ""), oldPrecio)];
  }
  entries = appendPrecioHistorial(entries, newPrecio, new Date().toISOString());
  historialJson = JSON.stringify(entries);

  await db
    .prepare(`UPDATE equipos_asic SET precio_usd = ?, precio_historial_json = ? WHERE id = ?`)
    .run(newPrecio, historialJson, target.id);

  await logEquipoAsicAudit({
    user: params.user,
    equipoId: target.id,
    codigoProducto: target.numero_serie,
    action: "update",
    summary: `Precio desde cotizador ASIC: ${label} · ${oldPrecio}→${newPrecio} USD`,
    details: {
      origen: "cotizador-china-py",
      precioUSD: { antes: oldPrecio, despues: newPrecio },
      match: { marca: cotiz.marca, modelo: cotiz.modelo, procesador: cotiz.procesador },
    },
  });

  return {
    status: "updated",
    equipoId: target.id,
    codigoProducto: target.numero_serie,
    label,
    oldPrecio,
    newPrecio,
    message: `Marketplace actualizado: ${label} · ${oldPrecio}→${newPrecio} USD (historial).`,
  };
}

/**
 * Aplica a la tienda el **último** precio cotizado por cada equipo visible (match único).
 * No inventa precios: solo usa registros ya guardados en `asic_costos_equipos`.
 */
export async function backfillLatestCotizadorPreciosToMarketplace(user: AuthUser): Promise<{
  updated: number;
  unchanged: number;
  skipped: number;
  details: CotizadorMarketplaceSyncResult[];
}> {
  const costos = (await db
    .prepare(
      `SELECT marca, modelo, procesador, precio_venta, created_at
       FROM asic_costos_equipos
       ORDER BY created_at DESC, id DESC`
    )
    .all()) as Array<{
    marca: string;
    modelo: string;
    procesador: string;
    precio_venta: number;
    created_at: string;
  }>;

  const details: CotizadorMarketplaceSyncResult[] = [];
  const touchedEquipoIds = new Set<string>();
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  const equipos = (await db
    .prepare(
      `SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, mp_visible, precio_historial_json
       FROM equipos_asic`
    )
    .all()) as CotizadorMatchCandidate[];

  for (const row of costos) {
    const marca = String(row.marca ?? "").trim();
    const modelo = String(row.modelo ?? "").trim();
    const procesador = String(row.procesador ?? "").trim();
    if (!modelo || !procesador) {
      skipped += 1;
      continue;
    }

    const resolved = resolveCotizadorMarketplaceTarget({ marca, modelo, procesador }, equipos);
    if (resolved.status !== "ok" || !resolved.target) {
      skipped += 1;
      continue;
    }
    if (touchedEquipoIds.has(resolved.target.id)) continue;
    touchedEquipoIds.add(resolved.target.id);

    const result = await syncCotizadorPrecioToMarketplace({
      marca,
      modelo,
      procesador,
      precioVenta: Number(row.precio_venta),
      user,
    });
    details.push(result);
    if (result.status === "updated") updated += 1;
    else if (result.status === "unchanged") unchanged += 1;
    else skipped += 1;

    // Refresh in-memory precio so later cotizaciones del mismo equipo no pisen con datos viejos del SELECT inicial
    if (result.status === "updated" && result.equipoId != null && result.newPrecio != null) {
      const eq = equipos.find((e) => e.id === result.equipoId);
      if (eq) eq.precio_usd = result.newPrecio;
    }
  }

  return { updated, unchanged, skipped, details };
}
