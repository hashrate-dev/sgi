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
