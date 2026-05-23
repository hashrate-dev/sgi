import { getStoredToken, clearStoredAuth } from "./auth.js";
import type { AuthUser } from "./auth.js";
import {
  isPrimaryPublicHost,
  isSgiAdminHost,
  isVercelOrPrimaryPublicHost,
  PRODUCTION_SITE_ORIGIN,
} from "./hashrateHosts.js";
import { writeMarketplaceVitrinaCache } from "./marketplaceVitrinaCache.js";
import { NH_WATCHER_HASH_SAMPLE_MS } from "./nicehashWatcherRigHashrateHistory.js";

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

export function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location?.hostname ?? "";
  /**
   * En localhost: API **directa** al puerto del servidor (p. ej. 8080), no vía proxy de Vite.
   * El proxy de Vite limita el cuerpo (~10MB) y devuelve **413** al guardar equipos con imagen vitrina en JSON (data URL / galería grande).
   * Mismo `hostname` que la página (`localhost` vs `127.0.0.1`) para que CORS coincida con el `Origin` del navegador.
   * Para otra URL/puerto: `VITE_API_URL` o `VITE_API_PORT` en `client/.env`.
   * Para mismos datos que producción: `VITE_USE_HASHRATE_SPACE_API=1` (o legacy `VITE_USE_APP_HASHRATE_SPACE_API`) o `VITE_API_URL=https://hashrate.space`.
   */
  if (h === "localhost" || h === "127.0.0.1") {
    const build = typeof RAW === "string" ? RAW.replace(/\/+$/, "").trim() : "";
    if (build) return build;
    /** Misma API/BD que producción (usuarios, etc.); CORS en producción ya permite localhost:5173. */
    const useProd = String(
      import.meta.env.VITE_USE_HASHRATE_SPACE_API ?? import.meta.env.VITE_USE_APP_HASHRATE_SPACE_API ?? ""
    ).trim();
    if (useProd === "1" || /^true$/i.test(useProd)) {
      return PRODUCTION_SITE_ORIGIN;
    }
    const rawPort = (import.meta.env.VITE_API_PORT ?? "").trim();
    const p = /^\d+$/.test(rawPort) ? rawPort : "8080";
    return `http://${h}:${p}`;
  }
  // *.vercel.app y hashrate.space (apex): API en mismo origen (Vercel serverless + Supabase). Sin CORS.
  if (isVercelOrPrimaryPublicHost(h)) return "";
  // sgi.hashrate.space: backend en Render (dominio custom distinto)
  if (isSgiAdminHost(h)) return SGI_RENDER_API;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const s = typeof stored === "string" ? stored.replace(/\/+$/, "").trim() : "";
  if (s) return s;
  const build = typeof RAW === "string" ? RAW.replace(/\/+$/, "").trim() : "";
  if (build) return build;
  if (h.endsWith(".hashrate.space") && !isPrimaryPublicHost(h)) return SGI_RENDER_API;
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

/**
 * Despierta el backend lo antes posible (sin bloquear la UI): mismo origen `/api/warmup`,
 * API explícita en Render (`sgi.hashrate.space`), o `/api/health` si el front es localhost y `VITE_API_URL` apunta al servidor.
 */
