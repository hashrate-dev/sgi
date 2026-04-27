import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { isSetupCompraHashrateProtected } from "../lib/marketplaceSetupHashratePrice.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const setupsRouter = Router();

const requireCanEdit =
  requireRole("admin_a", "admin_b", "operador");

const SetupBodySchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  /** coerce: el cliente puede enviar número o string (JSON / select). */
  precioUSD: z.coerce.number().int().min(0).max(99999),
});

const SetupGlobalMarketplaceBodySchema = z.object({
  setupUsd: z.coerce.number().int().min(0).max(999999),
});

type SetupRow = { id: string; codigo: string | null; nombre: string; precioUSD?: number; preciousd?: number; precio_usd?: number };

/** Siguiente código S01, S02, ... S99 (2 cifras), sin repetir. Postgres: ~ '^S[0-9]{2}$'; SQLite: GLOB. */
async function nextCodigoSetup(): Promise<string> {
  const d = getDb() as { isPostgres?: boolean };
  const patternSql = d.isPostgres ? "codigo ~ '^S[0-9]{2}$'" : "codigo GLOB 'S[0-9][0-9]'";
  const rows = (await db.prepare(`SELECT codigo FROM setups WHERE codigo IS NOT NULL AND ${patternSql}`).all()) as { codigo: string }[];
  const nums = rows.map((r) => parseInt(r.codigo.slice(1), 10)).filter((n) => n >= 1 && n <= 99);
  const next = nums.length === 0 ? 1 : Math.min(99, Math.max(...nums) + 1);
  return `S${String(next).padStart(2, "0")}`;
}

/** Backfill codigo para filas que no lo tienen */
async function backfillCodigos(): Promise<void> {
  const rows = (await db.prepare("SELECT id FROM setups WHERE codigo IS NULL OR codigo = '' ORDER BY id").all()) as { id: string }[];
  if (rows.length === 0) return;
  const used = new Set(
    ((await db.prepare("SELECT codigo FROM setups WHERE codigo IS NOT NULL AND codigo != ''").all()) as { codigo: string }[]).map((r) => r.codigo)
  );
  let n = 1;
  const updateStmt = db.prepare("UPDATE setups SET codigo = ? WHERE id = ?");
  for (const row of rows) {
    while (used.has(`S${String(n).padStart(2, "0")}`)) n++;
    if (n > 99) break;
    const codigo = `S${String(n).padStart(2, "0")}`;
    used.add(codigo);
    await updateStmt.run(codigo, row.id);
    n++;
  }
}

