export type UserRole = "admin_a" | "admin_b" | "operador" | "lector";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
};

const TOKEN_KEY = "hrs_facturacion_token";
const USER_KEY = "hrs_facturacion_user";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
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
export function canEditFacturacion(role: UserRole): boolean {
  return role === "admin_a" || role === "admin_b" || role === "operador";
}

export function canEditClientes(role: UserRole): boolean {
  return role === "admin_a" || role === "admin_b" || role === "operador";
}

export function canDeleteHistorial(role: UserRole): boolean {
  return role === "admin_a";
}

export function canDeleteClientes(role: UserRole): boolean {
  return role === "admin_a" || role === "admin_b";
}

export function canManageUsers(role: UserRole): boolean {
  return role === "admin_a" || role === "admin_b";
}

/** Solo AdministradorA puede eliminar cuentas con rol AdministradorA o AdministradorB. */
export function canDeleteAdminUser(currentUserRole: UserRole, targetUserRole: string): boolean {
  if (targetUserRole !== "admin_a" && targetUserRole !== "admin_b") return true;
  return currentUserRole === "admin_a";
}

/** Exportar datos (Excel, etc.): admin y operador; lector solo observa en pantalla */
export function canExport(role: UserRole): boolean {
  return role === "admin_a" || role === "admin_b" || role === "operador";
}

