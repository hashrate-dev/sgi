import { marketplaceUploadUsesInlineImages } from "./marketplaceImageOptimize.js";

/** Mismo lienzo que PNG legacy (JV-Team-1024x991.png). */
export const CORP_TEAM_PHOTO_WIDTH = 1024;
export const CORP_TEAM_PHOTO_HEIGHT = 991;

/** Geometría medida en JV-Team-1024x991.png (728px @ cy 495). */
const TEAM_CIRCLE_CY_RATIO = 495 / 991;
const TEAM_CIRCLE_DIAM_RATIO = 728 / 1024;
const TEAM_FOCUS_Y = 0.24;

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = objectUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawCoverWithFocus(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  focusX: number,
  focusY: number
): void {
  const scale = Math.max(destW / img.width, destH / img.height);
  const rw = img.width * scale;
  const rh = img.height * scale;
  const dx = destX + (destW - rw) * focusX;
  const dy = destY + (destH - rh) * focusY;
  ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, rw, rh);
}

function renderTeamPhotoCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const w = CORP_TEAM_PHOTO_WIDTH;
  const h = CORP_TEAM_PHOTO_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("No se pudo preparar la foto.");

  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cx = w / 2;
  const cy = h * TEAM_CIRCLE_CY_RATIO;
  const radius = (w * TEAM_CIRCLE_DIAM_RATIO) / 2;
  const box = radius * 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawCoverWithFocus(ctx, img, cx - radius, cy - radius, box, box, 0.5, TEAM_FOCUS_Y);
  ctx.restore();

  scrubAlphaOutsideCircle(ctx, w, h);

  return canvas;
}

function scrubAlphaOutsideCircle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const cy = h * TEAM_CIRCLE_CY_RATIO;
  const radius = (w * TEAM_CIRCLE_DIAM_RATIO) / 2;
  const r2 = radius * radius;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) {
        const i = (y * w + x) * 4;
        d[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/** Team PNG 1024×991 suele ~520 KB; en Vercel cabe 1 foto por PATCH (no 4 como vitrina). */
const CORP_TEAM_PHOTO_MAX_BYTES_HOSTED = 320_000;
const CORP_TEAM_PHOTO_MAX_BYTES_LOCAL = 650_000;

async function canvasToTeamPhotoFile(canvas: HTMLCanvasElement, baseName: string, maxBytes: number): Promise<File> {
  const safeBase = baseName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "team";

  for (let q = 0.88; q >= 0.52; q -= 0.04) {
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", q));
    if (webp && webp.size > 0 && webp.size <= maxBytes) {
      return new File([webp], `${safeBase}-team.webp`, { type: "image/webp" });
    }
  }

  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (png && png.size > 0 && png.size <= maxBytes) {
    return new File([png], `${safeBase}-team.png`, { type: "image/png" });
  }

  throw new Error("La foto normalizada supera el tamaño máximo permitido. Probá con una imagen más pequeña.");
}

/** Convierte cualquier foto rectangular al formato circular del team (1024×991). */
export async function normalizeCorpTeamPhotoFile(file: File): Promise<File> {
  const img = await loadImageElement(file);
  const targetAspect = CORP_TEAM_PHOTO_WIDTH / CORP_TEAM_PHOTO_HEIGHT;
  const aspect = img.width / img.height;
  const isAlreadyTeamCanvas =
    Math.abs(img.width - CORP_TEAM_PHOTO_WIDTH) <= 12 &&
    Math.abs(img.height - CORP_TEAM_PHOTO_HEIGHT) <= 12 &&
    Math.abs(aspect - targetAspect) < 0.02;
  const hosted = marketplaceUploadUsesInlineImages();
  const maxBytes = hosted ? CORP_TEAM_PHOTO_MAX_BYTES_HOSTED : CORP_TEAM_PHOTO_MAX_BYTES_LOCAL;
  if (isAlreadyTeamCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("No se pudo preparar la foto.");
    ctx.drawImage(img, 0, 0);
    scrubAlphaOutsideCircle(ctx, canvas.width, canvas.height);
    return canvasToTeamPhotoFile(canvas, file.name, maxBytes);
  }
  const canvas = renderTeamPhotoCanvas(img);
  return canvasToTeamPhotoFile(canvas, file.name, maxBytes);
}
