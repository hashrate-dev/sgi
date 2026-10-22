import type { Client } from "./types";

/** Comprobante ASIC ya emitido, tal como lo devuelve el listado. */
export type AsicBillingDoc = {
  id: number;
  number: string;
  type: string;
  clientName: string;
  date: string;
  total: number;
  relatedInvoiceId?: number;
  relatedInvoiceNumber?: string;
  documentContext?: "factura" | "comprobante-pago" | "garantia-ande" | "recibo-parcial";
};

export type AsicPedidoBillingHit = {
  invoice: AsicBillingDoc;
  receipt: AsicBillingDoc | null;
  /** True cuando el titular de la factura es el mismo nombre del pedido. */
  sameName: boolean;
  reason: string;
};

const NAME_STOP = new Set([
  "llc",
  "sa",
  "sas",
  "srl",
  "spa",
  "ltd",
  "ltda",
  "inc",
  "de",
  "del",
  "la",
  "los",
  "las",
  "y",
  "and",
  "the",
]);

function foldName(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(raw: string): string[] {
  return foldName(raw)
    .split(" ")
    .filter((word) => word.length >= 3 && !NAME_STOP.has(word));
}

/** Misma persona o misma razón social, aunque el orden de las palabras cambie. */
export function sameBillingParty(a: string, b: string): boolean {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const sa = [...ta].sort().join(" ");
  const sb = [...tb].sort().join(" ");
  if (sa === sb) return true;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return shorter.length >= 2 && shorter.every((token) => longer.includes(token));
}

function clientNames(client: Client): string[] {
  return [client.name, client.name2].map((value) => String(value ?? "").trim()).filter(Boolean);
}

function pedidoLabel(cliente: string): string {
  return String(cliente ?? "")
    .replace(/^[A-Za-z0-9]+\s*-\s*/, "")
    .trim();
}

function findOrderClient(clients: Client[], clientId: number | null, cliente: string): Client | undefined {
  if (clientId != null) {
    const byId = clients.find((client) => Number(client.id) === Number(clientId));
    if (byId) return byId;
  }
  const label = pedidoLabel(cliente);
  return clients.find((client) => clientNames(client).some((name) => sameBillingParty(name, label) || sameBillingParty(name, cliente)));
}

/**
 * Nombres con los que puede estar emitida la factura de este pedido.
 * Incluye la razón social y el representante (nombre 2), y el cliente vinculado
 * cuando la factura sale a nombre de una LLC y los equipos son de la persona.
 */
export function billingNamesForPedido(clients: Client[], clientId: number | null, cliente: string): string[] {
  const seed = findOrderClient(clients, clientId, cliente);
  const known = new Set<string>();
  const add = (value: string) => {
    const text = String(value ?? "").trim();
    if (text) known.add(text);
  };
  add(pedidoLabel(cliente));
  if (seed) clientNames(seed).forEach(add);

  let grew = true;
  while (grew) {
    grew = false;
    for (const client of clients) {
      const names = clientNames(client);
      const linked = names.some((name) => [...known].some((current) => sameBillingParty(name, current)));
      if (!linked) continue;
      for (const name of names) {
        if ([...known].some((current) => current === name)) continue;
        add(name);
        grew = true;
      }
    }
  }
  return [...known];
}

function invoiceMatchesNames(clientName: string, names: string[]): boolean {
  return names.some((name) => sameBillingParty(clientName, name));
}

function reasonForInvoice(
  invoiceName: string,
  orderClient: Client | undefined,
  cliente: string
): { sameName: boolean; reason: string } {
  const primary = String(orderClient?.name ?? "").trim() || pedidoLabel(cliente);
  const representative = String(orderClient?.name2 ?? "").trim();
  const billedToPrimary = sameBillingParty(invoiceName, primary);
  const billedToRepresentative = Boolean(representative) && sameBillingParty(invoiceName, representative);

  if (billedToPrimary && representative && !billedToRepresentative) {
    return {
      sameName: true,
      reason: `A nombre de ${invoiceName}. Representante: ${representative}.`,
    };
  }
  if (billedToPrimary) {
    return { sameName: true, reason: "Factura a nombre de este cliente." };
  }
  if (billedToRepresentative) {
    return {
      sameName: false,
      reason: `La factura está a nombre de ${invoiceName}, la otra razón social de ${primary}.`,
    };
  }
  return {
    sameName: false,
    reason: `La factura está a nombre de ${invoiceName}. Los equipos son de ${primary}.`,
  };
}

function dateRank(raw: string): number {
  const iso = asicBillingDateToIso(raw);
  if (!iso) return 0;
  const n = Number(iso.replace(/-/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Fecha de comprobante (ISO o DD/MM/AAAA) al formato del input date. */
export function asicBillingDateToIso(raw: string): string {
  const text = String(raw ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!dmy) return "";
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

function isCreditInvoice(doc: AsicBillingDoc): boolean {
  return doc.type === "Factura" && doc.documentContext === "factura";
}

function isPaymentVoucher(doc: AsicBillingDoc): boolean {
  return doc.type === "Factura" && doc.documentContext !== "factura" && doc.documentContext !== "garantia-ande";
}

function receiptFor(invoice: AsicBillingDoc, recibos: AsicBillingDoc[]): AsicBillingDoc | null {
  return (
    recibos.find((recibo) => {
      if (recibo.relatedInvoiceNumber && recibo.relatedInvoiceNumber === invoice.number) return true;
      if (recibo.relatedInvoiceId != null && Number(recibo.relatedInvoiceId) === Number(invoice.id)) return true;
      return false;
    }) ?? null
  );
}

/** Facturas crédito y comprobantes de pago ya emitidos que corresponden a este pedido. */
export function matchAsicPedidoBilling(opts: {
  cliente: string;
  clientId: number | null;
  clients: Client[];
  invoices: AsicBillingDoc[];
}): { credit: AsicPedidoBillingHit[]; vouchers: AsicBillingDoc[] } {
  const names = billingNamesForPedido(opts.clients, opts.clientId, opts.cliente);
  const orderClient = findOrderClient(opts.clients, opts.clientId, opts.cliente);
  const related = opts.invoices.filter(
    (doc) => doc.documentContext !== "garantia-ande" && invoiceMatchesNames(doc.clientName, names)
  );
  const recibos = related.filter((doc) => doc.type === "Recibo");
  const credit = related
    .filter(isCreditInvoice)
    .map((invoice) => {
      const link = reasonForInvoice(invoice.clientName, orderClient, opts.cliente);
      return {
        invoice,
        receipt: receiptFor(invoice, recibos),
        sameName: link.sameName,
        reason: link.reason,
      };
    })
    .sort((a, b) => dateRank(b.invoice.date) - dateRank(a.invoice.date) || b.invoice.id - a.invoice.id);
  const vouchers = related
    .filter(isPaymentVoucher)
    .sort((a, b) => dateRank(b.date) - dateRank(a.date) || b.id - a.id);
  return { credit, vouchers };
}
