import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../components/PageHeader";
import {
  KryptexHashrateChart,
  sumWorkersTHs,
  sumWorkersGHs,
  sumWorkers10mTHs,
  sumWorkers10mGHs,
  isWorkerTHs,
  isWorkerGHs,
  loadHashrateHistory,
  saveHashrateHistory,
  STORAGE_KEY_TH,
  STORAGE_KEY_GH,
  type HashratePoint,
} from "../components/KryptexHashrateChart";
import { getKryptexWorkers, type KryptexWorkerData } from "../lib/api";
import "../styles/facturacion.css";
import "../styles/hrshome.css";

function workerUrl(poolUrl: string, name: string) {
  return `${poolUrl}/${name}/prop`;
}

function statusLabel(status: KryptexWorkerData["status"]) {
  return status === "activo" ? "Prendido 🟢" : status === "inactivo" ? "Apagado 🔌" : "Desconocido ⏳";
}

function statusBadgeClass(status: KryptexWorkerData["status"]) {
  return status === "activo" ? "bg-success" : status === "inactivo" ? "bg-danger" : "bg-secondary";
}

function WorkerTable({
  workers,
  refreshing,
  isInitialLoad,
  error,
  loadWorkers,
}: {
  workers: KryptexWorkerData[];
  refreshing: boolean;
  isInitialLoad: boolean;
  error: string | null;
  loadWorkers: (force: boolean) => void;
}) {
  return (
    <div className="kryptex-table-fixed">
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div className="d-flex gap-2 align-items-center">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => loadWorkers(true)}
            disabled={refreshing}
          >
            <i className={`bi bi-arrow-clockwise me-1 ${refreshing ? "kryptex-spin" : ""}`} />
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
      {error && (
        <div className="alert alert-danger py-2 mb-2" role="alert">
          <small>{error}</small>
        </div>
      )}
      {isInitialLoad ? (
        <div className="kryptex-table-placeholder">
          <p className="text-muted mb-0">Cargando...</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="kryptex-table-placeholder">
          <p className="text-muted mb-0">No hay equipos en esta categoría.</p>
        </div>
      ) : (
        <div className="table-responsive kryptex-table-scroll">
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
    </div>
  );
}

export function KryptexPage() {
  const [workers, setWorkers] = useState<KryptexWorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyTH, setHistoryTH] = useState<HashratePoint[]>(() => loadHashrateHistory(STORAGE_KEY_TH));
  const [historyGH, setHistoryGH] = useState<HashratePoint[]>(() => loadHashrateHistory(STORAGE_KEY_GH));

  const workersTH = useMemo(() => workers.filter(isWorkerTHs), [workers]);
  const workersGH = useMemo(() => workers.filter(isWorkerGHs), [workers]);

  const loadWorkers = useCallback((forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    getKryptexWorkers(forceRefresh)
      .then((res) => {
        setWorkers(res.workers);
        const totalTH24 = sumWorkersTHs(res.workers);
        const totalTH10 = sumWorkers10mTHs(res.workers);
        const totalGH24 = sumWorkersGHs(res.workers);
        const totalGH10 = sumWorkers10mGHs(res.workers);
        const now = Date.now();
        setHistoryTH((prev) => {
          const next = [...prev, { timestamp: now, value24h: totalTH24, value10m: totalTH10 }].slice(-48);
          saveHashrateHistory(STORAGE_KEY_TH, next);
          return next;
        });
        setHistoryGH((prev) => {
          const next = [...prev, { timestamp: now, value24h: totalGH24, value10m: totalGH10 }].slice(-48);
          saveHashrateHistory(STORAGE_KEY_GH, next);
          return next;
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al consultar"))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  const isInitialLoad = loading && workers.length === 0;

  useEffect(() => {
    loadWorkers();
    const interval = setInterval(() => loadWorkers(true), 45000);
    return () => clearInterval(interval);
  }, [loadWorkers]);

  return (
    <div className="hrs-home">
      <div className="hrs-home-container container" style={{ maxWidth: "1200px" }}>
        <PageHeader title="Kryptex" />

        {/* Sección TH/s (S21) */}
        <div className="hrs-card p-4 kryptex-section" style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h5 className="mb-3">
            <i className="bi bi-cpu me-2" />
            Equipos TH/s (S21 - QUAI-SHA256)
          </h5>
          <WorkerTable workers={workersTH} refreshing={refreshing} isInitialLoad={isInitialLoad} error={error} loadWorkers={loadWorkers} />
        </div>
        <div className="hrs-card p-4 kryptex-chart-card" style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <KryptexHashrateChart
            history={historyTH}
            currentTotal24h={sumWorkersTHs(workers)}
            currentTotal10m={sumWorkers10mTHs(workers)}
            unit="TH/s"
            title="Hashrate TH/s (24h)"
          />
        </div>

        {/* Sección GH/s (L7) */}
        <div className="hrs-card p-4 kryptex-section" style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h5 className="mb-3">
            <i className="bi bi-hdd me-2" />
            Equipos GH/s (L7 - QUAI-SCRYPT)
          </h5>
          <WorkerTable workers={workersGH} refreshing={refreshing} isInitialLoad={isInitialLoad} error={error} loadWorkers={loadWorkers} />
        </div>
        <div className="hrs-card p-4 kryptex-chart-card" style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <KryptexHashrateChart
            history={historyGH}
            currentTotal24h={sumWorkersGHs(workers)}
            currentTotal10m={sumWorkers10mGHs(workers)}
            unit="GH/s"
            title="Hashrate GH/s (24h)"
          />
        </div>

        <p className="text-muted small mt-2 mb-0">
          El estado se obtiene del pool Kryptex (QUAI-SHA256 y QUAI-SCRYPT). Hashrate 10m &gt; 0 = prendido.
        </p>
      </div>
    </div>
  );
}
