import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getClients, syncTiendaOnlineClientsFromUsers } from "../lib/api.js";
import type { Client } from "../lib/types.js";
import { canEditClientes, canExport } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { showToast } from "../components/ToastNotification.js";
import "../styles/facturacion.css";
import "../styles/hrs-clientes-tienda-online.css";

/** Cuentas registro tienda: códigos A90001+ (actual) o WEB-{id} (histórico). */
function isClienteTiendaOnline(c: Client): boolean {
  const code = (c.code ?? "").trim().toUpperCase();
  return code.startsWith("WEB-") || /^A9\d+$/.test(code);
}

/** Mayor = más reciente en lista (A9… por encima de WEB-* antiguos). */
function tiendaClientSortKey(code: string): number {
  const u = code.trim().toUpperCase();
  const mA = /^A9(\d+)$/.exec(u);
  if (mA) return 900_000_000 + Number(mA[1]);
  const mWeb = /^WEB-(\d+)$/i.exec(u);
  if (mWeb) return Number(mWeb[1]);
  return 0;
}

function CardRow({
  icon,
  label,
  value,
  optional,
}: {
  icon: string;
  label: string;
  value: string | undefined;
  optional?: boolean;
}) {
  const empty = !value?.trim();
  return (
    <div className="cti-row">
      <span className="cti-row-icon" aria-hidden>
        <i className={`bi ${icon}`} />
      </span>
      <div className="cti-row-body">
        <span className="cti-row-label">{label}</span>
        <span className={empty && optional ? "cti-row-value cti-row-value--muted" : "cti-row-value"}>
          {empty && optional ? "No informado" : empty ? "—" : value}
        </span>
      </div>
    </div>
  );
}

