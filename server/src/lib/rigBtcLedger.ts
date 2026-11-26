import { db } from "../db.js";
import { artDayStartFromKey, artMonthStartMs } from "./nhWatcherCreditDeltas.js";

const VIA_HOST = "https://www.viabtc.com";
const UA = "HashrateSGI-MonitorEquiposAsic/1.0";
const DAY_MS = 24 * 60 * 60 * 1000;

export type RigShare = {
  rigKey: string;
  speed: number;
  algorithm: string;
  profit: number;
};

type LedgerRow = { rigKey: string; t: number; btc: number; source: string; coin: string };

function finite(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function amountOk(row: LedgerRow): boolean {
  if (!row.rigKey.startsWith("id:") || !(row.btc > 0) || !Number.isFinite(row.t)) return false;
  const coin = row.coin.toUpperCase();
  if (coin === "BTC") return row.btc < 5;
  return row.btc < 1e8;
}

async function insertLedger(userId: number, watcherId: string, rows: LedgerRow[]): Promise<void> {
  const wid = watcherId.trim();
  const clean = rows.filter(amountOk);
  for (let i = 0; i < clean.length; i += 60) {
    const chunk = clean.slice(i, i + 60);
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params: unknown[] = [];
    for (const row of chunk) params.push(userId, wid, row.rigKey, row.t, row.btc, row.source, row.coin);
    await db
      .prepare(
        `INSERT INTO nh_watcher_rig_btc_ledger (user_id, watcher_id, rig_key, sample_t, btc, source, coin)
         VALUES ${values}
         ON CONFLICT (user_id, watcher_id, rig_key, sample_t) DO NOTHING`
      )
      .run(...params);
  }
}

function split(total: number, weights: Map<string, number>, t: number, source: string, coin: string): LedgerRow[] {
  let sum = 0;
  for (const w of weights.values()) if (w > 0) sum += w;
  if (!(total > 0) || !(sum > 0)) return [];
  const out: LedgerRow[] = [];
  let assigned = 0;
  let top: LedgerRow | null = null;
  let topW = -1;
  for (const [rigKey, w] of weights) {
    if (!(w > 0)) continue;
    const row: LedgerRow = { rigKey, t, btc: (total * w) / sum, source, coin };
    out.push(row);
    assigned += row.btc;
    if (w > topW) {
      topW = w;
      top = row;
    }
  }
  if (top) {
    const drift = total - assigned;
    if (Number.isFinite(drift) && Math.abs(drift) <= Math.abs(total) * 1e-6 + 1e-12) top.btc += drift;
  }
  return out;
}

/** Reparte un total del pool con la misma cuenta que el libro. Las partes suman el total. */
export function shareBySpeed(
  total: number,
  shares: { rigKey: string; speed: number }[],
  coin: string
): Record<string, number> {
  const weights = new Map<string, number>();
  for (const s of shares) if (s.rigKey.startsWith("id:") && s.speed > 0) weights.set(s.rigKey, s.speed);
  const out: Record<string, number> = {};
  for (const row of split(total, weights, 0, "viabtc", coin)) out[row.rigKey] = row.btc;
  return out;
}

type SpeedSample = { rigKey: string; t: number; speed: number; algorithm: string };

function weightsAt(samples: SpeedSample[], t: number, live: RigShare[]): Map<string, number> | null {
  const window = (ms: number, priorOnly: boolean) => {
    const best = new Map<string, { dt: number; speed: number; algorithm: string }>();
    for (const s of samples) {
      const dt = priorOnly ? t - s.t : Math.abs(s.t - t);
      if (dt < 0 || dt > ms || !(s.speed > 0)) continue;
      const prev = best.get(s.rigKey);
      if (!prev || dt < prev.dt) best.set(s.rigKey, { dt, speed: s.speed, algorithm: s.algorithm });
    }
    return best;
  };
  const pick = window(30 * 60 * 1000, false).size ? window(30 * 60 * 1000, false) : window(3 * 60 * 60 * 1000, true);
  if (pick.size) {
    const algos = new Set([...pick.values()].map((s) => s.algorithm));
    if (algos.size <= 1) {
      const weights = new Map<string, number>();
      for (const [key, s] of pick) weights.set(key, s.speed);
      return weights;
    }
  }
  if (Date.now() - t > 6 * 60 * 60 * 1000) return null;
  const weights = new Map<string, number>();
  const prof = live.filter((r) => r.profit > 0);
  if (prof.length) {
    for (const r of prof) weights.set(r.rigKey, r.profit);
    return weights;
  }
  const same = live.filter((r) => r.speed > 0);
  const algos = new Set(same.map((r) => r.algorithm));
  if (same.length && algos.size <= 1) {
    for (const r of same) weights.set(r.rigKey, r.speed);
    return weights;
  }
  return null;
}

/** Reparte cada BTC que NiceHash acreditó entre los equipos que estaban minando. */
export async function allocateNiceHashRigBtc(userId: number, watcherId: string, live: RigShare[]): Promise<void> {
  const wid = watcherId.trim().toLowerCase();
  const pending = (await db
    .prepare(
      `SELECT d.sample_t, d.delta_btc
       FROM nh_watcher_credit_deltas d
       WHERE d.user_id = ? AND d.watcher_id = ? AND d.delta_btc > 0
         AND NOT EXISTS (
           SELECT 1 FROM nh_watcher_rig_btc_ledger l
           WHERE l.user_id = d.user_id AND l.watcher_id = d.watcher_id AND l.sample_t = d.sample_t
         )`
    )
    .all(userId, wid)) as Array<{ sample_t?: unknown; delta_btc?: unknown }>;
  if (pending.length === 0) return;
  const oldest = Math.min(...pending.map((p) => finite(p.sample_t)));
  const speedRows = (await db
    .prepare(
      `SELECT rig_key, sample_t, speed, algorithm
       FROM nh_watcher_rig_speed_log
       WHERE user_id = ? AND watcher_id = ? AND rig_key LIKE 'id:%' AND sample_t >= ? AND speed > 0`
    )
    .all(userId, wid, oldest - 3 * 60 * 60 * 1000)) as Array<Record<string, unknown>>;
  const samples: SpeedSample[] = speedRows
    .map((r) => ({
      rigKey: String(r.rig_key ?? ""),
      t: finite(r.sample_t),
      speed: finite(r.speed),
      algorithm: String(r.algorithm ?? "").toUpperCase(),
    }))
    .filter((r) => r.rigKey.startsWith("id:") && r.t > 0 && r.speed > 0);
  const rows: LedgerRow[] = [];
  for (const p of pending) {
    const t = finite(p.sample_t);
    const delta = finite(p.delta_btc);
    const w = weightsAt(samples, t, live);
    if (!w) continue;
    rows.push(...split(delta, w, t, "nicehash", "BTC"));
  }
  await insertLedger(userId, wid, rows);
}

type ViaDay = { day: string; amount: number };

async function viaProfitDays(accessKey: string, coin: string, pages: number): Promise<ViaDay[]> {
  const out: ViaDay[] = [];
  for (let page = 1; page <= pages; page++) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch(
        `${VIA_HOST}/res/observer/profit/detail?access_key=${encodeURIComponent(accessKey)}&coin=${encodeURIComponent(coin)}&page=${page}`,
        { headers: { Accept: "application/json", "User-Agent": UA }, signal: ac.signal }
      );
      if (!r.ok) break;
      const body = (await r.json()) as { code?: unknown; data?: { has_next?: unknown; data?: unknown } };
      if (Number(body.code) !== 0 || !body.data) break;
      const rows = Array.isArray(body.data.data) ? body.data.data : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const o = row as { date?: unknown; total_profit?: unknown; coin?: unknown };
        const day = String(o.date ?? "");
        const rowCoin = String(o.coin ?? coin).trim().toUpperCase();
        if (rowCoin !== coin || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        const amount = finite(o.total_profit);
        if (amount > 0) out.push({ day, amount });
      }
      if (body.data.has_next !== true) break;
    } catch {
      break;
    } finally {
      clearTimeout(tid);
    }
  }
  return out;
}

