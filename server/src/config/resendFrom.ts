/** Remitente de prueba usado en la documentación de Resend cuando solo definís API key. */
export const RESEND_DEFAULT_ONBOARDING_FROM = "onboarding@resend.dev";

/** `RESEND_FROM_EMAIL` si está definido; si no, el onboarding de Resend solo cuando hay `RESEND_API_KEY`. */
export function effectiveResendFromEmail(): string {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  if (explicit) return explicit;
  if (process.env.RESEND_API_KEY?.trim()) return RESEND_DEFAULT_ONBOARDING_FROM;
  return "";
}
