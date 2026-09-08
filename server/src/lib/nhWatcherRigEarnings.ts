/**
 * Acumulado BTC por equipo NiceHash (nombre "Hash…") + saldo cuenta para retirar.
 *
 * - day / month / lifetime: se integran por ASIC (profitability × tiempo).
 * - para retirar / último retiro: nivel CUENTA watcher (`__NH_ACCOUNT__`), no por ASIC.
 */

export const NH_EARNINGS_ACCOUNT_NAME = "__NH_ACCOUNT__";

export type NhRigEarningsSampleIn = {
  watcherId: string;
  rigName: string;
  profitabilityBtc24h: number | null;
  unpaidBtc: number | null;
  lastPayoutTimestamp?: string | null;
};

const MAX_RIG_NAME = 120;
const MAX_DT_MS = 6 * 60 * 60 * 1000;
const MIN_DT_MS = 5_000;
/** Caída mínima de unpaid para considerar retiro (evita ruido de redondeo). */
export const MIN_WITHDRAW_BTC = 0.0000005;
/** Unpaid “cero” práctico. */
export const UNPAID_ZERO_EPS = 1e-8;

export function isNhEarningsAccountName(name: string): boolean {
  return name.trim() === NH_EARNINGS_ACCOUNT_NAME;
}

export function normalizeNhRigDisplayName(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t === NH_EARNINGS_ACCOUNT_NAME) return NH_EARNINGS_ACCOUNT_NAME;
  if (t.length < 2 || t.length > MAX_RIG_NAME) return null;
  return t;
}

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function utcMonthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

export function parseUnpaidBtc(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeUnpaidDisplay(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n <= UNPAID_ZERO_EPS) return 0;
  return n;
}

export function accrueDeltaBtc(profitabilityBtc24h: number, dtMs: number): number {
  if (!(profitabilityBtc24h > 0) || !(dtMs > 0)) return 0;
  const capped = Math.min(Math.max(dtMs, 0), MAX_DT_MS);
  if (capped < MIN_DT_MS) return 0;
  return profitabilityBtc24h * (capped / (24 * 60 * 60 * 1000));
}

export type NhRigEarningsRow = {
  day_utc: string;
  day_btc: number;
  month_ym: string;
  month_btc: number;
  lifetime_btc: number;
  last_unpaid_btc: number | null;
  last_sample_at: number;
  last_profitability: number | null;
  first_seen_at: number;
  last_payout_ts: string | null;
};

export function rollBuckets(row: NhRigEarningsRow, now: number): NhRigEarningsRow {
  const day = utcDayKey(now);
  const month = utcMonthKey(now);
  let dayBtc = row.day_btc;
  let monthBtc = row.month_btc;
  // Día nuevo → contador diario a 0 (el mes sigue).
  if (row.day_utc !== day) dayBtc = 0;
  // Mes nuevo → contador mensual a 0 (lifetime NUNCA se resetea).
  if (row.month_ym !== month) monthBtc = 0;
  return {
    ...row,
    day_utc: day,
    day_btc: dayBtc,
    month_ym: month,
    month_btc: monthBtc,
  };
}

export function applyAccrual(
  row: NhRigEarningsRow,
  profitability: number | null,
  now: number
): NhRigEarningsRow {
  let next = rollBuckets(row, now);
  const profit = profitability != null && Number.isFinite(profitability) && profitability > 0 ? profitability : 0;
  const dt = now - (Number.isFinite(row.last_sample_at) ? row.last_sample_at : now);
  const delta = profit > 0 ? accrueDeltaBtc(profit, dt) : 0;
  next = {
    ...next,
    day_btc: next.day_btc + delta,
    month_btc: next.month_btc + delta,
    lifetime_btc: next.lifetime_btc + delta,
    last_sample_at: now,
    last_profitability: profitability != null && Number.isFinite(profitability) ? profitability : next.last_profitability,
  };
  return next;
}

export type NhWithdrawalDetect = {
  amountBtc: number;
  /** Tras retiro, el saldo a retirar debe quedar en 0 (o el residual de NiceHash si aún no bajó del todo). */
  storeUnpaidBtc: number;
};

/**
 * Detecta un retiro NiceHash por caída del unpaid de la cuenta y/o cambio de lastPayoutTimestamp.
 */
export function detectAccountWithdrawal(opts: {
  prevUnpaid: number | null;
  nextUnpaid: number | null;
  prevPayoutTs: string | null;
  nextPayoutTs: string | null;
}): NhWithdrawalDetect | null {
  const { prevUnpaid, nextUnpaid, prevPayoutTs, nextPayoutTs } = opts;
  if (prevUnpaid == null || nextUnpaid == null) return null;
  if (!(prevUnpaid > UNPAID_ZERO_EPS)) return null;

  const drop = prevUnpaid - nextUnpaid;
  const payoutChanged = Boolean(nextPayoutTs && nextPayoutTs !== prevPayoutTs);
  const nextIsZero = nextUnpaid <= UNPAID_ZERO_EPS;
  const almostCleared = nextUnpaid <= prevUnpaid * 0.12;

  // Caso A: payout nuevo y el unpaid bajó (o quedó en 0).
  if (payoutChanged && (nextIsZero || drop >= MIN_WITHDRAW_BTC)) {
    const amount = nextIsZero ? prevUnpaid : Math.max(drop, 0);
    if (amount < MIN_WITHDRAW_BTC) return null;
    return { amountBtc: amount, storeUnpaidBtc: nextIsZero ? 0 : normalizeUnpaidDisplay(nextUnpaid) };
  }

  // Caso B: unpaid quedó en ~0 tras haber tenido saldo (NH a veces tarda el timestamp).
  if (nextIsZero && drop >= MIN_WITHDRAW_BTC) {
    return { amountBtc: prevUnpaid, storeUnpaidBtc: 0 };
  }

  // Caso C: caída fuerte (>88%) con monto relevante.
  if (drop >= 0.00001 && almostCleared) {
    return {
      amountBtc: drop,
      storeUnpaidBtc: nextIsZero ? 0 : normalizeUnpaidDisplay(nextUnpaid),
    };
  }

  return null;
}
