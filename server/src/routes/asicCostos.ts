import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireAnyModuleGrant, requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import { syncCotizadorPrecioToMarketplace, backfillLatestCotizadorPreciosToMarketplace, loadCotizadorMarketplaceCandidates, cotizacionPrecioPublicadoEnMarketplace } from "../lib/syncCotizadorPrecioToMarketplace.js";

export const asicCostosRouter = Router();
let asicCostosSchemaEnsured = false;

type CotizadorCatalogTipo = "marca" | "modelo" | "procesador";

const ASIC_COTIZADOR_SEED_MARCAS = ["Bitmain", "MicroBT", "Canaan", "Whatsminer"] as const;
const ASIC_COTIZADOR_SEED_MODELOS = ["S21", "S23", "L7", "L9", "L11", "Z15", "X9", "U3S21exPH"] as const;
const ASIC_COTIZADOR_SEED_PROCESADORES: Record<(typeof ASIC_COTIZADOR_SEED_MODELOS)[number], readonly string[]> = {
  S21: ["200 ths", "234 ths", "235 ths", "245 ths", "270 ths", "473 ths hydro"],
  S23: ["305 ths"],
  L7: ["8800 mhs", "9050 mhs", "9500 mhs"],
  L9: ["15.000 mhs", "16.000 mhs", "16.500 mhs", "17.000 mhs"],
  L11: ["20.000 mhs", "21.000 mhs", "32.000 mhs hydro"],
  Z15: ["840 kSol/s", "860 kSol/s"],
  X9: ["1.000K"],
  U3S21exPH: ["860 ths hydro", "H 860 ths"],
};

