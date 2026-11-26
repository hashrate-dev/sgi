import { db } from "../db.js";
import { artDayKey, artDayStartFromKey, artMonthStartMs } from "./nhWatcherCreditDeltas.js";

const STEP = 5 * 60 * 1000;
const ART = "America/Argentina/Buenos_Aires";

export type UptimeRig = { id: string; key: string };
export type UptimeSide = { label: string; pct: number | null; closed: boolean };
export type UptimeMonths = {
  current: UptimeSide;
  previous: UptimeSide;
  byWatcher: Record<string, { current: UptimeSide; previous: UptimeSide }>;
};

type Hit = { t: number; id: string };
type DayRow = { day: string; wid: string; key: string; on: number; off: number };

function monthLabel(ms: number): string {
  const s = new Intl.DateTimeFormat("es-AR", { timeZone: ART, month: "long" }).format(new Date(ms));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nextDayStart(dayStart: number): number {
  const next = artDayStartFromKey(artDayKey(dayStart + 26 * 60 * 60 * 1000));
  return next > dayStart ? next : dayStart + 24 * 60 * 60 * 1000;
}

/** Parte el tiempo con registro del día: prendido si ese equipo tuvo velocidad, apagado si otro del grupo sí. */
function splitDay(hits: Hit[], rigIds: string[], from: number, to: number, now: number): DayRow[] {
  const allow = new Set(rigIds);
  const byT = new Map<number, Set<string>>();
  for (const h of hits) {
    if (h.t < from || h.t >= to || !allow.has(h.id)) continue;
    let set = byT.get(h.t);
    if (!set) byT.set(h.t, (set = new Set()));
    set.add(h.id);
  }
  if (byT.size === 0) return [];
  const open = Math.floor(now / STEP) * STEP;
  const per = new Map<string, { on: number; off: number }>();
  for (const id of rigIds) per.set(id, { on: 0, off: 0 });
  for (const [t, set] of byT) {
    const dur = t === open && open >= from && open < to ? Math.min(STEP, Math.max(0, now - t)) : STEP;
    if (!(dur > 0)) continue;
    for (const id of rigIds) {
      const row = per.get(id);
      if (!row) continue;
      if (set.has(id)) row.on += dur;
      else row.off += dur;
    }
  }
  const day = artDayKey(from);
  const out: DayRow[] = [];
  for (const [id, row] of per) {
    if (!(row.on + row.off > 0)) continue;
    const bar = id.indexOf("|");
    out.push({ day, wid: id.slice(0, bar), key: id.slice(bar + 1), on: row.on, off: row.off });
  }
  return out;
}

async function saveDays(userId: number, rows: DayRow[], todayKey: string, now: number): Promise<void> {
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40);
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params: unknown[] = [];
    for (const row of chunk) params.push(userId, row.day, row.wid, row.key, Math.round(row.on), Math.round(row.off), now);
    params.push(todayKey, todayKey, todayKey);
    await db
      .prepare(
        `INSERT INTO nh_uptime_day (user_id, day_key, watcher_id, rig_key, on_ms, off_ms, updated_at)
         VALUES ${values}
         ON CONFLICT (user_id, day_key, watcher_id, rig_key) DO UPDATE SET
           on_ms = CASE WHEN excluded.day_key = ? THEN excluded.on_ms ELSE nh_uptime_day.on_ms END,
           off_ms = CASE WHEN excluded.day_key = ? THEN excluded.off_ms ELSE nh_uptime_day.off_ms END,
           updated_at = CASE WHEN excluded.day_key = ? THEN excluded.updated_at ELSE nh_uptime_day.updated_at END`
      )
      .run(...params);
  }
}

function pctOf(on: number, off: number): number | null {
  const known = on + off;
  return known > 0 ? Math.round((on / known) * 1000) / 10 : null;
}

