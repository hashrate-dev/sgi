import { normalizeMarketplaceImageSrc } from "./marketplaceImageSrc.js";

/** Orden: solo imagen de tarjeta. La galería es para ficha inventario (logo Hashrate). */
export function pickMarketplaceShelfImageRaw(
  mpImageSrc: string | null | undefined,
  _mpGalleryJson?: string | null | undefined
): string {
  return String(mpImageSrc ?? "").trim();
}

/** Huella corta del contenido para bustear caché cuando cambia «Tienda (sin logo)». */
export function marketplaceShelfImageVersion(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "0";
  let h = 2166136261 >>> 0;
  const step = Math.max(1, Math.floor(t.length / 384));
  for (let i = 0; i < t.length; i += step) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= t.length;
  return `${t.length.toString(36)}-${h.toString(36)}`;
}

export function marketplaceShelfImagePublicPath(equipoId: string, mpImageSrc: string | null | undefined): string {
  const id = String(equipoId ?? "").trim();
  const raw = String(mpImageSrc ?? "").trim();
  if (!id || !raw) return "";
  return `/api/marketplace/shelf-image/${encodeURIComponent(id)}?v=${marketplaceShelfImageVersion(raw)}`;
}

export function sendMarketplaceShelfImageResponse(
  res: {
    status: (n: number) => { end: () => void; send: (b: Buffer) => void };
    redirect: (n: number, url: string) => void;
    set: (k: string, v: string) => void;
  },
  raw: string
): void {
  const trimmed = raw.trim();
  if (!trimmed) {
    res.status(404).end();
    return;
  }

  const norm = normalizeMarketplaceImageSrc(trimmed);
  if (norm && !/^data:/i.test(norm)) {
    if (/^https?:\/\//i.test(norm)) {
      res.redirect(302, norm);
      return;
    }
    const path = norm.startsWith("/") ? norm : `/${norm}`;
    res.redirect(302, path);
    return;
  }

  const dataMatch = /^data:image\/([\w+.-]+);base64,(.+)$/i.exec(trimmed);
  if (dataMatch) {
    try {
      const buf = Buffer.from(dataMatch[2]!, "base64");
      if (buf.length > 0 && buf.length < 12_000_000) {
        res.set("Content-Type", `image/${dataMatch[1]!.toLowerCase()}`);
        res.set("Cache-Control", "public, max-age=60, must-revalidate");
        res.status(200).send(buf);
        return;
      }
    } catch {
      /* fall through */
    }
  }

  res.status(404).end();
}
