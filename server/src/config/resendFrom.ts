/** Remitente de prueba usado en la documentación de Resend cuando solo definís API key. */
export const RESEND_DEFAULT_ONBOARDING_FROM = "onboarding@resend.dev";

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

/** `RESEND_FROM_EMAIL` si está definido; si no, el onboarding de Resend solo cuando hay `RESEND_API_KEY`. */
export function effectiveResendFromEmail(): string {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  if (explicit) return explicit;
  if (normalizeResendApiKey(process.env.RESEND_API_KEY)) return RESEND_DEFAULT_ONBOARDING_FROM;
  return "";
}
