/**
 * Si el estimador devolvió BTC por error en un Antminer X* (RandomX), convertir la cifra a XMR
 * con tipo BTC/USD y XMR/USD (CoinGecko) al momento de la consulta.
 */

import { isBitmainAntminerRandomXMinerBlob } from "./miningYieldEstimate.js";

const COINGECKO_BTC_XMR_USD =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,monero&vs_currencies=usd";

export async function fetchBtcUsdAndXmrUsd(): Promise<{ btcUsd: number; xmrUsd: number } | null> {
  try {
    const r = await fetch(COINGECKO_BTC_XMR_USD, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HashrateSpace-SGI/1.0",
      },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { bitcoin?: { usd?: number }; monero?: { usd?: number } };
    const btcUsd = j.bitcoin?.usd;
    const xmrUsd = j.monero?.usd;
    if (typeof btcUsd !== "number" || typeof xmrUsd !== "number" || btcUsd <= 0 || xmrUsd <= 0) return null;
    return { btcUsd, xmrUsd };
  } catch {
    return null;
  }
}

/** Extrae cantidad BTC desde «≈ 0,000356 BTC» / «~ 0.000356 BTC». */
export function parseBtcAmountFromYieldLine(line: string): number | null {
  const m = String(line ?? "").match(/(?:≈|~)\s*([\d.,]+)\s*BTC\b/i);
  if (!m?.[1]) return null;
  let t = m[1].trim().replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",") && !t.includes(".")) t = t.replace(",", ".");
  else if (t.includes(".") && t.includes(",")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtEsXmr(n: number): string {
  return n.toLocaleString("es-PY", { maximumFractionDigits: 6, minimumFractionDigits: 0 });
}

export type YieldLineShape = { line1: string; line2?: string; note?: string };

/**
 * Solo Antminer serie X (Bitmain RandomX). Si `line1` sigue en BTC, sustituir por equivalente XMR.
 */
export async function applyBitmainRandomXYieldBtcToXmrWhenNeeded<T extends YieldLineShape>(
  equipoContextBlob: string,
  y: T
): Promise<T> {
  if (!isBitmainAntminerRandomXMinerBlob(equipoContextBlob)) return y;
  if (!/\bBTC\b/i.test(y.line1)) return y;
  const btcAmt = parseBtcAmountFromYieldLine(y.line1);
  if (btcAmt == null) return y;
  const px = await fetchBtcUsdAndXmrUsd();
  if (!px) return y;
  const xmrAmt = (btcAmt * px.btcUsd) / px.xmrUsd;
  const usd2 = (n: number) =>
    n.toLocaleString("es-PY", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const suffix = `Equivalente XMR desde BTC al tipo spot (CoinGecko: BTC ${usd2(px.btcUsd)} USD, XMR ${usd2(px.xmrUsd)} USD).`;
  const note = [y.note?.trim(), suffix].filter(Boolean).join(" · ");
  return {
    ...y,
    line1: `≈ ${fmtEsXmr(xmrAmt)} XMR`,
    note,
  };
}