export function ClientesTiendaOnlinePage() {
  const { user, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const canView = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        await syncTiendaOnlineClientsFromUsers();
      } catch (e) {
        console.warn("syncTiendaOnlineClientsFromUsers:", e);
      }
      try {
        const r = await getClients();
        setClients((r.clients ?? []) as Client[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar clientes");
      } finally {
        setLoading(false);
      }
    })();
  }, [canView]);

  const tiendaClients = useMemo(() => {
    const list = clients.filter(isClienteTiendaOnline);
    list.sort((a, b) => tiendaClientSortKey(b.code ?? "") - tiendaClientSortKey(a.code ?? ""));
    return list;
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tiendaClients;
    return tiendaClients.filter((c) => {
      const blob = [
        c.code,
        c.name,
        c.name2,
        c.address,
        c.email,
        c.phone,
        c.phone2,
        c.city,
        c.country,
        c.documento_identidad,
        c.usuario,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [tiendaClients, search]);

  const exportExcel = useCallback(() => {
    if (filtered.length === 0) {
      showToast("No hay cuentas para exportar con el filtro actual.", "warning", "Tienda online");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Cuentas tienda");
    ws.columns = [
      { header: "Código", key: "code", width: 14 },
      { header: "Nombre", key: "name", width: 32 },
      { header: "Nombre 2", key: "name2", width: 28 },
      { header: "Correo", key: "email", width: 30 },
      { header: "Documento", key: "documento_identidad", width: 18 },
      { header: "Ciudad", key: "city", width: 20 },
      { header: "País", key: "country", width: 16 },
      { header: "Dirección", key: "address", width: 36 },
      { header: "Celular", key: "phone", width: 18 },
      { header: "Teléfono", key: "phone2", width: 18 },
      { header: "Usuario ref.", key: "usuario", width: 22 },
    ];
    filtered.forEach((c) => {
      ws.addRow({
        code: c.code ?? "",
        name: c.name ?? "",
        name2: c.name2 ?? "",
        email: c.email ?? "",
        documento_identidad: c.documento_identidad ?? "",
        city: c.city ?? "",
        country: c.country ?? "",
        address: c.address ?? "",
        phone: c.phone ?? "",
        phone2: c.phone2 ?? "",
        usuario: c.usuario ?? "",
      });
    });
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D5D46" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 24;
    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
    });
    void wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buf]), `ClientesTiendaOnline_${fecha}.xlsx`);
      showToast("Excel generado.", "success", "Tienda online");
    });
  }, [filtered]);

  if (authLoading) {
    return (
      <div className="fact-page cti-page">
        <div className="container py-5 d-flex justify-content-center">
          <div className="spinner-border text-secondary" role="status" aria-label="Espere un momento" />
        </div>
      </div>
    );
  }

  if (!user || !canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="fact-page cti-page">
      <div className="container py-3 py-md-4">
        <PageHeader title="Clientes — Tienda online" logoHref="/" />



        <div className="cti-unified-panel">
          <div className="cti-unified-panel__intro">
            <p className="cti-unified-meta">
              <i className="bi bi-people-fill" aria-hidden />
              <span>
                <strong>{tiendaClients.length}</strong> registro{tiendaClients.length === 1 ? "" : "s"}
                {search.trim() ? (
                  <>
                    {" "}
                    · <strong>{filtered.length}</strong> con el filtro actual
                  </>
                ) : null}
              </span>
            </p>
          </div>

          <div className="cti-unified-panel__divider" aria-hidden />

          <div className="cti-unified-panel__toolbar">
            <div className="cti-filter-search-block">
              <label className="cti-filter-label" htmlFor="cti-search-input">
                Buscar
              </label>
              <div className="cti-input-group-joined">
                <input
                  id="cti-search-input"
                  type="search"
                  className="cti-search-field"
                  placeholder="Buscar por código, nombre, teléfono o email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
                <button type="button" className="cti-btn-limpiar" onClick={() => setSearch("")}>
                  Limpiar
                </button>
              </div>
            </div>
            <div className="cti-filter-actions">
              <button
                type="button"
                className="cti-btn-excel"
                onClick={() => void exportExcel()}
                disabled={!canExportData || filtered.length === 0}
                title={!canExportData ? "Tu rol no incluye exportar datos." : undefined}
              >
                <span className="cti-btn-excel-icon" aria-hidden>
                  📊
                </span>
                Exportar Excel
              </button>
              <button
                type="button"
                className="cti-btn-borrar-todo"
                disabled
                title="No disponible: las cuentas de la tienda no se eliminan masivamente desde aquí. Usá Clientes o Usuarios."
              >
                <i className="bi bi-trash3" aria-hidden />
                Borrar todo
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger mb-3" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="cti-skeleton-grid" aria-hidden>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="cti-skeleton-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="cti-empty">
            <div className="cti-empty-icon" aria-hidden>
              <i className="bi bi-person-badge" />
            </div>
            <p className="fw-semibold text-secondary mb-1">
              {tiendaClients.length === 0 ? "Todavía no hay registros desde la tienda" : "Ningún resultado con ese filtro"}
            </p>
            <p className="small mb-0">
              {tiendaClients.length === 0
                ? "Cuando un visitante complete el formulario de “Crear cuenta cliente”, aparecerá acá automáticamente."
                : "Probá otra búsqueda o limpiá el filtro."}
            </p>
          </div>
        ) : (
          <div className="cti-grid">
            {filtered.map((c) => (
              <article key={c.id ?? c.code} className="cti-card">
                <div className="cti-card-head">
                  <div className="cti-avatar" aria-hidden>
                    <i className="bi bi-person-fill" />
                  </div>
                  <div className="cti-card-titles">
                    <h2 className="cti-card-name">
                      {[c.name, c.name2].filter(Boolean).join(" ").trim() || "Sin nombre"}
                    </h2>
                    <span className="cti-badge">Tienda online</span>
                    <div className="cti-code">{c.code}</div>
                  </div>
                </div>

                <div className="cti-rows">
                  <CardRow icon="bi-envelope" label="Correo" value={c.email} />
                  <CardRow icon="bi-card-heading" label="Documento de identidad" value={c.documento_identidad} />
                  <CardRow
                    icon="bi-geo-alt"
                    label="Ubicación"
                    value={[c.city, c.country].filter(Boolean).join(" · ") || undefined}
                  />
                  <CardRow icon="bi-signpost" label="Dirección" value={c.address} optional />
                  <CardRow icon="bi-phone" label="Celular" value={c.phone} />
                  <CardRow icon="bi-telephone" label="Teléfono" value={c.phone2} optional />
                  {c.usuario && c.usuario !== c.email && (
                    <CardRow icon="bi-person-badge" label="Usuario (referencia)" value={c.usuario} />
                  )}
                </div>

                <div className="cti-card-footer">
                  <Link to={`/clientes/${encodeURIComponent(c.code)}/edit`} className="cti-btn-edit">
                    <i className="bi bi-pencil-square" aria-hidden />
                    Editar
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
