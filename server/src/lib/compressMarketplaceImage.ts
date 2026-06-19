import sharp from "sharp";
import type { SniffedImageFormat } from "./marketplaceImageSniff.js";

/** Objetivo por imagen en modo serverless (varias en un POST de equipo). */
const HOSTED_MAX_BYTES = 380_000;
const MAX_DIM = 1400;

/**
 * Comprime buffer de imagen vitrina antes de devolver data URL en Vercel.
 * GIF se deja sin cambios (animación).
 */
export async function compressMarketplaceImageBuffer(
  buf: Buffer,
  fmt: SniffedImageFormat
): Promise<{ buf: Buffer; mime: string }> {
  if (fmt === "gif") {
    return { buf, mime: "image/gif" };
  }

  const meta = await sharp(buf, { failOn: "none" }).rotate().metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  function basePipeline() {
    let p = sharp(buf, { failOn: "none" }).rotate();
    if (w > MAX_DIM || h > MAX_DIM) {
      p = p.resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true });
    }
    return p;
  }

  if (fmt === "png") {
    const pngBuf = await basePipeline()
      .png({ compressionLevel: 9, palette: meta.hasAlpha ? false : true })
      .toBuffer();
    if (pngBuf.length <= HOSTED_MAX_BYTES) {
      return { buf: pngBuf, mime: "image/png" };
    }
    if (meta.hasAlpha) {
      let quality = 82;
      let webpBuf = await basePipeline().webp({ quality, alphaQuality: quality }).toBuffer();
      while (webpBuf.length > HOSTED_MAX_BYTES && quality > 52) {
        quality -= 6;
        webpBuf = await basePipeline().webp({ quality, alphaQuality: quality }).toBuffer();
      }
      return { buf: webpBuf, mime: "image/webp" };
    }
  }

  if (fmt === "webp") {
    let quality = 82;
    let webpBuf = await basePipeline().webp({ quality, alphaQuality: quality }).toBuffer();
    while (webpBuf.length > HOSTED_MAX_BYTES && quality > 52) {
      quality -= 6;
      webpBuf = await basePipeline().webp({ quality, alphaQuality: quality }).toBuffer();
    }
    return { buf: webpBuf, mime: "image/webp" };
  }

  let quality = 85;
  let jpegBuf = await basePipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (jpegBuf.length > HOSTED_MAX_BYTES && quality > 52) {
    quality -= 8;
    jpegBuf = await basePipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return { buf: jpegBuf, mime: "image/jpeg" };
}
