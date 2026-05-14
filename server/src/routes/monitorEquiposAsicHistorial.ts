import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireAdminBGrant } from "../middleware/adminBGrant.js";
import { proxyNiceHashRigs2WithExtras } from "../lib/nicehashExternalRigsMerge.js";
import {
  nhRigHashPruneOld,
  nhRigHashTrimPerRig,
  NH_WATCHER_RIG_HASH_RETENTION_MS,
  persistNhWatcherRigHashSamplesFromPayload,
  sampleTimeBucketMs,
} from "../lib/nhWatcherRigHashSamples.js";

export const monitorEquiposAsicHistorialRouter = Router();

const equipoIdParam = z.string().uuid();

const postNiceHashExternalRigsBody = z.object({
  watcherId: equipoIdParam,
  nhWalletApi: z
    .object({
      orgId: z.string().trim().min(1).max(200),
      apiKey: z.string().trim().min(1).max(400),
      apiSecret: z.string().trim().min(1).max(400),
    })
    .optional(),
});

const postHistorialBody = z.object({
  body: z.string().min(1).max(8000).trim(),
});

const historialSummaryBody = z.object({
  equipoIds: z.array(equipoIdParam).max(600),
  /** ISO: la última vez que el usuario abrió y leyó el historial de ese equipo en este navegador. Si falta, todo cuenta como no leído. */
  lastReadAtByEquipo: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
});

/** Solo entradas recientes cuentan para los badges del botón Notas (pelotitas roja/azul). */
const NOTAS_BADGE_RECENT_MS = 20 * 24 * 60 * 60 * 1000;

function normHistorialRow(row: Record<string, unknown>) {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  const id = Number(row.id ?? lower.id);
  return {
    id: Number.isFinite(id) ? id : 0,
    body: String(row.body ?? lower.body ?? ""),
    createdAt: String(row.created_at ?? lower.created_at ?? ""),
    createdByEmail: String(row.created_by_email ?? lower.created_by_email ?? ""),
  };
}

function normHistorialFeedRow(row: Record<string, unknown>) {
  const base = normHistorialRow(row);
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  const equipoId = String(row.equipo_id ?? lower.equipo_id ?? "");
  return { ...base, equipoId };
}

/** Ids sintéticos para filas del feed provenientes de `monitor_equipo_asic_baja` (evita colisión con id de historial). */
const FEED_BAJA_SYNTHETIC_ID_OFFSET = 4_000_000_000;

/** Misma convención que el cliente: feed y modal muestran globo «Equipo dado de baja». */
const MONITOR_HISTORIAL_BAJA_PREFIX = "[[monitor-asic:baja]]";

