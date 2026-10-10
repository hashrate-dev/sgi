import { builtinHostingServiceCatalog, matchHostingServiceKey } from "./hostingServiceCatalog";
import { getLineItemDescription } from "./invoiceLineItemDescription";
import { getReceiptSettlementRowKind } from "./receiptSettlementLine";
import type { LineItem } from "./types";

function inferServiceKey(item: LineItem): string {
  const label = String(item.serviceName ?? item.service ?? "").trim();
  const fromName = matchHostingServiceKey(label, builtinHostingServiceCatalog);
  if (fromName) return fromName;
  const k = String(item.serviceKey ?? "").trim();
  if (k && builtinHostingServiceCatalog[k]) return k;
  if (k) return k;
  return "A";
}

/** Normaliza ítem de API/DB/localStorage antes de armar el PDF (service + serviceName + mes). */
export function prepareLineItemForPdf(item: LineItem, fallbackMonth?: string): LineItem {
  const serviceText = String(item.serviceName ?? item.service ?? "").trim();
  const month = item.month || fallbackMonth || "";
  const base: LineItem = {
    ...item,
    serviceName: serviceText,
    service: String(item.service ?? item.serviceName ?? "").trim() || serviceText,
    month,
  };
  const settlement = base.reciboLineKind ?? getReceiptSettlementRowKind(base);
  if (settlement) {
    const prepared: LineItem = {
      ...base,
      reciboLineKind: settlement,
      serviceName: serviceText || "Documento",
      service: serviceText || "Documento",
    };
    const desc = getLineItemDescription(prepared);
    return { ...prepared, service: desc, serviceName: desc };
  }
  const serviceKey = inferServiceKey(base);
  const catalogName = builtinHostingServiceCatalog[serviceKey]?.name ?? "Servicio";
  const prepared: LineItem = {
    ...base,
    serviceKey,
    serviceName: serviceText || catalogName,
    service: serviceText || catalogName,
  };
  const desc = getLineItemDescription(prepared);
  return { ...prepared, service: desc, serviceName: desc };
}

export function prepareLineItemsForPdf(items: LineItem[], fallbackMonth?: string): LineItem[] {
  return items.map((it) => prepareLineItemForPdf(it, fallbackMonth));
}
