import { readNhSpeedLogSince, upsertNhSpeedLog } from "./nhWatcherSpeedLog.js";
import { allocateViaRigBtc } from "./rigBtcLedger.js";

const HOST = "https://www.viabtc.com";
const UA = "HashrateSGI-MonitorEquiposAsic/1.0";

export type ViaAccountIn = { name: string; accessKey: string };

type ViaWorker = {
  id?: unknown;
  name?: unknown;
  coin?: unknown;
  status?: unknown;
  last_active?: unknown;
  recent_hashrate?: unknown;
  hashrate_1hour?: unknown;
  hashrate_1day?: unknown;
  reject_rate?: unknown;
};

type ViaHome = {
  hash_unit?: unknown;
  total_active?: unknown;
  total_unactive?: unknown;
  account_balance?: unknown;
  profit_24hour?: unknown;
  profit_total?: unknown;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(n) ? n : 0;
}

async function getJson(path: string): Promise<unknown> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(`${HOST}${path}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: ac.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

function okData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as { code?: unknown; data?: unknown };
  if (Number(o.code) !== 0 || !o.data || typeof o.data !== "object") return null;
  return o.data as Record<string, unknown>;
}

function displayHash(rawSol: number, unit: string): number {
  const u = unit.toUpperCase();
  if (u.startsWith("K")) return rawSol / 1000;
  if (u.startsWith("M")) return rawSol / 1_000_000;
  return rawSol;
}

function algoEnum(coin: string): string {
  if (coin === "ZEC") return "EQUIHASH";
  return coin;
}

async function workersOf(accessKey: string, coin: string): Promise<ViaWorker[]> {
  const out: ViaWorker[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = okData(
      await getJson(
        `/res/observer/worker?access_key=${encodeURIComponent(accessKey)}&coin=${encodeURIComponent(coin)}&page=${page}&limit=50`
      )
    );
    const rows = Array.isArray(data?.data) ? (data.data as ViaWorker[]) : [];
    out.push(...rows);
    if (!data || data.has_next !== true) break;
  }
  return out;
}

async function hourSeries(accessKey: string, coin: string): Promise<[number, number][]> {
  const data = okData(
    await getJson(
      `/res/observer/hashrate/chart?access_key=${encodeURIComponent(accessKey)}&coin=${encodeURIComponent(coin)}&interval=hour`
    )
  );
  if (!data) return [];
  const start = Number(data.start);
  const values = Array.isArray(data.hashrate) ? data.hashrate : [];
  if (!Number.isFinite(start) || values.length < 2) return [];
  const step = 60 * 60 * 1000;
  const pts: [number, number][] = [];
  values.forEach((raw, i) => {
    const v = Number(raw);
    if (v > 0) pts.push([start + i * step, v]);
  });
  return pts;
}

const viaCache = new Map<string, { at: number; body: Awaited<ReturnType<typeof buildViaBtcBoardFresh>> }>();

export async function buildViaBtcBoard(
  accounts: ViaAccountIn[],
  userId: number,
  refresh = false
): Promise<{
  watchers: { id: string; name: string }[];
  payload: Record<string, Record<string, unknown>>;
  err: Record<string, string>;
  history: Record<string, Record<string, [number, number][]>>;
}> {
  const key = accounts
    .map((a) => `${a.name}|${a.accessKey.trim().toLowerCase()}`)
    .sort()
    .join("\n");
  const hit = viaCache.get(`${userId}|${key}`);
  if (!refresh && hit && Date.now() - hit.at < 40_000) return hit.body;
  const body = await buildViaBtcBoardFresh(accounts, userId);
  viaCache.set(`${userId}|${key}`, { at: Date.now(), body });
  return body;
}

async function buildViaBtcBoardFresh(accounts: ViaAccountIn[], userId: number): Promise<{
  watchers: { id: string; name: string }[];
  payload: Record<string, Record<string, unknown>>;
  err: Record<string, string>;
  history: Record<string, Record<string, [number, number][]>>;
}> {
  const watchers: { id: string; name: string }[] = [];
  const payload: Record<string, Record<string, unknown>> = {};
  const err: Record<string, string> = {};
  const history: Record<string, Record<string, [number, number][]>> = {};
  const total = new Map<number, number>();

  for (const account of accounts) {
    const key = account.accessKey.trim().toLowerCase();
    const info = okData(await getJson(`/res/observer/info?access_key=${encodeURIComponent(key)}`));
    if (!info) {
      const id = `via:${key}:ZEC`;
      watchers.push({ id, name: account.name });
      err[id] = "ViaBTC no respondió";
      continue;
    }
    const coins = Array.isArray(info.open_coins)
      ? info.open_coins.map((c) => String(c).trim().toUpperCase()).filter(Boolean).slice(0, 8)
      : [];
    if (coins.length === 0 && typeof info.default_coin === "string") coins.push(info.default_coin.toUpperCase());

    let any = false;
    for (const coin of coins) {
      const home = okData(
        await getJson(`/res/observer/home?access_key=${encodeURIComponent(key)}&coin=${encodeURIComponent(coin)}`)
      ) as ViaHome | null;
      if (!home) continue;
      const active = num(home.total_active);
      const inactive = num(home.total_unactive);
      if (active + inactive <= 0) continue;
      const workers = await workersOf(key, coin);
      if (workers.length === 0 && active + inactive <= 0) continue;
      any = true;
      const unit = String(home.hash_unit || (coin === "ZEC" ? "KSol/s" : "H/s"));
      const id = `via:${key}:${coin}`;
      watchers.push({ id, name: `${account.name} · ${coin}` });
      const miningRigs = workers.map((w) => {
        const on = String(w.status || "").toLowerCase() === "active";
        const raw = num(w.recent_hashrate);
        const hr = displayHash(raw, unit);
        const rejectRaw = num(w.reject_rate);
        const ratio = rejectRaw > 0 && rejectRaw <= 1 ? rejectRaw : rejectRaw / 100;
        const rejected = hr > 0 && ratio > 0 && ratio < 1 ? (hr * ratio) / (1 - ratio) : 0;
        const last = num(w.last_active);
        return {
          rigId: String(w.id ?? w.name ?? ""),
          name: String(w.name || w.id || "worker"),
          minerStatus: on ? "MINING" : "OFFLINE",
          statusTime: last > 0 ? last * 1000 : null,
          unpaidAmount: null,
          profitability: null,
          coin,
          hrUnit: unit,
          stats: [
            {
              speedAccepted: on ? hr : 0,
              speedRejectedTotal: on ? rejected : 0,
              algorithm: { enumName: algoEnum(coin), description: coin },
              statsTime: last > 0 ? last * 1000 : null,
            },
          ],
        };
      });
      const shares = workers
        .map((w) => ({
          rigKey: `id:${String(w.id ?? w.name ?? "").trim()}`,
          speed: num(w.hashrate_1day) || num(w.recent_hashrate),
        }))
        .filter((s) => s.rigKey !== "id:" && s.speed > 0);
      await allocateViaRigBtc(userId, id, key, coin, shares).catch(() => undefined);
      payload[id] = {
        pool: "viabtc",
        coin,
        hashUnit: unit,
        miningRigs,
        unpaidAmount: null,
        coinBalance: String(home.account_balance ?? ""),
        profit24: String(home.profit_24hour ?? ""),
        profitTotal: String(home.profit_total ?? ""),
        lastPayoutTimestamp: null,
        nextPayoutTimestamp: null,
      };
      const series = coin === "ZEC" ? await hourSeries(key, coin) : [];
      const samples = [
        ...series.map(([t, v]) => ({
          rigKey: "__fleet:EQUIHASH",
          label: coin,
          t,
          speed: v,
          algorithm: "EQUIHASH",
        })),
        ...miningRigs
          .filter((r) => Number(r.stats[0]?.speedAccepted) > 0)
          .map((r) => ({
            rigKey: `id:${r.rigId}`,
            label: r.name,
            t: Date.now(),
            speed: Number(r.stats[0]?.speedAccepted) || 0,
            algorithm: "EQUIHASH",
          })),
      ];
      try {
        await upsertNhSpeedLog(userId, id, samples);
        const stored = await readNhSpeedLogSince(userId, id, Date.now() - 24 * 60 * 60 * 1000);
        const byRig: Record<string, [number, number][]> = { __nhToolbarSumZec: series };
        for (const row of stored) {
          if (!row.rigId || row.rigId.startsWith("__")) continue;
          byRig[`id:${row.rigId}`] = row.points.filter((p) => p.v > 0).map((p) => [p.t, p.v]);
        }
        history[id] = byRig;
      } catch {
        history[id] = { __nhToolbarSumZec: series };
      }
      for (const [t, v] of series) total.set(t, (total.get(t) || 0) + v);
    }
    if (!any) {
      const id = `via:${key}`;
      watchers.push({ id, name: account.name });
      err[id] = "Esa cuenta de ViaBTC no tiene mineros";
    }
  }

  history["00000000-0000-0000-0000-000000000001"] = {
    __nhToolbarSumZec: [...total.entries()].sort((a, b) => a[0] - b[0]),
  };
  return { watchers, payload, err, history };
}
