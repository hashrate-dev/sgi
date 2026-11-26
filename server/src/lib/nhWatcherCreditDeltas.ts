import { db } from "../db.js";

const NH_HOST = "https://api2.nicehash.com";
const NH_USER_AGENT = "HashrateSGI-MonitorEquiposAsic/1.0";
const BACKFILL_MS = 8 * 24 * 60 * 60 * 1000;
const ART = "America/Argentina/Buenos_Aires";

const syncedAt = new Map<string, number>();

type CreditPoint = { t: number; delta: number };

function artPart(now: number, type: "year" | "month" | "day"): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  return Number(parts.find((p) => p.type === type)?.value);
}

/** Inicio del día calendario en Argentina (UTC-3). */
export function artDayStartMs(now = Date.now()): number {
  return Date.UTC(artPart(now, "year"), artPart(now, "month") - 1, artPart(now, "day"), 3, 0, 0, 0);
}

export function artDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function artDayStartFromKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d, 3, 0, 0, 0);
}

export function artMonthStartMs(now = Date.now()): number {
  return Date.UTC(artPart(now, "year"), artPart(now, "month") - 1, 1, 3, 0, 0, 0);
}

async function fetchUnpaidDeltas(watcherId: string, sinceMs: number): Promise<CreditPoint[]> {
  const url =
    `${NH_HOST}/main/api/v2/mining/external/${encodeURIComponent(watcherId)}` +
    `/rigs/stats/unpaid?afterTimestamp=${Math.floor(sinceMs)}`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": NH_USER_AGENT },
      signal: ac.signal,
    });
    if (!r.ok) return [];
    const body = (await r.json()) as { columns?: unknown; data?: unknown };
    const cols = Array.isArray(body.columns) ? body.columns.map((c) => String(c)) : [];
    const rows = Array.isArray(body.data) ? body.data : [];
    const timeIdx = Math.max(0, cols.indexOf("time"));
    const deltaIdx = cols.indexOf("delta_amount");
    if (deltaIdx < 0) return [];
    const out: CreditPoint[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const t = Number(row[timeIdx]);
      const delta = Number(row[deltaIdx]);
      if (!Number.isFinite(t) || !Number.isFinite(delta)) continue;
      if (delta <= 0 || delta > 5) continue;
      out.push({ t, delta });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(tid);
  }
}

async function newestCreditMs(userId: number, watcherId: string): Promise<number | null> {
  const row = (await db
    .prepare(`SELECT MAX(sample_t) AS mx FROM nh_watcher_credit_deltas WHERE user_id = ? AND watcher_id = ?`)
    .get(userId, watcherId)) as { mx?: unknown } | undefined;
  const mx = Number(row?.mx);
  return Number.isFinite(mx) && mx > 0 ? mx : null;
}

/** Guarda los BTC que NiceHash acreditó (delta_amount). Repetir la lectura no suma dos veces. */
export async function syncNhCreditDeltas(userId: number, watcherId: string): Promise<number> {
  const wid = watcherId.trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(wid) || wid === "00000000-0000-0000-0000-000000000001") return 0;
  const cacheKey = `${userId}|${wid}`;
  if (Date.now() - (syncedAt.get(cacheKey) ?? 0) < 90_000) return 0;

  const newest = await newestCreditMs(userId, wid);
  const since = newest == null ? Date.now() - BACKFILL_MS : newest - 15 * 60 * 1000;
  const points = await fetchUnpaidDeltas(wid, since);
  syncedAt.set(cacheKey, Date.now());
  if (points.length === 0) return 0;

  const byT = new Map<number, number>();
  for (const p of points) byT.set(p.t, p.delta);
  const rows = [...byT.entries()];
  let written = 0;
  for (let i = 0; i < rows.length; i += 80) {
    const chunk = rows.slice(i, i + 80);
    const values = chunk.map(() => "(?, ?, ?, ?)").join(", ");
    const params: unknown[] = [];
    for (const [t, delta] of chunk) params.push(userId, wid, t, delta);
    const r = await db
      .prepare(
        `INSERT INTO nh_watcher_credit_deltas (user_id, watcher_id, sample_t, delta_btc)
         VALUES ${values}
         ON CONFLICT (user_id, watcher_id, sample_t) DO UPDATE SET delta_btc = excluded.delta_btc`
      )
      .run(...params);
    written += r.changes;
  }
  const days = rows.map(([t]) => artDayKey(t));
  await rebuildCreditDays(userId, wid, days);
  return written;
}

const CREDIT_DAY_KEEP_MS = 183 * 24 * 60 * 60 * 1000;

async function rebuildCreditDays(userId: number, watcherId: string, dayKeys: string[]): Promise<void> {
  const keys = [...new Set(dayKeys)].filter((k) => artDayStartFromKey(k) > 0);
  for (const key of keys) {
    const start = artDayStartFromKey(key);
    const row = (await db
      .prepare(
        `SELECT COALESCE(SUM(delta_btc), 0) AS s
         FROM nh_watcher_credit_deltas
         WHERE user_id = ? AND watcher_id = ? AND sample_t >= ? AND sample_t < ? AND delta_btc > 0`
      )
      .get(userId, watcherId, start, start + 86_400_000)) as { s?: unknown } | undefined;
    const btc = Number(row?.s);
    await db
      .prepare(
        `INSERT INTO nh_watcher_credit_days (user_id, watcher_id, day_key, btc)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, watcher_id, day_key) DO UPDATE SET btc = excluded.btc`
      )
      .run(userId, watcherId, key, Number.isFinite(btc) ? btc : 0);
  }
  const cut = artDayKey(Date.now() - CREDIT_DAY_KEEP_MS);
  await db
    .prepare(`DELETE FROM nh_watcher_credit_days WHERE user_id = ? AND watcher_id = ? AND day_key < ?`)
    .run(userId, watcherId, cut);
}

