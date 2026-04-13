/**
 * Cotizaciones del marketplace: sync del carrito (JWT, rol cliente o admin A/B) + monitoreo AdminA/AdminB.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { notifyMarketplaceOrderWhatsApp } from "../lib/whatsappCloud.js";
import { resolveSetupCompraHashrateUsd, resolveSetupEquipoCompletoUsd } from "../lib/marketplaceSetupHashratePrice.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const marketplaceQuoteTicketsRouter = Router();

const adminAB = requireRole("admin_a", "admin_b");

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

/** Garantía referencial (cliente prorratea por % hashrate en líneas 25/50/75). */
const QUOTE_ADDON_WARRANTY_USD = 200;

const LineSchema = z.object({
  productId: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
  brand: z.string().max(200).default(""),
  model: z.string().max(200).default(""),
  hashrate: z.string().max(200).default(""),
  priceUsd: z.number().min(0).max(999999999),
  priceLabel: z.string().max(120).default(""),
  /** 25/50/75 = fracción de hashrate de 1 equipo; omitido o 100 = equipo completo */
  hashrateSharePct: z.union([z.literal(25), z.literal(50), z.literal(75)]).optional(),
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
});

const TICKET_SELECT =
  "t.id, t.session_id, t.order_number, t.ticket_code, t.status, t.items_json, t.subtotal_usd, t.line_count, t.unit_count, t.created_at, t.updated_at, t.last_contact_channel, t.contacted_at, t.notes_admin, t.ip_address, t.user_agent, t.user_id, t.contact_email, u.email AS user_join_email";
const TICKET_FROM = "marketplace_quote_tickets t LEFT JOIN users u ON u.id = t.user_id";

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
  const p = l.hashrateSharePct;
  if (p === 25 || p === 50 || p === 75) return p / 100;
  return 1;
}

function setupUsdForLine(
  l: z.infer<typeof LineSchema>,
  setupEquipoCompletoUsd: number,
  setupCompraHashrateUsd: number
): number {
  const p = l.hashrateSharePct;
  if (p === 25 || p === 50 || p === 75) return Math.max(0, Math.round(setupCompraHashrateUsd)) || 50;
  return Math.max(0, Math.round(setupEquipoCompletoUsd)) || 50;
}

/** Alineado con cliente `quoteCartLineIsEquipmentPricePending`: sin USD en etiqueta → no sumar setup/garantía. */
function lineEquipmentPricePending(l: { priceUsd: number; priceLabel: string }): boolean {
  if (l.priceUsd > 0) return false;
  const base = l.priceLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (/^[\d.,\s]+\s*USD$/i.test(base)) return false;
  return true;
}

function computeTotals(lines: z.infer<typeof LineSchema>[], setupEquipoCompletoUsd: number, setupCompraHashrateUsd: number) {
  const subtotal = lines.reduce((a, l) => {
    let row = l.qty * l.priceUsd;
    if (lineEquipmentPricePending(l)) return a + row;
    if (l.includeSetup) row += l.qty * setupUsdForLine(l, setupEquipoCompletoUsd, setupCompraHashrateUsd);
    if (l.includeWarranty) row += Math.round(l.qty * QUOTE_ADDON_WARRANTY_USD * lineShareMult(l));
    return a + row;
  }, 0);
  const unitCount = lines.reduce((a, l) => a + l.qty, 0);
  return { subtotal, lineCount: lines.length, unitCount };
}

function quoteLineMergeKey(l: { productId: string; hashrateSharePct?: 25 | 50 | 75 }): string {
  const p = l.hashrateSharePct;
  const share = p === 25 || p === 50 || p === 75 ? p : 100;
  return `${l.productId}:${share}`;
}

/**
 * Snapshot del carrito del cliente sobre el ticket en pipeline: reemplaza por completo `items_json`.
 * Las líneas que el usuario quitó en el carrito no deben quedar en la orden (antes se hacía unión y “volvían”).
 */
function mergePipelineCartLines(
  _existingJson: string,
  incoming: z.infer<typeof LineSchema>[]
): z.infer<typeof LineSchema>[] {
  const map = new Map<string, z.infer<typeof LineSchema>>();
  for (const l of incoming) {
    map.set(quoteLineMergeKey(l), l);
  }
  return Array.from(map.values()).sort((a, b) => quoteLineMergeKey(a).localeCompare(quoteLineMergeKey(b)));
}

