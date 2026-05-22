/** Confeti tipo “papelitos” hacia arriba (celebración HRS). Sin dependencias externas. */

const HRS_PALETTE = ["#00a652", "#2d5d46", "#34d399", "#fbbf24", "#fcd34d", "#ffffff", "#86efac"] as const;

type ConfettiPiece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  spin: number;
  color: string;
  opacity: number;
  shape: "rect" | "circle";
};

function resizeCanvasToBounds(canvas: HTMLCanvasElement, width: number, height: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function spawnPieces(count: number, w: number, h: number): ConfettiPiece[] {
  const out: ConfettiPiece[] = [];
  const bases = [
    { x: w * 0.5, y: h * 0.92 },
    { x: w * 0.35, y: h * 0.88 },
    { x: w * 0.65, y: h * 0.88 },
  ];
  const spreadFactor = w < 400 ? 0.55 : 0.35;
  for (let i = 0; i < count; i++) {
    const base = bases[i % bases.length]!;
    const spread = (Math.random() - 0.5) * w * spreadFactor;
    const speed = w < 400 ? 0.75 : 1;
    out.push({
      x: base.x + spread,
      y: base.y + (Math.random() - 0.5) * Math.min(40, h * 0.15),
      vx: (Math.random() - 0.5) * 9 * speed,
      vy: -(8 + Math.random() * 12) * speed,
      w: 4 + Math.random() * (w < 400 ? 5 : 7),
      h: 6 + Math.random() * (w < 400 ? 8 : 12),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.28,
      color: HRS_PALETTE[Math.floor(Math.random() * HRS_PALETTE.length)]!,
      opacity: 0.85 + Math.random() * 0.15,
      shape: Math.random() > 0.25 ? "rect" : "circle",
    });
  }
  return out;
}

type ConfettiRunOptions = {
  getBounds: () => { width: number; height: number };
  pieceCount: number;
  durationMs: number;
  gravity?: number;
};

function runConfettiOnCanvas(canvas: HTMLCanvasElement, options: ConfettiRunOptions): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => canvas.remove();

  const { getBounds, pieceCount, durationMs, gravity = 0.22 } = options;

  const applyTransform = () => {
    const { width, height } = getBounds();
    resizeCanvasToBounds(canvas, width, height);
    const dpr = canvas.width / Math.max(width, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  applyTransform();
  let pieces = spawnPieces(pieceCount, getBounds().width, getBounds().height);
  const start = performance.now();
  let raf = 0;

  const onResize = () => {
    applyTransform();
    const { width, height } = getBounds();
    pieces = spawnPieces(Math.min(pieceCount, pieces.length), width, height);
  };
  window.addEventListener("resize", onResize);

  const tick = (now: number) => {
    const t = (now - start) / durationMs;
    if (t >= 1) {
      window.removeEventListener("resize", onResize);
      canvas.remove();
      return;
    }

    const { width, height } = getBounds();
    const fade = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
    ctx.clearRect(0, 0, width, height);

    for (const p of pieces) {
      p.vy += gravity;
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;

      ctx.save();
      ctx.globalAlpha = p.opacity * fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    canvas.remove();
  };
}

/**
 * Confeti dentro de un contenedor (ej. cuerpo del toast). Devuelve función de limpieza.
 */
export function launchHrsConfettiInElement(container: HTMLElement, durationMs = 3200): () => void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;";

  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  const prevOverflow = container.style.overflow;
  container.style.overflow = "hidden";
  container.appendChild(canvas);

  const cleanup = runConfettiOnCanvas(canvas, {
    getBounds: () => ({
      width: container.clientWidth,
      height: container.clientHeight,
    }),
    pieceCount: 72,
    durationMs,
    gravity: 0.18,
  });

  return () => {
    cleanup();
    if (prevOverflow) container.style.overflow = prevOverflow;
    else container.style.removeProperty("overflow");
  };
}

/**
 * Lanza confeti a pantalla completa (~2.8 s). Seguro llamar varias veces (solo una animación activa).
 */
export function launchHrsCelebrationConfetti(): void {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("hrs-celebration-confetti-canvas");
  if (existing) existing.remove();

  const canvas = document.createElement("canvas");
  canvas.id = "hrs-celebration-confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:19999;";
  document.body.appendChild(canvas);

  runConfettiOnCanvas(canvas, {
    getBounds: () => ({ width: window.innerWidth, height: window.innerHeight }),
    pieceCount: 140,
    durationMs: 2800,
  });
}
