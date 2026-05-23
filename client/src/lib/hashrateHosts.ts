/** Sitio público (marketplace + API serverless en el mismo origen). */
export const PRIMARY_PUBLIC_HOSTS = new Set([
  "hashrate.space",
  "www.hashrate.space",
  /** Alias legacy; mismo despliegue que el apex. */
  "app.hashrate.space",
]);

export const PRODUCTION_SITE_ORIGIN = "https://hashrate.space";

export const SGI_ADMIN_HOST = "sgi.hashrate.space";

export function getBrowserHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location?.hostname ?? "";
}

export function isPrimaryPublicHost(hostname: string): boolean {
  return PRIMARY_PUBLIC_HOSTS.has(hostname);
}

export function isSgiAdminHost(hostname: string): boolean {
  return hostname === SGI_ADMIN_HOST;
}

/** Vercel preview/prod o dominio público principal (API en `/api`, sin CORS). */
export function isVercelOrPrimaryPublicHost(hostname: string): boolean {
  return hostname.endsWith(".vercel.app") || isPrimaryPublicHost(hostname);
}
