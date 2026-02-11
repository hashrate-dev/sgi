export type UserRole = "admin" | "operador" | "lector";

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

/** Admin: todo. Operador: facturación y clientes (sin eliminar). Lector: solo observar, sin operaciones ni eliminar. */
export function canEditFacturacion(role: UserRole): boolean {
  return role === "admin" || role === "operador";
}

export function canEditClientes(role: UserRole): boolean {
  return role === "admin" || role === "operador";
}

export function canDeleteHistorial(role: UserRole): boolean {
  return role === "admin";
}

export function canDeleteClientes(role: UserRole): boolean {
  return role === "admin";
}

export function canManageUsers(role: UserRole): boolean {
  return role === "admin";
}

/** Exportar datos (Excel, etc.): solo admin y operador; lector solo observa en pantalla */
export function canExport(role: UserRole): boolean {
  return role === "admin" || role === "operador";
}