function normalizeCatalogValor(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function catalogParentKey(tipo: CotizadorCatalogTipo, parentRaw: string | null | undefined): string {
  if (tipo !== "procesador") return "";
  return normalizeCatalogValor(parentRaw ?? "");
}

async function seedAsicCotizadorCatalogoIfEmpty(): Promise<void> {
  const countRow = (await db.prepare("SELECT COUNT(*) AS c FROM asic_cotizador_catalogo").get()) as
    | { c?: number | string }
    | undefined;
  const count = Number(countRow?.c ?? 0);
  if (Number.isFinite(count) && count > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO asic_cotizador_catalogo (tipo, parent_key, valor, created_at)
     VALUES (?, ?, ?, ?)`
  );

  for (const marca of ASIC_COTIZADOR_SEED_MARCAS) {
    await insert.run("marca", "", marca, now);
  }
  for (const modelo of ASIC_COTIZADOR_SEED_MODELOS) {
    await insert.run("modelo", "", modelo, now);
    for (const proc of ASIC_COTIZADOR_SEED_PROCESADORES[modelo]) {
      await insert.run("procesador", modelo, proc, now);
    }
  }
}

async function ensureAsicCostosSchema(): Promise<void> {
  if (asicCostosSchemaEnsured) return;

  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_costos_equipos (
          id BIGSERIAL PRIMARY KEY,
          created_at TEXT NOT NULL,
          marca TEXT NOT NULL,
          modelo TEXT NOT NULL,
          procesador TEXT NOT NULL,
          precio_origen DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          coeficiente DOUBLE PRECISION NOT NULL DEFAULT 0,
          proveedor_py DOUBLE PRECISION NOT NULL DEFAULT 0,
          margen_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          total_nacionalizado DOUBLE PRECISION NOT NULL DEFAULT 0,
          precio_venta DOUBLE PRECISION NOT NULL DEFAULT 0,
          pct_margen DOUBLE PRECISION NOT NULL DEFAULT 0,
          observaciones TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_asic_costos_equipos_created ON asic_costos_equipos(created_at DESC, id DESC)")
      .run();
    await db
      .prepare(`ALTER TABLE asic_costos_equipos ADD COLUMN IF NOT EXISTS observaciones TEXT NOT NULL DEFAULT ''`)
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_cotizador_catalogo (
          id BIGSERIAL PRIMARY KEY,
          tipo TEXT NOT NULL,
          parent_key TEXT NOT NULL DEFAULT '',
          valor TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_asic_cotizador_catalogo_tipo_parent_valor
         ON asic_cotizador_catalogo (tipo, parent_key, LOWER(valor))`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_asic_cotizador_catalogo_tipo_parent
         ON asic_cotizador_catalogo (tipo, parent_key, valor)`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_costos_equipos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          marca TEXT NOT NULL,
          modelo TEXT NOT NULL,
          procesador TEXT NOT NULL,
          precio_origen REAL NOT NULL DEFAULT 0,
          monto_usd REAL NOT NULL DEFAULT 0,
          coeficiente REAL NOT NULL DEFAULT 0,
          proveedor_py REAL NOT NULL DEFAULT 0,
          margen_usd REAL NOT NULL DEFAULT 0,
          total_nacionalizado REAL NOT NULL DEFAULT 0,
          precio_venta REAL NOT NULL DEFAULT 0,
          pct_margen REAL NOT NULL DEFAULT 0,
          observaciones TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_asic_costos_equipos_created ON asic_costos_equipos(created_at DESC, id DESC)")
      .run();
    await db
      .prepare(`ALTER TABLE asic_costos_equipos ADD COLUMN IF NOT EXISTS observaciones TEXT NOT NULL DEFAULT ''`)
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_cotizador_catalogo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL,
          parent_key TEXT NOT NULL DEFAULT '',
          valor TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_asic_cotizador_catalogo_tipo_parent_valor
         ON asic_cotizador_catalogo (tipo, parent_key, valor COLLATE NOCASE)`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_asic_cotizador_catalogo_tipo_parent
         ON asic_cotizador_catalogo (tipo, parent_key, valor)`
      )
      .run();
  }

  await seedAsicCotizadorCatalogoIfEmpty();
  asicCostosSchemaEnsured = true;
}

const AsicCostoPayloadSchema = z.object({
  marca: z.string().trim().max(120).optional(),
  modelo: z.string().trim().max(120).optional(),
  procesador: z.string().trim().max(120).optional(),
  observaciones: z.string().trim().max(2000).optional(),
  precioOrigen: z.coerce.number().min(0),
  montoUsd: z.coerce.number().min(0),
  coeficiente: z.coerce.number().min(0),
  proveedorPy: z.coerce.number().min(0),
  margenUsd: z.coerce.number().min(0),
  totalNacionalizado: z.coerce.number().min(0),
  precioVenta: z.coerce.number().min(0),
  pctMargen: z.coerce.number().min(0),
});

type AsicCostoRow = {
  id: number;
  created_at: string;
  marca: string;
  modelo: string;
  procesador: string;
  observaciones?: string;
  precio_origen: number;
  monto_usd: number;
  coeficiente: number;
  proveedor_py: number;
  margen_usd: number;
  total_nacionalizado: number;
  precio_venta: number;
  pct_margen: number;
};

function mapAsicCostoRow(
  raw: Record<string, unknown>,
  marketplace?: ReturnType<typeof cotizacionPrecioPublicadoEnMarketplace>
) {
  const r = rowKeysToLowercase(raw);
  const base = {
    id: Number(r.id ?? 0),
    createdAt: String(r.created_at ?? ""),
    marca: String(r.marca ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    observaciones: String(r.observaciones ?? ""),
    precioOrigen: Number(r.precio_origen ?? 0),
    montoUsd: Number(r.monto_usd ?? 0),
    coeficiente: Number(r.coeficiente ?? 0),
    proveedorPy: Number(r.proveedor_py ?? 0),
    margenUsd: Number(r.margen_usd ?? 0),
    totalNacionalizado: Number(r.total_nacionalizado ?? 0),
    precioVenta: Number(r.precio_venta ?? 0),
    pctMargen: Number(r.pct_margen ?? 0),
  };
  if (!marketplace) return base;
  return {
    ...base,
    marketplacePublished: marketplace.marketplacePublished,
    marketplacePrecioUsd: marketplace.marketplacePrecioUsd ?? null,
    marketplaceLabel: marketplace.marketplaceLabel ?? null,
  };
}

asicCostosRouter.get(
  "/asic/costos-equipos",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("finanzas_asic_costos"),
  async (_req, res) => {
    await ensureAsicCostosSchema();
    const rows = (await db
      .prepare(
        `SELECT id, created_at, marca, modelo, procesador, observaciones, precio_origen, monto_usd, coeficiente, proveedor_py,
                margen_usd, total_nacionalizado, precio_venta, pct_margen
         FROM asic_costos_equipos
         ORDER BY created_at DESC, id DESC`
      )
      .all()) as AsicCostoRow[];
    let mpRows: Awaited<ReturnType<typeof loadCotizadorMarketplaceCandidates>> = [];
    try {
      mpRows = await loadCotizadorMarketplaceCandidates();
    } catch (e) {
      console.warn("[GET /asic/costos-equipos] marketplace candidates:", e);
    }
    res.json({
      items: rows.map((x) => {
        const raw = x as unknown as Record<string, unknown>;
        const mappedBase = mapAsicCostoRow(raw);
        const pub = cotizacionPrecioPublicadoEnMarketplace(
          {
            marca: mappedBase.marca,
            modelo: mappedBase.modelo,
            procesador: mappedBase.procesador,
            precioVenta: mappedBase.precioVenta,
          },
          mpRows
        );
        return mapAsicCostoRow(raw, pub);
      }),
    });
  }
);

asicCostosRouter.post(
  "/asic/costos-equipos",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_asic_costos"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    const parsed = AsicCostoPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para registrar costo ASIC." } });
    }
    const d = parsed.data;
    const createdAt = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT INTO asic_costos_equipos (
          created_at, marca, modelo, procesador, observaciones, precio_origen, monto_usd, coeficiente, proveedor_py,
          margen_usd, total_nacionalizado, precio_venta, pct_margen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        createdAt,
        d.marca?.trim() || "",
        d.modelo?.trim() || "",
        d.procesador?.trim() || "",
        d.observaciones?.trim() || "",
        d.precioOrigen,
        d.montoUsd,
        d.coeficiente,
        d.proveedorPy,
        d.margenUsd,
        d.totalNacionalizado,
        d.precioVenta,
        d.pctMargen
      );

    const insertedId = Number(result.lastInsertRowid ?? 0);
    const inserted = (await db
      .prepare(
        `SELECT id, created_at, marca, modelo, procesador, observaciones, precio_origen, monto_usd, coeficiente, proveedor_py,
                margen_usd, total_nacionalizado, precio_venta, pct_margen
         FROM asic_costos_equipos
         WHERE id = ?`
      )
      .get(insertedId)) as AsicCostoRow | undefined;

    let marketplaceSync: Awaited<ReturnType<typeof syncCotizadorPrecioToMarketplace>> | null = null;
    try {
      if (req.user) {
        marketplaceSync = await syncCotizadorPrecioToMarketplace({
          marca: d.marca?.trim() || "",
          modelo: d.modelo?.trim() || "",
          procesador: d.procesador?.trim() || "",
          precioVenta: d.precioVenta,
          user: req.user,
        });
      }
    } catch (syncErr) {
      console.warn("[POST /asic/costos-equipos] sync marketplace:", syncErr);
      marketplaceSync = {
        status: "skipped",
        message: "Cotización guardada; no se pudo sincronizar el precio de marketplace.",
      };
    }

    let itemOut: ReturnType<typeof mapAsicCostoRow> | null = null;
    if (inserted) {
      const raw = inserted as unknown as Record<string, unknown>;
      const mapped = mapAsicCostoRow(raw);
      let mpRows: Awaited<ReturnType<typeof loadCotizadorMarketplaceCandidates>> = [];
      try {
        mpRows = await loadCotizadorMarketplaceCandidates();
      } catch {
        /* ignore */
      }
      const pub = cotizacionPrecioPublicadoEnMarketplace(
        {
          marca: mapped.marca,
          modelo: mapped.modelo,
          procesador: mapped.procesador,
          precioVenta: mapped.precioVenta,
        },
        mpRows
      );
      itemOut = mapAsicCostoRow(raw, pub);
    }

    res.status(201).json({
      ok: true,
      item: itemOut,
      marketplaceSync,
    });
  }
);

asicCostosRouter.post(
  "/asic/costos-equipos/sync-marketplace",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_asic_costos"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    if (!req.user) {
      return res.status(401).json({ error: { message: "No autenticado" } });
    }
    try {
      const result = await backfillLatestCotizadorPreciosToMarketplace(req.user);
      res.json({
        ok: true,
        updated: result.updated,
        unchanged: result.unchanged,
        skipped: result.skipped,
        details: result.details.filter((d) => d.status === "updated" || d.status === "unchanged"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg } });
    }
  }
);

asicCostosRouter.delete(
  "/asic/costos-equipos/:id",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("finanzas_asic_costos"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: "Invalid id" } });
    }
    const info = await db.prepare("DELETE FROM asic_costos_equipos WHERE id = ?").run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: { message: "Registro no encontrado" } });
    }
    return res.status(204).send();
  }
);

const CotizadorCatalogTipoSchema = z.enum(["marca", "modelo", "procesador"]);

const CotizadorCatalogCreateSchema = z.object({
  tipo: CotizadorCatalogTipoSchema,
  valor: z.string().trim().min(1).max(120),
  parent: z.string().trim().max(120).optional(),
});

const CotizadorCatalogUpdateSchema = z.object({
  valor: z.string().trim().min(1).max(120),
});

type CotizadorCatalogRow = {
  id: number;
  tipo: string;
  parent_key: string;
  valor: string;
  created_at: string;
};

function mapCatalogRow(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    tipo: String(r.tipo ?? "") as CotizadorCatalogTipo,
    parent: String(r.parent_key ?? ""),
    valor: String(r.valor ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

asicCostosRouter.get(
  "/asic/cotizador-catalogo",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireAnyModuleGrant("finanzas_asic_costos", "garantias"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    const tipoParsed = CotizadorCatalogTipoSchema.safeParse(String(req.query.tipo ?? "").trim());
    if (!tipoParsed.success) {
      return res.status(400).json({ error: { message: "tipo inválido (marca | modelo | procesador)." } });
    }
    const tipo = tipoParsed.data;
    const parent = catalogParentKey(tipo, String(req.query.parent ?? ""));
    if (tipo === "procesador" && !parent) {
      return res.json({ items: [] });
    }

    const rows = (await db
      .prepare(
        `SELECT id, tipo, parent_key, valor, created_at
         FROM asic_cotizador_catalogo
         WHERE tipo = ? AND parent_key = ?
         ORDER BY valor ASC, id ASC`
      )
      .all(tipo, parent)) as CotizadorCatalogRow[];

    const items = rows
      .map((x) => mapCatalogRow(x as unknown as Record<string, unknown>))
      .sort((a, b) => a.valor.localeCompare(b.valor, "es", { sensitivity: "base" }));
    res.json({ items });
  }
);

asicCostosRouter.post(
  "/asic/cotizador-catalogo",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_asic_costos"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    const parsed = CotizadorCatalogCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para el catálogo del cotizador." } });
    }
    const tipo = parsed.data.tipo;
    const valor = normalizeCatalogValor(parsed.data.valor);
    const parent = catalogParentKey(tipo, parsed.data.parent);
    if (!valor) {
      return res.status(400).json({ error: { message: "El valor no puede estar vacío." } });
    }
    if (tipo === "procesador" && !parent) {
      return res.status(400).json({ error: { message: "Para procesador indicá el modelo (parent)." } });
    }

    const existing = (await db
      .prepare(
        `SELECT id, tipo, parent_key, valor, created_at
         FROM asic_cotizador_catalogo
         WHERE tipo = ? AND parent_key = ? AND LOWER(valor) = LOWER(?)
         LIMIT 1`
      )
      .get(tipo, parent, valor)) as CotizadorCatalogRow | undefined;
    if (existing) {
      return res.json({ ok: true, item: mapCatalogRow(existing as unknown as Record<string, unknown>), created: false });
    }

    const createdAt = new Date().toISOString();
    try {
      const result = await db
        .prepare(
          `INSERT INTO asic_cotizador_catalogo (tipo, parent_key, valor, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(tipo, parent, valor, createdAt);
      const insertedId = Number(result.lastInsertRowid ?? 0);
      const inserted = (await db
        .prepare(
          `SELECT id, tipo, parent_key, valor, created_at
           FROM asic_cotizador_catalogo
           WHERE id = ?`
        )
        .get(insertedId)) as CotizadorCatalogRow | undefined;
      return res.status(201).json({
        ok: true,
        item: inserted ? mapCatalogRow(inserted as unknown as Record<string, unknown>) : { id: insertedId, tipo, parent, valor, createdAt },
        created: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) {
        const again = (await db
          .prepare(
            `SELECT id, tipo, parent_key, valor, created_at
             FROM asic_cotizador_catalogo
             WHERE tipo = ? AND parent_key = ? AND LOWER(valor) = LOWER(?)
             LIMIT 1`
          )
          .get(tipo, parent, valor)) as CotizadorCatalogRow | undefined;
        if (again) {
          return res.json({ ok: true, item: mapCatalogRow(again as unknown as Record<string, unknown>), created: false });
        }
      }
      console.error("[asic] POST /asic/cotizador-catalogo", e);
      return res.status(500).json({ error: { message: "No se pudo guardar la opción del catálogo." } });
    }
  }
);

asicCostosRouter.patch(
  "/asic/cotizador-catalogo/:id",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_asic_costos"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "id inválido." } });
    }
    const parsed = CotizadorCatalogUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para editar el catálogo." } });
    }
    const nuevoValor = normalizeCatalogValor(parsed.data.valor);
    if (!nuevoValor) {
      return res.status(400).json({ error: { message: "El valor no puede estar vacío." } });
    }

    const existing = (await db
      .prepare(
        `SELECT id, tipo, parent_key, valor, created_at
         FROM asic_cotizador_catalogo
         WHERE id = ?`
      )
      .get(id)) as CotizadorCatalogRow | undefined;
    if (!existing) {
      return res.status(404).json({ error: { message: "Opción no encontrada en el catálogo." } });
    }

    const tipo = String(existing.tipo ?? "") as CotizadorCatalogTipo;
    const parent = String(existing.parent_key ?? "");
    const valorAnterior = normalizeCatalogValor(String(existing.valor ?? ""));

    if (valorAnterior.localeCompare(nuevoValor, "es", { sensitivity: "accent" }) === 0) {
      return res.json({
        ok: true,
        item: mapCatalogRow(existing as unknown as Record<string, unknown>),
        changed: false,
      });
    }

    const conflict = (await db
      .prepare(
        `SELECT id
         FROM asic_cotizador_catalogo
         WHERE tipo = ? AND parent_key = ? AND LOWER(valor) = LOWER(?) AND id <> ?
         LIMIT 1`
      )
      .get(tipo, parent, nuevoValor, id)) as { id?: number } | undefined;
    if (conflict?.id) {
      return res.status(409).json({
        error: { message: `Ya existe «${nuevoValor}» en este catálogo.` },
      });
    }

    try {
      await db.prepare(`UPDATE asic_cotizador_catalogo SET valor = ? WHERE id = ?`).run(nuevoValor, id);

      // Si se renombra un modelo, los procesadores cuelgan de parent_key = modelo.
      if (tipo === "modelo" && valorAnterior) {
        await db
          .prepare(
            `UPDATE asic_cotizador_catalogo
             SET parent_key = ?
             WHERE tipo = 'procesador' AND parent_key = ?`
          )
          .run(nuevoValor, valorAnterior);
      }

      const updated = (await db
        .prepare(
          `SELECT id, tipo, parent_key, valor, created_at
           FROM asic_cotizador_catalogo
           WHERE id = ?`
        )
        .get(id)) as CotizadorCatalogRow | undefined;

      return res.json({
        ok: true,
        item: updated
          ? mapCatalogRow(updated as unknown as Record<string, unknown>)
          : { id, tipo, parent, valor: nuevoValor, createdAt: String(existing.created_at ?? "") },
        changed: true,
        previousValor: valorAnterior,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) {
        return res.status(409).json({
          error: { message: `Ya existe «${nuevoValor}» en este catálogo.` },
        });
      }
      console.error("[asic] PATCH /asic/cotizador-catalogo/:id", e);
      return res.status(500).json({ error: { message: "No se pudo editar la opción del catálogo." } });
    }
  }
);

