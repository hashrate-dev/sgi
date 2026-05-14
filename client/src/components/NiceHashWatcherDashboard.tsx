import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getNiceHashExternalRigs2,
  getNiceHashWatcherProfitMonth,
  getNiceHashWatcherRigHashHistory,
  postNiceHashWatcherProfitSnapshot,
  postNiceHashWatcherRigHashHistorySamples,
  wakeUpBackend,
  type NiceHashExternalRigs2Payload,
} from "../lib/api";
import {
  getNiceHashWatcherNicknamesStorageKey,
  loadNiceHashWatcherRigNicknames,
  nhWatcherRigStorageKey,
  NH_WATCHER_DEFAULT_RIG_NICKNAME,
} from "../lib/nicehashWatcherRigNicknames";
import {
  getWatcherActiveSlotStorageKey,
  getWatcherSlotRowsStorageKey,
  initialActiveSlotIndex,
  listConfiguredWatcherSlotIndices,
  loadActiveWatcherSlotIndex,
  loadWatcherSlotRows,
  NH_WATCHER_SLOT_COUNT,
  NH_WATCHER_SLOT_NICKNAME_MAX,
  type NhWatcherSlotRow,
  niceHashMinerPageUrl,
  pickValidActiveSlotIndex,
  resolveWatcherIdAtSlot,
  saveActiveWatcherSlotIndex,
  saveWatcherSlotRows,
  watcherSlotNicknameTrimmed,
} from "../lib/nicehashWatcherSlots";
import { NICEHASH_WATCHER_ID, NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID } from "../lib/nicehashWatcherConfig";
import { NiceHashFleetHashrateModal } from "./NiceHashFleetHashrateModal";
import { NiceHashRigAsicIcon } from "./NiceHashRigAsicIcon";
import { NiceHashRigHashSparkline } from "./NiceHashRigHashSparkline";
import { AppModal } from "./ui";
import {
  appendNiceHashRigHashrateSample,
  appendWatcherToolbarSpeedSamplesReturn,
  getNiceHashRigHashrateHistoryStorageKey,
  loadNiceHashRigHashratePointsMap,
  loadNiceHashRigHashrateSeriesMap,
  loadNiceHashToolbarMhSeries,
  loadNiceHashToolbarThSeries,
  mergeNiceHashRigHashratePointMaps,
  NH_WATCHER_TOOLBAR_MH_KEY,
  NH_WATCHER_TOOLBAR_TH_KEY,
  replaceNiceHashRigHashrateHistoryMap,
} from "../lib/nicehashWatcherRigHashrateHistory";
import "../styles/facturacion.css";

/** Referencia estable para sparklines sin serie (evita re-renders por `?? []` nuevo cada vez). */
const NH_SPARKLINE_VALUES_EMPTY: number[] = [];

const NH_EMPTY_SLOT_ROW: NhWatcherSlotRow = { link: "", nickname: "", nhOrgId: "", nhApiKey: "", nhApiSecret: "" };

const COINGECKO_BTC_USD =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

const NH_EXCHANGE_RATE_LIST = "https://api2.nicehash.com/main/api/v2/exchangeRate/list";

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
      const o = row as { fromCurrency?: string; toCurrency?: string; exchangeRate?: string };
      if (String(o.fromCurrency).toUpperCase() !== wantFrom || String(o.toCurrency).toUpperCase() !== wantTo) continue;
      const n = parseNiceHashAmountString(o.exchangeRate ?? undefined);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

