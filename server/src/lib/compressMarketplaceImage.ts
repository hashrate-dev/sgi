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

  let pipeline = sharp(buf, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w > MAX_DIM || h > MAX_DIM) {
    pipeline = pipeline.resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true });
  }

  if (fmt === "png") {
    const pngBuf = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
    if (pngBuf.length <= HOSTED_MAX_BYTES) {
      return { buf: pngBuf, mime: "image/png" };
    }
    pipeline = sharp(buf, { failOn: "none" }).rotate();
    if (w > MAX_DIM || h > MAX_DIM) {
      pipeline = pipeline.resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true });
    }
  }

  let quality = 85;
  let jpegBuf = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  while (jpegBuf.length > HOSTED_MAX_BYTES && quality > 52) {
    quality -= 8;
    let p = sharp(buf, { failOn: "none" }).rotate();
    if (w > MAX_DIM || h > MAX_DIM) {
      p = p.resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true });
    }
    jpegBuf = await p.jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return { buf: jpegBuf, mime: "image/jpeg" };
}
