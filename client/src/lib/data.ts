import type { CatalogItem } from "./productUtils.js";

/** IDs de filtro = categoría (`algo` en cada ítem). Deben coincidir con `category` en BD o "general". */
export const FILTER_GROUPS: Array<{ id: string; labelKey: string }> = [
  { id: "Infraestructura", labelKey: "filter.cat.infra" },
  { id: "Cabling", labelKey: "filter.cat.cabling" },
  { id: "Cooling", labelKey: "filter.cat.cooling" },
  { id: "Software", labelKey: "filter.cat.software" },
  { id: "Servicios", labelKey: "filter.cat.services" },
];

const SEED: CatalogItem[] = [
  {
    name: 'Rack 19" 1U',
    description: "Chasis estándar para montaje en datacenter.",
    algo: "Infraestructura",
    priceUsd: 95,
  },
  {
    name: "PDU 8 salidas",
    description: "Unidad de distribución de energía para rack.",
    algo: "Infraestructura",
    priceUsd: 120,
  },
  {
    name: "Cable patch CAT6 2 m",
    description: "Cable de red categoría 6.",
    algo: "Cabling",
    priceUsd: 8.5,
  },
  {
    name: "Ventilador rack 120 mm",
    description: "Refrigeración auxiliar para gabinete.",
    algo: "Cooling",
    priceUsd: 35,
  },
  {
    name: "Licencia gestión remota (1 año)",
    description: "Acceso remoto seguro a equipos.",
    algo: "Software",
    priceUsd: 299,
  },
  {
    name: "Kit mantenimiento preventivo",
    description: "Inspección y limpieza programada (referencia).",
    algo: "Servicios",
    priceUsd: 150,
  },
];

export const PRODUCTS: CatalogItem[] = [...SEED];

export function replaceCatalog(next: CatalogItem[]): void {
  PRODUCTS.length = 0;
  PRODUCTS.push(...next);
}
