import crypto from "node:crypto";
import querystring from "node:querystring";

const NH_HOST = "https://api2.nicehash.com";
const NH_EXCHANGE_RATE_LIST = `${NH_HOST}/main/api/v2/exchangeRate/list`;
const NH_USER_AGENT = "HashrateSGI-MonitorEquiposAsic/1.0";
const COINGECKO_BTC_USD = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

export type NhWalletApiCreds = {
  orgId: string;
  apiKey: string;
  apiSecret: string;
};

export type NiceHashSgiExtras = {
  btcSpotUsd: number | null;
  unpaidUsdSpotEstimate: number | null;
  walletTotalBtc: string | null;
  walletUsdApprox: number | null;
  walletError: string | null;
};

function nhNonce32(): string {
  return crypto.randomBytes(16).toString("hex");
}

function nhBuildXAuth(
  apiKey: string,
  apiSecret: string,
  time: string,
  nonce: string,
  organizationId: string,
  method: string,
  pathOnly: string,
  query: Record<string, string | string[] | undefined> | undefined,
  body: unknown
): string {
  const h = crypto.createHmac("sha256", apiSecret);
  const u = (s: string) => h.update(s);
  u(apiKey);
  u("\0");
  u(time);
  u("\0");
  u(nonce);
  u("\0");
  u("\0");
  if (organizationId) u(organizationId);
  u("\0");
  u("\0");
  u(method);
  u("\0");
  u(pathOnly);
  u("\0");
  if (query && Object.keys(query).length > 0) {
    u(querystring.stringify(query as Record<string, string>));
  }
  if (body !== undefined && body !== null && body !== "") {
    u("\0");
    u(typeof body === "object" ? JSON.stringify(body) : String(body));
  }
  return `${apiKey}:${h.digest("hex")}`;
}

function parseAmountString(s: unknown): number | null {
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s !== "string") return null;
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function accounts2Rows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.currencies)) return o.currencies;
    if (Array.isArray(o.accounts)) return o.accounts;
  }
  return [];
}

/** Balance BTC total por fila `accounts2` (equiv. cartera «Total Assets» cuando casi todo es BTC). */
export function extractTotalBtcFromAccounts2(body: unknown): string | null {
  const rows = accounts2Rows(body);
  let sum = 0;
  let any = false;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const cur = String(o.currency ?? o.id ?? "").trim().toUpperCase();
    if (cur !== "BTC") continue;
    let n: number | null = null;
    for (const k of ["totalBalance", "balance"]) {
      n = parseAmountString(o[k]);
      if (n != null && n >= 0) break;
    }
    if (n != null && n >= 0) {
      sum += n;
      any = true;
    }
  }
  if (!any) return null;
  return sum.toFixed(8);
}

type NhExchangeRow = { fromCurrency?: string; toCurrency?: string; exchangeRate?: string };

/** Tipo BTC→USD (o BTC→USDT) del listado público NiceHash; alineado con la web del watcher. */
function parseBtcUsdFromNiceHashExchangeListJson(body: unknown): number | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const list = (body as { list?: unknown }).list;
  if (!Array.isArray(list)) return null;
  const pairs: Array<[string, string]> = [
    ["BTC", "USD"],
    ["BTC", "USDT"],
  ];
  for (const [wantFrom, wantTo] of pairs) {
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const o = row as NhExchangeRow;
      if (String(o.fromCurrency).toUpperCase() !== wantFrom || String(o.toCurrency).toUpperCase() !== wantTo) continue;
      const n = parseAmountString(o.exchangeRate);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

export async function fetchBtcUsdFromNiceHashExchangeList(): Promise<number | null> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(NH_EXCHANGE_RATE_LIST, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": NH_USER_AGENT },
      signal: ac.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return null;
    const j = (await r.json()) as unknown;
    return parseBtcUsdFromNiceHashExchangeListJson(j);
  } catch {
    clearTimeout(tid);
    return null;
  }
}

export async function proxyNiceHashRigs2WithExtras(
  watcherId: string,
  walletCreds?: NhWalletApiCreds | null
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  const url = `https://api2.nicehash.com/main/api/v2/mining/external/${encodeURIComponent(watcherId)}/rigs2`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 18000);
  try {
    const nhRes = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": NH_USER_AGENT,
      },
      signal: ac.signal,
    });
    clearTimeout(tid);
    const text = await nhRes.text();
    let body: unknown;
    try {
      body = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      return { ok: false, status: 502, message: "NiceHash devolvió una respuesta no JSON." };
    }
    if (!nhRes.ok) {
      const o = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      const msg = typeof o.message === "string" && o.message.trim() ? o.message.trim() : nhRes.statusText;
      return { ok: false, status: 502, message: `NiceHash (${nhRes.status}): ${msg}` };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 502, message: "NiceHash devolvió un JSON inesperado." };
    }
    const obj = body as Record<string, unknown>;
    const extras = await buildSgiExtrasForRigs2(obj, walletCreds ?? null);
    return { ok: true, data: { ...obj, _sgi: extras } };
  } catch (e) {
    clearTimeout(tid);
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: 502,
      message: aborted ? "Tiempo de espera al consultar NiceHash." : "No se pudo contactar NiceHash.",
    };
  }
}

