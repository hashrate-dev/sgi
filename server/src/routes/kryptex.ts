import { Router } from "express";
import { loadKryptexPoolConfigs } from "../config/kryptexPoolsFromEnv.js";
import { requireAuth } from "../middleware/auth.js";

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 30000; // 30 segundos - datos frescos para S21/L7

const POOL_CONFIGS = loadKryptexPoolConfigs();

export type KryptexWorkerData = {
  name: string;
  hashrate24h: string | null;
  hashrate10m: string | null;
  status: "activo" | "inactivo" | "desconocido";
  poolUrl: string;
  usuario: string;
  modelo: string;
};

let cache: { workers: KryptexWorkerData[]; ts: number } | null = null;

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers, signal: ac.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

function parseWorkerBlock(html: string, workerName: string): Omit<KryptexWorkerData, "poolUrl" | "usuario" | "modelo"> {
  const workerIdx = html.indexOf(workerName);
  if (workerIdx === -1) {
    return { name: workerName, hashrate24h: null, hashrate10m: null, status: "desconocido" };
  }
  // Fragmento: solo el bloque de este worker. S21=TH/s, L7=GH/s.
  const fragment = html.slice(workerIdx, workerIdx + 2500);
  const thAll = [...fragment.matchAll(/([\d.]+)\s*TH\/s/gi)];
  const ghAll = [...fragment.matchAll(/([\d.]+)\s*GH\/s/gi)];
  const hashrate24h = thAll[0] ? `${thAll[0][1]} TH/s` : ghAll[0] ? `${ghAll[0][1]} GH/s` : null;

  // 10m: patrón explícito de Kryptex. Apagado = "0.00 H/s" o "0 H/s". Prendido = "X.XX TH/s" (S21) o "X.XX GH/s" (L7)
  const match10m = fragment.match(/Hashrate\s*\(\s*10\s*m\s*\)\s*:\s*([\d.]+)\s*(TH\/s|GH\/s|H\/s)/i);
  let hashrate10m: string | null = null;
  let value10m = 0;
  if (match10m) {
    const val = match10m[1] ?? "0";
    const unit = match10m[2] ?? "H/s";
    hashrate10m = `${val} ${unit}`;
    value10m = parseFloat(val);
    if (unit.toUpperCase().startsWith("H/") && value10m < 0.001) value10m = 0;
  } else {
    const hsMatch = fragment.match(/Hashrate\s*\(\s*10\s*m\s*\)\s*:\s*([\d.]+)\s*H\/s/i);
    if (hsMatch) {
      hashrate10m = `${hsMatch[1]} H/s`;
      value10m = parseFloat(hsMatch[1] ?? "0");
    } else {
      const useTh = thAll.length > 0;
      const match10mThGh = useTh ? thAll[1] : ghAll[1];
      const fallbackHs = fragment.match(/([\d.]+)\s*H\/s/);
      if (match10mThGh) {
        hashrate10m = useTh ? `${match10mThGh[1]} TH/s` : `${match10mThGh[1]} GH/s`;
        value10m = parseFloat(match10mThGh[1] ?? "0");
      } else if (fallbackHs) {
        hashrate10m = `${fallbackHs[1]} H/s`;
        value10m = parseFloat(fallbackHs[1] ?? "0");
      }
    }
  }
  const status: "activo" | "inactivo" | "desconocido" =
    hashrate10m === null ? "desconocido" : value10m > 0 ? "activo" : "inactivo";
  return { name: workerName, hashrate24h, hashrate10m, status };
}

export const kryptexRouter = Router();

/** Normaliza usuario para comparación: quita @ y normaliza mayúsculas/minúsculas */
function normalizeUsuario(u: string): string {
  return (u ?? "").replace(/^@/, "").trim().toLowerCase();
}

