import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { getKryptexWorkers, getNiceHashRigs, type KryptexWorkerData, type NiceHashRigData } from "../lib/api";
import "../styles/facturacion.css";

const NICEHASH_MINER_URL = "https://www.nicehash.com/my/miner/c3b474aa-767e-48d2-92b3-5ca87fe747bf";

function workerUrl(poolUrl: string, name: string) {
  return `${poolUrl}/${name}/prop`;
}

function statusLabel(status: KryptexWorkerData["status"] | NiceHashRigData["status"]) {
  return status === "activo" ? "Prendido" : status === "inactivo" ? "Apagado" : "Desconocido";
}

function statusBadgeClass(status: KryptexWorkerData["status"] | NiceHashRigData["status"]) {
  return status === "activo" ? "bg-success" : status === "inactivo" ? "bg-danger" : "bg-secondary";
}

export function KryptexPage() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<KryptexWorkerData[]>([]);
  const [rigs, setRigs] = useState<NiceHashRigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingNiceHash, setLoadingNiceHash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [niceHashError, setNiceHashError] = useState<string | null>(null);
  const [niceHashMessage, setNiceHashMessage] = useState<string | null>(null);

  function loadWorkers(forceRefresh = false) {
    setLoading(true);
    setError(null);
    getKryptexWorkers(forceRefresh)
      .then((res) => setWorkers(res.workers))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al consultar"))
      .finally(() => setLoading(false));
  }

  function loadNiceHashRigs(forceRefresh = false) {
    setLoadingNiceHash(true);
    setNiceHashError(null);
    setNiceHashMessage(null);
    getNiceHashRigs(forceRefresh)
      .then((res) => {
        setRigs(res.rigs ?? []);
        if (res.message) setNiceHashMessage(res.message);
      })
      .catch((err) => setNiceHashError(err instanceof Error ? err.message : "Error al consultar NiceHash"))
      .finally(() => setLoadingNiceHash(false));
  }

  function loadAll(forceRefresh = false) {
    loadWorkers(forceRefresh);
    loadNiceHashRigs(forceRefresh);
  }

  useEffect(() => {
    loadAll();
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

        {/* Tabla Kryptex */}
        <div className="hrs-card p-4 mb-4">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
            <h5 className="mb-0">Estado de equipos en Kryptex Pool</h5>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => loadAll(true)}
                disabled={loading || loadingNiceHash}
              >
                <i className="bi bi-arrow-clockwise me-1" />
                Volver a cargar
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

        {/* Tabla NiceHash */}
        <div className="hrs-card p-4">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
            <h5 className="mb-0">Estado de equipos en NiceHash Pool</h5>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => loadNiceHashRigs(true)}
                disabled={loadingNiceHash}
              >
                <i className="bi bi-arrow-clockwise me-1" />
                Volver a cargar
              </button>
              <a
                href={NICEHASH_MINER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
              >
                <i className="bi bi-box-arrow-up-right" />
                Ver en NiceHash
              </a>
            </div>
          </div>

          {loadingNiceHash ? (
            <p className="text-muted mb-0">Cargando...</p>
          ) : niceHashError ? (
            <p className="text-danger mb-0">{niceHashError}</p>
          ) : niceHashMessage ? (
            <p className="text-muted mb-0">{niceHashMessage}</p>
          ) : rigs.length === 0 ? (
            <p className="text-muted mb-0">No hay rigs configurados o NiceHash no está configurado.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Rig Name</th>
                    <th>Estado</th>
                    <th>Actual rig profitability</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rigs.map((r) => (
                    <tr key={r.rigId}>
                      <td className="fw-medium">{r.name}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                      </td>
                      <td>{r.profitability ?? "—"}</td>
                      <td>
                        <a
                          href={NICEHASH_MINER_URL}
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
            El estado se obtiene de la API de NiceHash. Mining = Prendido, Offline = Apagado, bajo hashrate = Desconocido.
          </p>
        </div>
      </div>
    </div>
  );
}
