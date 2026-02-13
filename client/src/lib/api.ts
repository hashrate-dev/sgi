import { getStoredToken, clearStoredAuth } from "./auth.js";
import type { AuthUser } from "./auth.js";

// Plan A: localStorage, VITE_API_URL, default. Si falla, Plan B: probar URLs de fallback y guardar la que responda (Chrome/Opera sin localStorage).
const STORAGE_KEY = "hrs_api_url";
const RAW = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
const DEFAULT_RENDER_API = "https://hashrate-api.onrender.com";
const SGI_RENDER_API = "https://sistema-gestion-interna.onrender.com";
const FALLBACK_API_URLS = [
  "https://sistema-gestion-interna.onrender.com",
  "https://hashrate-api.onrender.com",
  "https://sgi-api.onrender.com",
  "https://hashrate-facturacion-hrs.onrender.com",
  "https://hashrate-app.onrender.com",
];

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location?.hostname ?? "";
  // En sgi-hrs.vercel.app usamos proxy de Vercel: peticiones a /api/* (mismo origen) → sin CORS.
  if (h === "sgi-hrs.vercel.app") return "";
  if (h === "sgi.hashrate.space") return SGI_RENDER_API;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const s = typeof stored === "string" ? stored.replace(/\/+$/, "").trim() : "";
  if (s) return s;
  const build = typeof RAW === "string" ? RAW.replace(/\/+$/, "").trim() : "";
  if (build) return build;
  // En localhost, usar el backend local en el puerto 8080
  if (h === "localhost" || h === "127.0.0.1") return "http://localhost:8080";
  if (h.endsWith(".vercel.app")) return DEFAULT_RENDER_API;
  if (h.endsWith(".hashrate.space")) return SGI_RENDER_API;
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

function getNoApiMessage(): string {
  if (isLocalHost()) {
    return "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá en la raíz del proyecto: npm run dev";
  }
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (h === "sgi-hrs.vercel.app" || h === "sgi.hashrate.space") {
    return "No se pudo conectar con el backend en Render (https://sistema-gestion-interna.onrender.com). Verificá que el servicio esté activo y que CORS permita este origen.";
  }
  return "No se pudo conectar con el servidor. Volvé a intentar en unos momentos.";
}

function get502Message(): string {
  if (isLocalHost()) {
    return "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá: npm run dev";
  }
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (h === "sgi-hrs.vercel.app" || h === "sgi.hashrate.space") {
    return "El backend en Render (https://sistema-gestion-interna.onrender.com) está tardando en responder. Si el servicio estaba dormido, esperá 30-60 segundos y volvé a intentar.";
  }
  return "No se pudo conectar con el servidor. Volvé a intentar en unos momentos.";
}

const RETRY_DELAYS_MS = [0, 4000, 10000];
const FETCH_TIMEOUT_MS = 55000;

let backendUrlFromServer: Promise<string> | null = null;