/** Libera session_id `u:{userId}` para el próximo borrador (ticket ya enviado al dashboard). */
function submittedSessionId(userId: number, ticketId: number): string {
  return `u:${userId}:submitted:${ticketId}`;
}

/** Una sola consulta “en curso” por cuenta (cliente tienda + admin A/B con carrito): bloquea otro envío hasta cancelar o cierre. */

function normalizeTicketStatusDb(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeEmailAddr(email: string | null | undefined): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

/**
 * El ticket pertenece a la sesión si coincide `user_id` (p. ej. SQLite puede devolver string)
 * o, solo como respaldo legacy, si `user_id` es NULL y el email del ticket coincide con el de la cuenta.
 */
function ticketOwnedBySessionUser(
  row: { user_id: unknown; contact_email?: unknown; user_join_email?: unknown },
  sessionUser: { id: number; email: string }
): boolean {
  const sid = Number(sessionUser.id);
  const rawUid = row.user_id;
  const ticketUid =
    rawUid == null || rawUid === "" ? null : Number(rawUid as number | string);
  if (ticketUid != null && Number.isFinite(ticketUid) && ticketUid === sid) {
    return true;
  }
  const ce = row.contact_email != null && String(row.contact_email).trim() !== "" ? String(row.contact_email) : "";
  const uje =
    row.user_join_email != null && String(row.user_join_email).trim() !== "" ? String(row.user_join_email) : "";
  const rowEmail = normalizeEmailAddr(ce || uje);
  const sessionEmail = normalizeEmailAddr(sessionUser.email);
  if (!rowEmail || !sessionEmail || rowEmail !== sessionEmail) {
    return false;
  }
  return ticketUid == null || !Number.isFinite(ticketUid);
}

function isPipelineStatus(s: string): boolean {
  const t = normalizeTicketStatusDb(s);
  return t === "enviado_consulta" || t === "en_gestion" || t === "respondido";
}

/** Cuántas órdenes en pipeline tiene el usuario (opcional: excluir un id, p. ej. el borrador que se está enviando). */
async function countPipelineTicketsForUser(userId: number, excludeId: number | null): Promise<number> {
  if (excludeId != null && Number.isFinite(excludeId)) {
    const row = (await db
      .prepare(
        `SELECT COUNT(*) as c FROM marketplace_quote_tickets
         WHERE user_id = ? AND status IN ('enviado_consulta','en_gestion','respondido') AND id != ?`
      )
      .get(userId, excludeId)) as { c: number } | undefined;
    return Number(row?.c) || 0;
  }
  const row = (await db
    .prepare(
      `SELECT COUNT(*) as c FROM marketplace_quote_tickets
       WHERE user_id = ? AND status IN ('enviado_consulta','en_gestion','respondido')`
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

/** POST autenticado (cliente o admin A/B): guardar carrito / marcar consulta por mail o WhatsApp */
const quoteSyncAuth = requireRole("cliente", "admin_a", "admin_b");
marketplaceQuoteTicketsRouter.post("/marketplace/quote-sync", requireAuth, quoteSyncAuth, async (req: Request, res: Response) => {
  try {
    const parsed = SyncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
    }
    const { lines, event, clearPipelineCart } = parsed.data;
    const userId = req.user!.id;
    const userRole = String(req.user!.role ?? "").toLowerCase().trim();
    /** Cliente y admin A/B: una consulta activa; se fusionan cambios del carrito en ese ticket (quote-sync). */
    const singleMarketplaceOrderPolicy =
      userRole === "cliente" || userRole === "admin_a" || userRole === "admin_b";
    const contactEmail = req.user!.email;
    const sessionId = `u:${userId}`;
    const ip = clientIp(req);
    const ua = (typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "").slice(0, 500);
    const nowIso = new Date().toISOString();

    if (lines.length === 0) {
      const ex = (await db
        .prepare("SELECT id, status FROM marketplace_quote_tickets WHERE session_id = ?")
        .get(sessionId)) as { id: number; status: string } | undefined;
      if (ex && ex.status === "borrador") {
        await db.prepare("DELETE FROM marketplace_quote_tickets WHERE id = ?").run(ex.id);
      }
      /** Solo con intención explícita (vaciar carrito con orden en curso). Nunca con el POST vacío post-submit. */
      if (singleMarketplaceOrderPolicy && clearPipelineCart === true) {
        const blocking = (await db
          .prepare(
            `SELECT id, order_number, ticket_code, status FROM marketplace_quote_tickets
             WHERE user_id = ? AND status IN ('enviado_consulta','en_gestion','respondido')
             ORDER BY updated_at DESC LIMIT 1`
          )
          .get(userId)) as
          | { id: number; order_number: string | null; ticket_code: string; status: string }
          | undefined;
        if (blocking) {
          const [setupEquipoCompletoUsd, setupCompraHashrateUsd] = await Promise.all([
            resolveSetupEquipoCompletoUsd(),
            resolveSetupCompraHashrateUsd(),
          ]);
          const { subtotal: mergedSub, lineCount: mergedLc, unitCount: mergedUc } = computeTotals(
            [],
            setupEquipoCompletoUsd,
            setupCompraHashrateUsd
          );
          await db
            .prepare(
              `UPDATE marketplace_quote_tickets SET
                items_json = ?, subtotal_usd = ?, line_count = ?, unit_count = ?, updated_at = ?,
                ip_address = ?, user_agent = ?,
                user_id = ?, contact_email = ?
              WHERE id = ?`
            )
            .run("[]", mergedSub, mergedLc, mergedUc, nowIso, ip, ua, userId, contactEmail, blocking.id);
          const orderNumber = blocking.order_number ?? `ORD-${String(blocking.id).padStart(7, "0")}`;
          return res.json({
            ok: true,
            id: blocking.id,
            orderNumber,
            ticketCode: blocking.ticket_code,
            status: blocking.status,
            merged: true,
            lines: [],
            subtotalUsd: mergedSub,
            lineCount: mergedLc,
            unitCount: mergedUc,
          });
        }
      }
      return res.json({ ok: true, cleared: true });
    }

    const [setupEquipoCompletoUsd, setupCompraHashrateUsd] = await Promise.all([
      resolveSetupEquipoCompletoUsd(),
      resolveSetupCompraHashrateUsd(),
    ]);

    /** Orden en pipeline → fusionar el carrito en ese ticket (mismas refs y estado). */
    if (singleMarketplaceOrderPolicy && lines.length > 0) {
      const blocking = (await db
        .prepare(
          `SELECT id, order_number, ticket_code, status, items_json FROM marketplace_quote_tickets
           WHERE user_id = ? AND status IN ('enviado_consulta','en_gestion','respondido')
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get(userId)) as
        | { id: number; order_number: string | null; ticket_code: string; status: string; items_json: string | null }
        | undefined;
      if (blocking) {
        const orphanDraft = (await db
          .prepare("SELECT id FROM marketplace_quote_tickets WHERE session_id = ? AND status = 'borrador'")
          .get(sessionId)) as { id: number } | undefined;
        if (orphanDraft) {
          await db.prepare("DELETE FROM marketplace_quote_tickets WHERE id = ?").run(orphanDraft.id);
        }

        const mergedLines = mergePipelineCartLines(String(blocking.items_json ?? "[]"), lines);
        const { subtotal: mergedSub, lineCount: mergedLc, unitCount: mergedUc } = computeTotals(
          mergedLines,
          setupEquipoCompletoUsd,
          setupCompraHashrateUsd
        );
        const itemsJsonMerged = JSON.stringify(mergedLines);
        const isSubmitTicketMerge = event === "submit_ticket";
        const contactChannelMerge =
          isSubmitTicketMerge ? "portal" : event === "contact_email" ? "email" : event === "contact_whatsapp" ? "whatsapp" : undefined;
        const keepStatus = String(blocking.status ?? "").trim();
        const stNorm = normalizeTicketStatusDb(keepStatus);
        const terminalMerge = stNorm === "cerrado" || stNorm === "descartado";

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
              keepStatus,
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

        let orderNumber = blocking.order_number ?? `ORD-${String(blocking.id).padStart(7, "0")}`;
        if (!blocking.order_number) {
          await db.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, blocking.id);
        }

        return res.json({
          ok: true,
          id: blocking.id,
          orderNumber,
          ticketCode: blocking.ticket_code,
          status: keepStatus,
          merged: true,
          lines: mergedLines,
          subtotalUsd: mergedSub,
          lineCount: mergedLc,
          unitCount: mergedUc,
        });
      }
    }

    const { subtotal, lineCount, unitCount } = computeTotals(lines, setupEquipoCompletoUsd, setupCompraHashrateUsd);
    const itemsJson = JSON.stringify(lines);
    const isSubmitTicket = event === "submit_ticket";
    const contactChannel =
      isSubmitTicket ? "portal" : event === "contact_email" ? "email" : event === "contact_whatsapp" ? "whatsapp" : undefined;

    const existing = (await db
      .prepare("SELECT id, order_number, ticket_code, status FROM marketplace_quote_tickets WHERE session_id = ?")
      .get(sessionId)) as
      | { id: number; order_number: string | null; ticket_code: string; status: string }
      | undefined;

    if (existing) {
      const exSt = normalizeTicketStatusDb(existing.status);
      const terminal = exSt === "cerrado" || exSt === "descartado";
      const nextStatus = contactChannel ? (terminal ? existing.status : "enviado_consulta") : existing.status;
      if (
        singleMarketplaceOrderPolicy &&
        contactChannel &&
        !terminal &&
        nextStatus === "enviado_consulta" &&
        (await countPipelineTicketsForUser(userId, existing.id)) > 0
      ) {
        const blocking = (await db
          .prepare(
            `SELECT order_number, ticket_code FROM marketplace_quote_tickets
             WHERE user_id = ? AND status IN ('enviado_consulta','en_gestion','respondido') AND id != ?
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
      const orderNumber = existing.order_number ?? `ORD-${String(existing.id).padStart(7, "0")}`;
      if (!existing.order_number) {
        await db.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, existing.id);
      }
      if (
        isSubmitTicket &&
        nextStatus === "enviado_consulta" &&
        existing.status !== "cerrado" &&
        existing.status !== "descartado"
      ) {
        await db
          .prepare("UPDATE marketplace_quote_tickets SET session_id = ? WHERE id = ?")
          .run(submittedSessionId(userId, existing.id), existing.id);
      }
      const prevStatus = String(existing.status ?? "").trim();
      if (isSubmitTicket && nextStatus === "enviado_consulta" && prevStatus === "borrador") {
        void notifyMarketplaceOrderWhatsApp({
          orderNumber,
          ticketCode: existing.ticket_code,
          contactEmail: contactEmail ?? "",
          subtotalUsd: subtotal,
        }).catch((e) => console.error("[whatsapp] marketplace order notify:", e));
      }
      return res.json({
        ok: true,
        id: existing.id,
        orderNumber,
        ticketCode: existing.ticket_code,
        status: nextStatus,
      });
    }

    const ticketCode = genTicketCode();
    const initialStatus = contactChannel ? "enviado_consulta" : "borrador";
    if (
      singleMarketplaceOrderPolicy &&
      contactChannel &&
      initialStatus === "enviado_consulta" &&
      (await countPipelineTicketsForUser(userId, null)) > 0
    ) {
      const blocking = (await db
        .prepare(
          `SELECT order_number, ticket_code FROM marketplace_quote_tickets
           WHERE user_id = ? AND status IN ('enviado_consulta','en_gestion','respondido')
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
        const ins = await db
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
        await db.prepare("UPDATE marketplace_quote_tickets SET order_number = ? WHERE id = ?").run(orderNumber, id);
        if (isSubmitTicket) {
          await db
            .prepare("UPDATE marketplace_quote_tickets SET session_id = ? WHERE id = ?")
            .run(submittedSessionId(userId, id), id);
        }
        insertOk = true;
        if (isSubmitTicket && initialStatus === "enviado_consulta") {
          void notifyMarketplaceOrderWhatsApp({
            orderNumber,
            ticketCode: code,
            contactEmail: contactEmail ?? "",
            subtotalUsd: subtotal,
          }).catch((e) => console.error("[whatsapp] marketplace order notify:", e));
        }
        return res.status(201).json({
          ok: true,
          id,
          orderNumber,
          ticketCode: code,
          status: initialStatus,
        });
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("unique")) continue;
        throw e;
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : "No se pudo crear el ticket";
    return res.status(500).json({ error: { message: msg } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

const ListQuerySchema = z.object({
  status: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

function rowToTicketList(r: Record<string, unknown>) {
  let items: unknown[] = [];
  try {
    items = JSON.parse(String(r.items_json ?? "[]")) as unknown[];
  } catch {
    items = [];
  }
  const ce = r.contact_email != null && String(r.contact_email).trim() !== "" ? String(r.contact_email) : null;
  const uje = r.user_join_email != null && String(r.user_join_email).trim() !== "" ? String(r.user_join_email) : null;
  return {
    id: Number(r.id),
    sessionId: String(r.session_id ?? ""),
    orderNumber: r.order_number != null ? String(r.order_number) : null,
    ticketCode: String(r.ticket_code ?? ""),
    status: String(r.status ?? ""),
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
    contactEmail: ce ?? uje,
    items,
  };
}

/** Listado de tickets del usuario (marketplace): sin borradores; mismo dato que ve el staff en cotizaciones. */
const quoteOwnerAuth = requireRole("cliente", "admin_a", "admin_b");
marketplaceQuoteTicketsRouter.get("/marketplace/my-quote-tickets", requireAuth, quoteOwnerAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const emailNorm = normalizeEmailAddr(req.user!.email);
    const sql = `SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE (
        t.user_id = ? OR (
          t.user_id IS NULL
          AND LOWER(TRIM(COALESCE(t.contact_email, ''))) = ?
        )
      ) AND t.status != 'borrador' ORDER BY t.updated_at DESC LIMIT 100`;
    const rows = (await db.prepare(sql).all(userId, emailNorm)) as Record<string, unknown>[];
    res.json({ tickets: rows.map(rowToTicketList) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
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
      if (!isPipelineStatus(row.status)) {
        return res.status(400).json({
          error: { message: "Solo podés cancelar consultas en curso (enviada, en gestión o respondida)." },
        });
      }
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          "UPDATE marketplace_quote_tickets SET status = 'descartado', updated_at = ?, user_id = COALESCE(user_id, ?) WHERE id = ?"
        )
        .run(nowIso, userId, id);
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg } });
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
    res.json({ ticket: rowToTicketList(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
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
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
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
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** Listado para panel admin */
marketplaceQuoteTicketsRouter.get("/marketplace/quote-tickets", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Parámetros inválidos" } });
    }
    const { status, q, limit = 80, offset = 0 } = parsed.data;
    const params: unknown[] = [];
    let sql = `SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE 1=1`;
    if (status && status !== "all") {
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
    const countSqlBase =
      `SELECT COUNT(*) as c FROM ${TICKET_FROM} WHERE 1=1` +
      (status && status !== "all" ? " AND t.status = ?" : "") +
      (q && q.trim()
        ? " AND (LOWER(COALESCE(t.order_number,'')) LIKE ? OR LOWER(t.ticket_code) LIKE ? OR LOWER(t.items_json) LIKE ? OR LOWER(COALESCE(t.contact_email,'')) LIKE ? OR LOWER(COALESCE(u.email,'')) LIKE ?)"
        : "");
    const countParams: unknown[] = [];
    if (status && status !== "all") countParams.push(status);
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
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** Detalle */
marketplaceQuoteTicketsRouter.get("/marketplace/quote-tickets/:id", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
    const row = (await db.prepare(`SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE t.id = ?`).get(id)) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: { message: "Ticket no encontrado" } });
    res.json({ ticket: rowToTicketList(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
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
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

const PatchSchema = z.object({
  status: z.enum(["borrador", "enviado_consulta", "en_gestion", "respondido", "cerrado", "descartado"]).optional(),
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
    const ex = (await db.prepare("SELECT id FROM marketplace_quote_tickets WHERE id = ?").get(id)) as { id: number } | undefined;
    if (!ex) return res.status(404).json({ error: { message: "Ticket no encontrado" } });

    const nowIso = new Date().toISOString();
    const { status, notesAdmin } = parsed.data;
    if (status === undefined && notesAdmin === undefined) {
      return res.status(400).json({ error: { message: "Indicá estado y/o notas" } });
    }
    if (status !== undefined && notesAdmin !== undefined) {
      await db
        .prepare("UPDATE marketplace_quote_tickets SET status = ?, notes_admin = ?, updated_at = ? WHERE id = ?")
        .run(status, notesAdmin, nowIso, id);
    } else if (status !== undefined) {
      await db.prepare("UPDATE marketplace_quote_tickets SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso, id);
    } else if (notesAdmin !== undefined) {
      await db.prepare("UPDATE marketplace_quote_tickets SET notes_admin = ?, updated_at = ? WHERE id = ?").run(notesAdmin, nowIso, id);
    }
    const row = (await db.prepare(`SELECT ${TICKET_SELECT} FROM ${TICKET_FROM} WHERE t.id = ?`).get(id)) as Record<string, unknown>;
    res.json({ ticket: rowToTicketList(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
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
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
