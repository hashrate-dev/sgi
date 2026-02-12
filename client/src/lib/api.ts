import { getStoredToken, clearStoredAuth } from "./auth.js";
import type { AuthUser } from "./auth.js";

const STORAGE_KEY = "hrs_api_url";
const RAW = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
const DEFAULT_RENDER_API = "https://hashrate-api.onrender.com";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const s = typeof stored === "string" ? stored.replace(/\/+$/, "").trim() : "";
  if (s) return s;
  const build = typeof RAW === "string" ? RAW.replace(/\/+$/, "").trim() : "";
  if (build) return build;
  const h = window.location?.hostname ?? "";
  if (h === "localhost" || h === "127.0.0.1") return "";
  if (h.endsWith(".vercel.app")) return DEFAULT_RENDER_API;
  return "";
}

export function setApiBaseUrl(url: string): void {
  const v = url.replace(/\/+$/, "").trim();
  if (typeof window !== "undefined") {
    if (v) window.localStorage.setItem(STORAGE_KEY, v);
    else window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function getApiBaseUrlForDisplay(): string {
  return getApiBase() || "(mismo origen o no configurado)";
}

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location?.hostname ?? "";
  return h === "localhost" || h === "127.0.0.1";
}

function getApiBaseHint(): string {
  const base = getApiBase();
  if (base) return base;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin + " (mismo origen)";
  return "(no configurado)";
}

function getNoApiMessage(): string {
  const hint = getApiBaseHint();
  if (isLocalHost()) {
    return "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá en la raíz del proyecto: npm run dev";
  }
  return `No se pudo conectar con el servidor. (URL: ${hint}). Revisá que el backend en Render esté Live y que CORS_ORIGIN sea https://hashrateapp.vercel.app`;
}

function get502Message(): string {
  return isLocalHost()
    ? "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá: npm run dev"
    : "El servidor está arrancando (Render tarda ~1 min en despertar). Volvé a intentar en un momento.";
}

const RETRY_DELAYS_MS = [0, 4000, 10000];
const FETCH_TIMEOUT_MS = 55000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = getApiBase();
  const url = `${base}${path}`;
  let lastError: Error | null = null;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (i > 0) await delay(RETRY_DELAYS_MS[i]!);
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { ...options, headers }, FETCH_TIMEOUT_MS);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
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
      if (res.status === 502 || res.status === 503) {
        lastError = new Error(get502Message());
        continue;
      }
      if (res.status === 404) {
        lastError = new Error(getNoApiMessage());
        continue;
      }
      const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
      throw new Error(msg);
    }
    return data as T;
  }
  const toThrow = lastError ?? new Error(getNoApiMessage());
  const msg = toThrow.message || "";
  if (msg === "Failed to fetch" || msg === "Load failed" || msg.includes("NetworkError") || msg === "The operation was aborted.") {
    throw new Error(
      `No se pudo conectar con ${getApiBase() || "el servidor"}. Para usar tu backend: entrá a /login?api=TU_URL_RENDER (reemplazá TU_URL_RENDER por la URL de Render, ej. https://tu-servicio.onrender.com) y volvé a intentar.`
    );
  }
  throw toThrow;
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