/** Obtiene wallet y pool para un usuario LECTOR según POOL_CONFIGS. Si hay varias configs (ej. Mariri SHA256+SCRYPT), devuelve la primera. */
function getWalletForUsuario(usuario: string): { wallet: string; pool: string } | null {
  if (!usuario?.trim()) return null;
  const norm = normalizeUsuario(usuario);
  const config = POOL_CONFIGS.find((c) => normalizeUsuario(c.usuario) === norm);
  if (!config) return null;
  const m = config.url.match(/\/miner\/stats\/(0x[a-fA-F0-9]+)/);
  const wallet = m?.[1];
  const poolMatch = config.url.match(/pool\.kryptex\.com\/([^/]+)\//);
  const pool = poolMatch?.[1] ?? "quai-scrypt";
  if (!wallet) return null;
  return { wallet, pool };
}

/** GET /api/kryptex/lector-wallet — Para LECTOR: devuelve wallet y pool según users.usuario → POOL_CONFIGS.usuario */
kryptexRouter.get("/kryptex/lector-wallet", requireAuth, (req, res) => {
  if (req.user!.role !== "lector") {
    return res.status(403).json({ error: { message: "Solo usuarios LECTOR pueden usar este endpoint" } });
  }
  const usuario = req.user!.usuario;
  const result = getWalletForUsuario(usuario ?? "");
  if (!result) {
    return res.status(404).json({
      error: {
        message: usuario
          ? `No hay cuenta Kryptex asignada para el usuario "${usuario}". Contactá al administrador.`
          : "No tenés un usuario Kryptex asignado. Contactá al administrador.",
      },
    });
  }
  return res.json(result);
});

kryptexRouter.get("/kryptex/workers", async (req, res) => {
  const now = Date.now();
  const forceRefresh = req.query?.refresh === "1" || req.query?.refresh === "true";
  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) {
    return res.json({ workers: cache.workers });
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };

  try {
    const results = await Promise.all(
      POOL_CONFIGS.map(async (config) => {
        try {
          const html = await fetchWithTimeout(config.url, headers);
          return config.workers.map((workerName) => {
            const parsed = parseWorkerBlock(html, workerName);
            return { ...parsed, poolUrl: config.url, usuario: config.usuario, modelo: config.modelo };
          });
        } catch {
          return config.workers.map((name) => ({
            name,
            hashrate24h: null as string | null,
            hashrate10m: null as string | null,
            status: "desconocido" as const,
            poolUrl: config.url,
            usuario: config.usuario,
            modelo: config.modelo,
          }));
        }
      })
    );
    const allWorkers = results.flat();
    cache = { workers: allWorkers, ts: Date.now() };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ workers: allWorkers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Error al consultar Kryptex: ${msg}` });
  }
});

const payoutsCache = new Map<string, { data: KryptexPayoutsData; ts: number }>();
const PAYOUTS_CACHE_TTL = 60000; // 1 min

export type KryptexPayoutsData = {
  /** Saldo sin confirmar (Unconfirmed Balance en Kryptex Stats) */
  unconfirmed: number;
  unconfirmedUsd: number | null;
  /** Saldo pendiente de pago (Unpaid en Kryptex Payouts) */
  unpaid: number;
  paid: number;
  unpaidUsd: number | null;
  paidUsd: number | null;
  reward7d: number;
  reward30d: number;
  reward7dUsd: number | null;
  reward30dUsd: number | null;
  workers24h: number | null;
  workers: Array<{ name: string; status: "activo" | "inactivo"; hashrate24h: string | null; hashrate10m: string | null; valid: number }>;
  payouts: Array<{ date: string; amount: number; txid: string; status: string }>;
  payoutsUrl: string;
  usuario: string | null;
  /** Datos del gráfico Shares (24h) desde pool.kryptex.com (timestamp, value por bucket) */
  sharesChart?: Array<{ timestamp: number; value: number }>;
};

type ApiPayoutItem = { date: string; amount: string; received: string; status: string; txid: string };
type ApiResponse = { results?: ApiPayoutItem[]; next?: string | null };

async function fetchPayoutsFromApi(pool: string, wallet: string): Promise<{ payouts: KryptexPayoutsData["payouts"]; totalPaid: number }> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/json",
  };
  let url: string | null = `https://pool.kryptex.com/${pool}/api/v1/miner/payouts/${wallet}`;
  const allPayouts: Array<{ date: string; amount: number; txid: string; status: string }> = [];
  let totalPaid = 0;

  while (url) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const json = (await resp.json()) as ApiResponse;
    const results = json.results ?? [];
    for (const r of results) {
      const amount = parseFloat(r.received ?? r.amount ?? "0");
      totalPaid += amount;
      const d = new Date(parseInt(r.date, 10) * 1000);
      allPayouts.push({
        date: d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        amount,
        txid: r.txid ?? "",
        status: r.status ?? "FINISHED",
      });
    }
    url = json.next ?? null;
  }

  return { payouts: allPayouts, totalPaid };
}

/** Extrae datos del gráfico Shares (24h) desde el payload __NUXT__ de Kryptex */
function parseSharesChartFromStats(html: string): Array<{ timestamp: number; value: number }> {
  const chartMatch = html.match(/chart:\[(\{timestamp:\d+,valid:[^}]+\}(?:\,\{timestamp:\d+,valid:[^}]+\})*)\]/);
  if (!chartMatch) return [];

  const argsMatch = html.match(/\}\s*\)\s*\(([\s\S]+)\)\s*\)\s*;?\s*<\/script>/);
  if (!argsMatch?.[1]) return [];

  const paramStr = html.match(/__NUXT__\s*=\s*\(function\s*\(([^)]+)\)/)?.[1] ?? "";
  const params = paramStr.split(",").map((p) => p.trim()).filter(Boolean);
  const argsStr = argsMatch[1];
  const args: (number | string | null | boolean)[] = [];
  let pos = 0;
  while (pos < argsStr.length) {
    const tail = argsStr.slice(pos).replace(/^\s*,?\s*/, "");
    pos = argsStr.length - tail.length;
    if (tail.startsWith("null")) {
      args.push(null);
      pos += 4;
      continue;
    }
    if (tail.startsWith("true")) {
      args.push(true);
      pos += 4;
      continue;
    }
    if (tail.startsWith("false")) {
      args.push(false);
      pos += 5;
      continue;
    }
    const q = tail[0];
    if (q === '"' || q === "'") {
      let end = 1;
      while (end < tail.length) {
        if (tail[end] === "\\") end += 2;
        else if (tail[end] === q) {
          end++;
          break;
        } else end++;
      }
      args.push(tail.slice(1, end - 1));
      pos += end;
      continue;
    }
    const numMatch = tail.match(/^([\d.]+)/);
    if (numMatch?.[1]) {
      const n = parseFloat(numMatch[1]);
      args.push(n);
      pos += numMatch[1].length;
      continue;
    }
    break;
  }

  const paramIdx = new Map<string, number>();
  params.forEach((p, idx) => paramIdx.set(p, idx));

  const chartStr = chartMatch[1] ?? "";
  const entries = chartStr.match(/\{timestamp:(\d+),valid:([^,}]+)/g) ?? [];
  const result: Array<{ timestamp: number; value: number }> = [];

  for (const entry of entries) {
    const tsMatch = entry.match(/timestamp:(\d+)/);
    const validMatch = entry.match(/valid:([^,}]+)/);
    if (!tsMatch?.[1] || !validMatch?.[1]) continue;
    const timestamp = parseInt(tsMatch[1], 10);
    const validRef = validMatch[1].trim();
    let value = 0;
    if (/^\d+$/.test(validRef)) {
      value = parseInt(validRef, 10);
    } else {
      const idx = paramIdx.get(validRef);
      if (idx != null && typeof args[idx] === "number") value = args[idx] as number;
    }
    result.push({ timestamp, value });
  }
  if (result.length > 0) return result;
  const fallback = chartStr.match(/\{timestamp:(\d+),valid:(\d+)/g);
  if (fallback) {
    return fallback.map((m) => {
      const m2 = m.match(/timestamp:(\d+),valid:(\d+)/);
      return { timestamp: parseInt(m2?.[1] ?? "0", 10), value: parseInt(m2?.[2] ?? "0", 10) };
    });
  }
  return [];
}

