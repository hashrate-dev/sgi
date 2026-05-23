import type { AdminBPermissionKey } from "./adminBPermissionsCatalog.js";
import type { LectorPermissionKey } from "./lectorPermissionsCatalog.js";
import {
  canLectorSeeHomeMenuTo,
  pathMatchesAnyLectorPrefix,
} from "./lectorPermissionsCatalog.js";
import {
  collectPathPrefixesFromScreenGrants,
  grantsIncludeLegacyModule,
  grantsIncludeScreen,
} from "./sgiScreenGrants.js";
import { canUserAccessScreen, canUserSeeGestionAdministrativaNav } from "./sgiNavigation.js";

export type UserRole = "admin_a" | "admin_b" | "operador" | "lector" | "cliente";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  usuario?: string;
  /**
   * Lista blanca para `admin_b`. `undefined`/`null`: sin lista explícita (acceso completo histórico).
   */
  admin_b_grants?: string[] | null;
  /**
   * Lista blanca para `lector` (solo gestiona AdministradorA). `null`/`undefined`: comportamiento SPA histórico (solo Kryptex; API puede seguir amplia según servidor).
   */
  lector_grants?: string[] | null;
  /** Lector: el servidor encontró un pool Kryptex para usuario/correo. */
  kryptex_asignado?: boolean;
  /** Celular indicado al registrar la cuenta tienda. */
  celular?: string;
  /** Teléfono fijo opcional del registro. */
  telefono?: string;
};

export type PermUser = Pick<AuthUser, "role" | "admin_b_grants" | "lector_grants" | "kryptex_asignado"> | null | undefined;

/** Lector con pool Kryptex vinculado en el servidor. */
export function lectorHasKryptexPool(user: Pick<AuthUser, "role" | "kryptex_asignado"> | null | undefined): boolean {
  return user?.role === "lector" && user.kryptex_asignado === true;
}

/** Lector con permisos de módulos SGI en el inicio (además de Kryptex). */
export function lectorHasHomeDashboardModules(
  user: Pick<AuthUser, "role" | "lector_grants" | "kryptex_asignado"> | null | undefined
): boolean {
  if (!user || user.role !== "lector") return false;
  const g = user.lector_grants;
  if (!Array.isArray(g) || g.length === 0) return false;
  const paths = [
    "/gestion-administrativa",
    "/clients/account",
    "/history",
    "/clients",
    "/reports",
    "/equipment",
  ];
  return paths.some((to) => canLectorSeeHomeMenuTo(user, to));
}

/** Ruta tras login o cuando no puede entrar a la pantalla pedida. */
export function lectorDefaultLandingPath(user: AuthUser): string {
  if (user.role !== "lector") return "/";
  if (lectorHasHomeDashboardModules(user)) return "/";
  if (lectorHasKryptexPool(user)) return "/kryptex";
  return "/";
}

/** Lista explícita de módulos de consulta (`null`: legado amplio según servidor / solo Kryptex en SPA). */
export function lectorAllowsModule(user: PermUser, key: LectorPermissionKey): boolean {
  if (!user || user.role !== "lector") return true;
  return grantsIncludeLegacyModule(user.lector_grants ?? null, key);
}

/** Lector con lista guardada en servidor (puede ser `[]`: sin módulos). */
export function lectorHasExplicitGrantList(user: PermUser): boolean {
  return user?.role === "lector" && user.lector_grants != null;
}

