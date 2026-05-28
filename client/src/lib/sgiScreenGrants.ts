/**
 * Permisos granulares por pantalla (clave = `id` del mapa en sgiPermissionsScreenMap).
 * Claves legacy (`facturacion`, `leads`, …) siguen válidas al guardar/cargar por compatibilidad.
 */
import type { AdminBPermissionKey } from "./adminBPermissionsCatalog";
import type { LectorPermissionKey } from "./lectorPermissionsCatalog";
import {
  SGI_PERMISSION_SCREEN_MAP,
  type SgiPermissionAudience,
  type SgiPermissionScreenRow,
} from "./sgiPermissionsScreenMap";

export type SgiLegacyModuleKey = AdminBPermissionKey | LectorPermissionKey;

const LEGACY_MODULE_KEYS = new Set<string>([
  "facturacion",
  "clientes",
  "equipos",
  "equipos_tienda",
  "garantias",
  "setups",
  "leads",
  "marketplace_pedidos",
  "marketplace_presencia",
  "finanzas_contabilidad",
  "finanzas_proveedores",
  "finanzas_asic_costos",
  "hosting_tipo_cambio",
  "usuarios",
  "exportar",
  "reportes",
]);

/** Pantalla → módulo legacy (API `requireModuleGrant`). */
export const SCREEN_TO_LEGACY_MODULE: Record<string, SgiLegacyModuleKey> = Object.fromEntries(
  SGI_PERMISSION_SCREEN_MAP.filter((r) => !r.infoOnly).map((r) => [r.id, r.legacyModule] as const)
) as Record<string, SgiLegacyModuleKey>;

/** Módulo legacy → pantallas que activaba el permiso grueso anterior. */
export const LEGACY_MODULE_TO_SCREENS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [screenId, mod] of Object.entries(SCREEN_TO_LEGACY_MODULE)) {
    if (!out[mod]) out[mod] = [];
    out[mod].push(screenId);
  }
  return out;
})();

export const SGI_SCREEN_GRANT_IDS = SGI_PERMISSION_SCREEN_MAP.filter((r) => !r.infoOnly).map((r) => r.id);

export function isLegacyModuleKey(k: string): k is SgiLegacyModuleKey {
  return LEGACY_MODULE_KEYS.has(k);
}

export function isValidSgiGrantKey(k: string): boolean {
  return isLegacyModuleKey(k) || k in SCREEN_TO_LEGACY_MODULE;
}

export function screenRowsForAudience(audience: SgiPermissionAudience): SgiPermissionScreenRow[] {
  return SGI_PERMISSION_SCREEN_MAP.filter((r) => r.audience.includes(audience));
}

export function actionableScreenRows(audience: SgiPermissionAudience): SgiPermissionScreenRow[] {
  return screenRowsForAudience(audience).filter((r) => !r.infoOnly);
}

/** ¿La lista guardada habilita esta pantalla? (acepta clave de pantalla o módulo legacy). */
export function grantsIncludeScreen(grants: string[] | null | undefined, screenId: string): boolean {
  if (grants == null) return true;
  if (grants.includes(screenId)) return true;
  const legacy = SCREEN_TO_LEGACY_MODULE[screenId];
  if (legacy && grants.includes(legacy)) return true;
  if (screenId === "ga-nuevos-leads" || screenId === "ga-leads-base" || screenId === "ga-hub") {
    if (grants.includes("leads")) return true;
    const legacyLeads = ["facturacion", "equipos", "equipos_tienda", "garantias", "setups"] as const;
    if (legacyLeads.some((k) => grants.includes(k))) return true;
  }
  return false;
}

/** ¿La lista habilita un módulo API legacy? (cualquier pantalla hijo o la clave legacy). */
export function grantsIncludeLegacyModule(
  grants: string[] | null | undefined,
  module: SgiLegacyModuleKey
): boolean {
  if (grants == null) return true;
  if (grants.includes(module)) return true;
  const screens = LEGACY_MODULE_TO_SCREENS[module] ?? [];
  if (screens.some((id) => grants.includes(id))) return true;
  if (module === "leads") {
    const legacyLeads = ["facturacion", "equipos", "equipos_tienda", "garantias", "setups"] as const;
    if (legacyLeads.some((k) => grants.includes(k))) return true;
  }
  return false;
}

/** Estado inicial del modal: cada pantalla con su propio checkbox. */
export function hydrateScreenSelection(
  audience: SgiPermissionAudience,
  grants: string[] | null | undefined,
  explicit: boolean
): Record<string, boolean> {
  const sel: Record<string, boolean> = {};
  for (const row of actionableScreenRows(audience)) {
    sel[row.id] = explicit ? grantsIncludeScreen(grants, row.id) : true;
  }
  return sel;
}

/** Lista a persistir: solo ids de pantalla marcados (sin duplicar legacy). */
export function screenIdsFromSelection(
  audience: SgiPermissionAudience,
  selected: Record<string, boolean>
): string[] {
  return actionableScreenRows(audience).filter((r) => selected[r.id]).map((r) => r.id);
}

export function countSelectedScreens(
  audience: SgiPermissionAudience,
  selected: Record<string, boolean>
): number {
  return actionableScreenRows(audience).filter((r) => selected[r.id]).length;
}

export const HOSTING_HUB_SCREENS = [
  "hosting-billing",
  "hosting-history",
  "hosting-pending",
  "hosting-email-flow",
  "hosting-reports-shortcut",
] as const;

export const ASIC_HUB_SCREENS = [
  "asic-equipment",
  "asic-monitor",
  "asic-monitor-bajas",
  "asic-cotizador",
  "asic-billing",
  "asic-history",
  "asic-pending",
  "asic-setup",
  "asic-reparacion",
  "asic-garantia-ande",
  "asic-garantia-items",
  "asic-garantia-hist",
] as const;

/** Prefijos de ruta SPA según pantallas habilitadas (incluye hubs derivados). */
export function collectPathPrefixesFromScreenGrants(grants: readonly string[]): string[] {
  const g = [...grants];
  const set = new Set<string>();
  for (const row of SGI_PERMISSION_SCREEN_MAP) {
    if (row.infoOnly) continue;
    if (!grantsIncludeScreen(g, row.id)) continue;
    for (const p of row.routes) set.add(p);
  }
  if (HOSTING_HUB_SCREENS.some((id) => grantsIncludeScreen(g, id))) set.add("/hosting");
  if (ASIC_HUB_SCREENS.some((id) => grantsIncludeScreen(g, id))) set.add("/asic");
  if (
    grantsIncludeScreen(g, "clients-hosting") ||
    grantsIncludeScreen(g, "clients-store")
  ) {
    set.add("/clients");
  }
  const seesGa =
    grantsIncludeScreen(g, "ga-nuevos-leads") ||
    grantsIncludeScreen(g, "ga-leads-base") ||
    grantsIncludeScreen(g, "ga-cambio-usdt-hub") ||
    grantsIncludeScreen(g, "ga-cambio-usdt-clientes");
  const seesFin =
    grantsIncludeScreen(g, "fin-proveedores") ||
    grantsIncludeScreen(g, "fin-contabilidad") ||
    grantsIncludeScreen(g, "fin-monitor") ||
    grantsIncludeScreen(g, "fin-exchange-hub") ||
    grantsIncludeScreen(g, "fin-exchange-ops") ||
    grantsIncludeScreen(g, "fin-exchange-hist");
  if (seesGa || seesFin) set.add("/gestion-administrativa");
  if (seesFin) set.add("/gestion-financiera");
  return [...set];
}
