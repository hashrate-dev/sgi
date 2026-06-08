import { getInvoices, wakeUpBackend } from "./api";
import { loadInvoicesAsic } from "./storage";
import type { ComprobanteType, Invoice } from "./types";

type ApiInvoiceRow = NonNullable<Awaited<ReturnType<typeof getInvoices>>["invoices"]>[number];

export function isNumericInvoiceId(id: string | undefined): boolean {
  return typeof id === "string" && /^\d+$/.test(id);
}

export function mapApiInvoiceToInvoice(inv: ApiInvoiceRow): Invoice {
  return {
    id: String(inv.id),
    number: inv.number,
    type: inv.type as ComprobanteType,
    clientName: inv.clientName,
    date: inv.date,
    month: inv.month ?? "",
    subtotal: inv.subtotal,
    discounts: inv.discounts,
    total: inv.total,
    relatedInvoiceId: inv.relatedInvoiceId != null ? String(inv.relatedInvoiceId) : undefined,
    relatedInvoiceNumber: inv.relatedInvoiceNumber,
    paymentDate: inv.paymentDate,
    emissionTime: inv.emissionTime,
    dueDate: inv.dueDate,
    items: [],
  };
}

/** Une listas priorizando ids numéricos de base de datos. */
export function mergeInvoiceLists(...sources: Invoice[][]): Invoice[] {
  const map = new Map<string, Invoice>();
  for (const src of sources) {
    for (const inv of src) {
      const key = `${inv.type}-${inv.number}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, inv);
        continue;
      }
      if (!isNumericInvoiceId(prev.id) && isNumericInvoiceId(inv.id)) {
        map.set(key, inv);
      }
    }
  }
  return Array.from(map.values());
}

function collectReferencedFacturaKeys(asicDocs: Invoice[]): { numbers: Set<string>; ids: Set<string> } {
  const numbers = new Set<string>();
  const ids = new Set<string>();
  for (const inv of asicDocs) {
    if (inv.type !== "Recibo" && inv.type !== "Nota de Crédito") continue;
    if (inv.relatedInvoiceNumber?.trim()) numbers.add(inv.relatedInvoiceNumber.trim());
    if (inv.relatedInvoiceId) ids.add(String(inv.relatedInvoiceId));
  }
  return { numbers, ids };
}

/**
 * Ledger ASIC para pendientes/historial: API (source=asic + facturas referenciadas) + localStorage.
 */
export async function fetchAsicInvoiceLedger(): Promise<Invoice[]> {
  await wakeUpBackend();
  const [asicRes, allRes] = await Promise.all([getInvoices({ source: "asic" }), getInvoices()]);

  const asicFromApi = (asicRes.invoices ?? []).map(mapApiInvoiceToInvoice);
  const allFromApi = (allRes.invoices ?? []).map(mapApiInvoiceToInvoice);
  const refs = collectReferencedFacturaKeys(asicFromApi);

  for (const row of allRes.invoices ?? []) {
    if (row.source !== "asic") continue;
    const inv = mapApiInvoiceToInvoice(row);
    if (inv.type === "Recibo" || inv.type === "Nota de Crédito") {
      if (inv.relatedInvoiceNumber?.trim()) refs.numbers.add(inv.relatedInvoiceNumber.trim());
      if (inv.relatedInvoiceId) refs.ids.add(String(inv.relatedInvoiceId));
    }
  }

  const supplemental: Invoice[] = [];
  for (const inv of allFromApi) {
    const row = (allRes.invoices ?? []).find((a) => String(a.id) === inv.id);
    if (row?.source === "asic") {
      supplemental.push(inv);
      continue;
    }
    if (inv.type === "Factura") {
      if (refs.numbers.has(inv.number) || refs.ids.has(String(inv.id))) {
        supplemental.push(inv);
      }
    }
  }

  return mergeInvoiceLists(loadInvoicesAsic(), asicFromApi, supplemental);
}
