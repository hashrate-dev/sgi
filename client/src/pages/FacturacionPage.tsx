import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";
import { getClients } from "../lib/api";
import { serviceCatalog } from "../lib/constants";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { loadInvoices, saveInvoices } from "../lib/storage";
import type { Client, ComprobanteType, Invoice, LineItem } from "../lib/types";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
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

function nextNumber(type: ComprobanteType, invoices: Invoice[]) {
  const prefix = 
    type === "Factura" ? "FC" : 
    type === "Recibo" ? "RC" : 
    "NC"; // Nota de Crédito
  // Filtrar facturas que empiecen con el prefijo (con o sin guion para compatibilidad)
  const filtered = invoices.filter((i) => 
    i.number.startsWith(prefix + "-") || i.number.startsWith(prefix)
  );
  const next =
    filtered.length === 0
      ? 1001
      : Math.max(
          ...filtered.map((i) => {
            // Extraer el número: puede ser "FC-1001" o "FC1001"
            let numStr = i.number;
            if (numStr.includes("-")) {
              numStr = numStr.split("-")[1];
            } else {
              // Si no tiene guion, extraer los dígitos después del prefijo
              numStr = numStr.replace(/^[A-Z]+/, "");
            }
            const n = Number(numStr);
            return Number.isFinite(n) ? n : 0;
          })
        ) + 1;
  return `${prefix}${next}`;
}

function calcTotals(items: LineItem[]) {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const discounts = items.reduce((s, it) => s + it.discount * it.quantity, 0);
  const total = subtotal - discounts;
  return { subtotal, discounts, total };
}

