import { db } from "../db.js";
import { fetchNhRigSpeedHistory } from "./nicehashExternalHashHistory.js";
import { proxyNiceHashRigs2WithExtras } from "./nicehashExternalRigsMerge.js";
import { nhPickPrimaryMiningStat, nhRigSpeedAcceptedFromStats } from "./nhSpeedAccepted.js";

/** Una fila cada 5 minutos: es el paso del historial público de NiceHash. */
export const NH_SPEED_LOG_BUCKET_MS = 5 * 60 * 1000;
/** El gráfico muestra 24 h; el archivo conserva medio año. */
export const NH_SPEED_LOG_RETENTION_MS = 183 * 24 * 60 * 60 * 1000;
const CHART_WINDOW_MS = 24 * 60 * 60 * 1000;
const BACKFILL_MS = 7 * 24 * 60 * 60 * 1000;
const TOOLBAR_WATCHER = "00000000-0000-0000-0000-000000000001";

export type NhSpeedLogPoint = { t: number; v: number };

export type NhSpeedLogSample = {
  rigKey: string;
  label: string;
  t: number;
  speed: number;
  algorithm: string;
};

export function bucketSpeedLogT(epochMs: number): number {
  return Math.floor(epochMs / NH_SPEED_LOG_BUCKET_MS) * NH_SPEED_LOG_BUCKET_MS;
}

export function nhSpeedLogRigKey(rigId: string): string {
  return `id:${rigId.trim()}`;
}

export function nhSpeedLogRigId(rigKey: string): string {
  return rigKey.startsWith("id:") ? rigKey.slice(3) : rigKey;
}

function cleanSample(sample: NhSpeedLogSample, now: number): NhSpeedLogSample | null {
  const rigKey = sample.rigKey.trim().slice(0, 120);
  const t = bucketSpeedLogT(sample.t);
  const speed = sample.speed;
  if (!rigKey || !Number.isFinite(t) || !Number.isFinite(speed)) return null;
  if (speed < 0 || speed > 1e12) return null;
  if (t > now + 10 * 60 * 1000) return null;
  if (now - t > NH_SPEED_LOG_RETENTION_MS) return null;
  return {
    rigKey,
    label: sample.label.trim().slice(0, 120),
    t,
    speed,
    algorithm: sample.algorithm.trim().toUpperCase().slice(0, 40),
  };
}

export async function upsertNhSpeedLog(userId: number, watcherId: string, samples: NhSpeedLogSample[]): Promise<number> {
  const wid = watcherId.trim().toLowerCase();
  if (!wid || !Number.isFinite(userId)) return 0;
  const now = Date.now();
  const byKey = new Map<string, NhSpeedLogSample>();
  for (const sample of samples) {
    const row = cleanSample(sample, now);
    if (!row) continue;
    byKey.set(`${row.rigKey}|${row.t}`, row);
  }
  const rows = [...byKey.values()];
  if (rows.length === 0) return 0;

  let written = 0;
  for (let i = 0; i < rows.length; i += 60) {
    const chunk = rows.slice(i, i + 60);
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params: unknown[] = [];
    for (const row of chunk) params.push(userId, wid, row.rigKey, row.label, row.t, row.speed, row.algorithm);
    const r = await db
      .prepare(
        `INSERT INTO nh_watcher_rig_speed_log (user_id, watcher_id, rig_key, rig_label, sample_t, speed, algorithm)
         VALUES ${values}
         ON CONFLICT (user_id, watcher_id, rig_key, sample_t)
         DO UPDATE SET speed = excluded.speed, rig_label = excluded.rig_label, algorithm = excluded.algorithm`
      )
      .run(...params);
    written += r.changes;
  }
  await db
    .prepare(`DELETE FROM nh_watcher_rig_speed_log WHERE user_id = ? AND watcher_id = ? AND sample_t < ?`)
    .run(userId, wid, now - NH_SPEED_LOG_RETENTION_MS);
  return written;
}

