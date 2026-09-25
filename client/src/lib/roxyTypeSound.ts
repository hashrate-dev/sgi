let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx || ctx.state === "closed") ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuf(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const n = Math.floor(ac.sampleRate * 0.03);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  noise = buf;
  return buf;
}

/** Clic corto de tecla, una letra. */
export function playRoxyTypeTick(ch: string): void {
  const ac = audio();
  if (!ac) return;
  const space = ch === " " || ch === "\n";
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = space ? 900 : 1750 + Math.random() * 900;
  bp.Q.value = space ? 2.2 : 4.5;
  const g = ac.createGain();
  const peak = space ? 0.006 : 0.014;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (space ? 0.028 : 0.038));
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + 0.05);
}
