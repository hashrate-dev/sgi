/**
 * Estados de órdenes marketplace (post “generar orden”) y reglas de transición.
 * Slugs en BD; etiquetas en cliente (i18n / Cotizaciones).
 */

export const MARKETPLACE_TICKET_STATUSES = [
  "borrador",
  "enviado_consulta",
  "en_contacto_equipo",
  "en_gestion",
  "pagada",
  "en_viaje",
  "instalado",
  "cerrado",
  "descartado",
] as const;

export type MarketplaceTicketStatusSlug = (typeof MARKETPLACE_TICKET_STATUSES)[number];

/** Una sola orden “activa” por cuenta: embudo hasta envío (excluye instalado = venta cerrada en sitio). */
export const MARKETPLACE_PIPELINE_BLOCKING_STATUSES = [
  "enviado_consulta",
  "en_contacto_equipo",
  "en_gestion",
  "pagada",
  "en_viaje",
  /** Legacy / migraciones; debe coincidir con `isMarketplaceOrderPipelineBlockingStatus` y con el IN SQL de quote-sync. */
  "respondido",
] as const;

export function normalizeTicketStatusDb(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isMarketplaceOrderPipelineBlockingStatus(s: string): boolean {
  const x = normalizeTicketStatusDb(s);
  if (x === "respondido") return true;
  return (MARKETPLACE_PIPELINE_BLOCKING_STATUSES as readonly string[]).includes(x);
}

/** SQL IN (...) para consultas de bloqueo de orden única. */
export function marketplacePipelineBlockingInSql(): string {
  return (MARKETPLACE_PIPELINE_BLOCKING_STATUSES as readonly string[]).map((s) => `'${s}'`).join(",");
}

export function canTransitionTicketStatus(current: string, next: string): boolean {
  const from = normalizeTicketStatusDb(current);
  const to = normalizeTicketStatusDb(next);
  if (from === to) return true;
  const rules: Record<string, string[]> = {
    borrador: ["enviado_consulta", "descartado"],
    enviado_consulta: ["en_contacto_equipo", "en_gestion", "descartado", "cerrado"],
    en_contacto_equipo: ["en_gestion", "enviado_consulta", "descartado", "cerrado"],
    en_gestion: ["pagada", "en_contacto_equipo", "descartado", "cerrado"],
    pagada: ["en_viaje", "en_gestion", "descartado", "cerrado"],
    en_viaje: ["instalado", "pagada", "descartado", "cerrado"],
    instalado: ["en_viaje"],
    cerrado: [],
    descartado: [],
    respondido: ["en_contacto_equipo", "en_gestion", "cerrado", "descartado"],
  };
  return (rules[from] ?? []).includes(to);
}

export function isTerminalMarketplaceTicketStatus(s: string): boolean {
  const x = normalizeTicketStatusDb(s);
  return x === "cerrado" || x === "descartado" || x === "instalado";
}
