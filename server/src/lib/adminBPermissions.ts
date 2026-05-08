import { z } from "zod";

/** Permisos que AdministradorA puede asignar a cada AdministradorB (lista cerrada). */
export const ADMIN_B_PERMISSION_CATALOG = [
  /** --- Gestión Administrativa (hub corporativo Hosting / ASIC / tienda) --- */
  {
    sectionOrder: 1,
    sectionLabel: "Gestión Administrativa — operación Hosting, ASIC y tienda corporativa",
    key: "facturacion",
    label: "Facturación y documentos emitidos",
    description:
      "Hub Hosting y ASIC: facturas, recibos emitidos, historial, reconstrucción de recibos y flujos de facturación asociados.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Gestión Administrativa — operación Hosting, ASIC y tienda corporativa",
    key: "clientes",
    label: "Clientes (hosting y tienda)",
    description:
      "Fichas y operación sobre clientes de hosting y tienda corporativa — altas, bajas, importación desde el SGI.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Gestión Administrativa — operación Hosting, ASIC y tienda corporativa",
    key: "equipos",
    label: "Inventario equipos ASIC",
    description: "Equipo minero corporativo — fichas ASIC sin administración completa de vitrina pública.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Gestión Administrativa — operación Hosting, ASIC y tienda corporativa",
    key: "equipos_tienda",
    label: "Tienda online (vitrina y catálogo)",
    description: "Vitrina: precios USD, publicación, imágenes y ajustes de catálogo visible al público/marketplace.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Gestión Administrativa — operación Hosting, ASIC y tienda corporativa",
    key: "garantias",
    label: "Garantías Ande",
    description: "Emisión y mantenimiento de garantías/recibos vinculados a Ande en el circuito Hosting/ASIC.",
  },
  {
    sectionOrder: 1,
    sectionLabel: "Gestión Administrativa — operación Hosting, ASIC y tienda corporativa",
    key: "setups",
    label: "Combos / setups de minería",
    description: "Armado y mantenimiento de combos (setups) ofrecidos en el flujo operativo corporativo.",
  },
  /** --- Marketplace (cotizaciones, pedidos y presencia digital) --- */
  {
    sectionOrder: 2,
    sectionLabel: "Marketplace — cotizaciones, pedidos y presencia digital",
    key: "marketplace_pedidos",
    label: "Bandeja pedidos / cotizaciones",
    description: "Administración interna del marketplace — órdenes, cotizaciones y cargas desde el cliente.",
  },
  {
    sectionOrder: 2,
    sectionLabel: "Marketplace — cotizaciones, pedidos y presencia digital",
    key: "marketplace_presencia",
    label: "Presencia online y funnel",
    description: "Métricas en vivo — visitantes, funnel y comportamiento público enlazados al canal marketplace.",
  },
  /** --- Gestión Financiera (hub financiero corporativo) --- */
  {
    sectionOrder: 3,
    sectionLabel: "Gestión financiera corporativa",
    key: "finanzas_contabilidad",
    label: "Contabilidad interna — gastos y monitor financiero",
    description: "Contabilidad de gastos empresarial, adjuntos PDF y lectura/dashboard del monitor financiero asociados.",
  },
  {
    sectionOrder: 3,
    sectionLabel: "Gestión financiera corporativa",
    key: "finanzas_proveedores",
    label: "Proveedores HRS",
    description: "Registro único de proveedores (P001…) y fichas corporativas de contacto fiscal.",
  },
  {
    sectionOrder: 3,
    sectionLabel: "Gestión financiera corporativa",
    key: "finanzas_asic_costos",
    label: "Costos corporativos ASIC",
    description: "Herramientas de costeo y margen relacionadas al negocio de equipos minería.",
  },
  {
    sectionOrder: 3,
    sectionLabel: "Gestión financiera corporativa",
    key: "hosting_tipo_cambio",
    label: "Operaciones de cambio USDT / USD (hosting)",
    description: "Registro de operaciones de cambio ligadas a clientes de hosting (USDT/USD, tickets y ganancias).",
  },
  /** --- Administración del SGI --- */
  {
    sectionOrder: 4,
    sectionLabel: "Administración del SGI y trazabilidad",
    key: "usuarios",
    label: "Usuarios, sesiones y auditoría tienda/inventario",
    description:
      "Gestión de cuentas internas, actividad de sesiones, auditoría tienda online y libro de cambios equipos/inventario.",
  },
  /** --- Información y análisis --- */
  {
    sectionOrder: 5,
    sectionLabel: "Información ejecutiva — reportes y exportación",
    key: "exportar",
    label: "Exportar datos (Excel / CSV)",
    description:
      "Todas las exportaciones tipo planilla donde el sistema ofrece descarga desde tablas corporativas o reportes derivados.",
  },
  {
    sectionOrder: 5,
    sectionLabel: "Información ejecutiva — reportes y exportación",
    key: "reportes",
    label: "Reportes y estadísticas de facturación",
    description: "Módulos de estadísticas corporativos, rankings de facturación y dashboards numéricos del SGI.",
  },
] as const satisfies ReadonlyArray<{
  sectionOrder: number;
  sectionLabel: string;
  key: string;
  label: string;
  description: string;
}>;

export type AdminBPermissionKey = (typeof ADMIN_B_PERMISSION_CATALOG)[number]["key"];

export const ADMIN_B_PERMISSION_KEYS = ADMIN_B_PERMISSION_CATALOG.map((x) => x.key) as [
  AdminBPermissionKey,
  ...AdminBPermissionKey[],
];

export function isValidAdminBGrantKey(k: string): k is AdminBPermissionKey {
  return (ADMIN_B_PERMISSION_KEYS as readonly string[]).includes(k);
}

export const AdminBGrantsBodySchema = z.object({
  /** `null`: sin lista en DB (AdministradorB con acceso completo, comportamiento histórico). Array: whitelist. */
  grants: z.union([z.null(), z.array(z.string())]).transform((a) =>
    a == null ? null : [...new Set(a)].filter((k): k is AdminBPermissionKey => isValidAdminBGrantKey(k))
  ),
});

/**
 * `null` en base de datos = AdministradorB sin lista explícita: acceso completo (comportamiento histórico).
 * Array (posiblemente vacío) = lista blanca: solo claves presentes habilitan el módulo.
 */
export function parseAdminBGrantsJson(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  try {
    const j = JSON.parse(s) as unknown;
    if (!Array.isArray(j)) return null;
    const out: string[] = [];
    for (const x of j) {
      if (typeof x === "string" && isValidAdminBGrantKey(x) && !out.includes(x)) out.push(x);
    }
    return out;
  } catch {
    return null;
  }
}

export function adminBHasGrant(grants: string[] | null | undefined, key: AdminBPermissionKey): boolean {
  if (grants == null) return true;
  return grants.includes(key);
}

export function serializeAdminBGrants(grants: string[]): string {
  const uniq = [...new Set(grants.filter((k) => isValidAdminBGrantKey(k)))];
  return JSON.stringify(uniq);
}
