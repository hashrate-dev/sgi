import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { grantsIncludeScreen } from "../lib/sgiScreenGrants.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

/**
 * Seguimiento de un pedido de máquinas ASIC.
 * El orden de las etapas es el proceso real: contrato → cobro → dinero → pedido →
 * pago → envío → aduana → Ayolas → instalación.
 * Mantener las claves alineadas con client/src/lib/asicPedidoFlow.ts.
 */
export const ASIC_PEDIDO_STAGE_KEYS = [
  "contrato",
  "documentos",
  "dinero",
  "pedido",
  "pago_proveedor",
  "envio",
  "aduana_llegada",
  "aduana_salida",
  "camino_ayolas",
  "llegada_dc",
  "instalado",
] as const;

export type AsicPedidoStageKey = (typeof ASIC_PEDIDO_STAGE_KEYS)[number];

const ADUANA_KEYS = new Set<AsicPedidoStageKey>(["aduana_llegada", "aduana_salida"]);

type StageStatus = "done" | "skipped";

type StageState = {
  status: StageStatus;
  fecha: string;
  notas: string;
  modoCobro?: "factura_recibo" | "comprobante_previo";
  numeroFactura?: string;
  numeroRecibo?: string;
  numeroComprobante?: string;
  titularFactura?: string;
  medioDinero?: "banco_py" | "banco_uy" | "binance";
  referencia?: string;
  montoUsd?: number | null;
};

type StagesMap = Partial<Record<AsicPedidoStageKey, StageState>>;

type PedidoRow = {
  id: number;
  cliente: string;
  clientId: number | null;
  origen: "china" | "paraguay";
  marca: string;
  equipo: string;
  procesador: string;
  cantidad: number;
  vendedor: string;
  tieneComision: boolean;
  comisionUsd: number | null;
  aduanaAplica: boolean;
  notas: string;
  facturaId: number | null;
  facturaNumero: string;
  facturaTitular: string;
  etapas: StagesMap;
  etapaActual: AsicPedidoStageKey | "completo";
  createdAt: string;
  updatedAt: string;
};

const fechaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const CreateSchema = z.object({
  cliente: z.string().trim().min(1).max(200),
  clientId: z.coerce.number().int().positive().optional(),
  origen: z.enum(["china", "paraguay"]),
  marca: z.string().trim().min(1).max(120),
  equipo: z.string().trim().min(1).max(200),
  procesador: z.string().trim().min(1).max(120),
  cantidad: z.coerce.number().int().min(1).max(500),
  vendedor: z.string().trim().min(1).max(200),
  tieneComision: z.boolean(),
  comisionUsd: z.coerce.number().finite().min(0).max(100_000_000).optional(),
  fechaContrato: fechaSchema,
  contratoRef: z.string().trim().max(120).optional().default(""),
  notas: z.string().trim().max(2000).optional().default(""),
  aduanaAplica: z.boolean().optional(),
});

const PatchSchema = z.object({
  cliente: z.string().trim().min(1).max(200).optional(),
  equipo: z.string().trim().min(1).max(200).optional(),
  cantidad: z.coerce.number().int().min(1).max(500).optional(),
  notas: z.string().trim().max(2000).optional(),
  aduanaAplica: z.boolean().optional(),
  facturaNumero: z.string().trim().max(80).optional(),
  facturaId: z.number().int().positive().nullable().optional(),
  facturaTitular: z.string().trim().max(200).optional(),
});

const ConfirmSchema = z.object({
  fecha: fechaSchema.optional(),
  notas: z.string().trim().max(2000).optional().default(""),
  modoCobro: z.enum(["factura_recibo", "comprobante_previo"]).optional(),
  numeroFactura: z.string().trim().max(80).optional().default(""),
  numeroRecibo: z.string().trim().max(80).optional().default(""),
  numeroComprobante: z.string().trim().max(80).optional().default(""),
  titularFactura: z.string().trim().max(200).optional().default(""),
  medioDinero: z.enum(["banco_py", "banco_uy", "binance"]).optional(),
  referencia: z.string().trim().max(200).optional().default(""),
  montoUsd: z.coerce.number().finite().min(0).max(100_000_000).optional(),
  saltarAduana: z.boolean().optional(),
});

