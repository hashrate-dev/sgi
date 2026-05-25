import { publicImageUrl } from "./marketplaceAsicCatalog.js";

export type CorpOfficialPartner = {
  id: string;
  name: string;
  href: string;
  imageUrl: string;
  enabled: boolean;
};

/** URL lista para <img src> (rutas relativas, uploads o data URL). */
export function resolveCorpPartnerImageSrc(imageUrl: string): string {
  const u = imageUrl.trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("http://") || u.startsWith("https://")) return u;
  return publicImageUrl(u.startsWith("/") ? u : `/${u}`);
}
