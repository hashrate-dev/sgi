import { db } from "../db.js";
import { artDayKey, artDayStartFromKey, artMonthStartMs } from "./nhWatcherCreditDeltas.js";
import { fillMissingUptimeDays } from "./farmUptime.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 183 * DAY_MS;

export type HistoryCoin = { coin: string; amount: number };
export type HistoryRig = {
  id: string;
  key: string;
  onMs: number;
  offMs: number;
  days: number;
  avgSpeed: number | null;
  samples: number;
  coins: HistoryCoin[];
};
export type RigHistory = {
  from: string;
  to: string;
  retainedFrom: string;
  rigs: HistoryRig[];
};

function finite(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampRange(fromKey: string, toKey: string, now: number): { from: string; to: string; fromMs: number; toMs: number } {
  const today = artDayKey(now);
  const retained = artDayKey(now - KEEP_MS);
  let from = /^\d{4}-\d{2}-\d{2}$/.test(fromKey) ? fromKey : artDayKey(artMonthStartMs(now));
  let to = /^\d{4}-\d{2}-\d{2}$/.test(toKey) ? toKey : today;
  if (from < retained) from = retained;
  if (to > today) to = today;
  if (from > to) from = to;
  return { from, to, fromMs: artDayStartFromKey(from), toMs: artDayStartFromKey(to) };
}

/** Lee prendido, apagado, hashrate medio y lo generado, por equipo, en un rango de hasta 6 meses. */
export async function readRigHistory(userId: number, watchers: string[], fromKey: string, toKey: string): Promise<RigHistory> {
  const now = Date.now();
  const range = clampRange(fromKey, toKey, now);
  const ids = [...new Set(watchers.map((id) => id.trim().toLowerCase()).filter(Boolean))].slice(0, 40);
  const retainedFrom = artDayKey(now - KEEP_MS);
  if (!ids.length || !(range.fromMs > 0)) return { from: range.from, to: range.to, retainedFrom, rigs: [] };

  await fillMissingUptimeDays(userId, ids, range.fromMs, range.toMs);
  const marks = ids.map(() => "?").join(", ");
  const endMs = range.toMs + DAY_MS;
  const [uptime, speeds, credits] = await Promise.all([
    db
      .prepare(
        `SELECT watcher_id, rig_key, SUM(on_ms) AS on_ms, SUM(off_ms) AS off_ms, COUNT(*) AS days
         FROM nh_uptime_day
         WHERE user_id = ? AND day_key >= ? AND day_key <= ? AND watcher_id IN (${marks})
         GROUP BY watcher_id, rig_key`
      )
      .all(userId, range.from, range.to, ...ids) as Promise<Array<Record<string, unknown>>>,
    db
      .prepare(
        `SELECT watcher_id, rig_key, AVG(speed) AS avg_speed, COUNT(*) AS samples
         FROM nh_watcher_rig_speed_log
         WHERE user_id = ? AND sample_t >= ? AND sample_t < ? AND speed > 0
           AND rig_key LIKE 'id:%' AND watcher_id IN (${marks})
         GROUP BY watcher_id, rig_key`
      )
      .all(userId, range.fromMs, endMs, ...ids) as Promise<Array<Record<string, unknown>>>,
    db
      .prepare(
        `SELECT watcher_id, rig_key, UPPER(coin) AS coin, SUM(btc) AS amount
         FROM nh_watcher_rig_btc_ledger
         WHERE user_id = ? AND sample_t >= ? AND sample_t < ? AND btc > 0 AND watcher_id IN (${marks})
         GROUP BY watcher_id, rig_key, UPPER(coin)`
      )
      .all(userId, range.fromMs, endMs, ...ids) as Promise<Array<Record<string, unknown>>>,
  ]);

  const by = new Map<string, HistoryRig>();
  const slot = (wid: string, key: string): HistoryRig => {
    const id = `${wid}|${key}`;
    const prev = by.get(id);
    if (prev) return prev;
    const row: HistoryRig = { id: wid, key, onMs: 0, offMs: 0, days: 0, avgSpeed: null, samples: 0, coins: [] };
    by.set(id, row);
    return row;
  };
  for (const row of uptime) {
    const item = slot(String(row.watcher_id ?? "").toLowerCase(), String(row.rig_key ?? ""));
    item.onMs = finite(row.on_ms);
    item.offMs = finite(row.off_ms);
    item.days = finite(row.days);
  }
  for (const row of speeds) {
    const item = slot(String(row.watcher_id ?? "").toLowerCase(), String(row.rig_key ?? ""));
    const avg = finite(row.avg_speed);
    item.avgSpeed = avg > 0 ? avg : null;
    item.samples = finite(row.samples);
  }
  for (const row of credits) {
    const coin = String(row.coin ?? "BTC").toUpperCase() || "BTC";
    const amount = finite(row.amount);
    if (!(amount > 0)) continue;
    slot(String(row.watcher_id ?? "").toLowerCase(), String(row.rig_key ?? "")).coins.push({ coin, amount });
  }
  const rigs = [...by.values()].filter((r) => r.key.startsWith("id:"));
  for (const rig of rigs) rig.coins.sort((a, b) => a.coin.localeCompare(b.coin));
  rigs.sort((a, b) => b.onMs - a.onMs || a.key.localeCompare(b.key));
  return { from: range.from, to: range.to, retainedFrom, rigs };
}
