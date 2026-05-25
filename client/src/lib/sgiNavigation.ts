/**
 * Visibilidad de menús y tarjetas según permisos por pantalla (home + hubs del SGI).
 */
export type SgiNavUser = {
  role?: string;
  admin_b_grants?: string[] | null;
  lector_grants?: string[] | null;
  kryptex_asignado?: boolean;
};
import { grantsIncludeScreen, HOSTING_HUB_SCREENS, ASIC_HUB_SCREENS } from "./sgiScreenGrants";
import { SGI_PERMISSION_SCREEN_MAP } from "./sgiPermissionsScreenMap";

const FIN_HUB_SCREENS = [
  "fin-proveedores",
  "fin-contabilidad",
  "fin-monitor",
  "fin-exchange-hub",
  "fin-exchange-ops",
  "fin-exchange-hist",
] as const;

const CLIENTS_HUB_SCREENS = ["clients-hosting", "clients-store"] as const;

const USUARIOS_HUB_SCREENS = [
  "sgi-usuarios-cuentas",
  "sgi-usuarios-clientes-cuentas",
  "sgi-usuarios-actividad",
  "sgi-usuarios-auditoria",
] as const;

const GA_HUB_SECTION_SCREENS = [
  ...HOSTING_HUB_SCREENS,
  ...ASIC_HUB_SCREENS,
  ...FIN_HUB_SCREENS,
  "ga-nuevos-leads",
  "ga-leads-base",
] as const;

/** Ruta de hub/menú → basta con tener acceso a una pantalla de la lista. */
const HUB_PATH_SCREENS: Record<string, readonly string[]> = {
  "/gestion-administrativa": GA_HUB_SECTION_SCREENS,
  "/hosting": HOSTING_HUB_SCREENS,
  "/asic": ASIC_HUB_SCREENS,
  "/gestion-financiera": FIN_HUB_SCREENS,
  "/clients": CLIENTS_HUB_SCREENS,
  "/usuarios": USUARIOS_HUB_SCREENS,
};

function normalizeNavPath(path: string): string {
  const base = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return base;
}

/** Ruta concreta → pantallas que la habilitan (derivado del mapa de permisos). */
const ROUTE_TO_SCREEN_IDS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const row of SGI_PERMISSION_SCREEN_MAP) {
    if (row.infoOnly) continue;
    for (const raw of row.routes) {
      const route = normalizeNavPath(raw.replace(/:id/g, ""));
      if (!out[route]) out[route] = [];
      if (!out[route].includes(row.id)) out[route].push(row.id);
    }
  }
  out["/history"] = [...new Set([...(out["/history"] ?? []), ...(out["/hosting/history"] ?? ["hosting-history"])])];
  out["/reports"] = [
    ...new Set([...(out["/reports"] ?? []), "exec-reportes", "hosting-reports-shortcut"]),
  ];
  return out;
})();

/** Rutas de ítems de menú → pantalla principal (cuando no coincide 1:1 con ROUTE_TO_SCREEN_IDS). */
const NAV_PATH_SCREEN: Record<string, string> = {
  "/asic/monitor-equipos": "asic-monitor",
  "/marketplace/orders": "marketplace-orders",
  "/marketplace/presence": "marketplace-presencia",
};

export function userGrantList(user: SgiNavUser | null | undefined): string[] | null | undefined {
  if (!user) return undefined;
  if (user.role === "lector") return user.lector_grants;
  if (user.role === "admin_b" || user.role === "operador") return user.admin_b_grants;
  return null;
}

/** ¿Puede usar esta pantalla (id del mapa de permisos)? */
export function canUserAccessScreen(user: SgiNavUser | null | undefined, screenId: string): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  const grants = userGrantList(user);
  if (user.role === "lector") {
    if (grants == null) return false;
    if (grants.length === 0) return false;
    return grantsIncludeScreen(grants, screenId);
  }
  if (user.role === "admin_b" || user.role === "operador") {
    if (grants == null) return true;
    return grantsIncludeScreen(grants, screenId);
  }
  return false;
}

function hasAnyScreen(user: SgiNavUser | null | undefined, screenIds: readonly string[]): boolean {
  return screenIds.some((id) => canUserAccessScreen(user, id));
}

export function canUserSeeHostingSection(user: SgiNavUser | null | undefined): boolean {
  return hasAnyScreen(user, HOSTING_HUB_SCREENS);
}

export function canUserSeeAsicSection(user: SgiNavUser | null | undefined): boolean {
  return hasAnyScreen(user, ASIC_HUB_SCREENS);
}

export function canUserSeeFinSection(user: SgiNavUser | null | undefined): boolean {
  return hasAnyScreen(user, FIN_HUB_SCREENS);
}

export function canUserSeeClientsSection(user: SgiNavUser | null | undefined): boolean {
  return hasAnyScreen(user, CLIENTS_HUB_SCREENS);
}

export function canUserSeeUsuariosSection(user: SgiNavUser | null | undefined): boolean {
  return hasAnyScreen(user, USUARIOS_HUB_SCREENS);
}

export function canUserSeeGestionAdministrativaNav(user: SgiNavUser | null | undefined): boolean {
  return hasAnyScreen(user, GA_HUB_SECTION_SCREENS);
}

/**
 * ¿Mostrar tarjeta/enlace del home o un ítem de hub?
 * Oculta secciones completas sin acceso; dentro de un hub solo se filtran ítems en cada página.
 */
export function canUserAccessNavPath(user: SgiNavUser | null | undefined, to: string): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;

  const path = normalizeNavPath(to);

  if (path === "/equipment" || path === "/marketplace" || path === "/home" || path.startsWith("/marketplace/home")) {
    return true;
  }

  if (path === "/kryptex" || path.startsWith("/kryptex/")) {
    if (user.role === "lector") return user.kryptex_asignado === true;
    return user.role === "admin_b" || user.role === "operador" || user.role === "lector";
  }

  const hubScreens = HUB_PATH_SCREENS[path];
  if (hubScreens) return hasAnyScreen(user, hubScreens);

  const mappedScreen = NAV_PATH_SCREEN[path];
  if (mappedScreen) return canUserAccessScreen(user, mappedScreen);

  const screenIds = ROUTE_TO_SCREEN_IDS[path];
  if (screenIds && screenIds.length > 0) {
    return screenIds.some((id) => canUserAccessScreen(user, id));
  }

  const grants = userGrantList(user);
  if (user.role === "lector") return false;
  if (user.role === "admin_b" || user.role === "operador") {
    return grants == null;
  }
  return false;
}
