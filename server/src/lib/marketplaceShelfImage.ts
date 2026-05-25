import { normalizeMarketplaceImageSrc } from "./marketplaceImageSrc.js";

function parseGalleryRawUrls(json: string | null | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    const g = JSON.parse(json) as unknown;
    if (!Array.isArray(g)) return [];
    return g
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
  } catch {
    return [];
  }
}

/** Orden: imagen principal → galería (para servir bytes o redirect sin meter base64 en JSON). */
export function pickMarketplaceShelfImageRaw(
  mpImageSrc: string | null | undefined,
  mpGalleryJson: string | null | undefined
): string {
  const main = String(mpImageSrc ?? "").trim();
  if (main) return main;
  const gallery = parseGalleryRawUrls(mpGalleryJson);
  return gallery[0] ?? "";
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
