import type { Invoice, EquipoASIC, Setup } from "./types";

const KEY = "facturas_hrs";
const KEY_ASIC = "facturas_hrs_asic";
const KEY_ASIC_LEGACY = "facturas_hrs_mineria"; // migración desde base "Minería" → ASIC

export function loadInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Invoice[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveInvoices(invoices: Invoice[]) {
  localStorage.setItem(KEY, JSON.stringify(invoices));
}

/** Base paralela: facturas, recibos y notas de crédito de equipos ASIC. */
export function loadInvoicesAsic(): Invoice[] {
  try {
    // 1) Leer clave nueva (asic)
    const raw = localStorage.getItem(KEY_ASIC);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Invoice[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        /* seguir a migración */
      }
    }

    // 2) Si asic está vacía o falla: leer clave antigua (mineria), migrar y devolver
    const legacyRaw = localStorage.getItem(KEY_ASIC_LEGACY);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw) as Invoice[];
        if (Array.isArray(legacy) && legacy.length > 0) {
          localStorage.setItem(KEY_ASIC, legacyRaw);
          localStorage.removeItem(KEY_ASIC_LEGACY);
          return legacy;
        }
      } catch {
        /* ignorar */
      }
    }

    if (raw) {
      try {
        const p = JSON.parse(raw) as Invoice[];
        if (Array.isArray(p)) return p;
      } catch {
        /* fallthrough */
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function saveInvoicesAsic(invoices: Invoice[]) {
  localStorage.setItem(KEY_ASIC, JSON.stringify(invoices));
}

const KEY_EQUIPOS_ASIC = "equipos_asic";

export function loadEquiposAsic(): EquipoASIC[] {
  try {
    const raw = localStorage.getItem(KEY_EQUIPOS_ASIC);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EquipoASIC[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveEquiposAsic(equipos: EquipoASIC[]) {
  localStorage.setItem(KEY_EQUIPOS_ASIC, JSON.stringify(equipos));
}

const KEY_SETUP = "setup";

export function loadSetup(): Setup[] {
  try {
    const raw = localStorage.getItem(KEY_SETUP);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Setup[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSetup(setups: Setup[]) {
  localStorage.setItem(KEY_SETUP, JSON.stringify(setups));
}
