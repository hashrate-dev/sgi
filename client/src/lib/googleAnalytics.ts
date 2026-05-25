/** Google Analytics 4 — medición del sitio (marketplace + SGI). */
export const GA_MEASUREMENT_ID = "G-6JJJLVHCG4";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

function canUseGoogleAnalytics(): boolean {
  return typeof window !== "undefined" && import.meta.env.PROD;
}

/** Carga gtag.js una sola vez (solo en build de producción). */
export function initGoogleAnalytics(): void {
  if (!canUseGoogleAnalytics() || initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Vista de página (SPA): pathname + query + hash. */
export function trackGoogleAnalyticsPageView(pagePath: string): void {
  if (!canUseGoogleAnalytics() || typeof window.gtag !== "function") return;
  const path = pagePath.trim() || "/";
  window.gtag("config", GA_MEASUREMENT_ID, { page_path: path });
}
