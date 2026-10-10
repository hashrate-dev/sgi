export type HostingBillingService = {
  code: string;
  name: string;
  price: number;
  builtin: boolean;
};

export const HOSTING_TRANSFER_COMMISSION_KEY = "D";

const LODGING_BUILTIN_ORDER = ["A", "B", "C", "E"] as const;

export const BUILTIN_HOSTING_BILLING_SERVICES: readonly HostingBillingService[] = [
  { code: "A", name: "Servicio alojamiento y mantenimiento L7", price: 100, builtin: true },
  { code: "B", name: "Servicio alojamiento y mantenimiento L9", price: 250, builtin: true },
  { code: "C", name: "Servicio alojamiento y mantenimiento S21", price: 500, builtin: true },
  { code: "E", name: "Servicio alojamiento y mantenimiento Z15", price: 0, builtin: true },
  { code: "D", name: "4% Gastos Operativos Transferencia", price: 0, builtin: true },
];

export const builtinHostingServiceCatalog: Record<string, { name: string; price: number }> = Object.fromEntries(
  BUILTIN_HOSTING_BILLING_SERVICES.map((s) => [s.code, { name: s.name, price: s.price }])
);

export function hostingServiceCatalogMap(
  extras: Array<Pick<HostingBillingService, "code" | "name" | "price">> | null | undefined
): Record<string, { name: string; price: number }> {
  const out: Record<string, { name: string; price: number }> = { ...builtinHostingServiceCatalog };
  for (const s of Array.isArray(extras) ? extras : []) {
    const code = String(s.code ?? "").trim().toUpperCase();
    if (!code || code === HOSTING_TRANSFER_COMMISSION_KEY) continue;
    if (builtinHostingServiceCatalog[code]) continue;
    const name = String(s.name ?? "").trim();
    if (!name) continue;
    const price = Number(s.price);
    out[code] = { name, price: Number.isFinite(price) ? price : 0 };
  }
  return out;
}

export function hostingServiceSelectOptions(
  catalog: Record<string, { name: string; price: number }>
): Array<{ code: string; name: string }> {
  const opts: Array<{ code: string; name: string }> = [];
  const used = new Set<string>();
  for (const c of LODGING_BUILTIN_ORDER) {
    const ent = catalog[c];
    if (!ent) continue;
    opts.push({ code: c, name: ent.name });
    used.add(c);
  }
  const extras = Object.keys(catalog)
    .filter((k) => !used.has(k) && k !== HOSTING_TRANSFER_COMMISSION_KEY)
    .sort((a, b) => catalog[a]!.name.localeCompare(catalog[b]!.name, "es"));
  for (const k of extras) {
    opts.push({ code: k, name: catalog[k]!.name });
    used.add(k);
  }
  const d = catalog[HOSTING_TRANSFER_COMMISSION_KEY];
  if (d) opts.push({ code: HOSTING_TRANSFER_COMMISSION_KEY, name: d.name });
  return opts;
}

export function isHostingTransferCommissionKey(key: string | undefined | null): boolean {
  return String(key ?? "").trim() === HOSTING_TRANSFER_COMMISSION_KEY;
}

export function matchHostingServiceKey(
  serviceName: string,
  catalog: Record<string, { name: string; price: number }>
): string | undefined {
  const n = String(serviceName ?? "").trim();
  if (!n) return undefined;
  const exact = Object.keys(catalog).find((k) => catalog[k]!.name === n);
  if (exact) return exact;
  if (/4%\s*gastos operativos transferencia/i.test(n)) return HOSTING_TRANSFER_COMMISSION_KEY;
  if (/\bZ15\b/i.test(n)) return "E";
  if (/\bS21\b/i.test(n)) return "C";
  if (/\bL9\b/i.test(n)) return "B";
  if (/\bL7\b/i.test(n)) return "A";
  return undefined;
}
