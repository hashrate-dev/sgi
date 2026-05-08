/**
 * Catálogo consulta Lector (alineado con `server/src/lib/lectorPermissions.ts`).
 */
export type LectorPermissionKey =
  | "facturacion"
  | "clientes"
  | "equipos"
  | "equipos_tienda"
  | "garantias"
  | "setups"
  | "finanzas_contabilidad"
  | "finanzas_proveedores"
  | "finanzas_asic_costos"
  | "hosting_tipo_cambio"
  | "reportes"
  | "exportar";

export type LectorPermissionCatalogItem = {
  key: LectorPermissionKey;
  label: string;
  description: string;
  sectionOrder: number;
  sectionLabel: string;
};

export const LECTOR_PERMISSION_CATALOG: readonly LectorPermissionCatalogItem[] = [
  {
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "facturacion",
    label: "Facturación, historial y documentos emitidos",
    description: "Consultar facturas, recibos, historiales y últimos emitidos en hosting y minería.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "clientes",
    label: "Clientes",
    description: "Ver listados y fichas de clientes de hosting y tienda corporativa.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "equipos",
    label: "Inventario equipos ASIC",
    description: "Consultar equipo minero, datos técnicos y stock interno.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "equipos_tienda",
    label: "Vitrina tienda corporativa",
    description: "Ver datos corporativos de vitrina/marketplace (destacados, visibilidad) en modo consulta.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "garantias",
    label: "Garantías Ande",
    description: "Consultar garantías, ítems e historiales asociados a Ande.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "setups",
    label: "Combos / setups",
    description: "Ver armados y configuraciones publicadas.",
  },
  {
    sectionOrder: 2,
    sectionLabel: "Gestión financiera — solo lectura",
    key: "finanzas_contabilidad",
    label: "Contabilidad y monitor financiero",
    description: "Ver gastos de empresa, PDFs cargados y el panel del monitor financiero.",
  },
  {
    sectionOrder: 2,
    sectionLabel: "Gestión financiera — solo lectura",
    key: "finanzas_proveedores",
    label: "Proveedores HRS",
    description: "Consultar el registro maestro de proveedores.",
  },
  {
    sectionOrder: 2,
    sectionLabel: "Gestión financiera — solo lectura",
    key: "finanzas_asic_costos",
    label: "Costos corporativos ASIC",
    description: "Herramientas de costeo y cotizador en modo consulta cuando la pantalla lo permita.",
  },
  {
    sectionOrder: 2,
    sectionLabel: "Gestión financiera — solo lectura",
    key: "hosting_tipo_cambio",
    label: "Operaciones de cambio USDT / USD (hosting)",
    description: "Ver operaciones de cambio ligadas a clientes de hosting.",
  },
  {
    sectionOrder: 3,
    sectionLabel: "Información ejecutiva — solo lectura",
    key: "reportes",
    label: "Reportes y estadísticas",
    description: "Acceder a pantallas de reportes y rankings.",
  },
  {
    sectionOrder: 3,
    sectionLabel: "Información ejecutiva — solo lectura",
    key: "exportar",
    label: "Exportar datos",
    description: "Usar exportaciones CSV/Excel donde el sistema las ofrezca en pantallas autorizadas.",
  },
];

export type LectorPermissionCatalogApiRow = {
  key: string;
  label?: string;
  description?: string;
  sectionOrder?: number;
  sectionLabel?: string;
};

export function mergeLectorCatalogFromApi(rows: LectorPermissionCatalogApiRow[] | null | undefined): LectorPermissionCatalogItem[] {
  if (!Array.isArray(rows) || rows.length === 0) return [...LECTOR_PERMISSION_CATALOG];
  return LECTOR_PERMISSION_CATALOG.map((fb) => {
    const row = rows.find((x) => x.key === fb.key);
    if (!row) return fb;
    return {
      ...fb,
      label: row.label ?? fb.label,
      description: row.description ?? fb.description,
      sectionOrder: row.sectionOrder ?? fb.sectionOrder,
      sectionLabel: row.sectionLabel ?? fb.sectionLabel,
    };
  });
}

