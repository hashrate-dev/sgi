/**
 * Cotizaciones del marketplace: sync del carrito (JWT, rol cliente o admin A/B) + monitoreo AdminA/AdminB.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { notifyMarketplaceOrderWhatsApp } from "../lib/whatsappCloud.js";
import { notifyMarketplaceOrderEmail, notifyMarketplaceOrderGeneradaEmail } from "../lib/marketplaceOrderEmail.js";
import { resolveSetupCompraHashrateUsd, resolveSetupEquipoCompletoUsd } from "../lib/marketplaceSetupHashratePrice.js";
import {
  loadGarantiaQuoteRows,
  resolveWarrantyUsdForQuoteLine,
  type GarantiaQuoteRow,
} from "../lib/marketplaceGarantiaQuote.js";
import {
  MARKETPLACE_TICKET_STATUSES,
  canTransitionTicketStatus,
  isMarketplaceOrderPipelineBlockingStatus,
  isTerminalMarketplaceTicketStatus,
  marketplacePipelineBlockingInSql,
  normalizeTicketStatusDb,
} from "../lib/marketplaceQuoteTicketStatuses.js";
import {
  appendMarketplaceTicketCartHistory,
  buildCartHistoryEntryFromDiff,
  parseItemsCartHistoryFromRow,
  type QuoteLineHistorySnap,
} from "../lib/marketplaceQuoteCartHistory.js";
import { markClientsVentaMarketplaceAfterInstalado } from "../lib/marketplaceVentaCliente.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const marketplaceQuoteTicketsRouter = Router();

const adminAB = requireRole("admin_a", "admin_b");

/** Evita inundar la consola en debounce; solo diagnóstico en desarrollo. */
let lastQuoteSyncPipelineMissLogMs = 0;

/** Fragmento SQL estático `IN (...)` para órdenes que bloquean otra compra activa. */
const MQT_PIPELINE_STATUS_IN_SQL = marketplacePipelineBlockingInSql();

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

const LineSchema = z.object({
  productId: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
  /** Compat legado: se ignora para cálculos (precio/metadata se resuelve server-side por productId). */
  brand: z.string().max(200).default(""),
  model: z.string().max(200).default(""),
  hashrate: z.string().max(200).default(""),
  priceUsd: z.number().min(0).max(999999999).optional(),
  priceLabel: z.string().max(120).default(""),
  /** Fracción de hashrate de 1 equipo; omitido o 100 = equipo completo */
  hashrateSharePct: z.number().int().min(1).max(100).optional(),
  /** Compat: el servidor recalcula estos valores según configuración del equipo. */
  hashrateWarrantyPct: z.number().int().min(0).max(100).optional(),
  hashrateSetupUsd: z.number().int().min(0).max(999999).optional(),
  includeSetup: z.boolean().optional().default(false),
  includeWarranty: z.boolean().optional().default(false),
});

const SyncSchema = z.object({
  lines: z.array(LineSchema).max(50),
  event: z.enum(["sync", "contact_email", "contact_whatsapp", "submit_ticket"]).optional(),
  /**
   * Si true y lines está vacío: vaciar ítems de la orden en pipeline del usuario.
   * Sin esto, un POST vacío tras “generar consulta” borraba el ticket recién creado.
   */
  clearPipelineCart: z.boolean().optional(),
  /**
   * true solo al pulsar «Generar orden» en el carrito (no en sync ni en «Ver orden»).
   * Habilita el correo «ORDEN GENERADA» cuando el estado pasa de ABIERTA (`enviado_consulta`) a `orden_lista`.
   */
  confirmGenerarOrden: z.boolean().optional(),
});

/** Último email de ficha tienda (`clients`) por usuario; usado si `contact_email` quedó como username. */
const CLIENT_EMAIL_SUBQUERY =
  "(SELECT NULLIF(TRIM(c.email), '') FROM clients c WHERE c.user_id = t.user_id ORDER BY c.id DESC LIMIT 1)";

const TICKET_SELECT =
  "t.id, t.session_id, t.order_number, t.ticket_code, t.status, t.items_json, t.items_history_json, t.subtotal_usd, t.line_count, t.unit_count, t.created_at, t.updated_at, t.last_contact_channel, t.contacted_at, t.notes_admin, t.ip_address, t.user_agent, t.user_id, t.contact_email, t.discard_by_email, t.reactivated_at, " +
  "COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(u.username), '')) AS user_join_email, " +
  `${CLIENT_EMAIL_SUBQUERY} AS client_join_email`;
const TICKET_FROM = "marketplace_quote_tickets t LEFT JOIN users u ON u.id = t.user_id";
const REACTIVATE_CANCELLED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 1 mes

type QuoteLine = z.infer<typeof LineSchema>;
type TrustedQuoteLine = Omit<QuoteLine, "priceUsd"> & { priceUsd: number };

/** Líneas persistidas en `items_json` del ticket (mismo shape que el cliente en quote-sync). */
function parseStoredQuoteLinesJson(itemsJsonRaw: string): QuoteLine[] {
  try {
    const v = JSON.parse(String(itemsJsonRaw || "[]")) as unknown;
    if (!Array.isArray(v)) return [];
    const out: QuoteLine[] = [];
    for (const el of v) {
      const p = LineSchema.safeParse(el);
      if (p.success) out.push(p.data);
    }
    return out;
  } catch {
    return [];
  }
}

type SharePartRule = { sharePct: number; warrantyPct: number; setupUsd: number };

function parseSharePartRules(raw: string | null | undefined): SharePartRule[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: SharePartRule[] = [];
    for (const it of v) {
      if (!it || typeof it !== "object") continue;
      const o = it as { sharePct?: unknown; warrantyPct?: unknown; setupUsd?: unknown };
      const sharePct = Math.round(Number(o.sharePct));
      const setupUsd = Math.round(Number(o.setupUsd));
      if (!Number.isFinite(sharePct) || sharePct <= 0 || sharePct > 100) continue;
      if (!Number.isFinite(setupUsd) || setupUsd < 0 || setupUsd > 999999) continue;
      out.push({ sharePct, warrantyPct: sharePct, setupUsd });
    }
    const uniq = new Map<number, SharePartRule>();
    for (const it of out) uniq.set(it.sharePct, it);
    return Array.from(uniq.values()).sort((a, b) => b.sharePct - a.sharePct);
  } catch {
    return [];
  }
}

class QuoteValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "QuoteValidationError";
    this.statusCode = statusCode;
  }
}

function isUniqueConstraintError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = typeof e === "object" && e != null && "code" in e ? String((e as { code?: unknown }).code ?? "") : "";
  return code === "23505" || msg.includes("UNIQUE") || msg.includes("unique");
}

function logQuoteRouteError(scope: string, e: unknown): void {
  console.error(`[marketplace-quote] ${scope}:`, e);
}

function sendInternalError(res: Response, scope: string, e: unknown): Response {
  logQuoteRouteError(scope, e);
  return res.status(500).json({ error: { message: "Error interno del servidor." } });
}

function genTicketCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[crypto.randomInt(0, chars.length)]!;
  return `TKT-${s}`;
}

function clientIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim().slice(0, 80);
  return req.socket.remoteAddress?.slice(0, 80) ?? null;
}

function lineShareMult(l: z.infer<typeof LineSchema>): number {
  const p = Math.round(Number(l.hashrateSharePct));
  if (Number.isFinite(p) && p >= 1 && p <= 100) return p / 100;
  return 1;
}

function setupUsdForLine(
  l: z.infer<typeof LineSchema>,
  setupEquipoCompletoUsd: number,
  setupCompraHashrateUsd: number
): number {
  const p = Math.round(Number(l.hashrateSharePct));
  if (Number.isFinite(p) && p >= 1 && p <= 100) {
    const setupUsd = Math.round(Number(l.hashrateSetupUsd));
    if (Number.isFinite(setupUsd) && setupUsd >= 0) return setupUsd;
    if (p < 100) return Math.max(0, Math.round(setupCompraHashrateUsd)) || 50;
  }
  return Math.max(0, Math.round(setupEquipoCompletoUsd)) || 50;
}

