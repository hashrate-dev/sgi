import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canAccessMonitorEquiposAsic } from "../lib/auth";
import { getMonitorEquiposAsicBajas, type MonitorEquipoAsicBajaEntry } from "../lib/api";
import "../styles/facturacion.css";

function formatWhen(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

function snapStr(s: Record<string, unknown>, key: string): string {
  const v = s[key];
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

export function MonitorEquiposAsicBajasPage() {
  const { user, loading } = useAuth();
  const [bajas, setBajas] = useState<MonitorEquipoAsicBajaEntry[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tableLoading, setTableLoading] = useState(true);

  const load = useCallback(async () => {
    setTableLoading(true);
    setLoadErr(null);
    try {
      const { bajas: rows } = await getMonitorEquiposAsicBajas();
      setBajas(rows ?? []);
    } catch (e) {
      setBajas([]);
      setLoadErr(e instanceof Error ? e.message : "No se pudo cargar el listado.");
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessMonitorEquiposAsic(user)) return;
    void load();
  }, [loading, user, load]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessMonitorEquiposAsic(user)) {
    return <Navigate to="/asic" replace />;
  }

  return (
    <div className="fact-page mineria-page">
      <div className="container">
        <PageHeader
          title="Equipos ASIC dados de baja"
          showBackButton
          backTo="/asic"
          backText="Volver a Equipos ASIC"
        />

        <div className="hrs-card p-4 mb-3">
          <p className="text-muted small mb-3">
            Equipos retirados del monitor operativo (venta, baja del sistema). Se guarda una copia de la fila y la fecha;
            el historial de notas en servidor sigue asociado al mismo <code className="small sgi-tech-code">equipoId</code>{" "}
            (UUID).
          </p>
          {loadErr ? <div className="alert alert-danger py-2">{loadErr}</div> : null}
          {tableLoading ? (
            <div className="text-muted small d-flex align-items-center gap-2 py-4">
              <div className="spinner-border spinner-border-sm" role="status" aria-hidden />
              Cargando…
            </div>
          ) : bajas.length === 0 ? (
            <p className="text-muted small mb-0">Todavía no hay equipos dados de baja registrados en el servidor.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Fecha baja</th>
                    <th scope="col">Registró</th>
                    <th scope="col">Motivo</th>
                    <th scope="col">UUID equipo</th>
                    <th scope="col">Usuario</th>
                    <th scope="col">Modelo</th>
                    <th scope="col">Potencia</th>
                    <th scope="col">Pool</th>
                    <th scope="col">Nombre nuevo</th>
                    <th scope="col">Serial</th>
                    <th scope="col" className="text-center">
                      Online
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bajas.map((b) => {
                    const s = b.rowSnapshot;
                    return (
                      <tr key={b.id}>
                        <td className="text-secondary">{b.id}</td>
                        <td className="text-nowrap">{formatWhen(b.createdAt)}</td>
                        <td className="text-break" style={{ maxWidth: "10rem" }}>
                          {b.createdByEmail || "—"}
                        </td>
                        <td className="text-break" style={{ maxWidth: "12rem" }}>
                          {b.motivo?.trim() ? b.motivo : "—"}
                        </td>
                        <td>
                          <code className="small text-break d-inline-block sgi-tech-code" style={{ maxWidth: "11rem" }}>
                            {b.equipoId}
                          </code>
                        </td>
                        <td>{snapStr(s, "usuario")}</td>
                        <td>{snapStr(s, "modelo")}</td>
                        <td>{snapStr(s, "potencia")}</td>
                        <td>{snapStr(s, "pool")}</td>
                        <td className="font-monospace small">{snapStr(s, "nombreNuevo")}</td>
                        <td className="font-monospace small">{snapStr(s, "serial")}</td>
                        <td className="text-center">{snapStr(s, "online")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="small text-muted mb-0">
          Para dar de baja un equipo desde el monitor: menú <i className="bi bi-list" aria-hidden /> en la fila →{" "}
          <strong>Dar de baja equipo</strong>.{" "}
          <Link to="/asic/monitor-equipos" className="link-success">
            Ir al monitor
          </Link>
        </p>
      </div>
    </div>
  );
}