export const asicPedidosRouter = Router();

let schemaEnsured = false;

function nowSql(): string {
  return db.isPostgres ? "NOW()" : "datetime('now')";
}

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_pedidos (
          id BIGSERIAL PRIMARY KEY,
          cliente TEXT NOT NULL,
          origen TEXT NOT NULL,
          equipo TEXT NOT NULL,
          cantidad INTEGER NOT NULL DEFAULT 1,
          aduana_aplica INTEGER NOT NULL DEFAULT 1,
          notas TEXT NOT NULL DEFAULT '',
          etapas_json TEXT NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_pedidos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente TEXT NOT NULL,
          origen TEXT NOT NULL,
          equipo TEXT NOT NULL,
          cantidad INTEGER NOT NULL DEFAULT 1,
          aduana_aplica INTEGER NOT NULL DEFAULT 1,
          notas TEXT NOT NULL DEFAULT '',
          etapas_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_asic_pedidos_updated ON asic_pedidos(updated_at DESC, id DESC)").run();
  const alters = db.isPostgres
    ? [
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS client_id BIGINT",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS marca TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS procesador TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS vendedor TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS tiene_comision INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS comision_usd DOUBLE PRECISION",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS factura_id BIGINT",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS factura_numero TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN IF NOT EXISTS factura_titular TEXT NOT NULL DEFAULT ''",
      ]
    : [
        "ALTER TABLE asic_pedidos ADD COLUMN client_id INTEGER",
        "ALTER TABLE asic_pedidos ADD COLUMN marca TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN procesador TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN vendedor TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN tiene_comision INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE asic_pedidos ADD COLUMN comision_usd REAL",
        "ALTER TABLE asic_pedidos ADD COLUMN factura_id INTEGER",
        "ALTER TABLE asic_pedidos ADD COLUMN factura_numero TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE asic_pedidos ADD COLUMN factura_titular TEXT NOT NULL DEFAULT ''",
      ];
  for (const sql of alters) {
    try {
      await db.prepare(sql).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column/i.test(msg) && !/already exists/i.test(msg)) throw e;
    }
  }
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_pedido_catalogo (
          id BIGSERIAL PRIMARY KEY,
          tipo TEXT NOT NULL,
          nombre TEXT NOT NULL,
          nombre_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_pedido_catalogo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL,
          nombre TEXT NOT NULL,
          nombre_key TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
  await db
    .prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_asic_pedido_catalogo_tipo_key ON asic_pedido_catalogo(tipo, nombre_key)")
    .run();
  schemaEnsured = true;
}

type CatalogTipo = "vendedor" | "contrato_ref";

function catalogKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCatalogName(raw: string): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

function isCatalogTipo(value: string): value is CatalogTipo {
  return value === "vendedor" || value === "contrato_ref";
}

function isStageKey(value: string): value is AsicPedidoStageKey {
  return (ASIC_PEDIDO_STAGE_KEYS as readonly string[]).includes(value);
}

