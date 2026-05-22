/**
 * Validación de permisos por pantalla (alineado con client/src/lib/sgiPermissionsScreenMap.ts).
 */
import type { AdminBPermissionKey } from "./adminBPermissions.js";

/** Pantallas con checkbox propio (ids del mapa SPA). */
export const SGI_SCREEN_GRANT_IDS = [
  "ga-nuevos-leads",
  "ga-leads-base",
  "hosting-billing",
  "hosting-history",
  "hosting-pending",
  "hosting-email-flow",
  "hosting-reports-shortcut",
  "asic-equipment",
  "asic-monitor",
  "asic-monitor-bajas",
  "asic-cotizador",
  "asic-billing",
  "asic-history",
  "asic-pending",
  "asic-setup",
  "asic-reparacion",
  "asic-transporte",
  "asic-garantia-ande",
  "asic-garantia-items",
  "asic-garantia-hist",
  "clients-hosting",
  "clients-store",
  "clients-account",
  "marketplace-banners",
  "marketplace-orders",
  "marketplace-presence",
  "fin-proveedores",
  "fin-contabilidad",
  "fin-monitor",
  "fin-exchange-hub",
  "fin-exchange-ops",
  "fin-exchange-hist",
  "sgi-usuarios-cuentas",
  "sgi-usuarios-actividad",
  "sgi-usuarios-auditoria",
  "exec-reportes",
  "exec-exportar",
] as const;

const SCREEN_SET = new Set<string>(SGI_SCREEN_GRANT_IDS);

const SCREEN_TO_LEGACY: Record<string, AdminBPermissionKey> = {
  "ga-nuevos-leads": "leads",
  "ga-leads-base": "leads",
  "hosting-billing": "facturacion",
  "hosting-history": "facturacion",
  "hosting-pending": "facturacion",
  "hosting-email-flow": "facturacion",
  "hosting-reports-shortcut": "reportes",
  "asic-equipment": "equipos",
  "asic-monitor": "equipos",
  "asic-monitor-bajas": "equipos",
  "asic-cotizador": "finanzas_asic_costos",
  "asic-billing": "facturacion",
  "asic-history": "facturacion",
  "asic-pending": "facturacion",
  "asic-setup": "setups",
  "asic-reparacion": "setups",
  "asic-transporte": "setups",
  "asic-garantia-ande": "garantias",
  "asic-garantia-items": "garantias",
  "asic-garantia-hist": "garantias",
  "clients-hosting": "clientes",
  "clients-store": "clientes",
  "clients-account": "clientes",
  "marketplace-banners": "equipos_tienda",
  "marketplace-orders": "marketplace_pedidos",
  "marketplace-presence": "marketplace_presencia",
  "fin-proveedores": "finanzas_proveedores",
  "fin-contabilidad": "finanzas_contabilidad",
  "fin-monitor": "finanzas_contabilidad",
  "fin-exchange-hub": "hosting_tipo_cambio",
  "fin-exchange-ops": "hosting_tipo_cambio",
  "fin-exchange-hist": "hosting_tipo_cambio",
  "sgi-usuarios-cuentas": "usuarios",
  "sgi-usuarios-actividad": "usuarios",
  "sgi-usuarios-auditoria": "usuarios",
  "exec-reportes": "reportes",
  "exec-exportar": "exportar",
};

const LEGACY_TO_SCREENS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [id, mod] of Object.entries(SCREEN_TO_LEGACY)) {
    if (!out[mod]) out[mod] = [];
    out[mod].push(id);
  }
  return out;
})();

const LEGACY_LEADS_ALIASES = ["facturacion", "equipos", "equipos_tienda", "garantias", "setups"] as const;

export function isSgiScreenGrantId(k: string): boolean {
  return SCREEN_SET.has(k);
}

export function grantsIncludeScreen(grants: string[] | null | undefined, screenId: string): boolean {
  if (grants == null) return true;
  if (grants.includes(screenId)) return true;
  const legacy = SCREEN_TO_LEGACY[screenId];
  if (legacy && grants.includes(legacy)) return true;
  if (screenId === "ga-nuevos-leads" || screenId === "ga-leads-base") {
    if (grants.includes("leads")) return true;
    if (LEGACY_LEADS_ALIASES.some((k) => grants.includes(k))) return true;
  }
  return false;
}

export function grantsIncludeLegacyModule(
  grants: string[] | null | undefined,
  module: AdminBPermissionKey
): boolean {
  if (grants == null) return true;
  if (grants.includes(module)) return true;
  const screens = LEGACY_TO_SCREENS[module] ?? [];
  if (screens.some((id) => grants.includes(id))) return true;
  if (module === "leads" && LEGACY_LEADS_ALIASES.some((k) => grants.includes(k))) return true;
  return false;
}
