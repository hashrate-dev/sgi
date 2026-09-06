/**
 * Cotización Guaraní (PYG) por USD.
 * Investing.com bloquea scrapers (Cloudflare); se usa el par USD/PYG de Yahoo Finance
 * (mismo cruce que muestra Investing) con histórico diario. Si falla, BCP vía dolar.melizeche.com.
 */

import { parseIsoDateUtc, toIsoDate } from "./bcuCotizaciones.js";

export type PygTipoCambioResult = {
  moneda: "PYG";
  fechaSolicitada: string;
  fechaCotizacion: string;
  /** Guaraníes por 1 USD. */
  tipoCambio: number;
  fuente: "YAHOO_USDPYG" | "DOLARPY_BCP";
  detalle: string;
};

type YahooChartResult = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      meta?: { regularMarketPrice?: number; currency?: string };
    }>;
    error?: unknown;
  };
};

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HashrateSGI/1.0)",
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Histórico diario USD/PYG (Yahoo = par de mercado que Investing publica como USD/PYG).
 * Devuelve Gs. por USD en o antes de `fechaIso` (finde/feriado → último día con dato).
 */
async function pygFromYahooHastaFecha(fechaIso: string): Promise<PygTipoCambioResult | null> {
  const target = parseIsoDateUtc(fechaIso);
  if (!target) throw new Error("FECHA_INVALIDA");

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  let hasta = target;
  if (target.getTime() > todayUtc) {
    hasta = new Date(todayUtc);
  }

  const desde = addDaysUtc(hasta, -30);
  const period1 = Math.floor(desde.getTime() / 1000);
  const period2 = Math.floor(addDaysUtc(hasta, 1).getTime() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/USDPYG=X` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const raw = (await fetchJson(url)) as YahooChartResult;
  const result = raw.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const hastaIso = toIsoDate(hasta);

  let best: { fecha: string; rate: number } | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    if (ts == null || close == null || !(close > 0)) continue;
    const fecha = toIsoDate(new Date(ts * 1000));
    if (fecha > hastaIso) continue;
    if (!best || fecha >= best.fecha) best = { fecha, rate: close };
  }

  if (!best) {
    const spot = result?.meta?.regularMarketPrice;
    if (spot != null && spot > 0) {
      best = { fecha: hastaIso, rate: spot };
    }
  }
  if (!best) return null;

  const rate = Math.round(best.rate * 100) / 100;
  return {
    moneda: "PYG",
    fechaSolicitada: fechaIso,
    fechaCotizacion: best.fecha,
    tipoCambio: rate,
    fuente: "YAHOO_USDPYG",
    detalle: `USD/PYG mercado (${best.fecha}): ${rate} Gs./USD — mismo par que Investing.com (USD/PYG)`,
  };
}

/** Cotización referencial BCP del día (API pública dolarPy). */
async function pygFromDolarPyBcp(fechaIso: string): Promise<PygTipoCambioResult | null> {
  const raw = (await fetchJson("https://dolar.melizeche.com/api/1.0/")) as {
    dolarpy?: { bcp?: { compra?: number; venta?: number; referencial_diario?: number } };
    updated?: string;
  };
  const bcp = raw.dolarpy?.bcp;
  const rate = Number(bcp?.referencial_diario ?? bcp?.venta ?? bcp?.compra ?? 0);
  if (!(rate > 0)) return null;
  const rounded = Math.round(rate * 100) / 100;
  return {
    moneda: "PYG",
    fechaSolicitada: fechaIso,
    fechaCotizacion: fechaIso,
    tipoCambio: rounded,
    fuente: "DOLARPY_BCP",
    detalle: `BCP referencial (dolarPy): ${rounded} Gs./USD`,
  };
}

export async function resolvePygTipoCambio(fechaIso: string): Promise<PygTipoCambioResult> {
  try {
    const y = await pygFromYahooHastaFecha(fechaIso);
    if (y) return y;
  } catch (e) {
    console.warn("[pygTipoCambio] yahoo", e);
  }
  try {
    const d = await pygFromDolarPyBcp(fechaIso);
    if (d) return d;
  } catch (e) {
    console.warn("[pygTipoCambio] dolarpy", e);
  }
  throw new Error("PYG_SIN_DATO");
}
