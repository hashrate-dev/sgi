import type { Client } from "./types";

/**
 * Cliente de la tienda online (/marketplace/signup; legacy: /marketplace/registro): códigos A90001… o histórico WEB-{id}.
 * No deben mezclarse en listados de clientes Hosting / facturación corporativa.
 */
export function isClienteTiendaOnline(client: Pick<Client, "code">): boolean {
  const c = (client.code ?? "").trim().toUpperCase();
  return c.startsWith("WEB-") || /^A9\d+$/.test(c);
}
