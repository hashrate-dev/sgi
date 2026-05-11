import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";

export const monitorEquiposAsicHistorialRouter = Router();

const equipoIdParam = z.string().uuid();

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

const historialFeedBody = z.object({
  equipoIds: z.array(equipoIdParam).max(600),
  /** Últimas N filas globales entre todos los equipos (por fecha), devueltas en orden cronológico para UI tipo chat. */
  limit: z.number().int().min(1).max(500).optional(),
});

monitorEquiposAsicHistorialRouter.post(
  "/monitor-equipos-asic/historial-summary",
  requireRole("admin_a", "admin_b"),
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
  async (req: Request, res: Response) => {
    const parsed = historialFeedBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Body inválido (equipoIds UUID, limit 1–500)." } });
      return;
    }
    const uniqueIds = [...new Set(parsed.data.equipoIds)];
    const limitCap = Math.min(Math.max(parsed.data.limit ?? 250, 1), 500);
    if (uniqueIds.length === 0) {
      res.json({ entries: [] });
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
    const raw = (await db
      .prepare(sql)
      .all(...uniqueIds, limitCap)) as Record<string, unknown>[];
    const entries = raw.map((row) => normHistorialFeedRow(row));
    res.json({ entries });
  }
);

monitorEquiposAsicHistorialRouter.get(
  "/monitor-equipos-asic/historial/:equipoId",
  requireRole("admin_a", "admin_b"),
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
