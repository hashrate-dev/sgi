import type { EquipoASIC, LineItem, ReparacionTipo, Setup, TransporteFleteTipo } from "./types";

export type AsicCatalogs = {
  equiposAsic: EquipoASIC[];
  setups: Setup[];
  reparacionTipos: ReparacionTipo[];
  transporteFleteTipos: TransporteFleteTipo[];
};

function normLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bestNameMatch<T extends { nombre: string }>(label: string, options: readonly T[]): T | undefined {
  const n = normLabel(label);
  if (!n || options.length === 0) return undefined;
  const exact = options.find((o) => normLabel(o.nombre) === n);
  if (exact) return exact;
  let best: T | undefined;
  let bestScore = 0;
  for (const o of options) {
    const on = normLabel(o.nombre);
    if (!on) continue;
    if (n.includes(on) || on.includes(n)) {
      const score = Math.min(on.length, n.length);
      if (score > bestScore) {
        best = o;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Asigna equipo/setup/reparación/flete del catálogo cuando el ítem solo trae texto de factura (API/BD). */
export function enrichAsicLineItemFromCatalogs(item: LineItem, catalogs: AsicCatalogs): LineItem {
  if (item.equipoId || item.setupId || item.reparacionTipoId || item.transporteFleteTipoId) {
    return item;
  }

  const label = String(
    item.reparacionNombre || item.setupNombre || item.transporteFleteNombre || item.serviceName || ""
  ).trim();

  const rep = bestNameMatch(label, catalogs.reparacionTipos);
  if (rep) {
    return { ...item, reparacionTipoId: rep.id, reparacionNombre: rep.nombre };
  }

  const setup = bestNameMatch(label, catalogs.setups);
  if (setup) {
    return { ...item, setupId: setup.id, setupNombre: setup.nombre };
  }

  const flete = bestNameMatch(label, catalogs.transporteFleteTipos);
  if (flete) {
    return { ...item, transporteFleteTipoId: flete.id, transporteFleteNombre: flete.nombre };
  }

  for (const eq of catalogs.equiposAsic) {
    const marca = normLabel(eq.marcaEquipo);
    const modelo = normLabel(eq.modelo);
    const n = normLabel(label);
    if (marca && modelo && n.includes(marca) && n.includes(modelo)) {
      return {
        ...item,
        equipoId: eq.id,
        marcaEquipo: eq.marcaEquipo,
        modeloEquipo: eq.modelo,
        procesadorEquipo: eq.procesador,
      };
    }
  }

  const price = Number(item.price) || 0;
  if (price > 0) {
    const repByPrice = catalogs.reparacionTipos.filter((r) => r.precioUSD === price);
    if (repByPrice.length === 1) {
      const r = repByPrice[0]!;
      return { ...item, reparacionTipoId: r.id, reparacionNombre: r.nombre };
    }
  }

  return item;
}

export function enrichAsicLineItemsFromCatalogs(items: LineItem[], catalogs: AsicCatalogs): LineItem[] {
  return items.map((it) => enrichAsicLineItemFromCatalogs(it, catalogs));
}

export function asicLineItemHasCatalogSelection(it: LineItem): boolean {
  if (it.equipoId && it.marcaEquipo && it.modeloEquipo && it.procesadorEquipo) return true;
  if (it.setupId && it.setupNombre) return true;
  if (it.reparacionTipoId && it.reparacionNombre) return true;
  if (it.transporteFleteTipoId && it.transporteFleteNombre) return true;
  return Boolean(
    String(it.reparacionNombre || it.setupNombre || it.transporteFleteNombre || it.serviceName || "").trim()
  );
}

export function asicLineItemDisplayLabel(it: LineItem): string {
  if (it.reparacionNombre) return it.reparacionNombre;
  if (it.setupNombre) return it.setupNombre;
  if (it.transporteFleteNombre) return it.transporteFleteNombre;
  if (it.marcaEquipo && it.modeloEquipo && it.procesadorEquipo) {
    return `${it.marcaEquipo} - ${it.modeloEquipo} - ${it.procesadorEquipo}`;
  }
  return String(it.serviceName || "").trim();
}
