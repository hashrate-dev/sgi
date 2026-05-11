import type { AdminBPermissionKey } from "./adminBPermissionsCatalog.js";
import type { LectorPermissionKey } from "./lectorPermissionsCatalog.js";
import {
  collectLectorAllowedPathPrefixes,
  pathMatchesAnyLectorPrefix,
} from "./lectorPermissionsCatalog.js";

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
  /** Celular indicado al registrar la cuenta tienda. */
  celular?: string;
  /** Teléfono fijo opcional del registro. */
  telefono?: string;
};

export type PermUser = Pick<AuthUser, "role" | "admin_b_grants" | "lector_grants"> | null | undefined;

/** Lista explícita de módulos de consulta (`null`: legado amplio según servidor / solo Kryptex en SPA). */
export function lectorAllowsModule(user: PermUser, key: LectorPermissionKey): boolean {
  if (!user || user.role !== "lector") return true;
  const g = user.lector_grants;
  if (g == null) return true;
  return g.includes(key);
}

/** Lector con lista guardada en servidor (puede ser `[]`: sin módulos). */
export function lectorHasExplicitGrantList(user: PermUser): boolean {
  return user?.role === "lector" && user.lector_grants != null;
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
  const prefixes = collectLectorAllowedPathPrefixes(g as LectorPermissionKey[]);
  return pathMatchesAnyLectorPrefix(pathRaw, prefixes);
}

/** Solo AdministradorA configura permisos por módulo de cuentas Lector. */
export function canConfigureLectorGrants(user: PermUser): boolean {
  return user?.role === "admin_a";
}

/** `admin_a`/`operador`/`lector`/otros ignoran lista; sólo evalúa `admin_b`. */
export function adminBAllowsModule(user: PermUser, key: AdminBPermissionKey): boolean {
  if (!user || user.role !== "admin_b") return true;
  const g = user.admin_b_grants;
  if (g == null) return true;
  return g.includes(key);
}

/** Monitor ASIC corporativo (no vitrina): Administrador A, o B con permiso `equipos` (lista nula = acceso completo legado). */
export function canAccessMonitorEquiposAsic(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "equipos");
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
  if (user.role === "operador") return true;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "facturacion");
  return false;
}

export function canEditClientes(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return false;
  if (user.role === "operador") return true;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "clientes");
  return false;
}

/** Pantallas de contabilidad / monitor financiero — lectura; el lector puede ver listados. */
export function canAccessFinanzaContabilidadHub(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "finanzas_contabilidad");
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "finanzas_contabilidad");
  return false;
}

/** Operaciones USDT/USD (hosting) — mismo acceso lectura que en API GET (incluye lector). */
export function canAccessHostingTipoCambio(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "hosting_tipo_cambio");
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "hosting_tipo_cambio");
  return false;
}

/** Alta/edición/eliminación FX (POST/PUT/DELETE) — sin lector. */
export function canEditHostingTipoCambio(user: PermUser): boolean {
  if (!user || user.role === "lector") return false;
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "hosting_tipo_cambio");
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
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "reportes");
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

/** Al menos una tarjeta de Gestión Administrativa visible para AdministradorB. */
export function canSeeGestionAdministrativaHub(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") {
    return (
      lectorAllowsModule(user, "facturacion") ||
      lectorAllowsModule(user, "clientes") ||
      lectorAllowsModule(user, "equipos") ||
      lectorAllowsModule(user, "equipos_tienda") ||
      lectorAllowsModule(user, "garantias") ||
      lectorAllowsModule(user, "setups")
    );
  }
  if (user.role !== "admin_b") {
    return user.role === "admin_a" || user.role === "operador";
  }
  return (
    adminBAllowsModule(user, "facturacion") ||
    adminBAllowsModule(user, "equipos") ||
    adminBAllowsModule(user, "equipos_tienda") ||
    adminBAllowsModule(user, "garantias") ||
    adminBAllowsModule(user, "setups")
  );
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

/** Asignar permisos granular a otros AdministradorB — sólo AdministradorA (sin API en cliente). */
export function canConfigureAdminBGrants(user: PermUser): boolean {
  return user?.role === "admin_a";
}

/** Precio USD, publicación en tienda online e imágenes de vitrina: solo AdministradorA / AdministradorB autorizados. */
export function canEditEquipoMarketplacePrecioYTienda(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "equipos_tienda");
  return false;
}

/** Monitoreo de cotizaciones / tickets del marketplace (carrito cliente). */
export function canViewMarketplaceQuoteTickets(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "marketplace_pedidos");
  return false;
}

/** Presencia marketplace / embudo. */
export function canViewMarketplacePresence(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "marketplace_presencia");
  return false;
}

/** Setup / combos minería. */
export function canAccessSetupsModule(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "setups");
  if (user.role === "operador") return true;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "setups");
  return false;
}

export function canEditEquiposInventory(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return false;
  if (user.role === "operador") return true;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "equipos");
  return false;
}

export function canAccessProveedoresHrs(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "finanzas_proveedores");
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "finanzas_proveedores");
  return false;
}

export function canEditProveedoresHrs(user: PermUser): boolean {
  if (!user || user.role === "lector") return false;
  return canAccessProveedoresHrs(user);
}

export function canEditContabilidadGastos(user: PermUser): boolean {
  if (!user || user.role === "lector") return false;
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "finanzas_contabilidad");
  return false;
}

export function canAccessAsicCostos(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "finanzas_asic_costos");
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "finanzas_asic_costos");
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
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b")
    return adminBAllowsModule(user, "equipos") || adminBAllowsModule(user, "equipos_tienda");
  return false;
}

/** Carrito de cotización en /marketplace: cuenta cliente o administradores con módulo pedidos. */
export function canUseMarketplaceQuoteCart(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "cliente" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "marketplace_pedidos");
  return false;
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
  if (user.role === "operador") return true;
  if (user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "exportar");
  return false;
}

/** Gastos garantías / pantallas garantía uso clientes típico. */
export function canAccessGarantiasModule(user: PermUser): boolean {
  if (!user) return false;
  if (user.role === "lector") return lectorAllowsModule(user, "garantias");
  if (user.role === "operador" || user.role === "admin_a") return true;
  if (user.role === "admin_b") return adminBAllowsModule(user, "garantias");
  return false;
}

