import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { defaultClients, serviceCatalog } from "../lib/constants";
import { generateFacturaPdf } from "../lib/generateFacturaPdf";
import { loadInvoices, saveInvoices } from "../lib/storage";
import type { ComprobanteType, Invoice, LineItem } from "../lib/types";

function todayLocale() {
  return new Date().toLocaleDateString();
}

function genId() {
  // good enough for local usage; server will replace with Mongo _id later
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nextNumber(type: ComprobanteType, invoices: Invoice[]) {
  const prefix = type === "Factura" ? "FC-" : "RC-";
  const filtered = invoices.filter((i) => i.number.startsWith(prefix));
  const next =
    filtered.length === 0
      ? 1001
      : Math.max(
          ...filtered.map((i) => {
            const n = Number(i.number.split("-")[1]);
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
  const [type, setType] = useState<ComprobanteType>("Factura");
  const [clientQuery, setClientQuery] = useState("");
  const [clientName, setClientName] = useState("INDICAR CLIENTE");
  const [items, setItems] = useState<LineItem[]>([]);

  const invoices = useMemo(() => loadInvoices(), []);
  const number = useMemo(() => nextNumber(type, invoices), [type, invoices]);
  const totals = useMemo(() => calcTotals(items), [items]);

  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return defaultClients;
    return defaultClients.filter(
      (c) => `${c.code} - ${c.name}`.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [clientQuery]);

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

    hist.forEach((inv) => {
      ws.addRow({
        number: inv.number,
        type: inv.type,
        clientName: inv.clientName,
        date: inv.date,
        month: inv.month,
        subtotal: inv.subtotal,
        discounts: inv.discounts,
        total: inv.total
      });
    });

    ws.getRow(1).font = { bold: true };

    wb.xlsx.writeBuffer().then((buf) => {
      saveAs(new Blob([buf]), "HRS_Historial.xlsx");
    });
  }

  function generatePdfAndSave() {
    if (!clientName || clientName.includes("INDICAR")) {
      alert("Debe seleccionar un cliente válido.");
      return;
    }
    if (items.length === 0) {
      alert("La factura no tiene ítems cargados.");
      return;
    }
    if (items.some((it) => !it.month)) {
      alert("Por favor, indique el mes para todos los ítems.");
      return;
    }

    const { subtotal, discounts, total } = calcTotals(items);
    const dateNow = new Date();
    const dateStr = todayLocale();
    const month = items[0]!.month;

    const doc = generateFacturaPdf({
      number,
      type,
      clientName,
      date: dateNow,
      items,
      subtotal,
      discounts,
      total,
    });

    const safeName = clientName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
    doc.save(`${number}_${safeName}.pdf`);

    const inv: Invoice = {
      id: genId(),
      number,
      type,
      clientName,
      date: dateStr,
      month,
      subtotal,
      discounts,
      total,
      items
    };

    const hist = loadInvoices();
    hist.push(inv);
    saveInvoices(hist);

    // reset for next
    setItems([]);
  }

  return (
    <div className="container py-5">
      <div className="hrs-card p-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="m-0">Facturación</h2>
          <Link to="/" className="btn btn-outline-secondary btn-sm">
            ← Volver
          </Link>
        </div>

        <div className="row g-3">
          <div className="col-lg-3">
            <div className="card p-3">
              <h6 className="fw-bold mb-3 border-bottom pb-2">⚙️ Configuración</h6>

              <div className="mb-3">
                <label className="form-label small fw-bold">Comprobante</label>
                <select
                  className="form-select form-select-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as ComprobanteType)}
                >
                  <option value="Factura">Factura</option>
                  <option value="Recibo">Recibo</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-bold">N° Correlativo</label>
                <input className="form-control form-control-sm text-center" readOnly value={number} />
              </div>

              <div className="mb-2">
                <label className="form-label small fw-bold">Cliente</label>
                <input
                  className="form-control form-control-sm mb-2"
                  placeholder="Filtrar cliente..."
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                <select
                  className="form-select form-select-sm"
                  size={8}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                >
                  {visibleClients.map((c) => {
                    const label = c.code === "INDICAR" ? c.name : `${c.code} - ${c.name}`;
                    const value = c.code === "INDICAR" ? c.name : `${c.code} - ${c.name}`;
                    return (
                      <option key={c.code} value={value}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          <div className="col-lg-9">
            <div className="card p-3">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0">🛠️ Detalle de servicios</h6>
                <button className="btn btn-dark btn-sm px-3" onClick={addItem}>
                  + Agregar Ítem
                </button>
              </div>

              <div className="table-responsive">
                <table className="table table-hover align-middle" style={{ tableLayout: "fixed", width: "100%" }}>
                  <thead className="table-light">
                    <tr className="small text-uppercase text-center" style={{ fontSize: "0.75rem" }}>
                      <th style={{ width: "35%" }}>Servicio</th>
                      <th style={{ width: "18%" }}>Mes</th>
                      <th style={{ width: "10%" }}>Cant.</th>
                      <th style={{ width: "12%" }}>Precio</th>
                      <th style={{ width: "10%" }}>Desc.</th>
                      <th style={{ width: "12%" }}>Total</th>
                      <th style={{ width: "40px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          <small>Agregá un ítem para comenzar</small>
                        </td>
                      </tr>
                    ) : (
                      items.map((it, idx) => {
                        const lineTotal = (it.price - it.discount) * it.quantity;
                        return (
                          <tr key={idx}>
                            <td>
                              <select
                                className="form-select form-select-sm"
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
                            <td>
                              <input
                                type="month"
                                className="form-control form-control-sm"
                                value={it.month}
                                onChange={(e) => updateItem(idx, { month: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-control form-control-sm text-center"
                                min={1}
                                value={it.quantity}
                                onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value || 1)) })}
                              />
                            </td>
                            <td>
                              <input className="form-control form-control-sm text-center" readOnly value={it.price} />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-control form-control-sm text-center"
                                min={0}
                                value={it.discount}
                                onChange={(e) => updateItem(idx, { discount: Math.max(0, Number(e.target.value || 0)) })}
                              />
                            </td>
                            <td>
                              <input
                                className="form-control form-control-sm fw-bold text-center"
                                readOnly
                                value={lineTotal.toFixed(2)}
                              />
                            </td>
                            <td className="text-center">
                              <button className="btn btn-sm btn-link text-danger p-0" onClick={() => removeItem(idx)}>
                                <strong style={{ fontSize: "1.2rem" }}>&times;</strong>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="row g-3 justify-content-end mt-2">
              <div className="col-md-3">
                <div className="card p-3 text-center bg-white shadow-sm">
                  <span className="text-muted fw-bold small">SUBTOTAL</span>
                  <div className="fw-bold">{totals.subtotal.toFixed(2)}</div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card p-3 text-center bg-white shadow-sm">
                  <span className="text-danger fw-bold small">DESCUENTOS</span>
                  <div className="fw-bold text-danger">-{totals.discounts.toFixed(2)}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card p-3 text-center bg-dark text-white shadow">
                  <span className="fw-bold small">TOTAL FINAL</span>
                  <div className="fw-bold" style={{ fontSize: "1.6rem" }}>
                    $ {totals.total.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-end mt-4 pt-2">
              <button className="btn btn-success btn-sm px-4 me-2" onClick={exportExcel}>
                📊 Excel
              </button>
              <button className="btn btn-success btn-sm px-4" onClick={generatePdfAndSave}>
                🧾 Generar comprobante (PDF)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

