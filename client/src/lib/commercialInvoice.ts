/** Commercial invoice (export / hosting) — IN00101, IN00102, … */

export type CommercialInvoiceItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** `equipo_<id>` | `shipping` | `custom` */
  catalogKey?: string;
  kind?: "goods" | "shipping";
  serialNumber?: string;
  shippingCarrier?: string;
  shippingFrom?: string;
  shippingTo?: string;
};

export type CommercialInvoiceFields = {
  numberSuffix: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  poNumber: string;
  paymentTerms: string;
  paymentMethod: string;
  incoterms: string;
  originCountry: string;
  destinationCountry: string;
  sellerName: string;
  sellerAddress: string;
  sellerCity: string;
  sellerCountry: string;
  sellerTaxId: string;
  sellerEmail: string;
  sellerPhone: string;
  sellerWeb: string;
  buyerName: string;
  buyerAddress: string;
  buyerCity: string;
  buyerCountry: string;
  buyerTaxId: string;
  buyerEmail: string;
  buyerPhone: string;
  notes: string;
  bankDetails: string;
  taxLabel: string;
  taxAmount: number;
  goodsStatus: string;
  shipmentPurpose: string;
  goodsOriginCountry: string;
  items: CommercialInvoiceItem[];
};

export type CommercialInvoice = CommercialInvoiceFields & {
  id: number;
  number: string;
  seqYear: number;
  seqNum: number;
  subtotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

export const COMMERCIAL_INVOICE_NUMBER_PREFIX = "IN";
export const COMMERCIAL_INVOICE_NUMBER_PAD = 5;
/** Primer número automático: IN00101 */
export const COMMERCIAL_INVOICE_FIRST_SEQ = 101;

export function formatCommercialInvoiceNumber(seq: number): string {
  const n = Math.max(0, Math.trunc(seq));
  return `${COMMERCIAL_INVOICE_NUMBER_PREFIX}${String(n).padStart(COMMERCIAL_INVOICE_NUMBER_PAD, "0")}`;
}

export function emptyCommercialInvoiceItem(): CommercialInvoiceItem {
  return { kind: "goods", description: "", quantity: 1, unit: "un", unitPrice: 0 };
}

export const COMMERCIAL_INVOICE_SHIPPING_CARRIERS = [
  "DHL",
  "FedEx",
  "UPS",
  "TNT",
  "Aramex",
  "DPD",
  "Freight",
  "Otro",
] as const;

export function isCommercialInvoiceShippingItem(item: CommercialInvoiceItem): boolean {
  return item.kind === "shipping" || item.catalogKey === "shipping";
}

export function commercialInvoiceShippingDescription(item: Pick<CommercialInvoiceItem, "shippingCarrier" | "shippingFrom" | "shippingTo">): string {
  const carrier = (item.shippingCarrier || "DHL").trim() || "DHL";
  const from = (item.shippingFrom || "").trim();
  const to = (item.shippingTo || "").trim();
  const route = from && to ? `${from}-${to}` : from || to;
  return route ? `Shipping ${carrier} ${route}` : `Shipping ${carrier}`;
}

export function emptyCommercialInvoiceShippingItem(from = "", to = ""): CommercialInvoiceItem {
  const base = {
    kind: "shipping" as const,
    catalogKey: "shipping",
    shippingCarrier: "DHL",
    shippingFrom: from,
    shippingTo: to,
    quantity: 1,
    unit: "un",
    unitPrice: 0,
    description: "",
  };
  return { ...base, description: commercialInvoiceShippingDescription(base) };
}

export function patchCommercialInvoiceShipping(
  item: CommercialInvoiceItem,
  patch: Partial<Pick<CommercialInvoiceItem, "shippingCarrier" | "shippingFrom" | "shippingTo" | "unitPrice" | "quantity">>
): CommercialInvoiceItem {
  const next = { ...item, kind: "shipping" as const, catalogKey: "shipping", ...patch };
  return { ...next, description: commercialInvoiceShippingDescription(next) };
}

export function commercialInvoiceLineAmount(item: CommercialInvoiceItem): number {
  const q = Number(item.quantity);
  const p = Number(item.unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return Math.round(q * p * 100) / 100;
}

export function commercialInvoicePartyTitle(kind: "sender" | "recipient", country: string): string {
  const base =
    kind === "sender" ? "1. SENDER / EXPEDIDOR" : "2. RECIPIENT / CONSIGNATARIO";
  const c = country.trim();
  return c ? `${base} (${c})` : base;
}

export function commercialInvoiceSenderRows(fields: CommercialInvoiceFields): Array<[string, string]> {
  return [
    ["Name / Nombre", fields.sellerName],
    ["Identification / Cédula o Pasaporte", fields.sellerTaxId],
    ["Address / Dirección", [fields.sellerAddress, fields.sellerCity].filter((s) => s.trim()).join(", ")],
    ["Phone / Teléfono", fields.sellerPhone],
    ["Email / Correo", fields.sellerEmail],
  ];
}

export function commercialInvoiceRecipientRows(fields: CommercialInvoiceFields): Array<[string, string]> {
  return [
    ["Name / Nombre", fields.buyerName],
    ["RUC / Tax ID", fields.buyerTaxId],
    ["Address / Dirección", [fields.buyerAddress, fields.buyerCity].filter((s) => s.trim()).join(", ")],
    ["Phone / Teléfono", fields.buyerPhone],
    ["Email / Correo", fields.buyerEmail],
  ];
}

export function commercialInvoiceMoney(n: number): string {
  const [int, dec] = (Number.isFinite(n) ? n : 0).toFixed(2).split(".");
  return `$${int},${dec}`;
}

export function commercialInvoiceDateLong(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "—";
  const dt = new Date(`${ymd}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function words0to999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r >= 10 && r < 20) parts.push(TEENS[r - 10]!);
  else {
    const t = Math.floor(r / 10);
    const o = r % 10;
    if (t) parts.push(o ? `${TENS[t]}-${ONES[o]}` : TENS[t]!);
    else if (o) parts.push(ONES[o]!);
  }
  return parts.join(" ");
}

export function commercialInvoiceUsdInWords(amount: number): string {
  const n = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
  const dollars = Math.floor(n);
  const cents = Math.round((n - dollars) * 100);
  const groups = [
    { v: Math.floor(dollars / 1_000_000), w: "million" },
    { v: Math.floor((dollars % 1_000_000) / 1000), w: "thousand" },
    { v: dollars % 1000, w: "" },
  ];
  const dollarWords = groups
    .filter((g) => g.v)
    .map((g) => [words0to999(g.v), g.w].filter(Boolean).join(" "))
    .join(" ");
  const d = dollarWords || "zero";
  const dollarLabel = dollars === 1 ? "dollar" : "dollars";
  let text = `${d} ${dollarLabel}`;
  if (cents) {
    const c = words0to999(cents);
    text += ` and ${c} ${cents === 1 ? "cent" : "cents"}`;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Incoterms 2020 — valor que se imprime en el documento. */
export const COMMERCIAL_INVOICE_SHIPMENT_PURPOSES = [
  "Shipment of used equipment / Envío de equipos usados",
  "Shipment of new equipment / Envío de equipos nuevos",
] as const;

export const COMMERCIAL_INVOICE_INCOTERMS = [
  "EXW (Ex Works)",
  "FCA (Free Carrier)",
  "CPT (Carriage Paid To)",
  "CIP (Carriage and Insurance Paid To)",
  "DAP (Delivered At Place)",
  "DPU (Delivered at Place Unloaded)",
  "DDP (Delivered Duty Paid)",
  "FAS (Free Alongside Ship)",
  "FOB (Free On Board)",
  "CFR (Cost and Freight)",
  "CIF (Cost, Insurance and Freight)",
] as const;

export const COMMERCIAL_INVOICE_DECLARATION_EN =
  "I hereby declare that the information on this invoice is true and correct and that the contents of this shipment are as stated above.";

export const COMMERCIAL_INVOICE_DECLARATION_ES =
  "Por la presente declaro que la información contenida en esta factura es verídica y correcta, y que el contenido de este envío es el indicado anteriormente.";

export function commercialInvoiceTotals(items: CommercialInvoiceItem[], taxAmount: number): { subtotal: number; total: number } {
  const subtotal = Math.round(items.reduce((s, it) => s + commercialInvoiceLineAmount(it), 0) * 100) / 100;
  const tax = Number.isFinite(taxAmount) ? taxAmount : 0;
  return { subtotal, total: Math.round((subtotal + tax) * 100) / 100 };
}

export function defaultCommercialInvoiceFields(): CommercialInvoiceFields {
  const today = new Date().toISOString().slice(0, 10);
  return {
    numberSuffix: "",
    invoiceDate: today,
    dueDate: today,
    currency: "USD",
    poNumber: "",
    paymentTerms: "Due on receipt",
    paymentMethod: "Wire transfer",
    incoterms: "DAP (Delivered At Place)",
    originCountry: "",
    destinationCountry: "",
    sellerName: "",
    sellerAddress: "",
    sellerCity: "",
    sellerCountry: "",
    sellerTaxId: "",
    sellerEmail: "",
    sellerPhone: "",
    sellerWeb: "",
    buyerName: "",
    buyerAddress: "",
    buyerCity: "",
    buyerCountry: "",
    buyerTaxId: "",
    buyerEmail: "",
    buyerPhone: "",
    notes: "",
    bankDetails: "",
    taxLabel: "Tax",
    taxAmount: 0,
    goodsStatus: "Used / Usado",
    shipmentPurpose: "Shipment of used equipment / Envío de equipos usados",
    goodsOriginCountry: "",
    items: [emptyCommercialInvoiceItem()],
  };
}

const LAST_KEY = "hrs_commercial_invoice_last";

export function rememberCommercialInvoiceDraft(fields: CommercialInvoiceFields): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(fields));
  } catch {
    /* ignore quota */
  }
}

export function recallCommercialInvoiceDraft(): CommercialInvoiceFields | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CommercialInvoiceFields>;
    return {
      ...defaultCommercialInvoiceFields(),
      ...parsed,
      buyerPhone: parsed.buyerPhone ?? "",
      goodsStatus: parsed.goodsStatus ?? "Used / Usado",
      shipmentPurpose: parsed.shipmentPurpose ?? "Shipment of used equipment / Envío de equipos usados",
      goodsOriginCountry: parsed.goodsOriginCountry ?? "",
      items: Array.isArray(parsed.items) && parsed.items.length ? parsed.items : defaultCommercialInvoiceFields().items,
    };
  } catch {
    return null;
  }
}
