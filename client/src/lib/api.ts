import { getStoredToken, clearStoredAuth } from "./auth.js";
import type { AuthUser } from "./auth.js";

// Plan A: localStorage, VITE_API_URL, default. Si falla, Plan B: probar URLs de fallback y guardar la que responda (Chrome/Opera sin localStorage).
const STORAGE_KEY = "hrs_api_url";
const RAW = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
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
  /**
   * En localhost: API **directa** al puerto del servidor (p. ej. 8080), no vía proxy de Vite.
   * El proxy de Vite limita el cuerpo (~10MB) y devuelve **413** al guardar equipos con imagen vitrina en JSON (data URL / galería grande).
   * Mismo `hostname` que la página (`localhost` vs `127.0.0.1`) para que CORS coincida con el `Origin` del navegador.
   * Para otra URL/puerto: `VITE_API_URL` o `VITE_API_PORT` en `client/.env`.
   */
  if (h === "localhost" || h === "127.0.0.1") {
    const build = typeof RAW === "string" ? RAW.replace(/\/+$/, "").trim() : "";
    if (build) return build;
    const rawPort = (import.meta.env.VITE_API_PORT ?? "").trim();
    const p = /^\d+$/.test(rawPort) ? rawPort : "8080";
    return `http://${h}:${p}`;
  }
  // *.vercel.app y app.hashrate.space: API en mismo origen (Vercel serverless + Supabase). Sin CORS.
  if (h.endsWith(".vercel.app")) return "";
  if (h === "app.hashrate.space") return "";
  // sgi.hashrate.space: backend en Render (dominio custom distinto)
  if (h === "sgi.hashrate.space") return SGI_RENDER_API;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const s = typeof stored === "string" ? stored.replace(/\/+$/, "").trim() : "";
  if (s) return s;
  const build = typeof RAW === "string" ? RAW.replace(/\/+$/, "").trim() : "";
  if (build) return build;
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

/** En Vercel / app.hashrate.space: warmup (DB+app). En Render: health. Retorna Promise que resuelve cuando el backend está listo. */
export function wakeUpBackend(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const h = window.location?.hostname ?? "";
  if (h.endsWith(".vercel.app") || h === "app.hashrate.space") {
    return fetch("/api/warmup", { method: "GET", keepalive: true })
      .then(() => {})
      .catch(() => {});
  }
  if (h !== "sgi.hashrate.space") return Promise.resolve();
  const base = getApiBase();
  if (!base) return Promise.resolve();
  return fetch(`${base}/api/health`, { method: "GET", keepalive: true }).then(() => {}).catch(() => {});
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
  if (h.endsWith(".vercel.app") || h === "app.hashrate.space") {
    return "No se pudo conectar con la API. Esperá unos segundos (cold start) y volvé a intentar.";
  }
  if (h === "sgi.hashrate.space") {
    return "No se pudo conectar con el backend en Render. Verificá que el servicio esté activo en dashboard.render.com.";
  }
  return "No se pudo conectar con el servidor. Volvé a intentar en unos momentos.";
}

function get502Message(): string {
  if (isLocalHost()) {
    return "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá: npm run dev";
  }
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (h.endsWith(".vercel.app") || h === "app.hashrate.space") {
    return "La API está iniciando (cold start). Esperá 30-60 segundos y volvé a intentar.";
  }
  if (h === "sgi.hashrate.space") {
    return "El backend en Render está tardando en responder. Si estaba dormido, esperá 30-60 segundos.";
  }
  return "No se pudo conectar con el servidor. Volvé a intentar en unos momentos.";
}

const RETRY_DELAYS_MS = [0, 6000, 15000, 25000];
const FETCH_TIMEOUT_MS = 60000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

/** Error HTTP de la API (status y code opcional del JSON) para manejo en UI (ej. registro duplicado). */
export type ApiHttpError = Error & { status?: number; code?: string };

export const API_ERROR_EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED";
/** Marketplace: ya hay una consulta en curso para esta cuenta (una orden activa). */
export const API_ERROR_ONE_ACTIVE_ORDER = "ONE_ACTIVE_ORDER";

function makeApiError(message: string, status: number, code?: string): ApiHttpError {
  const e = new Error(message) as ApiHttpError;
  e.status = status;
  if (code) e.code = code;
  return e;
}

/** Mensaje desde JSON de error heterogéneo; evita toasts vacíos cuando `statusText` viene vacío (p. ej. HTTP/2). */
function extractJsonErrorMessage(data: unknown, res: Response, fallback: string): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const nested = o.error;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    if (nested && typeof nested === "object") {
      const m = (nested as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
    const top = o.message;
    if (typeof top === "string" && top.trim()) return top.trim();
  }
  const st = (res.statusText ?? "").trim();
  if (st) return st;
  if (res.status) return `${fallback} (HTTP ${res.status}).`;
  return fallback;
}

/**
 * Conflicto al registrar cliente: correo ya en `users` (misma BD que el SGI).
 * Acepta 409 sin `code` por compatibilidad con despliegues anteriores.
 */
