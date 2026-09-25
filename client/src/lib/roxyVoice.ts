const MUTE_KEY = "hrs_roxy_voice_mute";

let voicesReady = false;
let speakGen = 0;
let pauseTimer = 0;
let lastSaid = "";
let lastSaidAt = 0;
const recentSaid: string[] = [];

function mutedNow(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isRoxyMuted(): boolean {
  if (typeof window === "undefined") return true;
  return mutedNow();
}

export function setRoxyMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* */
  }
  if (muted) hushRoxy();
}

type SpeechListener = (speaking: boolean) => void;
const speechListeners = new Set<SpeechListener>();
let speakingNow = false;

function setSpeaking(next: boolean): void {
  if (speakingNow === next) return;
  speakingNow = next;
  speechListeners.forEach((fn) => fn(next));
}

export function isRoxySpeaking(): boolean {
  return speakingNow;
}

export function subscribeRoxySpeech(fn: SpeechListener): () => void {
  speechListeners.add(fn);
  fn(speakingNow);
  return () => {
    speechListeners.delete(fn);
  };
}

function warmVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length) voicesReady = true;
  return list;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    voicesReady = true;
  });
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = `${v.name} ${v.lang}`.toLowerCase();
  let n = 0;
  if (v.lang.toLowerCase().startsWith("es")) n += 36;
  if (/es-uy|uruguay/.test(name)) n += 28;
  if (/es-ar|argentin/.test(name)) n += 22;
  if (/es-mx|es-us|es-co|es-cl|es-es/.test(name)) n += 8;
  if (/sabina|paulina|dalia|helena|mónica|monica|lucía|lucia|paloma|soledad|elena|camila|valentina|microsoft sabina/.test(name)) n += 22;
  if (/female|mujer|woman|zira/.test(name)) n += 10;
  if (/neural|natural|online|google/.test(name)) n += 10;
  if (/male|hombre|jorge|pablo|diego|carlos|raul|raúl/.test(name)) n -= 34;
  return n;
}

