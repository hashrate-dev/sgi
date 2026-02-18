import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addGarantiaEmitted,
  getGarantiasEmitted,
  getGarantiasItems,
  getNextGarantiaNumber,
  getClients,
  getSetups,
  getEquipos,
  wakeUpBackend,
  type GarantiasEmittedResponse,
  type GarantiasItemsResponse,
  type ClientsResponse,
} from "../lib/api";
import { formatAmount, formatUSD } from "../lib/formatCurrency.js";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import type { Client, EquipoASIC, Invoice, ItemGarantiaAnde, LineItem, Setup } from "../lib/types";
import { ConfirmModal } from "../components/ConfirmModal";
import { PageHeader } from "../components/PageHeader";
import { InvoicePreview } from "../components/InvoicePreview";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditFacturacion } from "../lib/auth";
import "../styles/facturacion.css";

function todayLocale() {
  return new Date().toLocaleDateString();
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Recibo: R + 4 dígitos desde R0100. Recibo Devolución: RD + 4 dígitos desde RD0200. */
const GARANTIA_NUM_CONFIG: Record<string, { prefix: string; digits: number; startNum: number }> = {
  Recibo: { prefix: "R", digits: 4, startNum: 100 },
  "Recibo Devolución": { prefix: "RD", digits: 4, startNum: 200 }
};

function nextValeNumber(emitted: { invoice: Invoice }[], tipo: "Recibo" | "Recibo Devolución"): string {
  const { prefix, digits, startNum } = GARANTIA_NUM_CONFIG[tipo] ?? { prefix: "R", digits: 4, startNum: 100 };
  const formatRegex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{1,${digits}})$`, "i");
  const filtered = emitted.filter((e) => formatRegex.test(e.invoice.number));
  const next =
    filtered.length === 0
      ? startNum
      : Math.max(
          startNum - 1,
          ...filtered.map((e) => {
            const m = e.invoice.number.match(formatRegex);
            const n = m ? Number(m[1]) : 0;
            return Number.isFinite(n) ? n : 0;
          })
        ) + 1;
  return `${prefix}${String(next).padStart(digits, "0")}`;
}

function calcTotals(items: LineItem[]) {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const discounts = items.reduce((s, it) => s + it.discount * it.quantity, 0);
  const total = subtotal - discounts;
  return { subtotal, discounts, total };
}

const MS_5_DAYS = 5 * 24 * 60 * 60 * 1000;

export function GarantiaAndePage() {
  const { user } = useAuth();
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [equiposAsic, setEquiposAsic] = useState<EquipoASIC[]>([]);
  const [setups, setSetups] = useState<Setup[]>([]);
  const [itemsGarantia, setItemsGarantia] = useState<ItemGarantiaAnde[]>([]);
  const [emittedVales, setEmittedVales] = useState<{ invoice: Invoice; emittedAt: string }[]>([]);
  const [showConfirmPdf, setShowConfirmPdf] = useState(false);
  type GarantiaTipo = "Recibo" | "Recibo Devolución";
  const [tipoGarantia, setTipoGarantia] = useState<GarantiaTipo>("Recibo");
  /** Recibo a cancelar con este Recibo Devolución (solo cuando tipoGarantia === "Recibo Devolución"). */
  const [relatedReciboId, setRelatedReciboId] = useState<string>("");
  const [itemsLocked, setItemsLocked] = useState(false);
  /** Documento emitido a mostrar en la Vista previa (al hacer clic en el botón ojo). */
  const [previewEmitted, setPreviewEmitted] = useState<{ invoice: Invoice; emittedAt: string } | null>(null);
  /** Número de vista previa desde el servidor (evita duplicados); fallback a nextValeNumber si falla la API */
  const [nextNumFromApi, setNextNumFromApi] = useState<string | null>(null);

  const emittedInLast5Days = useMemo(() => {
    const now = Date.now();
    return emittedVales.filter((item) => now - new Date(item.emittedAt).getTime() < MS_5_DAYS);
  }, [emittedVales]);

  const number = useMemo(
    () => (nextNumFromApi !== null && nextNumFromApi !== "" ? nextNumFromApi : nextValeNumber(emittedVales, tipoGarantia)),
    [nextNumFromApi, emittedVales, tipoGarantia]
  );
  const totals = useMemo(() => calcTotals(items), [items]);
  const selectedClient = useMemo(
    () => (selectedClientId ? clients.find((c) => String(c.id ?? "") === String(selectedClientId)) ?? null : null),
    [clients, selectedClientId]
  );
  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => `${c.code} - ${c.name}`.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [clients, clientQuery]);

  /** Lista para el select: incluye siempre el cliente seleccionado aunque no coincida con el filtro */
  const clientsForSelect = useMemo(() => {
    if (!selectedClientId) return visibleClients;
    const sel = clients.find((c) => String(c.id ?? "") === String(selectedClientId));
    if (!sel) return visibleClients;
    if (visibleClients.some((c) => String(c.id ?? "") === String(selectedClientId))) return visibleClients;
    return [sel, ...visibleClients];
  }, [clients, visibleClients, selectedClientId]);

  /** Recibos del cliente que aún no tienen un Recibo Devolución que los cancele (solo para tipo "Recibo Devolución"). */
  const recibosDisponiblesParaDevolucion = useMemo(() => {
    if (!selectedClient || tipoGarantia !== "Recibo Devolución") return [];
    const recibosDelCliente = emittedVales.filter(
      (item) => item.invoice.type === "Recibo" && item.invoice.clientName === selectedClient.name
    );
    const numerosYaCancelados = new Set(
      emittedVales
        .filter((item) => item.invoice.type === "Recibo Devolución" && item.invoice.relatedInvoiceNumber)
        .map((item) => item.invoice.relatedInvoiceNumber)
    );
    return recibosDelCliente.filter((item) => !numerosYaCancelados.has(item.invoice.number));
  }, [emittedVales, selectedClient, tipoGarantia]);

  /** Al cambiar tipo, limpiar recibo relacionado y (si se sale de Recibo Devolución) ítems. */
  useEffect(() => {
    if (tipoGarantia !== "Recibo Devolución") {
      setRelatedReciboId("");
      setItemsLocked(false);
      setItems([]);
    }
  }, [tipoGarantia]);

  useEffect(() => {
    setRelatedReciboId("");
    setItems([]);
    setItemsLocked(false);
  }, [selectedClientId]);

  /** Cargar ítems del recibo seleccionado cuando se elige un Recibo a devolver. */
  useEffect(() => {
    if (tipoGarantia !== "Recibo Devolución" || !relatedReciboId || !selectedClient) {
      return;
    }
    const item = emittedVales.find(
      (e) => (e.invoice.id && e.invoice.id === relatedReciboId) || e.invoice.number === relatedReciboId
    );
    if (!item || !item.invoice.items || item.invoice.items.length === 0) return;
    const loadedItems: LineItem[] = item.invoice.items.map((it) => ({
      ...it,
      quantity: it.quantity ?? 1,
      price: it.price ?? 0,
      discount: it.discount ?? 0
    }));
    setItems(loadedItems);
    setItemsLocked(true);
  }, [relatedReciboId, tipoGarantia, selectedClient, emittedVales]);

  useEffect(() => {
    wakeUpBackend()
      .then(() => Promise.all([getEquipos(), getSetups()]))
      .then(([equiposRes, setupsRes]) => {
        setEquiposAsic(equiposRes.items ?? []);
        setSetups(setupsRes.items ?? []);
      })
      .catch(() => {
        setEquiposAsic([]);
        setSetups([]);
      });
  }, []);

  useEffect(() => {
    getGarantiasEmitted()
      .then((r: GarantiasEmittedResponse) => setEmittedVales(r.items as { invoice: Invoice; emittedAt: string }[]))
      .catch(() => setEmittedVales([]));
  }, []);

  /** Vista previa: pedir siguiente número sin consumir (peek) */
  useEffect(() => {
    getNextGarantiaNumber(tipoGarantia, { peek: true })
      .then((r) => setNextNumFromApi(r.number))
      .catch(() => setNextNumFromApi(""));
  }, [tipoGarantia]);

  useEffect(() => {
    getGarantiasItems()
      .then((r: GarantiasItemsResponse) => setItemsGarantia(r.items))
      .catch(() => setItemsGarantia([]));
  }, []);

  useEffect(() => {
    getClients()
      .then((r: ClientsResponse) => setClients((r.clients ?? []) as Client[]))
      .catch(() => setClients([]));
  }, []);

  /** Limpiar vista previa de documento emitido cuando el usuario edita el formulario. */
  useEffect(() => {
    setPreviewEmitted(null);
  }, [tipoGarantia, selectedClientId, items]);

  function viewEmittedInPreview(item: { invoice: Invoice; emittedAt: string }) {
    setPreviewEmitted(item);
  }

  function addItem() {
    if (itemsGarantia.length > 0) {
      const g = itemsGarantia[0];
      setItems((prev) => [
        ...prev,
        {
          garantiaId: g.id,
          garantiaCodigo: g.codigo,
          garantiaMarca: g.marca,
          garantiaModelo: g.modelo,
          month: "",
          quantity: 1,
          price: 0,
          discount: 0
        }
      ]);
    } else {
      setItems((prev) => [
        ...prev,
        { month: "", quantity: 1, price: 0, discount: 0 }
      ]);
    }
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function generatePdfAndSave() {
    if (!selectedClient) {
      showToast("Debe seleccionar un cliente válido.", "error");
      return;
    }
    if (tipoGarantia === "Recibo Devolución" && !relatedReciboId) {
      showToast("Debe seleccionar un Recibo a devolver (cancelar) para el Recibo Devolución.", "error");
      return;
    }
    if (items.length === 0) {
      showToast("El recibo no tiene ítems cargados.", "error");
      return;
    }
    if (totals.total === 0) {
      showToast("Hay que llenar los campos para emitir el documento. El total no puede ser cero.", "error");
      return;
    }
    if (items.some((it) => {
      const tieneEquipo = it.equipoId && it.marcaEquipo && it.modeloEquipo && it.procesadorEquipo;
      const tieneSetup = it.setupId && it.setupNombre;
      const tieneGarantia = it.garantiaId && it.garantiaCodigo;
      return !tieneEquipo && !tieneSetup && !tieneGarantia;
    })) {
      showToast("Todos los ítems deben tener una garantía, equipo ASIC o Setup seleccionado.", "error");
      return;
    }
    setShowConfirmPdf(true);
  }

  async function executePdfAndSave(savePdf: boolean) {
    if (!selectedClient) return;
    if (savePdf) showToast("Generando recibo PDF...", "info");

    const { subtotal, discounts, total } = calcTotals(items);
    const dateNow = new Date();
    const dateStr = todayLocale();
    const emissionTime = getCurrentTime();
    const month = items[0]?.month || "";

    let logoBase64: string | undefined;
    try {
      logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
    } catch {
      //
    }

    const doc = generateFacturaPdf(
      {
        number,
        type: tipoGarantia,
        clientName: selectedClient.name,
        clientPhone: selectedClient.phone,
        clientEmail: selectedClient.email,
        clientAddress: selectedClient.address,
        clientCity: selectedClient.city,
        clientName2: selectedClient.name2,
        clientPhone2: selectedClient.phone2,
        clientEmail2: selectedClient.email2,
        clientAddress2: selectedClient.address2,
        clientCity2: selectedClient.city2,
        date: dateNow,
        items,
        subtotal,
        discounts,
        total,
        dueDateDays: 7
      },
      { logoBase64 }
    );
    const safeName = selectedClient.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
    if (savePdf) {
      doc.save(`${number}_${safeName}.pdf`);
    }
    showToast(savePdf ? `${tipoGarantia} generado y guardado correctamente.` : `${tipoGarantia} emitido correctamente.`, "success");

    const relatedRecibo = relatedReciboId
      ? emittedVales.find(
          (e) => (e.invoice.id && e.invoice.id === relatedReciboId) || e.invoice.number === relatedReciboId
        )?.invoice
      : null;
    const isReciboDevolucion = tipoGarantia === "Recibo Devolución";
    const finalSubtotal = isReciboDevolucion ? -Math.abs(subtotal) : subtotal;
    const finalDiscounts = isReciboDevolucion ? -Math.abs(discounts) : discounts;
    const finalTotal = isReciboDevolucion ? -Math.abs(total) : total;

    const inv: Invoice = {
      id: genId(),
      number,
      type: tipoGarantia,
      clientName: selectedClient.name,
      clientPhone: selectedClient.phone,
      clientEmail: selectedClient.email,
      clientAddress: selectedClient.address,
      clientCity: selectedClient.city,
      clientName2: selectedClient.name2,
      clientPhone2: selectedClient.phone2,
      clientEmail2: selectedClient.email2,
      clientAddress2: selectedClient.address2,
      clientCity2: selectedClient.city2,
      date: dateStr,
      emissionTime,
      month,
      subtotal: finalSubtotal,
      discounts: finalDiscounts,
      total: finalTotal,
      items,
      ...(relatedRecibo && {
        relatedInvoiceId: relatedRecibo.id,
        relatedInvoiceNumber: relatedRecibo.number
      })
    };
    const emittedAt = new Date().toISOString();
    try {
      const res = await addGarantiaEmitted(inv, emittedAt);
      const assignedNumber = res.number ?? inv.number;
      const emittedRes = await getGarantiasEmitted();
      setEmittedVales(emittedRes.items as { invoice: Invoice; emittedAt: string }[]);
      setItems([]);
      setRelatedReciboId("");
      setItemsLocked(false);
      setShowConfirmPdf(false);
      getNextGarantiaNumber(tipoGarantia, { peek: true }).then((r) => setNextNumFromApi(r.number)).catch(() => {});
      showToast(`${tipoGarantia} ${assignedNumber} guardado en el servidor.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : `Error al guardar el ${tipoGarantia.toLowerCase()}.`, "error");
    }
  }

  async function downloadEmittedPdf(item: { invoice: Invoice; emittedAt: string }) {
    const inv = item.invoice;
    const date = new Date(item.emittedAt);
    const subtotal = Math.abs(inv.subtotal);
    const discounts = Math.abs(inv.discounts);
    const total = Math.abs(inv.total);
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
        subtotal,
        discounts,
        total
      },
      { logoBase64 }
    );
    const safeName = inv.clientName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
    doc.save(`${inv.number}_${safeName}.pdf`);
    showToast(`PDF ${inv.number} descargado.`, "success");
  }

  const canEdit = !user || canEditFacturacion(user.role);

  return (
    <div className="fact-page">
      <ConfirmModal
        open={showConfirmPdf}
        title="Guardar documento PDF"
        message="¿Querés guardar el recibo PDF?"
        confirmLabel="Sí"
        cancelLabel="No"
        variant="info"
        onConfirm={() => {
          setShowConfirmPdf(false);
          executePdfAndSave(true);
        }}
        onCancel={() => {
          setShowConfirmPdf(false);
          executePdfAndSave(false);
        }}
      />
      <div className="container">
        <PageHeader title="Garantía ANDE" />
        {!canEdit && (
          <div className="alert alert-info hrs-aviso-banner d-flex align-items-center" role="alert">
            <i className="bi bi-eye me-2" /> Solo consulta.
          </div>
        )}

        <div className="fact-layout">
          <aside className="fact-sidebar">
            <div className="fact-card fact-panel-nuevo-documento">
              <div className="fact-panel-nuevo-documento-header">
                <span style={{ fontSize: "1.25em", lineHeight: 1 }}>🗂️</span> Nuevo documento
              </div>
              <div className="fact-card-body">
                <div className="fact-field">
                  <label className="fact-label"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>📄</span> Tipo</label>
                  <select
                    className="fact-select"
                    value={tipoGarantia}
                    onChange={(e) => setTipoGarantia(e.target.value as GarantiaTipo)}
                  >
                    <option value="Recibo">Recibo</option>
                    <option value="Recibo Devolución">Recibo Devolución</option>
                  </select>
                </div>
                <div className="fact-field">
                  <label className="fact-label"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>#️⃣</span> Número</label>
                  <input className="fact-input" readOnly value={number} />
                </div>
                <div className="fact-field" style={{ paddingTop: "0.75rem" }}>
                  <label className="fact-label"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>👤</span> Cliente</label>
                  <input
                    className="fact-input"
                    type="text"
                    placeholder="Buscar por nombre o código..."
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                  />
                  <select
                    className="fact-select"
                    size={8}
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    style={{ marginTop: "0.5rem" }}
                  >
                    <option value="">Seleccione cliente</option>
                    {clientsForSelect.map((c) => (
                      <option key={c.id ?? c.code} value={String(c.id ?? "")}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 && (
                    <small className="text-muted d-block mt-1">Cargá clientes en la hoja Clientes.</small>
                  )}
                </div>

                {/* Recibo a devolver (cancelar) cuando el tipo es Recibo Devolución */}
                {tipoGarantia === "Recibo Devolución" && (
                  <div className="fact-field" style={{ borderTop: "2px solid #00a652", paddingTop: "1rem", marginTop: "1rem" }}>
                    <label className="fact-label" style={{ fontWeight: "bold", color: "#00a652" }}>
                      🧾 Recibo a devolver / cancelar (Requerido)
                    </label>
                    {!selectedClient ? (
                      <div style={{ padding: "0.75rem", backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px" }}>
                        <small className="text-warning">Primero debe seleccionar un cliente para ver los recibos disponibles.</small>
                      </div>
                    ) : (
                      <>
                        <select
                          className="fact-select"
                          value={relatedReciboId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRelatedReciboId(val);
                            if (val) {
                              const item = emittedVales.find(
                                (x) => (x.invoice.id && x.invoice.id === val) || x.invoice.number === val
                              );
                              if (item) showToast(`Recibo ${item.invoice.number} cargado. Los detalles quedan bloqueados para este Recibo Devolución.`, "success");
                            }
                          }}
                          style={{ border: relatedReciboId ? "2px solid #00a652" : "2px solid #dc3545" }}
                        >
                          <option value="">-- Seleccione recibo a cancelar --</option>
                          {recibosDisponiblesParaDevolucion.map((item) => (
                            <option key={item.invoice.id ?? item.invoice.number} value={item.invoice.id ?? item.invoice.number}>
                              {item.invoice.number} - {item.invoice.date} - Total: {formatUSD(Math.abs(item.invoice.total))}
                            </option>
                          ))}
                        </select>
                        {recibosDisponiblesParaDevolucion.length === 0 && selectedClient && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#f8d7da", border: "1px solid #dc3545", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-danger">Este cliente no tiene Recibos disponibles para devolución.</small>
                          </div>
                        )}
                        {relatedReciboId && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#d1e7dd", border: "1px solid #00a652", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-success" style={{ fontWeight: "bold" }}>✓ Recibo seleccionado. Contablemente se cancelará con este Recibo Devolución.</small>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="mt-2">
                  <Link to="/equipos-asic" className="btn btn-sm btn-outline-secondary">← Volver a Equipos ASIC</Link>
                </div>
              </div>
            </div>
          </aside>

          <main className="fact-main">
            <div className="fact-card">
              <div className="fact-card-body">
                <div className="fact-detail-servicios-outer">
                  <div className="fact-detail-servicios-container">
                    <div className="card fact-detail-servicios-card">
                      <div className="fact-detail-servicios-header">
                        <h2 className="fact-detail-servicios-title"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>📋</span> Detalle</h2>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-clear"
                            onClick={() => !itemsLocked && setItems([])}
                            disabled={itemsLocked || !selectedClient || items.length === 0}
                            title={itemsLocked ? "Detalles bloqueados (Recibo Devolución vinculado a un Recibo)" : !selectedClient ? "Primero debe seleccionar un cliente" : items.length === 0 ? "No hay ítems para borrar" : "Vaciar lista"}
                          >
                            🗑️ Borrar
                          </button>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-add"
                            onClick={addItem}
                            disabled={!canEdit || itemsLocked || !selectedClient}
                            title={itemsLocked ? "No se pueden agregar ítems; vienen del Recibo seleccionado" : !selectedClient ? "Primero debe seleccionar un cliente" : undefined}
                          >
                            + Agregar ítem
                          </button>
                        </div>
                      </div>
                      {tipoGarantia === "Recibo Devolución" && relatedReciboId && (
                        <div style={{ padding: "0.75rem", backgroundColor: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.4)", borderRadius: "10px", marginBottom: "1rem" }}>
                          <small style={{ fontWeight: "bold", color: "#fff" }}>🔒 Recibo Devolución vinculado al recibo seleccionado. Los detalles están bloqueados.</small>
                        </div>
                      )}
                      <div className="fact-detail-servicios-table-wrap">
                        <table className="fact-detail-servicios-table">
                          <thead>
                            <tr>
                              <th>GARANTIAS</th>
                              <th>Cantidad</th>
                              <th>Precio unit.</th>
                              <th>Total</th>
                              <th aria-label="Quitar" />
                            </tr>
                          </thead>
                          <tbody>
                            {items.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="fact-detail-servicios-empty">
                                  <span className="fact-detail-servicios-empty-icon">📋</span>
                                  <p className="fact-detail-servicios-empty-text">Agregá ítems para armar el recibo.</p>
                                </td>
                              </tr>
                            ) : (
                              items.map((it, idx) => {
                                const lineTotal = (it.price - it.discount) * it.quantity;
                                return (
                                  <tr key={idx}>
                                    <td>
                                      <select
                                        className="fact-select"
                                        style={{
                                          padding: "0.4rem 0.5rem",
                                          fontSize: "0.8125rem",
                                          width: "100%",
                                          maxWidth: "100%"
                                        }}
                                        value={it.garantiaId ? `garantia_${it.garantiaId}` : it.equipoId ? `equipo_${it.equipoId}` : it.setupId ? `setup_${it.setupId}` : ""}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          if (value.startsWith("garantia_")) {
                                            const g = itemsGarantia.find((x) => x.id === value.replace("garantia_", ""));
                                            if (g) {
                                              updateItem(idx, {
                                                garantiaId: g.id,
                                                garantiaCodigo: g.codigo,
                                                garantiaMarca: g.marca,
                                                garantiaModelo: g.modelo,
                                                equipoId: undefined,
                                                marcaEquipo: undefined,
                                                modeloEquipo: undefined,
                                                procesadorEquipo: undefined,
                                                setupId: undefined,
                                                setupNombre: undefined,
                                                price: 0
                                              });
                                            }
                                          } else if (value.startsWith("equipo_")) {
                                            const equipo = equiposAsic.find((eq) => eq.id === value.replace("equipo_", ""));
                                            if (equipo) {
                                              updateItem(idx, {
                                                equipoId: equipo.id,
                                                marcaEquipo: equipo.marcaEquipo,
                                                modeloEquipo: equipo.modelo,
                                                procesadorEquipo: equipo.procesador,
                                                garantiaId: undefined,
                                                garantiaCodigo: undefined,
                                                garantiaMarca: undefined,
                                                garantiaModelo: undefined,
                                                setupId: undefined,
                                                setupNombre: undefined,
                                                price: equipo.precioUSD
                                              });
                                            }
                                          } else if (value.startsWith("setup_")) {
                                            const setup = setups.find((s) => s.id === value.replace("setup_", ""));
                                            if (setup) {
                                              updateItem(idx, {
                                                setupId: setup.id,
                                                setupNombre: setup.nombre,
                                                equipoId: undefined,
                                                marcaEquipo: undefined,
                                                modeloEquipo: undefined,
                                                procesadorEquipo: undefined,
                                                garantiaId: undefined,
                                                garantiaCodigo: undefined,
                                                garantiaMarca: undefined,
                                                garantiaModelo: undefined,
                                                price: 50
                                              });
                                            }
                                          } else {
                                            updateItem(idx, {
                                              equipoId: undefined,
                                              marcaEquipo: undefined,
                                              modeloEquipo: undefined,
                                              procesadorEquipo: undefined,
                                              setupId: undefined,
                                              setupNombre: undefined,
                                              garantiaId: undefined,
                                              garantiaCodigo: undefined,
                                              garantiaMarca: undefined,
                                              garantiaModelo: undefined,
                                              price: 0
                                            });
                                          }
                                        }}
                                        disabled={!canEdit || itemsLocked}
                                      >
                                        <option value="">Seleccionar...</option>
                                        {itemsGarantia.length > 0 && (
                                          <optgroup label="Garantías">
                                            {itemsGarantia.map((g) => (
                                              <option key={g.id} value={`garantia_${g.id}`}>
                                                {g.codigo} - Garantías - {g.marca} - {g.modelo}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </select>
                                    </td>
                                    <td className="fact-cell-center">
                                      <input
                                        type="number"
                                        className="fact-input"
                                        style={{
                                          padding: "0.4rem 0.35rem",
                                          fontSize: "0.8125rem",
                                          width: "100%",
                                          textAlign: "center",
                                          backgroundColor: itemsLocked ? "#f3f4f6" : undefined,
                                          cursor: itemsLocked ? "not-allowed" : undefined
                                        }}
                                        min={1}
                                        value={it.quantity}
                                        onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value || 1)) })}
                                        readOnly={itemsLocked}
                                        disabled={!canEdit || itemsLocked}
                                      />
                                    </td>
                                    <td className="fact-cell-center">
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                        <input
                                          type="number"
                                          className="fact-input"
                                          value={it.price}
                                          onChange={(e) => updateItem(idx, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                          style={{ flex: 1, minWidth: 0, padding: "0.4rem", textAlign: "center", backgroundColor: itemsLocked ? "#f3f4f6" : undefined }}
                                          min={0}
                                          step={1}
                                          readOnly={itemsLocked}
                                          disabled={!canEdit || itemsLocked}
                                        />
                                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>USD</span>
                                      </div>
                                    </td>
                                    <td className="fact-cell-center">
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                        <input readOnly value={formatAmount(lineTotal)} className="fact-detail-servicios-input-total" style={{ flex: 1, minWidth: 0 }} />
                                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>USD</span>
                                      </div>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="fact-detail-servicios-btn-remove"
                                        onClick={() => !itemsLocked && removeItem(idx)}
                                        disabled={!canEdit || itemsLocked}
                                        title={itemsLocked ? "No se pueden quitar ítems del Recibo Devolución vinculado" : undefined}
                                      >
                                        ×
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {items.length > 0 && (
                        <div className="fact-detail-servicios-summary">
                          <div className="fact-summary-cards">
                            <div className="fact-summary-card fact-summary-card--sub">
                              <span className="fact-summary-card-label">Subtotal</span>
                              <span className="fact-summary-card-value">{formatAmount(totals.subtotal)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                            <div className="fact-summary-card fact-summary-card--disc">
                              <span className="fact-summary-card-label">Descuentos</span>
                              <span className="fact-summary-card-value">− {formatAmount(totals.discounts)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                            <div className="fact-summary-card fact-summary-card--total">
                              <span className="fact-summary-card-label">Total</span>
                              <span className="fact-summary-card-value">{formatAmount(totals.total)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-emitir"
                            onClick={generatePdfAndSave}
                            disabled={!canEdit}
                          >
                            📄 Emitir documento
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {emittedInLast5Days.length > 0 && (
                  <div className="fact-emitted-section">
                    <h3 className="fact-section-title" style={{ marginTop: "2rem", marginBottom: "1rem" }}>
                      <span style={{ fontSize: "1.4em", lineHeight: 1 }}>📄</span> Recibos emitidos (últimos 5 días)
                    </h3>
                    <div className="fact-table-wrap">
                      <table className="fact-table fact-emitted-table fact-emitted-table--7col" style={{ tableLayout: "fixed", width: "100%" }}>
                        <thead>
                          <tr>
                            <th>Tipo</th>
                            <th>Número</th>
                            <th>Cliente</th>
                            <th>Fecha<br />emisión</th>
                            <th>Hora<br />emisión</th>
                            <th className="text-start">Total</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...emittedInLast5Days].reverse().map((item) => (
                            <tr key={item.invoice.id}>
                              <td>{item.invoice.type}</td>
                              <td className="fw-bold">{item.invoice.number}</td>
                              <td>{item.invoice.clientName}</td>
                              <td>{item.invoice.date}</td>
                              <td>{item.invoice.emissionTime ?? "-"}</td>
                              <td className="text-start">{formatUSD(item.invoice.total)}</td>
                              <td className="text-center">
                                <div className="d-flex gap-1 justify-content-center flex-wrap">
                                  <button
                                    type="button"
                                    className="btn btn-sm border"
                                    onClick={() => viewEmittedInPreview(item)}
                                    title="Ver en vista previa"
                                    style={{ width: "1.3rem", height: "1.3rem", padding: 0 }}
                                  >
                                    👁️
                                  </button>
                                  <button
                                    type="button"
                                    className="fact-btn fact-btn-primary btn-sm"
                                    onClick={() => downloadEmittedPdf(item)}
                                    title="Descargar PDF"
                                    style={{ width: "1.3rem", height: "1.3rem", padding: 0 }}
                                  >
                                    📄
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="fact-emitted-count">
                      <span className="fact-emitted-count-badge">
                        <span className="fact-emitted-count-num">{emittedInLast5Days.length}</span>
                        <span className="fact-emitted-count-label">
                          {emittedInLast5Days.length === 1 ? "recibo emitido" : "recibos emitidos"}
                        </span>
                        <span className="fact-emitted-count-period"> en los últimos 5 días</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="fact-panel-vista-previa">
              <div className="fact-panel-vista-previa-header"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>🔍</span> Vista previa</div>
              <div className="fact-panel-vista-previa-body">
                <div className="fact-panel-vista-previa-inner">
                  {previewEmitted ? (
                    <InvoicePreview
                      type={previewEmitted.invoice.type as "Recibo" | "Recibo Devolución"}
                      number={previewEmitted.invoice.number}
                      client={{
                        code: "",
                        name: previewEmitted.invoice.clientName ?? "",
                        name2: previewEmitted.invoice.clientName2,
                        phone: previewEmitted.invoice.clientPhone,
                        phone2: previewEmitted.invoice.clientPhone2,
                        email: previewEmitted.invoice.clientEmail,
                        email2: previewEmitted.invoice.clientEmail2,
                        address: previewEmitted.invoice.clientAddress,
                        address2: previewEmitted.invoice.clientAddress2,
                        city: previewEmitted.invoice.clientCity,
                        city2: previewEmitted.invoice.clientCity2
                      }}
                      date={new Date(previewEmitted.emittedAt)}
                      items={previewEmitted.invoice.items ?? []}
                      subtotal={Math.abs(previewEmitted.invoice.subtotal ?? 0)}
                      discounts={Math.abs(previewEmitted.invoice.discounts ?? 0)}
                      total={Math.abs(previewEmitted.invoice.total ?? 0)}
                      dueDateDays={7}
                    />
                  ) : selectedClient && items.length > 0 ? (
                    <InvoicePreview
                      type={tipoGarantia}
                      number={number}
                      client={selectedClient}
                      date={new Date()}
                      items={items}
                      subtotal={totals.subtotal}
                      discounts={totals.discounts}
                      total={totals.total}
                      dueDateDays={7}
                    />
                  ) : (
                    <div className="fact-panel-vista-previa-empty">
                      <span className="fact-panel-vista-previa-empty-icon" aria-hidden>📄</span>
                      <p className="fact-panel-vista-previa-empty-text">No hay documento</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
