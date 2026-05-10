import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canAccessFinanzaContabilidadHub, canEditContabilidadGastos } from "../lib/auth";
import { MedioPagoIcon, MedioPagoSelect } from "../components/MedioPagoSelect";
import {
  createContabilidadGasto,
  deleteContabilidadGasto,
  fetchContabilidadGastoFacturaPdfBlob,
  getContabilidadGastos,
  getProveedoresHrs,
  scanContabilidadFacturaPdf,
  updateContabilidadGasto,
  uploadContabilidadGastoFacturaPdf,
  CONTABILIDAD_MEDIOS_PAGO,
  type ContabilidadGasto,
  type ContabilidadGastoPayload,
  type ContabilidadMedioPago,
  type ContabilidadMoneda,
  type ProveedorHrs,
} from "../lib/api";
import { MonitorGastosMensualCard } from "../components/MonitorGastosMensualCard";
import "../styles/facturacion.css";
import "../styles/reportes-dashboard.css";

const MONEDA_OPTIONS: ReadonlyArray<{ value: ContabilidadMoneda; label: string }> = [
  { value: "UYU", label: "Pesos uruguayos ($)" },
  { value: "USD", label: "Dólares estadounidenses (US$)" },
  { value: "PYG", label: "Guaraníes (Gs.)" },
];

const MEDIO_PAGO_DEFAULT: ContabilidadMedioPago = CONTABILIDAD_MEDIOS_PAGO[0];

function medioPagoFromStored(raw: string): ContabilidadMedioPago {
  const t = String(raw ?? "").trim();
  return (CONTABILIDAD_MEDIOS_PAGO as readonly string[]).includes(t) ? (t as ContabilidadMedioPago) : MEDIO_PAGO_DEFAULT;
}

function montoToFormStr(moneda: ContabilidadMoneda, monto: number): string {
  if (!Number.isFinite(monto)) return "";
  return moneda === "PYG" ? String(Math.round(monto)) : String(monto);
}

function tipoCambioToFormStr(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v);
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Fecha del gasto (YYYY-MM-DD) → DD/MM/AA para la tabla. */
function formatGastoFechaTabla(isoDate: string): string {
  const t = String(isoDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t || "—";
  const [yStr, mStr, dStr] = t.split("-");
  const y = Number.parseInt(yStr, 10);
  const mo = Number.parseInt(mStr, 10);
  const day = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return t;
  const yy = String(y).slice(-2).padStart(2, "0");
  return `${String(day).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${yy}`;
}

function formatYmDisplay(ym: string): string {
  const t = String(ym || "").trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return t || "—";
  const [yearStr, moStr] = t.split("-");
  const y = Number.parseInt(yearStr, 10);
  const mo = Number.parseInt(moStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return t;
  const d = new Date(y, mo - 1, 1);
  if (Number.isNaN(d.getTime())) return t;
  const label = d.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
  if (!label) return t;
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  return cap.replace(/\s+de\s+/gi, " ");
}

function formatRegistroAt(iso: string): string {
  const t = String(iso || "").trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const fecha = d.toLocaleDateString(undefined, { day: "numeric", month: "numeric", year: "numeric" });
  const hora = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${fecha} · ${hora}`;
}

/** USD con 2 decimales (tabla, modal, franja total referencial). */
function formatUsdReferencialPreview(n: number): string {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} USD`;
  }
}

/** USD compacto solo para la tabla de gastos (evita hueco ancho entre símbolo e importe del Intl). */
function formatUsdCeldaTabla(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const num = n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `US$ ${num}`;
}

function formatMontoInline(moneda: ContabilidadMoneda, monto: number): string {
  if (!Number.isFinite(monto)) return "—";
  try {
    if (moneda === "PYG") {
      return new Intl.NumberFormat("es-PY", { style: "currency", currency: "PYG", maximumFractionDigits: 0 }).format(monto);
    }
    if (moneda === "USD") {
      return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(
        monto
      );
    }
    return new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      monto
    );
  } catch {
    return `${moneda} ${monto}`;
  }
}

