import { db } from "../db.js";
import { rowKeysToLowercase } from "./pgRowLowercase.js";

let schemaEnsured = false;

export type GarantiaAndeDevolucionHistInput = {
  garantiaAndeClienteId: number;
  clientId: number;
  clientCode?: string;
  clientName?: string;
  clientName2?: string;
  marca?: string;
  modelo?: string;
  procesador?: string;
  numeroSerie?: string;
  nombreEquipo?: string;
  montoGarantiaUsd: number;
  montoDevueltoUsd: number;
  fechaDevolucion: string;
  bajaEquipoId?: string;
  nota?: string;
  createdByUserId?: number | null;
  createdByEmail?: string;
};

export async function ensureGarantiasAndeDevolucionesHistSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS garantias_ande_devoluciones_hist (
          id BIGSERIAL PRIMARY KEY,
          garantia_ande_cliente_id INTEGER,
          client_id INTEGER,
          client_code TEXT NOT NULL DEFAULT '',
          client_name TEXT NOT NULL DEFAULT '',
          client_name2 TEXT NOT NULL DEFAULT '',
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          numero_serie TEXT NOT NULL DEFAULT '',
          nombre_equipo TEXT NOT NULL DEFAULT '',
          monto_garantia_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_devuelto_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          fecha_devolucion TEXT NOT NULL,
          baja_equipo_id TEXT NOT NULL DEFAULT '',
          nota TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by_user_id INTEGER,
          created_by_email TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS garantias_ande_devoluciones_hist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          garantia_ande_cliente_id INTEGER,
          client_id INTEGER,
          client_code TEXT NOT NULL DEFAULT '',
          client_name TEXT NOT NULL DEFAULT '',
          client_name2 TEXT NOT NULL DEFAULT '',
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          numero_serie TEXT NOT NULL DEFAULT '',
          nombre_equipo TEXT NOT NULL DEFAULT '',
          monto_garantia_usd REAL NOT NULL DEFAULT 0,
          monto_devuelto_usd REAL NOT NULL DEFAULT 0,
          fecha_devolucion TEXT NOT NULL,
          baja_equipo_id TEXT NOT NULL DEFAULT '',
          nota TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_by_user_id INTEGER,
          created_by_email TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
  }
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_ga_ande_dev_hist_fecha ON garantias_ande_devoluciones_hist(fecha_devolucion DESC, id DESC)"
    )
    .run();
  await backfillFromDevueltasIfEmpty();
  schemaEnsured = true;
}