function labelHintFromBajaSnapshot(snapRaw: unknown): string | undefined {
  let snap: unknown = snapRaw;
  if (typeof snap === "string") {
    try {
      snap = JSON.parse(snap) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return undefined;
  const o = snap as Record<string, unknown>;
  const u = String(o.usuario ?? "").trim();
  const n = String(o.nombreNuevo ?? "").trim();
  const p = [u, n].filter(Boolean).join(" · ");
  return p || undefined;
}

function bajaDbRowToFeedEntry(row: Record<string, unknown>) {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  const dbId = Number(row.id ?? lower.id);
  const equipoId = String(row.equipo_id ?? lower.equipo_id ?? "");
  const motivo = String(row.motivo ?? lower.motivo ?? "").trim();
  const body =
    motivo.length > 0 ? `${MONITOR_HISTORIAL_BAJA_PREFIX}\n${motivo}` : MONITOR_HISTORIAL_BAJA_PREFIX;
  const createdAt = String(row.created_at ?? lower.created_at ?? "");
  const createdByEmail = String(row.created_by_email ?? lower.created_by_email ?? "");
  const sid =
    Number.isFinite(dbId) && dbId > 0 && dbId < 1_000_000_000 ? FEED_BAJA_SYNTHETIC_ID_OFFSET + dbId : FEED_BAJA_SYNTHETIC_ID_OFFSET;
  const snapRaw = row.row_snapshot ?? lower.row_snapshot;
  const equipoLabelHint = labelHintFromBajaSnapshot(snapRaw);
  const base = { id: sid, equipoId, body, createdAt, createdByEmail };
  return equipoLabelHint ? { ...base, equipoLabelHint } : base;
}

type HistorialFeedEntry = ReturnType<typeof normHistorialFeedRow> & { equipoLabelHint?: string };

function mergeHistorialFeedEntries(hist: HistorialFeedEntry[], bajas: HistorialFeedEntry[], limitCap: number): HistorialFeedEntry[] {
  const merged = [...hist, ...bajas];
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const sliced = merged.slice(0, limitCap);
  sliced.sort((a, b) => (a.createdAt > b.createdAt ? 1 : a.createdAt < b.createdAt ? -1 : 0));
  return sliced;
}

const historialFeedBody = z.object({
  equipoIds: z.array(equipoIdParam).max(600),
  /** Últimas N filas globales entre todos los equipos (por fecha), devueltas en orden cronológico para UI tipo chat. */
  limit: z.number().int().min(1).max(500).optional(),
});

const postBajaBody = z.object({
  equipoId: equipoIdParam,
  rowSnapshot: z.unknown(),
  motivo: z
    .string()
    .max(2000)
    .optional()
    .transform((s) => (typeof s === "string" ? s.trim() : "")),
});

const postNhWatcherRigHashBody = z.object({
  watcherId: equipoIdParam,
  samples: z
    .array(
      z.object({
        rigKey: z.string().trim().min(1).max(200),
        t: z.number().int(),
        v: z.number().finite().nonnegative().max(1e20),
      })
    )
    .max(400),
});

function nhRigHashRowNorm(row: Record<string, unknown>): { rigKey: string; t: number; v: number } | null {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  const rigKey = String(row.rig_key ?? lower.rig_key ?? "").trim();
  const t = Number(row.sample_t ?? lower.sample_t);
  const v = Number(row.value ?? lower.value);
  if (!rigKey || !Number.isFinite(t) || !Number.isFinite(v)) return null;
  return { rigKey, t, v };
}

function normBajaListRow(row: Record<string, unknown>) {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  let snap: unknown = row.row_snapshot ?? lower.row_snapshot;
  if (typeof snap === "string") {
    try {
      snap = JSON.parse(snap) as unknown;
    } catch {
      snap = {};
    }
  }
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) snap = {};
  const id = Number(row.id ?? lower.id);
  return {
    id: Number.isFinite(id) ? id : 0,
    equipoId: String(row.equipo_id ?? lower.equipo_id ?? ""),
    rowSnapshot: snap as Record<string, unknown>,
    motivo: String(row.motivo ?? lower.motivo ?? ""),
    createdAt: String(row.created_at ?? lower.created_at ?? ""),
    createdByEmail: String(row.created_by_email ?? lower.created_by_email ?? ""),
  };
}

function isUniqueConstraintError(e: unknown): boolean {
  const o = e as { code?: string; message?: string };
  if (o?.code === "23505") return true;
  const m = o?.message ?? (e instanceof Error ? e.message : String(e));
  return /unique constraint|duplicate key|SQLITE_CONSTRAINT_UNIQUE/i.test(m);
}

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/historial-summary",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = historialSummaryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Body inválido (equipoIds UUID, máx. 600)." } });
      return;
    }
    const { equipoIds, lastReadAtByEquipo } = parsed.data;
    const uniqueIds = [...new Set(equipoIds)];
    const summary: Record<string, { total: number; unread: number }> = {};
    const cutoffIso = new Date(Date.now() - NOTAS_BADGE_RECENT_MS).toISOString();

    const totalStmt = db.prepare(
      `SELECT COUNT(*) AS c FROM monitor_equipo_asic_historial WHERE equipo_id = ? AND created_at >= ?`
    );
    const unreadStmt = db.prepare(
      `SELECT COUNT(*) AS c FROM monitor_equipo_asic_historial WHERE equipo_id = ? AND created_at >= ? AND created_at > ?`
    );

    for (const equipoId of uniqueIds) {
      const totalRow = (await totalStmt.get(equipoId, cutoffIso)) as { c?: unknown } | undefined;
      const rawC = totalRow?.c ?? (totalRow as { C?: unknown })?.C;
      const total = Number(rawC ?? 0);
      const lastRead = lastReadAtByEquipo?.[equipoId];
      let unread = total;
      if (typeof lastRead === "string" && lastRead.trim().length > 0) {
        const unreadRow = (await unreadStmt.get(equipoId, cutoffIso, lastRead.trim())) as { c?: unknown } | undefined;
        const rawU = unreadRow?.c ?? (unreadRow as { C?: unknown })?.C;
        unread = Number(rawU ?? 0);
      }
      summary[equipoId] = { total, unread };
    }

    res.json({ summary });
  }
);

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/historial-feed",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = historialFeedBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Body inválido (equipoIds UUID, limit 1–500)." } });
      return;
    }
    const uniqueIds = [...new Set(parsed.data.equipoIds)];
    const limitCap = Math.min(Math.max(parsed.data.limit ?? 250, 1), 500);

    const rawBajas = (await db
      .prepare(
        `SELECT id, equipo_id, motivo, row_snapshot, created_at, created_by_email FROM monitor_equipo_asic_baja ORDER BY created_at DESC LIMIT 400`
      )
      .all()) as Record<string, unknown>[];
    const fromBajaTable = rawBajas.map((row) => bajaDbRowToFeedEntry(row));

    if (uniqueIds.length === 0) {
      const entries = mergeHistorialFeedEntries([], fromBajaTable, limitCap);
      res.json({ entries });
      return;
    }

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const sql = `
      SELECT id, equipo_id, body, created_at, created_by_email FROM (
        SELECT id, equipo_id, body, created_at, created_by_email
        FROM monitor_equipo_asic_historial
        WHERE equipo_id IN (${placeholders})
        ORDER BY created_at DESC
        LIMIT ?
      ) AS recent_window
      ORDER BY created_at ASC
    `;
    const rawHist = (await db.prepare(sql).all(...uniqueIds, limitCap)) as Record<string, unknown>[];
    const fromHistorial = rawHist
      .map((row) => normHistorialFeedRow(row))
      .filter((e) => !e.body.startsWith(MONITOR_HISTORIAL_BAJA_PREFIX));

    const entries = mergeHistorialFeedEntries(fromHistorial, fromBajaTable, limitCap);
    res.json({ entries });
  }
);

