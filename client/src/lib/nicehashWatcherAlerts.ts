import { nhAcceptedSpeedLooksLikeTh } from "./nhSpeedAccepted";

/**
 * Alertas de flota NiceHash: caída de hashrate, cero mientras “MINING”, apagado súbito.
 * Sonido vía Web Audio (sin archivos).
 */

export type NhWatcherAlertKind = "offline" | "low_hashrate" | "zero_hash" | "stale";

export type NhWatcherFleetAlert = {
  id: string;
  seriesKey: string;
  rigLabel: string;
  nick: string;
  kind: NhWatcherAlertKind;
  severity: "critical" | "warn";
  title: string;
  detail: string;
  detectedAt: number;
  currentHash: number | null;
  baselineHash: number | null;
};

export type NhWatcherAlertRigInput = {
  seriesKey: string;
  rigLabel: string;
  nick: string;
  status: string;
  speedAccepted: number | null;
  statusTimeMs?: number | null;
  /** Serie sparkline (valores aceptados recientes). */
  spark: number[];
};

/** Snapshot previo por equipo (estado + velocidad) para detectar cambios bruscos. */
export type NhWatcherAlertPrevSnap = {
  status: string;
  speed: number | null;
  at: number;
};

const LOW_RATIO = 0.68;
const MIN_BASELINE_SAMPLES = 6;
const STALE_MS = 12 * 60 * 1000;
const MUTE_STORAGE_KEY = "nhWatcherAlerts:muteSound";

export function isNhWatcherAlertSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNhWatcherAlertSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Baseline: mediana de muestras “estables” (sin las 2 más recientes). */
export function nhWatcherHashBaseline(spark: number[]): number | null {
  const clean = spark.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length < MIN_BASELINE_SAMPLES) return null;
  const stable = clean.length > 4 ? clean.slice(0, -2) : clean;
  if (stable.length < MIN_BASELINE_SAMPLES - 1) return null;
  const window = stable.slice(-24);
  const m = median(window);
  return m > 0 ? m : null;
}

function formatSpeedFriendly(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (nhAcceptedSpeedLooksLikeTh(n)) return `${n.toFixed(2)} TH/s`;
  return `${n.toFixed(2)} MH/s`;
}

function statusUpper(s: string): string {
  return s.trim().toUpperCase();
}

function isOffStatus(u: string): boolean {
  return u === "OFFLINE" || u === "STOPPED" || u === "DISABLED" || u === "UNKNOWN" || u === "—";
}

function isMiningStatus(u: string): boolean {
  return u === "MINING";
}

/**
 * Evalúa alertas actuales (estado vivo). No decide el sonido: eso lo hace el caller con IDs nuevos.
 */
