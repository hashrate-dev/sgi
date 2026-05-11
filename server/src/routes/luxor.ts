import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth.js";
import { requireAdminBGrant } from "../middleware/adminBGrant.js";

export const luxorRouter = Router();

const LUXOR_API = "https://app.luxor.tech/api";

const CurrencySchema = z.enum(["BTC", "LTC_DOGE", "SC", "ZEC"]);

const pingBody = z.object({
  apiKey: z.string().min(1).max(4000),
  currencyType: CurrencySchema.optional(),
});

const syncBody = z.object({
  apiKey: z.string().min(1).max(4000),
  /** Compat: una sola pool. Preferir `currencyTypes` si hay varias (p. ej. BTC + LTC_DOGE). */
  currencyType: CurrencySchema.optional(),
  currencyTypes: z.array(CurrencySchema).min(1).max(4).optional(),
  rows: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        usuario: z.string(),
        nombreNuevo: z.string(),
        pool: z.string(),
      })
    )
    .max(5000),
});

type LuxorWorker = {
  subaccount_name?: string;
  name?: string;
  status?: string;
  hashrate?: number;
  efficiency?: number;
  last_share_time?: string;
  firmware?: string;
  id?: string;
};

type LuxorPage = {
  workers?: LuxorWorker[];
  total_active?: number;
  total_inactive?: number;
  pagination?: {
    page_number?: number;
    page_size?: number;
    next_page_url?: string | null;
  };
};

type LuxorSubaccountsPage = {
  subaccounts?: Array<{ name?: string }>;
  pagination?: {
    page_number?: number;
    page_size?: number;
    next_page_url?: string | null;
  };
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Luxor valida `subaccount_names`: solo minúsculas, números, `_`, `-` y comas entre nombres (sin mayúsculas en la query).
 */
function sanitizeLuxorSubaccountSegment(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, "_");
  s = s.replace(/[^A-Za-z0-9_-]/g, "_");
  s = s.replace(/_+/g, "_").replace(/^_|_$/g, "");
  return s.toLowerCase();
}

function luxorSubaccountMatchKey(raw: string): string {
  return sanitizeLuxorSubaccountSegment(raw);
}

function isLuxorPool(pool: string): boolean {
  return norm(pool) === "luxor";
}

function luxorErrorMessage(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
    if (typeof j.detail === "string" && j.detail.trim()) return j.detail.trim();
    const errField = j.error;
    if (typeof errField === "string" && errField.trim()) return errField.trim();
    if (errField && typeof errField === "object" && "message" in errField) {
      const m = (errField as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
  } catch {
    /* ignore */
  }
  if (status === 401) return "Luxor rechazó la API key (401). Verificá el token en Luxor → Workspace → API.";
  if (status === 403) return "Luxor denegó el acceso (403).";
  const trimmed = text.trim().slice(0, 500);
  if (trimmed) return trimmed;
  return `Luxor respondió HTTP ${status}.`;
}

/**
 * Luxor exige `subaccount_names` o `site_id` en la query de GET workers (si no, error 400).
 * @see https://docs.luxor.tech/platform/api/mining-pool/reporting/get-workers
 */
async function luxorFetchWorkersPage(
  apiKey: string,
  currencyType: string,
  page: number,
  pageSize: number,
  subaccountNames: string[]
): Promise<LuxorPage> {
  const trimmed = subaccountNames.map((s) => sanitizeLuxorSubaccountSegment(s)).filter(Boolean);
  if (trimmed.length === 0) {
    throw new Error(
      "Luxor requiere al menos una subcuenta en la consulta. Completá «Usuario» en las filas con pool Luxor."
    );
  }

  const url = new URL(`${LUXOR_API}/v2/pool/workers/${encodeURIComponent(currencyType)}`);
  url.searchParams.set("subaccount_names", trimmed.join(","));
  url.searchParams.set("page_number", String(page));
  url.searchParams.set("page_size", String(pageSize));

  /** Por subcuenta: timeout corto para no acumular minutos con muchas cuentas (evita 502 aguas abajo). */
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 35000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { authorization: apiKey.trim() },
      signal: ac.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      const err = new Error(luxorErrorMessage(resp.status, text)) as Error & { statusCode: number };
      err.statusCode = resp.status;
      throw err;
    }
    try {
      return JSON.parse(text) as LuxorPage;
    } catch {
      const err = new Error(`Luxor devolvió una respuesta no JSON (${currencyType}). Reintentá.`) as Error & {
        statusCode: number;
      };
      err.statusCode = 502;
      throw err;
    }
  } finally {
    clearTimeout(t);
  }
}

