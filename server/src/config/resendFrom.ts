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

function isValidResendFromHeader(header: string): boolean {
  const t = header.trim();
  if (!t) return false;
  const { address } = parseResendFromHeader(t);
  return address.includes("@") && address.indexOf("@") > 0;
}

/** Remitente apex (si está verificado en Resend). */
export const DEFAULT_RESEND_FROM = "Hashrate Space <noreply@hashrate.space>";

/** Subdominio mail (suele ser el verificado en cuentas Resend antiguas). */
export const LEGACY_RESEND_FROM_MAIL = "Hashrate Space <noreply@mail.hashrate.space>";

function normalizeResendLocalPart(header: string): string {
  const t = header.trim();
  if (!t) return "";
  const { display, address } = parseResendFromHeader(t);
  const at = address.lastIndexOf("@");
  if (at < 1) return t;
  let local = address.slice(0, at).trim();
  const host = address.slice(at + 1).trim().toLowerCase();
  if (local.toLowerCase() === "no-reply") local = "noreply";
  return formatResendFromHeader(display, `${local}@${host}`);
}

/** Variante alternativa apex ↔ mail para reintentos automáticos. */
function resendFromAlternateDomain(header: string): string {
  const t = normalizeResendLocalPart(header);
  if (!t) return "";
  const { display, address } = parseResendFromHeader(t);
  const at = address.lastIndexOf("@");
  if (at < 1) return "";
  const local = address.slice(0, at).trim();
  const host = address.slice(at + 1).trim().toLowerCase();
  if (host === "mail.hashrate.space") {
    return formatResendFromHeader(display, `${local}@hashrate.space`);
  }
  if (host === "hashrate.space") {
    return formatResendFromHeader(display, `${local}@mail.hashrate.space`);
  }
  return "";
}

/**
 * Lista de remitentes a probar (en orden). No fuerza un solo dominio:
 * si el apex (@hashrate.space) falla en Resend, se reintenta con mail.hashrate.space.
 */
export function resendFromCandidates(): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t || !isValidResendFromHeader(t)) return;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };

  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  if (explicit) {
    add(normalizeResendLocalPart(explicit));
    add(resendFromAlternateDomain(explicit));
  }

  add(DEFAULT_RESEND_FROM);
  add(LEGACY_RESEND_FROM_MAIL);

  return out;
}

/** Valor preferido para logs / health (primer candidato). */
export function effectiveResendFromEmail(): string {
  const c = resendFromCandidates();
  return c[0] ?? "";
}

/** Igual que `effectiveResendFromEmail`, con fallback si no hay env. */
export function effectiveResendFromEmailOrDefault(): string {
  const from = effectiveResendFromEmail();
  if (from) return from;
  if (normalizeResendApiKey(process.env.RESEND_API_KEY)) {
    return DEFAULT_RESEND_FROM;
  }
  return "";
}

/** @deprecated Usar `resendFromCandidates`; se mantiene por compatibilidad con imports viejos. */
export function normalizeResendFromEmailForVerifiedDomain(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const alt = resendFromAlternateDomain(t);
  return alt || t;
}
