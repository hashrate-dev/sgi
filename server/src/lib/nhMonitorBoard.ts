import { db } from "../db.js";
import { proxyNiceHashRigs2WithExtras } from "./nicehashExternalRigsMerge.js";
import { nhAcceptedSpeedLooksLikeTh, nhPickPrimaryMiningStat, nhRigSpeedAcceptedFromStats } from "./nhSpeedAccepted.js";
import {
  artDayKey,
  artMonthStartMs,
  ensureCreditDays,
  sumNhCredits,
  syncNhCreditDeltas,
} from "./nhWatcherCreditDeltas.js";
import { persistNhWatcherRigHashSamplesFromPayload } from "./nhWatcherRigHashSamples.js";
import {
  nhSpeedLogRigKey,
  syncNhSpeedLogFromNiceHash,
  upsertNhSpeedLog,
} from "./nhWatcherSpeedLog.js";

const TOTAL_ID = "00000000-0000-0000-0000-000000000001";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type WatcherIn = { id: string; name: string };

type Pair = [number, number];

const boardCache = new Map<string, { at: number; body: Record<string, unknown> }>();

function stripPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  delete out._sgi;
  return out;
}

function spotOf(data: Record<string, unknown>): number | null {
  const sgi = data._sgi;
  if (!sgi || typeof sgi !== "object") return null;
  const n = Number((sgi as { btcSpotUsd?: unknown }).btcSpotUsd);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function liveRigs(payload: Record<string, unknown>): { rigId: string; algorithm: string; label: string; speed: number }[] {
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
    out.push({ rigId, algorithm, label: name, speed: nhRigSpeedAcceptedFromStats(o.stats) ?? 0 });
  }
  return out;
}

function addPair(map: Map<number, number>, t: number, v: number) {
  if (!(v > 0) || !Number.isFinite(t)) return;
  map.set(t, (map.get(t) || 0) + v);
}