export async function readNhSpeedLogSince(
  userId: number,
  watcherId: string,
  sinceMs: number
): Promise<{ rigId: string; label: string; algorithm: string; points: NhSpeedLogPoint[] }[]> {
  const wid = watcherId.trim().toLowerCase();
  const rows = (await db
    .prepare(
      `SELECT rig_key, rig_label, algorithm, sample_t, speed
       FROM nh_watcher_rig_speed_log
       WHERE user_id = ? AND watcher_id = ? AND sample_t >= ?
       ORDER BY rig_key ASC, sample_t ASC`
    )
    .all(userId, wid, sinceMs)) as Record<string, unknown>[];

  const grouped = new Map<string, { rigId: string; label: string; algorithm: string; points: NhSpeedLogPoint[] }>();
  for (const row of rows) {
    const rigKey = String(row.rig_key ?? "");
    const t = Number(row.sample_t);
    const v = Number(row.speed);
    if (!rigKey || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    let g = grouped.get(rigKey);
    if (!g) {
      g = {
        rigId: nhSpeedLogRigId(rigKey),
        label: String(row.rig_label ?? ""),
        algorithm: String(row.algorithm ?? ""),
        points: [],
      };
      grouped.set(rigKey, g);
    }
    g.points.push({ t, v });
  }
  return [...grouped.values()];
}

async function newestSampleMs(userId: number, watcherId: string): Promise<number | null> {
  const row = (await db
    .prepare(`SELECT MAX(sample_t) AS mx FROM nh_watcher_rig_speed_log WHERE user_id = ? AND watcher_id = ?`)
    .get(userId, watcherId.trim().toLowerCase())) as { mx?: unknown } | undefined;
  const mx = Number(row?.mx);
  return Number.isFinite(mx) && mx > 0 ? mx : null;
}

/**
 * Trae el historial de NiceHash, lo guarda y devuelve las últimas 24 h que quedaron en la base.
 * La primera vez completa hasta 7 días (lo que NiceHash todavía publica). Después solo agrega lo nuevo.
 */
export async function syncNhSpeedLogFromNiceHash(
  userId: number,
  watcherId: string,
  rigs: { rigId: string; algorithm: string; label?: string }[]
): Promise<{ rigId: string; points: NhSpeedLogPoint[] }[]> {
  const wid = watcherId.trim().toLowerCase();
  const now = Date.now();
  const newest = await newestSampleMs(userId, wid);
  const since = newest == null ? now - BACKFILL_MS : Math.min(newest - 30 * 60 * 1000, now - 6 * 60 * 60 * 1000);
  const fetched = await fetchNhRigSpeedHistory(wid, rigs, Math.max(since, now - BACKFILL_MS));
  const labels = new Map(rigs.map((r) => [r.rigId.trim(), (r.label ?? r.rigId).trim()]));
  const algos = new Map(rigs.map((r) => [r.rigId.trim(), r.algorithm.trim().toUpperCase()]));
  const samples: NhSpeedLogSample[] = [];
  for (const rig of fetched) {
    const rigId = rig.rigId.trim();
    for (const p of rig.points) {
      samples.push({
        rigKey: nhSpeedLogRigKey(rigId),
        label: labels.get(rigId) || rigId,
        t: p.t,
        speed: p.v,
        algorithm: algos.get(rigId) || "",
      });
    }
  }
  if (samples.length > 0) await upsertNhSpeedLog(userId, wid, samples);
  const stored = await readNhSpeedLogSince(userId, wid, now - CHART_WINDOW_MS);
  if (stored.length > 0) return stored.map((r) => ({ rigId: r.rigId, points: r.points }));
  const cutoff = now - CHART_WINDOW_MS;
  return fetched.map((r) => ({ rigId: r.rigId, points: r.points.filter((p) => p.t >= cutoff) }));
}

function rigsFromPayload(payload: Record<string, unknown>): { rigId: string; algorithm: string; label: string; speed: number }[] {
  const list = payload.miningRigs;
  if (!Array.isArray(list)) return [];
  const out: { rigId: string; algorithm: string; label: string; speed: number }[] = [];
  for (const rig of list) {
    if (!rig || typeof rig !== "object") continue;
    const o = rig as { rigId?: unknown; name?: unknown; stats?: unknown[] };
    const rigId = typeof o.rigId === "string" ? o.rigId.trim() : "";
    if (!rigId) continue;
    const st = nhPickPrimaryMiningStat(o.stats);
    const algoField = st?.algorithm;
    const algorithm =
      algoField && typeof algoField === "object" && typeof (algoField as { enumName?: unknown }).enumName === "string"
        ? String((algoField as { enumName: string }).enumName).trim()
        : "";
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : rigId;
    const speed = nhRigSpeedAcceptedFromStats(o.stats) ?? 0;
    out.push({ rigId, algorithm, label: name, speed });
  }
  return out;
}

/** Sigue el archivo aunque nadie tenga el monitor abierto: snapshot actual + huecos de las últimas horas. */
export async function cronSyncKnownWatcherSpeedLogs(): Promise<{ watchers: number; written: number }> {
  const cutoff = Date.now() - NH_SPEED_LOG_RETENTION_MS;
  await db.prepare(`DELETE FROM nh_watcher_rig_speed_log WHERE sample_t < ?`).run(cutoff);

  const fromLog = (await db
    .prepare(
      `SELECT user_id, watcher_id, MAX(sample_t) AS mx
       FROM nh_watcher_rig_speed_log
       GROUP BY user_id, watcher_id`
    )
    .all()) as Record<string, unknown>[];
  const fromLive = (await db
    .prepare(
      `SELECT DISTINCT user_id, watcher_id
       FROM nh_watcher_rig_hash_samples
       WHERE watcher_id <> ?`
    )
    .all(TOOLBAR_WATCHER)) as Record<string, unknown>[];

  const ranked = new Map<string, { userId: number; watcherId: string; mx: number }>();
  for (const row of fromLog) {
    const userId = Number(row.user_id);
    const watcherId = String(row.watcher_id ?? "").trim().toLowerCase();
    if (!Number.isFinite(userId) || !/^[0-9a-f-]{36}$/.test(watcherId) || watcherId === TOOLBAR_WATCHER) continue;
    ranked.set(`${userId}|${watcherId}`, { userId, watcherId, mx: Number(row.mx) || 0 });
  }
  for (const row of fromLive) {
    const userId = Number(row.user_id);
    const watcherId = String(row.watcher_id ?? "").trim().toLowerCase();
    if (!Number.isFinite(userId) || !/^[0-9a-f-]{36}$/.test(watcherId)) continue;
    const key = `${userId}|${watcherId}`;
    if (!ranked.has(key)) ranked.set(key, { userId, watcherId, mx: 0 });
  }

  const jobs = [...ranked.values()].sort((a, b) => a.mx - b.mx).slice(0, 4);
  let written = 0;
  for (const job of jobs) {
    const proxied = await proxyNiceHashRigs2WithExtras(job.watcherId, null);
    if (!proxied.ok) continue;
    const rigs = rigsFromPayload(proxied.data);
    if (rigs.length === 0) continue;
    const now = Date.now();
    written += await upsertNhSpeedLog(
      job.userId,
      job.watcherId,
      rigs.map((r) => ({
        rigKey: nhSpeedLogRigKey(r.rigId),
        label: r.label,
        t: now,
        speed: r.speed,
        algorithm: r.algorithm,
      }))
    );
    const synced = await syncNhSpeedLogFromNiceHash(job.userId, job.watcherId, rigs);
    written += synced.reduce((n, r) => n + r.points.length, 0);
  }
  return { watchers: jobs.length, written };
}