function getBackendUrlFromVercel(): Promise<string> {
  if (backendUrlFromServer) return backendUrlFromServer;
  backendUrlFromServer = fetch("/api/backend-url", { method: "GET" })
    .then((r) => r.json().then((d: { url?: string }) => (d?.url && typeof d.url === "string" ? d.url.trim().replace(/\/+$/, "") : "")))
    .catch(() => "");
  return backendUrlFromServer;
}

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
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  const useProxy = h === "sgi-hrs.vercel.app";
  // En sgi-hrs usamos proxy (base ""); no pedir URL al servidor. Otros *.vercel.app sí pueden.
  if (typeof window !== "undefined" && !useProxy && (window.location?.hostname?.endsWith(".vercel.app") || window.location?.hostname?.endsWith(".hashrate.space"))) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored || stored.trim() === "") {
      const fromServer = await getBackendUrlFromVercel();
      if (fromServer && fromServer.trim() !== "") {
        setApiBaseUrl(fromServer);
        base = fromServer;
      }
    }
  }
  if ((!base || base.trim() === "") && !useProxy) {
    if (h === "sgi.hashrate.space") {
      throw new Error("No se configuró la URL del backend. Configurá VITE_API_URL=https://sistema-gestion-interna.onrender.com y hacé redeploy.");
    }
    throw new Error(getNoApiMessage());
  }
  const url = base ? `${base}${path}` : path;
  let lastError: Error | null = null;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (i > 0) await delay(RETRY_DELAYS_MS[i]!);
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { ...options, headers }, FETCH_TIMEOUT_MS);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // Detectar errores de CORS (generalmente "Failed to fetch" o "NetworkError")
      if (errMsg === "Failed to fetch" || errMsg.includes("NetworkError") || errMsg === "Load failed") {
        const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
        if (h === "sgi-hrs.vercel.app" || h === "sgi.hashrate.space") {
          lastError = new Error(`Error de conexión con ${base}. Verificá que CORS en Render permita este origen y que el servicio esté activo.`);
        } else {
          lastError = new Error(`Error de conexión: ${errMsg}. Verificá CORS y que el backend esté activo.`);
        }
      } else {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
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
  const msg = lastError?.message || "";
  const isConnectionError = msg === "Failed to fetch" || msg === "Load failed" || msg.includes("NetworkError") || msg === "The operation was aborted." || msg === get502Message() || msg === getNoApiMessage();
  if (isConnectionError && typeof window !== "undefined" && (window.location?.hostname?.endsWith(".vercel.app") || window.location?.hostname?.endsWith(".hashrate.space"))) {
    const currentBase = getApiBase();
    for (const fallback of FALLBACK_API_URLS) {
      if (fallback === currentBase) continue;
      try {
        const res = await fetchWithTimeout(`${fallback}${path}`, { ...options, headers }, FETCH_TIMEOUT_MS);
        const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
        setApiBaseUrl(fallback);
        if (res.status === 401) {
          if (token) {
            clearStoredAuth();
            const cb = (window as unknown as { __on401?: () => void }).__on401;
            if (typeof cb === "function") cb();
          }
          throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada. Volvé a iniciar sesión.");
        }
        if (!res.ok) {
          const errMsg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
          throw new Error(errMsg);
        }
        return data as T;
      } catch (e) {
        /* siguiente fallback */
      }
    }
  }
  if (isConnectionError) throw new Error(getNoApiMessage());
  throw lastError ?? new Error(getNoApiMessage());
}

export type LoginResponse = { token: string; user: AuthUser };
export type MeResponse = { user: AuthUser };

export function login(username: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function getMe(): Promise<MeResponse> {
  return api<MeResponse>("/api/auth/me");
}

/** Verificar contraseña sin cerrar sesión en caso de error 401 */
export async function verifyPassword(password: string): Promise<{ valid: boolean }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = getApiBase();
  const url = `${base}/api/auth/verify-password`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // No cerrar sesión, solo lanzar error
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Contraseña incorrecta");
  }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(msg);
  }
  return data as { valid: boolean };
}

export type UserListItem = { id: number; email: string; role: string; created_at: string };
export type UsersResponse = { users: UserListItem[] };
export type UserResponse = { user: UserListItem };

export function getUsers(): Promise<UsersResponse> {
  return api<UsersResponse>("/api/users");
}

export function createUser(body: { email: string; password: string; role: "admin_a" | "admin_b" | "operador" | "lector" }): Promise<UserResponse> {
  return api<UserResponse>("/api/users", { method: "POST", body: JSON.stringify(body) });
}

export function updateUser(id: number, body: { email?: string; password?: string; role?: "admin_a" | "admin_b" | "operador" | "lector" }): Promise<UserResponse> {
  return api<UserResponse>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

/** Cambiar la contraseña del usuario actual (Operador, Lector o cualquier admin). */
export function updateMyPassword(password: string): Promise<UserResponse> {
  return api<UserResponse>("/api/users/me", { method: "PUT", body: JSON.stringify({ password }) });
}

export function deleteUser(id: number): Promise<void> {
  return api<void>(`/api/users/${id}`, { method: "DELETE" });
}

export type ActivityItem = {
  id: number;
  user_id: number;
  user_email: string;
  event: "login" | "logout";
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  duration_seconds?: number;
};
export type UsersActivityResponse = { activity: ActivityItem[] };

export function getUsersActivity(limit?: number): Promise<UsersActivityResponse> {
  const q = limit != null ? `?limit=${limit}` : "";
  return api<UsersActivityResponse>(`/api/users/activity${q}`);
}

export function logoutApi(): Promise<void> {
  return api<void>("/api/auth/logout", { method: "POST" });
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