export function wakeUpBackend(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const h = window.location?.hostname ?? "";
  const baseRaw = (getApiBase() ?? "").trim().replace(/\/+$/, "");
  if (isVercelOrPrimaryPublicHost(h)) {
    return fetch("/api/warmup", { method: "GET", keepalive: true })
      .then(() => {})
      .catch(() => {});
  }
  if (h === "sgi.hashrate.space") {
    if (!baseRaw) return Promise.resolve();
    return fetch(`${baseRaw}/api/health`, { method: "GET", keepalive: true }).then(() => {}).catch(() => {});
  }
  if ((h === "localhost" || h === "127.0.0.1") && baseRaw) {
    return fetch(`${baseRaw}/api/health`, { method: "GET", keepalive: true }).then(() => {}).catch(() => {});
  }
  return Promise.resolve();
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
  if (isVercelOrPrimaryPublicHost(h)) {
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
  if (isVercelOrPrimaryPublicHost(h)) {
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
  const t = setTimeout(() => {
    try {
      ac.abort(new DOMException("Tiempo de espera agotado. Volvé a intentar.", "TimeoutError"));
    } catch {
      ac.abort();
    }
  }, timeoutMs);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

/** Petición cancelada (cierre de pestaña, recarga, HMR, o efecto React invalidado): no conviene mostrar toast con el mensaje crudo del motor. */
export function isBenignFetchAbort(err: unknown): boolean {
  if (err instanceof DOMException) {
    if (err.name === "TimeoutError") return false;
    if (err.name === "AbortError") {
      const m = (err.message || "").toLowerCase();
      return !m.includes("tiempo de espera");
    }
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("tiempo de espera")) return false;
    return m.includes("signal is aborted") || m.includes("the operation was aborted");
  }
  return false;
}

/** Error HTTP de la API (status y code opcional del JSON) para manejo en UI (ej. registro duplicado). */
export type ApiHttpError = Error & { status?: number; code?: string };

export const API_ERROR_EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED";
/** Reset de contraseña: correo no registrado en `users`. */
export const API_ERROR_INVALID_EMAIL = "INVALID_EMAIL";
export const API_ERROR_DOCUMENT_ALREADY_REGISTERED = "DOCUMENT_ALREADY_REGISTERED";
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
  if (e.code === API_ERROR_EMAIL_ALREADY_REGISTERED) return true;
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("correo electrónico") && msg.includes("asociado a una cuenta");
}

export function isDocumentAlreadyRegisteredError(err: unknown): boolean {
  const e = err as ApiHttpError;
  if (e?.status !== 409) return false;
  if (e.code === API_ERROR_DOCUMENT_ALREADY_REGISTERED) return true;
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("documento") || msg.includes("cédula") || msg.includes("cedula");
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
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  const res = await fetchWithTimeout(url, { method: "GET", headers, credentials: "include" }, timeoutMs);
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message ?? res.statusText);
  return data as T;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((options?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  // *.vercel.app y hashrate.space: mismo origen (API serverless en Vercel). Sin CORS.
  if (isVercelOrPrimaryPublicHost(h)) {
    base = "";
  }
  // base vacío = mismo origen (ej. Vercel: front + API en mismo dominio)
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !isVercelOrPrimaryPublicHost(h)) {
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
      res = await fetchWithTimeout(
        url,
        { credentials: (options as RequestInit | undefined)?.credentials ?? "include", ...options, headers },
        FETCH_TIMEOUT_MS
      );
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
      clearStoredAuth();
      const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
      if (typeof cb === "function") cb();
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
  // Solo intentar fallbacks en sgi.hashrate.space (Render). hashrate.space usa API en mismo origen, no hay fallback.
  if (isConnectionError && host === "sgi.hashrate.space") {
    const currentBase = getApiBase();
    for (const fallback of FALLBACK_API_URLS) {
      if (fallback === currentBase) continue;
      try {
        const res = await fetchWithTimeout(
          `${fallback}${path}`,
          { credentials: (options as RequestInit | undefined)?.credentials ?? "include", ...options, headers },
          FETCH_TIMEOUT_MS
        );
        const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
        setApiBaseUrl(fallback);
        if (res.status === 401) {
          clearStoredAuth();
          const cb = (window as unknown as { __on401?: () => void }).__on401;
          if (typeof cb === "function") cb();
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

export type LoginResponse = { user: AuthUser; token?: string };
export type MeResponse = { user: AuthUser };

export function login(username: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

/** Solicita enlace de restablecimiento. Si el correo no está en la BD → 404 `INVALID_EMAIL` / "MAIL INVALIDO". */
export function requestPasswordReset(
  email: string,
  source?: "sgi" | "marketplace",
  lang?: "es" | "en" | "pt"
): Promise<{ ok: boolean; message: string }> {
  return api<{ ok: boolean; message: string }>("/api/auth/password-reset-request", {
    method: "POST",
    body: JSON.stringify({ email, ...(source ? { source } : {}), ...(lang ? { lang } : {}) }),
  });
}

/** Restablece contraseña usando token enviado por email. */
export function confirmPasswordReset(token: string, password: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/auth/password-reset-confirm", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

/** Registro tienda: crea usuario rol `cliente` + registro en tabla `clients`. */
export function registerMarketplaceCliente(body: {
  email: string;
  password: string;
  nombre: string;
  apellidos: string;
  country: string;
  city: string;
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
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const urlNorm = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}/api/auth/verify-password` : "/api/auth/verify-password";
  const res = await fetch(urlNorm, {
    method: "POST",
    headers,
    credentials: "include",
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

/** Respuesta de sincronización Luxor → monitor ASIC (filas con pool Luxor). */
export type LuxorMonitorSyncResultItem = {
  index: number;
  skipped: boolean;
  matched: boolean;
  online: boolean | null;
  luxorStatus?: string | null;
  hashrate?: number | null;
};

export type LuxorSkippedSubaccount = {
  subaccount: string;
  reason: string;
  /** Pool de la API en la que falló la subcuenta (p. ej. BTC vs LTC_DOGE). */
  currencyType?: string;
};

/** Workers serializados desde Luxor (respuesta GET pool/workers). */
export type LuxorWorkerPublic = {
  subaccount_name: string;
  name: string;
  status: string;
  hashrate: number | null;
  efficiency: number | null;
  last_share_time: string | null;
  firmware: string | null;
  id: string | null;
  /** Endpoint Luxor usado para este worker (BTC, LTC_DOGE, …). */
  currency_type?: string | null;
};

export type LuxorMonitorSyncResponse = {
  ok: boolean;
  luxorWorkerCount: number;
  /** Lista completa devuelta por Luxor en la última sincronización. */
  luxorWorkers?: LuxorWorkerPublic[];
  /** Subcuentas que Luxor rechazó por permisos de la API key (se sigue con el resto). */
  skippedSubaccounts?: LuxorSkippedSubaccount[];
  results: LuxorMonitorSyncResultItem[];
  /** Cómo se eligieron las subcuentas a consultar (ver GET /v2/pool/subaccounts en Luxor). */
  luxorSubaccountSync?: "intersection" | "luxor_all" | "local_only";
  luxorDirectorySubCount?: number;
  luxorDirectorySample?: string[];
  luxorDirectoryListingFailed?: boolean;
};

export type LuxorPingResponse = {
  ok: boolean;
  workersOnPage: number;
  totalActive?: number;
  totalInactive?: number;
  /** Texto orientativo (p. ej. ping vía GET /workspace en vez de workers). */
  message?: string;
};

/**
 * Luxor puede tardar (varias páginas de workers); timeout extendido sin reintentos largos.
 */
export async function postLuxorMonitorSync(body: {
  apiKey: string;
  /** Compat: una pool */
  currencyType?: string;
  /** Varias pools en la misma sync (p. ej. BTC + LTC_DOGE). */
  currencyTypes?: string[];
  rows: Array<{ index: number; usuario: string; nombreNuevo: string; pool: string }>;
}): Promise<LuxorMonitorSyncResponse> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = "/api/luxor/monitor-sync";
  const url = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}${path}` : path;
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(body) },
    420000
  );
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = extractJsonErrorMessage(data, res, "Error al sincronizar con Luxor");
    throw makeApiError(msg, res.status);
  }
  return data as LuxorMonitorSyncResponse;
}

export async function postLuxorPing(body: { apiKey: string; currencyType?: string }): Promise<LuxorPingResponse> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = "/api/luxor/ping";
  const url = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}${path}` : path;
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(body) },
    60000
  );
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = extractJsonErrorMessage(data, res, "Error al probar Luxor");
    throw makeApiError(msg, res.status);
  }
  return data as LuxorPingResponse;
}

export type MonitorEquipoAsicHistorialEntry = {
  id: number;
  body: string;
  createdAt: string;
  createdByEmail: string;
};

/** Entrada del feed global (incluye equipo). */
export type MonitorEquipoAsicHistorialFeedEntry = MonitorEquipoAsicHistorialEntry & {
  equipoId: string;
  /** Fila sintética desde `monitor_equipo_asic_baja`: texto para la cabecera del equipo (usuario · nombre). */
  equipoLabelHint?: string;
};

export async function getMonitorEquiposAsicHistorial(
  equipoId: string
): Promise<{ entries: MonitorEquipoAsicHistorialEntry[] }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = `/api/monitor-equipos-asic/historial/${encodeURIComponent(equipoId)}`;
  const url = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}${path}` : path;
  const res = await fetchWithTimeout(url, { method: "GET", headers, credentials: "include" }, 60000);
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = extractJsonErrorMessage(data, res, "Error al cargar historial");
    throw makeApiError(msg, res.status);
  }
  return data as { entries: MonitorEquipoAsicHistorialEntry[] };
}

export async function postMonitorEquiposAsicHistorialSummary(payload: {
  equipoIds: string[];
  lastReadAtByEquipo?: Record<string, string | null>;
}): Promise<{ summary: Record<string, { total: number; unread: number }> }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = `/api/monitor-equipos-asic/historial-summary`;
  const url = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}${path}` : path;
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) },
    60000
  );
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = extractJsonErrorMessage(data, res, "Error al cargar resumen de notas");
    throw makeApiError(msg, res.status);
  }
  return data as { summary: Record<string, { total: number; unread: number }> };
}

export async function postMonitorEquiposAsicHistorialFeed(payload: {
  equipoIds: string[];
  limit?: number;
}): Promise<{ entries: MonitorEquipoAsicHistorialFeedEntry[] }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = `/api/monitor-equipos-asic/historial-feed`;
  const url = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}${path}` : path;
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) },
    60000
  );
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = extractJsonErrorMessage(data, res, "Error al cargar el feed de notas");
    throw makeApiError(msg, res.status);
  }
  return data as { entries: MonitorEquipoAsicHistorialFeedEntry[] };
}