function pairsOf(map: Map<number, number>): Pair[] {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function kindOf(algorithm: string, speed: number): "sha" | "scr" {
  const a = algorithm.toUpperCase();
  if (a.includes("SCRYPT")) return "scr";
  if (a.includes("SHA")) return "sha";
  return nhAcceptedSpeedLooksLikeTh(speed) ? "sha" : "scr";
}

async function readWatcherHistory(userId: number, watcherId: string): Promise<{
  rigs: Record<string, Pair[]>;
  sha: Map<number, number>;
  scr: Map<number, number>;
}> {
  const now = Date.now();
  const rows = (await db
    .prepare(
      `SELECT rig_key, sample_t, speed, algorithm
       FROM nh_watcher_rig_speed_log
       WHERE user_id = ? AND watcher_id = ? AND sample_t >= ?
         AND (rig_key LIKE '__fleet:%' OR (rig_key LIKE 'id:%' AND sample_t >= ?))
       ORDER BY sample_t ASC`
    )
    .all(userId, watcherId, now - WEEK_MS, now - DAY_MS)) as Array<Record<string, unknown>>;

  const rigs: Record<string, Pair[]> = {};
  const sha = new Map<number, number>();
  const scr = new Map<number, number>();
  const rigBuf = new Map<string, Pair[]>();
  for (const row of rows) {
    const key = String(row.rig_key ?? "");
    const t = Number(row.sample_t);
    const v = Number(row.speed);
    const algorithm = String(row.algorithm ?? "");
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    if (key.startsWith("__fleet:")) {
      const bucket = kindOf(algorithm || key.slice("__fleet:".length), v) === "sha" ? sha : scr;
      addPair(bucket, t, v);
      continue;
    }
    if (!key.startsWith("id:") || !(v > 0) || t < now - DAY_MS) continue;
    const arr = rigBuf.get(key) || [];
    arr.push([t, v]);
    rigBuf.set(key, arr);
  }
  for (const [key, arr] of rigBuf) rigs[key] = arr;
  return { rigs, sha, scr };
}

async function earningsFor(userId: number, watchers: WatcherIn[]) {
  const fromKey = artDayKey(Math.min(artMonthStartMs(), Date.now() - 14 * DAY_MS));
  const days: Record<string, Record<string, number>> = {};
  const byWatcher: Record<string, number> = {};
  let since: number | null = null;
  for (const w of watchers) {
    await ensureCreditDays(userId, w.id);
    const credited = await sumNhCredits(userId, w.id);
    byWatcher[w.id] = credited.lifetimeBtc;
    const rows = (await db
      .prepare(
        `SELECT day_key, btc FROM nh_watcher_credit_days
         WHERE user_id = ? AND watcher_id = ? AND day_key >= ?`
      )
      .all(userId, w.id, fromKey)) as Array<{ day_key?: unknown; btc?: unknown }>;
    for (const row of rows) {
      const day = String(row.day_key ?? "");
      const btc = Number(row.btc);
      if (!day || !(btc > 0)) continue;
      const bucket = days[day] || (days[day] = {});
      bucket[`${w.id}|${w.name}`] = (bucket[`${w.id}|${w.name}`] || 0) + btc;
    }
    const first = (await db
      .prepare(`SELECT MIN(sample_t) AS mn FROM nh_watcher_credit_deltas WHERE user_id = ? AND watcher_id = ?`)
      .get(userId, w.id)) as { mn?: unknown } | undefined;
    const mn = Number(first?.mn);
    if (Number.isFinite(mn) && mn > 0 && (since == null || mn < since)) since = mn;
  }
  return { since: since ?? Date.now(), days, byWatcher };
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item === undefined) continue;
      out[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function buildNhMonitorBoard(
  userId: number,
  watchers: WatcherIn[],
  refresh: boolean
): Promise<Record<string, unknown>> {
  const key = `${userId}|${watchers.map((w) => w.id).join(",")}`;
  const hit = boardCache.get(key);
  if (!refresh && hit && Date.now() - hit.at < 45_000) return hit.body;

  const payload: Record<string, Record<string, unknown>> = {};
  const err: Record<string, string> = {};
  let btcUsd: number | null = null;
  const live: { id: string; rigs: ReturnType<typeof liveRigs> }[] = [];

  await mapPool(watchers, 4, async (w) => {
    const res = await proxyNiceHashRigs2WithExtras(w.id, null);
    if (!res.ok) {
      err[w.id] = res.message;
      return;
    }
    if (btcUsd == null) btcUsd = spotOf(res.data);
    payload[w.id] = stripPayload(res.data);
    const rigs = liveRigs(res.data);
    live.push({ id: w.id, rigs });
    void persistNhWatcherRigHashSamplesFromPayload(userId, w.id, res.data).catch(() => undefined);
    await upsertNhSpeedLog(
      userId,
      w.id,
      rigs.map((r) => ({
        rigKey: nhSpeedLogRigKey(r.rigId),
        label: r.label,
        t: Date.now(),
        speed: r.speed,
        algorithm: r.algorithm,
      }))
    );
    await syncNhCreditDeltas(userId, w.id);
  });

  const thin: typeof live = [];
  for (const row of live) {
    const hist = await readWatcherHistory(userId, row.id);
    if (hist.sha.size + hist.scr.size < 2) thin.push(row);
  }
  await mapPool(thin.slice(0, 4), 4, (row) => syncNhSpeedLogFromNiceHash(userId, row.id, row.rigs).catch(() => undefined));

  const history: Record<string, Record<string, Pair[]>> = {};
  const totalSha = new Map<number, number>();
  const totalScr = new Map<number, number>();
  for (const w of watchers) {
    const hist = await readWatcherHistory(userId, w.id);
    history[w.id] = {
      ...hist.rigs,
      __nhToolbarSumTh: pairsOf(hist.sha),
      __nhToolbarSumMh: pairsOf(hist.scr),
    };
    for (const [t, v] of hist.sha) addPair(totalSha, t, v);
    for (const [t, v] of hist.scr) addPair(totalScr, t, v);
  }
  history[TOTAL_ID] = {
    __nhToolbarSumTh: pairsOf(totalSha),
    __nhToolbarSumMh: pairsOf(totalScr),
  };

  const earnings = await earningsFor(userId, watchers);
  const body = {
    watchers,
    payload,
    err,
    btcUsd,
    lastPoll: Date.now(),
    history,
    earnings,
  };
  boardCache.set(key, { at: Date.now(), body });
  return body;
}
