/** Dominios habituales para autocompletar correos en formularios (tienda / registro). */
export const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "live.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "msn.com",
  "gmx.com",
  "yahoo.com.ar",
  "hotmail.com.ar",
  "outlook.com.ar",
  "fibertel.com.ar",
  "speedy.com.ar",
  "uanicordenons.com.py",
  "tigo.com.py",
  "personal.com.py",
  "outlook.com.py",
] as const;

export function splitEmailLocalAndDomain(value: string): { local: string; domainFragment: string } {
  const v = value.trim();
  const at = v.lastIndexOf("@");
  if (at === -1) return { local: v, domainFragment: "" };
  return {
    local: v.slice(0, at),
    domainFragment: v.slice(at + 1).toLowerCase(),
  };
}

/** Dominios que coinciden con lo escrito después de @ (máx. `limit`). */
export function filterEmailDomainSuggestions(domainFragment: string, limit = 8): string[] {
  const f = domainFragment.trim().toLowerCase();
  const list = [...COMMON_EMAIL_DOMAINS];
  if (!f) return list.slice(0, limit);
  return list.filter((d) => d.startsWith(f)).slice(0, limit);
}
