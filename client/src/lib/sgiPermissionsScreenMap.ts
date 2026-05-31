/**
 * Mapa pantalla → permiso del SGI para el gestor en /usuarios/cuentas.
 * Cada fila accionable guarda su propia clave (`id`). `legacyModule` agrupa permisos API antiguos.
 */
import type { AdminBPermissionKey } from "./adminBPermissionsCatalog";
import type { LectorPermissionKey } from "./lectorPermissionsCatalog";

export type SgiPermissionAudience = "staff" | "lector";

export type SgiPermissionScreenRow = {
  id: string;
  zoneOrder: number;
  zone: string;
  /** Módulo coarse para APIs (`requireModuleGrant`); la UI guarda `id` por pantalla. */
  legacyModule: AdminBPermissionKey | LectorPermissionKey;
  title: string;
  routes: readonly string[];
  accessNote: string;
  audience: readonly SgiPermissionAudience[];
  /** Solo informativo: no tiene checkbox en el mapa */
  infoOnly?: boolean;
};

export const SGI_PERMISSION_SCREEN_MAP: readonly SgiPermissionScreenRow[] = [
  {
    id: "home-dashboard",
    zoneOrder: 0,
    zone: "Inicio del SGI",
    legacyModule: "reportes",
    title: "Panel principal (tarjetas de acceso)",
    routes: ["/", "/sgi"],
    accessNote: "Visible al iniciar sesión. Las tarjetas dependen de los permisos marcados abajo.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "kryptex-pool",
    zoneOrder: 0,
    zone: "Inicio del SGI",
    legacyModule: "reportes",
    title: "Kryptex (minería en pool)",
    routes: ["/kryptex", "/kryptex/detalle"],
    accessNote:
      "No es un permiso de módulo: se habilita si el usuario Lector tiene pool asignado (campo Usuario = Mariri, Jlsoler, etc.). Staff Admin A/B/Operador según rol.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "watcher-nicehash",
    zoneOrder: 0,
    zone: "Inicio del SGI",
    legacyModule: "equipos",
    title: "Watcher equipos NiceHash (tarjeta inicio)",
    routes: ["/asic/monitor-equipos"],
    accessNote: "Tarjeta del inicio reservada a Administrador A. Operador/Admin B: permiso «Inventario equipos ASIC».",
    audience: ["staff"],
    infoOnly: true,
  },
  {
    id: "ga-hub",
    zoneOrder: 10,
    zone: "Gestión Administrativa",
    legacyModule: "leads",
    title: "Hub Gestión Administrativa",
    routes: ["/gestion-administrativa"],
    accessNote: "Se habilita solo si marcás al menos otra pantalla de Gestión Administrativa o Financiera.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "ga-nuevos-leads",
    zoneOrder: 10,
    zone: "Gestión Administrativa",
    legacyModule: "leads",
    title: "Nuevos Leads — formulario de registro",
    routes: ["/gestion-administrativa/nuevos-leads"],
    accessNote: "Registrar prospectos (sin ver la base completa).",
    audience: ["staff", "lector"],
  },
  {
    id: "ga-leads-base",
    zoneOrder: 10,
    zone: "Gestión Administrativa",
    legacyModule: "leads",
    title: "Leads Base — tabla POTENCIALES CLIENTES",
    routes: ["/gestion-administrativa/leads-base"],
    accessNote: "Consultar, editar y eliminar leads; exportar CSV.",
    audience: ["staff", "lector"],
  },
  {
    id: "ga-cambio-usdt-hub",
    zoneOrder: 10,
    zone: "Gestión Administrativa",
    legacyModule: "hosting_tipo_cambio",
    title: "Hub Servicios de Cambio USDT",
    routes: ["/gestion-administrativa/cambio-usdt"],
    accessNote: "Acceso al hub de clientes FX y operaciones de cambio.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "ga-cambio-usdt-clientes",
    zoneOrder: 10,
    zone: "Gestión Administrativa",
    legacyModule: "hosting_tipo_cambio",
    title: "Clientes de Cambio USDT (código FX)",
    routes: [
      "/gestion-administrativa/cambio-usdt/clientes",
      "/gestion-administrativa/cambio-usdt/clientes/:id/edit",
    ],
    accessNote: "Alta y edición de clientes que solo operan cambio; alimentan Operaciones de Cambio.",
    audience: ["staff", "lector"],
  },
  {
    id: "hosting-hub",
    zoneOrder: 20,
    zone: "Hosting — Servicios de hosting",
    legacyModule: "facturacion",
    title: "Hub Servicios de Hosting",
    routes: ["/hosting"],
    accessNote: "Se habilita si marcás al menos una pantalla de hosting abajo.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "hosting-billing",
    zoneOrder: 20,
    zone: "Hosting — Servicios de hosting",
    legacyModule: "facturacion",
    title: "Emitir facturas de hosting",
    routes: ["/hosting/billing"],
    accessNote: "Facturas, notas de crédito y recibos de hosting.",
    audience: ["staff", "lector"],
  },
  {
    id: "hosting-history",
    zoneOrder: 20,
    zone: "Hosting — Servicios de hosting",
    legacyModule: "facturacion",
    title: "Historial de hosting",
    routes: ["/hosting/history", "/history"],
    accessNote: "Comprobantes emitidos y gestión del historial.",
    audience: ["staff", "lector"],
  },
  {
    id: "hosting-pending",
    zoneOrder: 20,
    zone: "Hosting — Servicios de hosting",
    legacyModule: "facturacion",
    title: "Pendientes de cobro (hosting)",
    routes: ["/hosting/pending"],
    accessNote: "Facturas pendientes de cobro por servicios de hosting.",
    audience: ["staff", "lector"],
  },
  {
    id: "hosting-email-flow",
    zoneOrder: 20,
    zone: "Hosting — Servicios de hosting",
    legacyModule: "facturacion",
    title: "Flujo de emails / documentos del mes",
    routes: ["/hosting/email-flow"],
    accessNote: "Control de envío de documentos por correo.",
    audience: ["staff"],
  },
  {
    id: "hosting-reports-shortcut",
    zoneOrder: 20,
    zone: "Hosting — Servicios de hosting",
    legacyModule: "reportes",
    title: "Reportes (acceso desde hub hosting)",
    routes: ["/reports"],
    accessNote: "Estadísticas y rankings de facturación.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-hub",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "equipos",
    title: "Hub Equipos ASIC",
    routes: ["/asic"],
    accessNote: "Se habilita si marcás al menos una pantalla de ASIC abajo.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "asic-equipment",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "equipos",
    title: "Inventario de equipos ASIC",
    routes: ["/asic/equipment"],
    accessNote: "Fichas técnicas, stock y datos del equipo minero.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-monitor",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "equipos",
    title: "Monitor equipos ASIC (NiceHash watcher)",
    routes: ["/asic/monitor-equipos"],
    accessNote: "Hashrate en vivo desde enlaces watcher W1…WN.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-monitor-bajas",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "equipos",
    title: "Equipos dados de baja",
    routes: ["/asic/equipos-dados-de-baja"],
    accessNote: "Listado de equipos retirados del monitor.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-cotizador",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "finanzas_asic_costos",
    title: "Cotizador China → Paraguay",
    routes: ["/asic/cotizador-china-py"],
    accessNote: "Cotización de equipos importados (costos/márgenes).",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-billing",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "facturacion",
    title: "Emitir facturas de equipos ASIC",
    routes: ["/asic/billing"],
    accessNote: "Facturas, NC y recibos de venta de equipos.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-history",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "facturacion",
    title: "Historial venta de ASIC",
    routes: ["/asic/history"],
    accessNote: "Comprobantes de venta de equipos.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-pending",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "facturacion",
    title: "Pendientes de cobro (ASIC)",
    routes: ["/asic/pending"],
    accessNote: "Cobros pendientes por venta de equipos.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-setup",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "setups",
    title: "Combos / setups de minería",
    routes: ["/asic/setup"],
    accessNote: "Armado y mantenimiento de combos ofrecidos.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-reparacion",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "setups",
    title: "Reparación (tipos y flujo)",
    routes: ["/asic/reparacion"],
    accessNote: "Catálogo y operación de reparaciones.",
    audience: ["staff"],
  },
  {
    id: "asic-transporte",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "setups",
    title: "Transporte y fletes",
    routes: ["/transporte-fletes"],
    accessNote: "Tipos de flete vinculados a setups/ventas.",
    audience: ["staff"],
  },
  {
    id: "asic-garantia-ande",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "garantias",
    title: "Recibos garantía ANDE",
    routes: ["/asic/ande-warranty"],
    accessNote: "Emisión de recibos de garantía ANDE.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-garantia-items",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "garantias",
    title: "Ítems de garantía ANDE",
    routes: ["/asic/warranty-items", "/asic/warranty-items/new"],
    accessNote: "Alta y listado de ítems de garantía.",
    audience: ["staff", "lector"],
  },
  {
    id: "asic-garantia-hist",
    zoneOrder: 30,
    zone: "Equipos ASIC — Minería corporativa",
    legacyModule: "garantias",
    title: "Historial garantías ANDE",
    routes: ["/asic/warranties-history"],
    accessNote: "Consulta de documentos de garantía emitidos.",
    audience: ["staff", "lector"],
  },
  {
    id: "clients-hub",
    zoneOrder: 40,
    zone: "Clientes",
    legacyModule: "clientes",
    title: "Hub Clientes",
    routes: ["/clients"],
    accessNote: "Se habilita si marcás Clientes hosting y/o tienda abajo.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "clients-hosting",
    zoneOrder: 40,
    zone: "Clientes",
    legacyModule: "clientes",
    title: "Clientes · Hosting",
    routes: ["/clients/hosting", "/clients/hosting/:id/edit"],
    accessNote: "Altas, edición e importación de clientes de hosting.",
    audience: ["staff", "lector"],
  },
  {
    id: "clients-store",
    zoneOrder: 40,
    zone: "Clientes",
    legacyModule: "clientes",
    title: "Clientes · Tienda online",
    routes: ["/clients/store"],
    accessNote: "Cuentas registradas en la tienda corporativa.",
    audience: ["staff", "lector"],
  },
  {
    id: "clients-account",
    zoneOrder: 40,
    zone: "Clientes",
    legacyModule: "clientes",
    title: "Cuenta por cliente",
    routes: ["/clients/account", "/clients/account/detail"],
    accessNote: "Movimientos históricos por cliente (hosting + ASIC). También accesible desde Gestión Financiera.",
    audience: ["staff", "lector"],
  },
  {
    id: "marketplace-public",
    zoneOrder: 50,
    zone: "Marketplace y tienda online",
    legacyModule: "equipos_tienda",
    title: "Tienda online pública (vista catálogo)",
    routes: ["/marketplace"],
    accessNote: "Catálogo público; no requiere permiso de administración (staff siempre puede abrir).",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "marketplace-banners",
    zoneOrder: 50,
    zone: "Marketplace y tienda online",
    legacyModule: "equipos_tienda",
    title: "Banners / destacados home tienda",
    routes: ["/marketplace/home-banners"],
    accessNote: "Administrar vitrina y banners del home corporativo.",
    audience: ["staff", "lector"],
  },
  {
    id: "marketplace-orders",
    zoneOrder: 50,
    zone: "Marketplace y tienda online",
    legacyModule: "marketplace_pedidos",
    title: "Pedidos y cotizaciones marketplace",
    routes: ["/marketplace/orders", "/marketplace/orders/history-detail"],
    accessNote:
      "Bandeja interna de órdenes y cotizaciones. El carrito en /marketplace lo pueden usar todos los usuarios logueados sin marcar esta casilla.",
    audience: ["staff"],
  },
  {
    id: "marketplace-presence",
    zoneOrder: 50,
    zone: "Marketplace y tienda online",
    legacyModule: "marketplace_presencia",
    title: "Presencia online y funnel",
    routes: ["/marketplace/presence", "/marketplace/presence/history"],
    accessNote: "Visitantes en vivo, funnel e historial de presencia.",
    audience: ["staff"],
  },
  {
    id: "fin-hub",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "finanzas_contabilidad",
    title: "Hub Gestión Financiera",
    routes: ["/gestion-financiera"],
    accessNote: "Se habilita si marcás al menos una pantalla financiera abajo.",
    audience: ["staff", "lector"],
    infoOnly: true,
  },
  {
    id: "fin-proveedores",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "finanzas_proveedores",
    title: "Proveedores HRS",
    routes: ["/gestion-financiera/proveedores"],
    accessNote: "Registro maestro P001… y fichas de proveedores.",
    audience: ["staff", "lector"],
  },
  {
    id: "fin-contabilidad",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "finanzas_contabilidad",
    title: "Contabilidad — gastos de empresa",
    routes: ["/gestion-financiera/contabilidad"],
    accessNote: "Registro de gastos, adjuntos PDF y comprobantes.",
    audience: ["staff", "lector"],
  },
  {
    id: "fin-resumen-presupuesto",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "finanzas_contabilidad",
    title: "Resumen de Presupuesto",
    routes: ["/gestion-financiera/resumen-presupuesto"],
    accessNote: "Tabla consulta de gastos con filtros por presupuesto, proveedor y moneda.",
    audience: ["staff", "lector"],
  },
  {
    id: "fin-monitor",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "finanzas_contabilidad",
    title: "Monitor financiero",
    routes: ["/gestion-financiera/monitor-financiero"],
    accessNote: "Dashboard de gastos por moneda y mes.",
    audience: ["staff", "lector"],
  },
  {
    id: "fin-exchange-hub",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "hosting_tipo_cambio",
    title: "Operaciones de cambio (menú)",
    routes: ["/gestion-administrativa/exchange"],
    accessNote: "Acceso al menú de operaciones USDT/USD.",
    audience: ["staff", "lector"],
  },
  {
    id: "fin-exchange-ops",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "hosting_tipo_cambio",
    title: "Operaciones de cambio USDT / USD",
    routes: ["/hosting/exchange-operations"],
    accessNote: "Alta y seguimiento de operaciones de cambio por cliente hosting.",
    audience: ["staff", "lector"],
  },
  {
    id: "fin-exchange-hist",
    zoneOrder: 60,
    zone: "Gestión Financiera",
    legacyModule: "hosting_tipo_cambio",
    title: "Historial tipo de cambio",
    routes: ["/hosting/tipo-cambio-historial"],
    accessNote: "Histórico de tipos de cambio registrados.",
    audience: ["staff", "lector"],
  },
  {
    id: "sgi-usuarios-hub",
    zoneOrder: 70,
    zone: "Administración del SGI",
    legacyModule: "usuarios",
    title: "Hub Usuarios del SGI",
    routes: ["/usuarios"],
    accessNote: "Se habilita si marcás al menos una pantalla de usuarios abajo.",
    audience: ["staff"],
    infoOnly: true,
  },
  {
    id: "sgi-usuarios-cuentas",
    zoneOrder: 70,
    zone: "Administración del SGI",
    legacyModule: "usuarios",
    title: "Cuentas de usuario (esta pantalla)",
    routes: ["/usuarios/cuentas"],
    accessNote: "Alta, edición, roles y permisos de usuarios internos.",
    audience: ["staff"],
  },
  {
    id: "sgi-usuarios-clientes-cuentas",
    zoneOrder: 70,
    zone: "Administración del SGI",
    legacyModule: "usuarios",
    title: "Cuentas clientes tienda online",
    routes: ["/usuarios/clientes-cuentas"],
    accessNote: "Resumen y tabla con los datos del registro público de la tienda (correo, nombre, país, celular, etc.).",
    audience: ["staff"],
  },
  {
    id: "sgi-usuarios-actividad",
    zoneOrder: 70,
    zone: "Administración del SGI",
    legacyModule: "usuarios",
    title: "Actividad de sesiones",
    routes: ["/usuarios/actividad"],
    accessNote: "Entradas, salidas, IP y tiempo conectado.",
    audience: ["staff"],
  },
  {
    id: "sgi-usuarios-auditoria",
    zoneOrder: 70,
    zone: "Administración del SGI",
    legacyModule: "usuarios",
    title: "Auditoría tienda e inventario",
    routes: ["/usuarios/auditoria"],
    accessNote: "Libro de cambios en equipos ASIC y tienda online.",
    audience: ["staff"],
  },
  {
    id: "exec-reportes",
    zoneOrder: 80,
    zone: "Información ejecutiva",
    legacyModule: "reportes",
    title: "Reportes y estadísticas",
    routes: ["/reports"],
    accessNote: "Rankings, dashboards y análisis de facturación.",
    audience: ["staff", "lector"],
  },
  {
    id: "exec-exportar",
    zoneOrder: 80,
    zone: "Información ejecutiva",
    legacyModule: "exportar",
    title: "Exportar datos (Excel / CSV)",
    routes: [],
    accessNote: "Botones de descarga en tablas y listados de los módulos ya autorizados.",
    audience: ["staff", "lector"],
  },
] as const;