export function ContabilidadGastosPage() {
  const { user, loading } = useAuth();
  const [proveedores, setProveedores] = useState<ProveedorHrs[]>([]);
  const [items, setItems] = useState<ContabilidadGasto[]>([]);
  const [fecha, setFecha] = useState(todayLocalISODate);
  const [proveedorIdStr, setProveedorIdStr] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [mesServicio, setMesServicio] = useState(currentYearMonth);
  const [presupuestoMes, setPresupuestoMes] = useState(currentYearMonth);
  const [observaciones, setObservaciones] = useState("");
  const [medioPago, setMedioPago] = useState<ContabilidadMedioPago>(MEDIO_PAGO_DEFAULT);
  const [moneda, setMoneda] = useState<ContabilidadMoneda>("UYU");
  const [montoStr, setMontoStr] = useState("");
  const [tipoCambioStr, setTipoCambioStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [detailRow, setDetailRow] = useState<ContabilidadGasto | null>(null);
  /** PDF usado en el último escaneo exitoso; se sube al servidor tras guardar el gasto. */
  const [pendingFacturaPdf, setPendingFacturaPdf] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<ContabilidadGasto | null>(null);
  const [scanPdfBusy, setScanPdfBusy] = useState(false);
  const pdfFacturaInputRef = useRef<HTMLInputElement>(null);
  const [gastosListBuscar, setGastosListBuscar] = useState("");
  const [gastosListProveedorId, setGastosListProveedorId] = useState("");
  const [gastosListPresupuestoYm, setGastosListPresupuestoYm] = useState("");
  const [gastosListPageSize, setGastosListPageSize] = useState(10);
  const [gastosListPage, setGastosListPage] = useState(1);

  const canEdit = Boolean(user && canEditContabilidadGastos(user));

  const loadProveedores = useCallback(async () => {
    try {
      const r = await getProveedoresHrs();
      setProveedores(Array.isArray(r.items) ? r.items : []);
    } catch {
      setProveedores([]);
    }
  }, []);

  const loadGastos = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await getContabilidadGastos();
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch {
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && canAccessFinanzaContabilidadHub(user)) {
      void loadProveedores();
      void loadGastos();
    }
  }, [loading, user, loadProveedores, loadGastos]);

  useEffect(() => {
    if (detailRow == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setDetailRow(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [detailRow]);

  const totalUsdPreview = useMemo(() => {
    const m = Number.parseFloat(String(montoStr).replace(",", "."));
    if (!Number.isFinite(m) || m <= 0) {
      return { kind: "empty" as const };
    }
    if (moneda === "USD") {
      return { kind: "ok" as const, usd: m, hint: "Gasto en dólares: el total en USD es el monto (sin tipo de cambio)." };
    }
    const tcTrim = tipoCambioStr.trim();
    if (tcTrim === "") {
      return { kind: "need_tc" as const };
    }
    const tc = Number.parseFloat(tcTrim.replace(",", "."));
    if (!Number.isFinite(tc) || tc <= 0) {
      return { kind: "bad_tc" as const };
    }
    const hint =
      moneda === "UYU"
        ? "Equivalente: monto en pesos ÷ tipo de cambio (pesos por USD)."
        : "Equivalente: monto en guaraníes ÷ tipo de cambio (guaraníes por USD).";
    return { kind: "ok" as const, usd: m / tc, hint };
  }, [montoStr, tipoCambioStr, moneda]);

  const proveedorRubroById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of proveedores) {
      const id = Number(p.id);
      if (!Number.isFinite(id)) continue;
      m.set(id, String(p.rubro ?? "").trim());
    }
    return m;
  }, [proveedores]);

  const gastosFiltrados = useMemo(() => {
    const q = gastosListBuscar.trim().toLowerCase();
    const pid = gastosListProveedorId.trim();
    const pym = gastosListPresupuestoYm.trim().slice(0, 7);
    return items.filter((row) => {
      if (pid) {
        const want = Number.parseInt(pid, 10);
        if (!Number.isFinite(want) || row.proveedorId !== want) return false;
      }
      if (pym && /^\d{4}-\d{2}$/.test(pym)) {
        const rowPm = String(row.presupuestoMes || "").slice(0, 7);
        if (rowPm !== pym) return false;
      }
      if (!q) return true;
      const haystack = [
        row.supplierNumber,
        row.supplierName,
        proveedorRubroById.get(Number(row.proveedorId)) ?? "",
        row.numeroFactura,
        row.descripcion,
        row.observaciones ?? "",
        row.fecha,
        formatGastoFechaTabla(row.fecha),
        String(row.id),
        row.mesServicio ?? "",
        row.presupuestoMes ?? "",
        formatYmDisplay(row.mesServicio),
        formatYmDisplay(row.presupuestoMes),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.indexOf(q) >= 0;
    });
  }, [items, gastosListBuscar, gastosListProveedorId, gastosListPresupuestoYm, proveedorRubroById]);

  const gastosListaTotalPages = Math.max(1, Math.ceil(gastosFiltrados.length / gastosListPageSize));

  const gastosPagina = useMemo(() => {
    const start = (gastosListPage - 1) * gastosListPageSize;
    return gastosFiltrados.slice(start, start + gastosListPageSize);
  }, [gastosFiltrados, gastosListPage, gastosListPageSize]);

  useEffect(() => {
    setGastosListPage(1);
  }, [gastosListBuscar, gastosListProveedorId, gastosListPresupuestoYm, gastosListPageSize]);

  useEffect(() => {
    setGastosListPage((p) => Math.min(p, gastosListaTotalPages));
  }, [gastosListaTotalPages]);

  const proveedoresOrdenadosLista = useMemo(() => {
    return [...proveedores].sort((a, b) =>
      String(a.supplierNumber || "").localeCompare(String(b.supplierNumber || ""), undefined, { numeric: true })
    );
  }, [proveedores]);

  /** Meses AAAA-MM que aparecen en `presupuestoMes` de los gastos cargados (más recientes primero). */
  const presupuestoMesOpcionesLista = useMemo(() => {
    const set = new Set<string>();
    for (const row of items) {
      const pm = String(row.presupuestoMes || "").trim().slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(pm)) set.add(pm);
    }
    return [...set].sort((a, b) => b.localeCompare(a, "en"));
  }, [items]);

  useEffect(() => {
    const v = gastosListPresupuestoYm.trim().slice(0, 7);
    if (!v) return;
    if (!presupuestoMesOpcionesLista.includes(v)) setGastosListPresupuestoYm("");
  }, [gastosListPresupuestoYm, presupuestoMesOpcionesLista]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessFinanzaContabilidadHub(user)) {
    return <Navigate to="/" replace />;
  }

  const resetFormToNew = () => {
    setDescripcion("");
    setNumeroFactura("");
    setMesServicio(currentYearMonth());
    setPresupuestoMes(currentYearMonth());
    setObservaciones("");
    setMontoStr("");
    setTipoCambioStr("");
    setProveedorIdStr("");
    setMedioPago(MEDIO_PAGO_DEFAULT);
    setMoneda("UYU");
    setFecha(todayLocalISODate());
    setPendingFacturaPdf(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetFormToNew();
    setErr("");
  };

  const startEdit = (row: ContabilidadGasto) => {
    if (!canEdit) return;
    setDetailRow(null);
    setEditingId(row.id);
    setErr("");
    setOk("");
    setFecha(row.fecha);
    setProveedorIdStr(String(row.proveedorId));
    setDescripcion(row.descripcion);
    setNumeroFactura(row.numeroFactura ?? "");
    const ms = String(row.mesServicio || "").slice(0, 7);
    const pm = String(row.presupuestoMes || "").slice(0, 7);
    setMesServicio(/^\d{4}-\d{2}$/.test(ms) ? ms : currentYearMonth());
    setPresupuestoMes(/^\d{4}-\d{2}$/.test(pm) ? pm : currentYearMonth());
    setObservaciones(row.observaciones ?? "");
    setMedioPago(medioPagoFromStored(row.medioPago));
    setMoneda(row.moneda);
    setMontoStr(montoToFormStr(row.moneda, row.montoOriginal ?? row.monto));
    setTipoCambioStr(tipoCambioToFormStr(row.tipoCambio ?? null));
    setPendingFacturaPdf(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDeleteContabilidadGasto = async () => {
    const row = deleteConfirmRow;
    if (!row || !canEdit) return;
    setErr("");
    setOk("");
    setRowBusy(row.id);
    try {
      await deleteContabilidadGasto(row.id);
      if (editingId === row.id) cancelEdit();
      if (detailRow?.id === row.id) setDetailRow(null);
      setOk("Gasto eliminado.");
      setDeleteConfirmRow(null);
      await loadGastos();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar el gasto.");
    } finally {
      setRowBusy(null);
    }
  };

  const onPdfFacturaSelected = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !canEdit) return;
    setErr("");
    setOk("");
    setScanPdfBusy(true);
    try {
      const r = await scanContabilidadFacturaPdf(file);
      setEditingId(null);
      const d = r.draft;
      if (d.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) setFecha(d.fecha);
      if (d.proveedorId != null && Number.isFinite(d.proveedorId) && d.proveedorId > 0) {
        setProveedorIdStr(String(d.proveedorId));
      }
      if (d.descripcion?.trim()) setDescripcion(d.descripcion.trim());
      if (d.numeroFactura?.trim()) setNumeroFactura(d.numeroFactura.trim().slice(0, 120));
      const ms = d.mesServicio?.slice(0, 7);
      if (ms && /^\d{4}-\d{2}$/.test(ms)) setMesServicio(ms);
      const pm = d.presupuestoMes?.slice(0, 7);
      if (pm && /^\d{4}-\d{2}$/.test(pm)) setPresupuestoMes(pm);
      if (d.moneda === "UYU" || d.moneda === "USD" || d.moneda === "PYG") {
        setMoneda(d.moneda);
        if (d.moneda === "USD") setTipoCambioStr("");
      }
      if (d.monto != null && Number.isFinite(d.monto) && d.monto > 0) {
        const m = d.moneda ?? "UYU";
        setMontoStr(montoToFormStr(m, d.monto));
      }
      if (d.observaciones?.trim()) setObservaciones(d.observaciones.trim().slice(0, 4000));
      setPendingFacturaPdf(file);
      const hint =
        r.warnings.length > 0
          ? r.warnings.join(" ")
          : "Campos sugeridos desde el archivo; revisá monto, moneda, tipo de cambio y medio de pago antes de guardar.";
      setOk(hint);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setScanPdfBusy(false);
    }
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) return;
    setErr("");
    setOk("");
    const pid = Number.parseInt(proveedorIdStr, 10);
    if (!Number.isFinite(pid) || pid < 1) {
      setErr("Elegí un proveedor del listado (Proveedores HRS).");
      return;
    }
    const desc = descripcion.trim();
    if (!desc) {
      setErr("Completá la descripción del gasto.");
      return;
    }
    const mNorm = Number.parseFloat(String(montoStr).replace(",", "."));
    if (!Number.isFinite(mNorm) || mNorm <= 0) {
      setErr("Ingresá un monto válido mayor a cero.");
      return;
    }
    const tcTrim = tipoCambioStr.trim();
    let tipoCambioPayload: number | null;
    if (moneda === "USD") {
      tipoCambioPayload = null;
    } else {
      if (tcTrim === "") {
        setErr("Para pesos o guaraníes completá el tipo de cambio (cotización respecto al dólar).");
        return;
      }
      const tc = Number.parseFloat(tcTrim.replace(",", "."));
      if (!Number.isFinite(tc) || tc <= 0) {
        setErr("Tipo de cambio inválido: usá un número mayor a cero.");
        return;
      }
      tipoCambioPayload = tc;
    }
    const fechaTrim = String(fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTrim)) {
      setErr("La fecha no es válida.");
      return;
    }
    const nf = numeroFactura.trim().slice(0, 120);
    const obs = observaciones.trim().slice(0, 4000);
    const ms = String(mesServicio || "").slice(0, 7);
    const pm = String(presupuestoMes || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ms)) {
      setErr("Elegí un mes y año válidos en «Mes servicio».");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(pm)) {
      setErr("Elegí un mes y año válidos en «Gasto asignado a presupuesto».");
      return;
    }
    const payload: ContabilidadGastoPayload = {
      fecha: fechaTrim,
      proveedorId: pid,
      descripcion: desc,
      ...(nf ? { numeroFactura: nf } : {}),
      ...(obs ? { observaciones: obs } : {}),
      mesServicio: ms,
      presupuestoMes: pm,
      medioPago,
      moneda,
      monto: mNorm,
      tipoCambio: tipoCambioPayload,
    };
    setBusy(true);
    const pdfFile = pendingFacturaPdf;
    try {
      let savedId: number;
      if (editingId != null) {
        await updateContabilidadGasto(editingId, payload);
        setOk("Gasto actualizado correctamente.");
        savedId = editingId;
        setEditingId(null);
      } else {
        const cr = await createContabilidadGasto(payload);
        setOk("Gasto registrado correctamente.");
        savedId = cr.item.id;
      }
      if (pdfFile) {
        try {
          await uploadContabilidadGastoFacturaPdf(savedId, pdfFile);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "No se pudo adjuntar el PDF.";
          setErr(`El gasto se guardó, pero el PDF no: ${msg}`);
        }
      }
      resetFormToNew();
      await loadGastos();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el gasto.");
    } finally {
      setBusy(false);
    }
  };

  const openFacturaPdf = async (row: ContabilidadGasto) => {
    if (!row.hasFacturaPdf) return;
    setErr("");
    setRowBusy(row.id);
    try {
      const blob = await fetchContabilidadGastoFacturaPdfBlob(row.id);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) setErr("Habilitá las ventanas emergentes para ver el PDF.");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo abrir el PDF.");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Contabilidad — Gastos de empresa" backTo="/gestion-financiera" backText="Volver a Gestión Financiera" />

        <div className="hrs-card hrs-card--rect p-4 mb-4">
          <div className="clientes-filtros-outer">
            <div className="clientes-filtros-container contabilidad-gastos-filtros-container">
              <div className="card clientes-filtros-card">
                <p className="small mb-3 text-white">
                  Registro de gastos corporativos. El importe queda grabado en <strong>USD</strong>; la moneda de la operación y el tipo de cambio se conservan y se
                  muestran en la información del comprobante (no en la tabla del listado).
                </p>

                {canEdit && proveedores.length === 0 ? (
                  <div className="alert alert-warning small py-2 border-0 mb-3">
                    No hay proveedores cargados todavía. Primero cargá proveedores en{" "}
                    <Link to="/gestion-financiera/proveedores">Proveedores HRS</Link>.
                  </div>
                ) : null}

                {canEdit && proveedores.length > 0 ? (
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <input
                      ref={pdfFacturaInputRef}
                      type="file"
                      className="d-none"
                      accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/gif,.gif"
                      onChange={onPdfFacturaSelected}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm d-inline-flex align-items-center gap-2 contabilidad-gastos-scan-pdf-btn"
                      disabled={busy || scanPdfBusy}
                      onClick={() => pdfFacturaInputRef.current?.click()}
                    >
                      {scanPdfBusy ? (
                        <>
                          <span className="spinner-border spinner-border-sm text-light" role="status" aria-hidden />
                          <span>Leyendo archivo…</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-file-earmark-arrow-up contabilidad-gastos-scan-pdf-ico" aria-hidden />
                          <span>Completar desde PDF o imagen</span>
                        </>
                      )}
                    </button>
                    <span className="small text-white-50 mb-0">
                      PDF con texto seleccionable, o foto/escaneo en JPEG, PNG, WEBP o GIF (se usa reconocimiento de texto OCR). Revisá siempre
                      montos y datos antes de guardar.
                    </span>
                  </div>
                ) : null}

                {canEdit && editingId != null ? (
                  <div className="alert alert-light py-2 small mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2 border-0 shadow-sm">
                    <span className="text-dark">
                      Editando gasto <strong className="font-monospace">{editingId}</strong> · podés cambiar cualquier campo y guardar.
                    </span>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={cancelEdit}>
                      Cancelar edición
                    </button>
                  </div>
                ) : null}

                {canEdit ? (
                  <form onSubmit={onSubmit} className="row g-3">
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Fecha</label>
                      <input
                        type="date"
                        className="form-control"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Nº proveedor (listado Proveedores HRS)</label>
                      <select
                        className="form-select"
                        value={proveedorIdStr}
                        onChange={(e) => setProveedorIdStr(e.target.value)}
                        required
                      >
                        <option value="">— Seleccionar —</option>
                        {proveedores.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.supplierNumber} — {p.supplierName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Nº de factura</label>
                      <input
                        type="text"
                        className="form-control"
                        value={numeroFactura}
                        onChange={(e) => setNumeroFactura(e.target.value)}
                        placeholder="Ej. A-0123"
                        maxLength={120}
                        autoComplete="off"
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Mes servicio</label>
                      <input type="month" className="form-control" value={mesServicio} onChange={(e) => setMesServicio(e.target.value)} required />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Gasto asignado a presupuesto</label>
                      <input
                        type="month"
                        className="form-control"
                        value={presupuestoMes}
                        onChange={(e) => setPresupuestoMes(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label" htmlFor="contabilidad-medio-pago-btn">
                        Medio de pago
                      </label>
                      <MedioPagoSelect
                        buttonId="contabilidad-medio-pago-btn"
                        value={medioPago}
                        onChange={setMedioPago}
                        disabled={busy || scanPdfBusy}
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Moneda</label>
                      <select
                        className="form-select"
                        value={moneda}
                        onChange={(e) => {
                          const v = e.target.value as ContabilidadMoneda;
                          setMoneda(v);
                          if (v === "USD") setTipoCambioStr("");
                        }}
                      >
                        {MONEDA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Monto</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="form-control"
                        value={montoStr}
                        onChange={(e) => setMontoStr(e.target.value)}
                        placeholder={moneda === "PYG" ? "Ej. 1500000" : "Ej. 1250.50"}
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <label className="form-label">Tipo de cambio</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="form-control"
                        value={tipoCambioStr}
                        onChange={(e) => setTipoCambioStr(e.target.value)}
                        placeholder={moneda === "USD" ? "No aplica" : "Ej. 40,25"}
                        disabled={moneda === "USD" || busy}
                        aria-describedby="contabilidad-tipo-cambio-hint"
                      />
                      <span id="contabilidad-tipo-cambio-hint" className="form-text text-white-50 small">
                        {moneda === "USD"
                          ? "Gasto en dólares: no se usa tipo de cambio."
                          : "Cotización manual (pesos o guaraníes por USD). Obligatoria para UYU o PYG."}
                      </span>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Descripción del gasto</label>
                      <textarea
                        className="form-control contabilidad-gastos-textarea-pair"
                        rows={4}
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="Ej. Honorarios marzo, reposición equipos, servicios externos…"
                        maxLength={4000}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Observaciones</label>
                      <textarea
                        className="form-control contabilidad-gastos-textarea-pair"
                        rows={4}
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                        placeholder="Notas internas, plazos, referencias extra…"
                        maxLength={4000}
                      />
                    </div>
                    <div className="col-12">
                      <div className="d-flex justify-content-end">
                        <div className="contabilidad-gastos-total-usd-inner">
                          <div className="fact-total-box fact-total-final contabilidad-gastos-total-usd d-flex flex-wrap justify-content-between align-items-baseline gap-2">
                            <span className="fact-total-label mb-0">Total (USD)</span>
                            <span className="fact-total-value font-monospace text-end">
                              {totalUsdPreview.kind === "ok" ? formatUsdReferencialPreview(totalUsdPreview.usd) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {totalUsdPreview.kind === "empty" ? (
                        <p className="small text-white-50 mb-0 mt-2 text-end">Ingresá un monto para ver el equivalente en USD.</p>
                      ) : null}
                      {totalUsdPreview.kind === "need_tc" ? (
                        <p className="small text-warning mb-0 mt-2 text-end">
                          Completá el tipo de cambio para calcular el equivalente en USD (pesos o guaraníes por dólar).
                        </p>
                      ) : null}
                      {totalUsdPreview.kind === "bad_tc" ? (
                        <p className="small text-warning mb-0 mt-2 text-end">Tipo de cambio inválido: usá un número mayor a cero.</p>
                      ) : null}
                      {totalUsdPreview.kind === "ok" ? (
                        <p className="small text-white-50 mb-0 mt-2 text-end">{totalUsdPreview.hint}</p>
                      ) : null}
                    </div>
                    <div className="col-12 d-flex justify-content-end">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={busy || scanPdfBusy || proveedores.length === 0}
                      >
                        {busy ? "Guardando…" : editingId != null ? "Guardar cambios" : "Registrar gasto"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="small mb-0 text-white">Solo lectura: no podés registrar gastos con tu rol actual.</p>
                )}

                {err ? <div className="alert alert-danger mt-3 mb-0 py-2">{err}</div> : null}
                {ok ? <div className="alert alert-success mt-3 mb-0 py-2">{ok}</div> : null}
              </div>
            </div>
          </div>
        </div>

        {!listLoading ? (
          <div className="contabilidad-gastos-dash-section mb-4">
            <h2 className="contabilidad-gastos-dash-section__title h6 mb-3">Dashboard — gastos por mes de presupuesto (USD)</h2>
            <MonitorGastosMensualCard items={items} />
          </div>
        ) : null}

        <div className="hrs-card p-4">
          <h2 className="h6 mb-3">Gastos registrados</h2>
          {listLoading ? (
            <p className="text-muted small mb-0">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">Todavía no hay gastos cargados.</p>
          ) : (
            <>
              <div className="contabilidad-gastos-lista-filtros row g-2 gx-3 gy-2 align-items-end mb-3">
                <div className="col-12 col-lg-4">
                  <label className="form-label small text-muted mb-1" htmlFor="contabilidad-gastos-buscar">
                    Buscar
                  </label>
                  <input
                    id="contabilidad-gastos-buscar"
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Proveedor, factura, descripción, fecha…"
                    value={gastosListBuscar}
                    onChange={(e) => setGastosListBuscar(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="col-12 col-sm-6 col-lg-3">
                  <label className="form-label small text-muted mb-1" htmlFor="contabilidad-gastos-prov">
                    Proveedor
                  </label>
                  <select
                    id="contabilidad-gastos-prov"
                    className="form-select form-select-sm"
                    value={gastosListProveedorId}
                    onChange={(e) => setGastosListProveedorId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {proveedoresOrdenadosLista.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.supplierNumber} — {p.supplierName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-6 col-lg-3">
                  <label className="form-label small text-muted mb-1" htmlFor="contabilidad-gastos-presup">
                    Mes de presupuesto
                  </label>
                  <select
                    id="contabilidad-gastos-presup"
                    className="form-select form-select-sm"
                    value={gastosListPresupuestoYm}
                    onChange={(e) => setGastosListPresupuestoYm(e.target.value)}
                    aria-label="Filtrar por mes asignado a presupuesto"
                  >
                    <option value="">Todos los meses</option>
                    {presupuestoMesOpcionesLista.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatYmDisplay(ym)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-6 col-lg-2 d-flex align-items-end">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm w-100 text-nowrap"
                    onClick={() => {
                      setGastosListBuscar("");
                      setGastosListProveedorId("");
                      setGastosListPresupuestoYm("");
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </div>
              {gastosFiltrados.length === 0 ? (
                <p className="text-muted small mb-0">Ningún gasto coincide con los filtros.</p>
              ) : (
                <>
                  <p className="text-muted small mb-2 mb-md-3">
                    Mostrando{" "}
                    <span className="font-monospace">
                      {(gastosListPage - 1) * gastosListPageSize + 1}–{Math.min(gastosListPage * gastosListPageSize, gastosFiltrados.length)}
                    </span>{" "}
                    de <span className="font-monospace">{gastosFiltrados.length}</span>
                    {gastosFiltrados.length !== items.length ? (
                      <span className="ms-1">(sobre {items.length} cargados)</span>
                    ) : null}
                  </p>
                  <div className="table-responsive contabilidad-gastos-tabla-wrap">
                    <table className="table table-sm table-striped align-middle mb-0 contabilidad-gastos-tabla">
                      <thead>
                        <tr>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-fecha" scope="col" title="Fecha del gasto (contable)">
                            Fecha
                          </th>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-nprov" scope="col" title="Número de proveedor (Proveedores HRS, ej. P002)">
                            Nº prov.
                          </th>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-nombre" scope="col" title="Nombre del proveedor">
                            Proveedor
                          </th>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-rubro" scope="col" title="Rubro del proveedor">
                            Rubro
                          </th>
                          <th
                            className="contabilidad-gastos-th contabilidad-gastos-col-factura text-start"
                            scope="col"
                            title="Número de factura (CFE) o nº de transferencia / comprobante (ej. BROU)"
                          >
                            Nº factura
                          </th>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-mes-svc" scope="col">
                            Mes servicio
                          </th>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-presup" scope="col">
                            Presupuesto
                          </th>
                          <th className="contabilidad-gastos-th contabilidad-gastos-col-monto text-end text-nowrap" scope="col">
                            Monto (USD)
                          </th>
                          <th
                            className="contabilidad-gastos-th contabilidad-gastos-col-acciones text-center text-nowrap contabilidad-gastos-th-acciones"
                            scope="col"
                          >
                            ACCIONES
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastosPagina.map((row) => {
                    const rubroLabel = proveedorRubroById.get(Number(row.proveedorId)) || "—";
                    return (
                    <tr key={row.id} className={editingId === row.id ? "table-active" : undefined}>
                      <td className="contabilidad-gastos-col-fecha text-nowrap small" title={row.fecha || undefined}>
                        {formatGastoFechaTabla(row.fecha)}
                      </td>
                      <td className="contabilidad-gastos-col-nprov text-nowrap">
                        <code>{row.supplierNumber}</code>
                      </td>
                      <td className="contabilidad-gastos-td-wrap contabilidad-gastos-col-nombre">{row.supplierName}</td>
                      <td
                        className="contabilidad-gastos-td-wrap contabilidad-gastos-col-rubro"
                        title={rubroLabel !== "—" ? rubroLabel : undefined}
                      >
                        {rubroLabel}
                      </td>
                      <td
                        className="contabilidad-gastos-col-factura contabilidad-gastos-col-factura-td text-start"
                        title={row.numeroFactura || undefined}
                      >
                        {row.numeroFactura || "—"}
                      </td>
                      <td className="contabilidad-gastos-col-mes-svc contabilidad-gastos-col-mes-td small" title={row.mesServicio || undefined}>
                        {formatYmDisplay(row.mesServicio)}
                      </td>
                      <td className="contabilidad-gastos-col-presup contabilidad-gastos-col-mes-td small" title={row.presupuestoMes || undefined}>
                        {formatYmDisplay(row.presupuestoMes)}
                      </td>
                      <td className="contabilidad-gastos-col-monto contabilidad-gastos-col-monto-td text-end text-nowrap font-monospace">
                        {formatUsdCeldaTabla(row.monto)}
                      </td>
                      <td className="contabilidad-gastos-col-acciones contabilidad-gastos-td-acciones text-center align-middle py-1 text-nowrap">
                        <div className="contabilidad-gastos-acciones-group">
                          {canEdit ? (
                            <button
                              type="button"
                              className="contabilidad-gastos-action-btn contabilidad-gastos-action-btn--edit"
                              aria-label={`Editar gasto ${row.fecha}`}
                              title="Editar"
                              disabled={busy || rowBusy === row.id}
                              onClick={() => startEdit(row)}
                            >
                              <i className="bi bi-pencil-fill contabilidad-gastos-action-ico" aria-hidden />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="contabilidad-gastos-action-btn contabilidad-gastos-action-btn--info"
                            title="Ver comprobante completo"
                            aria-label={`Información — gasto ${row.fecha}`}
                            disabled={busy || rowBusy === row.id}
                            onClick={() => setDetailRow(row)}
                          >
                            <span className="contabilidad-gastos-action-info-i" aria-hidden>
                              i
                            </span>
                          </button>
                          {canEdit ? (
                            <button
                              type="button"
                              className="contabilidad-gastos-action-btn contabilidad-gastos-action-btn--del"
                              aria-label={`Eliminar gasto ${row.fecha}`}
                              title="Eliminar"
                              disabled={busy || rowBusy === row.id}
                              onClick={() => setDeleteConfirmRow(row)}
                            >
                              <i
                                className={`bi contabilidad-gastos-action-ico ${rowBusy === row.id ? "bi-hourglass-split" : "bi-trash-fill"}`}
                                aria-hidden
                              />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`contabilidad-gastos-action-btn contabilidad-gastos-action-btn--doc${
                              row.hasFacturaPdf ? "" : " contabilidad-gastos-action-btn--doc-missing"
                            }`}
                            title={row.hasFacturaPdf ? "Ver factura (PDF)" : "No hay PDF adjunto a este gasto"}
                            aria-label={
                              row.hasFacturaPdf
                                ? `Ver factura PDF — gasto ${row.fecha}`
                                : `Factura PDF no disponible — gasto ${row.fecha}`
                            }
                            disabled={busy || rowBusy === row.id || !row.hasFacturaPdf}
                            onClick={() => void openFacturaPdf(row)}
                          >
                            <i className="bi bi-file-earmark-fill contabilidad-gastos-action-ico" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                      </tbody>
                    </table>
                  </div>
                  <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 pt-3 mt-2 border-top contabilidad-gastos-lista-paginacion">
                    <div className="d-flex flex-wrap align-items-end gap-2">
                      <div className="contabilidad-gastos-pagesize-foot">
                        <label className="form-label small text-muted mb-1" htmlFor="contabilidad-gastos-pagesize">
                          Por página
                        </label>
                        <select
                          id="contabilidad-gastos-pagesize"
                          className="form-select form-select-sm"
                          value={String(gastosListPageSize)}
                          onChange={(e) => setGastosListPageSize(Number.parseInt(e.target.value, 10) || 10)}
                          aria-label="Cantidad de filas por página"
                        >
                          <option value="10">10</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                        </select>
                      </div>
                      <div className="btn-group btn-group-sm" role="group" aria-label="Paginación gastos">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={gastosListPage <= 1}
                          onClick={() => setGastosListPage((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={gastosListPage >= gastosListaTotalPages}
                          onClick={() => setGastosListPage((p) => Math.min(gastosListaTotalPages, p + 1))}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                    <span className="text-muted small mb-1">
                      Página <span className="font-monospace">{gastosListPage}</span> de{" "}
                      <span className="font-monospace">{gastosListaTotalPages}</span>
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {detailRow != null ? (
        <>
          <div
            role="presentation"
            className="modal-backdrop fade show contabilidad-gasto-modal-backdrop"
            onClick={() => setDetailRow(null)}
          />
          <div
            className="modal fade show d-block contabilidad-gasto-modal-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contabilidad-gasto-modal-title"
          >
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
              <div className="modal-content shadow">
                <div className="modal-header">
                  <h2 id="contabilidad-gasto-modal-title" className="modal-title h5 mb-0">
                    Comprobante de gasto
                  </h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setDetailRow(null)} />
                </div>
                <div className="modal-body">
                  <p className="text-muted small mb-3 mb-md-4">
                    Gasto registrado (<span className="font-monospace">id {detailRow.id}</span>) — vista completa.
                  </p>
                  <dl className="row contabilidad-gasto-modal-dl mb-0 small">
                    <dt className="col-sm-5 col-lg-4">Fecha del gasto</dt>
                    <dd className="col-sm-7 col-lg-8">{detailRow.fecha}</dd>

                    <dt className="col-sm-5 col-lg-4">Id proveedor (sistema)</dt>
                    <dd className="col-sm-7 col-lg-8 font-monospace">{detailRow.proveedorId}</dd>

                    <dt className="col-sm-5 col-lg-4">Nº proveedor</dt>
                    <dd className="col-sm-7 col-lg-8">
                      <code>{detailRow.supplierNumber}</code>
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Nombre proveedor</dt>
                    <dd className="col-sm-7 col-lg-8">{detailRow.supplierName}</dd>

                    <dt
                      className="col-sm-5 col-lg-4"
                      id="contabilidad-gasto-anchor-factura"
                      title="Puede ser nº de factura (CFE) o nº de operación de transferencia (ej. comprobante BROU)"
                    >
                      Nº factura o transferencia
                    </dt>
                    <dd className="col-sm-7 col-lg-8">{detailRow.numeroFactura?.trim() ? detailRow.numeroFactura : "—"}</dd>

                    <dt className="col-sm-5 col-lg-4">Mes servicio</dt>
                    <dd className="col-sm-7 col-lg-8">
                      {formatYmDisplay(detailRow.mesServicio)}{" "}
                      {detailRow.mesServicio?.trim() ? (
                        <span className="text-muted">({detailRow.mesServicio.trim()})</span>
                      ) : null}
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Gasto presupuesto (mes/año)</dt>
                    <dd className="col-sm-7 col-lg-8">
                      {formatYmDisplay(detailRow.presupuestoMes)}{" "}
                      {detailRow.presupuestoMes?.trim() ? (
                        <span className="text-muted">({detailRow.presupuestoMes.trim()})</span>
                      ) : null}
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Descripción</dt>
                    <dd className="col-sm-7 col-lg-8 text-break">{detailRow.descripcion}</dd>

                    <dt className="col-sm-5 col-lg-4">Observaciones</dt>
                    <dd className="col-sm-7 col-lg-8 text-break">{detailRow.observaciones?.trim() ? detailRow.observaciones : "—"}</dd>

                    <dt className="col-sm-5 col-lg-4">Importe registrado (USD)</dt>
                    <dd className="col-sm-7 col-lg-8 font-monospace">{formatUsdReferencialPreview(detailRow.monto)}</dd>

                    <dt className="col-sm-5 col-lg-4 pt-3">Información de la operación</dt>
                    <dd className="col-sm-7 col-lg-8 pt-md-3 text-muted small">
                      Moneda, importe original y tipo de cambio tal como se cargaron en el formulario.
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Moneda de la operación</dt>
                    <dd className="col-sm-7 col-lg-8">{MONEDA_OPTIONS.find((m) => m.value === detailRow.moneda)?.label ?? detailRow.moneda}</dd>

                    <dt className="col-sm-5 col-lg-4">Monto en moneda original</dt>
                    <dd className="col-sm-7 col-lg-8 font-monospace">
                      {formatMontoInline(detailRow.moneda, detailRow.montoOriginal ?? detailRow.monto)}
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Tipo de cambio</dt>
                    <dd className="col-sm-7 col-lg-8 font-monospace">
                      {detailRow.tipoCambio != null && Number.isFinite(detailRow.tipoCambio) ? (
                        <>
                          {new Intl.NumberFormat("es-UY", { maximumFractionDigits: 6 }).format(detailRow.tipoCambio)}
                          <span className="text-muted small ms-1">(manual; pesos o guaraníes por USD)</span>
                        </>
                      ) : detailRow.moneda === "USD" ? (
                        <span className="text-muted">No aplica (gasto en dólares)</span>
                      ) : (
                        "—"
                      )}
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Medio de pago</dt>
                    <dd className="col-sm-7 col-lg-8">
                      {detailRow.medioPago?.trim() ? (
                        <span className="contabilidad-gastos-medio-inner">
                          <MedioPagoIcon code={detailRow.medioPago} />
                          <span>{detailRow.medioPago}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </dd>

                    <dt className="col-sm-5 col-lg-4">Fecha registro sistema</dt>
                    <dd className="col-sm-7 col-lg-8">{formatRegistroAt(detailRow.createdAt)}</dd>
                  </dl>
                </div>
                <div className="modal-footer">
                  {detailRow.hasFacturaPdf ? (
                    <button
                      type="button"
                      className="btn btn-outline-success me-auto"
                      disabled={rowBusy === detailRow.id}
                      onClick={() => void openFacturaPdf(detailRow)}
                    >
                      Abrir PDF
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-primary" onClick={() => setDetailRow(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <ConfirmModal
        open={deleteConfirmRow !== null}
        elevated
        variant="delete"
        title="Eliminar gasto"
        message={
          deleteConfirmRow ? (
            <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>
              ¿Eliminar el gasto del <strong>{deleteConfirmRow.fecha}</strong> (
              <strong>{deleteConfirmRow.supplierNumber}</strong> —{" "}
              <strong>
                {formatMontoInline(deleteConfirmRow.moneda, deleteConfirmRow.montoOriginal ?? deleteConfirmRow.monto)}
              </strong>
              )?
            </p>
          ) : null
        }
        warningText="Esta acción no se puede deshacer."
        cancelLabel="Cancelar"
        confirmLabel="Eliminar"
        confirmPending={deleteConfirmRow != null && rowBusy === deleteConfirmRow.id}
        confirmPendingLabel="Eliminando…"
        onCancel={() => {
          if (deleteConfirmRow != null && rowBusy === deleteConfirmRow.id) return;
          setDeleteConfirmRow(null);
        }}
        onConfirm={() => void confirmDeleteContabilidadGasto()}
      />
    </div>
  );
}
