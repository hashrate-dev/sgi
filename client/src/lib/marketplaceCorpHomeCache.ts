import type { AsicProduct } from "./marketplaceAsicCatalog.js";

export type MarketplaceCorpHomePayload = {
  bestSelling: AsicProduct[];
  interesting: AsicProduct[];
  hidePricesForGuests: boolean;
};

const SESSION_KEY = "hrs_mp_corp_home_v1";
const TTL_MS = 5 * 60_000;

export function peekMarketplaceCorpHomeCache(): MarketplaceCorpHomePayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: MarketplaceCorpHomePayload };
    if (Date.now() - Number(parsed.at || 0) > TTL_MS) return null;
    if (!parsed?.data) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeMarketplaceCorpHomeCache(data: MarketplaceCorpHomePayload): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}