const ZONE_ICONS: Record<string, string> = {
  "Inicio del SGI": "bi-house-door",
  "Gestión Administrativa": "bi-buildings",
  "Hosting — Servicios de hosting": "bi-hdd-network",
  "Equipos ASIC — Minería corporativa": "bi-cpu",
  Clientes: "bi-people",
  "Marketplace y tienda online": "bi-bag-check",
  "Gestión Financiera": "bi-cash-stack",
  "Administración del SGI": "bi-diagram-3",
  "Información ejecutiva": "bi-bar-chart-line",
};

export function zoneIconForSgiMap(zone: string): string {
  return ZONE_ICONS[zone] ?? "bi-folder2-open";
}

export type SgiPermissionZoneGroup = {
  zoneOrder: number;
  zone: string;
  rows: SgiPermissionScreenRow[];
};

export function buildSgiPermissionZoneGroups(audience: SgiPermissionAudience): SgiPermissionZoneGroup[] {
  const rows = SGI_PERMISSION_SCREEN_MAP.filter((r) => r.audience.includes(audience));
  const byZone = new Map<string, SgiPermissionZoneGroup>();
  for (const row of rows) {
    let g = byZone.get(row.zone);
    if (!g) {
      g = { zoneOrder: row.zoneOrder, zone: row.zone, rows: [] };
      byZone.set(row.zone, g);
    }
    g.rows.push(row);
  }
  return [...byZone.values()].sort((a, b) => a.zoneOrder - b.zoneOrder);
}

export function uniqueScreenIdsInZones(zones: readonly SgiPermissionZoneGroup[]): string[] {
  const set = new Set<string>();
  for (const z of zones) {
    for (const r of z.rows) {
      if (!r.infoOnly) set.add(r.id);
    }
  }
  return [...set];
}

export function countEnabledScreens(
  zones: readonly SgiPermissionZoneGroup[],
  selected: Record<string, boolean>
): { screens: number; keys: number } {
  let screens = 0;
  const keys = new Set<string>();
  for (const z of zones) {
    for (const r of z.rows) {
      if (r.infoOnly) continue;
      if (selected[r.id]) {
        screens += 1;
        keys.add(r.id);
      }
    }
  }
  return { screens, keys: keys.size };
}

export function grantLabelFromCatalog(
  grantKey: string,
  catalog: ReadonlyArray<{ key: string; label: string }>
): string {
  return catalog.find((c) => c.key === grantKey)?.label ?? grantKey;
}
