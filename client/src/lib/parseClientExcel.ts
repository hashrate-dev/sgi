import ExcelJS from "exceljs";

export type ClientRow = {
  code: string;
  name: string;
  name2?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  email2?: string;
  address?: string;
  address2?: string;
  city?: string;
  city2?: string;
};

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300/g, "")
    .trim();
}

function findCol(headerRow: (string | number)[], ...names: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(String(headerRow[i] ?? ""));
    for (const n of names) {
      const k = normalizeHeader(n);
      if (h === k || h.includes(k) || k.includes(h)) return i;
    }
  }
  return -1;
}

/** Extrae el número más alto de una lista de códigos (ej: "1","C002","10" -> 10) */
function getMaxNumericCode(codes: string[]): number {
  let max = 0;
  for (const c of codes) {
    const n = parseInt(String(c).trim(), 10);
    if (!isNaN(n)) {
      max = Math.max(max, n);
    } else {
      const m = String(c).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max;
}

export type ParseExcelOptions = {
  /** Códigos existentes en la base: los duplicados se omitirán en el servidor; para filas sin código se asigna el siguiente al máximo */
  existingCodes?: string[];
};

export async function parseExcelFile(file: File, options?: ParseExcelOptions): Promise<ClientRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: (string | number)[][] = [];
  sheet.eachRow((row) => rows.push(row.values as (string | number)[]));
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  const idx = {
    code: findCol(headerRow, "codigo", "código", "code"),
    name: findCol(headerRow, "nombre o razon social 1", "nombre o razón social 1", "nombre", "razon social", "name"),
    name2: findCol(headerRow, "nombre o razon social 2", "nombre o razón social 2", "nombre 2", "nombre2"),
    phone: findCol(headerRow, "teléfono 1", "telefono 1", "teléfono", "telefono", "phone"),
    phone2: findCol(headerRow, "teléfono 2", "telefono 2", "phone2"),
    email: findCol(headerRow, "email1", "email 1", "email", "correo"),
    email2: findCol(headerRow, "email2", "email 2"),
    address: findCol(headerRow, "dirección 1", "direccion 1", "dirección", "direccion", "address"),
    address2: findCol(headerRow, "direccion 2", "dirección 2", "address2"),
    city: findCol(headerRow, "ciudad / pais 1", "ciudad / país 1", "ciudad", "pais", "city"),
    city2: findCol(headerRow, "ciudad / pais 2", "ciudad / país 2", "city2")
  };
  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";

  const existingCodesSet = new Set((options?.existingCodes ?? []).map((c) => String(c).trim()).filter(Boolean));
  const usedCodes = new Set<string>(existingCodesSet);
  let nextCode = getMaxNumericCode([...existingCodesSet]) + 1;

  const result: ClientRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    let code = idx.code >= 0 ? get(row, idx.code) : get(row, 1);
    const name = idx.name >= 0 ? get(row, idx.name) : get(row, 2);
    if (!code && !name) continue;
    if (!code) {
      while (usedCodes.has(String(nextCode))) nextCode++;
      code = String(nextCode++);
    } else {
      if (existingCodesSet.has(code)) continue;
      while (usedCodes.has(code)) {
        code = `${code}-${r}`;
      }
    }
    usedCodes.add(code);
    result.push({
      code,
      name: name || "Sin nombre",
      name2: idx.name2 >= 0 ? get(row, idx.name2) || undefined : undefined,
      phone: idx.phone >= 0 ? get(row, idx.phone) || undefined : undefined,
      phone2: idx.phone2 >= 0 ? get(row, idx.phone2) || undefined : undefined,
      email: idx.email >= 0 ? get(row, idx.email) || undefined : undefined,
      email2: idx.email2 >= 0 ? get(row, idx.email2) || undefined : undefined,
      address: idx.address >= 0 ? get(row, idx.address) || undefined : undefined,
      address2: idx.address2 >= 0 ? get(row, idx.address2) || undefined : undefined,
      city: idx.city >= 0 ? get(row, idx.city) || undefined : undefined,
      city2: idx.city2 >= 0 ? get(row, idx.city2) || undefined : undefined
    });
  }
  return result;
}
