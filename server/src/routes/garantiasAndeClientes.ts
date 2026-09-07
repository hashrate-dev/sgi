import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireAnyModuleGrant, requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const garantiasAndeClientesRouter = Router();

let schemaEnsured = false;

const hostingOnlyWhereSql =
  "NOT (UPPER(TRIM(COALESCE(code, ''))) LIKE 'A9%' OR UPPER(TRIM(COALESCE(code, ''))) LIKE 'WEB-%' OR UPPER(TRIM(COALESCE(code, ''))) LIKE 'FX%')";

async function ensureGarantiasAndeClientesSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS garantias_ande_clientes (
          id BIGSERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL REFERENCES clients(id),
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          numero_serie TEXT NOT NULL DEFAULT '',
          nombre_equipo TEXT NOT NULL DEFAULT '',
          monto_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          fecha_inicio TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activa',
          fecha_devolucion TEXT,
          monto_devuelto_usd DOUBLE PRECISION,
          baja_equipo_id TEXT,
          devolucion_nota TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS numero_serie TEXT NOT NULL DEFAULT ''").run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS nombre_equipo TEXT NOT NULL DEFAULT ''").run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa'").run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS fecha_devolucion TEXT").run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS monto_devuelto_usd DOUBLE PRECISION").run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS baja_equipo_id TEXT").run();
    await db.prepare("ALTER TABLE garantias_ande_clientes ADD COLUMN IF NOT EXISTS devolucion_nota TEXT NOT NULL DEFAULT ''").run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS garantias_ande_clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          numero_serie TEXT NOT NULL DEFAULT '',
          nombre_equipo TEXT NOT NULL DEFAULT '',
          monto_usd REAL NOT NULL DEFAULT 0,
          fecha_inicio TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activa',
          fecha_devolucion TEXT,
          monto_devuelto_usd REAL,
          baja_equipo_id TEXT,
          devolucion_nota TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )`
      )
      .run();
    for (const col of [
      "numero_serie TEXT NOT NULL DEFAULT ''",
      "nombre_equipo TEXT NOT NULL DEFAULT ''",
      "estado TEXT NOT NULL DEFAULT 'activa'",
      "fecha_devolucion TEXT",
      "monto_devuelto_usd REAL",
      "baja_equipo_id TEXT",
      "devolucion_nota TEXT NOT NULL DEFAULT ''",
    ]) {
      try {
        await db.prepare(`ALTER TABLE garantias_ande_clientes ADD COLUMN ${col}`).run();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) throw e;
      }
    }
  }
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_garantias_ande_clientes_fecha ON garantias_ande_clientes(fecha_inicio DESC, id DESC)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_garantias_ande_clientes_client ON garantias_ande_clientes(client_id, fecha_inicio DESC)"
    )
    .run();
  schemaEnsured = true;
}

function nowSql(): string {
  return db.isPostgres ? "NOW()" : "datetime('now')";
}

const CreateSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  marca: z.string().trim().min(1).max(120),
  modelo: z.string().trim().min(1).max(120),
  procesador: z.string().trim().min(1).max(120),
  numeroSerie: z.string().trim().min(1).max(160),
  nombreEquipo: z.string().trim().min(1).max(200),
  montoUsd: z.coerce.number().finite().min(0),
  fechaInicio: z.string().trim().min(1).max(40),
});

const UpdateSchema = CreateSchema.partial();

type Row = Record<string, unknown>;

function mapRow(raw: Row) {
  const r = rowKeysToLowercase(raw);
  const estadoRaw = String(r.estado ?? "activa").trim().toLowerCase();
  const estado = estadoRaw === "devuelta" ? "devuelta" : "activa";
  return {
    id: Number(r.id ?? 0),
    clientId: Number(r.client_id ?? 0),
    marca: String(r.marca ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    numeroSerie: String(r.numero_serie ?? ""),
    nombreEquipo: String(r.nombre_equipo ?? ""),
    montoUsd: Number(r.monto_usd ?? 0),
    fechaInicio: String(r.fecha_inicio ?? ""),
    estado,
    fechaDevolucion: r.fecha_devolucion == null ? "" : String(r.fecha_devolucion),
    montoDevueltoUsd:
      r.monto_devuelto_usd == null || r.monto_devuelto_usd === ""
        ? null
        : Number(r.monto_devuelto_usd),
    bajaEquipoId: r.baja_equipo_id == null ? "" : String(r.baja_equipo_id),
    devolucionNota: r.devolucion_nota == null ? "" : String(r.devolucion_nota),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    clientCode: r.client_code == null ? "" : String(r.client_code),
    clientName: r.client_name == null ? "" : String(r.client_name),
    clientName2: r.client_name2 == null ? "" : String(r.client_name2),
  };
}

const readMw = [requireRole("admin_a", "admin_b", "operador", "lector"), requireModuleGrant("garantias")] as const;
const writeMw = [requireRole("admin_a", "admin_b", "operador"), requireModuleGrant("garantias")] as const;
/** Monitor (equipos) también consulta matches al dar de baja. */
const matchMw = [
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireAnyModuleGrant("garantias", "equipos"),
] as const;

garantiasAndeClientesRouter.get("/garantias-ande-clientes", ...readMw, async (_req, res, next) => {
  try {
    await ensureGarantiasAndeClientesSchema();
    const rows = (await db
      .prepare(
        `SELECT g.id, g.client_id, g.marca, g.modelo, g.procesador, g.numero_serie, g.nombre_equipo,
                g.monto_usd, g.fecha_inicio, g.estado, g.fecha_devolucion, g.monto_devuelto_usd,
                g.baja_equipo_id, g.devolucion_nota, g.created_at, g.updated_at,
                c.code AS client_code, c.name AS client_name, c.name2 AS client_name2
         FROM garantias_ande_clientes g
         JOIN clients c ON c.id = g.client_id
         ORDER BY g.fecha_inicio DESC, g.id DESC`
      )
      .all()) as Row[];
    res.json({ items: rows.map((x) => mapRow(x)) });
  } catch (e) {
    next(e);
  }
});

garantiasAndeClientesRouter.get("/garantias-ande-clientes/match", ...matchMw, async (req, res, next) => {
  try {
    await ensureGarantiasAndeClientesSchema();
    const serial = String(req.query.serial ?? "").trim().toLocaleLowerCase("es");
    const nombreEquipo = String(req.query.nombreEquipo ?? "").trim().toLocaleLowerCase("es");
    if (!serial && !nombreEquipo) {
      return res.json({ items: [] });
    }
    const rows = (await db
      .prepare(
        `SELECT g.id, g.client_id, g.marca, g.modelo, g.procesador, g.numero_serie, g.nombre_equipo,
                g.monto_usd, g.fecha_inicio, g.estado, g.fecha_devolucion, g.monto_devuelto_usd,
                g.baja_equipo_id, g.devolucion_nota, g.created_at, g.updated_at,
                c.code AS client_code, c.name AS client_name, c.name2 AS client_name2
         FROM garantias_ande_clientes g
         JOIN clients c ON c.id = g.client_id
         WHERE LOWER(TRIM(COALESCE(g.estado, 'activa'))) = 'activa'
         ORDER BY g.fecha_inicio DESC, g.id DESC`
      )
      .all()) as Row[];
    const mapped = rows.map((x) => mapRow(x)).filter((item) => {
      const sn = item.numeroSerie.trim().toLocaleLowerCase("es");
      const ne = item.nombreEquipo.trim().toLocaleLowerCase("es");
      if (serial && sn && sn === serial) return true;
      if (nombreEquipo && ne && ne === nombreEquipo) return true;
      if (serial && sn && sn.includes(serial)) return true;
      if (nombreEquipo && ne && ne.includes(nombreEquipo)) return true;
      return false;
    });
    res.json({ items: mapped });
  } catch (e) {
    next(e);
  }
});

garantiasAndeClientesRouter.get("/garantias-ande-clientes/hosting-clients", ...readMw, async (_req, res, next) => {
  try {
    const rows = (await db
      .prepare(
        `SELECT id, code, name, name2 FROM clients WHERE ${hostingOnlyWhereSql} ORDER BY code ASC`
      )
      .all()) as Array<{ id: number; code: string; name: string; name2?: string }>;
    res.json({
      clients: rows.map((r) => ({
        id: Number(r.id),
        code: String(r.code ?? "").trim(),
        name: String(r.name ?? "").trim(),
        name2: String(r.name2 ?? "").trim(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

garantiasAndeClientesRouter.post("/garantias-ande-clientes", ...writeMw, async (req, res, next) => {
  try {
    await ensureGarantiasAndeClientesSchema();
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para la garantía ANDE." } });
    }
    const data = parsed.data;
    const client = (await db
      .prepare(`SELECT id FROM clients WHERE id = ? AND ${hostingOnlyWhereSql}`)
      .get(data.clientId)) as { id: number } | undefined;
    if (!client) {
      return res.status(400).json({ error: { message: "Seleccioná un cliente de hosting válido." } });
    }
    const ts = nowSql();
    await db
      .prepare(
        `INSERT INTO garantias_ande_clientes (
           client_id, marca, modelo, procesador, numero_serie, nombre_equipo, monto_usd, fecha_inicio, estado, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activa', ${ts}, ${ts})`
      )
      .run(
        data.clientId,
        data.marca,
        data.modelo,
        data.procesador,
        data.numeroSerie,
        data.nombreEquipo,
        data.montoUsd,
        data.fechaInicio
      );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

