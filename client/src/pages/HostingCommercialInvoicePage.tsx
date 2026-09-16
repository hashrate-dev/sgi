import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CommercialInvoiceItemCatalogPicker } from "../components/CommercialInvoiceItemCatalogPicker";
import { CommercialInvoicePreview } from "../components/CommercialInvoicePreview";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import {
  createCommercialInvoice,
  createCommercialInvoiceRecipient,
  getCommercialInvoiceCatalog,
  getCommercialInvoiceNextNumber,
  getCommercialInvoiceRecipients,
  getCommercialInvoices,
  updateCommercialInvoice,
  type CommercialInvoiceCatalogEquipo,
  type CommercialInvoiceRecipient,
  type CommercialInvoiceRecord,
} from "../lib/api";
import { canEditFacturacion } from "../lib/auth";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import {
  COMMERCIAL_INVOICE_FIRST_SEQ,
  COMMERCIAL_INVOICE_INCOTERMS,
  COMMERCIAL_INVOICE_SHIPMENT_PURPOSES,
  COMMERCIAL_INVOICE_SHIPPING_CARRIERS,
  applyCommercialInvoiceRecipient,
  commercialInvoiceLineAmount,
  defaultCommercialInvoiceFields,
  emptyCommercialInvoiceItem,
  emptyCommercialInvoiceShippingItem,
  formatCommercialInvoiceNumber,
  isCommercialInvoiceShippingItem,
  matchCommercialInvoiceRecipient,
  patchCommercialInvoiceShipping,
  recallCommercialInvoiceDraft,
  rememberCommercialInvoiceDraft,
  type CommercialInvoiceFields,
} from "../lib/commercialInvoice";
import { downloadCommercialInvoicePdf } from "../lib/generateCommercialInvoicePdf";
import { sgiHome } from "../lib/marketplacePaths.js";
import "../styles/facturacion.css";
import "../styles/commercial-invoice.css";

function fieldsFromRecord(inv: CommercialInvoiceRecord): CommercialInvoiceFields {
  return {
    numberSuffix: inv.numberSuffix,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    poNumber: inv.poNumber,
    paymentTerms: inv.paymentTerms,
    paymentMethod: inv.paymentMethod,
    incoterms: inv.incoterms,
    originCountry: inv.originCountry,
    destinationCountry: inv.destinationCountry,
    sellerName: inv.sellerName,
    sellerAddress: inv.sellerAddress,
    sellerCity: inv.sellerCity,
    sellerCountry: inv.sellerCountry,
    sellerTaxId: inv.sellerTaxId,
    sellerEmail: inv.sellerEmail,
    sellerPhone: inv.sellerPhone,
    sellerWeb: inv.sellerWeb,
    buyerName: inv.buyerName,
    buyerAddress: inv.buyerAddress,
    buyerCity: inv.buyerCity,
    buyerCountry: inv.buyerCountry,
    buyerTaxId: inv.buyerTaxId,
    buyerEmail: inv.buyerEmail,
    buyerPhone: inv.buyerPhone ?? "",
    notes: inv.notes,
    bankDetails: inv.bankDetails,
    taxLabel: inv.taxLabel,
    taxAmount: inv.taxAmount,
    goodsStatus: inv.goodsStatus ?? "Used / Usado",
    shipmentPurpose: inv.shipmentPurpose ?? "Shipment of used equipment / Envío de equipos usados",
    goodsOriginCountry: inv.goodsOriginCountry ?? "",
    items: inv.items,
  };
}

