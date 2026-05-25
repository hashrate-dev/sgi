import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getUsuariosClientesCuentasTienda,
  syncTiendaOnlineClientsFromUsers,
  type ClienteCuentaTiendaRow,
} from "../lib/api.js";

const PAGE_SIZE_OPTIONS = [20, 25, 30] as const;

function fmtDate(iso: string | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-AR");
}

function cell(v: string | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

function tiendaCodeSortKey(code: string | undefined): number {
  const u = (code ?? "").trim().toUpperCase();
  const mA = /^A9(\d+)$/.exec(u);
  if (mA) return 900_000_000 + Number(mA[1]);
  const mWeb = /^WEB-(\d+)$/i.exec(u);
  if (mWeb) return Number(mWeb[1]);
  return 0;
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

  return (
    <div className="usuarios-page-card">
      <div className="usuarios-page-header">
        <div className="usuarios-page-header-inner">
          <h2 className="usuarios-page-title" id="usuarios-heading-clientes-cuentas">
            <span className="usuarios-page-title-icon" aria-hidden>
              <i className="bi bi-shop" />
            </span>
            Cuentas clientes — tienda online
          </h2>
          <p className="usuarios-page-subtitle">
            Datos cargados en el registro público de la tienda: correo, nombre, apellidos, país, ciudad, celular y
            teléfono opcional.
          </p>
        </div>
      </div>

      <div className="usuarios-page-body">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <p className="text-muted small mb-0">
            <i className="bi bi-people-fill me-1" aria-hidden />
            <strong>{rows.length}</strong> cuenta{rows.length === 1 ? "" : "s"} cliente
            {search.trim() ? (
              <>
                {" "}
                · <strong>{filtered.length}</strong> con el filtro
              </>
            ) : null}
            {sinFicha > 0 ? (
              <>
                {" "}
                · <span className="text-warning">
                  <strong>{sinFicha}</strong> sin código A9 (sincronizá o revisá en Cuentas de usuario)
                </span>
              </>
            ) : null}
          </p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => load()} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1" aria-hidden />
            Actualizar
          </button>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-md-8">
            <label className="form-label small text-muted mb-1" htmlFor="ucc-search">
              Buscar
            </label>
            <input
              id="ucc-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="Código, nombre, correo, celular, país…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="col-md-4 d-flex align-items-end">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSearch("")}>
              Limpiar filtro
            </button>
          </div>
        </div>

        {loading ? (
          <div className="activity-loading py-4">
            <div className="spinner-border" role="status" aria-label="Espere un momento" />
          </div>
        ) : error ? (
          <div className="empty-activity">
            <i className="bi bi-exclamation-triangle text-warning" />
            <p className="mb-2">{error}</p>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => load()}>
              Reintentar
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-activity">
            <i className="bi bi-inbox" />
            <p className="mb-0">
              {rows.length === 0
                ? "Aún no hay clientes registrados desde la tienda online."
                : "Ningún resultado con ese filtro."}
            </p>
          </div>
        ) : (
          <div className="monitor-asic-equipos-group usuarios-table-registro rounded-3 border bg-white shadow-sm overflow-hidden">
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Registro</th>
                    <th scope="col">Correo cuenta</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Apellidos</th>
                    <th scope="col">País</th>
                    <th scope="col">Ciudad</th>
                    <th scope="col">Celular</th>
                    <th scope="col">Teléfono</th>
                    <th scope="col">Correo registro</th>
                    <th scope="col">Documento</th>
                    <th scope="col">ID usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.user_id}>
                      <td>
                        <span className="sgi-tech-code fw-semibold">{cell(r.code)}</span>
                      </td>
                      <td className="text-nowrap">{fmtDate(r.cuenta_creada)}</td>
                      <td>
                        <span className="sgi-tech-code">{cell(r.cuenta_email)}</span>
                      </td>
                      <td>{cell(r.nombre)}</td>
                      <td>{cell(r.apellidos)}</td>
                      <td>{cell(r.pais)}</td>
                      <td>{cell(r.ciudad)}</td>
                      <td>{cell(r.celular)}</td>
                      <td>{cell(r.telefono)}</td>
                      <td>
                        <span className="sgi-tech-code">{cell(r.email)}</span>
                      </td>
                      <td>{cell(r.documento_identidad)}</td>
                      <td>
                        <span className="sgi-tech-code text-muted">{r.user_id}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
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
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small">
                Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de {filtered.length}
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
    </div>
  );
}
