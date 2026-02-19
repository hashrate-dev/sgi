import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { getKryptexWorkers, type KryptexWorkerData } from "../lib/api";
import "../styles/facturacion.css";

function workerUrl(poolUrl: string, name: string) {
  return `${poolUrl}/${name}/prop`;
}

function statusLabel(status: KryptexWorkerData["status"]) {
  return status === "activo" ? "Prendido" : status === "inactivo" ? "Apagado" : "Desconocido";
}

function statusBadgeClass(status: KryptexWorkerData["status"]) {
  return status === "activo" ? "bg-success" : status === "inactivo" ? "bg-danger" : "bg-secondary";
}

export function KryptexPage() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<KryptexWorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function loadWorkers(forceRefresh = false) {
    setLoading(true);
    setError(null);
    getKryptexWorkers(forceRefresh)
      .then((res) => setWorkers(res.workers))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al consultar"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadWorkers();
  }, []);

  const roleNorm = (r: string | undefined) => (r ?? "").toLowerCase().trim();
  const canAccess = roleNorm(user?.role) === "admin_a" || roleNorm(user?.role) === "admin_b";
  if (user && !canAccess) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Kryptex" />

        <div className="hrs-card p-4">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
            <h5 className="mb-0">Estado de equipos en Kryptex Pool</h5>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => loadWorkers(true)}
                disabled={loading}
              >
                <i className="bi bi-arrow-clockwise me-1" />
                Actualizar
              </button>
              <a
                href="https://pool.kryptex.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
              >
                <i className="bi bi-box-arrow-up-right" />
                Ver en Kryptex
              </a>
            </div>
          </div>

          {loading ? (
            <p className="text-muted mb-0">Cargando...</p>
          ) : error ? (
            <p className="text-danger mb-0">{error}</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Usuario</th>
                    <th>Modelo</th>
                    <th>Estado</th>
                    <th>Hashrate (24h)</th>
                    <th>Hashrate (10m)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={`${w.poolUrl}-${w.name}`}>
                      <td className="fw-medium">{w.name}</td>
                      <td>{w.usuario}</td>
                      <td>{w.modelo}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(w.status)}`}>{statusLabel(w.status)}</span>
                      </td>
                      <td>{w.hashrate24h ?? "—"}</td>
                      <td>{w.hashrate10m ?? "—"}</td>
                      <td>
                        <a
                          href={workerUrl(w.poolUrl, w.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-link py-0"
                        >
                          <i className="bi bi-box-arrow-up-right" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-muted small mt-3 mb-0">
            El estado se obtiene del pool Kryptex (QUAI-SHA256 y QUAI-SCRYPT). Hashrate 10m &gt; 0 = prendido.
          </p>
        </div>
      </div>
    </div>
  );
}