export function HostingCommercialInvoicePage() {
  const { user } = useAuth();
  const canOpen = canUserAccessNavPath(user, "/hosting/commercial-invoices");
  const canEdit = canEditFacturacion(user);
  const [form, setForm] = useState<CommercialInvoiceFields>(() => recallCommercialInvoiceDraft() ?? defaultCommercialInvoiceFields());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [peekNumber, setPeekNumber] = useState("");
  const [list, setList] = useState<CommercialInvoiceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [equipos, setEquipos] = useState<CommercialInvoiceCatalogEquipo[]>([]);
  const [recipients, setRecipients] = useState<CommercialInvoiceRecipient[]>([]);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const displayNumber = savedNumber || peekNumber || "IN00101";

  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: /^[A-Z]{3}$/.test(form.currency) ? form.currency : "USD" }).format(n);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await getCommercialInvoices();
      setList(res.invoices);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo cargar el historial", "error");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadRecipients = useCallback(async () => {
    try {
      const res = await getCommercialInvoiceRecipients();
      setRecipients(res.recipients ?? []);
    } catch {
      showToast("No se pudo cargar los consignatarios", "error");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  useEffect(() => {
    void getCommercialInvoiceCatalog()
      .then((r) => {
        setEquipos(r.equipos ?? []);
      })
      .catch(() => {
        showToast("No se pudo cargar el catálogo ASIC. Podés escribir la descripción a mano.", "error");
      });
  }, []);

  useEffect(() => {
    if (editingId != null) return;
    const t = window.setTimeout(() => {
      void getCommercialInvoiceNextNumber()
        .then((r) => setPeekNumber(r.number))
        .catch(() => setPeekNumber(formatCommercialInvoiceNumber(COMMERCIAL_INVOICE_FIRST_SEQ)));
    }, 250);
    return () => window.clearTimeout(t);
  }, [editingId]);

  const addItem = () => {
    setForm((p) => ({ ...p, items: [...p.items, emptyCommercialInvoiceItem()] }));
  };

  const addShipping = () => {
    setForm((p) => ({
      ...p,
      items: [...p.items, emptyCommercialInvoiceShippingItem(p.originCountry, p.destinationCountry)],
    }));
  };

  const selectedRecipientId = matchCommercialInvoiceRecipient(form, recipients);
  const selectedRecipient = recipients.find((r) => r.id === selectedRecipientId) ?? null;

  const onSaveRecipient = async () => {
    if (!canEdit) return;
    if (!form.buyerName.trim()) {
      showToast("Completá el nombre del consignatario para guardarlo.", "error");
      return;
    }
    setSavingRecipient(true);
    try {
      const res = await createCommercialInvoiceRecipient({
        name: form.buyerName.trim(),
        taxId: form.buyerTaxId.trim(),
        address: form.buyerAddress.trim(),
        phone: form.buyerPhone.trim(),
        email: form.buyerEmail.trim(),
        country: (form.buyerCountry || form.destinationCountry).trim(),
      });
      setRecipients((p) => [...p.filter((r) => r.id !== res.recipient.id), res.recipient].sort((a, b) => a.userNumber - b.userNumber));
      setForm((p) => ({ ...p, ...applyCommercialInvoiceRecipient(res.recipient) }));
      showToast(`Usuario ${res.recipient.userCode} guardado`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar el consignatario", "error");
    } finally {
      setSavingRecipient(false);
    }
  };

  if (!user || !canOpen) {
    return <Navigate to={sgiHome()} replace />;
  }

  const set = <K extends keyof CommercialInvoiceFields>(key: K, value: CommercialInvoiceFields[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  const patchItem = (idx: number, patch: Partial<CommercialInvoiceFields["items"][number]>) => {
    setForm((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const resetNew = () => {
    const remembered = recallCommercialInvoiceDraft() ?? defaultCommercialInvoiceFields();
    setForm({
      ...remembered,
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
    });
    setEditingId(null);
    setSavedNumber(null);
  };

  const onSave = async () => {
    if (!canEdit) return;
    rememberCommercialInvoiceDraft(form);
    const payload = { ...form, numberSuffix: "", items: form.items.filter((it) => it.description.trim()) };
    if (!payload.sellerName.trim()) {
      showToast("Completá el nombre del expedidor (quien envía).", "error");
      return;
    }
    if (!payload.buyerName.trim()) {
      showToast("Completá el nombre del consignatario (quien recibe).", "error");
      return;
    }
    if (!payload.items.length) {
      showToast("Agregá al menos un ítem con descripción.", "error");
      return;
    }
    setBusy(true);
    try {
      if (editingId != null) {
        const res = await updateCommercialInvoice(editingId, payload);
        setSavedNumber(res.invoice.number);
        setForm(fieldsFromRecord(res.invoice));
        showToast(`Actualizada ${res.invoice.number}`, "success");
      } else {
        const res = await createCommercialInvoice(payload);
        setEditingId(res.invoice.id);
        setSavedNumber(res.invoice.number);
        setForm(fieldsFromRecord(res.invoice));
        showToast(`Guardada ${res.invoice.number}`, "success");
      }
      await loadList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setBusy(false);
    }
  };

  const onPdf = async () => {
    const number = savedNumber || peekNumber;
    if (!number) {
      showToast("Todavía no hay número para el PDF. Guardá el documento o esperá la vista previa.", "error");
      return;
    }
    rememberCommercialInvoiceDraft(form);
    await downloadCommercialInvoicePdf({ ...form, number });
  };

  return (
    <div className="fact-page ci-page">
      <div className="container">
        <PageHeader title="Commercial Invoice" />
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h4 mb-1">Commercial Invoice</h1>
            <p className="text-muted small mb-0">
              El número es automático: <code>IN00101</code>, <code>IN00102</code>… suma de a uno y no se reutiliza.
            </p>
          </div>
          <Link to="/hosting" className="btn btn-outline-secondary btn-sm">
            Volver al hub
          </Link>
        </div>

        <div className="ci-layout">
          <div className="hrs-card sgi-glass-panel ci-card">
            <div className="ci-number">
              <div>
                <div className="fact-label mb-1">Número</div>
                <strong>{displayNumber}</strong>
                <div className="small text-muted">{editingId ? "Número fijo (ya emitida)" : "Vista previa — se confirma al guardar"}</div>
              </div>
              <div className="d-flex flex-wrap gap-2 ms-auto">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetNew} disabled={busy}>
                  Nueva
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void onPdf()} disabled={busy}>
                  Descargar PDF
                </button>
                {canEdit ? (
                  <button type="button" className="btn btn-success btn-sm" onClick={() => void onSave()} disabled={busy}>
                    {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar y numerar"}
                  </button>
                ) : null}
              </div>
            </div>

            <h2>Documento</h2>
            <div className="ci-grid ci-grid--3">
              <div>
                <label className="fact-label">Fecha</label>
                <input
                  type="date"
                  className="fact-input"
                  value={form.invoiceDate}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("invoiceDate", e.target.value)}
                />
              </div>
              <div>
                <label className="fact-label">Status of Goods / Estado</label>
                <select
                  className="fact-input fact-select"
                  value={form.goodsStatus === "New / Nuevo" ? "New / Nuevo" : "Used / Usado"}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("goodsStatus", e.target.value)}
                >
                  <option value="Used / Usado">Used / Usado</option>
                  <option value="New / Nuevo">New / Nuevo</option>
                </select>
              </div>
              <div>
                <label className="fact-label">Terms of Delivery / Incoterms</label>
                <select
                  className="fact-input fact-select"
                  value={form.incoterms}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("incoterms", e.target.value)}
                >
                  {COMMERCIAL_INVOICE_INCOTERMS.includes(form.incoterms as (typeof COMMERCIAL_INVOICE_INCOTERMS)[number]) ? null : form.incoterms.trim() ? (
                    <option value={form.incoterms}>{form.incoterms}</option>
                  ) : (
                    <option value="">Seleccionar Incoterm…</option>
                  )}
                  {COMMERCIAL_INVOICE_INCOTERMS.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fact-label">Country of Origin / País de origen (mercadería)</label>
                <input className="fact-input" value={form.goodsOriginCountry} disabled={!canEdit || busy} onChange={(e) => set("goodsOriginCountry", e.target.value)} />
              </div>
              <div>
                <label className="fact-label">País origen (expedidor)</label>
                <input
                  className="fact-input"
                  value={form.originCountry}
                  disabled={!canEdit || busy}
                  onChange={(e) => {
                    const originCountry = e.target.value;
                    setForm((p) => ({ ...p, originCountry, sellerCountry: originCountry }));
                  }}
                />
              </div>
              <div>
                <label className="fact-label">País destino (consignatario)</label>
                <input
                  className="fact-input"
                  value={form.destinationCountry}
                  disabled={!canEdit || busy}
                  onChange={(e) => {
                    const destinationCountry = e.target.value;
                    setForm((p) => ({ ...p, destinationCountry, buyerCountry: destinationCountry }));
                  }}
                />
              </div>
              <div className="ci-span-3">
                <label className="fact-label">Purpose of Shipment / Propósito del envío</label>
                <select
                  className="fact-input fact-select"
                  value={form.shipmentPurpose}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("shipmentPurpose", e.target.value)}
                >
                  {COMMERCIAL_INVOICE_SHIPMENT_PURPOSES.includes(
                    form.shipmentPurpose as (typeof COMMERCIAL_INVOICE_SHIPMENT_PURPOSES)[number]
                  ) ? null : form.shipmentPurpose.trim() ? (
                    <option value={form.shipmentPurpose}>{form.shipmentPurpose}</option>
                  ) : (
                    <option value="">Seleccionar propósito…</option>
                  )}
                  {COMMERCIAL_INVOICE_SHIPMENT_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <h2 className="mt-4">1. Sender / Expedidor (quien envía)</h2>
            <div className="ci-grid">
              <div className="ci-span-2">
                <label className="fact-label">Name / Nombre</label>
                <input className="fact-input" value={form.sellerName} disabled={!canEdit || busy} onChange={(e) => set("sellerName", e.target.value)} />
              </div>
              <div className="ci-span-2">
                <label className="fact-label">Identification / Cédula o Pasaporte</label>
                <input className="fact-input" value={form.sellerTaxId} disabled={!canEdit || busy} onChange={(e) => set("sellerTaxId", e.target.value)} />
              </div>
              <div className="ci-span-2">
                <label className="fact-label">Address / Dirección</label>
                <textarea
                  className="fact-input"
                  rows={2}
                  value={form.sellerAddress}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("sellerAddress", e.target.value)}
                />
              </div>
              <div>
                <label className="fact-label">Phone / Teléfono</label>
                <input className="fact-input" value={form.sellerPhone} disabled={!canEdit || busy} onChange={(e) => set("sellerPhone", e.target.value)} />
              </div>
              <div>
                <label className="fact-label">Email / Correo</label>
                <input className="fact-input" value={form.sellerEmail} disabled={!canEdit || busy} onChange={(e) => set("sellerEmail", e.target.value)} />
              </div>
            </div>

            <h2 className="mt-4">2. Recipient / Consignatario (quien recibe)</h2>
            <div className="ci-grid">
              <div className="ci-span-2">
                <label className="fact-label">Usuario / consignatario</label>
                <select
                  className="fact-input fact-select"
                  value={selectedRecipientId != null ? String(selectedRecipientId) : "__manual__"}
                  disabled={!canEdit || busy}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === "__manual__") {
                      setForm((p) => ({
                        ...p,
                        buyerName: "",
                        buyerTaxId: "",
                        buyerAddress: "",
                        buyerPhone: "",
                        buyerEmail: "",
                        buyerCountry: "",
                      }));
                      return;
                    }
                    const rec = recipients.find((r) => String(r.id) === id);
                    if (rec) setForm((p) => ({ ...p, ...applyCommercialInvoiceRecipient(rec) }));
                  }}
                >
                  <option value="__manual__">Seleccionar o cargar a mano…</option>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.userCode} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fact-label">Número de usuario</label>
                <input className="fact-input" readOnly value={selectedRecipient?.userCode ?? "Se asigna al guardar"} />
              </div>
              <div className="d-flex align-items-end">
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-outline-success btn-sm mb-1"
                    disabled={busy || savingRecipient}
                    onClick={() => void onSaveRecipient()}
                  >
                    {savingRecipient ? "Guardando…" : "+ Guardar usuario nuevo"}
                  </button>
                ) : null}
              </div>
              <div className="ci-span-2">
                <label className="fact-label">Name / Nombre</label>
                <input className="fact-input" value={form.buyerName} disabled={!canEdit || busy} onChange={(e) => set("buyerName", e.target.value)} />
              </div>
              <div className="ci-span-2">
                <label className="fact-label">RUC / Tax ID</label>
                <input className="fact-input" value={form.buyerTaxId} disabled={!canEdit || busy} onChange={(e) => set("buyerTaxId", e.target.value)} />
              </div>
              <div className="ci-span-2">
                <label className="fact-label">Address / Dirección</label>
                <textarea
                  className="fact-input"
                  rows={2}
                  value={form.buyerAddress}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("buyerAddress", e.target.value)}
                />
              </div>
              <div>
                <label className="fact-label">Phone / Teléfono</label>
                <input className="fact-input" value={form.buyerPhone} disabled={!canEdit || busy} onChange={(e) => set("buyerPhone", e.target.value)} />
              </div>
              <div>
                <label className="fact-label">Email / Correo</label>
                <input className="fact-input" value={form.buyerEmail} disabled={!canEdit || busy} onChange={(e) => set("buyerEmail", e.target.value)} />
              </div>
            </div>

            <h2 className="mt-4">Ítems</h2>
            <table className="ci-items">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                  <th>Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="ci-desc">
                      {isCommercialInvoiceShippingItem(it) ? (
                        <div className="ci-shipping">
                          <select
                            className="fact-input fact-select"
                            value={it.shippingCarrier || "DHL"}
                            disabled={!canEdit || busy}
                            onChange={(e) => patchItem(idx, patchCommercialInvoiceShipping(it, { shippingCarrier: e.target.value }))}
                          >
                            {COMMERCIAL_INVOICE_SHIPPING_CARRIERS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <div className="ci-shipping__route">
                            <input
                              className="fact-input"
                              placeholder="De (origen)"
                              value={it.shippingFrom || ""}
                              disabled={!canEdit || busy}
                              onChange={(e) => patchItem(idx, patchCommercialInvoiceShipping(it, { shippingFrom: e.target.value }))}
                            />
                            <span className="ci-shipping__sep">→</span>
                            <input
                              className="fact-input"
                              placeholder="A (destino)"
                              value={it.shippingTo || ""}
                              disabled={!canEdit || busy}
                              onChange={(e) => patchItem(idx, patchCommercialInvoiceShipping(it, { shippingTo: e.target.value }))}
                            />
                          </div>
                        </div>
                      ) : (
                        <CommercialInvoiceItemCatalogPicker
                          item={it}
                          equipos={equipos}
                          disabled={!canEdit || busy}
                          canAddItem={canEdit}
                          onPick={(patch) => patchItem(idx, patch)}
                          onAddItem={addItem}
                          onAddShipping={addShipping}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className="fact-input ci-qty"
                        type="number"
                        min={0}
                        step="any"
                        value={it.quantity}
                        disabled={!canEdit || busy}
                        onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="fact-input ci-price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={it.unitPrice}
                        disabled={!canEdit || busy}
                        onChange={(e) => patchItem(idx, { unitPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td className="text-nowrap">{money(commercialInvoiceLineAmount(it))}</td>
                    <td>
                      {canEdit && form.items.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn-link btn-sm text-danger"
                          onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ci-aside">
            <div className="ci-paper-shell mb-3">
              <div className="ci-paper-shell__head">Vista previa del documento</div>
              <div className="ci-paper-shell__body">
                <CommercialInvoicePreview fields={form} number={displayNumber} />
              </div>
            </div>

            <div className="hrs-card sgi-glass-panel ci-card">
              <h2>Emitidas</h2>
              {loadingList ? <p className="small text-muted mb-0">Cargando…</p> : null}
              {!loadingList && list.length === 0 ? <p className="small text-muted mb-0">Todavía no hay invoices guardadas.</p> : null}
              {list.length > 0 ? (
                <table className="ci-history">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Consignatario</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <div>{inv.number}</div>
                          <div className="small text-muted">{inv.invoiceDate}</div>
                        </td>
                        <td>{inv.buyerName}</td>
                        <td className="text-nowrap">
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            onClick={() => {
                              setForm(fieldsFromRecord(inv));
                              setEditingId(inv.id);
                              setSavedNumber(inv.number);
                            }}
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            onClick={() => {
                              setForm({ ...fieldsFromRecord(inv), invoiceDate: new Date().toISOString().slice(0, 10) });
                              setEditingId(null);
                              setSavedNumber(null);
                              showToast("Copia lista: al guardar toma el siguiente número", "success");
                            }}
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            onClick={() => void downloadCommercialInvoicePdf(inv)}
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
