const hasTrim = (s?: string): boolean => Boolean(s && String(s).trim());

/**
 * Cuando name2 es solo el apellido ya presente en el nombre principal (p. ej. "PIROTTO, JUAN PABLO" + name2 "PIROTTO"),
 * no debe mostrarse en la 2.ª columna de factura/recibo (vista previa y PDF).
 */
export function isRedundantInvoiceClientName2(primaryName?: string, name2?: string): boolean {
  const raw2 = String(name2 ?? "").trim();
  const raw1 = String(primaryName ?? "").trim();
  if (!raw2 || !raw1) return false;
  const u1 = raw1.toUpperCase();
  const u2 = raw2.toUpperCase();
  const commaHead = u1.split(",")[0]?.trim() ?? "";
  if (commaHead === u2) return true;
  const parts = u1.split(/\s+/).filter(Boolean);
  const lastWord = parts[parts.length - 1];
  if (parts.length >= 2 && lastWord === u2 && u2.length >= 3) return true;
  return false;
}

/** name2 para impresión / vista previa: vacío si es redundante con el nombre principal. */
export function effectiveInvoiceClientName2(primaryName?: string, name2?: string): string {
  const raw2 = String(name2 ?? "").trim();
  if (!raw2) return "";
  if (isRedundantInvoiceClientName2(primaryName, raw2)) return "";
  return raw2;
}

/** Nombres para columnas cliente: une apellido en name2 si no hay otro dato en col. 2. */
export function invoiceClientDisplayNames(
  primaryName?: string,
  name2?: string,
  phone2?: string,
  email2?: string,
  address2?: string,
  city2?: string
): { name1: string; name2: string } {
  const n1 = String(primaryName ?? "").trim();
  const n2 = effectiveInvoiceClientName2(primaryName, name2);
  const col2HasContact =
    hasTrim(phone2) || hasTrim(email2) || hasTrim(address2) || hasTrim(city2);
  if (n2 && !col2HasContact) {
    return { name1: `${n1} ${n2}`.trim(), name2: "" };
  }
  return { name1: n1, name2: n2 };
}

/** Persistir en el comprobante: no grabar clientName2 si solo duplica el apellido ya incluido en clientName. */
export function clientName2ForComprobante(primaryName?: string, name2?: string): string | undefined {
  const s = effectiveInvoiceClientName2(primaryName, name2);
  return s || undefined;
}

export function hasSecondaryClientColumn(
  primaryName: string | undefined,
  name2: string | undefined,
  phone2?: string,
  email2?: string,
  address2?: string,
  city2?: string
): boolean {
  const { name2: col2Name } = invoiceClientDisplayNames(
    primaryName,
    name2,
    phone2,
    email2,
    address2,
    city2
  );
  return (
    hasTrim(col2Name) ||
    hasTrim(phone2) ||
    hasTrim(email2) ||
    hasTrim(address2) ||
    hasTrim(city2)
  );
}
