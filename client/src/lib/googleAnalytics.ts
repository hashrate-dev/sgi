/** Google Analytics 4 — medición del sitio (marketplace + SGI). */
export const GA_MEASUREMENT_ID = "G-6JJJLVHCG4";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** gtag.js se carga desde client/index.html; aquí solo marcamos listo el SPA tracker. */
export function initGoogleAnalytics(): void {
  /* noop — script en index.html */
}

/** Vista de página (SPA): pathname + query + hash. */
export function trackGoogleAnalyticsPageView(pagePath: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const path = pagePath.trim() || "/";
  window.gtag("config", GA_MEASUREMENT_ID, { page_path: path });
}