/** GET /setups — listar todos */
setupsRouter.get("/setups", requireAuth, async (_req, res: Response) => {
  try {
    await backfillCodigos();
    /* Postgres sin comillas en el alias → "precioUSD" pasa a preciousd y el cliente ve undefined. */
    const rows = (await db
      .prepare('SELECT id, codigo, nombre, precio_usd AS "precioUSD" FROM setups ORDER BY codigo ASC, nombre ASC')
      .all()) as SetupRow[];
    const items = rows.map((r) => {
      const raw = r.precioUSD ?? r.preciousd ?? r.precio_usd;
      const n = typeof raw === "number" ? raw : Number(raw);
      const precioUSD = Number.isFinite(n) ? Math.round(n) : 0;
      return {
        id: r.id,
        codigo: r.codigo ?? "",
        nombre: r.nombre,
        precioUSD,
      };
    });
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** POST /setups — crear */
setupsRouter.post("/setups", requireAuth, requireCanEdit, async (req, res: Response) => {
  const parsed = SetupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  const id = `setup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const codigo = await nextCodigoSetup();
  try {
    await db.prepare("INSERT INTO setups (id, codigo, nombre, precio_usd) VALUES (?, ?, ?, ?)").run(id, codigo, nombre.trim(), precioUSD);
    res.status(201).json({ ok: true, id, codigo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /setups/:id — actualizar */
setupsRouter.put("/setups/:id", requireAuth, requireCanEdit, async (req, res: Response) => {
  const id = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  const parsed = SetupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  try {
    const result = await db.prepare("UPDATE setups SET nombre = ?, precio_usd = ? WHERE id = ?").run(nombre.trim(), precioUSD, id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Setup no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /setups/marketplace/setup-global — aplica setupUsd en bloque a todos los equipos marketplace con partes hashrate */
setupsRouter.put("/setups/marketplace/setup-global", requireAuth, requireCanEdit, async (req, res: Response) => {
  const parsed = SetupGlobalMarketplaceBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const setupUsd = parsed.data.setupUsd;
  try {
    const rows = (await db
      .prepare(
        `SELECT id, mp_hashrate_parts_json
         FROM equipos_asic
         WHERE mp_hashrate_parts_json IS NOT NULL AND TRIM(mp_hashrate_parts_json) <> ''`
      )
      .all()) as Array<{ id: string; mp_hashrate_parts_json: string | null }>;

    let updatedCount = 0;
    let skippedCount = 0;
    for (const row of rows) {
      const raw = String(row.mp_hashrate_parts_json ?? "").trim();
      if (!raw) {
        skippedCount++;
        continue;
      }
      try {
        const parts = JSON.parse(raw);
        if (!Array.isArray(parts) || parts.length === 0) {
          skippedCount++;
          continue;
        }
        const normalized = parts.map((x: unknown) => {
          const p = x as { sharePct?: unknown; warrantyPct?: unknown; setupUsd?: unknown };
          const sharePct = Number.isFinite(Number(p.sharePct)) ? Math.trunc(Number(p.sharePct)) : 0;
          const warrantyPct = Number.isFinite(Number(p.warrantyPct)) ? Math.trunc(Number(p.warrantyPct)) : sharePct;
          return { sharePct, warrantyPct, setupUsd };
        });
        await db.prepare("UPDATE equipos_asic SET mp_hashrate_parts_json = ? WHERE id = ?").run(JSON.stringify(normalized), row.id);
        updatedCount++;
      } catch {
        skippedCount++;
      }
    }
    const setupEquipoCompleto = await db
      .prepare(
        `UPDATE setups
         SET precio_usd = ?
         WHERE UPPER(TRIM(COALESCE(codigo, ''))) = 'S02'`
      )
      .run(setupUsd);

    const pinnedSetupHashrate = await db
      .prepare(
        `UPDATE setups
         SET precio_usd = 40
         WHERE UPPER(TRIM(COALESCE(codigo, ''))) = 'S03'
            OR LOWER(TRIM(COALESCE(nombre, ''))) LIKE '%setup compra hashrate%'`
      )
      .run();

    res.json({
      ok: true,
      setupUsd,
      updatedCount,
      skippedCount,
      setupEquipoCompletoUsd: setupUsd,
      setupEquipoCompletoCount: setupEquipoCompleto.changes ?? 0,
      hashratePinnedUsd: 40,
      hashratePinnedCount: pinnedSetupHashrate.changes ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /setups/:id — eliminar uno */
setupsRouter.delete("/setups/:id", requireAuth, requireCanEdit, async (req, res: Response) => {
  const id = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  try {
    const row = (await db.prepare("SELECT codigo, nombre FROM setups WHERE id = ?").get(id)) as
      | { codigo: string | null; nombre: string }
      | undefined;
    if (!row) return res.status(404).json({ error: { message: "Setup no encontrado" } });
    if (isSetupCompraHashrateProtected(row.codigo, row.nombre)) {
      return res.status(403).json({
        error: {
          message:
            "No se puede eliminar «Setup Compra Hashrate» (S03): lo usa la tienda para cotizaciones con fracción de hashrate.",
        },
      });
    }
    const result = await db.prepare("DELETE FROM setups WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Setup no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /setups — eliminar todos (conserva S03 / Setup Compra Hashrate para el marketplace) */
setupsRouter.delete("/setups", requireAuth, requireRole("admin_a", "admin_b"), async (_req, res: Response) => {
  try {
    const result = await db
      .prepare(
        `DELETE FROM setups WHERE NOT (
          UPPER(TRIM(COALESCE(codigo, ''))) = 'S03'
          OR LOWER(TRIM(nombre)) LIKE '%setup compra hashrate%'
        )`
      )
      .run();
    res.json({ ok: true, deletedCount: result.changes ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
