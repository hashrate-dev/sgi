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

/** `RESEND_FROM_EMAIL` explícito; no usamos fallback onboarding automáticamente. */
export function effectiveResendFromEmail(): string {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  return explicit || "";
}