export function FacturacionPage() {
  const { user } = useAuth();
  const [type, setType] = useState<ComprobanteType>("Factura");
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | "">("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [relatedInvoiceId, setRelatedInvoiceId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>("");

  useEffect(() => {
    getClients()
      .then((r) => setClients((r.clients ?? []) as Client[]))
      .catch(() => setClients([]));
  }, []);

  const invoices = useMemo(() => loadInvoices(), []);
  const number = useMemo(() => nextNumber(type, invoices), [type, invoices]);
  const totals = useMemo(() => calcTotals(items), [items]);

  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => `${c.code} - ${c.name}`.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [clients, clientQuery]);

  const selectedClient = useMemo(
    () => (selectedClientId !== "" ? clients.find((c) => c.id === selectedClientId) ?? null : null),
    [clients, selectedClientId]
  );

  // Obtener facturas disponibles para Nota de Crédito: sin NC y sin Recibo (no pagadas)
  const invoicesWithoutCreditNote = useMemo(() => {
    if (!selectedClient || type !== "Nota de Crédito") return [];
    // Obtener todas las facturas del cliente
    const facturas = invoices.filter(
      (inv) => inv.clientName === selectedClient.name && inv.type === "Factura"
    );
    // Obtener IDs de facturas que ya tienen Nota de Crédito conectada
    const facturasConNC = new Set(
      invoices
        .filter((inv) => inv.type === "Nota de Crédito" && inv.relatedInvoiceId)
        .map((inv) => inv.relatedInvoiceId)
    );
    // Obtener IDs de facturas que ya tienen Recibo (pagadas) — no se puede emitir NC sobre factura pagada
    const facturasConRecibo = new Set(
      invoices
        .filter((inv) => inv.type === "Recibo" && inv.relatedInvoiceId)
        .map((inv) => inv.relatedInvoiceId)
    );
    // Filtrar: sin NC y sin Recibo (no pagadas)
    return facturas.filter(
      (inv) => !facturasConNC.has(inv.id) && !facturasConRecibo.has(inv.id)
    );
  }, [invoices, selectedClient, type]);

  // Obtener facturas sin recibo conectado y que no estén canceladas por NC (para recibos)
  const invoicesWithoutReceipt = useMemo(() => {
    if (!selectedClient || type !== "Recibo") return [];
    // Obtener todas las facturas del cliente
    const facturas = invoices.filter(
      (inv) => inv.clientName === selectedClient.name && inv.type === "Factura"
    );
    // Obtener IDs de facturas que ya tienen recibo conectado
    const facturasConRecibo = new Set(
      invoices
        .filter((inv) => inv.type === "Recibo" && inv.relatedInvoiceId)
        .map((inv) => inv.relatedInvoiceId)
    );
    // Obtener IDs de facturas canceladas por Nota de Crédito (no se puede hacer recibo)
    const facturasCanceladasPorNC = new Set(
      invoices
        .filter((inv) => inv.type === "Nota de Crédito" && inv.relatedInvoiceId)
        .map((inv) => inv.relatedInvoiceId)
    );
    // Filtrar: no tener recibo Y no estar cancelada por NC
    return facturas.filter(
      (inv) => !facturasConRecibo.has(inv.id) && !facturasCanceladasPorNC.has(inv.id)
    );
  }, [invoices, selectedClient, type]);

  // Limpiar factura relacionada cuando cambia el tipo o el cliente
  useEffect(() => {
    if (type !== "Nota de Crédito" && type !== "Recibo") {
      setRelatedInvoiceId("");
    }
  }, [type]);

  // Limpiar factura relacionada cuando cambia el cliente
  useEffect(() => {
    setRelatedInvoiceId("");
    setItems([]);
  }, [selectedClientId]);

  // Cargar ítems de la factura relacionada cuando se selecciona
  useEffect(() => {
    if ((type === "Nota de Crédito" || type === "Recibo") && relatedInvoiceId && selectedClient) {
      const relatedInvoice = invoices.find((inv) => inv.id === relatedInvoiceId);
      if (relatedInvoice && relatedInvoice.items && relatedInvoice.items.length > 0) {
        // Cargar los ítems de la factura relacionada
        setItems(relatedInvoice.items.map((item) => ({ ...item })));
        showToast(`Factura ${relatedInvoice.number} cargada. Puedes modificar los ítems si es necesario.`, "info");
      }
    }
  }, [relatedInvoiceId, type, selectedClient, invoices]);

  function addItem() {
    const def = serviceCatalog.A;
    setItems((prev) => [
      ...prev,
      {
        serviceKey: "A",
        serviceName: def.name,
        month: "",
        quantity: 1,
        price: def.price,
        discount: 0
      }
    ]);
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function exportExcel() {
    const hist = loadInvoices();
    if (hist.length === 0) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Historial");
    ws.columns = [
      { header: "Número", key: "number", width: 14 },
      { header: "Tipo", key: "type", width: 10 },
      { header: "Cliente", key: "clientName", width: 30 },
      { header: "Fecha", key: "date", width: 14 },
      { header: "Mes", key: "month", width: 10 },
      { header: "Subtotal", key: "subtotal", width: 12 },
      { header: "Descuentos", key: "discounts", width: 12 },
      { header: "Total", key: "total", width: 12 }
    ];
    hist.forEach((inv) => ws.addRow(inv));
    ws.getRow(1).font = { bold: true };
    wb.xlsx.writeBuffer().then((buf) => saveAs(new Blob([buf]), "HRS_Historial.xlsx"));
  }

  async function generatePdfAndSave() {
    if (!selectedClient) {
      showToast("Debe seleccionar un cliente válido.", "error");
      return;
    }
    if (type === "Nota de Crédito" && !relatedInvoiceId) {
      showToast("Debe seleccionar una factura a cancelar para la Nota de Crédito.", "error");
      return;
    }
    // Validar que la factura seleccionada no tenga ya una Nota de Crédito relacionada
    if (type === "Nota de Crédito" && relatedInvoiceId) {
      const hasExistingNC = invoices.some(
        (inv) => inv.type === "Nota de Crédito" && inv.relatedInvoiceId === relatedInvoiceId
      );
      if (hasExistingNC) {
        showToast("Esta factura ya tiene una Nota de Crédito relacionada. No se puede crear otra.", "error");
        return;
      }
    }
    if (type === "Recibo" && !paymentDate) {
      showToast("Debe ingresar la fecha de pago para el recibo.", "error");
      return;
    }
    // No permitir recibo si la factura relacionada fue cancelada con Nota de Crédito
    if (type === "Recibo" && relatedInvoiceId) {
      const facturaCanceladaPorNC = invoices.some(
        (inv) => inv.type === "Nota de Crédito" && inv.relatedInvoiceId === relatedInvoiceId
      );
      if (facturaCanceladaPorNC) {
        showToast("Esta factura fue cancelada con Nota de Crédito. No se puede crear un recibo para ella.", "error");
        return;
      }
    }
    if (items.length === 0) {
      showToast("La factura no tiene ítems cargados.", "error");
      return;
    }
    if (items.some((it) => !it.month)) {
      showToast("Por favor, indique el mes para todos los ítems.", "warning");
      return;
    }

    // Notificación de inicio de generación
    showToast("Generando factura PDF...", "info");

    const { subtotal, discounts, total } = calcTotals(items);
    const dateNow = new Date();
    const dateStr = todayLocale();
    const emissionTime = getCurrentTime();
    const month = items[0]!.month;
    
    // Calcular fecha de vencimiento (fecha + 7 días)
    const dueDate = new Date(dateNow);
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toLocaleDateString();

    let logoBase64: string | undefined;
    try {
      logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
    } catch {
      //
    }

    const doc = generateFacturaPdf(
      {
        number,
        type,
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
        total
      },
      { logoBase64 }
    );
    const safeName = selectedClient.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
    doc.save(`${number}_${safeName}.pdf`);
    
    // Notificación de éxito
    const tipoMensaje = type === "Factura" ? "Factura" : type === "Recibo" ? "Recibo" : "Nota de Crédito";
    showToast(`${tipoMensaje} generada y guardada correctamente.`, "success");

    // Obtener información de la factura relacionada si es Nota de Crédito o Recibo
    const relatedInvoice = relatedInvoiceId 
      ? invoices.find((inv) => inv.id === relatedInvoiceId)
      : null;

    // Para recibos relacionados con facturas: guardar valores negativos en BD (contabilidad)
    // pero el PDF ya se generó con valores positivos (correcto para visualización)
    const isReceiptWithInvoice = type === "Recibo" && relatedInvoiceId;
    const finalSubtotal = isReceiptWithInvoice ? -(Math.abs(subtotal)) : subtotal;
    const finalDiscounts = isReceiptWithInvoice ? -(Math.abs(discounts)) : discounts;
    const finalTotal = isReceiptWithInvoice ? -(Math.abs(total)) : total;

    const inv: Invoice = {
      id: genId(),
      number,
      type,
      clientName: selectedClient.name,
      date: dateStr,
      emissionTime: emissionTime,
      dueDate: dueDateStr,
      paymentDate: type === "Recibo" ? paymentDate : undefined,
      month,
      subtotal: finalSubtotal,
      discounts: finalDiscounts,
      total: finalTotal,
      items,
      relatedInvoiceId: relatedInvoice?.id,
      relatedInvoiceNumber: relatedInvoice?.number
    };
    const hist = loadInvoices();
    hist.push(inv);
    saveInvoices(hist);
    setItems([]);
    setRelatedInvoiceId("");
    setPaymentDate("");
  }

  if (user && !canEditFacturacion(user.role)) {
    return (
      <div className="fact-page">
        <div className="container py-5">
          <div className="alert alert-warning d-flex align-items-center" role="alert">
            <i className="bi bi-lock-fill me-3" style={{ fontSize: "1.5rem" }} />
            <div>
              <h5 className="alert-heading mb-1">Sin permiso</h5>
              <p className="mb-0">Su rol (Lector) solo permite consultar. No puede emitir facturas, recibos ni notas de crédito.</p>
              <Link to="/" className="alert-link mt-2 d-inline-block">Volver al inicio</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Facturación" />

        <div className="fact-layout">
          {/* Panel configuración */}
          <aside className="fact-sidebar">
            <div className="fact-card">
              <div className="fact-card-header">Nueva factura</div>
              <div className="fact-card-body">
                <div className="fact-field">
                  <label className="fact-label">Tipo de comprobante</label>
                  <select
                    className="fact-select"
                    value={type}
                    onChange={(e) => {
                      const newType = e.target.value as ComprobanteType;
                      setType(newType);
                      // Limpiar factura relacionada y ítems si cambia el tipo
                      if (newType !== "Nota de Crédito") {
                        setRelatedInvoiceId("");
                        setItems([]);
                      }
                    }}
                  >
                    <option value="Factura">Factura</option>
                    <option value="Recibo">Recibo</option>
                    <option value="Nota de Crédito">Nota de Crédito</option>
                  </select>
                </div>
                <div className="fact-field">
                  <label className="fact-label">Número</label>
                  <input className="fact-input" readOnly value={number} />
                </div>
                <div className="fact-field">
                  <label className="fact-label">Cliente</label>
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
                    onChange={(e) => setSelectedClientId(e.target.value === "" ? "" : Number(e.target.value))}
                    style={{ marginTop: "0.5rem" }}
                  >
                    <option value="">Seleccione cliente</option>
                    {visibleClients.map((c) => (
                      <option key={c.id ?? c.code} value={c.id ?? ""}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 && (
                    <small className="text-muted d-block mt-1">Cargá clientes en la hoja Clientes.</small>
                  )}
                </div>

                {/* Selector de factura relacionada para Nota de Crédito */}
                {type === "Nota de Crédito" && (
                  <div className="fact-field" style={{ borderTop: "2px solid #00a652", paddingTop: "1rem", marginTop: "1rem" }}>
                    <label className="fact-label" style={{ fontWeight: "bold", color: "#00a652" }}>
                      ⚠️ Factura a cancelar (Requerido)
                    </label>
                    {!selectedClient ? (
                      <div style={{ padding: "0.75rem", backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px" }}>
                        <small className="text-warning">
                          Primero debe seleccionar un cliente para ver las facturas disponibles.
                        </small>
                      </div>
                    ) : (
                      <>
                        <select
                          className="fact-select"
                          value={relatedInvoiceId}
                          onChange={(e) => setRelatedInvoiceId(e.target.value)}
                          style={{ border: relatedInvoiceId ? "2px solid #00a652" : "2px solid #dc3545" }}
                          required
                        >
                          <option value="">-- Seleccione una factura --</option>
                          {invoicesWithoutCreditNote.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} - {inv.date} - Total: {inv.total.toFixed(2)} USD
                            </option>
                          ))}
                        </select>
                        {invoicesWithoutCreditNote.length === 0 && selectedClient && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#f8d7da", border: "1px solid #dc3545", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-danger">
                              ⚠️ Este cliente no tiene facturas disponibles para cancelar. Todas las facturas ya tienen Nota de Crédito, ya están pagadas (tienen recibo) o no hay facturas registradas.
                            </small>
                          </div>
                        )}
                        {relatedInvoiceId && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#d1e7dd", border: "1px solid #00a652", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-success" style={{ fontWeight: "bold" }}>
                              ✓ Factura relacionada seleccionada. Los ítems se cargaron automáticamente.
                            </small>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Selector de factura relacionada para Recibo */}
                {type === "Recibo" && (
                  <div className="fact-field" style={{ borderTop: "2px solid #0d6efd", paddingTop: "1rem", marginTop: "1rem" }}>
                    <label className="fact-label" style={{ fontWeight: "bold", color: "#0d6efd" }}>
                      📄 Factura relacionada (Opcional)
                    </label>
                    {!selectedClient ? (
                      <div style={{ padding: "0.75rem", backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px" }}>
                        <small className="text-warning">
                          Primero debe seleccionar un cliente para ver las facturas disponibles.
                        </small>
                      </div>
                    ) : (
                      <>
                        <select
                          className="fact-select"
                          value={relatedInvoiceId}
                          onChange={(e) => setRelatedInvoiceId(e.target.value)}
                          style={{ border: relatedInvoiceId ? "2px solid #0d6efd" : "1px solid #ced4da" }}
                        >
                          <option value="">-- Seleccione una factura (opcional) --</option>
                          {invoicesWithoutReceipt.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} - {inv.date} - Total: {inv.total.toFixed(2)} USD
                            </option>
                          ))}
                        </select>
                        {invoicesWithoutReceipt.length === 0 && selectedClient && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#e7f3ff", border: "1px solid #0d6efd", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-info">
                              ℹ️ Este cliente no tiene facturas sin recibo conectado. Puedes crear el recibo sin relacionar una factura.
                            </small>
                          </div>
                        )}
                        {relatedInvoiceId && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#d1ecf1", border: "1px solid #0d6efd", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-info" style={{ fontWeight: "bold" }}>
                              ✓ Factura relacionada seleccionada. Los ítems se cargaron automáticamente.
                            </small>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Campo de fecha de pago para Recibo */}
                {type === "Recibo" && (
                  <div className="fact-field" style={{ borderTop: "2px solid #0d6efd", paddingTop: "1rem", marginTop: "1rem" }}>
                    <label className="fact-label" style={{ fontWeight: "bold", color: "#0d6efd" }}>
                      📅 Fecha de pago (Requerido)
                    </label>
                    <input
                      type="date"
                      className="fact-input"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{ border: paymentDate ? "2px solid #0d6efd" : "2px solid #dc3545" }}
                      required
                    />
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Contenido principal */}
          <main className="fact-main">
            <div className="fact-card">
              <div className="fact-card-body">
                <div className="fact-section-header" style={{ marginBottom: type === "Nota de Crédito" && !relatedInvoiceId ? "1.5rem" : undefined }}>
                  <h2 className="fact-section-title">Detalle de servicios</h2>
                  <button 
                    type="button" 
                    className="fact-btn-add" 
                    onClick={addItem}
                    disabled={type === "Nota de Crédito" && !relatedInvoiceId}
                    title={type === "Nota de Crédito" && !relatedInvoiceId ? "Primero debe seleccionar una factura a cancelar" : type === "Recibo" && relatedInvoiceId ? "Los ítems se cargaron desde la factura relacionada" : ""}
                  >
                    + Agregar ítem
                  </button>
                </div>
                {type === "Nota de Crédito" && !relatedInvoiceId && (
                  <div style={{ padding: "1rem", backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px", marginBottom: "1rem" }}>
                    <small className="text-warning" style={{ fontWeight: "bold" }}>
                      ⚠️ Para crear una Nota de Crédito, primero debe seleccionar una factura a cancelar en el panel izquierdo.
                    </small>
                  </div>
                )}
                {type === "Recibo" && relatedInvoiceId && (
                  <div style={{ padding: "0.75rem", backgroundColor: "#e7f3ff", border: "1px solid #0d6efd", borderRadius: "4px", marginBottom: "1rem" }}>
                    <small className="text-info" style={{ fontWeight: "bold" }}>
                      ℹ️ Este recibo está relacionado con una factura. Los ítems se cargaron automáticamente.
                    </small>
                  </div>
                )}

                <div className="fact-table-wrap">
                  <table className="fact-table">
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th className="fact-cell-center">Mes</th>
                        <th className="fact-cell-center">Cant.</th>
                        <th className="fact-cell-center">Precio</th>
                        <th className="fact-cell-center">Desc.</th>
                        <th className="fact-cell-center">Total</th>
                        <th style={{ width: 48 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="fact-empty">
                            <div className="fact-empty-icon">📋</div>
                            <div className="fact-empty-text">
                              {type === "Nota de Crédito" && !relatedInvoiceId
                                ? "Primero selecciona una factura a cancelar en el panel izquierdo para cargar los ítems automáticamente"
                                : "Agregá tu primer ítem para armar la factura"}
                            </div>
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
                                  style={{ padding: "0.4rem 0.6rem", fontSize: "0.8125rem" }}
                                  value={it.serviceKey}
                                  onChange={(e) => {
                                    const key = e.target.value as LineItem["serviceKey"];
                                    const def = serviceCatalog[key];
                                    updateItem(idx, { serviceKey: key, serviceName: def.name, price: def.price });
                                  }}
                                >
                                  <option value="A">{serviceCatalog.A.name}</option>
                                  <option value="B">{serviceCatalog.B.name}</option>
                                  <option value="C">{serviceCatalog.C.name}</option>
                                </select>
                              </td>
                              <td className="fact-cell-center">
                                <input
                                  type="month"
                                  className="fact-input"
                                  style={{ padding: "0.4rem 0.6rem", fontSize: "0.8125rem", width: "100%" }}
                                  value={it.month}
                                  onChange={(e) => updateItem(idx, { month: e.target.value })}
                                />
                              </td>
                              <td className="fact-cell-center">
                                <input
                                  type="number"
                                  className="fact-input"
                                  style={{ padding: "0.4rem", fontSize: "0.8125rem", width: "4rem", textAlign: "center" }}
                                  min={1}
                                  value={it.quantity}
                                  onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value || 1)) })}
                                />
                              </td>
                              <td className="fact-cell-center">
                                <input 
                                  type="number"
                                  className="fact-input"
                                  value={it.price}
                                  onChange={(e) => updateItem(idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                                  style={{ width: "3.25rem", padding: "0.4rem", fontSize: "0.8125rem", textAlign: "center" }}
                                  min={0}
                                  step="0.01"
                                />
                              </td>
                              <td className="fact-cell-center">
                                <input
                                  type="number"
                                  className="fact-input"
                                  style={{ padding: "0.4rem", fontSize: "0.8125rem", width: "4rem", textAlign: "center" }}
                                  min={0}
                                  value={it.discount}
                                  onChange={(e) => updateItem(idx, { discount: Math.max(0, Number(e.target.value || 0)) })}
                                />
                              </td>
                              <td className="fact-cell-center fact-cell-total">
                                <input readOnly value={lineTotal.toFixed(2)} style={{ width: "3.5rem" }} />
                              </td>
                              <td className="fact-cell-center">
                                <button type="button" className="fact-btn-remove" onClick={() => removeItem(idx)} title="Quitar ítem">
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
                  <>
                    <div className="fact-totals">
                      <div className="fact-total-box fact-total-sub">
                        <span className="fact-total-label">Subtotal</span>
                        <span className="fact-total-value">$ {totals.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="fact-total-box fact-total-disc">
                        <span className="fact-total-label">Descuentos</span>
                        <span className="fact-total-value">− $ {totals.discounts.toFixed(2)}</span>
                      </div>
                      <div className="fact-total-box fact-total-final">
                        <span className="fact-total-label">Total</span>
                        <span className="fact-total-value">$ {totals.total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="fact-actions">
                      <button type="button" className="fact-btn fact-btn-secondary" onClick={exportExcel}>
                        Exportar Excel
                      </button>
                      <button type="button" className="fact-btn fact-btn-primary" onClick={generatePdfAndSave}>
                        Emitir
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
