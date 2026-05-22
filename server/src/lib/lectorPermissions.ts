import { z } from "zod";
import type { AdminBPermissionKey } from "./adminBPermissions.js";
import { grantsIncludeLegacyModule, isSgiScreenGrantId } from "./sgiScreenGrants.js";

/**
 * Permisos de consulta (`lector`) gestionados solo por AdministradorA.
 * Claves alineadas con `adminBPermissions` donde aplica misma zona del SGI.
 */
export const LECTOR_PERMISSION_CATALOG = [
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
    sectionOrder: 1,
    sectionLabel: "Operación Hosting, ASIC y clientes — solo lectura",
    key: "leads",
    label: "Leads (Nuevos Leads + Leads Base)",
    description: "Registrar prospectos y consultar la base POTENCIALES CLIENTES.",
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
    description: "Herramientas de costeo y cotizador en modo consulta cuando la API lo permita.",
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
    description: "Acceder a pantallas de reportes y rankings si están habilitados en cliente.",
  },
  {
    sectionOrder: 3,
    sectionLabel: "Información ejecutiva — solo lectura",
    key: "exportar",
    label: "Exportar datos",
    description: "Usar exportaciones CSV/Excel en pantallas que lo ofrezcan.",
  },
] as const satisfies ReadonlyArray<{
  sectionOrder: number;
  sectionLabel: string;
  key: string;
  label: string;
  description: string;
}>;

export type LectorPermissionKey = (typeof LECTOR_PERMISSION_CATALOG)[number]["key"];

export const LECTOR_PERMISSION_KEYS = LECTOR_PERMISSION_CATALOG.map((x) => x.key) as [
  LectorPermissionKey,
  ...LectorPermissionKey[],
];

export function isValidLectorGrantKey(k: string): k is LectorPermissionKey {
  return (LECTOR_PERMISSION_KEYS as readonly string[]).includes(k) || isSgiScreenGrantId(k);
}

export const LectorGrantsBodySchema = z.object({
  grants: z.union([z.null(), z.array(z.string())]).transform((a) =>
    a == null ? null : [...new Set(a)].filter((k): k is LectorPermissionKey => isValidLectorGrantKey(k))
  ),
});

/**
 * Columna NULL: comportamiento anterior (consulta amplia por API como antes).
 * Array: sólo rutas/modulos autorizados; claves fuera del catálogo lector cuentan como no concedidas.
 */
export function parseLectorGrantsJson(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  try {
    const j = JSON.parse(s) as unknown;
    if (!Array.isArray(j)) return null;
    const out: string[] = [];
    for (const x of j) {
      if (typeof x === "string" && isValidLectorGrantKey(x) && !out.includes(x)) out.push(x);
    }
    return out;
  } catch {
    return null;
  }
}

/** Evalúa acceso API para rol lector ante una clave de módulo (típicamente mismo enum que administración). */
export function lectorHasGrant(grants: string[] | null | undefined, key: AdminBPermissionKey): boolean {
  if (grants == null) return true;
  const lectorModule = (LECTOR_PERMISSION_KEYS as readonly string[]).includes(key);
  if (!lectorModule && !isSgiScreenGrantId(key)) return false;
  return grantsIncludeLegacyModule(grants, key);
}

export function serializeLectorGrants(grants: string[]): string {
  const uniq = [...new Set(grants.filter((k) => isValidLectorGrantKey(k)))];
  return JSON.stringify(uniq);
}
