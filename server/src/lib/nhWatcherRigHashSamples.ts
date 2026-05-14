import { db } from "../db.js";

/** Misma ventana que el cliente (~7 días × 1 muestra/min). */
export const NH_WATCHER_RIG_HASH_MAX_POINTS = 60 * 24 * 7;
export const NH_WATCHER_RIG_HASH_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
export const NH_WATCHER_HASH_SAMPLE_MS = 60 * 1000;

export const NH_WATCHER_TOOLBAR_TH_KEY = "__nhToolbarSumTh";
export const NH_WATCHER_TOOLBAR_MH_KEY = "__nhToolbarSumMh";

export function nhWatcherRigStorageKey(rig: { rigId?: string; name?: string }, listIndex: number): string {
  const id = typeof rig.rigId === "string" ? rig.rigId.trim() : "";
  if (id) return `id:${id}`;
  const name = typeof rig.name === "string" ? rig.name.trim() : "";
  if (name) return `name:${name}`;
  return `idx:${listIndex}`;
}

function nhAcceptedSpeedLooksLikeTh(speed: number): boolean {
  if (!Number.isFinite(speed) || speed <= 0) return true;
  if (speed < 1) return false;
  const intPart = Math.floor(Math.abs(speed));
  const intDigits = Math.floor(Math.log10(intPart)) + 1;
  return intDigits >= 3;
}

function sumAcceptedThMhFromMiningRigs(rigs: unknown[]): { sumTh: number; sumMh: number } {
  let sumTh = 0;
  let sumMh = 0;
  for (const rig of rigs) {
    if (!rig || typeof rig !== "object") continue;
    const st = (rig as { stats?: unknown[] }).stats?.[0] as { speedAccepted?: unknown } | undefined;
    const sp = st?.speedAccepted;
    if (typeof sp !== "number" || !Number.isFinite(sp)) continue;
    if (nhAcceptedSpeedLooksLikeTh(sp)) sumTh += sp;
    else sumMh += sp;
  }
  return { sumTh, sumMh };
}

export function sampleTimeBucketMs(epochMs: number): number {
  return Math.floor(epochMs / NH_WATCHER_HASH_SAMPLE_MS) * NH_WATCHER_HASH_SAMPLE_MS;
}

export async function nhRigHashPruneOld(userId: number, watcherId: string): Promise<void> {
  const cutoff = Date.now() - NH_WATCHER_RIG_HASH_RETENTION_MS;
  await db
    .prepare(`DELETE FROM nh_watcher_rig_hash_samples WHERE user_id = ? AND watcher_id = ? AND sample_t < ?`)
    .run(userId, watcherId, cutoff);
}

export async function nhRigHashTrimPerRig(userId: number, watcherId: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM nh_watcher_rig_hash_samples
       WHERE (user_id, watcher_id, rig_key, sample_t) IN (
         SELECT user_id, watcher_id, rig_key, sample_t FROM (
           SELECT user_id, watcher_id, rig_key, sample_t,
             ROW_NUMBER() OVER (PARTITION BY rig_key ORDER BY sample_t DESC) AS rn
           FROM nh_watcher_rig_hash_samples
           WHERE user_id = ? AND watcher_id = ?
         ) sub WHERE sub.rn > ?
       )`
    )
    .run(userId, watcherId, NH_WATCHER_RIG_HASH_MAX_POINTS);
}

/**
 * Tras cada lectura exitosa al proxy NiceHash: guarda en BD una muestra por minuto por rig
 * (misma clave y heurística TH/MH que el cliente), para que el sparkline siga alimentándose
 * aunque falle el POST desde el navegador.
 */
export async function persistNhWatcherRigHashSamplesFromPayload(
  userId: number,
  watcherId: string,
  payload: Record<string, unknown>
): Promise<number> {
  const wid = watcherId.trim().toLowerCase();
  if (!wid) return 0;

  const rawRigs = payload.miningRigs;
  if (!Array.isArray(rawRigs) || rawRigs.length === 0) return 0;

  const lastRows = (await db
    .prepare(
      `SELECT rig_key, MAX(sample_t) AS mx FROM nh_watcher_rig_hash_samples WHERE user_id = ? AND watcher_id = ? GROUP BY rig_key`
    )
    .all(userId, wid)) as Array<{ rig_key?: unknown; mx?: unknown }>;

  const lastRawByKey = new Map<string, number>();
  for (const row of lastRows) {
    const k = String(row.rig_key ?? "").trim();
    const mx = Number(row.mx);
    if (k && Number.isFinite(mx)) lastRawByKey.set(k, mx);
  }

  const lastBucketFor = (rk: string): number | null => {
    const raw = lastRawByKey.get(rk);
    if (raw == null || !Number.isFinite(raw)) return null;
    return sampleTimeBucketMs(raw);
  };

  const now = Date.now();
  const bucketNow = sampleTimeBucketMs(now);

  const ins = db.prepare(
    `INSERT INTO nh_watcher_rig_hash_samples (user_id, watcher_id, rig_key, sample_t, value) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, watcher_id, rig_key, sample_t) DO NOTHING`
  );

  let inserted = 0;

  for (let i = 0; i < rawRigs.length; i++) {
    const rig = rawRigs[i];
    if (!rig || typeof rig !== "object") continue;
    const rk = nhWatcherRigStorageKey(rig as { rigId?: string; name?: string }, i);
    const st = (rig as { stats?: unknown[] }).stats?.[0] as { speedAccepted?: unknown } | undefined;
    const sp = st?.speedAccepted;
    if (typeof sp !== "number" || !Number.isFinite(sp) || sp < 0 || sp > 1e20) continue;

    const lb = lastBucketFor(rk);
    if (lb !== null && bucketNow <= lb) continue;

    const r = await ins.run(userId, wid, rk, bucketNow, sp);
    if (r.changes > 0) {
      inserted += 1;
      lastRawByKey.set(rk, bucketNow);
    }
  }

  const { sumTh, sumMh } = sumAcceptedThMhFromMiningRigs(rawRigs);

  const pushToolbar = async (rigKey: string, v: number) => {
    if (!(typeof v === "number" && Number.isFinite(v) && v > 0)) return;
    const lb = lastBucketFor(rigKey);
    if (lb !== null && bucketNow <= lb) return;
    const r = await ins.run(userId, wid, rigKey, bucketNow, v);
    if (r.changes > 0) {
      inserted += 1;
      lastRawByKey.set(rigKey, bucketNow);
    }
  };

  await pushToolbar(NH_WATCHER_TOOLBAR_TH_KEY, sumTh);
  await pushToolbar(NH_WATCHER_TOOLBAR_MH_KEY, sumMh);

  await nhRigHashPruneOld(userId, wid);
  await nhRigHashTrimPerRig(userId, wid);

  return inserted;
}
