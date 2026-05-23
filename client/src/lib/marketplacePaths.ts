import { getBrowserHostname } from "./hashrateHosts.js";

/** Rutas públicas del sitio (sin prefijo `/marketplace`). */
export const MARKETPLACE = {
  services: "/services",
  company: "/company",
  faq: "/faq",
  contact: "/contact",
  catalog: "/equipment",
  clientLogin: "/acceso",
  clientSignup: "/registro",
  emailInquiry: "/consultar-correo",
  emailInquiryCart: "/consultar-correo-carrito",
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
