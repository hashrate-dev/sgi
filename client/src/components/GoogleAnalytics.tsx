import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initGoogleAnalytics, trackGoogleAnalyticsPageView } from "../lib/googleAnalytics.js";

/**
 * GA4 en todas las rutas del SPA (marketplace público + SGI interno).
 * Solo activo en producción (`import.meta.env.PROD`).
 */
export function GoogleAnalytics() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    initGoogleAnalytics();
  }, []);

  useEffect(() => {
    trackGoogleAnalyticsPageView(`${pathname}${search}${hash}`);
  }, [pathname, search, hash]);

  return null;
}
