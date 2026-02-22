import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getClients, wakeUpBackend } from "../lib/api";
import type { Client } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import "../styles/facturacion.css";

export function CuentaClientePage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientListSearch, setClientListSearch] = useState("");

  const clientNames = useMemo(() => {
    const names = new Set<string>();
    clients.forEach((c) => {
      if (c.name?.trim()) names.add(c.name.trim());
      if (c.name2?.trim()) names.add(c.name2.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const filteredAndSortedClients = useMemo(() => {
    const q = clientListSearch.toLowerCase().trim();
    let list = [...clients];
    if (q) {
      list = list.filter(
        (c) =>
          c.code?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q) ||
          c.name2?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [clients, clientListSearch]);

  const clientsByLetter = useMemo(() => {
    const groups: Record<string, Client[]> = {};
    filteredAndSortedClients.forEach((c) => {
      const letter = (c.name ?? "?").charAt(0).toUpperCase();
      const key = /[A-ZÁÉÍÓÚÑ]/.test(letter) ? letter : "#";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.keys(groups)
      .sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
      .map((letter) => ({ letter, items: groups[letter]! }));
  }, [filteredAndSortedClients]);

  const loadClients = useCallback(() => {
    setLoadingClients(true);
    getClients()
      .then((r) => setClients((r.clients ?? []) as Client[]))
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false));
  }, []);

  useEffect(() => {
    wakeUpBackend().then(loadClients);
  }, [loadClients]);

  const detalleUrl = (clientName: string) => `/cuenta-cliente/detalle?cliente=${encodeURIComponent(clientName)}`;

  return (
    <div className="fact-page clientes-page cuenta-cliente-page">
      <div className="container">
        <PageHeader
          title="Detalle de cuenta por cliente"
          showBackButton
          backTo="/"
          backText="Volver al inicio"
        />
      </div>

      <div className="container">
        <div className="cuenta-cliente-filtro-block historial-filtros-container">
          <div className="card historial-filtros-card">
            <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
            <div className="row g-2 align-items-end">
              <div className="col-md-3">
                <label className="form-label small fw-bold">Cliente</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  list="clientes-datalist"
                  placeholder="Buscar cliente por nombre..."
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && clientFilter.trim() && navigate(detalleUrl(clientFilter.trim()))}
                />
                <datalist id="clientes-datalist">
                  {clientNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-bold">Filtrar directorio</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Código, nombre o email..."
                  value={clientListSearch}
                  onChange={(e) => setClientListSearch(e.target.value)}
                />
              </div>
              <div className="col-md-2 d-flex align-items-end">
                {clientFilter.trim() ? (
                  <Link
                    to={detalleUrl(clientFilter.trim())}
                    className="btn btn-outline-secondary btn-sm cuenta-cliente-btn-ver-detalle"
                  >
                    Ver detalle
                  </Link>
                ) : (
                  <span className="btn btn-outline-secondary btn-sm cuenta-cliente-btn-ver-detalle disabled opacity-50">
                    Ver detalle
                  </span>
                )}
              </div>
              {loadingClients && (
                <div className="col-12">
                  <small className="text-white-50">Cargando lista de clientes...</small>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="cuenta-cliente-directorio-header-inline">
          <span className="cuenta-cliente-directorio-icon">📋</span>
          <div>
            <h6 className="cuenta-cliente-directorio-title mb-0">Directorio de clientes</h6>
            <p className="cuenta-cliente-directorio-subtitle mb-0">Seleccioná un cliente y hacé clic en &quot;Ver cuenta&quot; para ver el detalle.</p>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="cuenta-cliente-directorio-wrapper">
        {loadingClients ? (
          <div className="cuenta-cliente-directorio-loading">
            <div className="spinner-border spinner-border-sm text-secondary me-2" />
            <span>Cargando directorio...</span>
          </div>
        ) : filteredAndSortedClients.length === 0 ? (
          <div className="cuenta-cliente-directorio-empty">
            <span className="cuenta-cliente-directorio-empty-icon">👥</span>
            <p className="mb-0">{clientListSearch ? "No se encontraron clientes con ese criterio." : "No hay clientes registrados."}</p>
          </div>
        ) : (
          <div className="cuenta-cliente-directorio-table-wrap">
            <table className="table table-sm align-middle cuenta-cliente-directorio-table">
              <thead>
                <tr>
                  <th className="cuenta-cliente-th-letter"> </th>
                  <th className="cuenta-cliente-th-code">Código</th>
                  <th className="cuenta-cliente-th-name">Cliente</th>
                  <th className="cuenta-cliente-th-action text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                {clientsByLetter.map(({ letter, items }) =>
                  items.map((c) => (
                    <tr key={c.id ?? c.code} className="cuenta-cliente-row">
                      <td className="cuenta-cliente-cell-letter">
                        {items.indexOf(c) === 0 ? (
                          <span className="cuenta-cliente-letter-badge">{letter}</span>
                        ) : null}
                      </td>
                      <td className="cuenta-cliente-cell-code">
                        <code className="cuenta-cliente-code">{c.code}</code>
                      </td>
                      <td className="cuenta-cliente-cell-name">
                        <span className="cuenta-cliente-name-primary">{c.name}</span>
                        {c.name2 && <span className="cuenta-cliente-name-secondary"> / {c.name2}</span>}
                      </td>
                      <td className="cuenta-cliente-cell-action text-end">
                        <Link
                          to={detalleUrl(c.name ?? "")}
                          className="cuenta-cliente-btn-ver"
                        >
                          Ver cuenta
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