/** Alineado con cliente `quoteCartLineIsEquipmentPricePending`: sin USD en etiqueta → no sumar setup/garantía. */
function lineEquipmentPricePending(l: { priceUsd: number; priceLabel: string }): boolean {
  if (l.priceUsd > 0) return false;
  const base = l.priceLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (/^[\d.,\s]+\s*USD$/i.test(base)) return false;
  return true;
}

type ServerCatalogRow = {
  id: string;
  marca_equipo: string;
  modelo: string;
  procesador: string;
  precio_usd: number;
  mp_hashrate_sell_enabled: number | boolean | null;
  mp_hashrate_parts_json: string | null;
  mp_price_label: string | null;
};

async function resolveTrustedQuoteLines(lines: QuoteLine[]): Promise<TrustedQuoteLine[]> {
  if (lines.length === 0) return [];
  const ids = Array.from(new Set(lines.map((l) => l.productId.trim()).filter(Boolean)));
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  let rows: ServerCatalogRow[];
  try {
    rows = (await db
      .prepare(
        `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_hashrate_sell_enabled, mp_hashrate_parts_json, mp_price_label
         FROM equipos_asic WHERE id IN (${placeholders})`
      )
      .all(...ids)) as ServerCatalogRow[];
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.toLowerCase().includes("mp_hashrate_sell_enabled") || m.toLowerCase().includes("mp_hashrate_parts_json")) {
      type LegacyRow = Omit<ServerCatalogRow, "mp_hashrate_sell_enabled" | "mp_hashrate_parts_json">;
      const legacyRows = (await db
        .prepare(
          `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_price_label
           FROM equipos_asic WHERE id IN (${placeholders})`
        )
        .all(...ids)) as LegacyRow[];
      rows = legacyRows.map((r) => ({
        ...r,
        mp_hashrate_sell_enabled: 0,
        mp_hashrate_parts_json: null,
      }));
    } else {
      throw e;
    }
  }

  const byId = new Map(rows.map((r) => [String(r.id), r] as const));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    /**
     * Tolerancia ante recargas/migraciones del catálogo:
     * si cambió el `id` del equipo pero marca+modelo+hashrate coinciden, recuperamos la línea.
     */
    for (const missingId of missing) {
      const sample = lines.find((l) => l.productId.trim() === missingId);
      if (!sample) continue;
      const brand = String(sample.brand ?? "").trim();
      const model = String(sample.model ?? "").trim();
      const hashrate = String(sample.hashrate ?? "").trim();
      if (!brand || !model) continue;
      const rowByIdentity = (await db
        .prepare(
          `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_hashrate_sell_enabled, mp_hashrate_parts_json, mp_price_label
           FROM equipos_asic
           WHERE LOWER(TRIM(marca_equipo)) = LOWER(TRIM(?))
             AND LOWER(TRIM(modelo)) = LOWER(TRIM(?))
             AND LOWER(TRIM(COALESCE(procesador, ''))) = LOWER(TRIM(?))
           ORDER BY id DESC
           LIMIT 1`
        )
        .get(brand, model, hashrate)) as ServerCatalogRow | undefined;
      if (rowByIdentity) {
        byId.set(missingId, rowByIdentity);
      }
    }
  }
  const unresolved = ids.filter((id) => !byId.has(id));
  if (unresolved.length > 0) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[quote-sync] productos no disponibles tras fallback por identidad: ${unresolved.join(", ")}`);
    }
    throw new QuoteValidationError("Uno o más productos ya no están disponibles para cotizar.", 409);
  }

  return lines.map((line) => {
    const server = byId.get(line.productId)!;
    const sharePctRaw = Math.round(Number(line.hashrateSharePct));
    const hasSharePct =
      Object.prototype.hasOwnProperty.call(line, "hashrateSharePct") &&
      Number.isFinite(sharePctRaw) &&
      sharePctRaw >= 1 &&
      sharePctRaw <= 100;
    const sharePct = hasSharePct ? sharePctRaw : 100;
    const shareRules = parseSharePartRules(server.mp_hashrate_parts_json);
    const shareEnabled =
      (server.mp_hashrate_sell_enabled === true || Number(server.mp_hashrate_sell_enabled) === 1) &&
      shareRules.length > 0;
    const matchedRule = hasSharePct ? shareRules.find((x) => x.sharePct === sharePct) : undefined;
    if (hasSharePct && (!shareEnabled || !matchedRule)) {
      throw new QuoteValidationError("La fracción de hashrate seleccionada no está habilitada para este equipo.", 400);
    }
    const basePriceUsd = Math.max(0, Math.round(Number(server.precio_usd) || 0));
    const priceUsd = hasSharePct ? Math.max(0, Math.round((basePriceUsd * sharePct) / 100)) : basePriceUsd;
    const fallbackLabel = priceUsd > 0 ? `${priceUsd} USD` : "SOLICITA PRECIO";
    const priceLabel = String(server.mp_price_label ?? "").trim() || fallbackLabel;
    return {
      productId: line.productId,
      qty: line.qty,
      brand: String(server.marca_equipo ?? "").trim(),
      model: String(server.modelo ?? "").trim(),
      hashrate: String(server.procesador ?? "").trim(),
      priceUsd,
      priceLabel,
      ...(hasSharePct ? { hashrateSharePct: sharePct } : {}),
      ...(matchedRule ? { hashrateWarrantyPct: matchedRule.warrantyPct, hashrateSetupUsd: matchedRule.setupUsd } : {}),
      includeSetup: Boolean(line.includeSetup),
      includeWarranty: Boolean(line.includeWarranty),
    };
  });
}

function computeTotals(
  lines: TrustedQuoteLine[],
  setupEquipoCompletoUsd: number,
  setupCompraHashrateUsd: number,
  garantiaItems: GarantiaQuoteRow[]
) {
  const subtotalRaw = lines.reduce((a, l) => {
    const pendingEquipmentPrice = lineEquipmentPricePending(l);
    let row = l.qty * l.priceUsd;
    /**
     * Garantía SIEMPRE se toma del sistema (`items_garantia_ande`) aunque el equipo esté en "Solicita precio".
     * Setup se mantiene a cotizar cuando no hay precio publicado del equipo.
     */
    if (l.includeSetup && !pendingEquipmentPrice) row += l.qty * setupUsdForLine(l, setupEquipoCompletoUsd, setupCompraHashrateUsd);
    if (l.includeWarranty) {
      const wu = resolveWarrantyUsdForQuoteLine(
        { productId: l.productId, brand: l.brand, model: l.model, hashrate: l.hashrate },
        garantiaItems
      );
      row += Math.round(l.qty * wu * lineShareMult(l));
    }
    return a + row;
  }, 0);
  const subtotal = Number.isFinite(subtotalRaw) ? Math.round(subtotalRaw) : 0;
  const unitCount = lines.reduce((a, l) => a + l.qty, 0);
  return { subtotal, lineCount: lines.length, unitCount };
}

function quoteLineMergeKey(l: { productId: string; hashrateSharePct?: number }): string {
  const p = Math.round(Number(l.hashrateSharePct));
  const share = Number.isFinite(p) && p >= 1 && p <= 100 ? String(p) : "full";
  return `${l.productId}:${share}`;
}

/**
 * Snapshot del carrito del cliente sobre el ticket en pipeline: reemplaza por completo `items_json`.
 * Las líneas que el usuario quitó en el carrito no deben quedar en la orden (antes se hacía unión y “volvían”).
 */
function mergePipelineCartLines(
  _existingJson: string,
  incoming: TrustedQuoteLine[]
): TrustedQuoteLine[] {
  const map = new Map<string, TrustedQuoteLine>();
  for (const l of incoming) {
    map.set(quoteLineMergeKey(l), l);
  }
  return Array.from(map.values()).sort((a, b) => quoteLineMergeKey(a).localeCompare(quoteLineMergeKey(b)));
}

/** Driver PG / capas: `items_json` puede venir como string o ya parseado. */
function rowItemsJsonAsString(raw: unknown): string {
  if (raw == null || raw === "") return "[]";
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t : "[]";
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return "[]";
  }
}

/** Comparar carritos ignorando espacios u orden de keys en JSON. */
function canonicalItemsJsonForCompare(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json.trim();
  }
}

async function tryAppendQuoteCartHistory(
  ticketId: number,
  prevItemsJson: string,
  nextLines: TrustedQuoteLine[],
  nowIso: string
): Promise<void> {
  try {
    const entry = buildCartHistoryEntryFromDiff(prevItemsJson, nextLines as QuoteLineHistorySnap[], nowIso);
    if (entry) await appendMarketplaceTicketCartHistory(ticketId, entry);
  } catch (e) {
    logQuoteRouteError("quote-sync.cart-history", e);
  }
}

/** Libera session_id `u:{userId}` para el próximo borrador (ticket ya enviado al dashboard). */
function submittedSessionId(userId: number, ticketId: number): string {
  return `u:${userId}:submitted:${ticketId}`;
}

/** Una sola consulta “en curso” por cuenta (cliente tienda + admin A/B con carrito): bloquea otro envío hasta cancelar o cierre. */

/**
 * El ticket pertenece a la sesión si coincide `user_id` (p. ej. SQLite puede devolver string)
 * (regla estricta por cuenta; sin fallback por email).
 */
function ticketOwnedBySessionUser(
  row: { user_id: unknown; contact_email?: unknown; user_join_email?: unknown },
  sessionUser: { id: number }
): boolean {
  const sid = Number(sessionUser.id);
  const rawUid = row.user_id;
  const ticketUid =
    rawUid == null || rawUid === "" ? null : Number(rawUid as number | string);
  // Regla estricta por cuenta: ownership solo por user_id (sin fallback por email).
  return ticketUid != null && Number.isFinite(ticketUid) && ticketUid === sid;
}

/** Cuántas órdenes en pipeline tiene el usuario (opcional: excluir un id, p. ej. el borrador que se está enviando). */
async function countPipelineTicketsForUser(userId: number, excludeId: number | null): Promise<number> {
  if (excludeId != null && Number.isFinite(excludeId)) {
    const row = (await db
      .prepare(
        `SELECT COUNT(*) as c FROM marketplace_quote_tickets
         WHERE user_id = ? AND status IN (${MQT_PIPELINE_STATUS_IN_SQL}) AND id != ?`
      )
      .get(userId, excludeId)) as { c: number } | undefined;
    return Number(row?.c) || 0;
  }
  const row = (await db
    .prepare(
      `SELECT COUNT(*) as c FROM marketplace_quote_tickets
       WHERE user_id = ? AND status IN (${MQT_PIPELINE_STATUS_IN_SQL})`
    )
    .get(userId)) as { c: number } | undefined;
  return Number(row?.c) || 0;
}

function oneActiveOrder409Payload(blocking: { order_number: string | null; ticket_code: string }) {
  return {
    error: {
      code: "ONE_ACTIVE_ORDER",
      message:
        "Ya tenés una consulta en curso. Cancelala en «Mis órdenes» para armar un carrito nuevo y generar otra orden.",
      orderNumber: blocking.order_number ?? undefined,
      ticketCode: blocking.ticket_code,
    },
  };
}

function resolveStatusAfterContact(currentStatus: string, hasContactEvent: boolean): string {
  if (!hasContactEvent) return currentStatus;
  const n = normalizeTicketStatusDb(currentStatus);
  /** Contacto (mail/WA) no dispara aviso a ventas: solo deja la orden persistida en pendiente. */
  if (n === "borrador") return "pendiente";
  return currentStatus;
}

/**
 * Resend «Nueva orden»: `pendiente` / `borrador` / `descartado` → `orden_lista` solo con `submit_ticket` y
 * `confirmGenerarOrden: true` (pulsación explícita de «Generar orden»). Los `sync` de carrito no envían el flag → silencio.
 */
function shouldNotifyResendNuevaOrdenLista(
  prevNorm: string,
  nextNorm: string,
  isSubmit: boolean,
  confirmGenerarOrden: boolean
): boolean {
  if (!isSubmit || nextNorm !== "orden_lista") return false;
  if (!confirmGenerarOrden) return false;
  return prevNorm === "pendiente" || prevNorm === "borrador" || prevNorm === "descartado";
}

/** Resend «ORDEN GENERADA»: `enviado_consulta` → `orden_lista` y confirmación explícita del cliente. */
function shouldNotifyResendOrderGenerada(
  prevNorm: string,
  nextNorm: string,
  isSubmit: boolean,
  confirmGenerarOrden: boolean
): boolean {
  if (!isSubmit || nextNorm !== "orden_lista") return false;
  if (prevNorm !== "enviado_consulta") return false;
  return confirmGenerarOrden === true;
}

/** WhatsApp aviso de orden lista: misma regla que los mails (solo `submit_ticket` + confirm explícita). */
function shouldNotifySalesWhatsappOrderLista(
  prevNorm: string,
  nextNorm: string,
  isSubmit: boolean,
  confirmGenerarOrden: boolean
): boolean {
  if (!isSubmit || nextNorm !== "orden_lista") return false;
  if (!confirmGenerarOrden) return false;
  return (
    prevNorm === "pendiente" ||
    prevNorm === "borrador" ||
    prevNorm === "descartado" ||
    prevNorm === "enviado_consulta"
  );
}

/** POST autenticado (cliente o admin A/B): guardar carrito / marcar consulta por mail o WhatsApp */
const quoteSyncAuth = requireRole("cliente", "admin_a", "admin_b");
marketplaceQuoteTicketsRouter.post("/marketplace/quote-sync", requireAuth, quoteSyncAuth, async (req: Request, res: Response) => {
  try {
    const parsed = SyncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
    }
    let { lines, event, clearPipelineCart } = parsed.data;
    const confirmGenerarOrden = parsed.data.confirmGenerarOrden === true;
    const garantiaItems = await loadGarantiaQuoteRows();
    const userId = req.user!.id;
    const userRole = String(req.user!.role ?? "").toLowerCase().trim();
    /** Cliente y admin A/B: una consulta activa; se fusionan cambios del carrito en ese ticket (quote-sync). */
    const singleMarketplaceOrderPolicy =
      userRole === "cliente" || userRole === "admin_a" || userRole === "admin_b";
    const contactEmail = await resolveContactEmailForMarketplaceSync(userId, req.user!.email);
    const sessionId = `u:${userId}`;
    const ip = clientIp(req);
    const ua = (typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "").slice(0, 500);
    const nowIso = new Date().toISOString();

    /**
     * Carrito vacío en cliente pero «Generar orden»: usar ítems ya guardados en la orden en pipeline
     * (p. ej. tras vaciar lista local o desincronización) para no borrar el ticket ni fallar el submit.
     */
    if (
      lines.length === 0 &&
      event === "submit_ticket" &&
      singleMarketplaceOrderPolicy &&
      clearPipelineCart !== true
    ) {
      const blockingItems = (await db
        .prepare(
          `SELECT items_json FROM marketplace_quote_tickets
           WHERE status IN (${MQT_PIPELINE_STATUS_IN_SQL})
           AND (session_id = ? OR session_id LIKE ?)
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(sessionId, `${sessionId}:%`)) as { items_json: string | null } | undefined;
      if (blockingItems) {
        const restored = parseStoredQuoteLinesJson(rowItemsJsonAsString(blockingItems.items_json));
        if (restored.length > 0) {
          lines = restored;
        }
      }
    }

    if (lines.length === 0) {
      /**
       * «Vaciar carrito» (`clearPipelineCart`): marcar la orden en embudo como `descartado` (riel **Cerrados** en admin).
       * Debe ejecutarse **antes** del borrado por `session_id`: si la fila era `pendiente`/`orden_lista` en `u:{id}`,
       * el `DELETE` previo eliminaba el ticket y nunca quedaba en cerrados.
       */
      if (singleMarketplaceOrderPolicy && clearPipelineCart === true) {
        const blocking = (await db
          .prepare(
            `SELECT id, order_number, ticket_code, status FROM marketplace_quote_tickets
             WHERE status IN (${MQT_PIPELINE_STATUS_IN_SQL})
             AND (session_id = ? OR session_id LIKE ?)
             ORDER BY updated_at DESC LIMIT 1`
          )
          .get(sessionId, `${sessionId}:%`)) as
          | { id: number; order_number: string | null; ticket_code: string; status: string }
          | undefined;
        if (blocking) {
          /** Conservar ítems/totales en BD (auditoría). */
          const clearedStatus = "descartado";
          const discardActorEmail = String(req.user!.email ?? "").trim() || null;
          await db
            .prepare(
              `UPDATE marketplace_quote_tickets SET
                updated_at = ?,
                status = ?,
                discard_by_email = ?,
                reactivated_at = NULL,
                ip_address = ?, user_agent = ?,
                user_id = ?, contact_email = ?
              WHERE id = ?`
            )
            .run(nowIso, clearedStatus, discardActorEmail, ip, ua, userId, contactEmail, blocking.id);
          const orderNumber = blocking.order_number ?? `ORD-${String(blocking.id).padStart(7, "0")}`;
          return res.json({
            ok: true,
            id: blocking.id,
            orderNumber,
            ticketCode: blocking.ticket_code,
            status: clearedStatus,
            merged: true,
            lines: [],
            subtotalUsd: 0,
            lineCount: 0,
            unitCount: 0,
          });
        }
      }
      const ex = (await db
        .prepare("SELECT id, status FROM marketplace_quote_tickets WHERE session_id = ?")
        .get(sessionId)) as { id: number; status: string } | undefined;
      if (ex && (ex.status === "borrador" || ex.status === "pendiente" || ex.status === "orden_lista")) {
        await db.prepare("DELETE FROM marketplace_quote_tickets WHERE id = ?").run(ex.id);
      }
      return res.json({ ok: true, cleared: true });
    }

    const trustedLines = await resolveTrustedQuoteLines(lines);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(
        `[quote-sync] in user=${userId} event=${String(event)} linesIn=${lines.length} trusted=${trustedLines.length} session=${sessionId}`
      );
    }
    const [setupEquipoCompletoUsd, setupCompraHashrateUsd] = await Promise.all([
      resolveSetupEquipoCompletoUsd(),
      resolveSetupCompraHashrateUsd(),
    ]);

    /** Orden en pipeline → fusionar el carrito en ese ticket (mismas refs y estado). */
    if (singleMarketplaceOrderPolicy && trustedLines.length > 0) {
      const blocking = (await db
        .prepare(
          `SELECT id, order_number, ticket_code, status, items_json FROM marketplace_quote_tickets
           WHERE status IN (${MQT_PIPELINE_STATUS_IN_SQL})
           AND (session_id = ? OR session_id LIKE ?)
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(sessionId, `${sessionId}:%`)) as
        | { id: number; order_number: string | null; ticket_code: string; status: string; items_json: string | null }
        | undefined;
      if (!blocking && process.env.NODE_ENV !== "production") {
        const t = Date.now();
        if (t - lastQuoteSyncPipelineMissLogMs > 45_000) {
          lastQuoteSyncPipelineMissLogMs = t;
          // eslint-disable-next-line no-console
          console.warn(
            `[quote-sync] sin fila pipeline para session=${sessionId} (ni LIKE '${sessionId}:%'); revisá status y session_id en marketplace_quote_tickets`
          );
        }
      }
      if (blocking) {
        const orphanDraft = (await db
          .prepare("SELECT id FROM marketplace_quote_tickets WHERE session_id = ? AND status IN ('borrador','pendiente','orden_lista')")
          .get(sessionId)) as { id: number } | undefined;
        if (orphanDraft && orphanDraft.id !== blocking.id) {
          await db.prepare("DELETE FROM marketplace_quote_tickets WHERE id = ?").run(orphanDraft.id);
        }

        const mergedLines = mergePipelineCartLines(rowItemsJsonAsString(blocking.items_json), trustedLines);
        const { subtotal: mergedSub, lineCount: mergedLc, unitCount: mergedUc } = computeTotals(
          mergedLines,
          setupEquipoCompletoUsd,
          setupCompraHashrateUsd,
          garantiaItems
        );
        const itemsJsonMerged = JSON.stringify(mergedLines);
        const isSubmitTicketMerge = event === "submit_ticket";
        const contactChannelMerge =
          isSubmitTicketMerge ? "portal" : event === "contact_email" ? "email" : event === "contact_whatsapp" ? "whatsapp" : undefined;
        const keepStatus = String(blocking.status ?? "").trim();
        const stNorm = normalizeTicketStatusDb(keepStatus);
        const terminalMerge = isTerminalMarketplaceTicketStatus(stNorm);
        let rowStatusOut = keepStatus;
        if (isSubmitTicketMerge && (stNorm === "pendiente" || stNorm === "borrador" || stNorm === "enviado_consulta")) {
          rowStatusOut = "orden_lista";
        }

        if (contactChannelMerge) {
          await db
            .prepare(
              `UPDATE marketplace_quote_tickets SET
                items_json = ?, subtotal_usd = ?, line_count = ?, unit_count = ?, updated_at = ?,
                status = ?, ip_address = ?, user_agent = ?,
                user_id = ?, contact_email = ?,
                last_contact_channel = ?,
                contacted_at = CASE WHEN ? = 0 THEN contacted_at ELSE COALESCE(contacted_at, ?) END
              WHERE id = ?`
            )
            .run(
              itemsJsonMerged,
              mergedSub,
              mergedLc,
              mergedUc,
              nowIso,
              rowStatusOut,
              ip,
              ua,
              userId,
              contactEmail,
              contactChannelMerge,
              terminalMerge ? 0 : 1,
              nowIso,
              blocking.id
            );
        } else {
          await db
            .prepare(
              `UPDATE marketplace_quote_tickets SET
                items_json = ?, subtotal_usd = ?, line_count = ?, unit_count = ?, updated_at = ?,
                ip_address = ?, user_agent = ?,
                user_id = ?, contact_email = ?
              WHERE id = ?`
            )
            .run(itemsJsonMerged, mergedSub, mergedLc, mergedUc, nowIso, ip, ua, userId, contactEmail, blocking.id);
        }

        await tryAppendQuoteCartHistory(blocking.id, rowItemsJsonAsString(blocking.items_json), mergedLines, nowIso);

        let orderNumber = blocking.order_number ?? `ORD-${String(blocking.id).padStart(7, "0")}`;
        if (!blocking.order_number) {
          await db.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, blocking.id);
        }

        const mergePrevNorm = stNorm;
        const mergeNextNorm = normalizeTicketStatusDb(rowStatusOut);
        if (shouldNotifyResendNuevaOrdenLista(mergePrevNorm, mergeNextNorm, isSubmitTicketMerge, confirmGenerarOrden)) {
          void notifyMarketplaceOrderEmail({
            orderNumber,
            ticketCode: blocking.ticket_code,
            contactEmail: contactEmail ?? "",
            subtotalUsd: mergedSub,
          }).catch((e) => console.error("[email] marketplace order notify (merge submit):", e));
        }
        if (shouldNotifyResendOrderGenerada(mergePrevNorm, mergeNextNorm, isSubmitTicketMerge, confirmGenerarOrden)) {
          void notifyMarketplaceOrderGeneradaEmail({
            orderNumber,
            ticketCode: blocking.ticket_code,
            contactEmail: contactEmail ?? "",
            subtotalUsd: mergedSub,
          }).catch((e) => console.error("[email] marketplace ORDEN GENERADA (merge submit):", e));
        }
        if (shouldNotifySalesWhatsappOrderLista(mergePrevNorm, mergeNextNorm, isSubmitTicketMerge, confirmGenerarOrden)) {
          void notifyMarketplaceOrderWhatsApp({
            orderNumber,
            ticketCode: blocking.ticket_code,
            contactEmail: contactEmail ?? "",
            subtotalUsd: mergedSub,
          }).catch((e) => console.error("[whatsapp] marketplace order notify (merge submit):", e));
        }

        if (isSubmitTicketMerge && mergeNextNorm === "orden_lista") {
          await db
            .prepare("UPDATE marketplace_quote_tickets SET session_id = ? WHERE id = ?")
            .run(submittedSessionId(userId, blocking.id), blocking.id);
        }

        return res.json({
          ok: true,
          id: blocking.id,
          orderNumber,
          ticketCode: blocking.ticket_code,
          status: rowStatusOut,
          merged: true,
          lines: mergedLines,
          subtotalUsd: mergedSub,
          lineCount: mergedLc,
          unitCount: mergedUc,
        });
      }
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log(
          `[quote-sync] merge skipped (no pipeline row for session / status not in pipeline IN) session=${sessionId}`
        );
      }
    }

    const { subtotal, lineCount, unitCount } = computeTotals(
      trustedLines,
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
      garantiaItems
    );
    const itemsJson = JSON.stringify(trustedLines);
    const isSubmitTicket = event === "submit_ticket";
    const contactChannel =
      isSubmitTicket ? "portal" : event === "contact_email" ? "email" : event === "contact_whatsapp" ? "whatsapp" : undefined;

    type ExistingRow = {
      id: number;
      order_number: string | null;
      ticket_code: string;
      status: string;
      updated_at: string | null;
      items_json: string | null;
      subtotal_usd: unknown;
      line_count: unknown;
      unit_count: unknown;
    };

    const existingSelect =
      "SELECT id, order_number, ticket_code, status, updated_at, items_json, subtotal_usd, line_count, unit_count FROM marketplace_quote_tickets";

    /** Órdenes `instalado` / `cerrado` no se reutilizan: nueva compra → INSERT con otro `id` y otro `ORD-…`. */
    let existing = (await db
      .prepare(`${existingSelect} WHERE session_id = ? AND status NOT IN ('instalado', 'cerrado')`)
      .get(sessionId)) as ExistingRow | undefined;
    /** Tras «Generar orden» el `session_id` pasa a `u:{id}:submitted:{ticketId}`; el cliente sigue usando `u:{id}` para el sync. */
    if (!existing && singleMarketplaceOrderPolicy) {
      existing = (await db
        .prepare(
          `${existingSelect} WHERE status IN (${MQT_PIPELINE_STATUS_IN_SQL})
           AND (session_id = ? OR session_id LIKE ?)
           AND status NOT IN ('instalado', 'cerrado')
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(sessionId, `${sessionId}:%`)) as ExistingRow | undefined;
    }

    if (existing) {
      const exSt = normalizeTicketStatusDb(existing.status);
      const isCancelled = exSt === "descartado";
      const cancelledAtMs = Date.parse(String(existing.updated_at ?? ""));
      const canReactivateCancelled =
        isCancelled &&
        trustedLines.length > 0 &&
        Number.isFinite(cancelledAtMs) &&
        Date.now() - cancelledAtMs <= REACTIVATE_CANCELLED_WINDOW_MS;
      const terminal = exSt === "cerrado" || exSt === "instalado" || (isCancelled && !canReactivateCancelled);
      let nextStatus = terminal
        ? existing.status
        : canReactivateCancelled
          ? isSubmitTicket
            ? "orden_lista"
            : "pendiente"
          : resolveStatusAfterContact(existing.status, Boolean(contactChannel));
      if (!terminal && trustedLines.length > 0) {
        const nxt = normalizeTicketStatusDb(String(nextStatus));
        if (nxt === "borrador") nextStatus = "pendiente";
      }
      /** «Generar orden» (submit): pendiente / borrador / ABIERTA (`enviado_consulta`) → orden lista + avisos. */
      if (isSubmitTicket && !terminal) {
        const prevSt = normalizeTicketStatusDb(String(existing.status ?? ""));
        if (prevSt === "pendiente" || prevSt === "borrador" || prevSt === "enviado_consulta") {
          nextStatus = "orden_lista";
        }
      }
      const nextNormFor409 = normalizeTicketStatusDb(String(nextStatus));
      if (
        singleMarketplaceOrderPolicy &&
        contactChannel &&
        !terminal &&
        (nextNormFor409 === "enviado_consulta" ||
          nextNormFor409 === "orden_lista" ||
          nextNormFor409 === "pendiente") &&
        (await countPipelineTicketsForUser(userId, existing.id)) > 0
      ) {
        const blocking = (await db
          .prepare(
            `SELECT order_number, ticket_code FROM marketplace_quote_tickets
             WHERE user_id = ? AND status IN (${MQT_PIPELINE_STATUS_IN_SQL}) AND id != ?
             ORDER BY updated_at DESC LIMIT 1`
          )
          .get(userId, existing.id)) as { order_number: string | null; ticket_code: string } | undefined;
        if (blocking) {
          return res.status(409).json(oneActiveOrder409Payload(blocking));
        }
      }
      if (contactChannel) {
        await db
          .prepare(
            `UPDATE marketplace_quote_tickets SET
              items_json = ?, subtotal_usd = ?, line_count = ?, unit_count = ?, updated_at = ?,
              status = ?, ip_address = ?, user_agent = ?,
              user_id = ?, contact_email = ?,
              last_contact_channel = ?,
              contacted_at = CASE WHEN ? = 0 THEN contacted_at ELSE COALESCE(contacted_at, ?) END
            WHERE id = ?`
          )
          .run(
            itemsJson,
            subtotal,
            lineCount,
            unitCount,
            nowIso,
            nextStatus,
            ip,
            ua,
            userId,
            contactEmail,
            contactChannel,
            terminal ? 0 : 1,
            nowIso,
            existing.id
          );
      } else {
        await db
          .prepare(
            `UPDATE marketplace_quote_tickets SET
              items_json = ?, subtotal_usd = ?, line_count = ?, unit_count = ?, updated_at = ?,
              status = ?, ip_address = ?, user_agent = ?,
              user_id = ?, contact_email = ?
            WHERE id = ?`
          )
          .run(itemsJson, subtotal, lineCount, unitCount, nowIso, nextStatus, ip, ua, userId, contactEmail, existing.id);
      }
      await tryAppendQuoteCartHistory(existing.id, rowItemsJsonAsString(existing.items_json), trustedLines, nowIso);

      const orderNumber = existing.order_number ?? `ORD-${String(existing.id).padStart(7, "0")}`;
      if (!existing.order_number) {
        await db.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, existing.id);
      }
      const prevNorm = normalizeTicketStatusDb(String(existing.status ?? ""));
      const nextNorm = normalizeTicketStatusDb(String(nextStatus ?? ""));
      if (isSubmitTicket && nextNorm === "orden_lista") {
        await db
          .prepare("UPDATE marketplace_quote_tickets SET session_id = ? WHERE id = ?")
          .run(submittedSessionId(userId, existing.id), existing.id);
      }
      if (shouldNotifyResendNuevaOrdenLista(prevNorm, nextNorm, isSubmitTicket, confirmGenerarOrden)) {
        void notifyMarketplaceOrderEmail({
          orderNumber,
          ticketCode: existing.ticket_code,
          contactEmail: contactEmail ?? "",
          subtotalUsd: subtotal,
        }).catch((e) => console.error("[email] marketplace order notify:", e));
      }
      if (shouldNotifyResendOrderGenerada(prevNorm, nextNorm, isSubmitTicket, confirmGenerarOrden)) {
        void notifyMarketplaceOrderGeneradaEmail({
          orderNumber,
          ticketCode: existing.ticket_code,
          contactEmail: contactEmail ?? "",
          subtotalUsd: subtotal,
        }).catch((e) => console.error("[email] marketplace ORDEN GENERADA:", e));
      }
      if (shouldNotifySalesWhatsappOrderLista(prevNorm, nextNorm, isSubmitTicket, confirmGenerarOrden)) {
        void notifyMarketplaceOrderWhatsApp({
          orderNumber,
          ticketCode: existing.ticket_code,
          contactEmail: contactEmail ?? "",
          subtotalUsd: subtotal,
        }).catch((e) => console.error("[whatsapp] marketplace order notify:", e));
      }
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log(
          `[quote-sync] existing id=${existing.id} prev=${prevNorm} next=${nextNorm} submit=${isSubmitTicket} confirmGen=${confirmGenerarOrden} resendNueva=${shouldNotifyResendNuevaOrdenLista(prevNorm, nextNorm, isSubmitTicket, confirmGenerarOrden)} resendGenerada=${shouldNotifyResendOrderGenerada(prevNorm, nextNorm, isSubmitTicket, confirmGenerarOrden)} wa=${shouldNotifySalesWhatsappOrderLista(prevNorm, nextNorm, isSubmitTicket, confirmGenerarOrden)}`
        );
      }
      return res.json({
        ok: true,
        id: existing.id,
        orderNumber,
        ticketCode: existing.ticket_code,
        status: nextStatus,
      });
    }

    /**
     * Si la cuenta tenía una orden cancelada reciente (<= 1 mes) y vuelve a agregar ítems,
     * se reactiva esa misma orden en lugar de crear otra nueva.
     */
    if (singleMarketplaceOrderPolicy && trustedLines.length > 0) {
      const latestCancelled = (await db
        .prepare(
          `SELECT id, order_number, ticket_code, updated_at, items_json
           FROM marketplace_quote_tickets
           WHERE user_id = ? AND status = 'descartado'
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(userId)) as
        | {
            id: number;
            order_number: string | null;
            ticket_code: string;
            updated_at: string | null;
            items_json: string | null;
          }
        | undefined;
      const cancelledAtMs = Date.parse(String(latestCancelled?.updated_at ?? ""));
      const canReactivate =
        latestCancelled != null &&
        Number.isFinite(cancelledAtMs) &&
        Date.now() - cancelledAtMs <= REACTIVATE_CANCELLED_WINDOW_MS;
      if (canReactivate && latestCancelled) {
        const reactivatedStatus = isSubmitTicket ? "orden_lista" : "pendiente";
        await db
          .prepare(
            `UPDATE marketplace_quote_tickets SET
              session_id = ?, status = ?,
              items_json = ?, subtotal_usd = ?, line_count = ?, unit_count = ?, updated_at = ?,
              ip_address = ?, user_agent = ?, user_id = ?, contact_email = ?,
              discard_by_email = NULL,
              reactivated_at = ?
            WHERE id = ?`
          )
          .run(
            sessionId,
            reactivatedStatus,
            itemsJson,
            subtotal,
            lineCount,
            unitCount,
            nowIso,
            ip,
            ua,
            userId,
            contactEmail,
            nowIso,
            latestCancelled.id
          );
        await tryAppendQuoteCartHistory(
          latestCancelled.id,
          rowItemsJsonAsString(latestCancelled.items_json),
          trustedLines,
          nowIso
        );
        const orderNumber = latestCancelled.order_number ?? `ORD-${String(latestCancelled.id).padStart(7, "0")}`;
        if (!latestCancelled.order_number) {
          await db.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, latestCancelled.id);
        }
        if (isSubmitTicket && reactivatedStatus === "orden_lista") {
          await db
            .prepare("UPDATE marketplace_quote_tickets SET session_id = ? WHERE id = ?")
            .run(submittedSessionId(userId, latestCancelled.id), latestCancelled.id);
          if (confirmGenerarOrden) {
            const ordNum = latestCancelled.order_number ?? `ORD-${String(latestCancelled.id).padStart(7, "0")}`;
            void notifyMarketplaceOrderEmail({
              orderNumber: ordNum,
              ticketCode: latestCancelled.ticket_code,
              contactEmail: contactEmail ?? "",
              subtotalUsd: subtotal,
            }).catch((e) => console.error("[email] marketplace order notify (reactivate submit):", e));
            void notifyMarketplaceOrderWhatsApp({
              orderNumber: ordNum,
              ticketCode: latestCancelled.ticket_code,
              contactEmail: contactEmail ?? "",
              subtotalUsd: subtotal,
            }).catch((e) => console.error("[whatsapp] marketplace order notify (reactivate submit):", e));
          }
        }
        return res.json({
          ok: true,
          id: latestCancelled.id,
          orderNumber,
          ticketCode: latestCancelled.ticket_code,
          status: reactivatedStatus,
          merged: true,
          reactivated: true,
          lines: trustedLines,
          subtotalUsd: subtotal,
          lineCount,
          unitCount,
        });
      }
    }

    const ticketCode = genTicketCode();
    const initialStatus = "pendiente";
    if (singleMarketplaceOrderPolicy && (await countPipelineTicketsForUser(userId, null)) > 0) {
      const blocking = (await db
        .prepare(
          `SELECT order_number, ticket_code FROM marketplace_quote_tickets
           WHERE user_id = ? AND status IN (${MQT_PIPELINE_STATUS_IN_SQL})
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(userId)) as { order_number: string | null; ticket_code: string } | undefined;
      if (blocking) {
        return res.status(409).json(oneActiveOrder409Payload(blocking));
      }
    }
    let insertOk = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5 && !insertOk; attempt++) {
      const code = attempt === 0 ? ticketCode : genTicketCode();
      try {
        const created = await db.transaction(async (tx) => {
          const ins = await tx
            .prepare(
              `INSERT INTO marketplace_quote_tickets (
                session_id, order_number, ticket_code, status, items_json, subtotal_usd, line_count, unit_count,
                created_at, updated_at, ip_address, user_agent, last_contact_channel, contacted_at,
                user_id, contact_email
              ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              sessionId,
              code,
              initialStatus,
              itemsJson,
              subtotal,
              lineCount,
              unitCount,
              nowIso,
              nowIso,
              ip,
              ua,
              contactChannel ?? null,
              contactChannel ? nowIso : null,
              userId,
              contactEmail
            );
          const id = Number(ins.lastInsertRowid);
          const orderNumber = `ORD-${String(id).padStart(7, "0")}`;
          await tx.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, id);
          if (isSubmitTicket) {
            await tx
              .prepare(
                `UPDATE marketplace_quote_tickets SET
                  session_id = ?,
                  status = 'orden_lista',
                  last_contact_channel = 'portal',
                  contacted_at = COALESCE(contacted_at, ?)
                WHERE id = ?`
              )
              .run(submittedSessionId(userId, id), nowIso, id);
          }
          return { id, orderNumber };
        });
        insertOk = true;
        await tryAppendQuoteCartHistory(created.id, "[]", trustedLines, nowIso);
        if (isSubmitTicket && confirmGenerarOrden) {
          void notifyMarketplaceOrderEmail({
            orderNumber: created.orderNumber,
            ticketCode: code,
            contactEmail: contactEmail ?? "",
            subtotalUsd: subtotal,
          }).catch((e) => console.error("[email] marketplace order notify:", e));
          void notifyMarketplaceOrderWhatsApp({
            orderNumber: created.orderNumber,
            ticketCode: code,
            contactEmail: contactEmail ?? "",
            subtotalUsd: subtotal,
          }).catch((e) => console.error("[whatsapp] marketplace order notify:", e));
        }
        return res.status(201).json({
          ok: true,
          id: created.id,
          orderNumber: created.orderNumber,
          ticketCode: code,
          status: isSubmitTicket ? "orden_lista" : initialStatus,
        });
      } catch (e) {
        lastErr = e;
        if (isUniqueConstraintError(e)) continue;
        throw e;
      }
    }
    const existingBySession = (await db
      .prepare("SELECT id, order_number, ticket_code, status FROM marketplace_quote_tickets WHERE session_id = ?")
      .get(sessionId)) as
      | { id: number; order_number: string | null; ticket_code: string; status: string }
      | undefined;
    if (existingBySession) {
      return res.json({
        ok: true,
        id: existingBySession.id,
        orderNumber: existingBySession.order_number ?? `ORD-${String(existingBySession.id).padStart(7, "0")}`,
        ticketCode: existingBySession.ticket_code,
        status: existingBySession.status,
        recovered: true,
      });
    }
    logQuoteRouteError("quote-sync.insert", lastErr);
    return res.status(500).json({ error: { message: "No se pudo crear el ticket." } });
  } catch (e) {
    if (e instanceof QuoteValidationError) {
      return res.status(e.statusCode).json({ error: { message: e.message } });
    }
    return sendInternalError(res, "quote-sync", e);
  }
});

const ListQueryLaneSchema = z.enum(["pendiente", "compra_confirmada", "eliminadas"]);

const ListQuerySchema = z.object({
  /** Filtro por carril del tablero (prioridad sobre `status` si ambos vinieran). */
  lane: ListQueryLaneSchema.optional(),
  status: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

/** Misma semántica que el panel: pre-pago / post-pago (incl. cerrado) / solo descartado. */
function quoteTicketsLaneAndClause(lane: z.infer<typeof ListQueryLaneSchema>): string {
  if (lane === "pendiente") {
    return " AND t.status NOT IN ('pagada','en_viaje','instalado','cerrado','descartado')";
  }
  if (lane === "compra_confirmada") {
    return " AND t.status IN ('pagada','en_viaje','instalado','cerrado')";
  }
  return " AND t.status = 'descartado'";
}

/** Si `contact_email` guardó el username (p. ej. "admin"), preferir email real de `users` o `clients`. */
function pickContactEmailDisplay(
  contactEmail: string | null,
  userJoinEmail: string | null,
  clientJoinEmail: string | null
): string | null {
  const t = (s: string | null) => (s != null && String(s).trim() !== "" ? String(s).trim() : null);
  const ce = t(contactEmail);
  const uje = t(userJoinEmail);
  const cje = t(clientJoinEmail);
  const looksLikeEmail = (s: string) => s.includes("@");
  if (ce && looksLikeEmail(ce)) return ce;
  if (uje && looksLikeEmail(uje)) return uje;
  if (cje && looksLikeEmail(cje)) return cje;
  return ce ?? uje ?? cje;
}

/** Misma lógica que la vista al persistir `contact_email` en quote-sync. */
async function resolveContactEmailForMarketplaceSync(userId: number, fallback: string | undefined): Promise<string> {
  const row = (await db
    .prepare(
      `SELECT TRIM(u.email) AS email, TRIM(u.username) AS username,
        (SELECT NULLIF(TRIM(c.email), '') FROM clients c WHERE c.user_id = u.id ORDER BY c.id DESC LIMIT 1) AS client_email
       FROM users u WHERE u.id = ?`
    )
    .get(userId)) as { email: string | null; username: string | null; client_email: string | null } | undefined;
  if (!row) return String(fallback ?? "").trim();
  const uje = row.email?.trim() || row.username?.trim() || null;
  const cje = row.client_email?.trim() || null;
  const picked = pickContactEmailDisplay(null, uje, cje);
  if (picked && picked.trim()) return picked.trim();
  return String(fallback ?? "").trim();
}

function rowToTicketList(r: Record<string, unknown>) {
  let items: unknown[] = [];
  try {
    items = JSON.parse(String(r.items_json ?? "[]")) as unknown[];
  } catch {
    items = [];
  }
  const ce = r.contact_email != null && String(r.contact_email).trim() !== "" ? String(r.contact_email) : null;
  const uje = r.user_join_email != null && String(r.user_join_email).trim() !== "" ? String(r.user_join_email) : null;
  const cje = r.client_join_email != null && String(r.client_join_email).trim() !== "" ? String(r.client_join_email) : null;
  return {
    id: Number(r.id),
    sessionId: String(r.session_id ?? ""),
    orderNumber: r.order_number != null ? String(r.order_number) : null,
    ticketCode: String(r.ticket_code ?? ""),
    status: normalizeTicketStatusDb(String(r.status ?? "")),
    subtotalUsd: Number(r.subtotal_usd) || 0,
    lineCount: Number(r.line_count) || 0,
    unitCount: Number(r.unit_count) || 0,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    lastContactChannel: r.last_contact_channel != null ? String(r.last_contact_channel) : null,
    contactedAt: r.contacted_at != null ? String(r.contacted_at) : null,
    notesAdmin: r.notes_admin != null ? String(r.notes_admin) : null,
    ipAddress: r.ip_address != null ? String(r.ip_address) : null,
    userAgent: r.user_agent != null ? String(r.user_agent) : null,
    userId: (() => {
      const n = Number(r.user_id);
      return Number.isFinite(n) ? n : null;
    })(),
    contactEmail: pickContactEmailDisplay(ce, uje, cje),
    discardByEmail:
      r.discard_by_email != null && String(r.discard_by_email).trim() !== "" ? String(r.discard_by_email).trim() : null,
    reactivatedAt:
      r.reactivated_at != null && String(r.reactivated_at).trim() !== "" ? String(r.reactivated_at).trim() : null,
    items,
  };
}

function rowToTicketDetail(row: Record<string, unknown>) {
  return {
    ...rowToTicketList(row),
    itemsCartHistory: parseItemsCartHistoryFromRow(row.items_history_json),
  };
}

/** Listado de tickets del usuario (marketplace): sin borradores; mismo dato que ve el staff en cotizaciones. */
const quoteOwnerAuth = requireRole("cliente", "admin_a", "admin_b");
marketplaceQuoteTicketsRouter.get("/marketplace/my-quote-tickets", requireAuth, quoteOwnerAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const sql = `SELECT ${TICKET_SELECT} FROM ${TICKET_FROM}
      WHERE t.user_id = ? AND t.status != 'borrador'
      ORDER BY t.updated_at DESC LIMIT 100`;
    const rows = (await db.prepare(sql).all(userId)) as Record<string, unknown>[];
    res.json({ tickets: rows.map(rowToTicketList) });
  } catch (e) {
    return sendInternalError(res, "my-quote-tickets.list", e);
  }
});

/** Cliente/admin A/B: cancela una orden en curso (marca descartado) para poder generar una nueva desde el carrito. */
marketplaceQuoteTicketsRouter.post(
  "/marketplace/my-quote-tickets/:id/cancel",
  requireAuth,
  quoteOwnerAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
      const row = (await db
        .prepare(
          `SELECT t.id, t.user_id, t.status, t.contact_email, u.email AS user_join_email
           FROM marketplace_quote_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?`
        )
        .get(id)) as
        | {
            id: number;
            user_id: unknown;
            status: string;
            contact_email: string | null;
            user_join_email: string | null;
          }
        | undefined;
      if (!row) return res.status(404).json({ error: { message: "Ticket no encontrado" } });
      if (!ticketOwnedBySessionUser(row, req.user!)) {
        return res.status(403).json({ error: { message: "No autorizado: solo podés cancelar tu propia orden." } });
      }
      if (!isMarketplaceOrderPipelineBlockingStatus(row.status)) {
        return res.status(400).json({
          error: {
            message:
              "Solo podés cancelar órdenes en embudo comercial (pendiente, contacto por equipo, gestión, pagada o en viaje).",
          },
        });
      }
      const nowIso = new Date().toISOString();
      const discardActorEmail = String(req.user!.email ?? "").trim() || null;
      await db
        .prepare(
          `UPDATE marketplace_quote_tickets
           SET status = 'descartado',
               updated_at = ?,
               discard_by_email = ?,
               reactivated_at = NULL,
               user_id = COALESCE(user_id, ?)
           WHERE id = ?`
        )
        .run(nowIso, discardActorEmail, userId, id);
      res.json({ ok: true });
    } catch (e) {
      return sendInternalError(res, "my-quote-tickets.cancel", e);
    }
  }
);

marketplaceQuoteTicketsRouter.get("/marketplace/my-quote-tickets/:id", requireAuth, quoteOwnerAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
    const row = (await db.prepare(`SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE t.id = ?`).get(id)) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: { message: "Ticket no encontrado" } });
    if (
      !ticketOwnedBySessionUser(
        {
          user_id: row.user_id,
          contact_email: row.contact_email,
          user_join_email: row.user_join_email,
        },
        req.user!
      )
    ) {
      return res.status(403).json({ error: { message: "No autorizado" } });
    }
    res.json({ ticket: rowToTicketDetail(row) });
  } catch (e) {
    return sendInternalError(res, "my-quote-tickets.detail", e);
  }
});

/** Eliminar todas las órdenes/consultas del usuario (no borradores). Solo AdministradorA/B — los clientes tienda no pueden borrado masivo. */
marketplaceQuoteTicketsRouter.delete("/marketplace/my-quote-tickets", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const r = await db
      .prepare("DELETE FROM marketplace_quote_tickets WHERE user_id = ? AND status != 'borrador'")
      .run(userId);
    const deleted = Number(r.changes) || 0;
    res.json({ ok: true, deleted });
  } catch (e) {
    return sendInternalError(res, "my-quote-tickets.delete-all", e);
  }
});

/** Eliminar una orden/consulta del usuario (no borrador). */
marketplaceQuoteTicketsRouter.delete("/marketplace/my-quote-tickets/:id", requireAuth, quoteOwnerAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
    const ex = (await db
      .prepare(
        `SELECT t.id, t.user_id, t.status, t.contact_email, u.email AS user_join_email
         FROM marketplace_quote_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?`
      )
      .get(id)) as
      | {
          id: number;
          user_id: unknown;
          status: string;
          contact_email: string | null;
          user_join_email: string | null;
        }
      | undefined;
    if (!ex) return res.status(404).json({ error: { message: "Ticket no encontrado" } });
    if (!ticketOwnedBySessionUser(ex, req.user!)) {
      return res.status(403).json({ error: { message: "No autorizado: solo podés eliminar tu propia orden." } });
    }
    if (ex.status === "borrador") {
      return res.status(400).json({ error: { message: "Los borradores se gestionan desde el carrito." } });
    }
    await db.prepare("DELETE FROM marketplace_quote_tickets WHERE id = ?").run(id);
    res.json({ ok: true });
  } catch (e) {
    return sendInternalError(res, "my-quote-tickets.delete-one", e);
  }
});

/** Listado para panel admin */
marketplaceQuoteTicketsRouter.get("/marketplace/quote-tickets", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Parámetros inválidos" } });
    }
    const { lane, status, q, limit = 80, offset = 0 } = parsed.data;
    const params: unknown[] = [];
    let sql = `SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE 1=1`;
    if (lane) {
      sql += quoteTicketsLaneAndClause(lane);
    } else if (status && status !== "all") {
      sql += " AND t.status = ?";
      params.push(status);
    }
    if (q && q.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      sql +=
        " AND (LOWER(COALESCE(t.order_number,'')) LIKE ? OR LOWER(t.ticket_code) LIKE ? OR LOWER(t.items_json) LIKE ? OR LOWER(COALESCE(t.contact_email,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ?)";
      params.push(term, term, term, term, term);
    }
    sql += isPg() ? " ORDER BY t.updated_at DESC NULLS LAST LIMIT ? OFFSET ?" : " ORDER BY t.updated_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = (await db.prepare(sql).all(...params)) as Record<string, unknown>[];
    let countStatusTail = "";
    if (lane) countStatusTail = quoteTicketsLaneAndClause(lane);
    else if (status && status !== "all") countStatusTail = " AND t.status = ?";
    const countSqlBase =
      `SELECT COUNT(*) as c FROM ${TICKET_FROM} WHERE 1=1` +
      countStatusTail +
      (q && q.trim()
        ? " AND (LOWER(COALESCE(t.order_number,'')) LIKE ? OR LOWER(t.ticket_code) LIKE ? OR LOWER(t.items_json) LIKE ? OR LOWER(COALESCE(t.contact_email,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ?)"
        : "");
    const countParams: unknown[] = [];
    if (!lane && status && status !== "all") countParams.push(status);
    if (q && q.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      countParams.push(term, term, term, term, term);
    }
    const countRow = (await db.prepare(countSqlBase).get(...countParams)) as { c: number } | undefined;
    const total = Number(countRow?.c) || 0;

    res.json({
      tickets: rows.map(rowToTicketList),
      total,
      limit,
      offset,
    });
  } catch (e) {
    return sendInternalError(res, "admin.list", e);
  }
});

/** Detalle */
marketplaceQuoteTicketsRouter.get("/marketplace/quote-tickets/:id", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
    const row = (await db.prepare(`SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE t.id = ?`).get(id)) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: { message: "Ticket no encontrado" } });
    res.json({ ticket: rowToTicketDetail(row) });
  } catch (e) {
    return sendInternalError(res, "admin.detail", e);
  }
});

/** Eliminar ticket / orden del marketplace (solo AdministradorA/B). */
marketplaceQuoteTicketsRouter.delete("/marketplace/quote-tickets/:id", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
    const r = await db.prepare("DELETE FROM marketplace_quote_tickets WHERE id = ?").run(id);
    if (!Number(r.changes)) {
      return res.status(404).json({ error: { message: "Ticket no encontrado" } });
    }
    res.json({ ok: true });
  } catch (e) {
    return sendInternalError(res, "admin.delete", e);
  }
});

const PatchSchema = z.object({
  status: z.enum(MARKETPLACE_TICKET_STATUSES).optional(),
  notesAdmin: z.string().max(4000).optional().nullable(),
});

marketplaceQuoteTicketsRouter.patch("/marketplace/quote-tickets/:id", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
    }
    const ex = (await db.prepare("SELECT id, status FROM marketplace_quote_tickets WHERE id = ?").get(id)) as
      | { id: number; status: string }
      | undefined;
    if (!ex) return res.status(404).json({ error: { message: "Ticket no encontrado" } });

    const nowIso = new Date().toISOString();
    const { status, notesAdmin } = parsed.data;
    const exNorm = normalizeTicketStatusDb(ex.status);
    const becameInstalado =
      status !== undefined && normalizeTicketStatusDb(status) === "instalado" && exNorm !== "instalado";
    const discardActorEmail = String(req.user!.email ?? "").trim() || null;
    if (status === undefined && notesAdmin === undefined) {
      return res.status(400).json({ error: { message: "Indicá estado y/o notas" } });
    }
    if (status !== undefined && !canTransitionTicketStatus(ex.status, status)) {
      return res.status(400).json({
        error: { message: `Transición de estado inválida: ${ex.status} -> ${status}` },
      });
    }
    const markingDiscarded = status === "descartado" && exNorm !== "descartado";
    if (status !== undefined && notesAdmin !== undefined) {
      if (markingDiscarded) {
        await db
          .prepare(
            "UPDATE marketplace_quote_tickets SET status = ?, notes_admin = ?, updated_at = ?, discard_by_email = ?, reactivated_at = NULL WHERE id = ?"
          )
          .run(status, notesAdmin, nowIso, discardActorEmail, id);
      } else {
        await db
          .prepare("UPDATE marketplace_quote_tickets SET status = ?, notes_admin = ?, updated_at = ? WHERE id = ?")
          .run(status, notesAdmin, nowIso, id);
      }
    } else if (status !== undefined) {
      if (markingDiscarded) {
        await db
          .prepare(
            "UPDATE marketplace_quote_tickets SET status = ?, updated_at = ?, discard_by_email = ?, reactivated_at = NULL WHERE id = ?"
          )
          .run(status, nowIso, discardActorEmail, id);
      } else {
        await db.prepare("UPDATE marketplace_quote_tickets SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso, id);
      }
    } else if (notesAdmin !== undefined) {
      await db.prepare("UPDATE marketplace_quote_tickets SET notes_admin = ?, updated_at = ? WHERE id = ?").run(notesAdmin, nowIso, id);
    }
    if (becameInstalado) {
      await markClientsVentaMarketplaceAfterInstalado(id);
    }
    const row = (await db.prepare(`SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE t.id = ?`).get(id)) as Record<string, unknown>;
    res.json({ ticket: rowToTicketDetail(row) });
  } catch (e) {
    return sendInternalError(res, "admin.patch", e);
  }
});

/** KPIs rápidos para el tablero */
marketplaceQuoteTicketsRouter.get("/marketplace/quote-tickets-stats", requireAuth, adminAB, async (_req: Request, res: Response) => {
  try {
    const rows = (await db
      .prepare("SELECT status, COUNT(*) as c FROM marketplace_quote_tickets GROUP BY status")
      .all()) as { status: string; c: number }[];
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r.c) || 0;
      byStatus[r.status] = n;
      total += n;
    }
    const todayRow = (await db
      .prepare(
        isPg()
          ? "SELECT COUNT(*) as c FROM marketplace_quote_tickets WHERE created_at::date = CURRENT_DATE"
          : "SELECT COUNT(*) as c FROM marketplace_quote_tickets WHERE date(created_at) = date('now')"
      )
      .get()) as { c: number } | undefined;
    const todayCount = Number(todayRow?.c) || 0;

    res.json({ byStatus, total, todayCount });
  } catch (e) {
    return sendInternalError(res, "admin.stats", e);
  }
});