/** Rutas internas permitidas para Operador / Admin B con lista explícita. */
export function isStaffPathAllowedInSpa(
  user: Pick<AuthUser, "role" | "admin_b_grants">,
  pathname: string
): boolean {
  if (user.role !== "admin_b" && user.role !== "operador") return true;
  const g = user.admin_b_grants;
  if (g == null) return true;
  const pathRaw = (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") || "/";
  if (g.length === 0) return pathRaw === "/" || pathRaw === "";
  if (pathRaw === "/" || pathRaw === "") return true;
  const prefixes = collectPathPrefixesFromScreenGrants(g);
  return pathMatchesAnyLectorPrefix(pathRaw, prefixes);
}

/** Rutas internas permitidas para lector: Kryptex siempre; resto según grants o bloqueo explícito. */
export function isLectorPathAllowedInSpa(user: Pick<AuthUser, "role" | "lector_grants">, pathname: string): boolean {
  if (user.role !== "lector") return true;
  const pathRaw = pathname.split("?")[0] ?? pathname;
  const isKryptex = pathRaw === "/kryptex" || pathRaw.startsWith("/kryptex/");
  const g = user.lector_grants;
  if (g == null) return isKryptex;
  if (g.length === 0) return isKryptex;
  if (pathRaw === "/" || pathRaw === "") return true;
  if (isKryptex) return true;
  const prefixes = collectPathPrefixesFromScreenGrants(g);
  return pathMatchesAnyLectorPrefix(pathRaw, prefixes);
}

/** Solo AdministradorA configura permisos por módulo de cuentas Lector. */
export function canConfigureLectorGrants(user: PermUser): boolean {
  return user?.role === "admin_a";
}

/** `admin_a`/`lector`/otros ignoran lista; `admin_b` y `operador` según `admin_b_grants`. */
export function adminBAllowsModule(user: PermUser, key: AdminBPermissionKey): boolean {
  if (!user || (user.role !== "admin_b" && user.role !== "operador")) return true;
  return grantsIncludeLegacyModule(user.admin_b_grants ?? null, key);
}

function staffGrants(user: PermUser): string[] | null | undefined {
  if (!user || (user.role !== "admin_b" && user.role !== "operador")) return null;
  return user.admin_b_grants;
}

function lectorGrantsList(user: PermUser): string[] | null | undefined {
  if (!user || user.role !== "lector") return null;
  return user.lector_grants;
}

/** Monitor ASIC corporativo (no vitrina): Administrador A, o B/Operador con permiso `equipos`. */
export function canAccessMonitorEquiposAsic(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b" || user.role === "lector") {
    return canUserAccessScreen(user, "asic-monitor");
  }
  return false;
}

const TOKEN_KEY = "hrs_facturacion_token";
const USER_KEY = "hrs_facturacion_user";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Si `token` es null/undefined/vacío, no se guarda JWT (sesión solo por cookie httpOnly en producción). */
export function setStoredAuth(token: string | null | undefined, user: AuthUser): void {
  try {
    const t = typeof token === "string" ? token.trim() : "";
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* sin localStorage */
  }
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** AdministradorA/B y Operador: facturación y clientes. Lector: solo observar. */
export function canEditFacturacion(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "facturacion");
  return false;
}

export function canEditClientes(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "clientes");
  return false;
}

/** Pantallas de contabilidad / monitor financiero — lectura; el lector puede ver listados. */
export function canAccessFinanzaContabilidadHub(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "finanzas_contabilidad");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "finanzas_contabilidad");
  return false;
}

/** Operaciones USDT/USD (hosting) — mismo acceso lectura que en API GET (incluye lector). */
export function canAccessHostingTipoCambio(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "hosting_tipo_cambio");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "hosting_tipo_cambio");
  return false;
}

/** Alta/edición/eliminación FX (POST/PUT/DELETE) — sin lector. */
export function canEditHostingTipoCambio(user: PermUser): boolean {
  if (!user || user.role === "lector") return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "hosting_tipo_cambio");
  return false;
}

/** Borrar FX: sólo admins A/B con permiso. */
export function canDeleteHostingFxOperation(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "hosting_tipo_cambio");
  return false;
}

export function canSeeReportesDashboard(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "reportes");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "reportes");
  return false;
}

export function canSeeCuentaPorClienteShortcut(user: PermUser): boolean {
  return Boolean(
    user &&
      (canEditFacturacion(user) ||
        canEditClientes(user) ||
        canSeeReportesDashboard(user) ||
        (user.role === "lector" &&
          (lectorAllowsModule(user, "facturacion") ||
            lectorAllowsModule(user, "clientes") ||
            lectorAllowsModule(user, "reportes"))))
  );
}

/** Formulario Nuevos Leads (sin acceso automático a Leads Base). */
export function canAccessNuevosLeads(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "lector") return grantsIncludeScreen(lectorGrantsList(user), "ga-nuevos-leads");
  if (user.role === "operador" || user.role === "admin_b") {
    return grantsIncludeScreen(staffGrants(user), "ga-nuevos-leads");
  }
  return false;
}

/** Tabla Leads Base (POTENCIALES CLIENTES). */
export function canAccessLeadsBase(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "lector") return grantsIncludeScreen(lectorGrantsList(user), "ga-leads-base");
  if (user.role === "operador" || user.role === "admin_b") {
    return grantsIncludeScreen(staffGrants(user), "ga-leads-base");
  }
  return false;
}

/** Al menos una tarjeta de Gestión Administrativa visible. */
export function canSeeGestionAdministrativaHub(user: PermUser): boolean {
  return canUserSeeGestionAdministrativaNav(user);
}

