import { db } from "../db.js";

export type CartHistoryChangeAction = "added" | "removed" | "updated";

export type CartHistoryChange = {
  action: CartHistoryChangeAction;
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

export type CartHistoryEntry = {
  at: string;
  source: "sync";
  changes: CartHistoryChange[];
};

export type QuoteLineHistorySnap = {
  productId: string;
  qty: number;
  brand: string;
  model: string;
  hashrate: string;
  priceUsd: number;
  priceLabel: string;
  hashrateSharePct?: number;
  includeSetup: boolean;
  includeWarranty: boolean;
};

const MAX_HISTORY_ENTRIES = 320;

function quoteLineMergeKey(l: { productId: string; hashrateSharePct?: number }): string {
  const p = Math.round(Number(l.hashrateSharePct));
  const share = Number.isFinite(p) && p >= 1 && p <= 100 ? String(p) : "full";
  return `${String(l.productId ?? "").trim()}:${share}`;
}

function stableSortHistoryLines(lines: QuoteLineHistorySnap[]): QuoteLineHistorySnap[] {
  return [...lines].sort((a, b) => quoteLineMergeKey(a).localeCompare(quoteLineMergeKey(b)));
}

function productLabelFromLine(l: QuoteLineHistorySnap): string {
  const b = String(l.brand ?? "").trim();
  const m = String(l.model ?? "").trim();
  const core = [b, m].filter(Boolean).join(" ").trim();
  if (core) return core;
  const h = String(l.hashrate ?? "").trim();
  if (h) return h;
  return l.productId;
}

function normalizeLineFromJson(raw: unknown): QuoteLineHistorySnap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const productId = String(o.productId ?? "").trim();
  if (!productId) return null;
  const qty = Math.round(Number(o.qty));
  const shareRaw = Math.round(Number(o.hashrateSharePct));
  const hasShare =
    Object.prototype.hasOwnProperty.call(o, "hashrateSharePct") &&
    Number.isFinite(shareRaw) &&
    shareRaw >= 1 &&
    shareRaw <= 100;
  return {
    productId,
    qty: Number.isFinite(qty) && qty >= 1 ? qty : 1,
    brand: String(o.brand ?? "").trim(),
    model: String(o.model ?? "").trim(),
    hashrate: String(o.hashrate ?? "").trim(),
    priceUsd: Math.max(0, Math.round(Number(o.priceUsd) || 0)),
    priceLabel: String(o.priceLabel ?? "").trim(),
    hashrateSharePct: hasShare ? shareRaw : undefined,
    includeSetup: o.includeSetup === true,
    includeWarranty: o.includeWarranty === true,
  };
}