function parseStages(raw: unknown): StagesMap {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: StagesMap = {};
    for (const key of ASIC_PEDIDO_STAGE_KEYS) {
      const item = (parsed as Record<string, unknown>)[key];
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const status = row.status === "skipped" ? "skipped" : row.status === "done" ? "done" : null;
      if (!status) continue;
      const monto = row.montoUsd == null || row.montoUsd === "" ? null : Number(row.montoUsd);
      out[key] = {
        status,
        fecha: String(row.fecha ?? ""),
        notas: String(row.notas ?? ""),
        ...(row.modoCobro === "factura_recibo" || row.modoCobro === "comprobante_previo"
          ? { modoCobro: row.modoCobro }
          : {}),
        ...(row.numeroFactura ? { numeroFactura: String(row.numeroFactura) } : {}),
        ...(row.numeroRecibo ? { numeroRecibo: String(row.numeroRecibo) } : {}),
        ...(row.numeroComprobante ? { numeroComprobante: String(row.numeroComprobante) } : {}),
        ...(row.titularFactura ? { titularFactura: String(row.titularFactura) } : {}),
        ...(row.medioDinero === "banco_py" || row.medioDinero === "banco_uy" || row.medioDinero === "binance"
          ? { medioDinero: row.medioDinero }
          : {}),
        ...(row.referencia ? { referencia: String(row.referencia) } : {}),
        ...(monto != null && Number.isFinite(monto) ? { montoUsd: monto } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function etapaActual(origenAduana: boolean, etapas: StagesMap): AsicPedidoStageKey | "completo" {
  for (const key of ASIC_PEDIDO_STAGE_KEYS) {
    if (!origenAduana && ADUANA_KEYS.has(key)) continue;
    if (etapas[key]?.status !== "done") return key;
  }
  return "completo";
}

function mapPedido(raw: Record<string, unknown>): PedidoRow {
  const r = rowKeysToLowercase(raw);
  const origen = String(r.origen ?? "") === "paraguay" ? "paraguay" : "china";
  const aduanaAplica = Number(r.aduana_aplica ?? 1) !== 0;
  const etapas = parseStages(r.etapas_json);
  const clientIdRaw = Number(r.client_id ?? 0);
  const comisionRaw = r.comision_usd == null || r.comision_usd === "" ? null : Number(r.comision_usd);
  return {
    id: Number(r.id ?? 0),
    cliente: String(r.cliente ?? ""),
    clientId: Number.isFinite(clientIdRaw) && clientIdRaw > 0 ? clientIdRaw : null,
    origen,
    marca: String(r.marca ?? ""),
    equipo: String(r.equipo ?? ""),
    procesador: String(r.procesador ?? ""),
    cantidad: Number(r.cantidad ?? 1) || 1,
    vendedor: String(r.vendedor ?? ""),
    tieneComision: Number(r.tiene_comision ?? 0) === 1,
    comisionUsd: comisionRaw != null && Number.isFinite(comisionRaw) ? comisionRaw : null,
    aduanaAplica,
    notas: String(r.notas ?? ""),
    facturaId: Number.isFinite(Number(r.factura_id)) && Number(r.factura_id) > 0 ? Number(r.factura_id) : null,
    facturaNumero: String(r.factura_numero ?? ""),
    facturaTitular: String(r.factura_titular ?? ""),
    etapas,
    etapaActual: etapaActual(aduanaAplica, etapas),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function applicableKeys(aduanaAplica: boolean): AsicPedidoStageKey[] {
  return ASIC_PEDIDO_STAGE_KEYS.filter((key) => aduanaAplica || !ADUANA_KEYS.has(key));
}

function requireAsicPedido(write: boolean) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: { message: "No autenticado" } });
      return;
    }
    if (u.role === "admin_a") {
      next();
      return;
    }
    if (write && u.role === "lector") {
      res.status(403).json({ error: { message: "El seguimiento de pedidos ASIC es de solo lectura para esta cuenta." } });
      return;
    }
    const grants = u.role === "lector" ? u.lector_grants : u.admin_b_grants;
    if (
      (u.role === "lector" || u.role === "admin_b" || u.role === "operador") &&
      grantsIncludeScreen(grants ?? null, "asic-pedidos")
    ) {
      next();
      return;
    }
    res.status(403).json({ error: { message: "No tenés permiso para el seguimiento de pedidos ASIC." } });
  };
}

const readMw = [requireRole("admin_a", "admin_b", "operador", "lector"), requireAsicPedido(false)] as const;
const writeMw = [requireRole("admin_a", "admin_b", "operador"), requireAsicPedido(true)] as const;

async function loadPedido(id: number): Promise<PedidoRow | null> {
  const raw = (await db.prepare("SELECT * FROM asic_pedidos WHERE id = ?").get(id)) as Record<string, unknown> | undefined;
  if (!raw) return null;
  return mapPedido(raw);
}

function isoDate(raw: string): string {
  const text = String(raw ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso?.[1] && iso[2] && iso[3]) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (dmy?.[1] && dmy[2] && dmy[3]) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const now = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}

/** Cuando se emite el recibo de una factura ya conectada al pedido, cierra la etapa de documentos. */
export async function attachAsicPedidoReceipt(opts: {
  facturaNumber: string;
  reciboNumber: string;
  reciboDate: string;
  titular?: string;
}): Promise<void> {
  const facturaNumber = String(opts.facturaNumber ?? "").trim();
  const reciboNumber = String(opts.reciboNumber ?? "").trim();
  if (!facturaNumber || !reciboNumber) return;
  await ensureSchema();
  const rows = (await db
    .prepare("SELECT id FROM asic_pedidos WHERE upper(factura_numero) = upper(?)")
    .all(facturaNumber)) as Array<{ id?: number }>;
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const pedido = await loadPedido(id);
    if (!pedido || pedido.etapaActual !== "documentos" || pedido.etapas.documentos?.status === "done") continue;
    const etapas: StagesMap = {
      ...pedido.etapas,
      documentos: {
        status: "done",
        fecha: isoDate(opts.reciboDate),
        notas: "",
        modoCobro: "factura_recibo",
        numeroFactura: pedido.facturaNumero || facturaNumber,
        numeroRecibo: reciboNumber,
        ...(pedido.facturaTitular || opts.titular
          ? { titularFactura: pedido.facturaTitular || String(opts.titular ?? "") }
          : {}),
      },
    };
    await saveStages(id, etapas);
  }
}

