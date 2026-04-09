import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
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
import { getKryptexWorkers, getKryptexLectorWallet, type KryptexWorkerData } from "../lib/api";
import "../styles/facturacion.css";
import "../styles/hrshome.css";

function workerUrl(poolUrl: string, name: string) {
  return `${poolUrl}/${name}/prop`;
}

function getWalletFromPoolUrl(poolUrl: string): { pool: string; wallet: string } | null {
  const m = poolUrl.match(/pool\.kryptex\.com\/(quai-(?:sha256|scrypt))\/miner\/stats\/(0x[a-fA-F0-9]+)/);
  return m ? { pool: m[1]!, wallet: m[2]! } : null;
}

function kryptexDetalleUrl(poolUrl: string): string {
  const info = getWalletFromPoolUrl(poolUrl);
  if (!info) return "/kryptex";
  return `/kryptex/detalle?wallet=${encodeURIComponent(info.wallet)}&pool=${encodeURIComponent(info.pool)}`;
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
            className="fact-back kryptex-btn"
            onClick={() => loadWorkers(true)}
            disabled={refreshing}
          >
            <i className={`bi bi-arrow-clockwise me-1 ${refreshing ? "kryptex-spin" : ""}`} />
            Volver a cargar
          </button>
        </div>
      </div>
      {error && (
        <div className="alert alert-danger py-2 mb-2" role="alert">
          <small>{error}</small>
        </div>
      )}
      {isInitialLoad ? (
        <div className="kryptex-table-placeholder d-flex justify-content-center py-4">
          <div className="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Espere un momento" />
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
                <th className="text-end">Acción</th>
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
                  <td className="text-end">
                    <Link
                      to={kryptexDetalleUrl(w.poolUrl)}
                      className="fact-back kryptex-btn kryptex-btn-sm me-1"
                    >
                      Ver cuenta
                    </Link>
                    <a
                      href={workerUrl(w.poolUrl, w.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fact-back kryptex-btn kryptex-btn-icon"
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
  const { user, logout } = useAuth();
  const [lectorRedirect, setLectorRedirect] = useState<{ wallet: string; pool: string } | null>(null);
  const [lectorError, setLectorError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<KryptexWorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyTH, setHistoryTH] = useState<HashratePoint[]>(() => loadHashrateHistory(STORAGE_KEY_TH));
  const [historyGH, setHistoryGH] = useState<HashratePoint[]>(() => loadHashrateHistory(STORAGE_KEY_GH));

  const isLector = (user as unknown as { role?: string } | null)?.role === "lector";

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

  // LECTOR: redirigir a su detalle (no ver dashboard completo)
  useEffect(() => {
    if (!isLector) return;
    getKryptexLectorWallet()
      .then((r) => setLectorRedirect({ wallet: r.wallet, pool: r.pool }))
      .catch((err) => setLectorError(err instanceof Error ? err.message : "Error al cargar cuenta"));
  }, [isLector]);

  if (isLector) {
    if (lectorRedirect) {
      return <Navigate to={`/kryptex/detalle?wallet=${encodeURIComponent(lectorRedirect.wallet)}&pool=${encodeURIComponent(lectorRedirect.pool)}`} replace />;
    }
    if (lectorError) {
      return (
        <div className="hrs-home">
          <div className="hrs-home-container container" style={{ maxWidth: "600px" }}>
            <PageHeader title="Kryptex" rightContent={<button type="button" className="fact-back" onClick={logout}><i className="bi bi-box-arrow-right me-1" />Cerrar sesión</button>} />
            <div className="alert alert-danger">{lectorError}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="hrs-home">
        <div className="hrs-home-container container d-flex align-items-center justify-content-center min-vh-50">
          <div className="spinner-border text-primary" role="status" aria-label="Espere un momento" />
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadWorkers();
    const interval = setInterval(() => loadWorkers(true), 45000);
    return () => clearInterval(interval);
  }, [loadWorkers]);

  return (
    <div className="hrs-home">
      <div className="hrs-home-container container" style={{ maxWidth: "1200px" }}>
        <PageHeader
          title="Kryptex"
          showBackButton={!isLector}
          backTo="/"
          backText="Volver al inicio"
          rightContent={isLector ? (
            <button type="button" className="fact-back" onClick={logout}>
              <i className="bi bi-box-arrow-right me-1" />
              Cerrar sesión
            </button>
          ) : undefined}
        />

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
