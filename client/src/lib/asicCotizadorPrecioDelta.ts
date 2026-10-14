import type { AsicCostoEquipoItem } from "./api";

export type CotizadorPrecioMovimiento = "up" | "down" | "same";

export type CotizadorPrecioDelta = {
  movimiento: CotizadorPrecioMovimiento;
  prevPrecio: number;
  delta: number;
  prevFecha: string;
  ventanaKey: string;
};

const MES_ALIAS: Array<[RegExp, string]> = [
  [/\bseptiembre\b/g, "sep"],
  [/\bsetiembre\b/g, "sep"],
  [/\bfebrero\b/g, "feb"],
  [/\bdiciembre\b/g, "dic"],
  [/\bnoviembre\b/g, "nov"],
  [/\boctubre\b/g, "oct"],
  [/\bagosto\b/g, "ago"],
  [/\benero\b/g, "ene"],
  [/\bmarzo\b/g, "mar"],
  [/\babril\b/g, "abr"],
  [/\bjunio\b/g, "jun"],
  [/\bjulio\b/g, "jul"],
  [/\bmayo\b/g, "may"],
];

/** Normaliza SPOT / ENE-27 / DIC-ENE 2027 para no mezclar ventanas distintas. */
export function normalizeVentanaCotizador(obs: string | undefined): string {
  let t = String(obs ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return "";
  if (/^spot\b/.test(t)) return "spot";
  t = t.replace(/\b20(\d{2})\b/g, "$1");
  for (const [re, abbr] of MES_ALIAS) t = t.replace(re, abbr);
  t = t.replace(/[./_\s,]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return t;
}

function equipoSlotKey(r: Pick<AsicCostoEquipoItem, "marca" | "modelo" | "procesador" | "observaciones">): string {
  const eq = [r.marca, r.modelo, r.procesador]
    .map((s) => String(s || "").trim().toLocaleLowerCase("es"))
    .join("|");
  return `${eq}||${normalizeVentanaCotizador(r.observaciones)}`;
}

function createdMs(r: AsicCostoEquipoItem): number {
  const t = new Date(r.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Para cada fila, el movimiento vs el precio anterior del mismo modelo + misma ventana
 * (SPOT, ENE-27, FEB-27, DIC-ENE 2027, etc.).
 */
export function buildCotizadorPrecioDeltas(items: AsicCostoEquipoItem[]): Map<number, CotizadorPrecioDelta> {
  const sorted = [...items].sort((a, b) => {
    const dt = createdMs(a) - createdMs(b);
    if (dt !== 0) return dt;
    return a.id - b.id;
  });
  const lastBySlot = new Map<string, AsicCostoEquipoItem>();
  const out = new Map<number, CotizadorPrecioDelta>();
  for (const r of sorted) {
    const key = equipoSlotKey(r);
    const prev = lastBySlot.get(key);
    if (prev && Number.isFinite(prev.precioVenta) && Number.isFinite(r.precioVenta)) {
      const curr = Math.round(r.precioVenta);
      const prevP = Math.round(prev.precioVenta);
      const delta = curr - prevP;
      out.set(r.id, {
        movimiento: delta > 0 ? "up" : delta < 0 ? "down" : "same",
        prevPrecio: prevP,
        delta,
        prevFecha: prev.createdAt,
        ventanaKey: key,
      });
    }
    lastBySlot.set(key, r);
  }
  return out;
}
