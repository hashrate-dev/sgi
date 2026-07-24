import { serviceCatalog } from "./constants";
import { getLineItemDescription } from "./invoiceLineItemDescription";
import { getReceiptSettlementRowKind } from "./receiptSettlementLine";
import type { LineItem } from "./types";

function inferServiceKey(item: LineItem): "A" | "B" | "C" | "D" {
  const label = String(item.serviceName ?? item.service ?? "").trim();
  // Preferir el modelo en el texto (evita serviceKey desactualizado → Descuento L7 con servicio S21)
  if (label.includes("4%") || label.includes("Gastos Operativos Transferencia")) return "D";
  if (/\bS21\b/i.test(label)) return "C";
  if (/\bL9\b/i.test(label)) return "B";
  if (/\bL7\b/i.test(label)) return "A";
  const k = item.serviceKey as "A" | "B" | "C" | "D" | undefined;
  if (k) return k;
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
  const catalogName = serviceCatalog[serviceKey].name;
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