export async function readUptimeMonths(userId: number, watchers: string[], rigsIn: UptimeRig[]): Promise<UptimeMonths> {
  const now = Date.now();
  const currentStart = artMonthStartMs(now);
  const previousStart = artMonthStartMs(currentStart - 24 * 60 * 60 * 1000);
  const nextMonth = artMonthStartMs(currentStart + 32 * 24 * 60 * 60 * 1000);
  const ids = [...new Set(watchers.map((id) => id.trim().toLowerCase()).filter(Boolean))].slice(0, 40);
  const currentLabel = monthLabel(currentStart);
  const previousLabel = monthLabel(previousStart);
  const empty = (label: string, closed: boolean): UptimeSide => ({ label, pct: null, closed });
  const blank = (): UptimeMonths => ({
    current: empty(currentLabel, false),
    previous: empty(previousLabel, true),
    byWatcher: {},
  });
  if (!ids.length) return blank();

  const clientRigs = [
    ...new Map(
      rigsIn
        .map((r) => ({ id: r.id.trim().toLowerCase(), key: r.key.trim() }))
        .filter((r) => ids.includes(r.id) && r.key.startsWith("id:"))
        .map((r) => [`${r.id}|${r.key}`, `${r.id}|${r.key}`])
    ).values(),
  ];

  const marks = ids.map(() => "?").join(", ");
  const samples = (await db
    .prepare(
      `SELECT watcher_id, rig_key, sample_t
       FROM nh_watcher_rig_speed_log
       WHERE user_id = ? AND sample_t >= ? AND sample_t < ?
         AND speed > 0 AND rig_key LIKE 'id:%'
         AND watcher_id IN (${marks})`
    )
    .all(userId, currentStart, now + STEP, ...ids)) as Array<Record<string, unknown>>;

  const hits: Hit[] = [];
  const seen = new Set<string>(clientRigs);
  for (const row of samples) {
    const t = Number(row.sample_t);
    const id = `${String(row.watcher_id ?? "").trim().toLowerCase()}|${String(row.rig_key ?? "").trim()}`;
    if (!Number.isFinite(t) || !id.includes("|")) continue;
    hits.push({ t, id });
    seen.add(id);
  }
  const rigIds = [...seen];
  const todayKey = artDayKey(now);
  const toSave: DayRow[] = [];
  for (let day = currentStart; day <= now; day = nextDayStart(day)) {
    const end = Math.min(nextDayStart(day), nextMonth);
    toSave.push(...splitDay(hits, rigIds, day, end, now));
  }
  if (toSave.length) await saveDays(userId, toSave, todayKey, now).catch(() => undefined);

  const fromKey = artDayKey(previousStart);
  const toKey = artDayKey(nextMonth);
  const stored = (await db
    .prepare(
      `SELECT day_key, watcher_id, on_ms, off_ms
       FROM nh_uptime_day
       WHERE user_id = ? AND day_key >= ? AND day_key < ?
         AND watcher_id IN (${marks})`
    )
    .all(userId, fromKey, toKey, ...ids)) as Array<Record<string, unknown>>;

  const curKey = artDayKey(currentStart);
  const sum = (want: "current" | "previous", wid?: string) => {
    let on = 0;
    let off = 0;
    for (const row of stored) {
      const day = String(row.day_key ?? "");
      const watcher = String(row.watcher_id ?? "");
      if (wid && watcher !== wid) continue;
      const inCurrent = day >= curKey;
      if (want === "current" ? !inCurrent : inCurrent || day < fromKey) continue;
      on += Number(row.on_ms) || 0;
      off += Number(row.off_ms) || 0;
    }
    return pctOf(on, off);
  };

  const byWatcher: UptimeMonths["byWatcher"] = {};
  for (const wid of ids) {
    const current = sum("current", wid);
    const previous = sum("previous", wid);
    if (current == null && previous == null) continue;
    byWatcher[wid] = {
      current: { label: currentLabel, pct: current, closed: false },
      previous: { label: previousLabel, pct: previous, closed: true },
    };
  }
  return {
    current: { label: currentLabel, pct: sum("current"), closed: false },
    previous: { label: previousLabel, pct: sum("previous"), closed: true },
    byWatcher,
  };
}