monitorEquiposAsicHistorialRouter.get(
  "/monitor-equipos-asic/historial/:equipoId",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = equipoIdParam.safeParse(req.params.equipoId);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "equipoId inválido" } });
      return;
    }
    const equipoId = parsed.data;
    const raw = (await db
      .prepare(
        `SELECT id, body, created_at, created_by_email FROM monitor_equipo_asic_historial WHERE equipo_id = ? ORDER BY created_at ASC`
      )
      .all(equipoId)) as Record<string, unknown>[];

    const entries = raw.map((row) => normHistorialRow(row));

    res.json({ entries });
  }
);

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/historial/:equipoId",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsedId = equipoIdParam.safeParse(req.params.equipoId);
    if (!parsedId.success) {
      res.status(400).json({ error: { message: "equipoId inválido" } });
      return;
    }
    const equipoId = parsedId.data;

    const parsedBody = postHistorialBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: { message: "Nota inválida (1–8000 caracteres)." } });
      return;
    }
    const note = parsedBody.data.body;
    const user = req.user!;
    const createdAt = new Date().toISOString();

    const ins = await db
      .prepare(
        `INSERT INTO monitor_equipo_asic_historial (equipo_id, body, created_at, created_by_user_id, created_by_email) VALUES (?, ?, ?, ?, ?)`
      )
      .run(equipoId, note, createdAt, user.id, user.email ?? "");

    const newId = ins.lastInsertRowid;
    if (newId == null || Number.isNaN(Number(newId))) {
      res.status(500).json({ error: { message: "No se pudo guardar el registro." } });
      return;
    }

    res.status(201).json({
      entry: {
        id: Number(newId),
        body: note,
        createdAt,
        createdByEmail: user.email ?? "",
      },
    });
  }
);