export async function postMonitorEquiposAsicHistorialNote(
  equipoId: string,
  payload: { body: string }
): Promise<{ entry: MonitorEquipoAsicHistorialEntry }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = `/api/monitor-equipos-asic/historial/${encodeURIComponent(equipoId)}`;
  const url = base && base.trim() !== "" ? `${base.replace(/\/+$/, "")}${path}` : path;
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) },
    60000
  );
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = extractJsonErrorMessage(data, res, "Error al guardar la nota");
    throw makeApiError(msg, res.status);
  }
  return data as { entry: MonitorEquipoAsicHistorialEntry };
}

export type MonitorEquipoAsicBajaEntry = {
  id: number;
  equipoId: string;
  rowSnapshot: Record<string, unknown>;
  motivo: string;
  createdAt: string;
  createdByEmail: string;
};

export async function getMonitorEquiposAsicBajas(): Promise<{ bajas: MonitorEquipoAsicBajaEntry[] }> {
  return api<{ bajas: MonitorEquipoAsicBajaEntry[] }>("/api/monitor-equipos-asic/bajas");
}

/** Extras del proxy SGI (spot CoinGecko + opcional cartera vía API NiceHash). */
export type NiceHashExternalRigs2SgiExtras = {
  btcSpotUsd?: number | null;
  unpaidUsdSpotEstimate?: number | null;
  walletTotalBtc?: string | null;
  walletUsdApprox?: number | null;
  walletError?: string | null;
};

/** Respuesta cruda de NiceHash `mining/external/{watcherId}/rigs2` (vía proxy SGI). */
export type NiceHashExternalRigs2Payload = {
  totalRigs?: number;
  totalDevices?: number;
  totalProfitability?: number;
  minerStatuses?: Record<string, number>;
  devicesStatuses?: Record<string, number>;
  unpaidAmount?: string;
  unpaidAmountUSDT?: string;
  nextPayoutTimestamp?: string | null;
  lastPayoutTimestamp?: string | null;
  /** Metadatos añadidos por el backend (no vienen de NiceHash rigs2). */
  _sgi?: NiceHashExternalRigs2SgiExtras;
  miningRigs?: Array<{
    rigId?: string;
    name?: string;
    type?: string;
    minerStatus?: string;
    statusTime?: number;
    unpaidAmount?: string;
    profitability?: number;
    stats?: Array<{
      market?: string;
      speedAccepted?: number | string;
      speedRejectedTotal?: number | string;
      timeConnected?: number;
      profitability?: number;
      algorithm?: { enumName?: string; description?: string };
    }>;
  }>;
};

export type NiceHashWalletApiCreds = {
  orgId: string;
  apiKey: string;
  apiSecret: string;
};

/**
 * Watcher NiceHash: POST al proxy (siempre incluye `_sgi` con tipo BTC spot).
 * Si pasás `nhWalletApi` (Org + key + secret con permiso de lectura de cartera), `_sgi.walletTotalBtc` refleja el total tipo «Total Assets» (`accounting/accounts2`).
 */
export async function getNiceHashExternalRigs2(
  watcherId: string,
  nhWalletApi?: NiceHashWalletApiCreds | null
): Promise<NiceHashExternalRigs2Payload> {
  const w =
    nhWalletApi &&
    nhWalletApi.orgId.trim() &&
    nhWalletApi.apiKey.trim() &&
    nhWalletApi.apiSecret.trim()
      ? {
          orgId: nhWalletApi.orgId.trim(),
          apiKey: nhWalletApi.apiKey.trim(),
          apiSecret: nhWalletApi.apiSecret.trim(),
        }
      : undefined;
  return api<NiceHashExternalRigs2Payload>(`/api/monitor-equipos-asic/nicehash-external-rigs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watcherId, nhWalletApi: w }),
  });
}

export type NhWatcherRigHashSample = { rigKey: string; t: number; v: number };

export type NhWatcherRigHashHistoryResponse = { series: Record<string, { t: number; v: number }[]> };

export function getNiceHashWatcherRigHashHistory(
  watcherId: string,
  opts?: { resolutionMs?: number }
): Promise<NhWatcherRigHashHistoryResponse> {
  const id = encodeURIComponent(watcherId.trim());
  const raw = opts?.resolutionMs;
  const ms =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : NH_WATCHER_HASH_SAMPLE_MS;
  const q = `?resolutionMs=${encodeURIComponent(String(ms))}`;
  return api<NhWatcherRigHashHistoryResponse>(`/api/monitor-equipos-asic/nicehash-watcher-rig-hash-history/${id}${q}`);
}

export function postNiceHashWatcherRigHashHistorySamples(
  watcherId: string,
  samples: NhWatcherRigHashSample[],
  opts?: { live?: boolean }
): Promise<{ ok: boolean; inserted: number }> {
  return api<{ ok: boolean; inserted: number }>(`/api/monitor-equipos-asic/nicehash-watcher-rig-hash-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      watcherId: watcherId.trim(),
      samples,
      ...(opts?.live ? { live: true } : {}),
    }),
  });
}

