import type { AsicProduct } from "./marketplaceAsicCatalog.js";

export type MarketplaceVitrinaPayload = {
  products: AsicProduct[];
  hidePricesForGuests: boolean;
};

const SESSION_KEY = "hrs_mp_vitrina_v2";
const TTL_MS = 90_000;

export function peekMarketplaceVitrinaCache(): MarketplaceVitrinaPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: MarketplaceVitrinaPayload };
    if (!parsed?.data?.products?.length) return null;
    if (Date.now() - Number(parsed.at || 0) > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeMarketplaceVitrinaCache(data: MarketplaceVitrinaPayload): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota / private mode */
  }
}
