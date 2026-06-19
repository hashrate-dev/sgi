import { HOSTED_INLINE_IMAGE_MAX_BYTES, marketplaceUploadUsesInlineImages } from "./marketplaceImageOptimize.js";

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

  return canvas;
}

async function canvasToPngFile(canvas: HTMLCanvasElement, baseName: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob || blob.size <= 0) throw new Error("No se pudo exportar la foto.");
  const safeBase = baseName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "team";
  return new File([blob], `${safeBase}-team.png`, { type: "image/png" });
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
  if (isAlreadyTeamCanvas) {
    return file;
  }
  const canvas = renderTeamPhotoCanvas(img);
  const hosted = marketplaceUploadUsesInlineImages();
  const maxBytes = hosted ? HOSTED_INLINE_IMAGE_MAX_BYTES : 650_000;
  let out = await canvasToPngFile(canvas, file.name);
  if (out.size > maxBytes) {
    throw new Error("La foto normalizada supera el tamaño máximo permitido. Probá con una imagen más pequeña.");
  }
  return out;
}
