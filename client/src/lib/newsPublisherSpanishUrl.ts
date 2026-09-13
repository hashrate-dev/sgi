/**
 * Abre el artículo en el idioma español del propio medio (header /es/, es.dominio).
 * Nunca Google Translate / translate.goog: CoinDesk y otros lo bloquean.
 */

const PATH_LOCALES = [
  "es",
  "pt-br",
  "pt",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh-cn",
  "zh-tw",
  "zh",
  "tr",
  "vi",
  "ru",
  "ar",
  "id",
  "th",
  "hi",
  "nl",
  "pl",
];

const PATH_LOCALE_HOSTS = [/(^|\.)coindesk\.com$/i];

const SUBDOMAIN_ES: Array<{ match: RegExp; esHost: string }> = [
  { match: /(^|\.)cointelegraph\.com$/i, esHost: "es.cointelegraph.com" },
  { match: /(^|\.)beincrypto\.com$/i, esHost: "es.beincrypto.com" },
];

function unwrapGoogleTranslateShell(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host.includes("translate.google.")) {
      const inner = String(u.searchParams.get("u") || "").trim();
      if (/^https?:\/\//i.test(inner)) return unwrapGoogleTranslateShell(inner);
    }
    if (host.endsWith(".translate.goog")) {
      const dashed = host.replace(/\.translate\.goog$/i, "");
      const origHost = dashed.replace(/-/g, ".");
      const proto = u.searchParams.get("_x_tr_sch") === "http" ? "http:" : "https:";
      const params = new URLSearchParams(u.search);
      for (const key of [...params.keys()]) {
        if (key.startsWith("_x_tr_")) params.delete(key);
      }
      const q = params.toString();
      return `${proto}//${origHost}${u.pathname}${q ? `?${q}` : ""}${u.hash}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

function stripPathLocale(pathname: string): string {
  const re = new RegExp(`^/(${PATH_LOCALES.join("|")})(?=/|$)`, "i");
  const next = pathname.replace(re, "");
  return next.startsWith("/") ? next : `/${next}`;
}

function withSpanishPath(pathname: string): string {
  const rest = stripPathLocale(pathname) || "/";
  if (rest === "/") return "/es";
  return `/es${rest}`;
}

function usesPathLocale(host: string): boolean {
  return PATH_LOCALE_HOSTS.some((re) => re.test(host));
}

/**
 * URL del artículo en español en el mismo sitio (CoinDesk /es/, Cointelegraph es.*).
 * Si el medio no publica edición ES, deja el original (sin salir del dominio).
 */
export function toPublisherSpanishUrl(raw: string): string {
  const unwrapped = unwrapGoogleTranslateShell(String(raw || "").trim());
  if (!unwrapped) return unwrapped;
  let u: URL;
  try {
    u = new URL(unwrapped);
  } catch {
    return unwrapped;
  }
  if (!/^https?:$/i.test(u.protocol)) return unwrapped;
  const host = u.hostname.toLowerCase();
  if (host === "news.google.com" || host.endsWith(".news.google.com")) return unwrapped;

  if (usesPathLocale(host)) {
    u.pathname = withSpanishPath(u.pathname);
    return u.toString();
  }

  for (const rule of SUBDOMAIN_ES) {
    if (!rule.match.test(host)) continue;
    if (host === rule.esHost || host.startsWith("es.")) return unwrapped;
    u.hostname = rule.esHost;
    return u.toString();
  }

  return u.toString();
}

export function publisherHasNativeSpanish(raw: string): boolean {
  const original = unwrapGoogleTranslateShell(String(raw || "").trim());
  const localized = toPublisherSpanishUrl(original);
  try {
    const a = new URL(original);
    const b = new URL(localized);
    return a.hostname.toLowerCase() !== b.hostname.toLowerCase() || a.pathname !== b.pathname;
  } catch {
    return false;
  }
}
