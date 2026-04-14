/**
 * Sonidos del carrito marketplace (Web Audio API, sin archivos).
 * - Agregar: bips ascendentes (ítem sumado).
 * - Quitar: tonos que bajan (ítem sacado del carrito).
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new AC();
    }
    if (sharedCtx.state === "suspended") {
      void sharedCtx.resume();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function blip(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  freqHz: number,
  durationSec: number,
  peakGain: number
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const g = ctx.createGain();
  /* Ligero “pull” del tono al apagar: suena más natural */
  osc.frequency.setValueAtTime(freqHz * 1.03, startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqHz * 0.94), startTime + durationSec * 0.92);
  g.gain.setValueAtTime(0.0001, startTime);
  g.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
  osc.connect(g);
  g.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.025);
}

function blipDown(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  freqStartHz: number,
  freqEndHz: number,
  durationSec: number,
  peakGain: number
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(freqStartHz, startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(45, freqEndHz), startTime + durationSec * 0.94);
  g.gain.setValueAtTime(0.0001, startTime);
  g.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
  osc.connect(g);
  g.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.028);
}

/** ~140 ms: doble tono agudo → más agudo, suave y claro. */
export function playMarketplaceCartItemAddedSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.34;
  out.connect(ctx.destination);

  try {
    blip(ctx, out, t0, 880, 0.07, 0.24); /* A5 */
    blip(ctx, out, t0 + 0.058, 1318, 0.085, 0.2); /* E6 */
  } catch {
    /* ignore */
  }
}

/** ~150 ms: doble tono que baja — sensación de sacar un artículo del carrito. */
export function playMarketplaceCartItemRemovedSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(ctx.destination);

  try {
    blipDown(ctx, out, t0, 1180, 420, 0.08, 0.2);
    blipDown(ctx, out, t0 + 0.055, 740, 280, 0.09, 0.16);
  } catch {
    /* ignore */
  }
}

/** Sonido corto para notificación de nueva orden en panel staff. */
export function playMarketplaceOrderNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(ctx.destination);

  try {
    blip(ctx, out, t0, 1046, 0.065, 0.2); /* C6 */
    blip(ctx, out, t0 + 0.055, 1396, 0.08, 0.22); /* F6 */
    blip(ctx, out, t0 + 0.12, 1568, 0.09, 0.18); /* G6 */
  } catch {
    /* ignore */
  }
}
