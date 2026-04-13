import type { Buffer } from "node:buffer";

export type SniffedImageFormat = "jpg" | "png" | "gif" | "webp";

/** Detecta JPEG / PNG / GIF / WebP por firma (útil si el cliente envía `application/octet-stream` o MIME vacío). */
export function sniffImageFormat(buf: Buffer): SniffedImageFormat | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    if (buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  }
  return null;
}

export function mimeForSniffedFormat(fmt: SniffedImageFormat): string {
  switch (fmt) {
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}
