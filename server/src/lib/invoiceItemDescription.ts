/** Compacta "S21 - 05-2026" → "S21-05-2026" al guardar ítems de factura. */
export function normalizeInvoiceServiceStored(service: string): string {
  return String(service ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+(\d{1,2}-\d{4})/g, (_, my: string) => {
      const parts = my.split("-");
      const mm = parts[0] ?? "";
      const yyyy = parts[1] ?? "";
      const mmPad = mm.length === 1 ? `0${mm}` : mm;
      return `-${mmPad}-${yyyy}`;
    });
}
