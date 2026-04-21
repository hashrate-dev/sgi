/**
 * Quita comillas envolventes y el error típico de pegar dos veces el prefijo `re_` (`re_re_…`),
 * que pasa la validación local pero Resend responde 401.
 */
export function normalizeResendApiKey(raw: string | undefined | null): string {
  let k = String(raw ?? "").trim();
  if (k.length >= 2 && ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'")))) {
    k = k.slice(1, -1).trim();
  }
  while (k.startsWith("re_re_")) {
    k = k.slice(3);
  }
  return k;
}

/** Detecta claves inválidas (ej. token Vercel vcp_ con prefijo re_ falso). */
export function resendApiKeyLooksInvalid(apiKey: string): boolean {
  const k = normalizeResendApiKey(apiKey);
  if (!k) return true;
  if (!k.startsWith("re_")) return true;
  if (k.startsWith("re_vcp_") || k.includes("vcp_")) return true;
  return false;
}

/** Parsea `Nombre <correo@dominio>` o solo la dirección. */
function parseResendFromHeader(raw: string): { display: string; address: string } {
  const t = raw.trim();
  const m = t.match(/^(.+?)\s*<([^<>]+)>$/);
  if (m) {
    const g1 = m[1];
    const g2 = m[2];
    if (g1 != null && g2 != null) {
      let display = g1.trim();
      if (
        (display.startsWith('"') && display.endsWith('"')) ||
        (display.startsWith("'") && display.endsWith("'"))
      ) {
        display = display.slice(1, -1).trim();
      }
      return { display, address: g2.trim() };
    }
  }
  return { display: "", address: t };
}

function formatResendFromHeader(display: string, address: string): string {
  const a = address.trim();
  if (!a) return "";
  const d = display.trim();
  if (d) return `${d} <${a}>`;
  return a;
}

/**
 * En Resend suele estar verificado solo el subdominio `mail.hashrate.space`.
 * Remitentes en el apex `@hashrate.space` devuelven 403; muchos `.env` de ejemplo usaban `no-reply@hashrate.space`.
 */
export function normalizeResendFromEmailForVerifiedDomain(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const { display, address } = parseResendFromHeader(t);
  const at = address.lastIndexOf("@");
  if (at < 1 || at >= address.length - 1) return t;
  let local = address.slice(0, at).trim();
  const host = address.slice(at + 1).trim().toLowerCase();
  if (host !== "hashrate.space") return t;
  if (local.toLowerCase() === "no-reply") local = "noreply";
  return formatResendFromHeader(display, `${local}@mail.hashrate.space`);
}

/** Valor efectivo de `RESEND_FROM_EMAIL` (normalizado a dominio verificado si aplica). */
export function effectiveResendFromEmail(): string {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  return normalizeResendFromEmailForVerifiedDomain(explicit || "");
}