export function canDeleteHistorial(user: PermUser): boolean {
  if (!user) return false;
  if (user.role !== "admin_a" && user.role !== "admin_b") return false;
  if (user.role === "admin_a") return true;
  return adminBAllowsModule(user, "facturacion");
}

export function canDeleteClientes(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "clientes");
  return false;
}

/** Ver listado Gestión usuarios / abrir rutas `/usuarios/*` como admin B. */
export function canManageUsers(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "usuarios");
  return false;
}

/** Enlace «SGI» en footer del marketplace: personal interno; oculto para clientes de tienda. */
export function canAccessSgiFromMarketplaceFooter(user: PermUser): boolean {
  if (!user) return false;
  return (
    user.role === "admin_a" ||
    user.role === "admin_b" ||
    user.role === "operador" ||
    user.role === "lector"
  );
}

/** Asignar permisos granular a otros AdministradorB — sólo AdministradorA (sin API en cliente). */
export function canConfigureAdminBGrants(user: PermUser): boolean {
  return user?.role === "admin_a";
}

/** Precio USD, publicación en tienda online e imágenes de vitrina: solo AdministradorA / AdministradorB autorizados. */
export function canEditEquipoMarketplacePrecioYTienda(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "equipos_tienda");
  return false;
}

/** Monitoreo de cotizaciones / tickets del marketplace (carrito cliente). */
export function canViewMarketplaceQuoteTickets(user: PermUser): boolean {
  return canUserAccessScreen(user, "marketplace-orders");
}

/** Presencia marketplace / embudo. */
export function canViewMarketplacePresence(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "marketplace_presencia");
  return false;
}

/** Setup / combos minería. */
export function canAccessSetupsModule(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "setups");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "setups");
  return false;
}

export function canEditEquiposInventory(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "equipos");
  return false;
}

export function canAccessProveedoresHrs(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "finanzas_proveedores");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "finanzas_proveedores");
  return false;
}

export function canEditProveedoresHrs(user: PermUser): boolean {
  if (!user || user.role === "lector") return false;
  return canAccessProveedoresHrs(user);
}

export function canEditContabilidadGastos(user: PermUser): boolean {
  if (!user || user.role === "lector") return false;
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "finanzas_contabilidad");
  return false;
}

export function canAccessAsicCostos(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "finanzas_asic_costos");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "finanzas_asic_costos");
  return false;
}

/** Inventario equipos ASIC — lectura/edición pantallas internas. */
export function canAccessEquiposAsicStaff(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") {
    return (
      lectorAllowsModule(user, "equipos") ||
      lectorAllowsModule(user, "equipos_tienda") ||
      lectorAllowsModule(user, "garantias") ||
      lectorAllowsModule(user, "setups") ||
      lectorAllowsModule(user, "finanzas_asic_costos") ||
      lectorAllowsModule(user, "facturacion")
    );
  }
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b")
    return adminBAllowsModule(user, "equipos") || adminBAllowsModule(user, "equipos_tienda");
  return false;
}

/** Carrito de cotización en /marketplace: cualquier usuario autenticado (todos los roles). */
export function canUseMarketplaceQuoteCart(user: PermUser): boolean {
  if (!user) return false;
  return (
    user.role === "cliente" ||
    user.role === "admin_a" ||
    user.role === "admin_b" ||
    user.role === "operador" ||
    user.role === "lector"
  );
}

/**
 * Una sola orden marketplace en curso — alineado con `canUseMarketplaceQuoteCart`.
 */
export function enforceSingleMarketplaceOrderForRole(user: PermUser): boolean {
  return canUseMarketplaceQuoteCart(user);
}

/** En «Mis órdenes»: exportar Excel y borrar todas — solo admin con módulo pedidos. */
export function canBulkManageMarketplaceMyOrders(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "marketplace_pedidos");
  return false;
}

/** Solo AdministradorA puede eliminar cuentas con rol AdministradorA o AdministradorB. */
export function canDeleteAdminUser(currentUserRole: UserRole, targetUserRole: string): boolean {
  if (targetUserRole !== "admin_a" && targetUserRole !== "admin_b") return true;
  return currentUserRole === "admin_a";
}

/** Exportar datos (Excel, etc.). */
export function canExport(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "exportar");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "exportar");
  return false;
}

/** Gastos garantías / pantallas garantía uso clientes típico. */
export function canAccessGarantiasModule(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "garantias");
  if (user.role === "admin_a") return true;
  if (user.role === "operador" || user.role === "admin_b") return adminBAllowsModule(user, "garantias");
  return false;
}

