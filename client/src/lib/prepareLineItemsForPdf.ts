import { serviceCatalog } from "./constants";
import { getReceiptSettlementRowKind } from "./receiptSettlementLine";
import type { LineItem } from "./types";

function inferServiceKey(item: LineItem): "A" | "B" | "C" | "D" {
  const k = item.serviceKey as "A" | "B" | "C" | "D" | undefined;
  if (k) return k;
  const label = String(item.serviceName ?? item.service ?? "").trim();
  if (label.includes("4%") || label.includes("Gastos Operativos Transferencia")) return "D";
  if (label.includes("L9")) return "B";
  if (label.includes("L7")) return "A";
  if (label.includes("S21")) return "C";
  const byCatalog = (["A", "B", "C", "D"] as const).find(
    (key) => serviceCatalog[key].name === label || serviceCatalog[key].price === item.price
  );
  return byCatalog ?? "A";
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
    return {
      ...base,
      reciboLineKind: settlement,
      serviceName: serviceText || "Documento",
      service: serviceText || "Documento",
    };
  }
  const serviceKey = inferServiceKey(base);
  const catalogName = serviceCatalog[serviceKey].name;
  return {
    ...base,
    serviceKey,
    serviceName: serviceText || catalogName,
    service: serviceText || catalogName,
  };
}

export function prepareLineItemsForPdf(items: LineItem[], fallbackMonth?: string): LineItem[] {
  return items.map((it) => prepareLineItemForPdf(it, fallbackMonth));
}