async function backfillFromDevueltasIfEmpty(): Promise<void> {
  try {
    const countRow = (await db.prepare("SELECT COUNT(*) AS c FROM garantias_ande_devoluciones_hist").get()) as
      | { c?: number | string }
      | undefined;
    const count = Number(countRow?.c ?? 0);
    if (Number.isFinite(count) && count > 0) return;

    const rows = (await db
      .prepare(
        `SELECT g.id, g.client_id, g.marca, g.modelo, g.procesador, g.numero_serie, g.nombre_equipo,
                g.monto_usd, g.fecha_devolucion, g.monto_devuelto_usd, g.baja_equipo_id, g.devolucion_nota,
                c.code AS client_code, c.name AS client_name, c.name2 AS client_name2
         FROM garantias_ande_clientes g
         JOIN clients c ON c.id = g.client_id
         WHERE LOWER(TRIM(COALESCE(g.estado, ''))) = 'devuelta'
         ORDER BY g.fecha_devolucion DESC, g.id DESC`
      )
      .all()) as Array<Record<string, unknown>>;

    for (const raw of rows) {
      const r = rowKeysToLowercase(raw);
      await insertGarantiaAndeDevolucionHist({
        garantiaAndeClienteId: Number(r.id ?? 0),
        clientId: Number(r.client_id ?? 0),
        clientCode: String(r.client_code ?? ""),
        clientName: String(r.client_name ?? ""),
        clientName2: String(r.client_name2 ?? ""),
        marca: String(r.marca ?? ""),
        modelo: String(r.modelo ?? ""),
        procesador: String(r.procesador ?? ""),
        numeroSerie: String(r.numero_serie ?? ""),
        nombreEquipo: String(r.nombre_equipo ?? ""),
        montoGarantiaUsd: Number(r.monto_usd ?? 0),
        montoDevueltoUsd: Number(r.monto_devuelto_usd ?? r.monto_usd ?? 0),
        fechaDevolucion: String(r.fecha_devolucion ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
        bajaEquipoId: String(r.baja_equipo_id ?? ""),
        nota: String(r.devolucion_nota ?? "") || "Backfill: garantía marcada como devuelta",
        createdByEmail: "sistema",
      });
    }
  } catch {
    /* tabla origen puede no existir aún */
  }
}

export async function insertGarantiaAndeDevolucionHist(entry: GarantiaAndeDevolucionHistInput): Promise<void> {
  await ensureGarantiasAndeDevolucionesHistSchema();
  const nowSql = db.isPostgres ? "NOW()" : "datetime('now')";
  await db
    .prepare(
      `INSERT INTO garantias_ande_devoluciones_hist (
         garantia_ande_cliente_id, client_id, client_code, client_name, client_name2,
         marca, modelo, procesador, numero_serie, nombre_equipo,
         monto_garantia_usd, monto_devuelto_usd, fecha_devolucion, baja_equipo_id, nota,
         created_at, created_by_user_id, created_by_email
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${nowSql}, ?, ?)`
    )
    .run(
      entry.garantiaAndeClienteId,
      entry.clientId,
      String(entry.clientCode ?? "").trim(),
      String(entry.clientName ?? "").trim(),
      String(entry.clientName2 ?? "").trim(),
      String(entry.marca ?? "").trim(),
      String(entry.modelo ?? "").trim(),
      String(entry.procesador ?? "").trim(),
      String(entry.numeroSerie ?? "").trim(),
      String(entry.nombreEquipo ?? "").trim(),
      Number(entry.montoGarantiaUsd) || 0,
      Number(entry.montoDevueltoUsd) || 0,
      String(entry.fechaDevolucion).slice(0, 10),
      String(entry.bajaEquipoId ?? "").trim(),
      String(entry.nota ?? "").trim(),
      entry.createdByUserId ?? null,
      String(entry.createdByEmail ?? "").trim()
    );
}

export function mapGarantiaAndeDevolucionHistRow(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    garantiaAndeClienteId:
      r.garantia_ande_cliente_id == null || r.garantia_ande_cliente_id === ""
        ? null
        : Number(r.garantia_ande_cliente_id),
    clientId: r.client_id == null || r.client_id === "" ? null : Number(r.client_id),
    clientCode: String(r.client_code ?? ""),
    clientName: String(r.client_name ?? ""),
    clientName2: String(r.client_name2 ?? ""),
    marca: String(r.marca ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    numeroSerie: String(r.numero_serie ?? ""),
    nombreEquipo: String(r.nombre_equipo ?? ""),
    montoGarantiaUsd: Number(r.monto_garantia_usd ?? 0),
    montoDevueltoUsd: Number(r.monto_devuelto_usd ?? 0),
    fechaDevolucion: String(r.fecha_devolucion ?? ""),
    bajaEquipoId: String(r.baja_equipo_id ?? ""),
    nota: String(r.nota ?? ""),
    createdAt: String(r.created_at ?? ""),
    createdByEmail: String(r.created_by_email ?? ""),
  };
}

export async function listGarantiaAndeDevolucionesHist(limit = 500) {
  await ensureGarantiasAndeDevolucionesHistSchema();
  const lim = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const rows = (await db
    .prepare(
      `SELECT id, garantia_ande_cliente_id, client_id, client_code, client_name, client_name2,
              marca, modelo, procesador, numero_serie, nombre_equipo,
              monto_garantia_usd, monto_devuelto_usd, fecha_devolucion, baja_equipo_id, nota,
              created_at, created_by_email
       FROM garantias_ande_devoluciones_hist
       ORDER BY fecha_devolucion DESC, id DESC
       LIMIT ${lim}`
    )
    .all()) as Array<Record<string, unknown>>;
  return rows.map((x) => mapGarantiaAndeDevolucionHistRow(x));
}
