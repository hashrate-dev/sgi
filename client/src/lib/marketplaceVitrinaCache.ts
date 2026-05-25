import type { AsicProduct } from "./marketplaceAsicCatalog.js";

export type MarketplaceVitrinaPayload = {
  products: AsicProduct[];
  hidePricesForGuests: boolean;
};

const SESSION_KEY = "hrs_mp_vitrina_v3";
const LOCAL_KEY = "hrs_mp_vitrina_ls_v3";
/** Catálogo en sesión: revalidar en red sin bloquear la grilla. */
const SESSION_TTL_MS = 5 * 60_000;
/** Respaldo entre visitas (misma ventana / recarga). */
const LOCAL_TTL_MS = 30 * 60_000;

export function peekMarketplaceVitrinaCache(): MarketplaceVitrinaPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return peekLocalVitrinaCache();
    const parsed = JSON.parse(raw) as { at: number; data: MarketplaceVitrinaPayload };
    if (!parsed?.data?.products?.length) return peekLocalVitrinaCache();
    if (Date.now() - Number(parsed.at || 0) > SESSION_TTL_MS) {
      return peekLocalVitrinaCache();
    }
    return parsed.data;
  } catch {
    return peekLocalVitrinaCache();
  }
}

function peekLocalVitrinaCache(): MarketplaceVitrinaPayload | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: MarketplaceVitrinaPayload };
    if (!parsed?.data?.products?.length) return null;
    if (Date.now() - Number(parsed.at || 0) > LOCAL_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeMarketplaceVitrinaCache(data: MarketplaceVitrinaPayload): void {
  const blob = JSON.stringify({ at: Date.now(), data });
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(SESSION_KEY, blob);
    } catch {
      /* quota */
    }
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCAL_KEY, blob);
    } catch {
      /* quota */
    }
  }
}
