const MARK_HIRES_SRC = "/images/wp-uploads/hashrate-LOGO.png";
const MARK_FALLBACK_SRC = "/images/wp-uploads/cropped-favicoin-32x32.png";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

/** Recorta el isotipo del wordmark (fondo negro → transparente). */
function isolateHiresMark(img: HTMLImageElement): HTMLCanvasElement | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w < 80 || h < 40) return null;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const s = src.getContext("2d");
  if (!s) return null;
  s.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = s.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const d = data.data;
  const iconLimit = Math.floor(w * 0.18);
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC - minC;
      const isColorMark = sat > 48 && (g > 70 || b > 70);
      if (x > iconLimit || !isColorMark) {
        d[i + 3] = 0;
        continue;
      }
      if (d[i + 3] > 24) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  s.putImageData(data, 0, 0);
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.06);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const side = Math.max(cw, ch);
  const out = document.createElement("canvas");
  out.width = side;
  out.height = side;
  const o = out.getContext("2d");
  if (!o) return null;
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.drawImage(src, minX, minY, cw, ch, Math.round((side - cw) / 2), Math.round((side - ch) / 2), cw, ch);
  return out;
}

async function hiresMarkCanvas(): Promise<HTMLCanvasElement> {
  const wordmark = await loadImage(MARK_HIRES_SRC);
  const isolated = isolateHiresMark(wordmark);
  if (isolated) return isolated;
  const fallback = await loadImage(MARK_FALLBACK_SRC);
  const canvas = document.createElement("canvas");
  canvas.width = fallback.naturalWidth || 32;
  canvas.height = fallback.naturalHeight || 32;
  canvas.getContext("2d")?.drawImage(fallback, 0, 0);
  return canvas;
}

export async function getOpsComHiresMarkUrl(): Promise<string> {
  return hiresMarkCanvas().then((c) => c.toDataURL("image/png"));
}
