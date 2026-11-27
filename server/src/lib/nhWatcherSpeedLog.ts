import { db } from "../db.js";
import { fetchNhFleetSpeedHistory, fetchNhRigSpeedHistory } from "./nicehashExternalHashHistory.js";
import { monitorFleetUserId } from "./monitorFleetUser.js";
import { proxyNiceHashRigs2WithExtras } from "./nicehashExternalRigsMerge.js";

/** Una fila cada 5 minutos: es el paso del historial público de NiceHash. */
export const NH_SPEED_LOG_BUCKET_MS = 5 * 60 * 1000;
/** El gráfico muestra 24 h; el archivo conserva medio año. */
export const NH_SPEED_LOG_RETENTION_MS = 183 * 24 * 60 * 60 * 1000;
const CHART_WINDOW_MS = 24 * 60 * 60 * 1000;
const BACKFILL_MS = 7 * 24 * 60 * 60 * 1000;

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
         DO UPDATE SET
           speed = CASE WHEN excluded.speed > 0 THEN excluded.speed ELSE nh_watcher_rig_speed_log.speed END,
           rig_label = CASE WHEN excluded.rig_label <> '' THEN excluded.rig_label ELSE nh_watcher_rig_speed_log.rig_label END,
           algorithm = CASE WHEN excluded.algorithm <> '' THEN excluded.algorithm ELSE nh_watcher_rig_speed_log.algorithm END`
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
      `SELECT rig_key, MAX(rig_label) AS rig_label, MAX(algorithm) AS algorithm, sample_t, MAX(speed) AS speed
       FROM nh_watcher_rig_speed_log
       WHERE watcher_id = ? AND sample_t >= ?
       GROUP BY rig_key, sample_t
       ORDER BY rig_key ASC, sample_t ASC`
    )
    .all(wid, sinceMs)) as Record<string, unknown>[];

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
  rigs: { rigId: string; algorithm: string; label?: string }[],
  sinceOverride?: number
): Promise<{
  rigs: { rigId: string; points: NhSpeedLogPoint[] }[];
  fleet: { algorithm: string; points: NhSpeedLogPoint[] }[];
}> {
  const wid = watcherId.trim().toLowerCase();
  const now = Date.now();
  const newest = await newestSampleMs(userId, wid);
  const since =
    sinceOverride != null && Number.isFinite(sinceOverride)
      ? sinceOverride
      : newest == null
        ? now - BACKFILL_MS
        : Math.min(newest - 30 * 60 * 1000, now - 6 * 60 * 60 * 1000);
  const windowStart = Math.max(since, now - BACKFILL_MS);
  const [fetched, fleetFetched] = await Promise.all([
    fetchNhRigSpeedHistory(wid, rigs, windowStart),
    fetchNhFleetSpeedHistory(wid, rigs.map((r) => r.algorithm), windowStart),
  ]);
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
  for (const fleet of fleetFetched) {
    for (const p of fleet.points) {
      samples.push({
        rigKey: `__fleet:${fleet.algorithm}`,
        label: fleet.algorithm,
        t: p.t,
        speed: p.v,
        algorithm: fleet.algorithm,
      });
    }
  }
  if (samples.length > 0) await upsertNhSpeedLog(userId, wid, samples);
  const stored = await readNhSpeedLogSince(userId, wid, now - CHART_WINDOW_MS);
  const cutoff = now - CHART_WINDOW_MS;
  const rigRows = stored.filter((r) => !r.rigId.startsWith("__fleet:"));
  const fleetRows = stored.filter((r) => r.rigId.startsWith("__fleet:"));
  return {
    rigs:
      rigRows.length > 0
        ? rigRows.map((r) => ({ rigId: r.rigId, points: r.points }))
        : fetched.map((r) => ({ rigId: r.rigId, points: r.points.filter((p) => p.t >= cutoff) })),
    fleet:
      fleetRows.length > 0
        ? fleetRows.map((r) => ({ algorithm: r.algorithm || r.label, points: r.points }))
        : fleetFetched.map((r) => ({ algorithm: r.algorithm, points: r.points.filter((p) => p.t >= cutoff) })),
  };
}

function viaAccessKey(link: string): string {
  const q = link.match(/[?&]access_key=([a-f0-9]{16,64})/i);
  if (q?.[1]) return q[1].toLowerCase();
  return /^[a-f0-9]{16,64}$/i.test(link) ? link.toLowerCase() : "";
}

async function storedFleetAccounts(): Promise<{
  nicehash: { id: string }[];
  viabtc: { name: string; accessKey: string }[];
}> {
  const row = (await db.prepare(`SELECT body_json FROM monitor_pool_accounts WHERE id = 1`).get()) as
    | { body_json?: unknown }
    | undefined;
  let body: unknown = row?.body_json;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const src = body && typeof body === "object" ? (body as { nicehash?: unknown; viabtc?: unknown }) : {};
  const nicehash: { id: string }[] = [];
  const seen = new Set<string>();
  if (Array.isArray(src.nicehash)) {
    for (const item of src.nicehash) {
      if (!item || typeof item !== "object") continue;
      const id = String((item as { id?: unknown }).id ?? "").trim().toLowerCase();
      if (!/^[0-9a-f-]{36}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      nicehash.push({ id });
    }
  }
  const viabtc: { name: string; accessKey: string }[] = [];
  const seenKey = new Set<string>();
  const seenName = new Set<string>();
  if (Array.isArray(src.viabtc)) {
    for (const item of src.viabtc) {
      if (!item || typeof item !== "object") continue;
      const rec = item as { name?: unknown; link?: unknown };
      const accessKey = viaAccessKey(String(rec.link ?? ""));
      const name = String(rec.name ?? "").trim().slice(0, 48) || "ViaBTC";
      const nameKey = name.toUpperCase().replace(/\s*·\s*[A-Z0-9]+$/, "");
      if (!accessKey || seenKey.has(accessKey) || (nameKey && seenName.has(nameKey))) continue;
      seenKey.add(accessKey);
      if (nameKey) seenName.add(nameKey);
      viabtc.push({ name, accessKey });
    }
  }
  return { nicehash, viabtc };
}

/** Cada minuto, con o sin nadie en el sitio: guarda el estado de todas las cuentas del monitor. */
export async function cronSyncKnownWatcherSpeedLogs(): Promise<{ watchers: number; written: number }> {
  const cutoff = Date.now() - NH_SPEED_LOG_RETENTION_MS;
  await db.prepare(`DELETE FROM nh_watcher_rig_speed_log WHERE sample_t < ?`).run(cutoff);

  const fleetId = await monitorFleetUserId(0);
  if (!(fleetId > 0)) return { watchers: 0, written: 0 };
  const accounts = await storedFleetAccounts();
  const { persistNhWatcherRigHashSamplesFromPayload } = await import("./nhWatcherRigHashSamples.js");

  let written = 0;
  let next = 0;
  const jobs = accounts.nicehash;
  const workers = Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (!job) continue;
      const proxied = await proxyNiceHashRigs2WithExtras(job.id, null);
      if (!proxied.ok) continue;
      written += await persistNhWatcherRigHashSamplesFromPayload(fleetId, job.id, proxied.data).catch(() => 0);
    }
  });
  await Promise.all(workers);

  if (accounts.viabtc.length) {
    const { snapshotViaAccounts } = await import("./viaBtcObserver.js");
    written += await snapshotViaAccounts(accounts.viabtc, fleetId).catch(() => 0);
  }
  return { watchers: jobs.length + accounts.viabtc.length, written };
}