monitorEquiposAsicHistorialRouter.get(
  "/monitor-equipos-asic/bajas",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (_req: Request, res: Response) => {
    const raw = (await db
      .prepare(
        `SELECT id, equipo_id, row_snapshot, motivo, created_at, created_by_email FROM monitor_equipo_asic_baja ORDER BY created_at DESC LIMIT 500`
      )
      .all()) as Record<string, unknown>[];
    const bajas = raw.map((row) => normBajaListRow(row));
    res.json({ bajas });
  }
);

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/baja",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = postBajaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Datos inválidos para dar de baja (equipoId UUID y snapshot)." } });
      return;
    }
    const { equipoId, motivo } = parsed.data;
    const snapIn = parsed.data.rowSnapshot;
    const snapObj =
      snapIn && typeof snapIn === "object" && !Array.isArray(snapIn) ? (snapIn as Record<string, unknown>) : {};
    const sid = snapObj.equipoId;
    if (typeof sid === "string" && sid.trim() !== equipoId) {
      res.status(400).json({ error: { message: "equipoId y rowSnapshot.equipoId deben coincidir." } });
      return;
    }
    const snapshotJson = JSON.stringify({ ...snapObj, equipoId });
    const user = req.user!;
    const createdAt = new Date().toISOString();
    const historialBody =
      motivo.trim().length > 0 ? `${MONITOR_HISTORIAL_BAJA_PREFIX}\n${motivo.trim()}` : MONITOR_HISTORIAL_BAJA_PREFIX;
    try {
      await db
        .prepare(
          `INSERT INTO monitor_equipo_asic_baja (equipo_id, row_snapshot, motivo, created_by_user_id, created_by_email) VALUES (?, ?, ?, ?, ?)`
        )
        .run(equipoId, snapshotJson, motivo ?? "", user.id, user.email ?? "");
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        res.status(409).json({
          error: {
            message: "Este equipo ya está registrado como dado de baja.",
            code: "MONITOR_BAJA_DUPLICATE",
          },
        });
        return;
      }
      throw e;
    }
    try {
      await db
        .prepare(
          `INSERT INTO monitor_equipo_asic_historial (equipo_id, body, created_at, created_by_user_id, created_by_email) VALUES (?, ?, ?, ?, ?)`
        )
        .run(equipoId, historialBody, createdAt, user.id, user.email ?? "");
    } catch (e) {
      console.error("monitor baja: historial insert:", e);
    }
    res.status(201).json({ ok: true });
  }
);

/** Proxy lectura-only al endpoint público NiceHash «external» (enlace watcher /my/miner/{uuid}). */
monitorEquiposAsicHistorialRouter.get(
  "/monitor-equipos-asic/nicehash-external-rigs/:watcherId",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = equipoIdParam.safeParse(req.params.watcherId);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "watcherId debe ser un UUID válido." } });
      return;
    }
    const watcherId = parsed.data;
    const r = await proxyNiceHashRigs2WithExtras(watcherId, null);
    if (!r.ok) {
      res.status(r.status >= 400 && r.status < 600 ? r.status : 502).json({ error: { message: r.message } });
      return;
    }
    const user = req.user;
    if (user) {
      void persistNhWatcherRigHashSamplesFromPayload(user.id, watcherId, r.data).catch((e) =>
        console.error("nh_watcher_rig_hash persist (GET rigs):", e)
      );
    }
    res.json(r.data);
  }
);

