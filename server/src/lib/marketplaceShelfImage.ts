import { normalizeMarketplaceImageSrc } from "./marketplaceImageSrc.js";

/** Orden: solo imagen de tarjeta. La galería es para ficha inventario (logo Hashrate). */
export function pickMarketplaceShelfImageRaw(
  mpImageSrc: string | null | undefined,
  _mpGalleryJson?: string | null | undefined
): string {
  return String(mpImageSrc ?? "").trim();
}

export function sendMarketplaceShelfImageResponse(
  res: { status: (n: number) => { end: () => void; send: (b: Buffer) => void }; redirect: (n: number, url: string) => void; set: (k: string, v: string) => void },
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
        res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
        res.status(200).send(buf);
        return;
      }
    } catch {
      /* fall through */
    }
  }

  res.status(404).end();
}
