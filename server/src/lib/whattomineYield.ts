/**
 * Rendimiento vía API pública de WhatToMine (coins/{id}.json).
 * Electricidad fija: 0,078 USD/kWh (cost en query).
 *
 * Unidades de `hr` según WTM:
 * - Bitcoin (id=1): TH/s
 * - Litecoin Scrypt (id=4): GH/s
 */

import {
  parsePowerWattsFromDetails,
  parseScryptGhs,
  parseSha256Ths,
  parseZcashKhForWtm,
} from "./miningYieldEstimate.js";
import type { AsicYieldResult } from "./miningYieldEstimate.js";

/** DOGE aux por 1 LTC en merge (referencia WhatToMine). */
const MERGED_DOGE_PER_LTC_COIN = 81.552731 / 0.021694;

export const WHATTOMINE_ELECTRICITY_USD_PER_KWH = 0.078;

const WTM_BTC_COIN = 1;
const WTM_LTC_COIN = 4;
const WTM_DOGE_COIN = 6;
/** Zcash Equihash — misma API que https://whattomine.com/coins/166-zec-equihash */
const WTM_ZEC_COIN = 166;

const UA = "HashrateSpace-SGI/1.0";

type WtmResponse = {
  estimated_rewards?: string;
  revenue?: string;
  exchange_rate?: number;
  exchange_rate_curr?: string;
};

function fmtEs(n: number, maxFrac: number): string {
  return n.toLocaleString("es-PY", { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
}

function parseRewardNumber(s: string | undefined): number | null {
  if (s == null || typeof s !== "string") return null;
  let t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",") && !t.includes(".")) t = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** USD desde string tipo "$1,092.96" o "$8.55" */
function parseUsdString(s: string | undefined): number | null {
  if (s == null || typeof s !== "string") return null;
  const t = s.replace(/[$\s]/g, "").replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export async function fetchWtmJson(
  coinId: number,
  hr: number,
  powerW: number,
  electricityUsdPerKwh = WHATTOMINE_ELECTRICITY_USD_PER_KWH
): Promise<WtmResponse | null> {
  const q = new URLSearchParams({
    hr: String(hr),
    p: String(Math.max(1, Math.round(powerW))),
    fee: "0",
    cost: String(electricityUsdPerKwh),
  });
  const url = `https://whattomine.com/coins/${coinId}.json?${q.toString()}`;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!r.ok) return null;
    return (await r.json()) as WtmResponse;
  } catch {
    return null;
  }
}

/** Precio BTC en USD desde calculadora WTM (campo exchange_rate en moneda BTC). */
async function fetchBtcUsdFromWtm(): Promise<number | null> {
  const j = await fetchWtmJson(WTM_BTC_COIN, 1, 1000);
  const x = j?.exchange_rate;
  if (typeof x !== "number" || !Number.isFinite(x) || x <= 0) return null;
  return x;
}

/** 1 DOGE en BTC */
async function fetchDogeBtcFromWtm(): Promise<number | null> {
  const j = await fetchWtmJson(WTM_DOGE_COIN, 1, 1000);
  const x = j?.exchange_rate;
  if (typeof x !== "number" || !Number.isFinite(x) || x <= 0) return null;
  return x;
}

function parseCoinIdFromWhatToMineUrl(url: string): number | null {
  const m = String(url ?? "").match(/\/coins\/(\d+)-/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parseHrFromWhatToMineUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const hr = Number(u.searchParams.get("hr"));
    return Number.isFinite(hr) && hr > 0 ? hr : null;
  } catch {
    return null;
  }
}

function coinSymbolFromCoinId(coinId: number): string {
  if (coinId === 101) return "XMR";
  if (coinId === 166) return "ZEC";
  if (coinId === 1) return "BTC";
  if (coinId === 4) return "LTC";
  return "COIN";
}