const creditDaysChecked = new Map<string, number>();

/** Completa los días de BTC acreditado que todavía no están resumidos. */
export async function ensureCreditDays(userId: number, watcherId: string): Promise<void> {
  const cacheKey = `${userId}|${watcherId}`;
  if (Date.now() - (creditDaysChecked.get(cacheKey) ?? 0) < 10 * 60 * 1000) return;
  const rows = (await db
    .prepare(
      `SELECT sample_t FROM nh_watcher_credit_deltas
       WHERE user_id = ? AND watcher_id = ? AND delta_btc > 0`
    )
    .all(userId, watcherId)) as Array<{ sample_t?: unknown }>;
  const keys = [...new Set(rows.map((r) => artDayKey(Number(r.sample_t))).filter(Boolean))];
  const haveRows = (await db
    .prepare(`SELECT day_key FROM nh_watcher_credit_days WHERE user_id = ? AND watcher_id = ?`)
    .all(userId, watcherId)) as Array<{ day_key?: unknown }>;
  const have = new Set(haveRows.map((r) => String(r.day_key ?? "")));
  const missing = keys.filter((k) => !have.has(k));
  if (missing.length) await rebuildCreditDays(userId, watcherId, missing);
  creditDaysChecked.set(cacheKey, Date.now());
}

export async function sumNhCredits(
  userId: number,
  watcherId: string | null
): Promise<{ dayBtc: number; monthBtc: number; lifetimeBtc: number }> {
  const now = Date.now();
  const dayStart = artDayStartMs(now);
  const monthStart = artMonthStartMs(now);
  const row = watcherId
    ? ((await db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN sample_t >= ? THEN delta_btc ELSE 0 END), 0) AS day_btc,
             COALESCE(SUM(CASE WHEN sample_t >= ? THEN delta_btc ELSE 0 END), 0) AS month_btc,
             COALESCE(SUM(delta_btc), 0) AS life_btc
           FROM nh_watcher_credit_deltas
           WHERE user_id = ? AND watcher_id = ? AND delta_btc > 0`
        )
        .get(dayStart, monthStart, userId, watcherId)) as { day_btc?: unknown; month_btc?: unknown; life_btc?: unknown } | undefined)
    : ((await db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN sample_t >= ? THEN delta_btc ELSE 0 END), 0) AS day_btc,
             COALESCE(SUM(CASE WHEN sample_t >= ? THEN delta_btc ELSE 0 END), 0) AS month_btc,
             COALESCE(SUM(delta_btc), 0) AS life_btc
           FROM nh_watcher_credit_deltas
           WHERE user_id = ? AND delta_btc > 0`
        )
        .get(dayStart, monthStart, userId)) as { day_btc?: unknown; month_btc?: unknown; life_btc?: unknown } | undefined);
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  return { dayBtc: n(row?.day_btc), monthBtc: n(row?.month_btc), lifetimeBtc: n(row?.life_btc) };
}

/** Sigue guardando créditos aunque la página esté cerrada. */
export async function cronSyncNhCredits(): Promise<number> {
  const rows = (await db
    .prepare(
      `SELECT DISTINCT user_id, watcher_id FROM nh_watcher_rig_hash_samples
       WHERE watcher_id <> '00000000-0000-0000-0000-000000000001'
       UNION
       SELECT DISTINCT user_id, watcher_id FROM nh_watcher_rig_earnings
       WHERE watcher_id <> '00000000-0000-0000-0000-000000000001'`
    )
    .all()) as Array<{ user_id?: unknown; watcher_id?: unknown }>;
  let n = 0;
  const jobs: { userId: number; watcherId: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const userId = Number(row.user_id);
    const watcherId = String(row.watcher_id ?? "").trim().toLowerCase();
    if (!Number.isFinite(userId) || !/^[0-9a-f-]{36}$/.test(watcherId)) continue;
    const key = `${userId}|${watcherId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ userId, watcherId });
    if (jobs.length >= 12) break;
  }
  for (const job of jobs) {
    n += await syncNhCreditDeltas(job.userId, job.watcherId);
  }
  return n;
}

export async function listCreditWatcherIds(userId: number): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT watcher_id FROM (
         SELECT DISTINCT watcher_id FROM nh_watcher_rig_earnings WHERE user_id = ?
         UNION
         SELECT DISTINCT watcher_id FROM nh_watcher_rig_hash_samples WHERE user_id = ?
         UNION
         SELECT DISTINCT watcher_id FROM nh_watcher_credit_deltas WHERE user_id = ?
       ) s`
    )
    .all(userId, userId, userId)) as Array<{ watcher_id?: unknown }>;
  const ids = new Set<string>();
  for (const row of rows) {
    const id = String(row.watcher_id ?? "").trim().toLowerCase();
    if (/^[0-9a-f-]{36}$/.test(id) && id !== "00000000-0000-0000-0000-000000000001") ids.add(id);
  }
  return [...ids];
}
