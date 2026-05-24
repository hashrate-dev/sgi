import { isVercelOrPrimaryPublicHost } from "./hashrateHosts.js";

/** En hashrate.space / Vercel las imágenes se guardan como data URL en la BD (límite ~4,5 MB por request). */
export function marketplaceUploadUsesInlineImages(): boolean {
  if (typeof window === "undefined") return false;
  return isVercelOrPrimaryPublicHost(window.location.hostname);
}

/** Tamaño máximo por imagen inline (~4 fotos + JSON dentro del límite de Vercel). */
export const HOSTED_INLINE_IMAGE_MAX_BYTES = 300_000;

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp)$/i;

async function sniffImageMagic(file: File): Promise<boolean> {
  if (file.size < 12) return false;
  try {
    const buf = await file.slice(0, 16).arrayBuffer();
    const u = new Uint8Array(buf);
    if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return true;
    if (u.length >= 8 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return true;
    if (u.length >= 6 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x38) return true;
    if (u.length >= 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46) {
      return String.fromCharCode(u[8]!, u[9]!, u[10]!, u[11]!) === "WEBP";
    }
  } catch {
    return false;
  }
  return false;
}

export async function isAcceptableMarketplaceImageFile(file: File): Promise<boolean> {
  if (file.type.startsWith("image/")) return true;
  if (IMAGE_EXT_RE.test(file.name)) return true;
  if (!file.type || file.type === "application/octet-stream") return sniffImageMagic(file);
  return false;
}

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

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = dataUrl;
  });
  return img;
}

function optimizeOpts(hosted: boolean): { maxDim: number; quality: number; skipBelow: number } {
  if (hosted) {
    return { maxDim: 1280, quality: 0.78, skipBelow: 120_000 };
  }
  return { maxDim: 1600, quality: 0.82, skipBelow: 450_000 };
}

async function canvasToJpegBlob(img: HTMLImageElement, maxDim: number, quality: number): Promise<Blob | null> {
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Reduce tamaño antes de subir o guardar (evita HTTP 413 en hashrate.space con galería + tarjeta).
 */
export async function optimizeMarketplaceImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;
  const hosted = marketplaceUploadUsesInlineImages();
  const { maxDim, quality, skipBelow } = optimizeOpts(hosted);
  if (!hosted && file.size <= skipBelow) return file;
  try {
    const img = await loadImageElement(file);
    let q = quality;
    let blob = await canvasToJpegBlob(img, maxDim, q);
    const maxBytes = hosted ? HOSTED_INLINE_IMAGE_MAX_BYTES : skipBelow;
    while (blob && blob.size > maxBytes && q > 0.52) {
      q -= 0.08;
      blob = await canvasToJpegBlob(img, maxDim, q);
    }
    if (!blob || blob.size <= 0) return file;
    if (!hosted && blob.size >= file.size * 0.98) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Comprime un data URL ya subido si supera el tope en modo alojado. */
export async function shrinkDataUrlIfNeeded(dataUrl: string): Promise<string> {
  const t = dataUrl.trim();
  if (!t || !/^data:image\//i.test(t)) return t;
  if (!marketplaceUploadUsesInlineImages()) return t;
  const approxBytes = Math.floor((t.length - t.indexOf(",") - 1) * 0.75);
  if (approxBytes <= HOSTED_INLINE_IMAGE_MAX_BYTES) return t;
  if (/^data:image\/gif/i.test(t)) return t;
  try {
    const img = await loadImageFromDataUrl(t);
    const { maxDim, quality } = optimizeOpts(true);
    let q = quality;
    let blob = await canvasToJpegBlob(img, maxDim, q);
    while (blob && blob.size > HOSTED_INLINE_IMAGE_MAX_BYTES && q > 0.52) {
      q -= 0.08;
      blob = await canvasToJpegBlob(img, maxDim, q);
    }
    if (!blob || blob.size <= 0) return t;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : t);
      reader.onerror = () => reject(new Error("No se pudo comprimir la imagen."));
      reader.readAsDataURL(blob);
    });
  } catch {
    return t;
  }
}

export type EquipoMarketplaceImageFields = {
  marketplaceImageSrc?: string | null;
  marketplaceGalleryJson?: string | null;
};

/** Comprime imágenes inline del payload antes de POST/PUT (última línea de defensa ante 413). */
export async function shrinkEquipoMarketplaceImagesForSave<T extends EquipoMarketplaceImageFields>(
  payload: T
): Promise<T> {
  if (!marketplaceUploadUsesInlineImages()) return payload;
  const out = { ...payload };
  if (out.marketplaceImageSrc?.trim()) {
    out.marketplaceImageSrc = await shrinkDataUrlIfNeeded(out.marketplaceImageSrc);
  }
  if (out.marketplaceGalleryJson?.trim()) {
    try {
      const parsed = JSON.parse(out.marketplaceGalleryJson) as unknown;
      if (Array.isArray(parsed)) {
        const next: string[] = [];
        for (const item of parsed) {
          if (typeof item !== "string") continue;
          const s = item.trim();
          if (!s) continue;
          next.push(/^data:image\//i.test(s) ? await shrinkDataUrlIfNeeded(s) : s);
        }
        out.marketplaceGalleryJson = next.length ? JSON.stringify(next) : null;
      }
    } catch {
      /* mantener JSON original */
    }
  }
  return out;
}

/** Estima bytes UTF-8 del JSON (para aviso antes de enviar). */
export function estimateJsonPayloadBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return 0;
  }
}

/** ~4,5 MB límite práctico en Vercel serverless. */
export const HOSTED_EQUIPO_SAVE_MAX_BYTES = 4_200_000;
