/** Normaliza rutas de imagen vitrina guardadas con WordPress o relativas al host. */
export function normalizeMarketplaceImageSrc(src: string | null | undefined): string {
  const raw = String(src ?? "").trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return raw;

  const wpMatch = raw.match(/wp-content\/uploads\/(?:\d{4}\/\d{2}\/)?([^?#\s]+)/i);
  if (wpMatch?.[1]) {
    return `/images/wp-uploads/${decodeURIComponent(wpMatch[1])}`;
  }

  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith("/images/")) return raw;
  if (raw.startsWith("images/")) return `/${raw}`;

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function galleryFileKey(url: string): string {
  const path = String(url ?? "").replace(/\?.*$/, "");
  const file = path.split("/").pop() ?? path;
  return file
    .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "")
    .replace(/-e\d+(?=\.[a-z0-9]+$)/i, "")
    .replace(/-scaled(?=\.[a-z0-9]+$)/i, "")
    .toLowerCase();
}

export function capProductGalleryUrls(urls: string[]): string[] {
  if (urls.length <= 2) return urls;
  if (urls.length >= 4) return urls.slice(0, urls.length - 2);
  return urls.slice(0, 2);
}

export function dedupeGalleryUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seenUrl = new Set<string>();
  const seenFile = new Set<string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u || seenUrl.has(u)) continue;
    const fk = galleryFileKey(u);
    if (seenFile.has(fk)) continue;
    seenUrl.add(u);
    seenFile.add(fk);
    out.push(u);
  }
  return out;
}
