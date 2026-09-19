import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const valoresGarantiasAsicRouter = Router();

let schemaEnsured = false;

function nowSql(): string {
  return db.isPostgres ? "NOW()" : "datetime('now')";
}

async function ensureValoresGarantiasAsicSchema(): Promise<void> {
  if (!schemaEnsured) {
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS valores_garantias_asic (
          id BIGSERIAL PRIMARY KEY,
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          consumo_w DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_cliente_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          fecha TEXT NOT NULL,
          notas TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS valores_garantias_asic_historial (
          id BIGSERIAL PRIMARY KEY,
          valor_id BIGINT NOT NULL REFERENCES valores_garantias_asic(id) ON DELETE CASCADE,
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          consumo_w DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_cliente_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          fecha TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS valores_garantias_asic (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          consumo_w REAL NOT NULL DEFAULT 0,
          monto_usd REAL NOT NULL DEFAULT 0,
          monto_cliente_usd REAL NOT NULL DEFAULT 0,
          fecha TEXT NOT NULL,
          notas TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS valores_garantias_asic_historial (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          valor_id INTEGER NOT NULL,
          marca TEXT NOT NULL DEFAULT '',
          modelo TEXT NOT NULL DEFAULT '',
          procesador TEXT NOT NULL DEFAULT '',
          consumo_w REAL NOT NULL DEFAULT 0,
          monto_usd REAL NOT NULL DEFAULT 0,
          monto_cliente_usd REAL NOT NULL DEFAULT 0,
          fecha TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (valor_id) REFERENCES valores_garantias_asic(id) ON DELETE CASCADE
        )`
      )
      .run();
  }
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_valores_garantias_asic_fecha ON valores_garantias_asic(fecha DESC, id DESC)")
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_valores_garantias_asic_maq ON valores_garantias_asic(marca, modelo, procesador)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_valores_garantias_asic_hist_fecha ON valores_garantias_asic_historial(fecha DESC, id DESC)"
    )
    .run();
  }
  if (db.isPostgres) {
    await db.prepare("ALTER TABLE valores_garantias_asic ADD COLUMN IF NOT EXISTS monto_cliente_usd DOUBLE PRECISION NOT NULL DEFAULT 0").run();
    await db.prepare("ALTER TABLE valores_garantias_asic_historial ADD COLUMN IF NOT EXISTS monto_cliente_usd DOUBLE PRECISION NOT NULL DEFAULT 0").run();
  } else {
    for (const sql of [
      "ALTER TABLE valores_garantias_asic ADD COLUMN monto_cliente_usd REAL NOT NULL DEFAULT 0",
      "ALTER TABLE valores_garantias_asic_historial ADD COLUMN monto_cliente_usd REAL NOT NULL DEFAULT 0",
    ]) {
      try {
        await db.prepare(sql).run();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) throw e;
      }
    }
  }
  schemaEnsured = true;
}

const CreateSchema = z.object({
  marca: z.string().trim().min(1).max(120),
  modelo: z.string().trim().min(1).max(120),
  procesador: z.string().trim().min(1).max(120),
  consumoW: z.coerce.number().finite().min(0).max(100000),
  montoUsd: z.coerce.number().finite().min(0),
  montoClienteUsd: z.coerce.number().finite().min(0),
  fecha: z.string().trim().min(1).max(40),
  notas: z.string().trim().max(400).optional(),
});

const UpdateSchema = CreateSchema.partial();

type Row = Record<string, unknown>;

function mapItem(raw: Row) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    marca: String(r.marca ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    consumoW: Number(r.consumo_w ?? 0),
    montoUsd: Number(r.monto_usd ?? 0),
    montoClienteUsd: Number(r.monto_cliente_usd ?? 0),
    fecha: String(r.fecha ?? ""),
    notas: String(r.notas ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function mapHist(raw: Row) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    valorId: Number(r.valor_id ?? 0),
    marca: String(r.marca ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    consumoW: Number(r.consumo_w ?? 0),
    montoUsd: Number(r.monto_usd ?? 0),
    montoClienteUsd: Number(r.monto_cliente_usd ?? 0),
    fecha: String(r.fecha ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

async function findDuplicateId(marca: string, modelo: string, procesador: string, excludeId?: number): Promise<number | null> {
  const rows = (await db
    .prepare(
      `SELECT id FROM valores_garantias_asic
       WHERE LOWER(TRIM(marca)) = LOWER(TRIM(?))
         AND LOWER(TRIM(modelo)) = LOWER(TRIM(?))
         AND LOWER(TRIM(procesador)) = LOWER(TRIM(?))`
    )
    .all(marca, modelo, procesador)) as Array<{ id?: number }>;
  const hit = rows.find((x) => {
    const id = Number(x.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (excludeId != null && id === excludeId) return false;
    return true;
  });
  return hit ? Number(hit.id) : null;
}

const readMw = [requireRole("admin_a", "admin_b", "operador", "lector"), requireModuleGrant("garantias")] as const;
const writeMw = [requireRole("admin_a", "admin_b", "operador"), requireModuleGrant("garantias")] as const;

valoresGarantiasAsicRouter.get("/valores-garantias-asic", ...readMw, async (_req, res, next) => {
  try {
    await ensureValoresGarantiasAsicSchema();
    const itemSqlFull =
      `SELECT id, marca, modelo, procesador, consumo_w, monto_usd, monto_cliente_usd, fecha, notas, created_at, updated_at
       FROM valores_garantias_asic ORDER BY fecha DESC, id DESC`;
    const itemSqlLegacy =
      `SELECT id, marca, modelo, procesador, consumo_w, monto_usd, fecha, notas, created_at, updated_at
       FROM valores_garantias_asic ORDER BY fecha DESC, id DESC`;
    let items: Row[] = [];
    try {
      items = (await db.prepare(itemSqlFull).all()) as Row[];
    } catch {
      items = (await db.prepare(itemSqlLegacy).all()) as Row[];
    }
    let historial: Row[] = [];
    try {
      historial = (await db
        .prepare(
          `SELECT id, valor_id, marca, modelo, procesador, consumo_w, monto_usd, monto_cliente_usd, fecha, created_at
           FROM valores_garantias_asic_historial ORDER BY fecha DESC, id DESC`
        )
        .all()) as Row[];
    } catch {
      try {
        historial = (await db
          .prepare(
            `SELECT id, valor_id, marca, modelo, procesador, consumo_w, monto_usd, fecha, created_at
             FROM valores_garantias_asic_historial ORDER BY fecha DESC, id DESC`
          )
          .all()) as Row[];
      } catch {
        historial = [];
      }
    }
    res.json({ items: items.map(mapItem), historial: historial.map(mapHist) });
  } catch (e) {
    next(e);
  }
});

valoresGarantiasAsicRouter.post("/valores-garantias-asic", ...writeMw, async (req, res, next) => {
  try {
    await ensureValoresGarantiasAsicSchema();
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para el valor de garantía ASIC." } });
    }
    const data = parsed.data;
    const dup = await findDuplicateId(data.marca, data.modelo, data.procesador);
    if (dup) {
      return res.status(409).json({
        error: {
          message: "Ya hay un valor de garantía para esa marca, modelo y procesador. Editá el registro existente.",
        },
      });
    }
    const ts = nowSql();
    await db
      .prepare(
        `INSERT INTO valores_garantias_asic (marca, modelo, procesador, consumo_w, monto_usd, monto_cliente_usd, fecha, notas, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${ts}, ${ts})`
      )
      .run(
        data.marca,
        data.modelo,
        data.procesador,
        data.consumoW,
        data.montoUsd,
        data.montoClienteUsd,
        data.fecha,
        data.notas ?? ""
      );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

valoresGarantiasAsicRouter.put("/valores-garantias-asic/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureValoresGarantiasAsicSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para el valor de garantía ASIC." } });
    }
    const current = (await db.prepare("SELECT * FROM valores_garantias_asic WHERE id = ?").get(id)) as Row | undefined;
    if (!current) {
      return res.status(404).json({ error: { message: "Registro no encontrado." } });
    }
    const mapped = mapItem(current);
    const data = parsed.data;
    const nextMarca = data.marca ?? mapped.marca;
    const nextModelo = data.modelo ?? mapped.modelo;
    const nextProc = data.procesador ?? mapped.procesador;
    const dup = await findDuplicateId(nextMarca, nextModelo, nextProc, id);
    if (dup) {
      return res.status(409).json({
        error: {
          message: "Ya hay un valor de garantía para esa marca, modelo y procesador.",
        },
      });
    }
    const nextConsumo = data.consumoW ?? mapped.consumoW;
    const nextMonto = data.montoUsd ?? mapped.montoUsd;
    const nextMontoCliente = data.montoClienteUsd ?? mapped.montoClienteUsd;
    const valueChanged =
      nextConsumo !== mapped.consumoW ||
      nextMonto !== mapped.montoUsd ||
      nextMontoCliente !== mapped.montoClienteUsd;
    if (valueChanged) {
      const ts = nowSql();
      await db
        .prepare(
          `INSERT INTO valores_garantias_asic_historial (valor_id, marca, modelo, procesador, consumo_w, monto_usd, monto_cliente_usd, fecha, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${ts})`
        )
        .run(
          id,
          mapped.marca,
          mapped.modelo,
          mapped.procesador,
          mapped.consumoW,
          mapped.montoUsd,
          mapped.montoClienteUsd,
          mapped.fecha
        );
    }
    const fields: string[] = [];
    const values: unknown[] = [];
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
    if (data.consumoW != null) {
      fields.push("consumo_w = ?");
      values.push(data.consumoW);
    }
    if (data.montoUsd != null) {
      fields.push("monto_usd = ?");
      values.push(data.montoUsd);
    }
    if (data.montoClienteUsd != null) {
      fields.push("monto_cliente_usd = ?");
      values.push(data.montoClienteUsd);
    }
    if (data.fecha != null) {
      fields.push("fecha = ?");
      values.push(data.fecha);
    }
    if (data.notas != null) {
      fields.push("notas = ?");
      values.push(data.notas);
    }
    if (fields.length === 0) {
      return res.json({ ok: true });
    }
    fields.push(`updated_at = ${nowSql()}`);
    values.push(id);
    await db.prepare(`UPDATE valores_garantias_asic SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

valoresGarantiasAsicRouter.delete("/valores-garantias-asic/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureValoresGarantiasAsicSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    await db.prepare("DELETE FROM valores_garantias_asic_historial WHERE valor_id = ?").run(id);
    const info = await db.prepare("DELETE FROM valores_garantias_asic WHERE id = ?").run(id);
    if ((info.changes ?? 0) === 0) {
      return res.status(404).json({ error: { message: "Registro no encontrado." } });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