export async function fetchBtcSpotUsd(): Promise<number | null> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(COINGECKO_BTC_USD, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "HashrateSGI-NiceHashMerge/1.0" },
      signal: ac.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return null;
    const j = (await r.json()) as { bitcoin?: { usd?: number } };
    const n = j?.bitcoin?.usd;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

export async function fetchNiceHashAccounts2TotalBtc(creds: NhWalletApiCreds): Promise<{ btc: string | null; error: string | null }> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 15000);
  try {
    const tr = await fetch(`${NH_HOST}/api/v2/time`, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "HashrateSGI-NiceHashMerge/1.0" },
      signal: ac.signal,
    });
    if (!tr.ok) {
      clearTimeout(tid);
      return { btc: null, error: `NiceHash time (${tr.status})` };
    }
    const tj = (await tr.json()) as { serverTime?: number };
    const st = typeof tj.serverTime === "number" ? tj.serverTime : NaN;
    if (!Number.isFinite(st)) {
      clearTimeout(tid);
      return { btc: null, error: "NiceHash time inválido" };
    }
    const localDiff = st - Date.now();
    const ts = String(Date.now() + localDiff);
    const nonce = nhNonce32();
    const pathOnly = "/main/api/v2/accounting/accounts2/";
    const xAuth = nhBuildXAuth(creds.apiKey, creds.apiSecret, ts, nonce, creds.orgId.trim(), "GET", pathOnly, undefined, undefined);
    const res = await fetch(`${NH_HOST}${pathOnly}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Request-Id": nonce,
        "X-Nonce": nonce,
        "X-Time": ts,
        "X-Organization-Id": creds.orgId.trim(),
        "X-Auth": xAuth,
        "X-User-Agent": "HashrateSGI-NiceHashMerge/1.0",
        "X-User-Lang": "es",
      },
      signal: ac.signal,
    });
    clearTimeout(tid);
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      return { btc: null, error: "NiceHash accounting: respuesta no JSON" };
    }
    if (!res.ok) {
      const o = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      const msg = typeof o.message === "string" && o.message.trim() ? o.message.trim() : res.statusText;
      return { btc: null, error: `NiceHash accounting (${res.status}): ${msg}` };
    }
    const btc = extractTotalBtcFromAccounts2(body);
    return { btc, error: btc == null ? "No se pudo leer BTC en accounts2 (revisá permisos de la API key)." : null };
  } catch (e) {
    clearTimeout(tid);
    const aborted = e instanceof Error && e.name === "AbortError";
    return { btc: null, error: aborted ? "Tiempo de espera (accounting NiceHash)." : "Fallo al consultar accounting NiceHash." };
  }
}

export async function buildSgiExtrasForRigs2(
  rigs2: Record<string, unknown>,
  walletCreds?: NhWalletApiCreds | null
): Promise<NiceHashSgiExtras> {
  const [[nhSpot, cgSpot], walletRes] = await Promise.all([
    Promise.all([fetchBtcUsdFromNiceHashExchangeList(), fetchBtcSpotUsd()]),
    walletCreds?.orgId && walletCreds.apiKey && walletCreds.apiSecret
      ? fetchNiceHashAccounts2TotalBtc(walletCreds)
      : Promise.resolve({ btc: null as string | null, error: null as string | null }),
  ]);
  const btcSpot = nhSpot ?? cgSpot;

  const unpaidN = parseAmountString(rigs2.unpaidAmount);
  const unpaidUsdSpotEstimate =
    unpaidN != null && btcSpot != null && Number.isFinite(unpaidN * btcSpot) ? unpaidN * btcSpot : null;

  const walletTotalBtc = walletRes.btc;
  const walletN = walletTotalBtc != null ? parseAmountString(walletTotalBtc) : null;
  const walletUsdApprox =
    walletN != null && btcSpot != null && Number.isFinite(walletN * btcSpot) ? walletN * btcSpot : null;

  return {
    btcSpotUsd: btcSpot,
    unpaidUsdSpotEstimate,
    walletTotalBtc,
    walletUsdApprox,
    walletError: walletCreds?.orgId && walletCreds.apiKey && walletCreds.apiSecret ? walletRes.error : null,
  };
}
