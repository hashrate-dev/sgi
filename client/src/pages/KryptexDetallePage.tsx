import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import {
  KryptexHashrateChart,
  sumWorkersTHs,
  sumWorkersGHs,
  sumWorkers10mTHs,
  sumWorkers10mGHs,
  loadHashrateHistory,
  saveHashrateHistory,
  type HashratePoint,
} from "../components/KryptexHashrateChart";
import { getKryptexPayouts, type KryptexPayoutsData } from "../lib/api";
import "../styles/facturacion.css";
import "../styles/hrshome.css";

const MAX_HISTORY_POINTS = 48;

function formatNum(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function KryptexDetallePage() {
  const [searchParams] = useSearchParams();
  const wallet = searchParams.get("wallet") ?? "";
  const pool = searchParams.get("pool") ?? "quai-scrypt";
  const [data, setData] = useState<KryptexPayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isTHs = pool.includes("sha256");
  const storageKey = `kryptex_detalle_${isTHs ? "th" : "gh"}_${wallet}`;
  const [history, setHistory] = useState<HashratePoint[]>(() => loadHashrateHistory(storageKey));

  const loadData = useCallback((forceRefresh = false) => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getKryptexPayouts(wallet, pool, forceRefresh)
      .then((res) => {
        setData(res);
        if (res.workers.length > 0) {
          const now = Date.now();
          const total24h = isTHs ? sumWorkersTHs(res.workers) : sumWorkersGHs(res.workers);
          const total10m = isTHs ? sumWorkers10mTHs(res.workers) : sumWorkers10mGHs(res.workers);
          setHistory((prev) => {
            const next = [...prev, { timestamp: now, value24h: total24h, value10m: total10m }].slice(-MAX_HISTORY_POINTS);
            saveHashrateHistory(storageKey, next);
            return next;
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [wallet, pool, isTHs, storageKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setHistory(loadHashrateHistory(storageKey));
  }, [storageKey]);

  const chartTotals = useMemo(() => {
    if (!data?.workers.length) return { total24h: 0, total10m: 0 };
    return {
      total24h: isTHs ? sumWorkersTHs(data.workers) : sumWorkersGHs(data.workers),
      total10m: isTHs ? sumWorkers10mTHs(data.workers) : sumWorkers10mGHs(data.workers),
    };
  }, [data?.workers, isTHs]);

  if (!wallet) {
    return (
      <div className="hrs-home">
        <div className="hrs-home-container container" style={{ maxWidth: "1200px" }}>
          <PageHeader title="Kryptex - Detalle" showBackButton backTo="/kryptex" backText="Volver a Kryptex" />
          <div className="alert alert-warning">No se especificó una cuenta. <Link to="/kryptex">Volver a Kryptex</Link></div>
        </div>
      </div>
    );
  }

  const shortWallet = `${wallet.slice(0, 10)}...${wallet.slice(-8)}`;

  return (
    <div className="hrs-home">
      <div className="hrs-home-container container" style={{ maxWidth: "1200px" }}>
        <PageHeader
          title={`Cuenta: ${shortWallet}${data?.usuario ? ` · ${data.usuario}` : ""}`}
          showBackButton
          backTo="/kryptex"
          backText="Volver a Kryptex"
        />

        <div className="hrs-card p-4 mb-4 kryptex-detalle" style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
            <span className="text-muted fw-medium">{data?.usuario ? `@${data.usuario}` : ""}</span>
            <div className="d-flex gap-2 align-items-center">
              <button type="button" className="fact-back kryptex-btn" onClick={() => loadData(true)} disabled={loading}>
                <i className={`bi bi-arrow-clockwise me-1 ${loading ? "kryptex-spin" : ""}`} />
                Actualizar
              </button>
              <a
                href={`https://pool.kryptex.com/${pool}/miner/payouts/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="fact-back kryptex-btn d-inline-flex align-items-center gap-1"
              >
                <i className="bi bi-box-arrow-up-right me-1" />
                Ver en Kryptex Pool
              </a>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger py-2 mb-3">
              <small>{error}</small>
            </div>
          )}

          {loading && !data ? (
            <div className="text-center py-5 text-muted">
              <div className="spinner-border mb-2" />
              <p className="mb-0">Cargando datos de payouts...</p>
            </div>
          ) : data ? (
            <>
              {/* Mineros, PAGOS PENDIENTES, PAGOS ACUMULADOS */}
              <div className="row g-3 mb-4">
                {data.workers24h != null && (
                  <div className="col-6 col-md-3">
                    <div className="card border-0 shadow-sm h-100 kryptex-metric-card">
                      <div className="card-body">
                        <div className="small text-muted text-uppercase fw-bold">Mineros</div>
                        <div className="fs-4 fw-bold">{data.workers24h}</div>
                        <div className="small text-muted">conectados</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="col-6 col-md-3">
                  <div className="card border-0 shadow-sm h-100 kryptex-metric-card">
                    <div className="card-body">
                      <div className="small text-muted fw-bold">Pagos Pendientes</div>
                      <div className="fs-4 fw-bold text-primary">{formatNum(data.unpaid)} QUAI</div>
                      {data.unpaidUsd != null && (
                        <div className="small text-muted">≈ {formatNum(data.unpaidUsd)} USD</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="card border-0 shadow-sm h-100 kryptex-metric-card">
                    <div className="card-body">
                      <div className="small text-muted fw-bold">Pagos Acumulados</div>
                      <div className="fs-4 fw-bold text-success">{formatNum(data.paid)} QUAI</div>
                      {data.paidUsd != null && (
                        <div className="small text-muted">≈ {formatNum(data.paidUsd)} USD</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {data.workers.length > 0 && (
                <div className="card border-0 shadow-sm mb-4 kryptex-card-rounded">
                  <div className="card-header bg-transparent border-bottom">
                    <h6 className="mb-0 fw-bold">
                      <i className="bi bi-cpu me-2" />
                      Equipos (Name)
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0 align-middle">
                        <thead>
                          <tr>
                            <th className="text-start">Minero</th>
                            <th className="text-start">Hashrate (24h)</th>
                            <th className="text-start">Hashrate (10m)</th>
                            <th className="text-start">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.workers.map((w) => (
                            <tr key={w.name}>
                              <td className="fw-medium">{w.name}</td>
                              <td>{w.hashrate24h ?? "—"}</td>
                              <td>{w.hashrate10m ?? "—"}</td>
                              <td>
                                <span className={`badge ${w.status === "activo" ? "bg-success" : "bg-danger"}`}>
                                  {w.status === "activo" ? "Prendido 🟢" : "Apagado 🔌"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Hashrate (24h) */}
              <div className="card border-0 shadow-sm mb-4 kryptex-hashrate-card">
                <div className="card-body p-0">
                  <KryptexHashrateChart
                    history={history}
                    currentTotal24h={chartTotals.total24h}
                    currentTotal10m={chartTotals.total10m}
                    unit={isTHs ? "TH/s" : "GH/s"}
                    title="Hashrate (24h)"
                  />
                </div>
              </div>

              {/* Payouts: gráfico Unconfirmed Reward + tabla */}
              <div className="card border-0 shadow-sm kryptex-card-rounded">
                <div className="card-header bg-transparent border-bottom">
                  <h6 className="mb-0 fw-bold">Payouts</h6>
                </div>
                <div className="card-body">
                  {data.payouts.length === 0 ? (
                    <div className="text-center py-4 text-muted">No hay payouts registrados.</div>
                  ) : (
                    <>
                      <p className="small text-muted mb-3">
                        Los rewards QUAI tardan ~14 días en confirmarse. Los pagos se procesan diariamente a las 06:00 UTC.
                      </p>
                      <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Unconfirmed Reward (31d)</th>
                            <th>Cantidad (QUAI)</th>
                            <th>Estado</th>
                            <th>Hash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const maxAmount = Math.max(...data.payouts.map((p) => p.amount), 1);
                            return data.payouts.map((p, i) => (
                            <tr key={i}>
                              <td>{p.date}</td>
                              <td style={{ minWidth: "140px" }}>
                                <div className="progress" style={{ height: "1.25rem" }}>
                                  <div
                                    className="progress-bar"
                                    role="progressbar"
                                    style={{ width: `${(p.amount / maxAmount) * 100}%`, backgroundColor: "#6366f1" }}
                                  />
                                </div>
                              </td>
                              <td className="fw-medium">{formatNum(p.amount)}</td>
                              <td>
                                <span className={`badge ${p.status === "FINISHED" ? "bg-success" : "bg-secondary"}`}>
                                  {p.status}
                                </span>
                              </td>
                              <td>
                                <a
                                  href={`https://quaiscan.io/tx/${p.txid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-truncate d-inline-block"
                                  style={{ maxWidth: "120px" }}
                                >
                                  {p.txid ? `${p.txid.slice(0, 10)}...` : "—"}
                                </a>
                              </td>
                            </tr>
                          ));
                          })()}
                        </tbody>
                      </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