function luxorHttpCode(e: unknown): number | undefined {
  return (e as Error & { statusCode?: number }).statusCode;
}

/** 401 = API key inválida o revocada para Luxor: no seguir con 22×N intentos inútiles. */
function isLuxorUnauthorizedError(e: unknown): boolean {
  return luxorHttpCode(e) === 401;
}

/** Errores que solo afectan a esa subcuenta: no abortar toda la sync. */
function shouldSkipLuxorSubaccountError(e: unknown): boolean {
  if (isLuxorUnauthorizedError(e)) return false;
  const msg = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : "";
  const code = luxorHttpCode(e);
  if (code === 403) return true;
  if (code === 404) return true;
  if (code === 500 || code === 502 || code === 503 || code === 504 || code === 429) return true;
  if (
    /permission_denied|does not have access|permission denied|User does not have access|\[permission_denied\]/i.test(
      msg
    )
  ) {
    return true;
  }
  if (code === 400 && /permission|access|denied|subaccount/i.test(msg)) return true;
  if (name === "AbortError" || msg.includes("aborted") || msg.includes("Abort")) return true;
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket|network|TLS|certificate/i.test(msg))
    return true;
  if (name === "SyntaxError" && /JSON|Unexpected/i.test(msg)) return true;
  return false;
}

/** Varias subcuentas en paralelo acelera la sync (varias pools × muchas filas). */
const SUBACCOUNT_FETCH_CONCURRENCY = 5;

/**
 * Una subcuenta por request: si la API key no cubre varias, Luxor responde 403 para todo el lote;
 * consultando de a una se obtienen datos de las permitidas y se omite el resto.
 */
async function fetchAllLuxorWorkers(
  apiKey: string,
  currencyType: string,
  subaccountNames: string[]
): Promise<{
  workers: LuxorWorker[];
  skippedSubaccounts: Array<{ subaccount: string; reason: string }>;
}> {
  const uniq = [...new Set(subaccountNames.map((s) => sanitizeLuxorSubaccountSegment(s)).filter(Boolean))];
  const out: LuxorWorker[] = [];
  const skippedSubaccounts: Array<{ subaccount: string; reason: string }> = [];
  const pageSize = 100;
  const maxPages = 400;

  async function fetchOneSub(sub: string): Promise<void> {
    try {
      let page = 1;
      while (page <= maxPages) {
        const data = await luxorFetchWorkersPage(apiKey, currencyType, page, pageSize, [sub]);
        const batchWorkers = data.workers ?? [];
        out.push(...batchWorkers);
        if (batchWorkers.length === 0) break;
        if (batchWorkers.length < pageSize) break;
        page += 1;
      }
    } catch (e) {
      if (isLuxorUnauthorizedError(e)) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (shouldSkipLuxorSubaccountError(e)) {
        skippedSubaccounts.push({ subaccount: sub, reason: msg.slice(0, 280) });
        return;
      }
      skippedSubaccounts.push({
        subaccount: sub,
        reason: `Error al consultar Luxor (${currencyType}): ${msg.slice(0, 220)}`,
      });
    }
  }

  for (let i = 0; i < uniq.length; i += SUBACCOUNT_FETCH_CONCURRENCY) {
    const chunk = uniq.slice(i, i + SUBACCOUNT_FETCH_CONCURRENCY);
    await Promise.all(chunk.map((sub) => fetchOneSub(sub)));
  }

  return { workers: out, skippedSubaccounts };
}

/**
 * Lista subcuentas del workspace que la API key puede leer (no depende de nombres en datos locales).
 * @see https://docs.luxor.tech/platform/api/mining-pool/subaccounts/get-subaccounts
 */
async function luxorFetchSubaccountsPage(apiKey: string, page: number, pageSize: number): Promise<LuxorSubaccountsPage> {
  const url = new URL(`${LUXOR_API}/v2/pool/subaccounts`);
  url.searchParams.set("page_number", String(page));
  url.searchParams.set("page_size", String(pageSize));
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 45000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { authorization: apiKey.trim() },
      signal: ac.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      const err = new Error(luxorErrorMessage(resp.status, text)) as Error & { statusCode: number };
      err.statusCode = resp.status;
      throw err;
    }
    try {
      return JSON.parse(text) as LuxorSubaccountsPage;
    } catch {
      const err = new Error("Luxor devolvió JSON inválido en /pool/subaccounts.") as Error & { statusCode: number };
      err.statusCode = 502;
      throw err;
    }
  } finally {
    clearTimeout(t);
  }
}

