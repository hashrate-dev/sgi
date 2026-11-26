import { db } from "../db.js";
import { artMonthStartMs } from "./nhWatcherCreditDeltas.js";

const STEP = 5 * 60 * 1000;
const ART = "America/Argentina/Buenos_Aires";

export type UptimeRig = { id: string; key: string };
export type UptimeSide = { label: string; pct: number | null; closed: boolean };
export type UptimeMonths = {
  current: UptimeSide;
  previous: UptimeSide;
  byWatcher: Record<string, { current: UptimeSide; previous: UptimeSide }>;
};

const cache = new Map<string, { at: number; body: UptimeMonths }>();

function monthLabel(ms: number): string {
  const s = new Intl.DateTimeFormat("es-AR", { timeZone: ART, month: "long" }).format(new Date(ms));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tally(
  hits: { t: number; id: string }[],
  rigs: string[],
  from: number,
  to: number,
  now: number
): number | null {
  if (!rigs.length) return null;
  const allow = new Set(rigs);
  const byT = new Map<number, Set<string>>();
  for (const h of hits) {
    if (h.t < from || h.t >= to || !allow.has(h.id)) continue;
    let set = byT.get(h.t);
    if (!set) byT.set(h.t, (set = new Set()));
    set.add(h.id);
  }
  const open = Math.floor(now / STEP) * STEP;
  let on = 0;
  let off = 0;
  for (const [t, set] of byT) {
    const dur = t === open && open >= from && open < to ? Math.min(STEP, Math.max(0, now - open)) : STEP;
    const up = Math.min(rigs.length, set.size);
    on += up * dur;
    off += (rigs.length - up) * dur;
  }
  const known = on + off;
  return known > 0 ? Math.round((on / known) * 1000) / 10 : null;
}

export async function readUptimeMonths(userId: number, watchers: string[], rigsIn: UptimeRig[]): Promise<UptimeMonths> {
  const now = Date.now();
  const currentStart = artMonthStartMs(now);
  const previousStart = artMonthStartMs(currentStart - 24 * 60 * 60 * 1000);
  const ids = [...new Set(watchers.map((id) => id.trim().toLowerCase()).filter(Boolean))].slice(0, 40);
  const rigs = [
    ...new Map(
      rigsIn
        .map((r) => ({ id: r.id.trim().toLowerCase(), key: r.key.trim() }))
        .filter((r) => r.id && r.key.startsWith("id:") && ids.includes(r.id))
        .map((r) => [`${r.id}|${r.key}`, r])
    ).values(),
  ].slice(0, 800);
  const empty = (label: string, closed: boolean): UptimeSide => ({ label, pct: null, closed });
  const currentLabel = monthLabel(currentStart);
  const previousLabel = monthLabel(previousStart);
  const blank = (): UptimeMonths => ({
    current: empty(currentLabel, false),
    previous: empty(previousLabel, true),
    byWatcher: {},
  });
  if (!ids.length || !rigs.length) return blank();

  const cacheKey = `${userId}|${previousStart}|${ids.join(",")}|${rigs.length}`;
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < 60_000) return hit.body;

  const marks = ids.map(() => "?").join(", ");
  const rows = (await db
    .prepare(
      `SELECT watcher_id, rig_key, sample_t
       FROM nh_watcher_rig_speed_log
       WHERE user_id = ? AND sample_t >= ? AND sample_t < ?
         AND speed > 0 AND rig_key LIKE 'id:%'
         AND watcher_id IN (${marks})`
    )
    .all(userId, previousStart, now + STEP, ...ids)) as Array<Record<string, unknown>>;

  const hits = rows
    .map((row) => ({
      t: Number(row.sample_t),
      id: `${String(row.watcher_id ?? "").trim().toLowerCase()}|${String(row.rig_key ?? "").trim()}`,
    }))
    .filter((h) => Number.isFinite(h.t));
  const all = rigs.map((r) => `${r.id}|${r.key}`);
  const byWatcher: UptimeMonths["byWatcher"] = {};
  for (const wid of ids) {
    const mine = rigs.filter((r) => r.id === wid).map((r) => `${r.id}|${r.key}`);
    if (!mine.length) continue;
    byWatcher[wid] = {
      current: { label: currentLabel, pct: tally(hits, mine, currentStart, now + STEP, now), closed: false },
      previous: { label: previousLabel, pct: tally(hits, mine, previousStart, currentStart, now), closed: true },
    };
  }
  const body: UptimeMonths = {
    current: { label: currentLabel, pct: tally(hits, all, currentStart, now + STEP, now), closed: false },
    previous: { label: previousLabel, pct: tally(hits, all, previousStart, currentStart, now), closed: true },
    byWatcher,
  };
  cache.set(cacheKey, { at: now, body });
  return body;
}