function parseLinesFromItemsJson(json: string): QuoteLineHistorySnap[] {
  if (!json?.trim()) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    const out: QuoteLineHistorySnap[] = [];
    for (const it of v) {
      const n = normalizeLineFromJson(it);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

function canonicalItemsJsonForCompare(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json.trim();
  }
}

/**
 * Si el carrito cambió respecto al JSON previo persistido, devuelve una entrada de historial (solo `sync`).
 */
export function buildCartHistoryEntryFromDiff(
  prevItemsJson: string,
  nextLines: QuoteLineHistorySnap[],
  nowIso: string
): CartHistoryEntry | null {
  const prevArr = parseLinesFromItemsJson(prevItemsJson);
  const prevSorted = stableSortHistoryLines(prevArr);
  const nextSorted = stableSortHistoryLines([...nextLines]);
  if (
    canonicalItemsJsonForCompare(JSON.stringify(prevSorted)) ===
    canonicalItemsJsonForCompare(JSON.stringify(nextSorted))
  ) {
    return null;
  }
  const prev = prevArr;
  const prevMap = new Map(prev.map((l) => [quoteLineMergeKey(l), l] as const));
  const nextMap = new Map(nextLines.map((l) => [quoteLineMergeKey(l), l] as const));

  const changes: CartHistoryChange[] = [];

  for (const [k, n] of nextMap) {
    const p = prevMap.get(k);
    if (!p) {
      changes.push({
        action: "added",
        productId: n.productId,
        productLabel: productLabelFromLine(n),
        qty: n.qty,
        includeSetup: n.includeSetup,
        includeWarranty: n.includeWarranty,
        hashrateSharePct: n.hashrateSharePct ?? null,
        priceUsd: n.priceUsd,
        priceLabel: n.priceLabel || undefined,
      });
      continue;
    }
    const qtyCh = p.qty !== n.qty;
    const stCh = p.includeSetup !== n.includeSetup;
    const waCh = p.includeWarranty !== n.includeWarranty;
    const shCh = (p.hashrateSharePct ?? null) !== (n.hashrateSharePct ?? null);
    const priceCh = p.priceUsd !== n.priceUsd || p.priceLabel !== n.priceLabel;
    if (qtyCh || stCh || waCh || shCh || priceCh) {
      changes.push({
        action: "updated",
        productId: n.productId,
        productLabel: productLabelFromLine(n),
        qty: n.qty,
        previousQty: qtyCh ? p.qty : undefined,
        includeSetup: n.includeSetup,
        previousIncludeSetup: stCh ? p.includeSetup : undefined,
        includeWarranty: n.includeWarranty,
        previousIncludeWarranty: waCh ? p.includeWarranty : undefined,
        hashrateSharePct: n.hashrateSharePct ?? null,
        previousHashrateSharePct: shCh ? (p.hashrateSharePct ?? null) : undefined,
        priceUsd: n.priceUsd,
        priceLabel: n.priceLabel || undefined,
      });
    }
  }

  for (const [k, p] of prevMap) {
    if (!nextMap.has(k)) {
      changes.push({
        action: "removed",
        productId: p.productId,
        productLabel: productLabelFromLine(p),
        qty: p.qty,
        includeSetup: p.includeSetup,
        includeWarranty: p.includeWarranty,
        hashrateSharePct: p.hashrateSharePct ?? null,
        priceUsd: p.priceUsd,
        priceLabel: p.priceLabel || undefined,
      });
    }
  }

  if (changes.length === 0) return null;
  changes.sort((a, b) => {
    const o = (x: CartHistoryChange) => (x.action === "added" ? 0 : x.action === "updated" ? 1 : 2);
    return o(a) - o(b) || a.productLabel.localeCompare(b.productLabel, "es");
  });
  return { at: nowIso, source: "sync", changes };
}

export function parseItemsCartHistoryFromRow(raw: unknown): CartHistoryEntry[] {
  try {
    const s = raw == null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
    const parsed = JSON.parse(String(s || "[]").trim() || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CartHistoryEntry[] = [];
    for (const it of parsed) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const at = String(o.at ?? "").trim();
      const source = o.source === "sync" ? "sync" : null;
      const chRaw = o.changes;
      if (!at || source !== "sync" || !Array.isArray(chRaw)) continue;
      const changes: CartHistoryChange[] = [];
      for (const c of chRaw) {
        if (!c || typeof c !== "object") continue;
        const co = c as Record<string, unknown>;
        const action = co.action;
        if (action !== "added" && action !== "removed" && action !== "updated") continue;
        const productId = String(co.productId ?? "").trim();
        const productLabel = String(co.productLabel ?? "").trim() || productId;
        if (!productId) continue;
        changes.push({
          action,
          productId,
          productLabel,
          qty: co.qty != null ? Math.round(Number(co.qty)) : undefined,
          previousQty: co.previousQty != null ? Math.round(Number(co.previousQty)) : undefined,
          includeSetup: co.includeSetup === true ? true : co.includeSetup === false ? false : undefined,
          previousIncludeSetup:
            co.previousIncludeSetup === true ? true : co.previousIncludeSetup === false ? false : undefined,
          includeWarranty: co.includeWarranty === true ? true : co.includeWarranty === false ? false : undefined,
          previousIncludeWarranty:
            co.previousIncludeWarranty === true ? true : co.previousIncludeWarranty === false ? false : undefined,
          hashrateSharePct:
            co.hashrateSharePct === null || co.hashrateSharePct === undefined
              ? null
              : Math.round(Number(co.hashrateSharePct)),
          previousHashrateSharePct:
            co.previousHashrateSharePct === null || co.previousHashrateSharePct === undefined
              ? undefined
              : Math.round(Number(co.previousHashrateSharePct)),
          priceUsd: co.priceUsd != null ? Math.round(Number(co.priceUsd)) : undefined,
          priceLabel: co.priceLabel != null ? String(co.priceLabel) : undefined,
        });
      }
      if (changes.length) out.push({ at, source: "sync", changes });
    }
    return out;
  } catch {
    return [];
  }
}

export async function appendMarketplaceTicketCartHistory(ticketId: number, entry: CartHistoryEntry): Promise<void> {
  if (!Number.isFinite(ticketId) || ticketId <= 0) return;
  const row = (await db
    .prepare("SELECT items_history_json FROM marketplace_quote_tickets WHERE id = ?")
    .get(ticketId)) as { items_history_json: string | null } | undefined;
  if (!row) return;
  const prevArr = parseItemsCartHistoryFromRow(row.items_history_json);
  const nextArr = [...prevArr, entry];
  const trimmed = nextArr.length > MAX_HISTORY_ENTRIES ? nextArr.slice(-MAX_HISTORY_ENTRIES) : nextArr;
  await db
    .prepare("UPDATE marketplace_quote_tickets SET items_history_json = ? WHERE id = ?")
    .run(JSON.stringify(trimmed), ticketId);
}