/**
 * Misma respuesta que GET `nicehash-external-rigs/:id`, con cuerpo JSON:
 * `{ watcherId, nhWalletApi?: { orgId, apiKey, apiSecret } }` para leer cartera vía `accounting/accounts2` (Total Assets).
 */
monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/nicehash-external-rigs",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = postNiceHashExternalRigsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Payload inválido (watcherId UUID y opcional nhWalletApi)." } });
      return;
    }
    const { watcherId, nhWalletApi } = parsed.data;
    const r = await proxyNiceHashRigs2WithExtras(watcherId, nhWalletApi ?? null);
    if (!r.ok) {
      res.status(r.status >= 400 && r.status < 600 ? r.status : 502).json({ error: { message: r.message } });
      return;
    }
    const user = req.user;
    if (user) {
      void persistNhWatcherRigHashSamplesFromPayload(user.id, watcherId, r.data).catch((e) =>
        console.error("nh_watcher_rig_hash persist (POST rigs):", e)
      );
    }
    res.json(r.data);
  }
);

monitorEquiposAsicHistorialRouter.get(
  "/monitor-equipos-asic/nicehash-watcher-rig-hash-history/:watcherId",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = equipoIdParam.safeParse(req.params.watcherId);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "watcherId debe ser un UUID válido." } });
      return;
    }
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { message: "No autenticado." } });
      return;
    }
    const wid = parsed.data.trim().toLowerCase();
    await nhRigHashPruneOld(user.id, wid);
    await nhRigHashTrimPerRig(user.id, wid);
    const cutoff = Date.now() - NH_WATCHER_RIG_HASH_RETENTION_MS;
    const rows = (await db
      .prepare(
        `SELECT rig_key, sample_t, value FROM nh_watcher_rig_hash_samples
         WHERE user_id = ? AND watcher_id = ? AND sample_t >= ?
         ORDER BY rig_key ASC, sample_t ASC`
      )
      .all(user.id, wid, cutoff)) as Record<string, unknown>[];
    const series: Record<string, { t: number; v: number }[]> = {};
    for (const row of rows) {
      const p = nhRigHashRowNorm(row);
      if (!p) continue;
      (series[p.rigKey] ??= []).push({ t: p.t, v: p.v });
    }
    res.json({ series });
  }
);

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/nicehash-watcher-rig-hash-history",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = postNhWatcherRigHashBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Body inválido (watcherId UUID, samples máx. 400)." } });
      return;
    }
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { message: "No autenticado." } });
      return;
    }
    const wid = parsed.data.watcherId.trim().toLowerCase();
    const now = Date.now();
    const maxSkewMs = 120_000;
    const maxAgeMs = 10 * 24 * 60 * 60 * 1000;
    const ins = db.prepare(
      `INSERT INTO nh_watcher_rig_hash_samples (user_id, watcher_id, rig_key, sample_t, value) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, watcher_id, rig_key, sample_t) DO NOTHING`
    );
    let inserted = 0;
    for (const s of parsed.data.samples) {
      if (s.t > now + maxSkewMs || now - s.t > maxAgeMs) continue;
      const bucketT = sampleTimeBucketMs(s.t);
      const r = await ins.run(user.id, wid, s.rigKey, bucketT, s.v);
      if (r.changes > 0) inserted += 1;
    }
    await nhRigHashPruneOld(user.id, wid);
    await nhRigHashTrimPerRig(user.id, wid);
    res.json({ ok: true, inserted });
  }
);

const yearMonthParam = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);

const postNhProfitSnapBody = z.object({
  contextKey: z.string().trim().min(8).max(120),
  profitBtc24h: z.number().finite().nonnegative().max(500),
  capturedAtMs: z.number().int().optional(),
});