async function saveStages(id: number, etapas: StagesMap, aduanaAplica?: boolean): Promise<void> {
  const ts = nowSql();
  if (aduanaAplica == null) {
    await db
      .prepare(`UPDATE asic_pedidos SET etapas_json = ?, updated_at = ${ts} WHERE id = ?`)
      .run(JSON.stringify(etapas), id);
    return;
  }
  await db
    .prepare(`UPDATE asic_pedidos SET etapas_json = ?, aduana_aplica = ?, updated_at = ${ts} WHERE id = ?`)
    .run(JSON.stringify(etapas), aduanaAplica ? 1 : 0, id);
}

function validateStage(key: AsicPedidoStageKey, body: z.infer<typeof ConfirmSchema>): { ok: true; state: StageState } | { ok: false; message: string } {
  const fecha = body.fecha ?? "";
  if (!fecha) return { ok: false, message: "Indicá la fecha de esta etapa." };
  const base: StageState = { status: "done", fecha, notas: body.notas ?? "" };
  if (body.referencia) base.referencia = body.referencia;
  if (body.montoUsd != null) base.montoUsd = body.montoUsd;

  if (key === "documentos") {
    if (body.modoCobro === "factura_recibo") {
      if (!body.numeroFactura || !body.numeroRecibo) {
        return { ok: false, message: "Para factura crédito cargá el número de factura y el número de recibo." };
      }
      base.modoCobro = "factura_recibo";
      base.numeroFactura = body.numeroFactura;
      base.numeroRecibo = body.numeroRecibo;
      if (body.titularFactura) base.titularFactura = body.titularFactura;
      return { ok: true, state: base };
    }
    if (body.modoCobro === "comprobante_previo") {
      if (!body.numeroComprobante) {
        return { ok: false, message: "Cargá el número del comprobante de pago." };
      }
      base.modoCobro = "comprobante_previo";
      base.numeroComprobante = body.numeroComprobante;
      if (body.titularFactura) base.titularFactura = body.titularFactura;
      return { ok: true, state: base };
    }
    return { ok: false, message: "Elegí factura crédito + recibo, o comprobante de pago previo." };
  }

  if (key === "dinero") {
    if (!body.medioDinero) return { ok: false, message: "Elegí dónde se recibió el dinero." };
    base.medioDinero = body.medioDinero;
    return { ok: true, state: base };
  }

  if (key === "pedido" || key === "pago_proveedor") {
    if (!body.referencia) return { ok: false, message: "Cargá la referencia de esta etapa." };
    return { ok: true, state: base };
  }

  return { ok: true, state: base };
}

