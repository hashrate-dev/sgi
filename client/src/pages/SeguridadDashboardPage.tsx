import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { getSecurityOverview, type SecurityOverview } from "../lib/api";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/seguridad-dashboard.css";

const PATH = "/gestion-administrativa/seguridad";

const ROLE_LABEL: Record<string, string> = {
  admin_a: "Administrador A",
  admin_b: "Administrador B",
  operador: "Operador",
  lector: "Lector",
  cliente: "Cliente tienda",
};

function formatWhen(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "—";
  const iso = text.includes("T") ? text : text.replace(" ", "T");
  const withZone = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export function SeguridadDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    getSecurityOverview()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "No se pudo leer el tablero de seguridad."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!canUserAccessNavPath(user, PATH)) return;
    load();
  }, [load, user]);

  if (!user || !canUserAccessNavPath(user, PATH)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const watchCount = (data?.multiIpAccounts.length ?? 0) + (data?.sharedIpAccounts.length ?? 0);

  return (
    <div className="fact-page">
      <div className="container sec-dash">
        <PageHeader title="Seguridad del sitio" showBackButton backTo="/gestion-administrativa" backText="Volver a Gestión Administrativa" />
        <p className="sec-dash-lead">
          Avisa cuando hay un intento de entrada sospechoso o una falla de protección que el servidor puede comprobar. No muestra contraseñas ni tokens, y no reemplaza una auditoría externa.
        </p>
        <div className="sec-dash-toolbar">
          <span>{data ? `Actualizado ${formatWhen(data.generatedAt)}` : "Leyendo el sistema…"}</span>
          <button type="button" className="sec-dash-refresh" onClick={load} disabled={loading}>
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {err ? <p className="sec-dash-error">{err}</p> : null}
        {data ? (
          <>
            <section className={`sec-dash-banner is-${data.status}`}>
              <strong>
                {data.status === "alerta"
                  ? "Hay algo para revisar ahora"
                  : data.status === "aviso"
                    ? "Hay avisos de seguridad"
                    : "Sin señales de ataque en lo registrado"}
              </strong>
              {data.alerts.length === 0 ? (
                <p>
                  En las últimas 24 horas no hay ráfagas de contraseñas incorrectas ni administradores entrando desde varias redes. Los intentos fallidos se empiezan a contar desde este control.
                </p>
              ) : (
                <ul>
                  {data.alerts.map((alert) => (
                    <li key={`${alert.level}-${alert.title}-${alert.detail}`}>
                      <em>{alert.level === "alto" ? "Alerta" : "Aviso"}</em>
                      <span>
                        <strong>{alert.title}</strong>
                        {alert.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="sec-dash-panel">
              <h2>Protecciones activas</h2>
              <div className="sec-dash-protections">
                {data.protections.map((item) => (
                  <p key={item.name} className={item.ok ? "is-ok" : "is-watch"}>
                    <strong>{item.ok ? "Activa" : "Revisar"} · {item.name}</strong>
                    {item.detail}
                  </p>
                ))}
              </div>
            </section>

            <div className="sec-dash-kpis">
              <article>
                <span>Cuentas</span>
                <strong>{data.accounts.reduce((sum, row) => sum + row.count, 0)}</strong>
                <em>{data.accounts.map((row) => `${roleLabel(row.role)} ${row.count}`).join(" · ") || "Sin cuentas"}</em>
              </article>
              <article>
                <span>Sesiones abiertas</span>
                <strong>{data.openSessions}</strong>
                <em>Ingresos de las últimas 24 h sin cierre</em>
              </article>
              <article>
                <span>Accesos 24 h</span>
                <strong>{data.logins24h}</strong>
                <em>{data.logouts24h} salidas en el mismo período</em>
              </article>
              <article>
                <span>Cambios 24 h</span>
                <strong>{data.audit24h}</strong>
                <em>{data.auditReady ? "Catálogo y tienda" : "El libro de cambios no está disponible"}</em>
              </article>
              <article className={data.failedLogins24h > 0 ? "is-watch" : ""}>
                <span>Intentos fallidos 24 h</span>
                <strong>{data.failedLogins24h}</strong>
                <em>{data.failedLogins15m} en los últimos 15 minutos</em>
              </article>
            </div>

            <section className="sec-dash-panel">
              <h2>Intentos de entrada rechazados</h2>
              {data.recentFailures.length === 0 ? (
                <p>Todavía no hay contraseñas incorrectas registradas por este control.</p>
              ) : (
                <div className="table-responsive">
                  <table className="sec-dash-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Cuenta probada</th>
                        <th>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentFailures.map((row, index) => (
                        <tr key={`${row.at}-${row.account}-${index}`}>
                          <td>{formatWhen(row.at)}</td>
                          <td>{row.account || "—"}</td>
                          <td>{row.ip || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="sec-dash-panel">
              <h2>Señales de los últimos 7 días</h2>
              {watchCount === 0 ? (
                <p>Ninguna cuenta entró desde más de una IP, y ninguna IP agrupó cuentas distintas.</p>
              ) : (
                <div className="sec-dash-signals">
                  {data.multiIpAccounts.map((row) => (
                    <p key={row.account}>
                      <strong>{row.account}</strong> entró desde {row.ips.join(", ")}
                    </p>
                  ))}
                  {data.sharedIpAccounts.map((row) => (
                    <p key={row.ip}>
                      La IP <strong>{row.ip}</strong> se usó en {row.accounts.join(", ")}
                    </p>
                  ))}
                </div>
              )}
            </section>

            <section className="sec-dash-panel">
              <div className="sec-dash-panel-head">
                <h2>Últimos accesos</h2>
                <Link to="/usuarios/actividad">Ver actividad completa</Link>
              </div>
              {data.recentAccess.length === 0 ? (
                <p>Todavía no hay entradas ni salidas registradas.</p>
              ) : (
                <div className="table-responsive">
                  <table className="sec-dash-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Cuenta</th>
                        <th>Rol</th>
                        <th>Evento</th>
                        <th>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentAccess.map((row, index) => (
                        <tr key={`${row.at}-${row.account}-${index}`}>
                          <td>{formatWhen(row.at)}</td>
                          <td>{row.account}</td>
                          <td>{roleLabel(row.role)}</td>
                          <td>{row.event === "logout" ? "Salida" : "Entrada"}</td>
                          <td>{row.ip || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="sec-dash-panel">
              <div className="sec-dash-panel-head">
                <h2>Últimos cambios del catálogo</h2>
                <Link to="/usuarios/auditoria">Ver auditoría</Link>
              </div>
              {!data.auditReady ? (
                <p>El libro de cambios de equipos y tienda no se pudo leer.</p>
              ) : data.recentChanges.length === 0 ? (
                <p>No hay cambios registrados.</p>
              ) : (
                <div className="table-responsive">
                  <table className="sec-dash-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Quién</th>
                        <th>Acción</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentChanges.map((row, index) => (
                        <tr key={`${row.at}-${row.account}-${index}`}>
                          <td>{formatWhen(row.at)}</td>
                          <td>{row.account}</td>
                          <td>{row.action}</td>
                          <td>{row.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