function normalizeNhProfitContextKey(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t === "fleet:total:v1") return t;
  const m = /^watcher:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(t);
  return m ? `watcher:${m[1]}` : null;
}

function utcMonthRangeMs(ym: string): { start: number; end: number } {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return { start: 0, end: 0 };
  const start = Date.UTC(y, mo - 1, 1);
  const end = mo === 12 ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, mo, 1);
  return { start, end };
}

const NH_PROFIT_SNAP_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

monitorEquiposAsicHistorialRouter.get(
  "/monitor-equipos-asic/nicehash-watcher-profit-month",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const rawKey = typeof req.query.contextKey === "string" ? req.query.contextKey : "";
    const ck = normalizeNhProfitContextKey(rawKey);
    if (!ck) {
      res.status(400).json({ error: { message: "contextKey inválido (watcher:uuid o fleet:total:v1)." } });
      return;
    }
    const ymParsed = yearMonthParam.safeParse(typeof req.query.yearMonth === "string" ? req.query.yearMonth : "");
    if (!ymParsed.success) {
      res.status(400).json({ error: { message: "yearMonth requerido (YYYY-MM)." } });
      return;
    }
    const yearMonth = ymParsed.data;
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { message: "No autenticado." } });
      return;
    }
    const { start, end } = utcMonthRangeMs(yearMonth);
    if (end <= start) {
      res.status(400).json({ error: { message: "yearMonth inválido." } });
      return;
    }
    const row = (await db
      .prepare(
        `SELECT COALESCE(SUM(profit_btc_24h), 0) AS total_btc, COUNT(*) AS n
         FROM nh_watcher_profit_snapshots
         WHERE user_id = ? AND context_key = ? AND snapshot_at >= ? AND snapshot_at < ?`
      )
      .get(user.id, ck, start, end)) as { total_btc?: unknown; n?: unknown } | undefined;
    const totalBtc = Number(row?.total_btc ?? 0);
    const n = Number(row?.n ?? 0);
    res.json({
      yearMonth,
      contextKey: ck,
      totalBtc: Number.isFinite(totalBtc) ? totalBtc : 0,
      snapshotCount: Number.isFinite(n) ? n : 0,
    });
  }
);

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/nicehash-watcher-profit-snapshot",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
    const parsed = postNhProfitSnapBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Body inválido (contextKey, profitBtc24h)." } });
      return;
    }
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { message: "No autenticado." } });
      return;
    }
    const ck = normalizeNhProfitContextKey(parsed.data.contextKey);
    if (!ck) {
      res.status(400).json({ error: { message: "contextKey inválido." } });
      return;
    }
    const now = Date.now();
    const capMs = parsed.data.capturedAtMs;
    const at = typeof capMs === "number" && Number.isFinite(capMs) ? capMs : now;
    if (at > now + 120_000 || now - at > 48 * 3600000) {
      res.status(400).json({ error: { message: "capturedAtMs fuera de rango." } });
      return;
    }
    const lastRow = (await db
      .prepare(
        `SELECT MAX(snapshot_at) AS mx FROM nh_watcher_profit_snapshots WHERE user_id = ? AND context_key = ?`
      )
      .get(user.id, ck)) as { mx?: unknown } | undefined;
    const lastMx = Number(lastRow?.mx);
    if (Number.isFinite(lastMx) && now - lastMx < NH_PROFIT_SNAP_MIN_INTERVAL_MS) {
      res.json({ ok: true, inserted: false, reason: "min_interval" });
      return;
    }
    await db
      .prepare(
        `INSERT INTO nh_watcher_profit_snapshots (user_id, context_key, snapshot_at, profit_btc_24h) VALUES (?, ?, ?, ?)`
      )
      .run(user.id, ck, at, parsed.data.profitBtc24h);
    res.json({ ok: true, inserted: true });
  }
);
