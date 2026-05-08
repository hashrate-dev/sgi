import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  canAccessFinanzaContabilidadHub,
  canAccessHostingTipoCambio,
  canAccessProveedoresHrs,
  canSeeCuentaPorClienteShortcut,
  canSeeReportesDashboard,
} from "../lib/auth.js";
import "../styles/facturacion.css";

type FinHubItem = {
  to: string;
  icon: string;
  label: string;
  desc: string;
  roles: readonly string[];
};

const hubItems: readonly FinHubItem[] = [
  {
    to: "/gestion-financiera/proveedores",
    icon: "bi-building",
    label: "Proveedores",
    desc: "Registro de proveedores HRS con número único (P001, P002…) y datos fiscales / contacto",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/gestion-financiera/contabilidad",
    icon: "bi-calculator",
    label: "Contabilidad",
    desc: "Registro de gastos de empresa: fecha, proveedor, descripción, moneda (UYU / USD / PYG) e importe",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/gestion-financiera/monitor-financiero",
    icon: "bi-speedometer2",
    label: "Monitor Financiero",
    desc: "Dashboard de gastos de contabilidad: totales por moneda, por mes de presupuesto y últimos movimientos",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/reports",
    icon: "bi-graph-up-arrow",
    label: "Reportes",
    desc: "Estadísticas, rankings y análisis de facturación",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/clients/account",
    icon: "bi-journal-text",
    label: "Cuenta por cliente",
    desc: "Movimientos históricos por cliente (hosting y ASIC)",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/hosting/exchange-operations",
    icon: "bi-currency-exchange",
    label: "Operaciones de cambio USDT/USD",
    desc: "Registro de operaciones de cambio asociadas a clientes Hosting",
    roles: ["admin_a", "admin_b", "operador"],
  },
];

function roleNorm(r: string | undefined) {
  return (r ?? "").toLowerCase().trim();
}

export function GestionFinancieraHubPage() {
  const { user } = useAuth();
  const canSee = (roles: readonly string[]) =>
    user != null && roles.some((r) => roleNorm(r) === roleNorm(user.role));

  function lectorSeesItem(item: FinHubItem): boolean {
    if (!user || user.role !== "lector") return false;
    switch (item.to) {
      case "/gestion-financiera/proveedores":
        return canAccessProveedoresHrs(user);
      case "/gestion-financiera/contabilidad":
      case "/gestion-financiera/monitor-financiero":
        return canAccessFinanzaContabilidadHub(user);
      case "/reports":
        return canSeeReportesDashboard(user);
      case "/clients/account":
        return canSeeCuentaPorClienteShortcut(user);
      case "/hosting/exchange-operations":
        return canAccessHostingTipoCambio(user);
      default:
        return false;
    }
  }

  const visible = hubItems.filter((item) => (user?.role === "lector" ? lectorSeesItem(item) : canSee(item.roles)));

  if (!user || visible.length === 0) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Gestión Financiera" backTo="/gestion-administrativa" backText="Volver a Gestión Administrativa" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">
            Herramientas de consulta y seguimiento financiero vinculadas al SGI (mismo estilo de accesos que en Hosting /
            ASIC).
          </p>
          <div className="reportes-grid">
            {visible.map((item) => (
              <Link key={item.to} to={item.to} className="reportes-card mineria-hub-card">
                <div className="reportes-card-icon">
                  <i className={`bi ${item.icon}`} aria-hidden />
                </div>
                <h3 className="reportes-card-title">{item.label}</h3>
                <p className="reportes-card-desc">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
