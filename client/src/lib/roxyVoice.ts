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
  if (/es-ar|argentin/.test(name)) n += 24;
  if (/es-mx|es-us|es-co|es-cl|es-es/.test(name)) n += 8;
  if (/sabina|paulina|dalia|helena|mónica|monica|lucía|lucia|paloma|soledad|elena|camila|valentina/.test(name)) n += 18;
  if (/female|mujer|woman/.test(name)) n += 10;
  if (/google/.test(name)) n += 26;
  if (/neural|natural|online/.test(name)) n += 22;
  if (/desktop|sapi|espeak/.test(name)) n -= 8;
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

function talkHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function toSpokenRoxy(raw: string): string {
  let s = raw
    .replace(/\r/g, "")
    .replace(/♪/g, "")
    .replace(/[•·]/g, ",")
    .replace(/[«»“”]/g, "")
    .replace(/USDT/gi, "")
    .replace(/\bT1\b/g, "primer objetivo")
    .replace(/\bT2\b/g, "segundo objetivo")
    .replace(/\bRSI\b/g, "erre ese i")
    .replace(/\bMACD\b/g, "mac d")
    .replace(/\bFOMO\b/g, "las ganas de entrar porque sí")
    .replace(/\bOFF\b/g, "pausa")
    .replace(/\bON\b/g, "prendida")
    .replace(/\bscalp\b/gi, "operación rápida")
    .replace(/cof,?\s*cof\.?/gi, "ejem")
    .replace(/\btose\b/gi, "ejem")
    .replace(/jaja+/gi, "jaja")
    .replace(/jeje+/gi, "je")
    .replace(/…+/g, ",")
    .replace(/\.{3,}/g, ",")
    .replace(/(\d)\s*%/g, "$1 por ciento")
    .replace(/(\d)\/(\d)/g, "$1 de $2")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  s = moneyTalk(s);
  return s.slice(0, 1600);
}

function sameTalk(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9áéíóúñü ]+/gi, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  const na = n(a);
  const nb = n(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb.slice(0, 48)) || nb.startsWith(na.slice(0, 48));
}

type SpeakBit =
  | { kind: "say"; text: string; laugh: boolean; rate: number; pitch: number }
  | { kind: "hum" }
  | { kind: "pause"; ms: number };

function splitForSpeech(raw: string): SpeakBit[] {
  const bits: SpeakBit[] = [];
  const parts = raw
    .split(/(♪|tararea bajito\.?|\bmm mm\b)/i)
    .map((x) => x.trim())
    .filter(Boolean);

  const pushSay = (text: string) => {
    const spoken = text.replace(/\s+/g, " ").trim();
    if (spoken.length < 2) return;
    const laugh = /jaja|\bje\b|me río|me rei|me reí/i.test(spoken);
    const h = talkHash(spoken);
    const rate = laugh ? 1.12 : 1.06 + (h % 7) * 0.008;
    const pitch = laugh ? 1.12 : 1.04 + (h % 5) * 0.012;
    bits.push({ kind: "say", text: spoken, laugh, rate, pitch });
  };

  for (const part of parts) {
    if (/^(♪|tararea bajito\.?|mm mm)$/i.test(part)) {
      bits.push({ kind: "hum" });
      continue;
    }
    const sentences: string[] = [];
    for (const piece of part.split(/(?<=[.!?])\s+/)) {
      const t = piece.trim();
      if (!t) continue;
      const last = sentences[sentences.length - 1];
      if (last && last.length + t.length < 220 && last.length < 140) {
        sentences[sentences.length - 1] = `${last} ${t}`;
      } else {
        sentences.push(t);
      }
    }
    for (let i = 0; i < sentences.length; i++) {
      pushSay(sentences[i]!);
      if (i < sentences.length - 1) bits.push({ kind: "pause", ms: 70 });
    }
  }
  return bits;
}

export function speakRoxy(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (mutedNow()) return;
  const said = toSpokenRoxy(text);
  if (said.length < 2) return;
  const now = Date.now();
  if (speakingNow && sameTalk(said, lastSaid)) return;
  if (!speakingNow && sameTalk(said, lastSaid) && now - lastSaidAt < 50_000) return;
  lastSaid = said;
  lastSaidAt = now;
  const key = said.slice(0, 120).toLowerCase();
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
      u.volume = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => runBit(i + 1);
      u.onerror = () => {
        if (gen === speakGen) runBit(i + 1);
        else setSpeaking(false);
      };
      window.speechSynthesis.speak(u);
    };
    if (!voicesReady && !warmVoices().length) {
      pauseTimer = window.setTimeout(go, 120);
      return;
    }
    if (i === 0) {
      pauseTimer = window.setTimeout(go, 70);
      return;
    }
    go();
  };
  runBit(0);
}
