import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import {
  deleteGarantiaEmittedOne,
  deleteGarantiasEmittedAll,
  getGarantiasEmitted,
  verifyPassword,
  type GarantiasEmittedResponse,
} from "../lib/api";
import type { Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

const MS_15_DAYS = 15 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 25;

/** Hora sin segundos (HH:MM) */
function formatTimeNoSeconds(t: string | undefined): string {
  if (!t || t === "-") return "-";
  const parts = String(t).trim().split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return t;
}

export function HistorialGarantiasPage() {
  const [items, setItems] = useState<{ invoice: Invoice; emittedAt: string }[]>([]);
  const [, setLoading] = useState(true);
  const [qClient, setQClient] = useState("");
  const [detailItem, setDetailItem] = useState<{ invoice: Invoice; emittedAt: string } | null>(null);
  const [page, setPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearConfirm2, setShowClearConfirm2] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearPasswordError, setClearPasswordError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [passwordAttempts, setPasswordAttempts] = useState(0);
  const MAX_PASSWORD_ATTEMPTS = 3;

  useEffect(() => {
    getGarantiasEmitted()
      .then((r: GarantiasEmittedResponse) => setItems(r.items as { invoice: Invoice; emittedAt: string }[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const itemsInPeriod = useMemo(
    () => items.filter((item) => Date.now() - new Date(item.emittedAt).getTime() < MS_15_DAYS),
    [items]
  );

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    if (!client) return [...itemsInPeriod].reverse();
    return itemsInPeriod
      .filter((item) => item.invoice.clientName.toLowerCase().includes(client))
      .reverse();
  }, [itemsInPeriod, qClient]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [filtered.length]);

  const stats = useMemo(() => {
    const totalRecibos = itemsInPeriod.length;
    const montoTotal = itemsInPeriod.reduce((s, item) => s + Math.abs(item.invoice.total || 0), 0);
    return { totalRecibos, montoTotal, registros: itemsInPeriod.length };
  }, [itemsInPeriod]);

  async function removeOne(item: { invoice: Invoice; emittedAt: string }) {
    try {
      await deleteGarantiaEmittedOne(item.invoice.number);
      const res = await getGarantiasEmitted();
      setItems(res.items as { invoice: Invoice; emittedAt: string }[]);
      if (detailItem && detailItem.invoice.number === item.invoice.number) {
        setDetailItem(null);
      }
      showToast(`Recibo ${item.invoice.number} eliminado del historial.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al eliminar.", "error");
    }
  }

  function handleClearConfirm() {
    setShowClearConfirm(false);
    setShowClearConfirm2(true);
    setClearPassword("");
    setClearPasswordError("");
    setPasswordAttempts(0);
  }

  async function handleClearConfirm2() {
    if (!clearPassword.trim()) {
      setClearPasswordError("Debes ingresar tu contraseña para confirmar");
      return;
    }
    if (passwordAttempts >= MAX_PASSWORD_ATTEMPTS) {
      setShowClearConfirm2(false);
      setClearPassword("");
      setClearPasswordError("");
      setPasswordAttempts(0);
      showToast("Se agotaron los intentos. La operación ha sido cancelada.", "error");
      return;
    }
    setClearing(true);
    setClearPasswordError("");
    try {
      await verifyPassword(clearPassword);
      await deleteGarantiasEmittedAll();
      setShowClearConfirm2(false);
      setClearPassword("");
      setClearPasswordError("");
      setPasswordAttempts(0);
      setItems([]);
      setDetailItem(null);
      showToast("Todo el historial de recibos de garantía ha sido eliminado.", "success");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Contraseña incorrecta";
      const isConnectionError = errorMessage === "Failed to fetch" || errorMessage.includes("NetworkError") || errorMessage === "Load failed" || errorMessage.includes("conexión");
      if (isConnectionError) {
        setClearPasswordError("No se pudo conectar con el servidor. Verificá que esté activo e intentá de nuevo.");
        showToast("Error de conexión. Verificá que el servidor esté activo.", "error");
        return;
      }
      const newAttempts = passwordAttempts + 1;
      setPasswordAttempts(newAttempts);
      const remainingAttempts = MAX_PASSWORD_ATTEMPTS - newAttempts;
      if (remainingAttempts > 0) {
        setClearPasswordError(errorMessage);
        setClearPassword("");
        showToast(`Contraseña incorrecta. Quedan ${remainingAttempts} ${remainingAttempts === 1 ? "intento" : "intentos"}.`, "error");
      } else {
        setShowClearConfirm2(false);
        setClearPassword("");
        setClearPasswordError("");
        setPasswordAttempts(0);
        showToast("Se agotaron los intentos. Operación cancelada.", "error");
      }
    } finally {
      setClearing(false);
    }
  }

  function handleClearCancel() {
    setShowClearConfirm(false);
    setShowClearConfirm2(false);
    setClearPassword("");
    setClearPasswordError("");
    setPasswordAttempts(0);
  }

  async function downloadEmittedPdf(item: { invoice: Invoice; emittedAt: string }) {
    const inv = item.invoice;
    const date = new Date(item.emittedAt);
    let logoBase64: string | undefined;
    try {
      logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
    } catch {
      //
    }
    const doc = generateFacturaPdf(
      {
        number: inv.number,
        type: inv.type,
        clientName: inv.clientName,
        clientPhone: inv.clientPhone,
        clientEmail: inv.clientEmail,
        clientAddress: inv.clientAddress,
        clientCity: inv.clientCity,
        clientName2: inv.clientName2,
        clientPhone2: inv.clientPhone2,
        clientEmail2: inv.clientEmail2,
        clientAddress2: inv.clientAddress2,
        clientCity2: inv.clientCity2,
        date,
        items: inv.items,
        subtotal: Math.abs(inv.subtotal),
        discounts: Math.abs(inv.discounts),
        total: Math.abs(inv.total),
      },
      { logoBase64 }
    );
    const safeName = inv.clientName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
    doc.save(`${inv.number}_${safeName}.pdf`);
    showToast(`PDF ${inv.number} descargado.`, "success");
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Historial Garantías ANDE" />

        <div className="d-flex align-items-center gap-2 mb-3">
          <Link to="/equipos-asic" className="btn btn-outline-secondary btn-sm">
            ← Equipos ASIC
          </Link>
          <Link to="/equipos-asic/garantia-ande" className="btn btn-outline-primary btn-sm">
            Emitir documento Garantía
          </Link>
        </div>

        <div className="hrs-card hrs-card--rect p-4">
          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2 align-items-end">
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">Cliente</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Buscar cliente..."
                      value={qClient}
                      onChange={(e) => setQClient(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end">
                    <button
                      className="btn btn-outline-secondary btn-sm w-100"
                      onClick={() => setQClient("")}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="historial-listado-wrap historial-garantias-wrap">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">📄 Historial Recibos Garantía ANDE</h6>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm historial-limpiar-todo-btn"
                style={{ backgroundColor: "rgba(220, 53, 69, 0.4)" }}
                onClick={() => setShowClearConfirm(true)}
                disabled={itemsInPeriod.length === 0}
              >
                🗑️ Eliminar todo
              </button>
            </div>

            <div className="table-responsive">
              <table className="table table-sm align-middle historial-listado-table" style={{ fontSize: "0.85rem" }}>
                <thead className="table-dark">
                  <tr>
                    <th className="text-start historial-col-num">N°</th>
                    <th className="text-start historial-col-tipo">Tipo</th>
                    <th className="text-start historial-col-cliente">Cliente</th>
                    <th className="text-start historial-col-fecha-emision">Fecha<br />Emisión</th>
                    <th className="text-start historial-col-hora">Hora<br />Emisión</th>
                    <th className="text-start historial-col-total">Total</th>
                    <th className="text-center historial-col-acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <small>No hay recibos de garantía en los últimos 15 días</small>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((item) => (
                      <tr key={item.invoice.id}>
                        <td className="fw-bold text-start historial-col-num">{item.invoice.number}</td>
                        <td className="text-start historial-col-tipo">Recibo</td>
                        <td className="text-start historial-col-cliente" title={item.invoice.clientName}>
                          <span className="historial-cliente-nombre">{item.invoice.clientName}</span>
                        </td>
                        <td className="text-start historial-col-fecha-emision">{item.invoice.date}</td>
                        <td className="text-start historial-col-hora">{formatTimeNoSeconds(item.invoice.emissionTime)}</td>
                        <td className="text-start fw-bold historial-col-total">
                          {formatCurrencyNumber(Math.abs(item.invoice.total || 0))}<br />USD
                        </td>
                        <td className="text-center historial-col-acciones">
                          <div className="d-flex gap-1 justify-content-center align-items-center flex-nowrap historial-acciones-btns">
                            <button
                              type="button"
                              className="btn btn-sm border historial-accion-btn"
                              onClick={() => setDetailItem(item)}
                              title="Ver detalles"
                            >
                              ℹ️
                            </button>
                            <button
                              type="button"
                              className="fact-btn fact-btn-primary btn-sm historial-accion-btn"
                              onClick={() => downloadEmittedPdf(item)}
                              title="Descargar PDF"
                            >
                              📄
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm historial-accion-btn"
                              onClick={() => removeOne(item)}
                              title="Eliminar"
                            >
                              <span className="historial-accion-trash">🗑️</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > PAGE_SIZE && (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1 historial-pagination">
                <span className="text-muted small">
                  Mostrando {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} registros
                </span>
                <div className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ Anterior
                  </button>
                  <span className="px-2 small text-muted">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="row mt-4 g-3 historial-stats">
          <div className="col-6 col-md-4">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-success" />
              <div className="stat-label">Total recibos</div>
              <div className="stat-value text-success">{stats.totalRecibos}</div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-dark" />
              <div className="stat-label">Monto total</div>
              <div className="stat-value text-dark">
                {formatCurrencyNumber(stats.montoTotal)} <span className="currency">USD</span>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-info" />
              <div className="stat-label">Registros (15 días)</div>
              <div className="stat-value text-info">{stats.registros}</div>
            </div>
          </div>
        </div>

        {/* Modal Detalle */}
        {detailItem && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Detalle del recibo de garantía</h5>
                  <button type="button" className="btn-close" onClick={() => setDetailItem(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body">
                  {(() => {
                    const inv = detailItem.invoice;
                    return (
                      <>
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4"><strong>Número:</strong> {inv.number}</div>
                          <div className="col-md-4"><strong>Tipo:</strong> Recibo (Garantía ANDE)</div>
                          <div className="col-md-4"><strong>Cliente:</strong> {inv.clientName}</div>
                          <div className="col-md-4"><strong>Fecha emisión:</strong> {inv.date}</div>
                          <div className="col-md-4"><strong>Hora emisión:</strong> {formatTimeNoSeconds(inv.emissionTime)}</div>
                          <div className="col-md-4"><strong>Total:</strong> {formatCurrency(inv.total ?? 0)}</div>
                        </div>
                        {inv.items && inv.items.length > 0 && (
                          <div className="mb-3">
                            <strong>Ítems</strong>
                            <table className="table table-sm table-bordered mt-1">
                              <thead>
                                <tr>
                                  <th>Descripción</th>
                                  <th className="text-end">Cant.</th>
                                  <th className="text-end">Precio</th>
                                  <th className="text-end">Desc.</th>
                                  <th className="text-end">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.items.map((item, idx) => {
                                  const desc = item.garantiaCodigo
                                    ? [item.garantiaCodigo, "Garantías", item.garantiaMarca, item.garantiaModelo].filter(Boolean).join(" - ")
                                    : item.setupNombre || item.marcaEquipo ? `${item.marcaEquipo || ""} ${item.modeloEquipo || ""}`.trim() || "Ítem" : "Ítem";
                                  const lineTotal = (item.price || 0) * (item.quantity || 1) - (item.discount || 0) * (item.quantity || 1);
                                  return (
                                    <tr key={idx}>
                                      <td>{desc}</td>
                                      <td className="text-end">{item.quantity}</td>
                                      <td className="text-end">{formatCurrencyNumber(item.price || 0)} USD</td>
                                      <td className="text-end">{formatCurrencyNumber(item.discount || 0)} USD</td>
                                      <td className="text-end">{formatCurrencyNumber(lineTotal)} USD</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4 text-end"><strong>Subtotal:</strong> {formatCurrency(inv.subtotal ?? 0)}</div>
                          <div className="col-md-4 text-end"><strong>Descuento:</strong> {formatCurrency(inv.discounts ?? 0)}</div>
                          <div className="col-md-4 text-end"><strong>Total:</strong> {formatCurrency(inv.total ?? 0)}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailItem(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal primera confirmación - Eliminar todo */}
        {showClearConfirm && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper">
                    <svg className="historial-delete-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">Eliminar Todo el Historial</h5>
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-question">¿Eliminar todo el historial de recibos de garantía permanentemente?</p>
                  <p className="historial-delete-warning">Esta acción no se puede deshacer.</p>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={handleClearCancel}>Cancelar</button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleClearConfirm}>Continuar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal segunda confirmación - Contraseña */}
        {showClearConfirm2 && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal historial-delete-modal-password">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                    <svg className="historial-delete-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">Confirmar Eliminación</h5>
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-warning-text">Se eliminará <strong>todo</strong> el historial de recibos de garantía permanentemente.</p>
                  <p className="historial-delete-password-label">Si tienes permisos podrás eliminar todo</p>
                  {passwordAttempts > 0 && (
                    <div className="historial-delete-attempts-alert">
                      <svg className="historial-delete-attempts-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Intento {passwordAttempts}/{MAX_PASSWORD_ATTEMPTS} - Quedan {MAX_PASSWORD_ATTEMPTS - passwordAttempts} {MAX_PASSWORD_ATTEMPTS - passwordAttempts === 1 ? "intento" : "intentos"}</span>
                    </div>
                  )}
                  <div className="historial-delete-password-input-wrapper">
                    <label htmlFor="clearPasswordGarantias" className="historial-delete-password-label-input">Contraseña</label>
                    <input
                      type="password"
                      className={`historial-delete-password-input ${clearPasswordError ? "historial-delete-password-input-error" : ""}`}
                      id="clearPasswordGarantias"
                      value={clearPassword}
                      onChange={(e) => {
                        setClearPassword(e.target.value);
                        setClearPasswordError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !clearing) handleClearConfirm2();
                      }}
                      placeholder="Tu contraseña de acceso"
                      autoFocus
                      disabled={clearing}
                    />
                    {clearPasswordError && (
                      <div className="historial-delete-password-error">{clearPasswordError}</div>
                    )}
                  </div>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={handleClearCancel} disabled={clearing}>Cancelar</button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleClearConfirm2} disabled={clearing || !clearPassword.trim()}>
                    {clearing ? (<><span className="historial-delete-btn-spinner"></span> Verificando...</>) : "Sí, eliminar todo"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
