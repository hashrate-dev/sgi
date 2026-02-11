const RAW = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
const API_BASE = typeof RAW === "string" ? RAW.replace(/\/+$/, "") : "";

function getNoApiMessage(): string {
  const isLocal = typeof window !== "undefined" && window.location?.hostname === "localhost";
  if (isLocal) {
    return "No se pudo conectar con el servidor. ¿Tenés el backend levantado? Ejecutá en la raíz del proyecto: npm run dev";
  }
  return "No se pudo conectar con el servidor. En Vercel solo está el frontend; para guardar datos desplegá el backend (Railway, Render, etc.) y configurá VITE_API_URL en Vercel.";
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers }
    });
  } catch (e) {
    throw new Error(getNoApiMessage());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 || res.status === 502) throw new Error(getNoApiMessage());
    const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(msg);
  }
  return data as T;
}

export type ClientsResponse = { clients: Array<{ id: number | string; code: string; name: string; phone?: string; email?: string; address?: string; city?: string }> };
export type ClientResponse = { client: { id: number | string; code: string; name: string; phone?: string; email?: string; address?: string; city?: string } };

export function getClients(): Promise<ClientsResponse> {
  return api<ClientsResponse>("/api/clients");
}

export function createClient(body: { code: string; name: string; phone?: string; email?: string; address?: string; city?: string }): Promise<ClientResponse> {
  return api<ClientResponse>("/api/clients", { method: "POST", body: JSON.stringify(body) });
}

export function updateClient(id: number | string, body: { code?: string; name?: string; phone?: string; email?: string; address?: string; city?: string }): Promise<ClientResponse> {
  return api<ClientResponse>(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(body) });
}
