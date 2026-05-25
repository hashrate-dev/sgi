import { publicImageUrl } from "./marketplaceAsicCatalog.js";

export type CorpIndustryManufacturer = {
  id: string;
  name: string;
  href: string;
  imageUrl: string;
  enabled: boolean;
  slug: string;
};

/** URL lista para <img src> (rutas relativas, uploads o data URL). */
export function resolveCorpManufacturerImageSrc(imageUrl: string): string {
  const u = imageUrl.trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("http://") || u.startsWith("https://")) return u;
  return publicImageUrl(u.startsWith("/") ? u : `/${u}`);
}

export function slugFromManufacturerName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s || "marca").slice(0, 40);
}