function parseStatsPageWorkers24h(html: string): number | null {
  const workersSection = html.split(/Workers\s*\(\s*24\s*[hH]\s*\)/i)[1]?.split(/Current Hashrate|Average Hashrate|Unconfirmed/i)[0] ?? "";
  const m = workersSection.match(/<span[^>]*class="[^"]*text-xl[^"]*"[^>]*>(\d+)<\/span>/i) ?? workersSection.match(/>(\d+)</);
  if (m) {
    const n = parseInt(m[1] ?? "0", 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

function parseStatsPageWorkersWithStatus(html: string): Array<{ name: string; status: "activo" | "inactivo"; hashrate24h: string | null; hashrate10m: string | null; valid: number }> {
  const matches = [...html.matchAll(/miner\/stats\/[^/]+\/([A-Za-z0-9_-]+)\/prop/gi)];
  const seen = new Set<string>();
  const result: Array<{ name: string; status: "activo" | "inactivo"; hashrate24h: string | null; hashrate10m: string | null; valid: number }> = [];
  for (const m of matches) {
    const name = (m[1] ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const workerIdx = html.indexOf(name, m.index ?? 0);
    const fragment = workerIdx >= 0 ? html.slice(workerIdx, workerIdx + 2500) : "";
    let valid = 0;
    const validMatch = fragment.match(/Valid\s*:\s*(\d+)/i);
    if (validMatch) {
      valid = parseInt(validMatch[1] ?? "0", 10);
    } else {
      const tdMatch = fragment.match(/<td[^>]*>\s*<span[^>]*>(\d+)<\/span>/);
      if (tdMatch) valid = parseInt(tdMatch[1] ?? "0", 10);
    }
    const thAll = [...fragment.matchAll(/([\d.]+)\s*TH\/s/gi)];
    const ghAll = [...fragment.matchAll(/([\d.]+)\s*GH\/s/gi)];
    const useTh = thAll.length > 0;
    const hashrate24h = useTh && thAll[0] ? `${thAll[0][1]} TH/s` : ghAll[0] ? `${ghAll[0][1]} GH/s` : null;
    const match10m = fragment.match(/Hashrate\s*\(\s*10\s*m\s*\)\s*:\s*([\d.]+)\s*(TH\/s|GH\/s|H\/s)/i);
    let hashrate10m: string | null = null;
    let value10m = 0;
    if (match10m) {
      const val = match10m[1] ?? "0";
      const unit = match10m[2] ?? "H/s";
      hashrate10m = `${val} ${unit}`;
      value10m = parseFloat(val);
      if (unit.toUpperCase().startsWith("H/") && value10m < 0.001) value10m = 0;
    } else {
      const m10 = useTh ? thAll[1] : ghAll[1];
      if (m10) {
        hashrate10m = useTh ? `${m10[1]} TH/s` : `${m10[1]} GH/s`;
        value10m = parseFloat(m10[1] ?? "0");
      }
    }
    const status: "activo" | "inactivo" = value10m > 0 ? "activo" : "inactivo";
    result.push({ name, status, hashrate24h, hashrate10m, valid });
  }
  return result;
}

function parsePayoutsPage(html: string): { unpaid: number; paid: number; reward7d: number; reward30d: number; unpaidUsd: number | null; paidUsd: number | null } {
  const num = (s: string) => parseFloat(String(s).replace(/[^\d.-]/g, "")) || 0;
  let unpaid = 0, paid = 0, reward7d = 0, reward30d = 0;
  let unpaidUsd: number | null = null;
  let paidUsd: number | null = null;

  const unpaidSection = html.split(/\bUnpaid\b/i)[1]?.split(/\bPaid\b/i)[0] ?? "";
  const unpaidM = html.match(/Unpaid\s*[\s\S]*?([\d.]+)\s*(?:NaN|USD)/i);
  if (unpaidM) unpaid = num(unpaidM[1] ?? "0");
  if (unpaid === 0) {
    const unpaidSpanPatterns = [
      /<span[^>]*class="[^"]*text-xl[^"]*"[^>]*>([\d.]+)<\/span>/i,
      /<span[^>]*>([\d.]+)<\/span>/,
      /([\d.]+)\s*(?:NaN|USD)/,
    ];
    for (const re of unpaidSpanPatterns) {
      const m = unpaidSection.match(re);
      if (m) {
        const v = num(m[1] ?? "0");
        if (v >= 0) {
          unpaid = v;
          break;
        }
      }
    }
  }
  const usdSpanPatterns = [
    /<span[^>]*class="[^"]*mt-0[^"]*text-xs[^"]*font-medium[^"]*"[^>]*>([\d.]+)\s*USD\s*<\/span>/i,
    /<span[^>]*class="[^"]*mt-0[^"]*"[^>]*>([\d.]+)\s*USD\s*<\/span>/i,
    /<span[^>]*>([\d.]+)\s*USD\s*<\/span>/i,
    />([\d.]+)\s*USD\s*</,
  ];
  for (const re of usdSpanPatterns) {
    const m = unpaidSection.match(re);
    if (m) {
      const v = num(m[1] ?? "0");
      if (v > 0) {
        unpaidUsd = v;
        break;
      }
    }
  }
  const paidM = html.match(/\bPaid\b\s*[\s\S]*?([\d.]+)\s+([\d.]+|NaN)\s*USD/i);
  if (paidM) {
    paid = num(paidM[1] ?? "0");
    const usdStr = (paidM[2] ?? "").trim();
    if (usdStr && usdStr.toLowerCase() !== "nan") {
      const usdVal = num(usdStr);
      if (!isNaN(usdVal)) paidUsd = usdVal;
    }
  }
  // Reward (7D) y (30D): extraer la sección específica para evitar capturar otros números (ej. Workers)
  const reward7Section = html.split(/Reward\s*\(\s*7\s*D\s*\)/i)[1]?.split(/Reward\s*\(\s*30\s*D\s*\)|\bUnpaid\b/i)[0] ?? "";
  const r7M = reward7Section.match(/([\d]+(?:\.[\d]+)?)\s*(?:NaN|USD)/);
  if (r7M) reward7d = num(r7M[1] ?? "0");
  const reward30Section = html.split(/Reward\s*\(\s*30\s*D\s*\)/i)[1]?.split(/\bUnpaid\b|\bPaid\b/i)[0] ?? "";
  const r30M = reward30Section.match(/([\d]+(?:\.[\d]+)?)\s*(?:NaN|USD)/);
  if (r30M) reward30d = num(r30M[1] ?? "0");

  if (paidUsd == null && paid > 0) {
    const paidSection = html.split(/\bPaid\b/i)[1] ?? "";
    for (const re of usdSpanPatterns) {
      const m = paidSection.match(re);
      if (m) {
        const v = num(m[1] ?? "0");
        if (v > 0) {
          paidUsd = v;
          break;
        }
      }
    }
  }

  return { unpaid, paid, reward7d, reward30d, unpaidUsd, paidUsd };
}

/** Extrae Unconfirmed Balance (solo QUAI) desde la página de Stats de Kryptex.
 *  Ejemplo de bloque:
 *  Unconfirmed Balance
 *  ...
 *  3364.729836
 *  ...
 *  • NaN USD
 */
function parseUnconfirmedFromStatsPage(html: string): { unconfirmed: number; unconfirmedUsd: number | null } {
  const section = html.split(/Unconfirmed Balance/i)[1] ?? "";
  if (!section) return { unconfirmed: 0, unconfirmedUsd: null };
  // Intentar capturar específicamente el valor dentro del span con clase text-sm
  const spanMatch = section.match(/class="[^"]*text-sm[^"]*"[^>]*>\s*([\d.]+)\s*<\/span>/i);
  if (spanMatch?.[1]) {
    const v = parseFloat(spanMatch[1] ?? "0");
    if (!isNaN(v) && v >= 0) {
      return { unconfirmed: v, unconfirmedUsd: null };
    }
  }
  // Fallback: tomar el primer número con decimales dentro del bloque
  const anyMatch = section.match(/(\d+\.\d+)/);
  const unconfirmed = anyMatch ? parseFloat(anyMatch[1] ?? "0") || 0 : 0;
  return { unconfirmed, unconfirmedUsd: null };
}

async function fetchQuaiPriceUsd(): Promise<number | null> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=quai-network&vs_currencies=usd", {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { "quai-network"?: { usd?: number } };
    const price = j["quai-network"]?.usd;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

kryptexRouter.get("/kryptex/payouts", async (req, res) => {
  const wallet = req.query.wallet as string;
  const pool = (req.query.pool as string) || "quai-scrypt";
  if (!wallet || !/^0x[a-fA-F0-9]+$/.test(wallet)) {
    return res.status(400).json({ error: "Wallet inválido" });
  }
  const cacheKey = `${pool}:${wallet}`;
  const forceRefresh = req.query?.refresh === "1" || req.query?.refresh === "true";
  const cached = payoutsCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < PAYOUTS_CACHE_TTL) {
    return res.json(cached.data);
  }
  const payoutsUrl = `https://pool.kryptex.com/${pool}/miner/payouts/${wallet}`;
  const statsUrl = `https://pool.kryptex.com/${pool}/miner/stats/${wallet}`;
  const htmlHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  try {
    const [htmlResp, statsResp, apiData] = await Promise.all([
      fetch(payoutsUrl, { headers: htmlHeaders }).then((r) => (r.ok ? r.text() : Promise.resolve(""))),
      fetch(statsUrl, { headers: htmlHeaders }).then((r) => (r.ok ? r.text() : Promise.resolve(""))),
      fetchPayoutsFromApi(pool, wallet).catch(() => ({ payouts: [] as KryptexPayoutsData["payouts"], totalPaid: 0 })),
    ]);
    const parsed = htmlResp ? parsePayoutsPage(htmlResp) : { unpaid: 0, paid: 0, reward7d: 0, reward30d: 0, unpaidUsd: null, paidUsd: null };
    let paidUsd = parsed.paidUsd;
    let unpaidUsd = parsed.unpaidUsd;
    const quaPrice = await fetchQuaiPriceUsd();
    if (paidUsd == null) {
      const paidAmount = parsed.paid || apiData.totalPaid;
      if (quaPrice != null && paidAmount > 0) paidUsd = Math.round(paidAmount * quaPrice * 100) / 100;
    }
    if (unpaidUsd == null && quaPrice != null && parsed.unpaid > 0) {
      unpaidUsd = Math.round(parsed.unpaid * quaPrice * 100) / 100;
    }
    const workers24h = statsResp ? parseStatsPageWorkers24h(statsResp) : null;
    const workers = statsResp ? parseStatsPageWorkersWithStatus(statsResp) : [];
    const sharesChart = statsResp ? parseSharesChartFromStats(statsResp) : undefined;
    const { unconfirmed, unconfirmedUsd: unconfirmedUsdRaw } = statsResp ? parseUnconfirmedFromStatsPage(statsResp) : { unconfirmed: 0, unconfirmedUsd: null };
    let unconfirmedUsd = unconfirmedUsdRaw;
    if (unconfirmedUsd == null && quaPrice != null && unconfirmed > 0) {
      unconfirmedUsd = Math.round(unconfirmed * quaPrice * 100) / 100;
    }
    const config = POOL_CONFIGS.find(
      (c) => c.url.includes(wallet) && c.url.includes(`/${pool}/`)
    );
    const usuario = config?.usuario ?? null;
    const data: KryptexPayoutsData = {
      unconfirmed,
      unconfirmedUsd,
      unpaid: parsed.unpaid,
      paid: parsed.paid || apiData.totalPaid,
      unpaidUsd,
      paidUsd,
      reward7d: parsed.reward7d,
      reward30d: parsed.reward30d,
      reward7dUsd: null,
      reward30dUsd: null,
      workers24h,
      workers,
      payouts: apiData.payouts,
      payoutsUrl,
      usuario,
      sharesChart,
    };
    payoutsCache.set(cacheKey, { data, ts: Date.now() });
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Error al consultar Kryptex: ${msg}` });
  }
});

kryptexRouter.get("/kryptex/worker/:name", async (req, res) => {
  const workerName = req.params.name;
  if (!workerName || !/^[a-zA-Z0-9_-]+$/.test(workerName)) {
    return res.status(400).json({ error: "Nombre de worker inválido" });
  }
  const config = POOL_CONFIGS.find((c) => c.workers.includes(workerName)) ?? POOL_CONFIGS[0];
  if (!config) {
    return res.status(500).json({ error: "No hay configuración de pools" });
  }
  try {
    const resp = await fetch(config.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) {
      return res.status(502).json({ error: "Kryptex no respondió", status: resp.status });
    }
    const html = await resp.text();
    const data = parseWorkerBlock(html, workerName);
    return res.json({
      worker: data.name,
      status: data.status,
      hashrate24h: data.hashrate24h,
      hashrate10m: data.hashrate10m,
      usuario: config.usuario,
      modelo: config.modelo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Error al consultar Kryptex: ${msg}` });
  }
});