asicPedidosRouter.get("/asic-pedidos", ...readMw, async (_req, res, next) => {
  try {
    await ensureSchema();
    const rows = (await db
      .prepare("SELECT * FROM asic_pedidos ORDER BY updated_at DESC, id DESC LIMIT 500")
      .all()) as Record<string, unknown>[];
    res.json({ pedidos: rows.map(mapPedido) });
  } catch (e) {
    next(e);
  }
});

async function catalogNames(tipo: CatalogTipo): Promise<string[]> {
  const saved = (await db
    .prepare("SELECT nombre FROM asic_pedido_catalogo WHERE tipo = ? ORDER BY nombre ASC")
    .all(tipo)) as Array<{ nombre?: string }>;
  const rows = (await db.prepare("SELECT vendedor, etapas_json FROM asic_pedidos").all()) as Array<{
    vendedor?: string;
    etapas_json?: string;
  }>;
  const map = new Map<string, string>();
  const add = (raw: unknown) => {
    const nombre = cleanCatalogName(String(raw ?? ""));
    const key = catalogKey(nombre);
    if (!key || map.has(key)) return;
    map.set(key, nombre);
  };
  for (const row of saved) add(row.nombre);
  for (const row of rows) {
    if (tipo === "vendedor") add(row.vendedor);
    else {
      try {
        const etapas = JSON.parse(String(row.etapas_json ?? "{}")) as { contrato?: { referencia?: string } };
        add(etapas.contrato?.referencia);
      } catch {
        /* el pedido sigue aunque la etapa no se pueda leer */
      }
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

asicPedidosRouter.get("/asic-pedidos/catalogo", ...readMw, async (_req, res, next) => {
  try {
    await ensureSchema();
    const [vendedores, contratoRefs] = await Promise.all([catalogNames("vendedor"), catalogNames("contrato_ref")]);
    res.json({ vendedores, contratoRefs });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.post("/asic-pedidos/catalogo", ...writeMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const parsed = z
      .object({
        tipo: z.enum(["vendedor", "contrato_ref"]),
        nombre: z.string().trim().min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success || !isCatalogTipo(parsed.data.tipo)) {
      res.status(400).json({ error: { message: "Indicá el nombre para guardarlo." } });
      return;
    }
    const nombre = cleanCatalogName(parsed.data.nombre);
    const key = catalogKey(nombre);
    if (!key) {
      res.status(400).json({ error: { message: "Indicá el nombre para guardarlo." } });
      return;
    }
    const existing = (await db
      .prepare("SELECT nombre FROM asic_pedido_catalogo WHERE tipo = ? AND nombre_key = ?")
      .get(parsed.data.tipo, key)) as { nombre?: string } | undefined;
    if (existing?.nombre) {
      res.json({ nombre: cleanCatalogName(existing.nombre), alreadyExists: true });
      return;
    }
    try {
      await db
        .prepare(`INSERT INTO asic_pedido_catalogo (tipo, nombre, nombre_key, created_at) VALUES (?, ?, ?, ${nowSql()})`)
        .run(parsed.data.tipo, nombre, key);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique/i.test(msg)) throw e;
      const again = (await db
        .prepare("SELECT nombre FROM asic_pedido_catalogo WHERE tipo = ? AND nombre_key = ?")
        .get(parsed.data.tipo, key)) as { nombre?: string } | undefined;
      res.json({ nombre: cleanCatalogName(again?.nombre || nombre), alreadyExists: true });
      return;
    }
    res.status(201).json({ nombre, alreadyExists: false });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.get("/asic-pedidos/:id", ...readMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: { message: "Pedido inválido." } });
      return;
    }
    const pedido = await loadPedido(id);
    if (!pedido) {
      res.status(404).json({ error: { message: "No se encontró el pedido." } });
      return;
    }
    res.json({ pedido });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.post("/asic-pedidos", ...writeMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Completá cliente, marca, equipo, procesador, vendedor, cantidad y la fecha de firma." } });
      return;
    }
    const data = parsed.data;
    if (data.tieneComision && data.comisionUsd == null) {
      res.status(400).json({ error: { message: "Indicá el monto de la comisión en USD." } });
      return;
    }
    const aduanaAplica = data.origen === "china" ? true : data.aduanaAplica !== false;
    const etapas: StagesMap = {
      contrato: {
        status: "done",
        fecha: data.fechaContrato,
        notas: "",
        ...(data.contratoRef ? { referencia: data.contratoRef } : {}),
      },
    };
    const ts = nowSql();
    const inserted = await db
      .prepare(
        `INSERT INTO asic_pedidos (
           cliente, client_id, origen, marca, equipo, procesador, cantidad, vendedor, tiene_comision, comision_usd,
           aduana_aplica, notas, etapas_json, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${ts}, ${ts})`
      )
      .run(
        data.cliente,
        data.clientId ?? null,
        data.origen,
        data.marca,
        data.equipo,
        data.procesador,
        data.cantidad,
        data.vendedor,
        data.tieneComision ? 1 : 0,
        data.tieneComision ? data.comisionUsd ?? 0 : null,
        aduanaAplica ? 1 : 0,
        data.notas,
        JSON.stringify(etapas)
      );
    const id = Number(inserted.lastInsertRowid);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(500).json({ error: { message: "No se pudo crear el pedido." } });
      return;
    }
    const pedido = await loadPedido(id);
    res.status(201).json({ pedido });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.patch("/asic-pedidos/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const pedido = await loadPedido(id);
    if (!pedido) {
      res.status(404).json({ error: { message: "No se encontró el pedido." } });
      return;
    }
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "No se pudo actualizar el pedido." } });
      return;
    }
    const data = parsed.data;
    let aduanaAplica = pedido.aduanaAplica;
    if (data.aduanaAplica != null) {
      if (pedido.origen !== "paraguay") {
        res.status(400).json({ error: { message: "Un pedido desde China siempre pasa por aduana." } });
        return;
      }
      const customsTouched = ADUANA_KEYS.size > 0 && (pedido.etapas.aduana_llegada?.status === "done" || pedido.etapas.aduana_salida?.status === "done");
      const laterStarted = applicableKeys(true).some((key) => {
        const idx = ASIC_PEDIDO_STAGE_KEYS.indexOf(key);
        const ayolas = ASIC_PEDIDO_STAGE_KEYS.indexOf("camino_ayolas");
        return idx >= ayolas && pedido.etapas[key]?.status === "done";
      });
      if (customsTouched || laterStarted) {
        res.status(400).json({ error: { message: "La aduana ya quedó registrada. Reabrí esa etapa si hay que corregirla." } });
        return;
      }
      aduanaAplica = data.aduanaAplica;
    }
    const ts = nowSql();
    const facturaNumero = data.facturaNumero !== undefined ? data.facturaNumero : pedido.facturaNumero;
    const facturaId = data.facturaId !== undefined ? data.facturaId : pedido.facturaId;
    const facturaTitular = data.facturaTitular !== undefined ? data.facturaTitular : pedido.facturaTitular;
    await db
      .prepare(
        `UPDATE asic_pedidos
         SET cliente = ?, equipo = ?, cantidad = ?, notas = ?, aduana_aplica = ?,
             factura_id = ?, factura_numero = ?, factura_titular = ?, updated_at = ${ts}
         WHERE id = ?`
      )
      .run(
        data.cliente ?? pedido.cliente,
        data.equipo ?? pedido.equipo,
        data.cantidad ?? pedido.cantidad,
        data.notas ?? pedido.notas,
        aduanaAplica ? 1 : 0,
        facturaId,
        facturaNumero,
        facturaTitular,
        id
      );
    res.json({ pedido: await loadPedido(id) });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.post("/asic-pedidos/:id/etapas/:key", ...writeMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const keyRaw = String(req.params.key || "");
    if (!isStageKey(keyRaw)) {
      res.status(400).json({ error: { message: "Etapa desconocida." } });
      return;
    }
    const pedido = await loadPedido(id);
    if (!pedido) {
      res.status(404).json({ error: { message: "No se encontró el pedido." } });
      return;
    }
    if (pedido.etapaActual === "completo") {
      res.status(400).json({ error: { message: "Este pedido ya está instalado. Reabrí una etapa si hay que corregir algo." } });
      return;
    }
    if (keyRaw !== pedido.etapaActual) {
      res.status(400).json({ error: { message: "Solo se puede confirmar la etapa en curso." } });
      return;
    }
    const parsed = ConfirmSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Revisá los datos de la etapa." } });
      return;
    }
    if (parsed.data.saltarAduana) {
      if (keyRaw !== "aduana_llegada" || pedido.origen !== "paraguay") {
        res.status(400).json({ error: { message: "Solo un pedido desde Paraguay puede saltear la aduana, y recién en esa etapa." } });
        return;
      }
      await saveStages(id, pedido.etapas, false);
      res.json({ pedido: await loadPedido(id) });
      return;
    }
    if (!pedido.aduanaAplica && ADUANA_KEYS.has(keyRaw)) {
      res.status(400).json({ error: { message: "Este pedido no pasa por aduana." } });
      return;
    }
    const checked = validateStage(keyRaw, parsed.data);
    if (!checked.ok) {
      res.status(400).json({ error: { message: checked.message } });
      return;
    }
    const etapas: StagesMap = { ...pedido.etapas, [keyRaw]: checked.state };
    await saveStages(id, etapas);
    res.json({ pedido: await loadPedido(id) });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.post("/asic-pedidos/:id/etapas/:key/reabrir", ...writeMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const keyRaw = String(req.params.key || "");
    if (!isStageKey(keyRaw)) {
      res.status(400).json({ error: { message: "Etapa desconocida." } });
      return;
    }
    const pedido = await loadPedido(id);
    if (!pedido) {
      res.status(404).json({ error: { message: "No se encontró el pedido." } });
      return;
    }
    if (!pedido.aduanaAplica && ADUANA_KEYS.has(keyRaw)) {
      res.status(400).json({ error: { message: "Esa etapa no aplica a este pedido." } });
      return;
    }
    if (pedido.etapas[keyRaw]?.status !== "done") {
      res.status(400).json({ error: { message: "Esa etapa todavía no está confirmada." } });
      return;
    }
    const from = ASIC_PEDIDO_STAGE_KEYS.indexOf(keyRaw);
    const etapas: StagesMap = {};
    for (const key of ASIC_PEDIDO_STAGE_KEYS) {
      if (ASIC_PEDIDO_STAGE_KEYS.indexOf(key) < from && pedido.etapas[key]) etapas[key] = pedido.etapas[key];
    }
    await saveStages(id, etapas);
    res.json({ pedido: await loadPedido(id) });
  } catch (e) {
    next(e);
  }
});

asicPedidosRouter.delete("/asic-pedidos/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const pedido = await loadPedido(id);
    if (!pedido) {
      res.status(404).json({ error: { message: "No se encontró el pedido." } });
      return;
    }
    await db.prepare("DELETE FROM asic_pedidos WHERE id = ?").run(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