export function isEmailAlreadyRegisteredError(err: unknown): boolean {
  const e = err as ApiHttpError;
  if (e?.status !== 409) return false;
  return !e.code || e.code === API_ERROR_EMAIL_ALREADY_REGISTERED;
}

export function isOneActiveOrderError(err: unknown): boolean {
  const e = err as ApiHttpError;
  return e?.status === 409 && e?.code === API_ERROR_ONE_ACTIVE_ORDER;
}

/** Error local (misma semántica que 409 ONE_ACTIVE_ORDER del servidor). */
export function oneActiveOrderClientError(message?: string): ApiHttpError {
  return makeApiError(
    message ?? "Ya tenés una consulta en curso. Cancelala en «Mis órdenes» para armar un carrito nuevo.",
    409,
    API_ERROR_ONE_ACTIVE_ORDER
  );
}

/** Fetch sin reintentos ni timeouts largos. Para endpoints que no deben colgar la UI (ej. actividad). */
async function apiNoRetry<T>(path: string, timeoutMs = 10000): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (h.endsWith(".vercel.app") || h === "app.hashrate.space") base = "";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  const res = await fetchWithTimeout(url, { method: "GET", headers, credentials: "include" }, timeoutMs);
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (token) {
      clearStoredAuth();
      const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
      if (typeof cb === "function") cb();
    }
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message ?? res.statusText);
  return data as T;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  // *.vercel.app y app.hashrate.space: mismo origen (API serverless en Vercel). Sin CORS.
  if (h.endsWith(".vercel.app") || h === "app.hashrate.space") {
    base = "";
  }
  // base vacío = mismo origen (ej. Vercel: front + API en mismo dominio)
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !h.endsWith(".vercel.app") && h !== "app.hashrate.space") {
    throw new Error(getNoApiMessage());
  }
  // Debug: log la URL que estamos usando
  if (typeof window !== "undefined" && window.location?.hostname === "sgi-hrs.vercel.app") {
    console.log("[API] URL:", url, "| Base:", base, "| Path:", path);
  }
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
        const hostErr = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
        if (hostErr === "sgi-hrs.vercel.app" || hostErr === "sgi.hashrate.space") {
          lastError = new Error("No se pudo conectar con el backend en Render. Verificá que el servicio sistema-gestion-interna esté activo en dashboard.render.com (si está dormido, esperá 1 minuto y reintentá).");
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
        const payload = data as { error?: { message?: string; code?: string } };
        const msg = payload?.error?.message ?? "Recurso no encontrado";
        throw makeApiError(msg, 404, payload?.error?.code);
      }
      const payload = data as { error?: { message?: string; code?: string } };
      const msg = payload?.error?.message ?? res.statusText;
      throw makeApiError(msg, res.status, payload?.error?.code);
    }
    return data as T;
  }
  const msg = lastError?.message || "";
  const isConnectionError = msg === "Failed to fetch" || msg === "Load failed" || msg.includes("NetworkError") || msg === "The operation was aborted." || msg === get502Message() || msg === getNoApiMessage();
  const host = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  // Solo intentar fallbacks en sgi.hashrate.space (Render). app.hashrate.space usa API en mismo origen, no hay fallback.
  if (isConnectionError && host === "sgi.hashrate.space") {
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
          const payload = data as { error?: { message?: string; code?: string } };
          const errMsg = payload?.error?.message ?? res.statusText;
          throw makeApiError(errMsg, res.status, payload?.error?.code);
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

/** Registro tienda: crea usuario rol `cliente` + registro en tabla `clients`. */
export function registerMarketplaceCliente(body: {
  email: string;
  password: string;
  nombre: string;
  apellidos: string;
  documentoIdentidad: string;
  country: string;
  city: string;
  direccion: string;
  celular: string;
  telefono?: string;
}): Promise<LoginResponse> {
  return api<LoginResponse>("/api/auth/register-cliente", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export type UserListItem = { id: number; email: string; role: string; created_at: string; usuario?: string };
export type UsersResponse = { users: UserListItem[] };
export type UserResponse = { user: UserListItem };

export function getUsers(): Promise<UsersResponse> {
  return api<UsersResponse>("/api/users");
}

/** Crea/actualiza filas `clients` (A9…) para todos los usuarios con rol cliente (repara desalineaciones). */
export function syncTiendaOnlineClientsFromUsers(): Promise<{ ok: boolean; synced: number }> {
  return api<{ ok: boolean; synced: number }>("/api/users/sync-tienda-online-clients", { method: "POST" });
}

export function createUser(body: {
  email: string;
  password: string;
  role: "admin_a" | "admin_b" | "operador" | "lector" | "cliente";
  usuario?: string;
}): Promise<UserResponse> {
  return api<UserResponse>("/api/users", { method: "POST", body: JSON.stringify(body) });
}

export function updateUser(
  id: number,
  body: {
    email?: string;
    password?: string;
    role?: "admin_a" | "admin_b" | "operador" | "lector" | "cliente";
    usuario?: string;
  }
): Promise<UserResponse> {
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
  return apiNoRetry<UsersActivityResponse>(`/api/users/activity${q}`, 12000);
}

export type EquipoAsicAuditDelta = { label: string; before: string; after: string };
export type EquipoAsicAuditEntry = {
  id: number;
  created_at: string;
  user_id: number;
  user_email: string;
  user_usuario?: string;
  equipo_id?: string;
  codigo_producto?: string;
  action: string;
  summary: string;
  details_json?: string;
  deltas?: EquipoAsicAuditDelta[];
  flags?: string[];
};
export type EquiposAsicAuditStats = {
  grandTotal: number;
  last24h: number;
  last7d: number;
  byAction: Record<string, number>;
};
export type EquiposAsicAuditResponse = {
  entries: EquipoAsicAuditEntry[];
  total: number;
  limit: number;
  offset: number;
  stats: EquiposAsicAuditStats;
};

export function getEquiposAsicAudit(params?: {
  limit?: number;
  offset?: number;
  q?: string;
  action?: string;
  from?: string;
  to?: string;
}): Promise<EquiposAsicAuditResponse> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.action?.trim()) qs.set("action", params.action.trim());
  if (params?.from?.trim()) qs.set("from", params.from.trim());
  if (params?.to?.trim()) qs.set("to", params.to.trim());
  const q = qs.toString();
  return apiNoRetry<EquiposAsicAuditResponse>(`/api/users/equipos-asic-audit${q ? `?${q}` : ""}`, 20000);
}

export function logoutApi(): Promise<void> {
  return api<void>("/api/auth/logout", { method: "POST" });
}

type ClientFields = {
  id?: number | string;
  code: string;
  name: string;
  name2?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  email2?: string;
  address?: string;
  address2?: string;
  city?: string;
  city2?: string;
  usuario?: string;
  documento_identidad?: string;
  country?: string;
};
export type ClientsResponse = { clients: Array<ClientFields> };
export type ClientResponse = { client: ClientFields };

export function getClients(): Promise<ClientsResponse> {
  return api<ClientsResponse>("/api/clients");
}

export function createClient(body: Omit<ClientFields, "id">): Promise<ClientResponse> {
  return api<ClientResponse>("/api/clients", { method: "POST", body: JSON.stringify(body) });
}

export type ClientsBulkResponse = { inserted: number; skipped: number; errors: number; insertedClients: Array<{ code: string; name: string }>; skippedCodes: string[]; errorMessages: string[] };
export function createClientsBulk(clients: Array<Omit<ClientFields, "id">>): Promise<ClientsBulkResponse> {
  return api<ClientsBulkResponse>("/api/clients/bulk", { method: "POST", body: JSON.stringify({ clients }) });
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

/** Crear factura/recibo/NC en la base de datos (numeración única, no se repiten). */
export type InvoiceCreateBody = {
  number?: string; /* opcional: el servidor genera el número */
  type: "Factura" | "Recibo" | "Nota de Crédito";
  clientName: string;
  date: string;
  month: string;
  subtotal: number;
  discounts: number;
  total: number;
  items: Array<{ service: string; month: string; quantity: number; price: number; discount: number }>;
  relatedInvoiceId?: string;
  relatedInvoiceNumber?: string;
  paymentDate?: string;
  emissionTime?: string;
  dueDate?: string;
  source?: "hosting" | "asic";
};
export type InvoiceCreateResponse = { invoice: { id: number; number: string; type: string; clientName: string; date: string; month: string; subtotal: number; discounts: number; total: number } };

export function createInvoice(body: InvoiceCreateBody): Promise<InvoiceCreateResponse> {
  return api<InvoiceCreateResponse>("/api/invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Listar facturas/recibos/NC desde la base de datos (filtros opcionales). */
export type InvoicesListResponse = { invoices: Array<{ id: number; number: string; type: string; clientName: string; date: string; month: string; subtotal: number; discounts: number; total: number; relatedInvoiceId?: number; relatedInvoiceNumber?: string; paymentDate?: string; emissionTime?: string; dueDate?: string; source?: string }> };

export function getInvoices(params?: { client?: string; type?: "Factura" | "Recibo" | "Nota de Crédito"; month?: string; source?: "hosting" | "asic" }): Promise<InvoicesListResponse> {
  const sp = new URLSearchParams();
  if (params?.client) sp.set("client", params.client);
  if (params?.type) sp.set("type", params.type);
  if (params?.month) sp.set("month", params.month);
  if (params?.source) sp.set("source", params.source);
  const q = sp.toString();
  return api<InvoicesListResponse>(`/api/invoices${q ? `?${q}` : ""}`);
}

/** Obtener una factura por id con sus ítems (para recibo/NC). */
export type InvoiceWithItemsResponse = {
  invoice: {
    id: number;
    number: string;
    type: string;
    clientName: string;
    date: string;
    month: string;
    subtotal: number;
    discounts: number;
    total: number;
    relatedInvoiceId?: number;
    relatedInvoiceNumber?: string;
    paymentDate?: string;
    emissionTime?: string;
    dueDate?: string;
    source?: string;
    items: Array<{ service: string; month: string; quantity: number; price: number; discount: number }>;
  };
};

export function getInvoiceById(id: number): Promise<InvoiceWithItemsResponse> {
  return api<InvoiceWithItemsResponse>(`/api/invoices/${id}`);
}

/** Eliminar una factura por id (solo admin_a, admin_b). */
export function deleteInvoice(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/invoices/${id}`, { method: "DELETE" });
}

/** Eliminar todas las facturas (solo admin_a). source opcional: hosting|asic. */
export function deleteAllInvoices(source?: "hosting" | "asic"): Promise<{ ok: boolean; deleted: number }> {
  const q = source ? `?source=${encodeURIComponent(source)}` : "";
  return api<{ ok: boolean; deleted: number }>(`/api/invoices/all${q}`, { method: "DELETE" });
}

/** Siguiente número para Factura / Recibo / Nota de Crédito (generado en el servidor). */
export type NextInvoiceNumberResponse = { number: string };

export function getNextInvoiceNumber(
  type: "Factura" | "Recibo" | "Nota de Crédito",
  options?: { peek?: boolean }
): Promise<NextInvoiceNumberResponse> {
  const peek = options?.peek ? "&peek=1" : "";
  return api<NextInvoiceNumberResponse>(`/api/invoices/next-number?type=${encodeURIComponent(type)}${peek}`);
}

/** Documentos emitidos (hosting o asic), últimos ~15 días desde el servidor */
export type EmittedDocumentsResponse = { items: Array<{ invoice: Record<string, unknown>; emittedAt: string }> };

export function getEmittedDocuments(source: "hosting" | "asic"): Promise<EmittedDocumentsResponse> {
  return api<EmittedDocumentsResponse>(`/api/emitted?source=${encodeURIComponent(source)}`);
}

export function addEmittedDocument(
  source: "hosting" | "asic",
  invoice: Record<string, unknown>,
  emittedAt: string
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/emitted", {
    method: "POST",
    body: JSON.stringify({ source, invoice, emittedAt }),
  });
}

/** Borrar un documento emitido por número (al eliminar ese documento del historial) */
export function deleteEmittedDocumentOne(source: "hosting" | "asic", invoiceNumber: string): Promise<{ ok: boolean; deleted: number }> {
  return api<{ ok: boolean; deleted: number }>(
    `/api/emitted/${encodeURIComponent(source)}/${encodeURIComponent(invoiceNumber)}`,
    { method: "DELETE" }
  );
}

/** Borrar todos los documentos emitidos de un origen (al eliminar todo el historial) */
export function deleteEmittedDocumentsAll(source: "hosting" | "asic"): Promise<{ ok: boolean; deleted: number }> {
  return api<{ ok: boolean; deleted: number }>(`/api/emitted?source=${encodeURIComponent(source)}`, { method: "DELETE" });
}

// ——— Garantías ANDE ———
export type GarantiasEmittedResponse = { items: Array<{ invoice: Record<string, unknown>; emittedAt: string }> };

export function getGarantiasEmitted(): Promise<GarantiasEmittedResponse> {
  return api<GarantiasEmittedResponse>("/api/garantias/emitted");
}

/** Siguiente número para Recibo / Recibo Devolución (generado en el servidor). peek=1 no consume. */
export function getNextGarantiaNumber(
  type: "Recibo" | "Recibo Devolución",
  options?: { peek?: boolean }
): Promise<{ number: string }> {
  const peek = options?.peek ? "&peek=1" : "";
  return api<{ number: string }>(`/api/garantias/next-number?type=${encodeURIComponent(type)}${peek}`);
}

export function addGarantiaEmitted(
  invoice: Record<string, unknown>,
  emittedAt: string,
  options?: { preserveNumber?: boolean }
): Promise<{ ok: boolean; number?: string }> {
  return api<{ ok: boolean; number?: string }>("/api/garantias/emitted", {
    method: "POST",
    body: JSON.stringify({ invoice, emittedAt, preserveNumber: options?.preserveNumber ?? false }),
  });
}

export function deleteGarantiaEmittedOne(invoiceNumber: string): Promise<{ ok: boolean; deleted: number }> {
  return api<{ ok: boolean; deleted: number }>(
    `/api/garantias/emitted/${encodeURIComponent(invoiceNumber)}`,
    { method: "DELETE" }
  );
}

export function deleteGarantiasEmittedAll(): Promise<{ ok: boolean; deleted: number }> {
  return api<{ ok: boolean; deleted: number }>("/api/garantias/emitted", { method: "DELETE" });
}

export type GarantiasItemsResponse = { items: import("./types.js").ItemGarantiaAnde[] };

export function getGarantiasItems(): Promise<GarantiasItemsResponse> {
  return api<GarantiasItemsResponse>("/api/garantias/items");
}

export function createGarantiaItem(item: import("./types.js").ItemGarantiaAnde): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/garantias/items", { method: "POST", body: JSON.stringify(item) });
}

export function updateGarantiaItem(
  id: string,
  item: Partial<Omit<import("./types.js").ItemGarantiaAnde, "id">>
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/garantias/items/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(item),
  });
}

export function deleteGarantiaItem(id: string): Promise<void> {
  return api<void>(`/api/garantias/items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function deleteGarantiasItemsAll(): Promise<{ ok: boolean; deleted: number }> {
  return api<{ ok: boolean; deleted: number }>("/api/garantias/items", { method: "DELETE" });
}

export type GarantiaPrecioHistorialEntry = { precioUsd: number; actualizadoEn: string };
export type GarantiaPrecioHistorialResponse = { entries: GarantiaPrecioHistorialEntry[] };

export function getGarantiaItemPrecioHistorial(id: string): Promise<GarantiaPrecioHistorialResponse> {
  return api<GarantiaPrecioHistorialResponse>(
    `/api/garantias/items/${encodeURIComponent(id)}/precio-historial`,
    { cache: "no-store" }
  );
}

// ——— Setups (backend) ———
export type SetupsResponse = { items: import("./types.js").Setup[] };

export function getSetups(): Promise<SetupsResponse> {
  return api<SetupsResponse>("/api/setups", { cache: "no-store" });
}

export function createSetup(data: { nombre: string; precioUSD: number }): Promise<{ ok: boolean; id: string }> {
  return api<{ ok: boolean; id: string }>("/api/setups", { method: "POST", body: JSON.stringify(data) });
}

export function updateSetup(id: string, data: { nombre: string; precioUSD: number }): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/setups/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteSetup(id: string): Promise<void> {
  return api<void>(`/api/setups/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function deleteSetupsAll(): Promise<{ ok: boolean; deletedCount?: number }> {
  return api<{ ok: boolean; deletedCount?: number }>("/api/setups", { method: "DELETE" });
}

// ——— Equipos ASIC (backend) ———
export type EquiposResponse = { items: import("./types.js").EquipoASIC[] };

export function getEquipos(): Promise<EquiposResponse> {
  return api<EquiposResponse>("/api/equipos");
}

/**
 * Sube una imagen para la vitrina ASIC. Devuelve una ruta bajo /images/marketplace-uploads/...
 * (en local el backend escribe en client/public; el front en :5173 la sirve Vite).
 */
export async function uploadMarketplaceAsicImage(file: File): Promise<{ url: string }> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (h.endsWith(".vercel.app") || h === "app.hashrate.space") base = "";
  const pathUrl = "/api/equipos/marketplace-image";
  const url = base && base.trim() !== "" ? `${base}${pathUrl}` : pathUrl;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { method: "POST", body: formData, headers }, FETCH_TIMEOUT_MS);
  } catch (e) {
    const isAbort =
      (e instanceof Error && e.name === "AbortError") ||
      (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError");
    if (isAbort) {
      throw new Error(
        "Tiempo de espera agotado al subir la imagen. Probá con un archivo más chico o revisá la conexión."
      );
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (token) {
      clearStoredAuth();
      const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
      if (typeof cb === "function") cb();
    }
    throw new Error(extractJsonErrorMessage(data, res, "Sesión expirada."));
  }
  if (!res.ok) {
    throw new Error(extractJsonErrorMessage(data, res, "No se pudo subir la imagen"));
  }
  return data as { url: string };
}

/** Catálogo ASIC para /marketplace (público, sin auth). */
export function getMarketplaceAsicVitrina(): Promise<{ products: import("./marketplaceAsicCatalog.js").AsicProduct[] }> {
  return api<{ products: import("./marketplaceAsicCatalog.js").AsicProduct[] }>("/api/marketplace/asic-vitrina");
}

/** Destacados “Equipos más vendidos” en /marketplace/home (público). */
export function getMarketplaceCorpBestSelling(): Promise<{ products: import("./marketplaceAsicCatalog.js").AsicProduct[] }> {
  return api<{ products: import("./marketplaceAsicCatalog.js").AsicProduct[] }>("/api/marketplace/corp-best-selling", {
    cache: "no-store",
  });
}

/** IDs destacados home corporativa (auth). */
export function getEquiposMarketplaceCorpBestSellingIds(): Promise<{ ids: string[] }> {
  return api<{ ids: string[] }>("/api/equipos/marketplace-corp-best-selling", { cache: "no-store" });
}

/** Guardar destacados (solo admin A/B en backend). */
export function putEquiposMarketplaceCorpBestSelling(body: { ids: string[] }): Promise<{ ok: boolean; ids: string[] }> {
  return api<{ ok: boolean; ids: string[] }>("/api/equipos/marketplace-corp-best-selling", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** «Otros Productos Interesantes» en /marketplace/home (público, hasta 4 ítems). */
export function getMarketplaceCorpInteresting(): Promise<{ products: import("./marketplaceAsicCatalog.js").AsicProduct[] }> {
  return api<{ products: import("./marketplaceAsicCatalog.js").AsicProduct[] }>("/api/marketplace/corp-interesting", {
    cache: "no-store",
  });
}

export function getEquiposMarketplaceCorpInterestingIds(): Promise<{ ids: string[] }> {
  return api<{ ids: string[] }>("/api/equipos/marketplace-corp-interesting", { cache: "no-store" });
}

export function putEquiposMarketplaceCorpInteresting(body: { ids: string[] }): Promise<{ ok: boolean; ids: string[] }> {
  return api<{ ok: boolean; ids: string[] }>("/api/equipos/marketplace-corp-interesting", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Precios setup cotización: S02 (equipo completo) + S03 (fracción hashrate).
 * Público — mismo origen que la vitrina.
 */
export function getMarketplaceSetupQuotePrices(): Promise<{
  setupEquipoCompletoUsd: number;
  setupCompraHashrateUsd: number;
}> {
  return api<{ setupEquipoCompletoUsd: number; setupCompraHashrateUsd: number }>(
    "/api/marketplace/setup-quote-prices"
  );
}

/** Ítems con precio garantía ANDE (misma BD que /equipos-asic/items-garantia). Público. */
export function getMarketplaceGarantiaQuotePrices(): Promise<{
  items: Array<{ codigo: string; marca: string; modelo: string; precioGarantia: number }>;
}> {
  return api<{ items: Array<{ codigo: string; marca: string; modelo: string; precioGarantia: number }> }>(
    "/api/marketplace/garantia-quote-prices"
  );
}

/**
 * Solo S03 (compatibilidad). Preferir getMarketplaceSetupQuotePrices.
 */
export function getMarketplaceSetupCompraHashrateUsd(): Promise<{ precioUSD: number }> {
  return api<{ precioUSD: number }>("/api/marketplace/setup-compra-hashrate-usd");
}

export type MarketplaceAsicLiveYield = { id: string; line1: string; line2: string; note: string };

/** Rendimiento estimado en vivo (red + CoinGecko, tipo WhatToMine). Público, sin auth. */
export function postMarketplaceAsicYields(
  items: Array<{
    id: string;
    algo: "sha256" | "scrypt";
    hashrate: string;
    detailRows?: Array<{ icon: string; text: string }>;
  }>
): Promise<{ ok: boolean; yields: MarketplaceAsicLiveYield[]; networkOk: boolean }> {
  return api<{ ok: boolean; yields: MarketplaceAsicLiveYield[]; networkOk: boolean }>("/api/marketplace/asic-yields", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export type EquipoMarketplacePayload = {
  marketplaceVisible?: boolean;
  marketplaceAlgo?: "sha256" | "scrypt" | null;
  marketplaceHashrateDisplay?: string | null;
  marketplaceImageSrc?: string | null;
  marketplaceGalleryJson?: string | null;
  marketplaceDetailRowsJson?: string | null;
  marketplaceYieldJson?: string | null;
  marketplaceSortOrder?: number;
  marketplacePriceLabel?: string | null;
  /** null = automático (heurística); solo aplica con tienda visible. */
  marketplaceListingKind?: "miner" | "infrastructure" | null;
};

export function createEquipo(
  data: {
    fechaIngreso?: string;
    marcaEquipo: string;
    modelo: string;
    procesador: string;
    precioUSD?: number;
    observaciones?: string;
    precioActualizadoEn?: string | null;
    precioHistorialJson?: string | null;
  } & EquipoMarketplacePayload
): Promise<{ ok: boolean; id: string; numeroSerie: string; fechaIngreso: string }> {
  return api<{ ok: boolean; id: string; numeroSerie: string; fechaIngreso: string }>("/api/equipos", {
    method: "POST",
    body: JSON.stringify({ ...data, precioUSD: data.precioUSD ?? 0 }),
  });
}

export function updateEquipo(
  id: string,
  data: {
    fechaIngreso: string;
    marcaEquipo: string;
    modelo: string;
    procesador: string;
    precioUSD?: number;
    observaciones?: string;
    precioActualizadoEn?: string | null;
  } & EquipoMarketplacePayload
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/equipos/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ ...data, precioUSD: data.precioUSD ?? 0 }),
  });
}

export function deleteEquipo(id: string): Promise<void> {
  return api<void>(`/api/equipos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type EquipoWhatToMineYield = {
  line1: string;
  line2: string;
  source: string;
  electricityUsdPerKwh: number;
  note: string;
};

/** Estimación WhatToMine (0,078 USD/kWh) para detalle de equipo. Requiere sesión. */
export function getEquipoWhatToMineYield(id: string): Promise<{
  ok: boolean;
  yield: EquipoWhatToMineYield | null;
  hint?: string;
}> {
  return apiNoRetry(`/api/equipos/${encodeURIComponent(id)}/whattomine-yield`, 30000);
}

export function deleteEquiposAll(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/equipos", { method: "DELETE" });
}

export function createEquiposBulk(
  items: Array<{
    fechaIngreso: string;
    marcaEquipo: string;
    modelo: string;
    procesador: string;
    precioUSD?: number;
    observaciones?: string;
    numeroSerie?: string;
  }>
): Promise<{ ok: boolean; inserted: number }> {
  return api<{ ok: boolean; inserted: number }>("/api/equipos/bulk", {
    method: "POST",
    body: JSON.stringify(items),
  });
}

export type KryptexWorkerStatus = "activo" | "inactivo" | "desconocido";

export type KryptexWorkerData = {
  name: string;
  hashrate24h: string | null;
  hashrate10m: string | null;
  status: KryptexWorkerStatus;
  poolUrl: string;
  usuario: string;
  modelo: string;
};

export function getKryptexWorkers(forceRefresh = false): Promise<{ workers: KryptexWorkerData[] }> {
  const path = forceRefresh ? "/api/kryptex/workers?refresh=1" : "/api/kryptex/workers";
  return apiNoRetry<{ workers: KryptexWorkerData[] }>(path, 25000);
}

/** Wallet y pool asignados al usuario LECTOR (users.usuario → POOL_CONFIGS). Solo para rol lector. */
export function getKryptexLectorWallet(): Promise<{ wallet: string; pool: string }> {
  return api<{ wallet: string; pool: string }>("/api/kryptex/lector-wallet");
}

export type KryptexPayoutsData = {
  /** Saldo sin confirmar (Unconfirmed Balance en Kryptex Stats) */
  unconfirmed: number;
  unconfirmedUsd: number | null;
  /** Saldo pendiente de pago (Unpaid en Kryptex Payouts) */
  unpaid: number;
  paid: number;
  unpaidUsd: number | null;
  paidUsd: number | null;
  reward7d: number;
  reward30d: number;
  reward7dUsd: number | null;
  reward30dUsd: number | null;
  workers24h: number | null;
  workers: Array<{ name: string; status: "activo" | "inactivo"; hashrate24h: string | null; hashrate10m: string | null; valid: number }>;
  payouts: Array<{ date: string; amount: number; txid: string; status: string }>;
  payoutsUrl: string;
  usuario: string | null;
  /** Datos del gráfico Shares (24h) desde Kryptex (timestamp, value por bucket) */
  sharesChart?: Array<{ timestamp: number; value: number }>;
};

export function getKryptexPayouts(wallet: string, pool: string, forceRefresh = false): Promise<KryptexPayoutsData> {
  const qs = new URLSearchParams({ wallet, pool });
  if (forceRefresh) qs.set("refresh", "1");
  return apiNoRetry(`/api/kryptex/payouts?${qs}`, 15000);
}

export function getKryptexWorkerStatus(workerName: string): Promise<{
  worker: string;
  status: KryptexWorkerStatus;
  hashrate24h?: string | null;
  hashrate10m?: string | null;
}> {
  return apiNoRetry(
    `/api/kryptex/worker/${encodeURIComponent(workerName)}`
  );
}

/* --- Marketplace (tienda interna) --- */

export type MarketplaceProduct = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  priceUsd: number;
  imageUrl: string | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

export function getMarketplaceProducts(opts?: { all?: boolean; category?: string; q?: string }): Promise<{ products: MarketplaceProduct[] }> {
  const qs = new URLSearchParams();
  if (opts?.all) qs.set("all", "1");
  if (opts?.category) qs.set("category", opts.category);
  if (opts?.q) qs.set("q", opts.q);
  const suf = qs.toString();
  return api<{ products: MarketplaceProduct[] }>(`/api/marketplace/products${suf ? `?${suf}` : ""}`);
}

export function createMarketplaceProduct(body: {
  name: string;
  description?: string | null;
  category?: string | null;
  priceUsd: number;
  imageUrl?: string | null;
  stock: number;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<{ ok: boolean; id: number | null }> {
  return api<{ ok: boolean; id: number | null }>("/api/marketplace/products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateMarketplaceProduct(
  id: number,
  body: Partial<{
    name: string;
    description: string | null;
    category: string | null;
    priceUsd: number;
    imageUrl: string | null;
    stock: number;
    isActive: boolean;
    sortOrder: number;
  }>
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/marketplace/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteMarketplaceProduct(id: number): Promise<void> {
  return api<void>(`/api/marketplace/products/${id}`, { method: "DELETE" });
}

export type QuoteSyncLinePayload = {
  productId: string;
  qty: number;
  brand: string;
  model: string;
  hashrate: string;
  priceUsd: number;
  priceLabel: string;
  hashrateSharePct?: 25 | 50 | 75;
  includeSetup?: boolean;
  includeWarranty?: boolean;
};

/** Requiere JWT y rol `cliente` o administrador A/B. */
export function syncMarketplaceQuoteTicket(payload: {
  lines: QuoteSyncLinePayload[];
  event?: "sync" | "contact_email" | "contact_whatsapp" | "submit_ticket";
  /** Si true con lines vacío: vaciar ítems en la orden marketplace en curso (no usar tras generar consulta). */
  clearPipelineCart?: boolean;
}): Promise<{
  ok: boolean;
  cleared?: boolean;
  id?: number;
  orderNumber?: string;
  ticketCode?: string;
  status?: string;
  /** true cuando se actualizó la orden ya en pipeline (no se creó ticket nuevo). */
  merged?: boolean;
  lines?: QuoteSyncLinePayload[];
  subtotalUsd?: number;
  lineCount?: number;
  unitCount?: number;
}> {
  return api("/api/marketplace/quote-sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type MarketplaceQuoteTicketItem = {
  productId?: string;
  qty?: number;
  brand?: string;
  model?: string;
  hashrate?: string;
  priceUsd?: number;
  priceLabel?: string;
  hashrateSharePct?: number;
  includeSetup?: boolean;
  includeWarranty?: boolean;
};

export type MarketplaceQuoteTicket = {
  id: number;
  sessionId: string;
  orderNumber: string | null;
  ticketCode: string;
  status: string;
  subtotalUsd: number;
  lineCount: number;
  unitCount: number;
  createdAt: string;
  updatedAt: string;
  lastContactChannel: string | null;
  contactedAt: string | null;
  notesAdmin: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  userId: number | null;
  contactEmail: string | null;
  items: MarketplaceQuoteTicketItem[];
};

/** Tickets enviados del usuario actual (marketplace). */
export function getMyMarketplaceQuoteTickets(): Promise<{ tickets: MarketplaceQuoteTicket[] }> {
  return api("/api/marketplace/my-quote-tickets");
}

export function getMyMarketplaceQuoteTicket(id: number): Promise<{ ticket: MarketplaceQuoteTicket }> {
  return api(`/api/marketplace/my-quote-tickets/${id}`);
}

/** Eliminar una consulta/orden propia (no borrador). */
export function deleteMyMarketplaceQuoteTicket(id: number): Promise<{ ok: boolean }> {
  return api(`/api/marketplace/my-quote-tickets/${id}`, { method: "DELETE" });
}

/** Cancelar orden en curso (descartado) para poder generar otra desde el carrito. */
export function cancelMyMarketplaceQuoteTicket(id: number): Promise<{ ok: boolean }> {
  return api(`/api/marketplace/my-quote-tickets/${id}/cancel`, { method: "POST" });
}

/** Eliminar todas las consultas/órdenes propias visibles en "mis órdenes" (no borradores). */
export function deleteAllMyMarketplaceQuoteTickets(): Promise<{ ok: boolean; deleted: number }> {
  return api("/api/marketplace/my-quote-tickets", { method: "DELETE" });
}

export function getMarketplaceQuoteTicketsStats(): Promise<{
  byStatus: Record<string, number>;
  total: number;
  todayCount: number;
}> {
  return api("/api/marketplace/quote-tickets-stats");
}

export type MarketplacePresenceViewerType = "anon" | "cliente" | "staff";

export function postMarketplacePresenceHeartbeat(payload: {
  visitorId: string;
  viewerType?: MarketplacePresenceViewerType;
  userEmail?: string;
  countryCode?: string;
  countryName?: string;
  clientIp?: string;
  locale?: string;
  timezone?: string;
  currentPath?: string;
}): Promise<{ ok?: boolean }> {
  return api("/api/marketplace/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMarketplacePresenceStats(): Promise<{
  onlineTotal: number;
  byViewerType: Record<string, number>;
  windowSeconds: number;
  asOf: string;
}> {
  return api("/api/marketplace/presence-stats");
}

export function getMarketplacePresenceLive(): Promise<{
  rows: Array<{
    visitorId: string;
    viewerType: string;
    countryCode: string;
    countryName: string;
    clientIp: string;
    userEmail: string;
    currentPath: string;
    lastSeenAt: string;
  }>;
  countries: Array<{
    countryCode: string;
    countryName: string;
    count: number;
    loggedCount: number;
    anonCount: number;
  }>;
  windowSeconds: number;
  asOf: string;
}> {
  return api("/api/marketplace/presence-live");
}

export function getMarketplaceQuoteTickets(params?: {
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: MarketplaceQuoteTicket[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suf = qs.toString();
  return api(`/api/marketplace/quote-tickets${suf ? `?${suf}` : ""}`);
}

export function getMarketplaceQuoteTicket(id: number): Promise<{ ticket: MarketplaceQuoteTicket }> {
  return api(`/api/marketplace/quote-tickets/${id}`);
}

export function patchMarketplaceQuoteTicket(
  id: number,
  body: { status?: string; notesAdmin?: string | null }
): Promise<{ ticket: MarketplaceQuoteTicket }> {
  return api(`/api/marketplace/quote-tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Panel staff: elimina el ticket de la base (solo admin A/B). */
export function deleteMarketplaceQuoteTicketAdmin(id: number): Promise<{ ok: boolean }> {
  return api(`/api/marketplace/quote-tickets/${id}`, { method: "DELETE" });
}