/** Todas las páginas de subcuentas visibles para la key (nombres normalizados como en workers). */
async function fetchAllLuxorSubaccountNamesFromApi(apiKey: string): Promise<string[]> {
  const pageSize = 100;
  const maxPages = 300;
  const out: string[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await luxorFetchSubaccountsPage(apiKey, page, pageSize);
    const batch = data.subaccounts ?? [];
    for (const s of batch) {
      const n = typeof s.name === "string" ? sanitizeLuxorSubaccountSegment(s.name) : "";
      if (n) out.push(n);
    }
    const next = data.pagination?.next_page_url;
    if (!next && batch.length < pageSize) break;
    if (batch.length === 0) break;
  }
  return [...new Set(out)];
}

/** Valida API key sin el endpoint workers (no exige subcuentas). */
async function luxorPingWorkspace(apiKey: string): Promise<{ ok: boolean }> {
  const url = `${LUXOR_API}/v2/workspace`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { authorization: apiKey.trim() },
      signal: ac.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      const err = new Error(luxorErrorMessage(resp.status, text)) as Error & { statusCode: number };
      err.statusCode = resp.status;
      throw err;
    }
    return { ok: true };
  } finally {
    clearTimeout(t);
  }
}

function workerPriority(w: LuxorWorker): number {
  const s = (w.status ?? "").toUpperCase();
  if (s === "ACTIVE") return 2;
  if (s === "INACTIVE") return 1;
  return 0;
}

function serializeLuxorWorkersForClient(workers: LuxorWorker[], poolCurrencyType: string) {
  return workers.map((w) => ({
    subaccount_name: typeof w.subaccount_name === "string" ? w.subaccount_name : "",
    name: typeof w.name === "string" ? w.name : "",
    status: typeof w.status === "string" ? w.status : "",
    hashrate: typeof w.hashrate === "number" ? w.hashrate : null,
    efficiency: typeof w.efficiency === "number" ? w.efficiency : null,
    last_share_time: typeof w.last_share_time === "string" ? w.last_share_time : null,
    firmware: typeof w.firmware === "string" ? w.firmware : null,
    id: typeof w.id === "string" ? w.id : null,
    currency_type: poolCurrencyType,
  }));
}