export function evaluateNhWatcherFleetAlerts(
  rigs: NhWatcherAlertRigInput[],
  prevMap: Map<string, NhWatcherAlertPrevSnap>,
  now = Date.now()
): NhWatcherFleetAlert[] {
  const out: NhWatcherFleetAlert[] = [];

  for (const rig of rigs) {
    const u = statusUpper(rig.status);
    const speed = rig.speedAccepted != null && Number.isFinite(rig.speedAccepted) ? rig.speedAccepted : null;
    const prev = prevMap.get(rig.seriesKey);
    const baseline = nhWatcherHashBaseline(rig.spark);
    const nickBit = rig.nick?.trim() ? ` · ${rig.nick.trim()}` : "";

    // 1) Apagado / offline (sobre todo si venía minando)
    if (isOffStatus(u)) {
          const wasMining = prev ? isMiningStatus(statusUpper(prev.status)) : false;
          const hadSpeed = prev?.speed != null && prev.speed > 0;
          const sparkHadSpeed = rig.spark.some((v) => Number.isFinite(v) && v > 0);
          if (wasMining || hadSpeed || sparkHadSpeed) {
            const sudden = wasMining || hadSpeed;
            out.push({
              id: `${rig.seriesKey}:offline`,
              seriesKey: rig.seriesKey,
              rigLabel: rig.rigLabel,
              nick: rig.nick,
              kind: "offline",
              severity: "critical",
              title: sudden ? "Minero apagado de repente" : "Minero offline",
              detail: sudden
                ? `${rig.rigLabel}${nickBit}: pasó de MINING a ${u || "OFFLINE"}. Revisá alimentación, red o el propio ASIC.`
                : `${rig.rigLabel}${nickBit}: estaba hasheando y ahora figura ${u || "OFFLINE"}.`,
              detectedAt: now,
              currentHash: speed,
              baselineHash: baseline,
            });
          }
    }

    // 2) Dice MINING pero hashrate ~0
    if (isMiningStatus(u) && (speed == null || speed <= 0.01)) {
      out.push({
        id: `${rig.seriesKey}:zero_hash`,
        seriesKey: rig.seriesKey,
        rigLabel: rig.rigLabel,
        nick: rig.nick,
        kind: "zero_hash",
        severity: "critical",
        title: "Minando sin hashrate",
        detail: `${rig.rigLabel}${nickBit}: NiceHash marca MINING pero la velocidad aceptada es 0. Posible fallo de pool, cable o algoritmo.`,
        detectedAt: now,
        currentHash: speed,
        baselineHash: baseline,
      });
    }

    // 3) Hashrate claramente por debajo del habitual
    if (isMiningStatus(u) && speed != null && speed > 0 && baseline != null && baseline > 0) {
      const ratio = speed / baseline;
      if (ratio < LOW_RATIO) {
        const dropPct = Math.round((1 - ratio) * 100);
        out.push({
          id: `${rig.seriesKey}:low_hashrate`,
          seriesKey: rig.seriesKey,
          rigLabel: rig.rigLabel,
          nick: rig.nick,
          kind: "low_hashrate",
          severity: "warn",
          title: "Hashrate por debajo de lo normal",
          detail: `${rig.rigLabel}${nickBit}: ahora ${formatSpeedFriendly(speed)} (−${dropPct}% vs ~${formatSpeedFriendly(baseline)} habitual). Puede estar hasheando mal, throttling o con rechazo.`,
          detectedAt: now,
          currentHash: speed,
          baselineHash: baseline,
        });
      }
    }

    // 4) Señal vieja mientras “MINING”
    if (isMiningStatus(u) && rig.statusTimeMs != null && Number.isFinite(rig.statusTimeMs)) {
      const age = now - rig.statusTimeMs;
      if (age > STALE_MS) {
        const mins = Math.max(1, Math.round(age / 60_000));
        out.push({
          id: `${rig.seriesKey}:stale`,
          seriesKey: rig.seriesKey,
          rigLabel: rig.rigLabel,
          nick: rig.nick,
          kind: "stale",
          severity: "warn",
          title: "Señal del ASIC atrasada",
          detail: `${rig.rigLabel}${nickBit}: última señal hace ~${mins} min. Puede haberse desconectado o estar colgado.`,
          detectedAt: now,
          currentHash: speed,
          baselineHash: baseline,
        });
      }
    }
  }

  // Prioridad: critical primero
  out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.rigLabel.localeCompare(b.rigLabel, "es");
  });
  return out;
}

export function updateNhWatcherAlertPrevSnaps(
  prevMap: Map<string, NhWatcherAlertPrevSnap>,
  rigs: NhWatcherAlertRigInput[],
  now = Date.now()
): void {
  for (const rig of rigs) {
    prevMap.set(rig.seriesKey, {
      status: rig.status,
      speed: rig.speedAccepted,
      at: now,
    });
  }
}

/* —— Audio —— */
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new AC();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = "square"
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Aviso urgente (apagado / cero hashrate). */
export function playNhWatcherCriticalAlertSound(): void {
  if (isNhWatcherAlertSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(ctx.destination);
  const t0 = ctx.currentTime;
  tone(ctx, out, t0, 880, 0.14, 0.35);
  tone(ctx, out, t0 + 0.16, 660, 0.14, 0.32);
  tone(ctx, out, t0 + 0.32, 440, 0.22, 0.38);
  tone(ctx, out, t0 + 0.58, 330, 0.28, 0.3);
}

/** Aviso de advertencia (hashrate bajo / señal vieja). */
export function playNhWatcherWarnAlertSound(): void {
  if (isNhWatcherAlertSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0.18;
  out.connect(ctx.destination);
  const t0 = ctx.currentTime;
  tone(ctx, out, t0, 620, 0.12, 0.28, "triangle");
  tone(ctx, out, t0 + 0.18, 520, 0.16, 0.26, "triangle");
}

export function playNhWatcherAlertSounds(alerts: NhWatcherFleetAlert[]): void {
  if (!alerts.length || isNhWatcherAlertSoundMuted()) return;
  if (alerts.some((a) => a.severity === "critical")) {
    playNhWatcherCriticalAlertSound();
  } else {
    playNhWatcherWarnAlertSound();
  }
}