garantiasAndeClientesRouter.put("/garantias-ande-clientes/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureGarantiasAndeClientesSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para la garantía ANDE." } });
    }
    const exists = (await db.prepare("SELECT id FROM garantias_ande_clientes WHERE id = ?").get(id)) as
      | { id: number }
      | undefined;
    if (!exists) {
      return res.status(404).json({ error: { message: "Garantía no encontrada." } });
    }
    const data = parsed.data;
    if (data.clientId != null) {
      const client = (await db
        .prepare(`SELECT id FROM clients WHERE id = ? AND ${hostingOnlyWhereSql}`)
        .get(data.clientId)) as { id: number } | undefined;
      if (!client) {
        return res.status(400).json({ error: { message: "Seleccioná un cliente de hosting válido." } });
      }
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.clientId != null) {
      fields.push("client_id = ?");
      values.push(data.clientId);
    }
    if (data.marca != null) {
      fields.push("marca = ?");
      values.push(data.marca);
    }
    if (data.modelo != null) {
      fields.push("modelo = ?");
      values.push(data.modelo);
    }
    if (data.procesador != null) {
      fields.push("procesador = ?");
      values.push(data.procesador);
    }
    if (data.numeroSerie != null) {
      fields.push("numero_serie = ?");
      values.push(data.numeroSerie);
    }
    if (data.nombreEquipo != null) {
      fields.push("nombre_equipo = ?");
      values.push(data.nombreEquipo);
    }
    if (data.montoUsd != null) {
      fields.push("monto_usd = ?");
      values.push(data.montoUsd);
    }
    if (data.fechaInicio != null) {
      fields.push("fecha_inicio = ?");
      values.push(data.fechaInicio);
    }
    if (fields.length === 0) {
      return res.json({ ok: true });
    }
    fields.push(`updated_at = ${nowSql()}`);
    values.push(id);
    await db.prepare(`UPDATE garantias_ande_clientes SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

garantiasAndeClientesRouter.delete("/garantias-ande-clientes/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureGarantiasAndeClientesSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    await db.prepare("DELETE FROM garantias_ande_clientes WHERE id = ?").run(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