function buildWorkerMap(workers: LuxorWorker[]): Map<string, LuxorWorker> {
  const map = new Map<string, LuxorWorker>();
  for (const w of workers) {
    const sub = luxorSubaccountMatchKey(w.subaccount_name ?? "");
    const name = norm(w.name ?? "");
    if (!sub || !name) continue;
    const key = `${sub}\0${name}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, w);
      continue;
    }
    if (workerPriority(w) > workerPriority(existing)) map.set(key, w);
  }
  return map;
}

luxorRouter.post(
  "/luxor/ping",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
  const parsed = pingBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos para probar Luxor." } });
  }
  const apiKey = parsed.data.apiKey;
  try {
    await luxorPingWorkspace(apiKey);
    return res.json({
      ok: true,
      workersOnPage: 0,
      message:
        "API key aceptada por Luxor. Al sincronizar se usa GET /v2/pool/subaccounts (subcuentas del workspace) y, si hace falta, las de tus filas con pool Luxor.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(502).json({ error: { message: msg } });
  }
});

luxorRouter.post(
  "/luxor/monitor-sync",
  requireRole("admin_a", "admin_b"),
  requireAdminBGrant("equipos"),
  async (req: Request, res: Response) => {
  const parsed = syncBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos para sincronizar con Luxor." } });
  }
  const apiKey = parsed.data.apiKey;
  const fromBody = parsed.data.currencyTypes?.length
    ? parsed.data.currencyTypes
    : parsed.data.currencyType
      ? [parsed.data.currencyType]
      : ["BTC"];
  const currencyTypes = [...new Set(fromBody)];
  const { rows } = parsed.data;

  try {
    const fromRows = [
      ...new Set(
        rows
          .filter((row) => isLuxorPool(row.pool) && row.usuario.trim())
          .map((row) => sanitizeLuxorSubaccountSegment(row.usuario))
          .filter(Boolean)
      ),
    ];

    let directoryNames: string[] | null = null;
    let directoryListingFailed = false;
    try {
      directoryNames = await fetchAllLuxorSubaccountNamesFromApi(apiKey);
    } catch (e) {
      if (isLuxorUnauthorizedError(e)) throw e;
      directoryListingFailed = true;
      directoryNames = null;
    }

    const dirList = directoryNames && directoryNames.length > 0 ? directoryNames : null;
    const dirSet = dirList ? new Set(dirList) : null;

    let targets: string[];
    let subaccountSync: "intersection" | "luxor_all" | "local_only";

    if (dirSet && dirList) {
      if (fromRows.length > 0) {
        const intersection = fromRows.filter((s) => dirSet.has(s));
        if (intersection.length > 0) {
          targets = intersection;
          subaccountSync = "intersection";
        } else {
          targets = [...dirList];
          subaccountSync = "luxor_all";
        }
      } else {
        targets = [...dirList];
        subaccountSync = "luxor_all";
      }
    } else {
      targets = [...fromRows];
      subaccountSync = "local_only";
    }

    if (targets.length === 0) {
      return res.status(400).json({
        error: {
          message:
            fromRows.length === 0
              ? directoryListingFailed
                ? "Luxor no permitió listar subcuentas (revisá permisos Mining Pool en la API key) y no hay «Usuario» en filas pool Luxor en tus datos."
                : "No hay subcuentas. Agregá filas con pool Luxor y el campo «Usuario» (nombre de subcuenta), o comprobá que la API key tenga subcuentas en el workspace."
              : "Ninguna subcuenta del monitor coincide con las que devuelve Luxor. Revisá que «Usuario» sea exactamente el nombre en app.luxor.tech o editá la API key.",
        },
      });
    }

    const luxorWorkersRaw: LuxorWorker[] = [];
    const luxorWorkersSerialized: ReturnType<typeof serializeLuxorWorkersForClient> = [];
    const skippedSubaccounts: Array<{ subaccount: string; reason: string; currencyType: string }> = [];

    const perPool = await Promise.all(
      currencyTypes.map(async (ct) => {
        const r = await fetchAllLuxorWorkers(apiKey, ct, targets);
        return { ct, ...r };
      })
    );

    for (const { ct, workers, skippedSubaccounts: skipped } of perPool) {
      luxorWorkersRaw.push(...workers);
      luxorWorkersSerialized.push(...serializeLuxorWorkersForClient(workers, ct));
      for (const s of skipped) {
        skippedSubaccounts.push({ subaccount: s.subaccount, reason: s.reason, currencyType: ct });
      }
    }

    const map = buildWorkerMap(luxorWorkersRaw);

    const results = rows.map((row) => {
      if (!isLuxorPool(row.pool)) {
        return {
          index: row.index,
          skipped: true as const,
          matched: false as const,
          online: null as boolean | null,
        };
      }
      const u = row.usuario.trim();
      const nn = row.nombreNuevo.trim();
      if (!u || !nn) {
        return {
          index: row.index,
          skipped: true as const,
          matched: false as const,
          online: null as boolean | null,
        };
      }
      const key = `${luxorSubaccountMatchKey(u)}\0${norm(nn)}`;
      const hit = map.get(key);
      if (!hit) {
        return {
          index: row.index,
          skipped: false as const,
          matched: false as const,
          online: null as boolean | null,
        };
      }
      const st = (hit.status ?? "").toUpperCase();
      const online = st === "ACTIVE";
      return {
        index: row.index,
        skipped: false as const,
        matched: true as const,
        online,
        luxorStatus: hit.status ?? null,
        hashrate: typeof hit.hashrate === "number" ? hit.hashrate : null,
      };
    });

    return res.json({
      ok: true,
      luxorWorkerCount: luxorWorkersRaw.length,
      luxorWorkers: luxorWorkersSerialized,
      skippedSubaccounts,
      results,
      luxorSubaccountSync: subaccountSync,
      luxorDirectorySubCount: dirList?.length ?? 0,
      luxorDirectorySample: (dirList ?? []).slice(0, 35),
      luxorDirectoryListingFailed: directoryListingFailed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isLuxorUnauthorizedError(e)) {
      return res.status(422).json({
        error: {
          code: "luxor_unauthorized",
          message:
            "Luxor rechazó la API key (401). Generá o copiá la clave en app.luxor.tech → Workspace → API Keys y pegala en «Conexión Luxor».",
        },
      });
    }
    if ((e as Error).name === "AbortError") {
      return res.status(504).json({ error: { message: "Luxor tardó demasiado en responder. Reintentá." } });
    }
    return res.status(502).json({ error: { message: msg } });
  }
});