/** Guarda el crédito diario de ViaBTC en la moneda del pool (ZEC, LTC, DOGE, …) y lo reparte por hashrate. */
export async function allocateViaRigBtc(
  userId: number,
  watcherId: string,
  accessKey: string,
  coin: string,
  shares: { rigKey: string; speed: number }[]
): Promise<void> {
  const unit = coin.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(unit)) return;
  const weights = new Map<string, number>();
  for (const s of shares) if (s.rigKey.startsWith("id:") && s.speed > 0) weights.set(s.rigKey, s.speed);
  if (weights.size === 0) return;
  const wid = watcherId.trim();
  await db
    .prepare(
      `DELETE FROM nh_watcher_rig_btc_ledger
       WHERE user_id = ? AND watcher_id = ? AND source = 'viabtc' AND coin = 'BTC'`
    )
    .run(userId, wid);
  const countRow = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM nh_watcher_rig_btc_ledger
       WHERE user_id = ? AND watcher_id = ? AND source = 'viabtc' AND coin = ?`
    )
    .get(userId, wid, unit)) as { n?: unknown } | undefined;
  const pages = finite(countRow?.n) > 0 ? 1 : 8;
  const days = await viaProfitDays(accessKey, unit, pages);
  const rows: LedgerRow[] = [];
  for (const day of days) {
    const t = artDayStartFromKey(day.day);
    if (!(t > 0) || !(day.amount > 0)) continue;
    rows.push(...split(day.amount, weights, t, "viabtc", unit));
  }
  await insertLedger(userId, wid, rows);
}

export async function readRigBtcTotals(
  userId: number,
  watcherIds: string[]
): Promise<Record<string, { h24: number; life: number; month: number; coin: string }>> {
  const ids = [...new Set(watcherIds.map((id) => id.trim()).filter(Boolean))].slice(0, 24);
  if (ids.length === 0) return {};
  const since = Date.now() - DAY_MS;
  const monthStart = artMonthStartMs();
  const marks = ids.map(() => "?").join(", ");
  const rows = (await db
    .prepare(
      `SELECT watcher_id, rig_key, coin,
              SUM(btc) AS life,
              SUM(CASE WHEN sample_t >= ? THEN btc ELSE 0 END) AS h24,
              SUM(CASE WHEN sample_t >= ? THEN btc ELSE 0 END) AS month
       FROM nh_watcher_rig_btc_ledger
       WHERE user_id = ? AND watcher_id IN (${marks}) AND btc > 0
       GROUP BY watcher_id, rig_key, coin`
    )
    .all(since, monthStart, userId, ...ids)) as Array<Record<string, unknown>>;
  const out: Record<string, { h24: number; life: number; month: number; coin: string }> = {};
  for (const row of rows) {
    const key = `${String(row.watcher_id ?? "")}|${String(row.rig_key ?? "")}`;
    const coin = String(row.coin ?? "BTC").toUpperCase() || "BTC";
    const prev = out[key];
    if (prev && prev.coin !== "BTC" && coin === "BTC") continue;
    out[key] = { h24: finite(row.h24), life: finite(row.life), month: finite(row.month), coin };
  }
  return out;
}