function pickRoxyVoice(): SpeechSynthesisVoice | null {
  const voices = warmVoices();
  if (!voices.length) return null;
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

function moneyTalk(raw: string): string {
  return raw.replace(/\$[\s]*([\d.,]+)/g, (_m, num: string) => {
    const n = Number(String(num).replace(/,/g, ""));
    if (!Number.isFinite(n)) return "dólares";
    if (n >= 1000) return `${Math.round(n).toLocaleString("es-UY")} dólares`;
    return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} dólares`;
  });
}

let audioCtx: AudioContext | null = null;
let humNodes: Array<OscillatorNode | GainNode> = [];

function stopHum(): void {
  for (const n of humNodes) {
    try {
      n.disconnect();
    } catch {
      /* */
    }
  }
  humNodes = [];
}

export function hushRoxy(): void {
  speakGen += 1;
  if (pauseTimer) {
    window.clearTimeout(pauseTimer);
    pauseTimer = 0;
  }
  stopHum();
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  setSpeaking(false);
}

function playHum(gen: number, done: () => void): void {
  if (typeof window === "undefined") {
    done();
    return;
  }
  try {
    audioCtx = audioCtx ?? new AudioContext();
    const ctx = audioCtx;
    void ctx.resume();
    stopHum();
    setSpeaking(true);
    const master = ctx.createGain();
    master.gain.value = 0.045;
    master.connect(ctx.destination);
    humNodes.push(master);
    const melody = [392, 440, 523.25, 494, 440, 392];
    let t = ctx.currentTime + 0.02;
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
      humNodes.push(osc, g);
      t += i === 2 ? 0.34 : 0.22;
    });
    const wait = Math.round((t - ctx.currentTime) * 1000) + 80;
    pauseTimer = window.setTimeout(() => {
      if (gen !== speakGen) return;
      stopHum();
      done();
    }, wait);
  } catch {
    done();
  }
}

export function toSpokenRoxy(raw: string): string {
  let s = raw
    .replace(/\r/g, "")
    .replace(/[•·]/g, ",")
    .replace(/[«»""]/g, "")
    .replace(/USDT/gi, "")
    .replace(/\bT1\b/g, "primer objetivo")
    .replace(/\bT2\b/g, "segundo objetivo")
    .replace(/\bRSI\b/g, "erre ese i")
    .replace(/\bMACD\b/g, "mac d")
    .replace(/\bFOMO\b/g, "las ganas de entrar porque sí")
    .replace(/\bOFF\b/g, "pausa")
    .replace(/\bON\b/g, "prendida")
    .replace(/\bscalping\b/gi, "scalping")
    .replace(/\bscalp\b/gi, "operación rápida")
    .replace(/jaja\.?/gi, "ja ja")
    .replace(/jeje\.?/gi, "je")
    .replace(/me río/gi, "me río")
    .replace(/(\d)\s*%/g, "$1 por ciento")
    .replace(/(\d)\/(\d)/g, "$1 de $2")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  s = moneyTalk(s);
  return s.slice(0, 1400);
}

type SpeakBit =
  | { kind: "say"; text: string; laugh: boolean; rate: number; pitch: number }
  | { kind: "hum" }
  | { kind: "pause"; ms: number };

function splitForSpeech(raw: string): SpeakBit[] {
  const bits: SpeakBit[] = [];
  const chunks = raw
    .replace(/\n+/g, ". ")
    .split(/(?<=[.!?…,;:])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);
  chunks.forEach((chunk, i) => {
    const hum = /♪|tararea|\bmm mm\b|\bnana\b/i.test(chunk);
    const cough = /cof|tose/i.test(chunk);
    const laugh = /ja ja|je\b|me río|me rei|me reí/i.test(chunk);
    const breath = /^(mirá|mira|bueno|a ver|che|ta,|la verdad|ojo|dale)\b/i.test(chunk);
    if (hum) bits.push({ kind: "hum" });
    if (cough) bits.push({ kind: "pause", ms: 220 });
    const spoken = chunk.replace(/♪/g, "").replace(/tararea bajito\.?/i, "").replace(/\s+/g, " ").trim();
    if (spoken.length > 1 && !/^mm+$/i.test(spoken)) {
      bits.push({
        kind: "say",
        text: spoken.replace(/…/g, "."),
        laugh,
        rate: laugh ? 1.02 : breath ? 0.9 : 0.94,
        pitch: laugh ? 1.14 : breath ? 1.0 : 1.02,
      });
    } else if (hum && spoken.length <= 1) {
      /* melody only */
    }
    if (i >= chunks.length - 1) return;
    const endPause = /[.!?]$/.test(chunk) || /…$/.test(chunk);
    bits.push({ kind: "pause", ms: laugh ? 480 : hum ? 200 : endPause ? 280 : breath ? 220 : 120 });
  });
  return bits;
}

export function speakRoxy(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (mutedNow()) return;
  const said = toSpokenRoxy(text);
  if (said.length < 2) return;
  const now = Date.now();
  const key = said.slice(0, 120).toLowerCase();
  if (key && recentSaid.some((x) => x === key) && now - lastSaidAt < 180_000) return;
  if (said === lastSaid && now - lastSaidAt < 90_000) return;
  lastSaid = said;
  lastSaidAt = now;
  if (key) {
    recentSaid.unshift(key);
    if (recentSaid.length > 10) recentSaid.length = 10;
  }
  hushRoxy();
  const gen = speakGen;
  const bits = splitForSpeech(said);
  if (!bits.length) return;
  const runBit = (i: number) => {
    if (gen !== speakGen || mutedNow()) {
      setSpeaking(false);
      return;
    }
    if (i >= bits.length) {
      setSpeaking(false);
      return;
    }
    const bit = bits[i]!;
    if (bit.kind === "pause") {
      pauseTimer = window.setTimeout(() => runBit(i + 1), bit.ms);
      return;
    }
    if (bit.kind === "hum") {
      playHum(gen, () => runBit(i + 1));
      return;
    }
    const go = () => {
      if (gen !== speakGen || mutedNow()) {
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(bit.text);
      const voice = pickRoxyVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang || "es-AR";
      } else {
        u.lang = "es-AR";
      }
      u.rate = bit.rate;
      u.pitch = bit.pitch;
      u.volume = 0.96;
      u.onstart = () => setSpeaking(true);
      u.onend = () => runBit(i + 1);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    };
    if (!voicesReady && !warmVoices().length) {
      pauseTimer = window.setTimeout(go, 160);
      return;
    }
    go();
  };
  runBit(0);
}
