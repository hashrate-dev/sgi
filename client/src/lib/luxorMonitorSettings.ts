/** Persistencia local de la API key de Luxor (solo este navegador). El servidor no guarda la clave. */

export type LuxorCurrencyType = "BTC" | "LTC_DOGE" | "SC" | "ZEC";

const STORAGE_KEY = "hrs_luxor_monitor_v1";

const ALL_CURRENCIES: LuxorCurrencyType[] = ["BTC", "LTC_DOGE", "SC", "ZEC"];

function isLuxorCurrencyType(v: unknown): v is LuxorCurrencyType {
  return typeof v === "string" && (ALL_CURRENCIES as string[]).includes(v);
}

export type LuxorMonitorSettings = {
  /** Key de la API de Luxor (mismo token que en `authorization` frente a app.luxor.tech). */
  apiKey: string;
  /**
   * Pools a consultar en la API (`/pool/workers/<tipo>`). Marcá las que uses (p. ej. BTC + LTC_DOGE).
   * @deprecated Usar `currencyTypes`; se mantiene al cargar datos viejos.
   */
  currencyType?: LuxorCurrencyType;
  currencyTypes: LuxorCurrencyType[];
};

export function loadLuxorMonitorSettings(): LuxorMonitorSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LuxorMonitorSettings>;
    if (typeof o.apiKey !== "string") return null;
    const legacy: LuxorCurrencyType =
      o.currencyType === "LTC_DOGE" || o.currencyType === "SC" || o.currencyType === "ZEC"
        ? o.currencyType
        : "BTC";
    const fromArr = Array.isArray(o.currencyTypes)
      ? o.currencyTypes.filter(isLuxorCurrencyType)
      : [];
    const currencyTypes = fromArr.length > 0 ? [...new Set(fromArr)] : [legacy];
    return { apiKey: o.apiKey, currencyTypes, currencyType: legacy };
  } catch {
    return null;
  }
}

export function saveLuxorMonitorSettings(s: LuxorMonitorSettings): void {
  if (typeof window === "undefined") return;
  const currencyTypes = s.currencyTypes?.length ? [...new Set(s.currencyTypes)] : ["BTC"];
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ apiKey: s.apiKey, currencyTypes, currencyType: currencyTypes[0] })
  );
}

export function clearLuxorMonitorSettings(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
