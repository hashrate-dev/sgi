import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getUsuariosClientesCuentasTienda,
  syncTiendaOnlineClientsFromUsers,
  type ClienteCuentaTiendaRow,
} from "../lib/api.js";
import "../styles/usuarios-clientes-cuentas.css";

const PAGE_SIZE_OPTIONS = [20, 25, 30] as const;

function fmtRegistro(iso: string | undefined): { date: string; time: string } | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  return {
    date: d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function hasText(v: string | undefined): v is string {
  return Boolean(v?.trim());
}

function dash(v: string | undefined): string {
  return hasText(v) ? v.trim() : "—";
}

function tiendaCodeSortKey(code: string | undefined): number {
  const u = (code ?? "").trim().toUpperCase();
  const mA = /^A9(\d+)$/.exec(u);
  if (mA) return 900_000_000 + Number(mA[1]);
  const mWeb = /^WEB-(\d+)$/i.exec(u);
  if (mWeb) return Number(mWeb[1]);
  return 0;
}

function normalizeEmail(e: string | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

function fullName(r: ClienteCuentaTiendaRow): string {
  return [r.nombre, r.apellidos].filter(hasText).join(" ").trim();
}

export function UsuariosClientesCuentasPanel() {
  const [rows, setRows] = useState<ClienteCuentaTiendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [goToPage, setGoToPage] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        await syncTiendaOnlineClientsFromUsers();
      } catch (e) {
        console.warn("syncTiendaOnlineClientsFromUsers:", e);
      }
      try {
        const r = await getUsuariosClientesCuentasTienda();
        const list = Array.isArray(r?.clientes) ? r.clientes : [];
        list.sort((a, b) => {
          const ta = new Date(a.cuenta_creada).getTime();
          const tb = new Date(b.cuenta_creada).getTime();
          if (tb !== ta) return tb - ta;
          return tiendaCodeSortKey(b.code) - tiendaCodeSortKey(a.code);
        });
        setRows(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar cuentas de clientes");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [
        r.code,
        r.cuenta_email,
        r.email,
        r.nombre,
        r.apellidos,
        r.celular,
        r.telefono,
        r.ciudad,
        r.pais,
        r.usuario,
        r.documento_identidad,
        String(r.user_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  const sinFicha = useMemo(() => rows.filter((r) => !r.code?.trim()).length, [rows]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  function handleGoTo() {
    const n = parseInt(goToPage, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
      setPage(n);
      setGoToPage("");
    }
  }

  const listSubtitle =
    "Cuentas creadas desde el registro público de la tienda online. Filtro por código, nombre, correo o teléfono.";

  return (
    <div className="usuarios-page-card ucc-wrap">
      <div className="usuarios-page-header">
        <div className="usuarios-page-header-inner">
          <h2 className="usuarios-page-title" id="usuarios-heading-clientes-cuentas">
            <span className="usuarios-page-title-icon" aria-hidden>
              <i className="bi bi-shop" />
            </span>
            Cuentas clientes — tienda online
          </h2>
          <p className="usuarios-page-subtitle">
            Datos del registro público: nombre, apellidos, país, ciudad, celular, teléfono y correo.
          </p>
        </div>
      </div>

      <div className="usuarios-page-body">
        <div className="historial-filtros-outer ucc-filtros-outer">
          <div className="historial-filtros-container">
            <div className="card historial-filtros-card">
              <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
              <div className="row g-3 align-items-end ucc-filtros-row">
                <div className="col-12 col-md-6 col-lg-7">
                  <label className="form-label small fw-bold mb-1" htmlFor="ucc-search">
                    Buscar
                  </label>
                  <input
                    id="ucc-search"
                    type="search"
                    className="form-control form-control-sm w-100"
                    placeholder="Buscar cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="col-6 col-md-auto d-flex align-items-end filtros-limpiar-col">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                    onClick={() => setSearch("")}
                    disabled={!search.trim()}
                  >
                    Limpiar
                  </button>
                </div>
                <div className="col-6 col-md-auto d-flex align-items-end ms-md-auto">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                    onClick={() => load()}
                    disabled={loading}
                  >
                    <i className="bi bi-arrow-clockwise me-1" aria-hidden />
                    Actualizar
                  </button>
                </div>
              </div>
              {sinFicha > 0 ? (
                <p className="ucc-filtros-meta small mb-0 mt-3">
                  <i className="bi bi-exclamation-circle me-1" aria-hidden />
                  <strong>{sinFicha}</strong> cuenta{sinFicha === 1 ? "" : "s"} sin código A9 (revisá en Cuentas de usuario).
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="activity-loading py-5">
            <div className="spinner-border text-secondary" role="status" aria-label="Espere un momento" />
          </div>
        ) : error ? (
          <div className="empty-activity py-4">
            <i className="bi bi-exclamation-triangle text-warning" />
            <p className="mb-2">{error}</p>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => load()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="historial-listado-wrap historial-listado-outer ucc-listado-wrap">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0 listado-table-title">
                📄 Listado de cuentas ({filtered.length})
              </h6>
            </div>
            <p className="text-muted small mb-3">{listSubtitle}</p>

            <div className="ucc-table-viewport">
              <table className="table table-sm align-middle ucc-listado-table mb-0">
                <thead>
                  <tr>
                    <th className="ucc-col-code">Código</th>
                    <th className="ucc-col-alta">Alta</th>
                    <th className="ucc-col-cliente">Cliente</th>
                    <th className="ucc-col-ubic">Ubicación</th>
                    <th className="ucc-col-contacto">Contacto</th>
                    <th className="ucc-col-email">Correo</th>
                    <th className="ucc-col-doc">Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <small>
                          {rows.length === 0
                            ? "Aún no hay clientes registrados desde la tienda online."
                            : "Ningún resultado con el filtro actual."}
                        </small>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((r) => {
                      const reg = fmtRegistro(r.cuenta_creada);
                      const mailCuenta = r.cuenta_email?.trim() || r.email?.trim() || "";
                      const mailReg = r.email?.trim() || "";
                      const mailRegDiff =
                        mailReg && normalizeEmail(mailReg) !== normalizeEmail(mailCuenta) ? mailReg : "";
                      const nombre = fullName(r);
                      const cel = r.celular?.trim();
                      const tel = r.telefono?.trim();
                      const hasContact = Boolean(cel || tel);
                      const ubicTitle = [r.ciudad, r.pais].filter(hasText).join(", ");
                      return (
                        <tr key={r.user_id}>
                          <td className="ucc-col-code">
                            <span className="ucc-code-pill">{dash(r.code)}</span>
                          </td>
                          <td className="ucc-col-alta">
                            {reg ? (
                              <>
                                <span className="ucc-cell-main">{reg.date}</span>
                                {reg.time ? <span className="ucc-cell-sub">{reg.time}</span> : null}
                              </>
                            ) : (
                              <span className="ucc-cell-empty">—</span>
                            )}
                          </td>
                          <td className="ucc-col-cliente" title={nombre || undefined}>
                            <span className="ucc-ellipsis">{nombre || "—"}</span>
                          </td>
                          <td className="ucc-col-ubic" title={ubicTitle || undefined}>
                            {hasText(r.ciudad) || hasText(r.pais) ? (
                              <>
                                {hasText(r.ciudad) ? <span className="ucc-cell-main ucc-ellipsis">{r.ciudad}</span> : null}
                                {hasText(r.pais) ? <span className="ucc-cell-sub ucc-ellipsis">{r.pais}</span> : null}
                              </>
                            ) : (
                              <span className="ucc-cell-empty">—</span>
                            )}
                          </td>
                          <td className="ucc-col-contacto">
                            {hasContact ? (
                              <>
                                {cel ? <span className="ucc-cell-main ucc-ellipsis" title={cel}>{cel}</span> : null}
                                {tel ? <span className="ucc-cell-sub ucc-ellipsis" title={tel}>{tel}</span> : null}
                              </>
                            ) : (
                              <span className="ucc-cell-empty">—</span>
                            )}
                          </td>
                          <td className="ucc-col-email" title={mailCuenta || mailRegDiff || undefined}>
                            {mailCuenta || mailRegDiff ? (
                              <span className="ucc-ellipsis ucc-email-link">{mailCuenta || mailRegDiff}</span>
                            ) : (
                              <span className="ucc-cell-empty">—</span>
                            )}
                          </td>
                          <td className="ucc-col-doc">
                            <span className="ucc-ellipsis" title={r.documento_identidad}>
                              {dash(r.documento_identidad)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
                <div className="d-flex align-items-center gap-2">
                  <label className="text-muted small mb-0">Mostrar</label>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: "auto" }}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted small">registros</span>
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="text-muted small">
                    Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de{" "}
                    {filtered.length}
                  </span>
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
                  <div className="d-flex align-items-center gap-1">
                    <span className="small text-muted">Ir a</span>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      style={{ width: "4rem" }}
                      min={1}
                      max={totalPages}
                      value={goToPage}
                      onChange={(e) => setGoToPage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGoTo())}
                      placeholder={String(totalPages)}
                    />
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleGoTo}>
                      Ir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