/** Prefijos de ruta SPA habilitados por cada permiso (lectura). */
export const LECTOR_GRANT_PATH_PREFIXES: Record<LectorPermissionKey, readonly string[]> = {
  facturacion: [
    "/hosting",
    "/history",
    "/historic",
    "/facturacion-hosting",
    "/facturacion",
    "/historial-hosting",
    "/historial",
    "/pendientes-hosting",
    "/pendientes",
    "/asic/billing",
    "/asic/history",
    "/asic/pending",
    "/facturacion-equipos",
    "/historial-equipos",
    "/pendientes-equipos",
    "/mineria",
    "/equipos-asic",
  ],
  clientes: ["/clients", "/cuenta-cliente", "/clientes", "/clientes-hub"],
  equipos: ["/asic/equipment", "/asic", "/equipos-asic", "/asic/cotizador-china-py"],
  equipos_tienda: ["/marketplace/home-banners", "/tienda-online-banners-home", "/asic/equipment"],
  garantias: ["/asic/ande-warranty", "/asic/warranty-items", "/asic/warranties-history", "/equipos-asic"],
  setups: ["/asic/setup", "/equipos-asic/setup"],
  finanzas_contabilidad: ["/gestion-financiera/contabilidad", "/gestion-financiera/monitor-financiero"],
  finanzas_proveedores: ["/gestion-financiera/proveedores"],
  finanzas_asic_costos: ["/asic/cotizador-china-py"],
  hosting_tipo_cambio: ["/hosting/exchange-operations"],
  reportes: ["/reports", "/reportes"],
  /** No amplía navegación SPA: la exportación aplica solo dentro de pantallas ya autorizadas por otro permiso. */
  exportar: [],
};

const LECTOR_KEYS_FOR_GESTION_ADMIN: readonly LectorPermissionKey[] = [
  "facturacion",
  "clientes",
  "equipos",
  "equipos_tienda",
  "garantias",
  "setups",
];

const LECTOR_KEYS_FOR_GESTION_FIN: readonly LectorPermissionKey[] = [
  "finanzas_contabilidad",
  "finanzas_proveedores",
  "finanzas_asic_costos",
  "hosting_tipo_cambio",
];

export function lectorHubPathPrefixes(grants: readonly LectorPermissionKey[]): string[] {
  const out: string[] = [];
  if (grants.some((k) => LECTOR_KEYS_FOR_GESTION_ADMIN.includes(k))) out.push("/gestion-administrativa");
  if (grants.some((k) => LECTOR_KEYS_FOR_GESTION_FIN.includes(k))) out.push("/gestion-financiera");
  return out;
}

/** Prefijos de ruta permitidos para un lector con lista explícita (incluye hubs derivados). */
export function collectLectorAllowedPathPrefixes(grants: readonly LectorPermissionKey[]): string[] {
  const set = new Set<string>();
  for (const k of grants) {
    for (const p of LECTOR_GRANT_PATH_PREFIXES[k]) set.add(p);
  }
  for (const h of lectorHubPathPrefixes(grants)) set.add(h);
  return [...set];
}

export function pathMatchesAnyLectorPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") || "/";
  for (const raw of prefixes) {
    const base = (raw.replace(/\/+$/, "") || "/") as string;
    if (base === "/") {
      if (path === "/") return true;
      continue;
    }
    if (path === base || path.startsWith(`${base}/`)) return true;
  }
  return false;
}

/** Ítems del menú principal (`/`) visibles por lector con permisos explícitos. */
export function canLectorSeeHomeMenuTo(user: { role?: string; lector_grants?: string[] | null }, to: string): boolean {
  if (user.role !== "lector") return false;
  const g = user.lector_grants;
  if (!Array.isArray(g) || g.length === 0) return false;
  if (to === "/marketplace") return true;
  if (to === "/kryptex") return true;
  if (to === "/gestion-administrativa") {
    return LECTOR_KEYS_FOR_GESTION_ADMIN.some((k) => g.includes(k));
  }
  if (to === "/gestion-financiera") {
    return (
      LECTOR_KEYS_FOR_GESTION_FIN.some((k) => g.includes(k)) ||
      g.includes("reportes") ||
      g.includes("facturacion") ||
      g.includes("clientes")
    );
  }
  if (to === "/clients/account") {
    return g.includes("facturacion") || g.includes("clientes");
  }
  if (to === "/history") return g.includes("facturacion");
  if (to === "/clients") return g.includes("clientes");
  if (to === "/reports") return g.includes("reportes");
  return false;
}
