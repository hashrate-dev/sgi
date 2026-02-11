import { getStoredToken, clearStoredAuth } from "./auth.js";
import type { AuthUser } from "./auth.js";

const RAW = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
const API_BASE = (() => {
  const s = typeof RAW === "string" ? RAW.replace(/\/+$/, "") : "";
  if (s) return s;
  if (typeof window !== "undefined") {
    const h = window.location?.hostname ?? "";
    if (h === "localhost" || h === "127.0.0.1") return "";
    if (h.endsWith(".vercel.app")) return "";
  }
  return "";
})();

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location?.hostname ?? "";
  return h === "localhost" || h === "127.0.0.1";
}

function getNoApiMessage(): string {
  if (isLocalHost()) {
    return "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá en la raíz del proyecto: npm run dev";
  }
  return "No se pudo conectar con el servidor. Si el backend está en otro host (Render/Vercel), puede tardar en despertar; volvé a intentar.";
}

function get502Message(): string {
  return isLocalHost()
    ? "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá: npm run dev"
    : "El servidor está arrancando (Render tarda ~1 min en despertar). Volvé a intentar en un momento.";
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    throw new Error(getNoApiMessage());
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (token) {
      clearStoredAuth();
      const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
      if (typeof cb === "function") cb();
    }
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada. Volvé a iniciar sesión.");
  }
  if (!res.ok) {
    if (res.status === 502) throw new Error(get502Message());
    if (res.status === 404) throw new Error(getNoApiMessage());
    const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(msg);
  }
  return data as T;
}

export type LoginResponse = { token: string; user: AuthUser };
export type MeResponse = { user: AuthUser };

export function login(username: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function getMe(): Promise<MeResponse> {
  return api<MeResponse>("/api/auth/me");
}

export type UserListItem = { id: number; email: string; role: string; created_at: string };
export type UsersResponse = { users: UserListItem[] };
export type UserResponse = { user: UserListItem };

export function getUsers(): Promise<UsersResponse> {
  return api<UsersResponse>("/api/users");
}

export function createUser(body: { email: string; password: string; role: "admin" | "operador" | "lector" }): Promise<UserResponse> {
  return api<UserResponse>("/api/users", { method: "POST", body: JSON.stringify(body) });
}

export function updateUser(id: number, body: { email?: string; password?: string; role?: "admin" | "operador" | "lector" }): Promise<UserResponse> {
  return api<UserResponse>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteUser(id: number): Promise<void> {
  return api<void>(`/api/users/${id}`, { method: "DELETE" });
}

type ClientFields = { id?: number | string; code: string; name: string; name2?: string; phone?: string; phone2?: string; email?: string; email2?: string; address?: string; address2?: string; city?: string; city2?: string };
export type ClientsResponse = { clients: Array<ClientFields> };
export type ClientResponse = { client: ClientFields };

export function getClients(): Promise<ClientsResponse> {
  return api<ClientsResponse>("/api/clients");
}

export function createClient(body: Omit<ClientFields, "id">): Promise<ClientResponse> {
  return api<ClientResponse>("/api/clients", { method: "POST", body: JSON.stringify(body) });
}

export function updateClient(id: number | string, body: Omit<Partial<ClientFields>, "id" | "code">): Promise<ClientResponse> {
  return api<ClientResponse>(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteClient(id: number | string): Promise<void> {
  return api<void>(`/api/clients/${id}`, { method: "DELETE" });
}

export function deleteAllClients(): Promise<void> {
  return api<void>("/api/clients-all", { method: "DELETE" });
}