export type NhWatcherProfitMonthResponse = {
  yearMonth: string;
  contextKey: string;
  totalBtc: number;
  snapshotCount: number;
};

export function getNiceHashWatcherProfitMonth(params: {
  contextKey: string;
  yearMonth: string;
}): Promise<NhWatcherProfitMonthResponse> {
  const q = new URLSearchParams({
    contextKey: params.contextKey.trim(),
    yearMonth: params.yearMonth.trim(),
  });
  return api<NhWatcherProfitMonthResponse>(`/api/monitor-equipos-asic/nicehash-watcher-profit-month?${q.toString()}`);
}

export function postNiceHashWatcherProfitSnapshot(payload: {
  contextKey: string;
  profitBtc24h: number;
  capturedAtMs?: number;
}): Promise<{ ok: boolean; inserted: boolean; reason?: string }> {
  return api<{ ok: boolean; inserted: boolean; reason?: string }>(
    `/api/monitor-equipos-asic/nicehash-watcher-profit-snapshot`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function postMonitorEquipoAsicBaja(payload: {
  equipoId: string;
  rowSnapshot: Record<string, unknown>;
  motivo?: string;
}): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/monitor-equipos-asic/baja", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type UserListItem = {
  id: number;
  email: string;
  role: string;
  created_at: string;
  usuario?: string;
  /** `admin_b` y `operador`; `null` = acceso histórico completo sin lista explícita. */
  admin_b_grants?: string[] | null;
  /** Sólo `lector`; `null`/omitido según servidor = legado amplio API / SPA solo Kryptex hasta que Admin A defina lista. */
  lector_grants?: string[] | null;
};
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

export type AdminBPermissionCatalogEntry = {
  key: string;
  label: string;
  description: string;
  sectionOrder?: number;
  sectionLabel?: string;
};

export function getAdminBPermissionsCatalog(): Promise<{ catalog: AdminBPermissionCatalogEntry[] }> {
  return api<{ catalog: AdminBPermissionCatalogEntry[] }>("/api/users/admin-b-permissions-catalog");
}

/** `grants: null` restaura comportamiento histórico (columna NULL en servidor). Array = whitelist. */
export function updateAdminBGrants(userId: number, grants: string[] | null): Promise<UserResponse> {
  return api<UserResponse>(`/api/users/${userId}/admin-b-grants`, {
    method: "PUT",
    body: JSON.stringify({ grants }),
  });
}

export type LectorPermissionCatalogEntry = {
  key: string;
  label?: string;
  description?: string;
  sectionOrder?: number;
  sectionLabel?: string;
};

export function getLectorPermissionsCatalog(): Promise<{ catalog: LectorPermissionCatalogEntry[] }> {
  return api<{ catalog: LectorPermissionCatalogEntry[] }>("/api/users/lector-permissions-catalog");
}

export function updateLectorGrants(userId: number, grants: string[] | null): Promise<UserResponse> {
  return api<UserResponse>(`/api/users/${userId}/lector-grants`, {
    method: "PUT",
    body: JSON.stringify({ grants }),
  });
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
export type NextClientCodeResponse = { code: string };
export type CreateClientBody = Omit<ClientFields, "id" | "code"> & { code?: string };

export function getClients(): Promise<ClientsResponse> {
  return api<ClientsResponse>("/api/clients");
}

export function getStoreClients(): Promise<ClientsResponse> {
  return api<ClientsResponse>("/api/clients/store");
}

export function getNextClientCode(): Promise<NextClientCodeResponse> {
  return api<NextClientCodeResponse>("/api/clients/next-code");
}

export function createClient(body: CreateClientBody): Promise<ClientResponse> {
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

export type HostingFxOperationType = "usdt_to_usd" | "usd_to_usdt";
export type HostingFxUsdtSide = "buy_usdt" | "sell_usdt";
export type HostingFxDeliveryMethod = "usd_to_bank" | "usdt_to_hrs_binance";

export type HostingFxOperation = {
  id: number;
  ticketCode?: string;
  clientId: number;
  operationDate: string;
  operationAmount: number;
  operationType: HostingFxOperationType;
  hrsCommissionPct: number;
  bankFeeAmount: number;
  deliveryMethod: HostingFxDeliveryMethod;
  clientTotalPayment: number;
  bankName: string;
  accountNumber: string;
  currency: string;
  bankBranch: string;
  accountHolderName: string;
  usdtSide: HostingFxUsdtSide;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  clientCode?: string;
  clientName?: string;
  clientLastName?: string;
  /** Suma de líneas «4% Gastos Operativos Transferencia» en factura hosting vinculada (si existe). */
  invoiceHostingCambioCommissionUsd?: number;
  invoiceHostingCambioNumber?: string;
  /** Registrado con el flujo «4% Comisión por Hosting» en el formulario de operaciones. */
  compraFlowHostingCommission?: boolean;
};

export type HostingFxOperationPayload = {
  clientId: number;
  operationDate: string;
  operationAmount: number;
  hrsCommissionPct: number;
  bankFeeAmount: number;
  deliveryMethod: HostingFxDeliveryMethod;
  clientTotalPayment?: number;
  bankName: string;
  accountNumber: string;
  currency: string;
  bankBranch: string;
  accountHolderName: string;
  usdtSide: HostingFxUsdtSide;
  notes?: string;
  compraFlowHostingCommission?: boolean;
};

export function getHostingFxOperations(): Promise<{ operations: HostingFxOperation[] }> {
  return api<{ operations: HostingFxOperation[] }>("/api/hosting/fx-operations");
}

export function createHostingFxOperation(body: HostingFxOperationPayload): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/hosting/fx-operations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateHostingFxOperation(id: number, body: Partial<HostingFxOperationPayload>): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/hosting/fx-operations/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteHostingFxOperation(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/hosting/fx-operations/${id}`, { method: "DELETE" });
}

export type HostingInvoiceTransferCommissionRow = {
  invoiceId: number;
  number: string;
  clientName: string;
  date: string;
  month: string;
  invoiceTotalUsd: number;
  commissionUsd: number;
};

/** Facturas hosting cuyo detalle incluye ítems «4% Gastos Operativos Transferencia» (comisión dentro del comprobante). */
export function getHostingInvoicesTransferCommission(): Promise<{ invoices: HostingInvoiceTransferCommissionRow[] }> {
  return api<{ invoices: HostingInvoiceTransferCommissionRow[] }>("/api/hosting/invoices-transfer-commission");
}

export type AsicCostoEquipoItem = {
  id: number;
  createdAt: string;
  marca: string;
  modelo: string;
  procesador: string;
  precioOrigen: number;
  montoUsd: number;
  coeficiente: number;
  proveedorPy: number;
  margenUsd: number;
  totalNacionalizado: number;
  precioVenta: number;
  pctMargen: number;
};

export type AsicCostoEquipoPayload = {
  marca?: string;
  modelo?: string;
  procesador?: string;
  precioOrigen: number;
  montoUsd: number;
  coeficiente: number;
  proveedorPy: number;
  margenUsd: number;
  totalNacionalizado: number;
  precioVenta: number;
  pctMargen: number;
};

export function getAsicCostosEquipos(): Promise<{ items: AsicCostoEquipoItem[] }> {
  return api<{ items: AsicCostoEquipoItem[] }>("/api/asic/costos-equipos");
}

export function createAsicCostoEquipo(
  body: AsicCostoEquipoPayload
): Promise<{ ok: boolean; item: AsicCostoEquipoItem | null }> {
  return api<{ ok: boolean; item: AsicCostoEquipoItem | null }>("/api/asic/costos-equipos", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAsicCostoEquipo(id: number): Promise<void> {
  return api<void>(`/api/asic/costos-equipos/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}

/** Lead en tabla POTENCIALES CLIENTES (compradores potenciales de mineros). */
export type PotencialClienteLead = {
  id: number;
  createdAt: string;
  nombre: string;
  apellidos: string;
  email: string;
  celular: string;
  observaciones: string;
};

export type PotencialClienteLeadPayload = {
  nombre: string;
  apellidos?: string;
  email?: string;
  celular?: string;
  observaciones?: string;
};

export function getPotencialesClientesLeads(): Promise<{ items: PotencialClienteLead[] }> {
  return api<{ items: PotencialClienteLead[] }>("/api/potenciales-clientes");
}

export function createPotencialClienteLead(
  body: PotencialClienteLeadPayload
): Promise<{ ok: boolean; item: PotencialClienteLead | null }> {
  return api<{ ok: boolean; item: PotencialClienteLead | null }>("/api/potenciales-clientes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePotencialClienteLead(
  id: number,
  body: PotencialClienteLeadPayload
): Promise<{ ok: boolean; item: PotencialClienteLead | null }> {
  return api<{ ok: boolean; item: PotencialClienteLead | null }>(`/api/potenciales-clientes/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deletePotencialClienteLead(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/potenciales-clientes/${id}`, {
    method: "DELETE",
  });
}

/** Descarga CSV desde el servidor (UTF-8 con BOM). */
export async function downloadPotencialesClientesCsv(): Promise<Blob> {
  const token = getStoredToken();
  const headers: Record<string, string> = { Accept: "text/csv" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = getApiBase();
  const h = typeof window !== "undefined" ? (window.location?.hostname ?? "") : "";
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !isVercelOrPrimaryPublicHost(h)) {
    throw new Error(getNoApiMessage());
  }
  const path = "/api/potenciales-clientes/export.csv";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error("Sesión expirada.");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) msg = j.error.message;
    } catch {
      /* body no JSON */
    }
    throw new Error(msg || `Error ${res.status}`);
  }
  return res.blob();
}

export type ProveedorHrs = {
  id: number;
  supplierNumber: string;
  supplierName: string;
  country: string;
  ruc: string;
  rubro: string;
  contactFirstName: string;
  contactLastName: string;
  createdAt: string;
};

export type ProveedorHrsPayload = {
  supplierName: string;
  country: string;
  ruc: string;
  rubro: string;
  contactFirstName: string;
  contactLastName: string;
};

export function getProveedoresHrs(): Promise<{ items: ProveedorHrs[] }> {
  return api<{ items: ProveedorHrs[] }>("/api/proveedores-hrs");
}

export function createProveedorHrs(body: ProveedorHrsPayload): Promise<{ ok: boolean; item: ProveedorHrs }> {
  return api<{ ok: boolean; item: ProveedorHrs }>("/api/proveedores-hrs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateProveedorHrs(
  id: number,
  body: ProveedorHrsPayload
): Promise<{ ok: boolean; item: ProveedorHrs }> {
  return api<{ ok: boolean; item: ProveedorHrs }>(`/api/proveedores-hrs/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteProveedorHrs(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/proveedores-hrs/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

export type ContabilidadMoneda = "UYU" | "USD" | "PYG";

export const CONTABILIDAD_MEDIOS_PAGO = [
  "USD BANCO SANTANDER UY",
  "USD BANCO INTERFISA",
  "USD BANCO BROU UY",
  "USDT BINANCE",
  "USDC BINANCE",
  "USD CONTADO",
  "PESOS URUGUAYOS CONTADO",
  "GS CONTADO",
] as const;

export type ContabilidadMedioPago = (typeof CONTABILIDAD_MEDIOS_PAGO)[number];

export type ContabilidadGasto = {
  id: number;
  fecha: string;
  proveedorId: number;
  supplierNumber: string;
  supplierName: string;
  numeroFactura: string;
  descripcion: string;
  observaciones: string;
  mesServicio: string;
  presupuestoMes: string;
  medioPago: string;
  moneda: ContabilidadMoneda;
  /** Equivalente en USD (valor contable principal). */
  monto: number;
  /** Importe en la moneda de la operación (factura / pago). */
  montoOriginal: number;
  /** Manual: moneda local por USD (UYU/PYG); null si el gasto fue en USD. */
  tipoCambio: number | null;
  createdAt: string;
  /** True si se adjuntó el PDF al guardar (escaneo / mismo archivo del formulario). */
  hasFacturaPdf?: boolean;
};

export type ContabilidadGastoPayload = {
  fecha: string;
  proveedorId: number;
  descripcion: string;
  numeroFactura?: string;
  observaciones?: string;
  mesServicio: string;
  presupuestoMes: string;
  medioPago: ContabilidadMedioPago;
  moneda: ContabilidadMoneda;
  /** Monto en moneda de la operación; el servidor persiste el equivalente en USD en `monto`. */
  monto: number;
  /** UYU/PYG: obligatorio. USD: `null`. */
  tipoCambio?: number | null;
};

export function getContabilidadGastos(): Promise<{ items: ContabilidadGasto[] }> {
  return api<{ items: ContabilidadGasto[] }>("/api/contabilidad/gastos");
}

export function createContabilidadGasto(body: ContabilidadGastoPayload): Promise<{ ok: boolean; item: ContabilidadGasto }> {
  return api<{ ok: boolean; item: ContabilidadGasto }>("/api/contabilidad/gastos", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateContabilidadGasto(id: number, body: ContabilidadGastoPayload): Promise<{ ok: boolean; item: ContabilidadGasto }> {
  return api<{ ok: boolean; item: ContabilidadGasto }>(`/api/contabilidad/gastos/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteContabilidadGasto(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/contabilidad/gastos/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}

export function uploadContabilidadGastoFacturaPdf(id: number, file: File): Promise<{ ok: boolean }> {
  const fd = new FormData();
  fd.append("pdf", file);
  return api<{ ok: boolean }>(`/api/contabilidad/gastos/${encodeURIComponent(String(id))}/factura-pdf`, {
    method: "POST",
    body: fd,
  });
}

/** Descarga el PDF adjunto (Bearer); usar p. ej. con URL.createObjectURL. */
export async function fetchContabilidadGastoFacturaPdfBlob(id: number): Promise<Blob> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = getApiBase();
  const h = typeof window !== "undefined" ? (window.location?.hostname ?? "") : "";
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !isVercelOrPrimaryPublicHost(h)) {
    throw new Error(getNoApiMessage());
  }
  const path = `/api/contabilidad/gastos/${encodeURIComponent(String(id))}/factura-pdf`;
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error("Sesión expirada.");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) msg = j.error.message;
    } catch {
      /* body no JSON */
    }
    throw new Error(msg || `Error ${res.status}`);
  }
  return res.blob();
}

