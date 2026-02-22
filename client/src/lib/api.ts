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
  // En localhost: backend directo en 8080. Proxy Vite puede fallar con headers; conexión directa más fiable.
  if (h === "localhost" || h === "127.0.0.1") return "http://localhost:8080";
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
        const msg = (data as { error?: { message?: string } })?.error?.message ?? "Recurso no encontrado";
        throw new Error(msg);
      }
      const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
      throw new Error(msg);
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
  return apiNoRetry<UsersActivityResponse>(`/api/users/activity${q}`, 12000);
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

// ——— Setups (backend) ———
export type SetupsResponse = { items: import("./types.js").Setup[] };

export function getSetups(): Promise<SetupsResponse> {
  return api<SetupsResponse>("/api/setups");
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

export function deleteSetupsAll(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/setups", { method: "DELETE" });
}

// ——— Equipos ASIC (backend) ———
export type EquiposResponse = { items: import("./types.js").EquipoASIC[] };

export function getEquipos(): Promise<EquiposResponse> {
  return api<EquiposResponse>("/api/equipos");
}

export function createEquipo(data: {
  fechaIngreso: string;
  marcaEquipo: string;
  modelo: string;
  procesador: string;
  precioUSD?: number;
  observaciones?: string;
}): Promise<{ ok: boolean; id: string; numeroSerie: string }> {
  return api<{ ok: boolean; id: string; numeroSerie: string }>("/api/equipos", {
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
  }
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/equipos/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ ...data, precioUSD: data.precioUSD ?? 0 }),
  });
}

export function deleteEquipo(id: string): Promise<void> {
  return api<void>(`/api/equipos/${encodeURIComponent(id)}`, { method: "DELETE" });
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

export type KryptexPayoutsData = {
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
};

export function getKryptexPayouts(wallet: string, pool: string): Promise<KryptexPayoutsData> {
  return apiNoRetry(`/api/kryptex/payouts?wallet=${encodeURIComponent(wallet)}&pool=${encodeURIComponent(pool)}`, 15000);
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
