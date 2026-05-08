/**
 * Catálogo de permisos AdministradorB (mantener alineado con `server/src/lib/adminBPermissions.ts`).
 */
export type AdminBPermissionKey =
  | "facturacion"
  | "clientes"
  | "equipos"
  | "equipos_tienda"
  | "garantias"
  | "setups"
  | "marketplace_pedidos"
  | "marketplace_presencia"
  | "finanzas_contabilidad"
  | "finanzas_proveedores"
  | "finanzas_asic_costos"
  | "hosting_tipo_cambio"
  | "usuarios"
  | "exportar"
  | "reportes";

export type AdminBPermissionCatalogItem = {
  key: AdminBPermissionKey;
  label: string;
  description: string;
  /** Orden de la sección SGI dentro del modal (1 = primero). */
  sectionOrder: number;
  /** Título de sección compartido por varios permisos. */
  sectionLabel: string;
};

export const ADMIN_B_PERMISSION_CATALOG: readonly AdminBPermissionCatalogItem[] = [
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
  {
    sectionOrder: 4,
    sectionLabel: "Administración del SGI y trazabilidad",
    key: "usuarios",
    label: "Usuarios, sesiones y auditoría tienda/inventario",
    description:
      "Gestión de cuentas internas, actividad de sesiones, auditoría tienda online y libro de cambios equipos/inventario.",
  },
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
];

/** Respuesta API (puede omitir campos nuevos si el backend es viejo). */
export type AdminBPermissionCatalogApiRow = {
  key: string;
  label?: string;
  description?: string;
  sectionOrder?: number;
  sectionLabel?: string;
};

/** Mezcla textos y secciones del servidor con el orden canónico del cliente. */
export function mergeAdminBCatalogFromApi(rows: AdminBPermissionCatalogApiRow[] | null | undefined): AdminBPermissionCatalogItem[] {
  if (!Array.isArray(rows) || rows.length === 0) return [...ADMIN_B_PERMISSION_CATALOG];
  return ADMIN_B_PERMISSION_CATALOG.map((fb) => {
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
