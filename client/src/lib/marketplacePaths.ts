import { getBrowserHostname, isSgiAdminHost } from "./hashrateHosts.js";

/** Panel SGI en hashrate.space (en localhost/sgi sigue siendo `/`). */
export const SGI_DASHBOARD_PATH = "/sgi";

/** Rutas públicas del sitio (sin prefijo `/marketplace`). */
export const MARKETPLACE = {
  services: "/services",
  company: "/company",
  faq: "/faq",
  contact: "/contact",
  catalog: "/equipment",
  clientLogin: "/sign-in",
  clientSignup: "/signup",
  emailInquiry: "/email-inquiry",
  emailInquiryCart: "/email-inquiry-cart",
  activateAccount: "/activate-account",
  /** Home en localhost cuando `/` es el panel SGI. */
  homeDev: "/home",
} as const;

/** Home corporativa: `/` en producción; `/home` en localhost. */
export function mpHome(): string {
  if (typeof window === "undefined") return "/";
  const h = getBrowserHostname();
  if (h === "localhost" || h === "127.0.0.1") return MARKETPLACE.homeDev;
  return "/";
}

/** Inicio del panel SGI: `/sgi` en hashrate.space; `/` en localhost y sgi.hashrate.space. */
export function sgiHome(): string {
  if (typeof window === "undefined") return SGI_DASHBOARD_PATH;
  const h = getBrowserHostname();
  if (h === "localhost" || h === "127.0.0.1" || isSgiAdminHost(h)) return "/";
  return SGI_DASHBOARD_PATH;
}

export function isSgiDashboardPath(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "") || "/";
  return p === "/" || p === SGI_DASHBOARD_PATH;
}

export function isCorpHomePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === mpHome() || p === MARKETPLACE.homeDev || p === "/marketplace/home";
}

export function isMarketplacePublicPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === MARKETPLACE.homeDev) return true;
  return (
    p === MARKETPLACE.services ||
    p === MARKETPLACE.company ||
    p === MARKETPLACE.faq ||
    p === MARKETPLACE.contact ||
    p === MARKETPLACE.catalog ||
    p === MARKETPLACE.clientLogin ||
    p === MARKETPLACE.clientSignup ||
    p === MARKETPLACE.emailInquiry ||
    p === MARKETPLACE.emailInquiryCart ||
    p.startsWith("/marketplace")
  );
}