/** Borrador inferido desde texto del PDF o imagen escaneada/OCR (revisar siempre antes de guardar). */
export type ContabilidadFacturaPdfScanDraft = {
  fecha: string | null;
  numeroFactura: string | null;
  descripcion: string | null;
  monto: number | null;
  moneda: ContabilidadMoneda | null;
  proveedorId: number | null;
  mesServicio: string | null;
  presupuestoMes: string | null;
  observaciones: string | null;
};

/** Misma columna BD `numero_factura`; la UI distingue etiqueta según el tipo de documento. */
export type ContabilidadPdfDocumentKind = "factura" | "transferencia_brou";

export type ContabilidadFacturaPdfScanResponse = {
  ok: true;
  draft: ContabilidadFacturaPdfScanDraft;
  detected: string[];
  warnings: string[];
  textLength: number;
  documentKind: ContabilidadPdfDocumentKind;
};

export function scanContabilidadFacturaPdf(file: File): Promise<ContabilidadFacturaPdfScanResponse> {
  const fd = new FormData();
  fd.append("pdf", file);
  return api<ContabilidadFacturaPdfScanResponse>("/api/contabilidad/gastos/scan-factura-pdf", {
    method: "POST",
    body: fd,
  });
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

/** Reconstruir ítems de un recibo a formato liquidación (admin; alinea PDF con factura+NC+recibos previos). */
export function rebuildReciboSettlement(
  number: string,
  options?: { source?: "hosting" | "asic" }
): Promise<{ ok: boolean; id: number; number: string; itemCount: number }> {
  return api("/api/invoices/rebuild-recibo-settlement", {
    method: "POST",
    body: JSON.stringify({ number, source: options?.source ?? "hosting" }),
  });
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

export function applyMarketplaceSetupGlobal(
  setupUsd: number
): Promise<{
  ok: boolean;
  setupUsd: number;
  updatedCount: number;
  skippedCount: number;
  setupEquipoCompletoUsd: number;
  setupEquipoCompletoCount: number;
  hashratePinnedUsd: number;
  hashratePinnedCount: number;
}> {
  return api<{
    ok: boolean;
    setupUsd: number;
    updatedCount: number;
    skippedCount: number;
    setupEquipoCompletoUsd: number;
    setupEquipoCompletoCount: number;
    hashratePinnedUsd: number;
    hashratePinnedCount: number;
  }>(
    "/api/setups/marketplace/setup-global",
    { method: "PUT", body: JSON.stringify({ setupUsd }) }
  );
}

// ——— Reparación — tipos de servicio (misma idea que Setup) ———
export type ReparacionTiposResponse = { items: import("./types.js").ReparacionTipo[] };

export function getReparacionTipos(): Promise<ReparacionTiposResponse> {
  return api<ReparacionTiposResponse>("/api/reparacion-tipos", { cache: "no-store" });
}

export function createReparacionTipo(data: { nombre: string; precioUSD: number }): Promise<{ ok: boolean; id: string }> {
  return api<{ ok: boolean; id: string }>("/api/reparacion-tipos", { method: "POST", body: JSON.stringify(data) });
}

export function updateReparacionTipo(id: string, data: { nombre: string; precioUSD: number }): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/reparacion-tipos/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteReparacionTipo(id: string): Promise<void> {
  return api<void>(`/api/reparacion-tipos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ——— Transporte y fletes — ítems para factura ASIC (misma idea que Reparación) ———
export type TransporteFleteTiposResponse = { items: import("./types.js").TransporteFleteTipo[] };

export function getTransporteFleteTipos(): Promise<TransporteFleteTiposResponse> {
  return api<TransporteFleteTiposResponse>("/api/transporte-flete-tipos", { cache: "no-store" });
}

export function createTransporteFleteTipo(data: { nombre: string; precioUSD: number }): Promise<{ ok: boolean; id: string; codigo?: string }> {
  return api<{ ok: boolean; id: string; codigo?: string }>("/api/transporte-flete-tipos", { method: "POST", body: JSON.stringify(data) });
}

export function updateTransporteFleteTipo(id: string, data: { nombre: string; precioUSD: number }): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/transporte-flete-tipos/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteTransporteFleteTipo(id: string): Promise<void> {
  return api<void>(`/api/transporte-flete-tipos/${encodeURIComponent(id)}`, { method: "DELETE" });
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
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const pathUrl = "/api/equipos/marketplace-image";
  const url = base && base.trim() !== "" ? `${base}${pathUrl}` : pathUrl;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      { method: "POST", body: formData, headers, credentials: "include" },
      FETCH_TIMEOUT_MS
    );
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

/** Catálogo ASIC: timeout corto y un solo reintento (la vitrina no debe bloquear la UI minutos). */
async function fetchMarketplaceAsicVitrinaNetwork(): Promise<{
  products: import("./marketplaceAsicCatalog.js").AsicProduct[];
  hidePricesForGuests: boolean;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = "/api/marketplace/asic-vitrina";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  const attempts = [0, 1200];
  const timeoutMs = 14_000;
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i]! > 0) await delay(attempts[i]!);
    try {
      const res = await fetchWithTimeout(
        url,
        { method: "GET", headers, credentials: "include", cache: "default" },
        timeoutMs
      );
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearStoredAuth();
        const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
        if (typeof cb === "function") cb();
        throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Sesión expirada.");
      }
      if (!res.ok) {
        lastErr = new Error((data as { error?: { message?: string } })?.error?.message ?? res.statusText);
        if (res.status === 502 || res.status === 503) continue;
        throw lastErr;
      }
      return data as {
        products: import("./marketplaceAsicCatalog.js").AsicProduct[];
        hidePricesForGuests: boolean;
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error(getNoApiMessage());
}

/** Catálogo ASIC para /equipment (público). Usa caché de sesión + fetch rápido al servidor. */
export async function getMarketplaceAsicVitrina(): Promise<{
  products: import("./marketplaceAsicCatalog.js").AsicProduct[];
  hidePricesForGuests: boolean;
}> {
  const data = await fetchMarketplaceAsicVitrinaNetwork();
  writeMarketplaceVitrinaCache(data);
  return data;
}

export { peekMarketplaceVitrinaCache } from "./marketplaceVitrinaCache.js";

/** Destacados “Equipos más vendidos” en /marketplace/home (público). */
export function getMarketplaceCorpBestSelling(): Promise<{
  products: import("./marketplaceAsicCatalog.js").AsicProduct[];
  hidePricesForGuests: boolean;
}> {
  return api<{
    products: import("./marketplaceAsicCatalog.js").AsicProduct[];
    hidePricesForGuests: boolean;
  }>("/api/marketplace/corp-best-selling", {
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

/** Config global: ocultar precios de productos a visitantes sin sesión. */
export function getEquiposMarketplaceHidePricesForGuests(): Promise<{ enabled: boolean }> {
  return api<{ enabled: boolean }>("/api/equipos/marketplace-hide-prices-for-guests", { cache: "no-store" });
}

/** Guardar config global de visibilidad de precios sin login (solo admin A/B). */
export function putEquiposMarketplaceHidePricesForGuests(body: { enabled: boolean }): Promise<{ ok: boolean; enabled: boolean }> {
  return api<{ ok: boolean; enabled: boolean }>("/api/equipos/marketplace-hide-prices-for-guests", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** «Otros Productos Interesantes» en /marketplace/home (público, hasta 4 ítems). */
export function getMarketplaceCorpInteresting(): Promise<{
  products: import("./marketplaceAsicCatalog.js").AsicProduct[];
  hidePricesForGuests: boolean;
}> {
  return api<{
    products: import("./marketplaceAsicCatalog.js").AsicProduct[];
    hidePricesForGuests: boolean;
  }>("/api/marketplace/corp-interesting", {
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
  items: Array<{ codigo: string; marca: string; modelo: string; marketplaceEquipoId?: string; precioGarantia: number }>;
}> {
  return api<{ items: Array<{ codigo: string; marca: string; modelo: string; marketplaceEquipoId?: string; precioGarantia: number }> }>(
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
    algo: "sha256" | "scrypt" | "randomx";
    hashrate: string;
    detailRows?: Array<{ icon: string; text: string }>;
    brand?: string;
    model?: string;
  }>
): Promise<{ ok: boolean; yields: MarketplaceAsicLiveYield[]; networkOk: boolean }> {
  return api<{ ok: boolean; yields: MarketplaceAsicLiveYield[]; networkOk: boolean }>("/api/marketplace/asic-yields", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export type EquipoMarketplacePayload = {
  marketplaceVisible?: boolean;
  marketplaceAlgo?: "sha256" | "scrypt" | "randomx" | null;
  marketplaceHashrateDisplay?: string | null;
  marketplaceImageSrc?: string | null;
  marketplaceGalleryJson?: string | null;
  marketplaceDetailRowsJson?: string | null;
  marketplaceYieldJson?: string | null;
  marketplaceSortOrder?: number;
  marketplaceHashrateSellEnabled?: boolean;
  marketplaceHashrateParts?: Array<{
    sharePct: number;
    warrantyPct: number;
    setupUsd: number;
  }> | null;
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
  hashrateSharePct?: number;
  hashrateWarrantyPct?: number;
  hashrateSetupUsd?: number;
  includeSetup?: boolean;
  includeWarranty?: boolean;
};

/** Requiere JWT y rol `cliente` o administrador A/B. */
export function syncMarketplaceQuoteTicket(payload: {
  lines: QuoteSyncLinePayload[];
  event?: "sync" | "contact_email" | "contact_whatsapp" | "submit_ticket";
  /** Si true con lines vacío: vaciar ítems en la orden marketplace en curso (no usar tras generar consulta). */
  clearPipelineCart?: boolean;
  /** Solo con `event: "submit_ticket"`: pulsación explícita de «Generar orden» (habilita mail ORDEN GENERADA si aplica). */
  confirmGenerarOrden?: true;
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
  hashrateWarrantyPct?: number;
  hashrateSetupUsd?: number;
  includeSetup?: boolean;
  includeWarranty?: boolean;
};

export type MarketplaceQuoteCartHistoryChange = {
  action: "added" | "removed" | "updated";
  productId: string;
  productLabel: string;
  qty?: number;
  previousQty?: number;
  includeSetup?: boolean;
  previousIncludeSetup?: boolean;
  includeWarranty?: boolean;
  previousIncludeWarranty?: boolean;
  hashrateSharePct?: number | null;
  previousHashrateSharePct?: number | null;
  priceUsd?: number;
  priceLabel?: string;
};

export type MarketplaceQuoteCartHistoryEntry = {
  at: string;
  source: "sync";
  changes: MarketplaceQuoteCartHistoryChange[];
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
  /** Email de la cuenta que marcó la orden como eliminada (cancelar, vaciar carrito o staff). */
  discardByEmail?: string | null;
  /** Si existe: la orden volvió a activa tras haber estado eliminada (reactivación desde carrito). */
  reactivatedAt?: string | null;
  items: MarketplaceQuoteTicketItem[];
  /** Registro de altas/bajas/cambios en el carrito (solo en GET detalle). */
  itemsCartHistory?: MarketplaceQuoteCartHistoryEntry[];
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

const MARKETPLACE_PRESENCE_HEARTBEAT_TIMEOUT_MS = 12_000;

/**
 * Presencia marketplace: un POST directo (misma base que `getApiBase`, sin reintentos de `api()`).
 * No lanza: backend apagado o 5xx no deben romper la UI ni spamear toasts.
 */
export async function postMarketplacePresenceHeartbeat(payload: {
  visitorId: string;
  viewerType?: MarketplacePresenceViewerType;
  userEmail?: string;
  countryCode?: string;
  countryName?: string;
  clientIp?: string;
  locale?: string;
  timezone?: string;
  currentPath?: string;
}): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = "/api/marketplace/presence/heartbeat";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !isVercelOrPrimaryPublicHost(h)) {
    return;
  }
  try {
    const res = await fetchWithTimeout(
      url,
      { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) },
      MARKETPLACE_PRESENCE_HEARTBEAT_TIMEOUT_MS
    );
    if (res.status === 401) {
      clearStoredAuth();
      const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
      if (typeof cb === "function") cb();
    }
  } catch {
    /* red / API apagada: best-effort */
  }
}

const MARKETPLACE_CONTACT_POST_TIMEOUT_MS = 25_000;

export type MarketplaceContactPublicPayload = {
  name: string;
  lastName: string;
  email: string;
  subject: string;
  phone: string;
  message: string;
};

/** Formulario contacto marketplace: un solo POST (sin reintentos 502/503 de `api()`). */
export async function postMarketplaceContactPublic(
  payload: MarketplaceContactPublicPayload
): Promise<{ ok: boolean; simulated?: boolean }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = "/api/marketplace/contact";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !isVercelOrPrimaryPublicHost(h)) {
    throw new Error(getNoApiMessage());
  }
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) },
    MARKETPLACE_CONTACT_POST_TIMEOUT_MS
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; simulated?: boolean; error?: { message?: string } };
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error(data?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText ?? "No se pudo enviar el mensaje.";
    throw new Error(msg.trim() || "No se pudo enviar el mensaje.");
  }
  return { ok: Boolean(data.ok), simulated: Boolean(data.simulated) };
}

const MARKETPLACE_ASIC_INQUIRY_POST_TIMEOUT_MS = 25_000;

export type MarketplaceAsicInquiryPublicPayload = {
  email: string;
  name?: string;
  subject: string;
  message: string;
  source?: "asic" | "cart";
};

/** Consulta por correo desde ficha ASIC: un solo POST (sin reintentos 502/503 de `api()`). */
export async function postMarketplaceAsicInquiryPublic(
  payload: MarketplaceAsicInquiryPublicPayload
): Promise<{ ok: boolean; simulated?: boolean }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let base = getApiBase();
  const h = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  if (isVercelOrPrimaryPublicHost(h)) base = "";
  const path = "/api/marketplace/asic-inquiry";
  const url = base && base.trim() !== "" ? `${base}${path}` : path;
  if ((!base || base.trim() === "") && h !== "localhost" && h !== "127.0.0.1" && !isVercelOrPrimaryPublicHost(h)) {
    throw new Error(getNoApiMessage());
  }
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) },
    MARKETPLACE_ASIC_INQUIRY_POST_TIMEOUT_MS
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; simulated?: boolean; error?: { message?: string } };
  if (res.status === 401) {
    clearStoredAuth();
    const cb = typeof window !== "undefined" ? (window as unknown as { __on401?: () => void }).__on401 : undefined;
    if (typeof cb === "function") cb();
    throw new Error(data?.error?.message ?? "Sesión expirada.");
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText ?? "No se pudo enviar el mensaje.";
    throw new Error(msg.trim() || "No se pudo enviar el mensaje.");
  }
  return { ok: Boolean(data.ok), simulated: Boolean(data.simulated) };
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

export type MarketplacePresenceHistoryRow = {
  id: number;
  visitorId: string;
  viewerType: string;
  countryCode: string;
  countryName: string;
  clientIp: string;
  userEmail: string;
  currentPath: string;
  locale: string;
  timezone: string;
  recordedAt: string;
};

export function getMarketplacePresenceHistory(params?: {
  limit?: number;
  offset?: number;
  q?: string;
  /** Filtro exacto por `viewer_type` en BD: anon | cliente | staff */
  viewerType?: "anon" | "cliente" | "staff" | "";
}): Promise<{ rows: MarketplacePresenceHistoryRow[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.q) qs.set("q", params.q);
  if (params?.viewerType) qs.set("viewerType", params.viewerType);
  const suf = qs.toString();
  return api(`/api/marketplace/presence-history${suf ? `?${suf}` : ""}`);
}

export function getMarketplaceQuoteTickets(params?: {
  status?: string;
  /** Filtro por carril del tablero admin (prioridad sobre `status` en el servidor). */
  lane?: "pendiente" | "compra_confirmada" | "eliminadas";
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: MarketplaceQuoteTicket[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  if (params?.lane) qs.set("lane", params.lane);
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