/** Mismo estilo de monto que la web del watcher (`≈ $49.54`). */
function formatUsdWatcherWeb(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export type NiceHashWatcherLayout = "fullscreen" | "embedded";

/** `activeSlot`: un watcher (pestaña Wn). `allConfiguredSlots`: todos los W1…WN con UUID en un solo tablero TOTAL. */
export type NiceHashWatcherViewMode = "activeSlot" | "allConfiguredSlots";

export type NiceHashWatcherDashboardProps = {
  /** Si false, no consulta ni actualiza el reloj (p. ej. modal cerrado). */
  active: boolean;
  layout: NiceHashWatcherLayout;
  /** Solo `embedded`: botón Cerrar del modal. */
  onClose?: () => void;
  viewMode?: NiceHashWatcherViewMode;
};

function formatNiceHashStatusTime(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function formatNiceHashIsoShort(iso?: string | null): string {
  if (!iso || typeof iso !== "string") return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function formatNiceHashBtc8(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(8);
}

function utcYearMonthFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function formatUtcYearMonthLongEs(ym: string): string {
  const m = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!m) return ym;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return ym;
  try {
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("es-UY", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return ym;
  }
}

/** Parsea montos string del API NiceHash (coma o punto decimal). */
function parseNiceHashAmountString(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatUnpaidMiningUsdApprox(
  payload: NiceHashExternalRigs2Payload | null,
  nhUnpaidStr: string | null,
  btcSpotUsdOverride?: number | null
): string | null {
  if (!payload) return null;
  const usd = parseNiceHashAmountString(payload.unpaidAmountUSDT);
  if (usd != null && usd > 0) return `≈ ${formatUsdWatcherWeb(usd)}`;
  const unpaidN = parseNiceHashAmountString(nhUnpaidStr ?? undefined);
  if (unpaidN == null || unpaidN <= 0) return null;
  const spotEst = payload._sgi?.unpaidUsdSpotEstimate;
  if (spotEst != null && spotEst > 0) return `≈ ${formatUsdWatcherWeb(spotEst)}`;
  const spot =
    btcSpotUsdOverride != null && Number.isFinite(btcSpotUsdOverride) && btcSpotUsdOverride > 0
      ? btcSpotUsdOverride
      : typeof payload._sgi?.btcSpotUsd === "number" && Number.isFinite(payload._sgi.btcSpotUsd) && payload._sgi.btcSpotUsd > 0
        ? payload._sgi.btcSpotUsd
        : null;
  if (spot == null) return null;
  return `≈ ${formatUsdWatcherWeb(spot * unpaidN)}`;
}

/** USD aprox. para rentabilidad 24 h (BTC × spot). */
function formatRent24hUsdApprox(
  payload: NiceHashExternalRigs2Payload | null,
  btc24: number | null,
  btcSpotUsdOverride?: number | null
): string | null {
  if (!payload || btc24 == null || !Number.isFinite(btc24) || btc24 < 0) return null;
  const spot =
    btcSpotUsdOverride != null && Number.isFinite(btcSpotUsdOverride) && btcSpotUsdOverride > 0
      ? btcSpotUsdOverride
      : typeof payload._sgi?.btcSpotUsd === "number" && Number.isFinite(payload._sgi.btcSpotUsd) && payload._sgi.btcSpotUsd > 0
        ? payload._sgi.btcSpotUsd
        : null;
  if (spot == null) return null;
  return `≈ ${formatUsdWatcherWeb(spot * btc24)}`;
}

function formatNiceHashRelativeAge(statusTimeMs?: number): string {
  if (typeof statusTimeMs !== "number" || !Number.isFinite(statusTimeMs)) return "—";
  const diff = Math.max(0, Date.now() - statusTimeMs);
  if (diff < 2500) return "ahora";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 72) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function formatCountdownToIso(iso: string | null | undefined, nowMs: number): string {
  if (!iso || typeof iso !== "string") return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const ms = t - nowMs;
  if (ms <= 0) return "En curso";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function nhWatcherAlgoLine(rigs: NiceHashExternalRigs2Payload["miningRigs"]): string {
  const st0 = rigs?.[0]?.stats?.[0];
  const algo = st0?.algorithm?.description ?? st0?.algorithm?.enumName ?? "SHA256";
  const mkt = st0?.market ? ` · ${st0.market}` : "";
  return `${algo}${mkt}`;
}

function nhRigStatusClass(status: string): string {
  const u = status.trim().toUpperCase();
  if (u === "MINING") return "nh-watcher-rig-card__status nh-watcher-rig-card__status--mining";
  if (u === "OFFLINE" || u === "STOPPED" || u === "DISABLED") return "nh-watcher-rig-card__status nh-watcher-rig-card__status--off";
  return "nh-watcher-rig-card__status nh-watcher-rig-card__status--other";
}

function nhRejectPctLabel(st: { speedAccepted?: number; speedRejectedTotal?: number } | undefined): string {
  if (!st) return "—";
  const acc = typeof st.speedAccepted === "number" && Number.isFinite(st.speedAccepted) ? st.speedAccepted : 0;
  const rej = typeof st.speedRejectedTotal === "number" && Number.isFinite(st.speedRejectedTotal) ? st.speedRejectedTotal : 0;
  const t = acc + rej;
  if (t <= 0) return "—";
  const pct = (rej / t) * 100;
  if (pct < 0.001) return "0,00%";
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

/**
 * Heurística NiceHash watcher: Scrypt en ASICs BTC suele reportar valores con ≥3 cifras enteras (ej. 196 TH/s);
 * Scrypt LTC/DOGE suele quedar en 1–2 cifras enteras (ej. 10.5 MH/s). El API usa el mismo campo numérico.
 */
function nhAcceptedSpeedLooksLikeTh(speed: number): boolean {
  if (!Number.isFinite(speed) || speed <= 0) return true;
  if (speed < 1) return false;
  const intPart = Math.floor(Math.abs(speed));
  const intDigits = Math.floor(Math.log10(intPart)) + 1;
  return intDigits >= 3;
}

function formatNiceHashAcceptedSpeed(speed: number | null | undefined): string {
  if (speed == null || !Number.isFinite(speed)) return "—";
  const th = nhAcceptedSpeedLooksLikeTh(speed);
  return `${speed.toFixed(2)} ${th ? "TH/s" : "MH/s"}`;
}

/** Suma velocidad aceptada por heurística TH vs MH (misma lógica que KPI del toolbar). */
function sumAcceptedThMhFromMiningRigs(rigs: NiceHashExternalRigs2Payload["miningRigs"]): { sumTh: number; sumMh: number } {
  const list = rigs ?? [];
  let sumTh = 0;
  let sumMh = 0;
  for (const rig of list) {
    const sp = rig.stats?.[0]?.speedAccepted;
    if (typeof sp !== "number" || !Number.isFinite(sp)) continue;
    if (nhAcceptedSpeedLooksLikeTh(sp)) sumTh += sp;
    else sumMh += sp;
  }
  return { sumTh, sumMh };
}

function formatToolbarSparkTh(n: number): string {
  return `${n.toFixed(2)} TH/s`;
}

function formatToolbarSparkMh(n: number): string {
  return `${n.toFixed(2)} MH/s`;
}

type NhMiningRig = NonNullable<NiceHashExternalRigs2Payload["miningRigs"]>[number];

type NhWatcherAgg = {
  rigs: NhMiningRig[];
  sumTh: number;
  sumMh: number;
  miningN: number;
  totalRigs: number;
  totalDev: number;
  btc24: number | null;
  unpaid: string | null;
  nextPayout: string | null;
  algoLine: string;
};

export function nhCompositeRigKey(watcherId: string, rigStorageKey: string): string {
  return `${watcherId.trim().toLowerCase()}::${rigStorageKey}`;
}

function nhRigIsMining(rig: NhMiningRig): boolean {
  return String(rig.minerStatus ?? "").trim().toUpperCase() === "MINING";
}

/** Suma rentabilidad 24 h (BTC/día) solo de rigs en MINING (misma idea que la lista de ASICs). */
function miningRigsProfitabilitySumBtc24(rigs: NhMiningRig[] | undefined): number {
  let s = 0;
  for (const rig of rigs ?? []) {
    if (!nhRigIsMining(rig)) continue;
    const top = rig.profitability;
    if (typeof top === "number" && Number.isFinite(top) && top > 0) {
      s += top;
      continue;
    }
    const st = rig.stats?.[0]?.profitability;
    if (typeof st === "number" && Number.isFinite(st) && st > 0) s += st;
  }
  return s;
}

/** Suma impago en BTC solo de rigs en MINING. */
function miningRigsUnpaidSumBtc(rigs: NhMiningRig[] | undefined): number {
  let s = 0;
  for (const rig of rigs ?? []) {
    if (!nhRigIsMining(rig)) continue;
    const n = parseNiceHashAmountString(rig.unpaidAmount);
    if (n != null && n > 0) s += n;
  }
  return s;
}

function buildNhAggFromPayload(p: NiceHashExternalRigs2Payload): NhWatcherAgg {
  const rigs = p.miningRigs ?? [];
  let sumTh = 0;
  let sumMh = 0;
  let miningN = 0;
  for (const rig of rigs) {
    const sp = rig.stats?.[0]?.speedAccepted;
    if (typeof sp === "number" && Number.isFinite(sp)) {
      if (nhAcceptedSpeedLooksLikeTh(sp)) sumTh += sp;
      else sumMh += sp;
    }
    if (String(rig.minerStatus ?? "").trim().toUpperCase() === "MINING") miningN += 1;
  }
  const totalRigs = typeof p.totalRigs === "number" && p.totalRigs >= 0 ? p.totalRigs : rigs.length;
  const totalDev = typeof p.totalDevices === "number" && p.totalDevices >= 0 ? p.totalDevices : totalRigs;
  let btc24: number | null =
    typeof p.totalProfitability === "number" && Number.isFinite(p.totalProfitability) ? p.totalProfitability : null;
  if (btc24 == null && rigs.length > 0) {
    const s = rigs.reduce((a, r) => {
      const v = r.profitability;
      return a + (typeof v === "number" && Number.isFinite(v) ? v : 0);
    }, 0);
    btc24 = s > 0 ? s : null;
  }
  return {
    rigs,
    sumTh,
    sumMh,
    miningN,
    totalRigs,
    totalDev,
    btc24,
    unpaid: p.unpaidAmount?.trim() || null,
    nextPayout: p.nextPayoutTimestamp ?? null,
    algoLine: nhWatcherAlgoLine(rigs),
  };
}

function mergeMinerStatusesPayloads(payloads: NiceHashExternalRigs2Payload[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of payloads) {
    const ms = p.minerStatuses;
    if (!ms) continue;
    for (const [k, v] of Object.entries(ms)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

function mergeTotalWatcherAggs(multiOk: Array<{ payload: NiceHashExternalRigs2Payload }>): NhWatcherAgg {
  const aggs = multiOk.map((e) => buildNhAggFromPayload(e.payload));
  let sumTh = 0;
  let sumMh = 0;
  let miningN = 0;
  let totalRigs = 0;
  let totalDev = 0;
  let btc24Sum = 0;
  let btc24Any = false;
  let unpaidBtc = 0;
  let unpaidAny = false;
  let nextPayout: string | null = null;
  const algoLines = new Set<string>();
  for (let i = 0; i < aggs.length; i++) {
    const a = aggs[i];
    const p = multiOk[i].payload;
    const rigs = p.miningRigs ?? [];
    sumTh += a.sumTh;
    sumMh += a.sumMh;
    miningN += a.miningN;
    totalRigs += a.totalRigs;
    totalDev += a.totalDev;
    const prMine = miningRigsProfitabilitySumBtc24(rigs);
    if (prMine > 0) {
      btc24Sum += prMine;
      btc24Any = true;
    }
    const upMine = miningRigsUnpaidSumBtc(rigs);
    if (upMine > 0) {
      unpaidBtc += upMine;
      unpaidAny = true;
    }
    if (a.algoLine.trim()) algoLines.add(a.algoLine.trim());
    const iso = p.nextPayoutTimestamp ?? null;
    if (iso && a.miningN > 0) {
      const t = Date.parse(iso);
      if (Number.isFinite(t)) {
        if (nextPayout == null || t < Date.parse(nextPayout)) nextPayout = iso;
      }
    }
  }
  let algoLine = "—";
  if (algoLines.size === 1) algoLine = [...algoLines][0];
  else if (algoLines.size > 1) algoLine = "Varios algoritmos / mercados";
  return {
    rigs: [],
    sumTh,
    sumMh,
    miningN,
    totalRigs,
    totalDev,
    btc24: btc24Any ? btc24Sum : null,
    unpaid: unpaidAny ? unpaidBtc.toFixed(8) : null,
    nextPayout,
    algoLine,
  };
}

function buildSyntheticPayloadForTotal(multiOk: Array<{ payload: NiceHashExternalRigs2Payload }>): NiceHashExternalRigs2Payload | null {
  if (multiOk.length === 0) return null;
  let spot: number | null = null;
  const walletErrors: string[] = [];
  for (const { payload } of multiOk) {
    const s = payload._sgi?.btcSpotUsd;
    if (spot == null && typeof s === "number" && Number.isFinite(s) && s > 0) spot = s;
    const we = payload._sgi?.walletError;
    if (we) walletErrors.push(String(we));
  }
  const agg = mergeTotalWatcherAggs(multiOk);
  return {
    unpaidAmount: agg.unpaid ?? undefined,
    _sgi: {
      btcSpotUsd: spot ?? undefined,
      walletError: walletErrors.length ? walletErrors.join(" · ") : undefined,
    },
  };
}

type RigFlatRow = {
  slotIndex: number;
  watcherId: string;
  rig: NhMiningRig;
  rigIndex: number;
  payload: NiceHashExternalRigs2Payload;
};

function formatUptimeFromConnected(timeConnectedMs?: number): string {
  if (typeof timeConnectedMs !== "number" || !Number.isFinite(timeConnectedMs)) return "—";
  const diff = Math.max(0, Date.now() - timeConnectedMs);
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Cuenta atrás al próximo pago: intervalo local (no re-renderiza todo el tablero cada 1s). */
function WatcherLiveCountdown({ iso }: { iso: string | null | undefined }) {
  const [text, setText] = useState(() => formatCountdownToIso(iso, Date.now()));
  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    const tick = () => setText(formatCountdownToIso(iso, Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  return <>{text}</>;
}

/** “hace Xs” en última señal: solo este bloque se actualiza por segundo. */
function WatcherLiveRelativeAge({ statusTimeMs }: { statusTimeMs?: number }) {
  const [text, setText] = useState(() => formatNiceHashRelativeAge(statusTimeMs));
  useEffect(() => {
    if (typeof statusTimeMs !== "number" || !Number.isFinite(statusTimeMs)) {
      setText(formatNiceHashRelativeAge(statusTimeMs));
      return;
    }
    const tick = () => setText(formatNiceHashRelativeAge(statusTimeMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [statusTimeMs]);
  return <>{text}</>;
}

/** Duración de sesión desde timeConnected: avanza cada segundo sin tocar el resto del DOM. */
function WatcherLiveUptime({ timeConnectedMs }: { timeConnectedMs?: number }) {
  const [text, setText] = useState(() => formatUptimeFromConnected(timeConnectedMs));
  useEffect(() => {
    if (typeof timeConnectedMs !== "number" || !Number.isFinite(timeConnectedMs)) {
      setText(formatUptimeFromConnected(timeConnectedMs));
      return;
    }
    const tick = () => setText(formatUptimeFromConnected(timeConnectedMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timeConnectedMs]);
  return <>{text}</>;
}

function WatcherSlotBar({
  variant,
  slotRows,
  activeSlot,
  configuredIndices,
  onSelectSlot,
  onOpenConfig,
  showTotalAggregateLink,
}: {
  variant: "page" | "embedded";
  slotRows: NhWatcherSlotRow[];
  activeSlot: number;
  configuredIndices: number[];
  onSelectSlot: (idx: number) => void;
  onOpenConfig: () => void;
  /** Solo `page`: enlace a vista TOTAL de todos los watchers configurados. */
  showTotalAggregateLink?: boolean;
}) {
  return (
    <div className={`nh-watcher-slot-bar nh-watcher-slot-bar--${variant}`}>
      <div className="nh-watcher-slot-bar__tabs d-flex flex-wrap align-items-center gap-1 flex-grow-1 min-w-0">
        {configuredIndices.length === 0 ? (
          <span className="nh-watcher-slot-bar__hint small">
            Añadí al menos un enlace válido con el engranaje (URL o UUID).
          </span>
        ) : (
          configuredIndices.map((idx) => {
            const nick = (slotRows[idx]?.nickname ?? "").trim();
            const tabTitle = nick ? `${nick} (enlace W${idx + 1})` : `Watcher ${idx + 1}`;
            return (
            <button
              key={idx}
              type="button"
              className={`nh-watcher-slot-tab${idx === activeSlot ? " nh-watcher-slot-tab--active" : ""}`}
              title={tabTitle}
              onClick={() => onSelectSlot(idx)}
            >
              {nick ? (
                <span
                  className="nh-watcher-slot-tab__label nh-watcher-slot-tab__nick text-truncate d-inline-block align-bottom"
                  style={{ maxWidth: "10rem" }}
                >
                  {nick}
                </span>
              ) : (
                <span className="nh-watcher-slot-tab__n">W{idx + 1}</span>
              )}
            </button>
            );
          })
        )}
        {variant === "page" && showTotalAggregateLink && configuredIndices.length >= 1 ? (
          <Link
            to="/asic/monitor-equipos?watcher=total"
            className="nh-watcher-slot-tab nh-watcher-slot-tab--aggregate ms-1 text-decoration-none"
            title="Ver todos los watchers en un solo tablero"
          >
            TOTAL
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        className={`nh-watcher-config-btn ms-auto${variant === "embedded" ? " nh-watcher-config-btn--embedded" : ""}`}
        onClick={onOpenConfig}
        aria-label="Configuración de watchers"
        title={variant === "page" ? "Configuración de watchers (hasta 16 enlaces)" : "Configuración de watchers"}
      >
        <i className="bi bi-gear-fill" aria-hidden />
      </button>
    </div>
  );
}

function WatcherActionBar({
  layout,
  loading,
  minerPageUrl,
  onRefresh,
  onClose,
}: {
  layout: NiceHashWatcherLayout;
  loading: boolean;
  minerPageUrl: string | null;
  onRefresh: () => void;
  onClose?: () => void;
}) {
  const sgi = layout === "fullscreen";
  return (
    <div
      className={`nh-watcher-actions d-flex flex-wrap align-items-center gap-3 ${
        minerPageUrl ? "justify-content-between" : "justify-content-end"
      } ${layout === "fullscreen" ? "nh-watcher-actions--page" : "nh-watcher-actions--embedded"}${
        sgi ? " nh-watcher-actions--sgi" : ""
      }`}
    >
      {minerPageUrl ? (
        <a
          href={minerPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            sgi
              ? "nh-watcher-footer-pill nh-watcher-footer-pill--ghost text-decoration-none"
              : "btn btn-outline-light btn-sm rounded-pill px-3"
          }
        >
          <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
          Abrir en NiceHash
        </a>
      ) : null}
      <div className="d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          className={
            sgi ? "nh-watcher-footer-pill nh-watcher-footer-pill--ghost" : "btn btn-outline-light btn-sm rounded-pill px-3"
          }
          disabled={loading}
          onClick={() => void onRefresh()}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden />
              Actualizando…
            </>
          ) : (
            <>
              <i className="bi bi-arrow-clockwise me-2" aria-hidden />
              Actualizar
            </>
          )}
        </button>
        {layout === "embedded" && onClose ? (
          <button type="button" className="btn btn-success btn-sm rounded-pill px-3 fw-semibold" onClick={onClose}>
            Cerrar
          </button>
        ) : (
          <Link
            to="/asic/monitor-equipos"
            className={
              sgi
                ? "nh-watcher-footer-pill nh-watcher-footer-pill--primary fw-semibold"
                : "btn btn-success btn-sm rounded-pill px-3 fw-semibold text-decoration-none"
            }
          >
            Registro de Equipos ASIC
          </Link>
        )}
      </div>
    </div>
  );
}

function TotalWatcherSlotsOverview({
  slotRows,
  configuredIndices,
  onOpenConfig,
}: {
  slotRows: NhWatcherSlotRow[];
  configuredIndices: number[];
  onOpenConfig: () => void;
}) {
  return (
    <div className="nh-watcher-slot-bar nh-watcher-slot-bar--page nh-watcher-slot-bar--total-overview">
      <div className="nh-watcher-slot-bar__tabs d-flex flex-wrap align-items-center gap-1 flex-grow-1 min-w-0">
        {configuredIndices.length === 0 ? (
          <span className="nh-watcher-slot-bar__hint small">Sin enlaces con UUID. Configurá W1…WN con el engranaje.</span>
        ) : (
          configuredIndices.map((idx) => {
            const nick = (slotRows[idx]?.nickname ?? "").trim();
            const linkTitle = nick ? `${nick} (enlace W${idx + 1})` : `Enlace W${idx + 1}`;
            return (
              <Link
                key={idx}
                to={`/asic/monitor-equipos?watcher=1&slot=${idx + 1}`}
                className="nh-watcher-slot-tab nh-watcher-slot-tab--aggregate text-decoration-none"
                title={linkTitle}
              >
                {nick ? (
                  <span
                    className="nh-watcher-slot-tab__label nh-watcher-slot-tab__nick text-truncate d-inline-block align-bottom"
                    style={{ maxWidth: "10rem" }}
                  >
                    {nick}
                  </span>
                ) : (
                  <span className="nh-watcher-slot-tab__n">W{idx + 1}</span>
                )}
              </Link>
            );
          })
        )}
        <Link
          to="/asic/monitor-equipos?watcher=total"
          className="nh-watcher-slot-tab nh-watcher-slot-tab--aggregate nh-watcher-slot-tab--active ms-1 text-decoration-none"
          title="Tablero consolidado de todos los watchers"
        >
          TOTAL
        </Link>
      </div>
      <button
        type="button"
        className="nh-watcher-config-btn ms-auto"
        onClick={onOpenConfig}
        aria-label="Configuración de watchers"
        title="Configuración de watchers (hasta 16 enlaces)"
      >
        <i className="bi bi-gear-fill" aria-hidden />
      </button>
    </div>
  );
}

export function NiceHashWatcherDashboard({
  active,
  layout,
  onClose,
  viewMode = "activeSlot",
}: NiceHashWatcherDashboardProps) {
  const isTotal = viewMode === "allConfiguredSlots";

  const [searchParams, setSearchParams] = useSearchParams();
  const watcherSlot1FromUrl = useMemo(() => {
    if (layout !== "fullscreen") return null;
    const raw = searchParams.get("slot")?.trim();
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > NH_WATCHER_SLOT_COUNT) return null;
    return n;
  }, [layout, searchParams]);

  const [slotRows, setSlotRows] = useState(() => loadWatcherSlotRows());
  const [activeSlot, setActiveSlot] = useState(() => initialActiveSlotIndex(loadWatcherSlotRows()));

  const effectiveWatcherId = useMemo(
    () => resolveWatcherIdAtSlot(slotRows, activeSlot, NICEHASH_WATCHER_ID),
    [slotRows, activeSlot]
  );

  const minerPageUrlForBar = useMemo(
    () => (isTotal ? null : niceHashMinerPageUrl(effectiveWatcherId)),
    [isTotal, effectiveWatcherId]
  );

  const configuredSlotIndices = useMemo(() => listConfiguredWatcherSlotIndices(slotRows), [slotRows]);

  useEffect(() => {
    if (isTotal || watcherSlot1FromUrl == null) return;
    const idx0 = watcherSlot1FromUrl - 1;
    const configured = listConfiguredWatcherSlotIndices(slotRows);
    if (!configured.includes(idx0)) return;
    setActiveSlot(idx0);
    saveActiveWatcherSlotIndex(idx0);
  }, [isTotal, watcherSlot1FromUrl, slotRows]);

  const [configOpen, setConfigOpen] = useState(false);
  const [fleetHashDetailOpen, setFleetHashDetailOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<NhWatcherSlotRow[]>(() => loadWatcherSlotRows().map((r) => ({ ...r })));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<NiceHashExternalRigs2Payload | null>(null);
  type MultiOkRow = { slotIndex: number; watcherId: string; payload: NiceHashExternalRigs2Payload };
  const [multiOk, setMultiOk] = useState<MultiOkRow[]>([]);
  const [multiFail, setMultiFail] = useState<Array<{ slotIndex: number; watcherId: string; error: string }>>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [rigNicknames, setRigNicknames] = useState<Record<string, string>>({});
  const [rigHashSeriesMap, setRigHashSeriesMap] = useState<Record<string, number[]>>({});
  /** Historial local ~1 min: suma TH/s y MH/s del toolbar (un watcher o vista TOTAL). */
  const [toolbarSparkSeries, setToolbarSparkSeries] = useState<{ th: number[]; mh: number[] }>({ th: [], mh: [] });
  /** Spot BTC/USD si el backend no pudo traer `_sgi.btcSpotUsd` (p. ej. CoinGecko bloqueado en el servidor). */
  const [clientBtcSpotUsd, setClientBtcSpotUsd] = useState<number | null>(null);
  /** Evita registrar hashrate de un payload obsoleto si cambió el watcher antes de terminar el fetch. */
  const payloadWatcherMatchRef = useRef<string | null>(null);

  const nhAgg = useMemo((): NhWatcherAgg | null => {
    if (isTotal) {
      if (multiOk.length === 0) return null;
      return mergeTotalWatcherAggs(multiOk);
    }
    if (!payload) return null;
    return buildNhAggFromPayload(payload);
  }, [isTotal, multiOk, payload]);

  const flatRigs = useMemo((): RigFlatRow[] | null => {
    if (!isTotal) return null;
    const out: RigFlatRow[] = [];
    for (const { slotIndex, watcherId, payload: pl } of multiOk) {
      const rigs = pl.miningRigs ?? [];
      for (let rigIndex = 0; rigIndex < rigs.length; rigIndex++) {
        out.push({ slotIndex, watcherId, rig: rigs[rigIndex], rigIndex, payload: pl });
      }
    }
    return out;
  }, [isTotal, multiOk]);

  const syntheticPayload = useMemo(() => {
    if (!isTotal || multiOk.length === 0) return null;
    return buildSyntheticPayloadForTotal(multiOk);
  }, [isTotal, multiOk]);

  const displayPayload = isTotal ? syntheticPayload : payload;

  const effectiveBtcSpotUsd = useMemo((): number | undefined => {
    const s = displayPayload?._sgi?.btcSpotUsd;
    if (typeof s === "number" && Number.isFinite(s) && s > 0) return s;
    if (typeof clientBtcSpotUsd === "number" && Number.isFinite(clientBtcSpotUsd) && clientBtcSpotUsd > 0) return clientBtcSpotUsd;
    return undefined;
  }, [displayPayload?._sgi?.btcSpotUsd, clientBtcSpotUsd]);

  const nhProfitContextKey = useMemo(
    () => (isTotal ? "fleet:total:v1" : `watcher:${effectiveWatcherId.trim().toLowerCase()}`),
    [isTotal, effectiveWatcherId]
  );

  const [profitMonthClockMs, setProfitMonthClockMs] = useState(() => Date.now());
  const utcYearMonthProfit = useMemo(() => utcYearMonthFromMs(profitMonthClockMs), [profitMonthClockMs]);

  const [monthProfit, setMonthProfit] = useState<{
    yearMonth: string;
    totalBtc: number;
    snapshotCount: number;
  } | null>(null);
  const [monthProfitLoading, setMonthProfitLoading] = useState(false);

  useEffect(() => {
    setMonthProfit(null);
  }, [nhProfitContextKey]);

  const reloadMonthProfit = useCallback(async () => {
    const ym = utcYearMonthFromMs(Date.now());
    try {
      setMonthProfitLoading(true);
      const r = await getNiceHashWatcherProfitMonth({ contextKey: nhProfitContextKey, yearMonth: ym });
      setMonthProfit({
        yearMonth: r.yearMonth,
        totalBtc: r.totalBtc,
        snapshotCount: r.snapshotCount,
      });
    } catch {
      setMonthProfit(null);
    } finally {
      setMonthProfitLoading(false);
    }
  }, [nhProfitContextKey]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setProfitMonthClockMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active || !nhAgg) return;
    void reloadMonthProfit();
  }, [active, nhAgg, nhProfitContextKey, utcYearMonthProfit, reloadMonthProfit]);

  useEffect(() => {
    if (!active || !nhAgg || nhAgg.btc24 == null || !Number.isFinite(nhAgg.btc24) || nhAgg.btc24 < 0) return;
    const ck = nhProfitContextKey;
    const profit = nhAgg.btc24;
    const lsKey = `nhWatcherProfitSnapAt:${ck}`;
    let cancelled = false;
    void (async () => {
      try {
        if (typeof window === "undefined") return;
        const last = Number(window.localStorage.getItem(lsKey) || "0");
        const now = Date.now();
        if (Number.isFinite(last) && now - last < 23 * 60 * 60 * 1000) return;
        const r = await postNiceHashWatcherProfitSnapshot({ contextKey: ck, profitBtc24h: profit });
        if (cancelled || !r.ok) return;
        window.localStorage.setItem(lsKey, String(now));
        if (r.inserted) void reloadMonthProfit();
      } catch {
        /* sin sesión o red */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, nhAgg, nhProfitContextKey, fetchedAt, reloadMonthProfit]);

  const spotDependencyKey = useMemo(
    () => (isTotal ? multiOk.map((x) => x.watcherId).sort().join("|") : effectiveWatcherId),
    [isTotal, multiOk, effectiveWatcherId]
  );

  const reloadToolbarSparkSeries = useCallback(() => {
    if (typeof window === "undefined") return;
    const fleetWid = NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID.toLowerCase();
    if (isTotal) {
      setToolbarSparkSeries({
        th: loadNiceHashToolbarThSeries(fleetWid),
        mh: loadNiceHashToolbarMhSeries(fleetWid),
      });
    } else {
      const w = effectiveWatcherId.trim().toLowerCase();
      setToolbarSparkSeries({ th: loadNiceHashToolbarThSeries(w), mh: loadNiceHashToolbarMhSeries(w) });
    }
  }, [isTotal, effectiveWatcherId]);

  useEffect(() => {
    if (!active) return;
    reloadToolbarSparkSeries();
  }, [active, isTotal, effectiveWatcherId, multiOk, reloadToolbarSparkSeries]);

  useEffect(() => {
    setClientBtcSpotUsd(null);
  }, [spotDependencyKey]);

  useEffect(() => {
    if (!active || !displayPayload) return;
    const sgi = displayPayload._sgi;
    const serverSpot = sgi?.btcSpotUsd;
    if (typeof serverSpot === "number" && Number.isFinite(serverSpot) && serverSpot > 0) {
      setClientBtcSpotUsd(null);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    void (async () => {
      try {
        const nhR = await fetch(NH_EXCHANGE_RATE_LIST, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        if (!cancelled && nhR.ok) {
          const nhBody = (await nhR.json()) as unknown;
          const spotNh = parseBtcUsdFromNiceHashExchangeListJson(nhBody);
          if (spotNh != null && spotNh > 0) {
            setClientBtcSpotUsd(spotNh);
            return;
          }
        }
        const r = await fetch(COINGECKO_BTC_USD, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { bitcoin?: { usd?: number } };
        const n = j?.bitcoin?.usd;
        if (cancelled || typeof n !== "number" || !Number.isFinite(n) || n <= 0) return;
        setClientBtcSpotUsd(n);
      } catch {
        /* red / CORS / abort */
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [active, displayPayload]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
        setError(null);
        payloadWatcherMatchRef.current = null;
      }
      if (!isTotal) {
        const wid = effectiveWatcherId;
        const row = slotRows[activeSlot];
        const nhWalletApi =
          row?.nhOrgId?.trim() && row?.nhApiKey?.trim() && row?.nhApiSecret?.trim()
            ? {
                orgId: row.nhOrgId.trim(),
                apiKey: row.nhApiKey.trim(),
                apiSecret: row.nhApiSecret.trim(),
              }
            : null;
        try {
          const data = await getNiceHashExternalRigs2(wid, nhWalletApi);
          payloadWatcherMatchRef.current = wid;
          setPayload(data);
          setFetchedAt(Date.now());
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setPayload((prev) => (prev == null ? null : prev));
          if (!silent) payloadWatcherMatchRef.current = null;
        } finally {
          if (!silent) setLoading(false);
        }
        return;
      }

      try {
        const indices = listConfiguredWatcherSlotIndices(slotRows);
        if (indices.length === 0) {
          setMultiOk([]);
          setMultiFail([]);
          setError("No hay enlaces watcher con UUID válido. Configurá al menos un W1…WN con el engranaje.");
          setFetchedAt(Date.now());
          payloadWatcherMatchRef.current = null;
          return;
        }
        const outcomes = await Promise.all(
          indices.map(async (slotIndex) => {
            const wid = resolveWatcherIdAtSlot(slotRows, slotIndex, NICEHASH_WATCHER_ID);
            const row = slotRows[slotIndex];
            const nhWalletApi =
              row?.nhOrgId?.trim() && row?.nhApiKey?.trim() && row?.nhApiSecret?.trim()
                ? {
                    orgId: row.nhOrgId.trim(),
                    apiKey: row.nhApiKey.trim(),
                    apiSecret: row.nhApiSecret.trim(),
                  }
                : null;
            try {
              const data = await getNiceHashExternalRigs2(wid, nhWalletApi);
              return { slotIndex, watcherId: wid, ok: true as const, payload: data };
            } catch (e) {
              return {
                slotIndex,
                watcherId: wid,
                ok: false as const,
                error: e instanceof Error ? e.message : String(e),
              };
            }
          })
        );
        const ok: MultiOkRow[] = outcomes
          .filter((o): o is { slotIndex: number; watcherId: string; ok: true; payload: NiceHashExternalRigs2Payload } => o.ok)
          .map((o) => ({ slotIndex: o.slotIndex, watcherId: o.watcherId, payload: o.payload }));
        const fail = outcomes
          .filter((o) => !o.ok)
          .map((o) => ({ slotIndex: o.slotIndex, watcherId: o.watcherId, error: "error" in o ? o.error : "Error" }));
        setMultiOk(ok);
        setMultiFail(fail);
        if (ok.length === 0) {
          setError(fail.length ? "No se pudo leer ningún watcher." : "Sin datos.");
          payloadWatcherMatchRef.current = null;
        } else {
          setError(null);
          payloadWatcherMatchRef.current = `TOTAL:${ok
            .map((x) => x.watcherId.trim().toLowerCase())
            .sort()
            .join("|")}`;
        }
        setFetchedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        payloadWatcherMatchRef.current = null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isTotal, effectiveWatcherId, slotRows, activeSlot]
  );

  useEffect(() => {
    if (!active) return;
    void wakeUpBackend();
    void refresh();
  }, [active, refresh]);

  /** Renovación automática cada 1 min sin pantalla en blanco (actualización silenciosa). */
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      void refresh({ silent: true });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [active, refresh]);

  useEffect(() => {
    if (!active || isTotal) return;
    setRigNicknames(loadNiceHashWatcherRigNicknames(effectiveWatcherId));
  }, [active, isTotal, effectiveWatcherId]);

  useEffect(() => {
    if (!active || !isTotal) return;
    const merged: Record<string, string> = {};
    for (const { watcherId } of multiOk) {
      const wid = watcherId.trim().toLowerCase();
      const m = loadNiceHashWatcherRigNicknames(wid);
      for (const [k, v] of Object.entries(m)) {
        merged[nhCompositeRigKey(wid, k)] = v;
      }
    }
    setRigNicknames(merged);
  }, [active, isTotal, multiOk]);

  /** Sparklines: localStorage + BD (por usuario y watcher) para ver historial al abrir desde otro navegador o PC. */
  useEffect(() => {
    if (!active || isTotal) return;
    const wid = effectiveWatcherId.trim().toLowerCase();
    setRigHashSeriesMap(loadNiceHashRigHashrateSeriesMap(wid));
    let cancelled = false;
    void (async () => {
      try {
        const { series } = await getNiceHashWatcherRigHashHistory(wid);
        if (cancelled) return;
        const local = loadNiceHashRigHashratePointsMap(wid);
        const merged = mergeNiceHashRigHashratePointMaps(local, series);
        replaceNiceHashRigHashrateHistoryMap(wid, merged);
        setRigHashSeriesMap(loadNiceHashRigHashrateSeriesMap(wid));
        reloadToolbarSparkSeries();
      } catch {
        /* sin sesión o red */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, isTotal, effectiveWatcherId, reloadToolbarSparkSeries]);

  useEffect(() => {
    if (!active || !isTotal) return;
    let cancelled = false;
    void (async () => {
      const fleetWid = NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID.toLowerCase();
      const slotTasks = multiOk.map(async ({ watcherId }) => {
        const wid = watcherId.trim().toLowerCase();
        try {
          const { series } = await getNiceHashWatcherRigHashHistory(wid);
          if (cancelled) return;
          const local = loadNiceHashRigHashratePointsMap(wid);
          const mergedPts = mergeNiceHashRigHashratePointMaps(local, series);
          replaceNiceHashRigHashrateHistoryMap(wid, mergedPts);
        } catch {
          /* */
        }
      });
      const fleetTask = (async () => {
        try {
          const { series: fleetSeries } = await getNiceHashWatcherRigHashHistory(fleetWid);
          if (cancelled) return;
          const localFleet = loadNiceHashRigHashratePointsMap(fleetWid);
          const mergedFleet = mergeNiceHashRigHashratePointMaps(localFleet, fleetSeries);
          replaceNiceHashRigHashrateHistoryMap(fleetWid, mergedFleet);
        } catch {
          /* */
        }
      })();
      await Promise.all([...slotTasks, fleetTask]);
      if (cancelled) return;
      const mergedSeries: Record<string, number[]> = {};
      for (const { watcherId } of multiOk) {
        const wid = watcherId.trim().toLowerCase();
        const m = loadNiceHashRigHashrateSeriesMap(wid);
        for (const [k, arr] of Object.entries(m)) {
          if (k === NH_WATCHER_TOOLBAR_TH_KEY || k === NH_WATCHER_TOOLBAR_MH_KEY) continue;
          mergedSeries[nhCompositeRigKey(wid, k)] = arr;
        }
      }
      setRigHashSeriesMap(mergedSeries);
      reloadToolbarSparkSeries();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, isTotal, multiOk, reloadToolbarSparkSeries]);

  useEffect(() => {
    if (!active || isTotal || !payload?.miningRigs?.length) return;
    const wid = effectiveWatcherId;
    if (payloadWatcherMatchRef.current !== wid) return;
    const now = Date.now();
    const widNorm = wid.trim().toLowerCase();
    const toPush: { rigKey: string; t: number; v: number }[] = [];
    for (let i = 0; i < payload.miningRigs.length; i++) {
      const rig = payload.miningRigs[i];
      const rk = nhWatcherRigStorageKey(rig, i);
      const sp = rig.stats?.[0]?.speedAccepted;
      const r = appendNiceHashRigHashrateSample(wid, rk, typeof sp === "number" ? sp : null, now);
      if (r.added && r.rigKey != null && r.t != null && r.v != null) {
        toPush.push({ rigKey: r.rigKey, t: r.t, v: r.v });
      }
    }
    const { sumTh, sumMh } = sumAcceptedThMhFromMiningRigs(payload.miningRigs);
    const toolbarPush = appendWatcherToolbarSpeedSamplesReturn(widNorm, sumTh, sumMh, now);
    const allPush = [...toPush, ...toolbarPush];
    setRigHashSeriesMap(loadNiceHashRigHashrateSeriesMap(wid));
    reloadToolbarSparkSeries();
    if (allPush.length > 0) {
      void postNiceHashWatcherRigHashHistorySamples(widNorm, allPush).catch(() => {});
    }
  }, [active, isTotal, payload, effectiveWatcherId, reloadToolbarSparkSeries]);

  useEffect(() => {
    if (!active || !isTotal || multiOk.length === 0) return;
    const ref = payloadWatcherMatchRef.current;
    if (!ref || !ref.startsWith("TOTAL:")) return;
    const now = Date.now();
    for (const { watcherId, payload: pl } of multiOk) {
      const widNorm = watcherId.trim().toLowerCase();
      const rigs = pl.miningRigs ?? [];
      const toPush: { rigKey: string; t: number; v: number }[] = [];
      for (let i = 0; i < rigs.length; i++) {
        const rig = rigs[i];
        const rk = nhWatcherRigStorageKey(rig, i);
        const sp = rig.stats?.[0]?.speedAccepted;
        const r = appendNiceHashRigHashrateSample(widNorm, rk, typeof sp === "number" ? sp : null, now);
        if (r.added && r.rigKey != null && r.t != null && r.v != null) {
          toPush.push({ rigKey: r.rigKey, t: r.t, v: r.v });
        }
      }
      if (toPush.length > 0) {
        void postNiceHashWatcherRigHashHistorySamples(widNorm, toPush).catch(() => {});
      }
    }
    let fleetTh = 0;
    let fleetMh = 0;
    for (const { payload: pl } of multiOk) {
      const s = sumAcceptedThMhFromMiningRigs(pl.miningRigs);
      fleetTh += s.sumTh;
      fleetMh += s.sumMh;
    }
    const fleetWid = NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID.toLowerCase();
    const fleetPush = appendWatcherToolbarSpeedSamplesReturn(fleetWid, fleetTh, fleetMh, now);
    if (fleetPush.length > 0) {
      void postNiceHashWatcherRigHashHistorySamples(fleetWid, fleetPush).catch(() => {});
    }
    const mergedSeries: Record<string, number[]> = {};
    for (const { watcherId } of multiOk) {
      const widNorm = watcherId.trim().toLowerCase();
      const m = loadNiceHashRigHashrateSeriesMap(widNorm);
      for (const [k, arr] of Object.entries(m)) {
        if (k === NH_WATCHER_TOOLBAR_TH_KEY || k === NH_WATCHER_TOOLBAR_MH_KEY) continue;
        mergedSeries[nhCompositeRigKey(widNorm, k)] = arr;
      }
    }
    setRigHashSeriesMap(mergedSeries);
    reloadToolbarSparkSeries();
  }, [active, isTotal, multiOk, reloadToolbarSparkSeries]);

  useEffect(() => {
    if (isTotal) return;
    const key = getNiceHashRigHashrateHistoryStorageKey(effectiveWatcherId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setRigHashSeriesMap(loadNiceHashRigHashrateSeriesMap(effectiveWatcherId));
        reloadToolbarSparkSeries();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [effectiveWatcherId, isTotal, reloadToolbarSparkSeries]);

  useEffect(() => {
    if (isTotal) return;
    const key = getNiceHashWatcherNicknamesStorageKey(effectiveWatcherId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setRigNicknames(loadNiceHashWatcherRigNicknames(effectiveWatcherId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [effectiveWatcherId, isTotal]);

  useEffect(() => {
    if (!isTotal) return;
    const fleetWid = NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID.toLowerCase();
    const key = getNiceHashRigHashrateHistoryStorageKey(fleetWid);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) reloadToolbarSparkSeries();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isTotal, reloadToolbarSparkSeries]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === getWatcherSlotRowsStorageKey()) {
        const next = loadWatcherSlotRows();
        setSlotRows(next);
        setActiveSlot((cur) => pickValidActiveSlotIndex(next, cur));
      }
      if (e.key === getWatcherActiveSlotStorageKey()) {
        setActiveSlot(loadActiveWatcherSlotIndex());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const saveWatcherConfig = useCallback(() => {
    const padded: NhWatcherSlotRow[] = [...configDraft];
    while (padded.length < NH_WATCHER_SLOT_COUNT) padded.push({ ...NH_EMPTY_SLOT_ROW });
    const trimmed = padded.slice(0, NH_WATCHER_SLOT_COUNT).map((row) => ({
      link: (row.link ?? "").trim().slice(0, 512),
      nickname: (row.nickname ?? "").trim().slice(0, NH_WATCHER_SLOT_NICKNAME_MAX),
      nhOrgId: (row.nhOrgId ?? "").trim().slice(0, 200),
      nhApiKey: (row.nhApiKey ?? "").trim().slice(0, 400),
      nhApiSecret: (row.nhApiSecret ?? "").trim().slice(0, 400),
    }));
    saveWatcherSlotRows(trimmed);
    setSlotRows(trimmed);
    setActiveSlot((cur) => {
      const next = pickValidActiveSlotIndex(trimmed, cur);
      saveActiveWatcherSlotIndex(next);
      return next;
    });
    setConfigOpen(false);
  }, [configDraft]);

  const openConfig = useCallback(() => {
    setConfigDraft(loadWatcherSlotRows().map((r) => ({ ...r })));
    setConfigOpen(true);
  }, []);

  useEffect(() => {
    if (fleetHashDetailOpen && !nhAgg) setFleetHashDetailOpen(false);
  }, [fleetHashDetailOpen, nhAgg]);

  const mergedMinerStatuses = useMemo(() => {
    if (!isTotal || multiOk.length === 0) return null;
    return mergeMinerStatusesPayloads(multiOk.map((x) => x.payload));
  }, [isTotal, multiOk]);

  const lastPayoutFootnoteLines = useMemo(() => {
    if (!isTotal || multiOk.length === 0) return null;
    return multiOk
      .map(({ slotIndex, payload: pl }) =>
        pl.lastPayoutTimestamp ? `W${slotIndex + 1}: ${formatNiceHashIsoShort(pl.lastPayoutTimestamp)}` : null
      )
      .filter((x): x is string => x != null);
  }, [isTotal, multiOk]);

  const awaitingFirstPayload = isTotal ? multiOk.length === 0 && multiFail.length === 0 : !payload;

  const rigRowsForList = useMemo((): RigFlatRow[] => {
    if (!nhAgg) return [];
    if (isTotal && flatRigs != null) return flatRigs;
    if (!payload) return [];
    return nhAgg.rigs.map((rig, rigIndex) => ({
      slotIndex: activeSlot,
      watcherId: effectiveWatcherId,
      rig,
      rigIndex,
      payload,
    }));
  }, [nhAgg, isTotal, flatRigs, payload, activeSlot, effectiveWatcherId]);

  const fleetHashModalRows = useMemo(
    () => rigRowsForList.map(({ slotIndex, watcherId, rigIndex, rig }) => ({ slotIndex, watcherId, rigIndex, rig })),
    [rigRowsForList]
  );

  const fleetHashModal =
    fleetHashDetailOpen && nhAgg ? (
      <NiceHashFleetHashrateModal
        open
        onClose={() => setFleetHashDetailOpen(false)}
        rows={fleetHashModalRows}
        slotRows={slotRows}
        isTotal={isTotal}
      />
    ) : null;

  if (!active) return null;

  const shell = (
    <div className="nh-watcher-shell">
      {layout === "embedded" && !isTotal ? (
        <WatcherSlotBar
          variant="embedded"
          slotRows={slotRows}
          activeSlot={activeSlot}
          configuredIndices={configuredSlotIndices}
          onSelectSlot={(idx) => {
            setActiveSlot(idx);
            saveActiveWatcherSlotIndex(idx);
          }}
          onOpenConfig={openConfig}
        />
      ) : null}
      {loading && awaitingFirstPayload ? (
        <div className="nh-watcher-loading" role="status">
          <span className="spinner-border text-success mb-2" aria-hidden />
          <div>Sincronizando con NiceHash…</div>
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger m-3 border-0 shadow-sm" role="alert">
          {error}
        </div>
      ) : null}
      {multiFail.length > 0 ? (
        <div className="alert alert-warning m-3 mb-0 border-0 shadow-sm small" role="status">
          <strong className="d-block mb-1">Algunos watchers fallaron</strong>
          <ul className="mb-0 ps-3">
            {multiFail.map((f) => (
              <li key={`${f.slotIndex}-${f.watcherId}`}>
                W{f.slotIndex + 1} ({f.watcherId.slice(0, 8)}…): {f.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {nhAgg ? (
        <div className="nh-watcher-inner px-3 px-md-4 pt-3 pb-3">
          <div className="nh-watcher-kpi-grid mb-3">
            <div className="nh-watcher-kpi nh-watcher-kpi--accent">
              <div className="nh-watcher-kpi__head">
                <span className="nh-watcher-kpi__icon-wrap nh-watcher-kpi__icon-wrap--accent" aria-hidden>
                  <i className="bi bi-hdd-network nh-watcher-kpi__icon" />
                </span>
                <div className="nh-watcher-kpi__label">ASICs en marcha</div>
              </div>
              <div className="nh-watcher-kpi__value">
                {nhAgg.miningN} / {nhAgg.totalRigs || nhAgg.rigs.length}
              </div>
              <div className="nh-watcher-kpi__sub">
                <span className="nh-watcher-kpi__sub--accent">{nhAgg.totalDev} dispositivos</span> reportados
                {isTotal && multiOk.length > 0 ? (
                  <>
                    {" "}
                    · <span className="nh-watcher-kpi__sub--accent">{multiOk.length} watchers</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="nh-watcher-kpi">
              <div className="nh-watcher-kpi__head">
                <span className="nh-watcher-kpi__icon-wrap" aria-hidden>
                  <i className="bi bi-graph-up-arrow nh-watcher-kpi__icon" />
                </span>
                <div className="nh-watcher-kpi__label">Rentabilidad (24 h)</div>
              </div>
              <div className="nh-watcher-kpi__value nh-watcher-kpi__value--btc">
                {nhAgg.btc24 != null ? `${formatNiceHashBtc8(nhAgg.btc24)} BTC` : "—"}
              </div>
              <div className="nh-watcher-kpi__fiat">{formatRent24hUsdApprox(displayPayload, nhAgg.btc24, effectiveBtcSpotUsd) ?? "—"}</div>
              <div className="nh-watcher-kpi__sub">
                {isTotal ? "Suma solo ASICs en MINING (todos los watchers)" : "Suma API / ASICs"}
              </div>
            </div>
            <div className="nh-watcher-kpi">
              <div className="nh-watcher-kpi__head">
                <span className="nh-watcher-kpi__icon-wrap" aria-hidden>
                  <i className="bi bi-calendar3 nh-watcher-kpi__icon" />
                </span>
                <div className="nh-watcher-kpi__label">Rentabilidad (mes acum.)</div>
              </div>
              <div className="nh-watcher-kpi__value nh-watcher-kpi__value--btc">
                {monthProfitLoading && monthProfit == null
                  ? "…"
                  : monthProfit != null
                    ? `${formatNiceHashBtc8(monthProfit.totalBtc)} BTC`
                    : "—"}
              </div>
              <div className="nh-watcher-kpi__fiat">
                {monthProfit != null
                  ? formatRent24hUsdApprox(displayPayload, monthProfit.totalBtc, effectiveBtcSpotUsd) ?? "—"
                  : "—"}
              </div>
              <div className="nh-watcher-kpi__sub">
                Suma de snapshots 24 h en BD · {formatUtcYearMonthLongEs(utcYearMonthProfit)} UTC
                {monthProfit != null ? (
                  <>
                    {" "}
                    · <span className="nh-watcher-kpi__sub--accent">{monthProfit.snapshotCount}</span> reg.
                  </>
                ) : null}
              </div>
            </div>
            <div className="nh-watcher-kpi">
              <div className="nh-watcher-kpi__head">
                <span className="nh-watcher-kpi__icon-wrap" aria-hidden>
                  <i className="bi bi-wallet2 nh-watcher-kpi__icon" />
                </span>
                <div className="nh-watcher-kpi__label">Saldo impago (minería)</div>
              </div>
              <div className="nh-watcher-kpi__value nh-watcher-kpi__value--btc">
                {nhAgg.unpaid ?? "—"}
                {nhAgg.unpaid ? <span className="text-uppercase"> BTC</span> : null}
              </div>
              <div className="nh-watcher-kpi__fiat">{formatUnpaidMiningUsdApprox(displayPayload, nhAgg.unpaid, effectiveBtcSpotUsd) ?? "—"}</div>
              <div className="nh-watcher-kpi__sub">
                {isTotal ? "Solo ASICs en MINING (impago por equipo)" : "Balance acumulado sin liquidar"}
              </div>
            </div>
            <div className="nh-watcher-kpi">
              <div className="nh-watcher-kpi__head">
                <span className="nh-watcher-kpi__icon-wrap" aria-hidden>
                  <i className="bi bi-hourglass-split nh-watcher-kpi__icon" />
                </span>
                <div className="nh-watcher-kpi__label">Próximo pago (estim.)</div>
              </div>
              <div className="nh-watcher-kpi__value" style={{ fontSize: "1.15rem" }}>
                <WatcherLiveCountdown iso={nhAgg.nextPayout} />
              </div>
              <div className="nh-watcher-kpi__sub">
                {nhAgg.nextPayout ? formatNiceHashIsoShort(nhAgg.nextPayout) : "—"}
                {isTotal && nhAgg.nextPayout ? (
                  <span className="d-block small text-secondary mt-1">Cuenta NiceHash con ASICs en MINING</span>
                ) : null}
              </div>
            </div>
          </div>
          {displayPayload?._sgi?.walletError ? (
            <div className="alert alert-warning py-2 px-3 mb-3 border-0 small" role="status">
              {displayPayload._sgi.walletError}
            </div>
          ) : null}

          <div
            className="nh-watcher-toolbar mb-3 nh-watcher-toolbar--fleet-hash-modal-trigger"
            role="button"
            tabIndex={0}
            aria-label="Abrir monitor de hashrate por equipo a pantalla completa"
            onClick={() => setFleetHashDetailOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFleetHashDetailOpen(true);
              }
            }}
          >
            <div className="nh-watcher-toolbar__left min-w-0">
              <div className="nh-watcher-toolbar__kicker">
                <strong>Velocidad total (aceptada)</strong>
                <span className="mx-1">·</span>
                {nhAgg.algoLine}
              </div>
              <div className="nh-watcher-toolbar-speeds" role="list" aria-label="Velocidad por tipo de equipo">
                {nhAgg.sumTh > 0 ? (
                  <div
                    className="nh-watcher-toolbar-speed-tile nh-watcher-toolbar-speed-tile--primary nh-watcher-toolbar-speed-tile--with-spark"
                    role="listitem"
                  >
                    <div className="nh-watcher-toolbar-speed-tile__main">
                      <span className="nh-watcher-toolbar-speed-tile__label">Scrypt · BTC</span>
                      <span className="nh-watcher-toolbar-speed-tile__hint">Velocidad aceptada (TH/s)</span>
                      <strong className="nh-watcher-toolbar-speed-tile__value mono">
                        {nhAgg.sumTh.toFixed(2)}
                        <span className="nh-watcher-toolbar-speed-tile__unit">TH/s</span>
                      </strong>
                    </div>
                    <div className="nh-watcher-toolbar-speed-tile__spark" aria-hidden>
                      <NiceHashRigHashSparkline
                        values={toolbarSparkSeries.th}
                        title="Suma TH/s aceptados (Scrypt · BTC), ~1 min entre puntos (solo este navegador)"
                        formatHashrate={formatToolbarSparkTh}
                      />
                    </div>
                  </div>
                ) : null}
                {nhAgg.sumMh > 0 ? (
                  <div className="nh-watcher-toolbar-speed-tile nh-watcher-toolbar-speed-tile--with-spark" role="listitem">
                    <div className="nh-watcher-toolbar-speed-tile__main">
                      <span className="nh-watcher-toolbar-speed-tile__label">Scrypt · LTC / DOGE</span>
                      <span className="nh-watcher-toolbar-speed-tile__hint">Velocidad aceptada (MH/s)</span>
                      <strong className="nh-watcher-toolbar-speed-tile__value mono">
                        {nhAgg.sumMh.toFixed(2)}
                        <span className="nh-watcher-toolbar-speed-tile__unit">MH/s</span>
                      </strong>
                    </div>
                    <div className="nh-watcher-toolbar-speed-tile__spark" aria-hidden>
                      <NiceHashRigHashSparkline
                        values={toolbarSparkSeries.mh}
                        title="Suma MH/s aceptados (Scrypt · LTC / DOGE), ~1 min entre puntos (solo este navegador)"
                        formatHashrate={formatToolbarSparkMh}
                      />
                    </div>
                  </div>
                ) : null}
                {nhAgg.sumTh <= 0 && nhAgg.sumMh <= 0 ? (
                  <div className="nh-watcher-toolbar-speed-tile nh-watcher-toolbar-speed-tile--empty" role="listitem">
                    <span className="nh-watcher-toolbar-speed-tile__hint mb-0">Sin velocidad reportada</span>
                  </div>
                ) : null}
              </div>
              {mergedMinerStatuses && Object.keys(mergedMinerStatuses).length > 0 ? (
                <div className="nh-watcher-toolbar__statusline mt-2">
                  <span className="nh-watcher-toolbar__statusdot" aria-hidden />
                  {Object.entries(mergedMinerStatuses)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </div>
              ) : !isTotal && payload?.minerStatuses && Object.keys(payload.minerStatuses).length > 0 ? (
                <div className="nh-watcher-toolbar__statusline mt-2">
                  <span className="nh-watcher-toolbar__statusdot" aria-hidden />
                  {Object.entries(payload.minerStatuses)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </div>
              ) : null}
            </div>
            <div className="nh-watcher-toolbar__right">
              {fetchedAt ? (
                <>
                  Última sync:{" "}
                  {new Date(fetchedAt).toLocaleTimeString("es-UY", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </>
              ) : (
                "Sin sincronizar aún"
              )}
              {loading ? (
                <span className="ms-2 d-inline-flex align-items-center gap-1 text-success">
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
                </span>
              ) : null}
            </div>
          </div>

          <h3 className="nh-watcher-section-title">{isTotal ? "Todos los ASICs · TOTAL" : "Mis ASICs"}</h3>
          <div className="nh-watcher-rig-list">
            {rigRowsForList.length === 0 ? (
              <div className="text-center text-secondary py-4">No hay ASICs en la respuesta.</div>
            ) : (
              rigRowsForList.map((row) => {
                const { slotIndex, watcherId, rig, rigIndex } = row;
                const label = (rig.name ?? rig.rigId ?? "—").trim() || "—";
                const rigKeyLocal = nhWatcherRigStorageKey(rig, rigIndex);
                const compositeKey = nhCompositeRigKey(watcherId, rigKeyLocal);
                const seriesKey = isTotal ? compositeKey : rigKeyLocal;
                const status = (rig.minerStatus ?? "—").trim() || "—";
                const st0 = rig.stats?.[0];
                const spd = typeof st0?.speedAccepted === "number" ? st0.speedAccepted : null;
                const rigBtc24 =
                  typeof rig.profitability === "number" && Number.isFinite(rig.profitability)
                    ? rig.profitability
                    : typeof st0?.profitability === "number" && Number.isFinite(st0.profitability)
                      ? st0.profitability
                      : null;
                const unpaidRig = rig.unpaidAmount?.trim() || "—";
                const nhTypeLabel = (rig.type ?? "UNMANAGED").toString().replace(/_/g, " ");
                const slotNick = watcherSlotNicknameTrimmed(slotRows, slotIndex);
                const resolvedNick = rigNicknames[seriesKey] ?? (slotNick || NH_WATCHER_DEFAULT_RIG_NICKNAME);
                const nickSourceHint = rigNicknames[seriesKey]
                  ? "Apodo por equipo (guardado antes en este navegador)"
                  : slotNick
                    ? `Apodo del watcher · NiceHash: ${nhTypeLabel}`
                    : `Apodo por defecto · NiceHash: ${nhTypeLabel}`;
                return (
                  <article key={seriesKey} className="nh-watcher-rig-card">
                    <div className="nh-watcher-rig-card__head">
                      <div className="nh-watcher-rig-card__grow">
                        <div className="nh-watcher-rig-card__name">
                          <NiceHashRigAsicIcon minerStatus={status} title={`Minero ASIC · ${label} (Bitcoin/crypto)`} />
                          <div className="min-w-0">
                            <span className="text-truncate d-block">{label}</span>
                            <div className="nh-watcher-rig-nick">
                              <span
                                className="nh-watcher-rig-nick__text text-truncate"
                                title={nickSourceHint}
                              >
                                {resolvedNick}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="nh-watcher-rig-card__spark-wrap">
                        <NiceHashRigHashSparkline
                          values={rigHashSeriesMap[seriesKey] ?? NH_SPARKLINE_VALUES_EMPTY}
                          title={`Tendencia hashrate (${label}): una muestra cada ~1 min, hasta ~7 días (navegador + servidor para tu usuario).`}
                          formatHashrate={formatNiceHashAcceptedSpeed}
                        />
                        <span className="nh-watcher-rig-spark-caption nh-watcher-rig-spark-caption--head">~1 min</span>
                      </div>
                      <div className={nhRigStatusClass(status)}>{status}</div>
                    </div>
                    <div className="nh-watcher-rig-card__metrics" role="group" aria-label="Métricas del equipo">
                      <div className="nh-watcher-rig-metric nh-watcher-rig-metric--hash">
                        <span className="nh-watcher-rig-metric__kicker">Hashrate acept.</span>
                        <strong className="nh-watcher-rig-metric__value mono">{formatNiceHashAcceptedSpeed(spd)}</strong>
                        <span className="nh-watcher-rig-metric__meta">
                          Rechazo: {nhRejectPctLabel(st0)}
                        </span>
                      </div>
                      <div className="nh-watcher-rig-metric nh-watcher-rig-metric--crypto">
                        <span className="nh-watcher-rig-metric__kicker">Rentab. ASIC (24 h)</span>
                        <strong className="nh-watcher-rig-metric__value mono nh-watcher-rig-metric__value--btc">
                          {rigBtc24 != null ? `${formatNiceHashBtc8(rigBtc24)} BTC` : "—"}
                        </strong>
                      </div>
                      <div className="nh-watcher-rig-metric nh-watcher-rig-metric--crypto">
                        <span className="nh-watcher-rig-metric__kicker">Impago ASIC</span>
                        <strong className="nh-watcher-rig-metric__value mono nh-watcher-rig-metric__value--btc">{unpaidRig}</strong>
                      </div>
                      <div className="nh-watcher-rig-metric" title={formatNiceHashStatusTime(rig.statusTime)}>
                        <span className="nh-watcher-rig-metric__kicker">Última señal</span>
                        <strong className="nh-watcher-rig-metric__value">
                          <WatcherLiveRelativeAge statusTimeMs={rig.statusTime} />
                        </strong>
                        <span className="nh-watcher-rig-metric__meta nh-watcher-rig-metric__meta--mono d-none d-md-block">
                          {formatNiceHashStatusTime(rig.statusTime)}
                        </span>
                      </div>
                      <div className="nh-watcher-rig-metric" title="Desde timeConnected de NiceHash">
                        <span className="nh-watcher-rig-metric__kicker">Sesión</span>
                        <strong className="nh-watcher-rig-metric__value mono">
                          <WatcherLiveUptime timeConnectedMs={st0?.timeConnected} />
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      ) : !loading && !error ? (
        <div className="nh-watcher-loading text-secondary">Sin datos. Tocá «Actualizar».</div>
      ) : null}

      <div
        className={
          layout === "fullscreen"
            ? "nh-watcher-page-footer nh-watcher-page-footer--sgi"
            : "nh-watcher-page-footer nh-watcher-page-footer--embedded px-3 px-md-4 pb-3 pt-2"
        }
      >
        {nhAgg && isTotal && lastPayoutFootnoteLines && lastPayoutFootnoteLines.length > 0 ? (
          <div className="nh-watcher-footnote">
            Último pago por cuenta: {lastPayoutFootnoteLines.join(" · ")}
          </div>
        ) : nhAgg && !isTotal && payload?.lastPayoutTimestamp ? (
          <div className="nh-watcher-footnote">
            Último pago registrado por NiceHash: {formatNiceHashIsoShort(payload.lastPayoutTimestamp)}
          </div>
        ) : null}
        <WatcherActionBar
          layout={layout}
          loading={loading}
          minerPageUrl={minerPageUrlForBar}
          onRefresh={() => void refresh(isTotal ? (multiOk.length > 0 ? { silent: true } : undefined) : payload ? { silent: true } : undefined)}
          onClose={onClose}
        />
      </div>
    </div>
  );

  const configModal = (
    <AppModal
      open={configOpen}
      onOpenChange={setConfigOpen}
      variant="emerald_panel"
      size="cover"
      contentMaxW="min(calc(100vw - 1.25rem), 1140px)"
      contentClassName="nh-watcher-config-dialog"
      title="Watchers NiceHash"
      description="Hasta 16 cuentas: enlace watcher, nickname en «Mis ASICs», y opcionalmente API de cartera para el total tipo «Total Assets USD»."
      titleFontSize="2xl"
      descriptionFontSize="md"
      footer={
        <div className="nh-watcher-config-footer d-flex flex-wrap justify-content-between align-items-center gap-3 w-100">
          <span className="nh-watcher-config-footer__hint small text-secondary d-none d-sm-inline mb-0">
            Los cambios se guardan en este navegador.
          </span>
          <div className="d-flex flex-wrap gap-2 ms-sm-auto">
            <button
              type="button"
              className="nh-watcher-config-footer__btn nh-watcher-config-footer__btn--ghost"
              onClick={() => setConfigOpen(false)}
            >
              <i className="bi bi-x-lg me-2" aria-hidden />
              Cancelar
            </button>
            <button type="button" className="nh-watcher-config-footer__btn nh-watcher-config-footer__btn--primary" onClick={saveWatcherConfig}>
              <i className="bi bi-check2-circle me-2" aria-hidden />
              Guardar configuración
            </button>
          </div>
        </div>
      }
    >
      <div className="nh-watcher-config-modal">
        <div className="nh-watcher-config-modal__headline">
          <div className="nh-watcher-config-modal__headline-icon" aria-hidden>
            <i className="bi bi-sliders2" />
          </div>
          <p className="nh-watcher-config-modal__meta mb-0">
            Pegá la URL de <strong className="text-body">Mi miner</strong> o solo el UUID. El nickname de cada fila se aplica a todos los equipos de ese watcher en «Mis ASICs».
          </p>
        </div>
        <div className="nh-watcher-config-modal__scroll">
          <div className="nh-watcher-config-table-head d-none d-md-grid" aria-hidden>
            <span />
            <span>Enlace del watcher</span>
            <span>Nickname en «Mis ASICs»</span>
          </div>
          {Array.from({ length: NH_WATCHER_SLOT_COUNT }, (_, i) => {
            const n = String(i + 1).padStart(2, "0");
            return (
              <div key={i} className="nh-watcher-config-card">
                <div className="nh-watcher-config-card__left">
                  <span className="nh-watcher-config-card__badge">{n}</span>
                </div>
                <div className="nh-watcher-config-card__right">
                  <div className="nh-watcher-config-card__mobile-title d-md-none">
                    Watcher {i + 1}
                  </div>
                  <div className="nh-watcher-config-card__body">
                    <div className="nh-watcher-config-card__field">
                      <label className="nh-watcher-config-card__label" htmlFor={`nh-watcher-cfg-link-${i}`}>
                        Enlace <span className="d-md-none">· Watcher {i + 1}</span>
                      </label>
                      <input
                        id={`nh-watcher-cfg-link-${i}`}
                        type="text"
                        className="form-control nh-watcher-config-input"
                        value={configDraft[i]?.link ?? ""}
                        placeholder={i === 0 ? "https://www.nicehash.com/my/miner/…" : "URL o UUID (opcional)"}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => {
                          const v = e.target.value.slice(0, 512);
                          setConfigDraft((prev) => {
                            const rows = [...prev];
                            while (rows.length < NH_WATCHER_SLOT_COUNT) rows.push({ ...NH_EMPTY_SLOT_ROW });
                            rows[i] = { ...rows[i], link: v };
                            return rows;
                          });
                        }}
                      />
                    </div>
                    <div className="nh-watcher-config-card__field">
                      <label className="nh-watcher-config-card__label" htmlFor={`nh-watcher-cfg-nick-${i}`}>
                        Nickname equipos
                      </label>
                      <input
                        id={`nh-watcher-cfg-nick-${i}`}
                        type="text"
                        className="form-control nh-watcher-config-input nh-watcher-config-input--nick"
                        value={configDraft[i]?.nickname ?? ""}
                        placeholder="Ingresar Nombre "
                        maxLength={NH_WATCHER_SLOT_NICKNAME_MAX}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => {
                          const v = e.target.value.slice(0, NH_WATCHER_SLOT_NICKNAME_MAX);
                          setConfigDraft((prev) => {
                            const rows = [...prev];
                            while (rows.length < NH_WATCHER_SLOT_COUNT) rows.push({ ...NH_EMPTY_SLOT_ROW });
                            rows[i] = { ...rows[i], nickname: v };
                            return rows;
                          });
                        }}
                      />
                    </div>
                    <details className="nh-watcher-config-card__details mt-2">
                      <summary className="small text-secondary user-select-none" style={{ cursor: "pointer" }}>
                        Total Assets (cartera) · API NiceHash opcional
                      </summary>
                      <p className="small text-secondary mb-2 mt-2">
                        Debe ser la{" "}
                        <strong className="text-body">misma organización</strong> que el enlace watcher. API key de solo
                        lectura (cartera) en{" "}
                        <a
                          href="https://www.nicehash.com/my/settings/api"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-light"
                        >
                          Ajustes → API
                        </a>
                        . Las claves se guardan en este navegador y el servidor las usa solo para firmar la consulta a
                        NiceHash.
                      </p>
                      <div className="nh-watcher-config-card__field">
                        <label className="nh-watcher-config-card__label" htmlFor={`nh-watcher-org-${i}`}>
                          Organization ID
                        </label>
                        <input
                          id={`nh-watcher-org-${i}`}
                          type="text"
                          className="form-control nh-watcher-config-input"
                          value={configDraft[i]?.nhOrgId ?? ""}
                          placeholder="UUID de la organización"
                          maxLength={200}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 200);
                            setConfigDraft((prev) => {
                              const rows = [...prev];
                              while (rows.length < NH_WATCHER_SLOT_COUNT) rows.push({ ...NH_EMPTY_SLOT_ROW });
                              rows[i] = { ...rows[i], nhOrgId: v };
                              return rows;
                            });
                          }}
                        />
                      </div>
                      <div className="nh-watcher-config-card__field">
                        <label className="nh-watcher-config-card__label" htmlFor={`nh-watcher-ak-${i}`}>
                          API Key
                        </label>
                        <input
                          id={`nh-watcher-ak-${i}`}
                          type="password"
                          className="form-control nh-watcher-config-input"
                          value={configDraft[i]?.nhApiKey ?? ""}
                          placeholder="Solo lectura · cartera"
                          maxLength={400}
                          autoComplete="new-password"
                          spellCheck={false}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 400);
                            setConfigDraft((prev) => {
                              const rows = [...prev];
                              while (rows.length < NH_WATCHER_SLOT_COUNT) rows.push({ ...NH_EMPTY_SLOT_ROW });
                              rows[i] = { ...rows[i], nhApiKey: v };
                              return rows;
                            });
                          }}
                        />
                      </div>
                      <div className="nh-watcher-config-card__field mb-0">
                        <label className="nh-watcher-config-card__label" htmlFor={`nh-watcher-as-${i}`}>
                          API Secret
                        </label>
                        <input
                          id={`nh-watcher-as-${i}`}
                          type="password"
                          className="form-control nh-watcher-config-input"
                          value={configDraft[i]?.nhApiSecret ?? ""}
                          maxLength={400}
                          autoComplete="new-password"
                          spellCheck={false}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 400);
                            setConfigDraft((prev) => {
                              const rows = [...prev];
                              while (rows.length < NH_WATCHER_SLOT_COUNT) rows.push({ ...NH_EMPTY_SLOT_ROW });
                              rows[i] = { ...rows[i], nhApiSecret: v };
                              return rows;
                            });
                          }}
                        />
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppModal>
  );

  if (layout === "fullscreen") {
    return (
      <>
        <div className="nh-watcher-fullpage">
          <div className="container">
            <main className="nh-watcher-fullpage-main">
              <h1 className="visually-hidden">
                {isTotal ? "NiceHash watcher · vista TOTAL" : "NiceHash watcher"}
              </h1>
              {isTotal ? (
                <TotalWatcherSlotsOverview
                  slotRows={slotRows}
                  configuredIndices={configuredSlotIndices}
                  onOpenConfig={openConfig}
                />
              ) : (
                <WatcherSlotBar
                  variant="page"
                  slotRows={slotRows}
                  activeSlot={activeSlot}
                  configuredIndices={configuredSlotIndices}
                  showTotalAggregateLink
                  onSelectSlot={(idx) => {
                    setActiveSlot(idx);
                    saveActiveWatcherSlotIndex(idx);
                    setSearchParams({ watcher: "1", slot: String(idx + 1) }, { replace: true });
                  }}
                  onOpenConfig={openConfig}
                />
              )}
              {shell}
            </main>
          </div>
        </div>
        {configModal}
        {fleetHashModal}
      </>
    );
  }

  return (
    <>
      {shell}
      {configModal}
      {fleetHashModal}
    </>
  );
}

export default NiceHashWatcherDashboard;