function parseUsdTokenToNumber(token: string): number | null {
  const n = parseFloat(token.replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

type MergedCoinDayMetrics = {
  rewardsLtcDay: number | null;
  rewardsDogeDay: number | null;
  revUsdDay: number | null;
};

async function fetchMergedCoinDayMetricsFromWhatToMine(url: string): Promise<MergedCoinDayMetrics | null> {
  try {
    const u = new URL(url);
    const hr =
      Number(u.searchParams.get("hr")) ||
      Number(u.searchParams.get("hr_ltc")) ||
      Number(u.searchParams.get("hashrate")) ||
      0;
    if (!Number.isFinite(hr) || hr <= 0) return null;
    const r = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": UA },
    });
    if (!r.ok) return null;
    const html = await r.text();
    const row = html.match(/<tr[^>]*>\s*<td[^>]*>\s*Day\s*<\/td>[\s\S]*?<\/tr>/i)?.[0] ?? null;
    if (!row) return null;
    const tablePrefix = html.slice(0, html.indexOf(row));
    const headerMatches = Array.from(tablePrefix.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi));
    const headers = headerMatches
      .map((m) => String(m[1] ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim())
      .filter(Boolean)
      .slice(-9); // Per | Fee LTC | Rewards LTC | Fee DOGE | Rewards DOGE | Rev. BTC | Rev. $ | Cost | Profit

    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
      .map((m) => String(m[1] ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
    if (cells.length < 7) return null;

    const idxRewardsLtc = headers.findIndex((h) => /rewards\s*ltc/i.test(h));
    const idxRewardsDoge = headers.findIndex((h) => /rewards\s*doge/i.test(h));
    const idxRevUsd = headers.findIndex((h) => /rev\.\s*\$/i.test(h) || /rev\$\b/i.test(h));

    const rewardsLtcDay =
      idxRewardsLtc >= 0 && cells[idxRewardsLtc] != null ? parseRewardNumber(cells[idxRewardsLtc]) : null;
    const rewardsDogeDay =
      idxRewardsDoge >= 0 && cells[idxRewardsDoge] != null ? parseRewardNumber(cells[idxRewardsDoge]) : null;
    const revUsdDay =
      idxRevUsd >= 0 && cells[idxRevUsd] != null
        ? parseUsdString(cells[idxRevUsd])
        : (() => {
            // Fallback defensivo: en esta tabla Rev.$ suele ser el penúltimo USD antes de Cost/Profit.
            const usdTokens = Array.from(row.matchAll(/\$[\d,.]+/g))
              .map((m) => parseUsdTokenToNumber(m[0]))
              .filter((x): x is number => x != null);
            if (usdTokens.length >= 2) return usdTokens[0] ?? null;
            return usdTokens[0] ?? null;
          })();

    return { rewardsLtcDay, rewardsDogeDay, revUsdDay };
  } catch {
    return null;
  }
}

export async function estimateYieldFromCustomWhatToMine(
  config: WhatToMineCustomConfig
): Promise<WhatToMineYieldResult | null> {
  if (/\/merged_coins\//i.test(config.url)) {
    const day = await fetchMergedCoinDayMetricsFromWhatToMine(config.url);
    if (day?.revUsdDay != null) {
      const ltc = day.rewardsLtcDay != null ? `≈ ${fmtEs(day.rewardsLtcDay, 6)} LTC` : null;
      const doge = day.rewardsDogeDay != null ? `≈ ${fmtEs(day.rewardsDogeDay, 2)} DOGE` : null;
      const estCoin = [ltc, doge].filter(Boolean).join(" + ") || `≈ ${fmtEs(day.revUsdDay, 2)} USD`;
      return {
        line1: estCoin,
        line2: `≈ ${fmtEs(day.revUsdDay, 2)} USD`,
        source: "whattomine",
        electricityUsdPerKwh: Number(config.electricityUsdPerKwh),
        note: "WhatToMine merged coins · fila Day (Rewards LTC/DOGE y Rev.$) tomada del resultado de la calculadora.",
      };
    }
  }
  const coinId = parseCoinIdFromWhatToMineUrl(config.url);
  const hr = parseHrFromWhatToMineUrl(config.url);
  const powerW = Math.max(1, Math.round(Number(config.powerW) || 0));
  const cost = Number(config.electricityUsdPerKwh);
  if (coinId == null || hr == null || !Number.isFinite(cost) || cost < 0) return null;
  const j = await fetchWtmJson(coinId, hr, powerW, cost);
  if (!j) return null;
  const coinDay = parseRewardNumber(j.estimated_rewards);
  const revenueUsd = parseUsdString(j.revenue);
  if (coinDay == null || coinDay <= 0 || revenueUsd == null) return null;
  const electricityCostPerDay = (powerW / 1000) * 24 * cost;
  const profitDayUsd = revenueUsd - electricityCostPerDay;
  const coin = coinSymbolFromCoinId(coinId);
  return {
    line1: `≈ ${fmtEs(coinDay, 6)} ${coin}`,
    line2: `≈ ${fmtEs(profitDayUsd, 2)} USD`,
    source: "whattomine",
    electricityUsdPerKwh: cost,
    note: `WhatToMine manual · coinId ${coinId} · hr ${fmtEs(hr, 3)} · ${powerW} W · electricidad ${cost} USD/kWh · profit diario estimado (revenue - costo eléctrico).`,
  };
}

export type WhatToMineYieldResult = {
  line1: string;
  line2: string;
  source: "whattomine";
  electricityUsdPerKwh: number;
  note: string;
};

export type WhatToMineCustomConfig = {
  url: string;
  powerW: number;
  electricityUsdPerKwh: number;
};

function inferAlgo(row: { mp_algo: string | null; procesador: string }): "sha256" | "scrypt" | null {
  const a = (row.mp_algo ?? "").trim().toLowerCase();
  if (a === "sha256" || a === "scrypt") return a;
  const hashrate = (row.procesador ?? "").trim() || "";
  if (parseSha256Ths(hashrate)) return "sha256";
  if (parseScryptGhs(hashrate)) return "scrypt";
  return null;
}

/**
 * Valor a persistir en `mp_algo` al guardar un equipo. Si el cliente no envía
 * `marketplaceAlgo`, se infiere del texto de Procesador (hashrate + palabras clave)
 * y por defecto SHA-256 para que la vitrina siempre tenga un algo válido.
 */
export function resolveMarketplaceAlgoForPersist(body: {
  marketplaceAlgo?: "sha256" | "scrypt" | null;
  procesador: string;
}): "sha256" | "scrypt" {
  const ex = body.marketplaceAlgo;
  if (ex === "sha256" || ex === "scrypt") return ex;
  const inferred = inferAlgo({ mp_algo: null, procesador: body.procesador });
  if (inferred) return inferred;
  const p = (body.procesador ?? "").toLowerCase();
  if (/\b(scrypt|litecoin|dogecoin|doge|ltc)\b/.test(p)) return "scrypt";
  if (/\b(antminer\s*)?l[79]\b/.test(p)) return "scrypt";
  return "sha256";
}

/**
 * Rendimiento en vivo / persistencia: ZEC desde API `coins/166.json` (misma base que la calculadora web).
 */
export async function fetchZecWhatToMineYieldForItem(item: {
  id: string;
  hashrate: string;
  detailRows?: Array<{ icon: string; text: string }>;
}): Promise<AsicYieldResult | null> {
  const kh = parseZcashKhForWtm(item.hashrate);
  if (kh == null) return null;
  const powerW = parsePowerWattsFromDetails(item.detailRows) ?? 2800;
  const j = await fetchWtmJson(WTM_ZEC_COIN, kh, powerW);
  if (!j) return null;
  const zecDay = parseRewardNumber(j.estimated_rewards);
  const revenueUsd = parseUsdString(j.revenue);
  if (zecDay == null || zecDay <= 0 || revenueUsd == null) return null;
  return {
    id: item.id,
    line1: `≈ ${fmtEs(zecDay, 5)} ZEC`,
    line2: `≈ ${fmtEs(revenueUsd, 2)} USD`,
    note: `WhatToMine ZEC (Equihash) · ${kh} kh/s · electricidad ${WHATTOMINE_ELECTRICITY_USD_PER_KWH} USD/kWh · bruto diario (revenue).`,
  };
}

export async function estimateYieldWhatToMineForEquipo(row: {
  mp_algo: string | null;
  procesador: string;
  mp_detail_rows_json: string | null;
}): Promise<WhatToMineYieldResult | null> {
  const hashrate = (row.procesador ?? "").trim() || "";

  let detailRows: Array<{ text: string }> | undefined;
  if (row.mp_detail_rows_json?.trim()) {
    try {
      const d = JSON.parse(row.mp_detail_rows_json) as unknown;
      if (Array.isArray(d)) {
        detailRows = d
          .filter((x) => x && typeof x === "object" && typeof (x as { text?: string }).text === "string")
          .map((x) => ({ text: String((x as { text: string }).text) }));
      }
    } catch {
      /* ignore */
    }
  }

  const powerW = parsePowerWattsFromDetails(detailRows) ?? null;

  const zKh = parseZcashKhForWtm(hashrate);
  if (zKh != null) {
    const p = powerW ?? 2800;
    const j = await fetchWtmJson(WTM_ZEC_COIN, zKh, p);
    if (!j) return null;
    const zecDay = parseRewardNumber(j.estimated_rewards);
    const revenueUsd = parseUsdString(j.revenue);
    if (zecDay == null || zecDay <= 0 || revenueUsd == null) return null;
    return {
      line1: `≈ ${fmtEs(zecDay, 5)} ZEC`,
      line2: `Equivalente diario (USD): ≈ ${fmtEs(revenueUsd, 2)} USD`,
      source: "whattomine",
      electricityUsdPerKwh: WHATTOMINE_ELECTRICITY_USD_PER_KWH,
      note: `WhatToMine ZEC (Equihash) · ${zKh} kh/s · electricidad ${WHATTOMINE_ELECTRICITY_USD_PER_KWH} USD/kWh · bruto (revenue).`,
    };
  }

  const algo = inferAlgo(row);
  if (algo === "sha256") {
    const ths = parseSha256Ths(hashrate);
    if (ths == null) return null;
    const p = powerW ?? 3500;
    const j = await fetchWtmJson(WTM_BTC_COIN, ths, p);
    if (!j) return null;
    const btcDay = parseRewardNumber(j.estimated_rewards);
    const revenueUsd = parseUsdString(j.revenue);
    if (btcDay == null || btcDay <= 0 || revenueUsd == null) return null;
    return {
      line1: `≈ ${fmtEs(btcDay, 6)} BTC`,
      line2: `Equivalente diario (USD): ≈ ${fmtEs(revenueUsd, 2)} USD`,
      source: "whattomine",
      electricityUsdPerKwh: WHATTOMINE_ELECTRICITY_USD_PER_KWH,
      note: `WhatToMine · electricidad ${WHATTOMINE_ELECTRICITY_USD_PER_KWH} USD/kWh · bruto (sin descontar pool).`,
    };
  }

  if (algo === "scrypt") {
    const ghs = parseScryptGhs(hashrate);
    if (ghs == null) return null;
    const p = powerW ?? 3260;
    const [ltcJ, btcUsd, dogeBtc] = await Promise.all([
      fetchWtmJson(WTM_LTC_COIN, ghs, p),
      fetchBtcUsdFromWtm(),
      fetchDogeBtcFromWtm(),
    ]);
    if (!ltcJ || btcUsd == null || dogeBtc == null) return null;
    const ltcDay = parseRewardNumber(ltcJ.estimated_rewards);
    const ltcRevenueUsd = parseUsdString(ltcJ.revenue);
    if (ltcDay == null || ltcDay <= 0 || ltcRevenueUsd == null) return null;
    const dogeDay = ltcDay * MERGED_DOGE_PER_LTC_COIN;
    const dogeFmt = dogeDay >= 100 ? fmtEs(dogeDay, 0) : fmtEs(dogeDay, 2);
    const dogeUsd = dogeDay * dogeBtc * btcUsd;
    const grossUsd = ltcRevenueUsd + dogeUsd;
    return {
      line1: `≈ ${fmtEs(ltcDay, 5)} LTC + ≈ ${dogeFmt} DOGE`,
      line2: `Equivalente diario (USD): ≈ ${fmtEs(grossUsd, 2)} USD`,
      source: "whattomine",
      electricityUsdPerKwh: WHATTOMINE_ELECTRICITY_USD_PER_KWH,
      note: `WhatToMine (LTC + DOGE merge) · electricidad ${WHATTOMINE_ELECTRICITY_USD_PER_KWH} USD/kWh · estimación bruta.`,
    };
  }

  return null;
}

export function explainInferAlgoFailure(row: { mp_algo: string | null; procesador: string }): string {
  if (inferAlgo(row) || parseZcashKhForWtm((row.procesador ?? "").trim())) return "";
  return "No se detectó algoritmo ni hashrate en Procesador (ej. TH/s para Bitcoin, GH/s o MH/s para Scrypt, kSol/s para Zcash/Z15). Completá Procesador con la especificación del minero.";
}
