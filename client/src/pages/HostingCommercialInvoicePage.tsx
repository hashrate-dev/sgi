import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CommercialInvoiceCountrySelect } from "../components/CommercialInvoiceCountrySelect";
import { CommercialInvoiceItemCatalogPicker } from "../components/CommercialInvoiceItemCatalogPicker";
import { CommercialInvoicePartyPicker } from "../components/CommercialInvoicePartyPicker";
import { CommercialInvoiceShippingPicker } from "../components/CommercialInvoiceShippingPicker";
import { CommercialInvoicePreview } from "../components/CommercialInvoicePreview";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import {
  createCommercialInvoice,
  createCommercialInvoiceCountry,
  createCommercialInvoiceSender,
  createCommercialInvoiceRecipient,
  getCommercialInvoiceCatalog,
  getCommercialInvoiceCountries,
  getCommercialInvoiceNextNumber,
  getCommercialInvoiceSenders,
  getCommercialInvoiceRecipients,
  getCommercialInvoices,
  updateCommercialInvoice,
  type CommercialInvoiceCatalogEquipo,
  type CommercialInvoiceCountry,
  type CommercialInvoiceSender,
  type CommercialInvoiceRecipient,
  type CommercialInvoiceRecord,
} from "../lib/api";
import { canEditFacturacion } from "../lib/auth";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import {
  COMMERCIAL_INVOICE_FIRST_SEQ,
  COMMERCIAL_INVOICE_INCOTERMS,
  COMMERCIAL_INVOICE_SHIPMENT_PURPOSES,
  applyCommercialInvoiceRecipient,
  applyCommercialInvoiceSender,
  commercialInvoiceLineAmount,
  commercialInvoiceSerialSlots,
  defaultCommercialInvoiceFields,
  emptyCommercialInvoiceItem,
  emptyCommercialInvoiceShippingItem,
  formatCommercialInvoiceNumber,
  isCommercialInvoiceShippingItem,
  matchCommercialInvoiceRecipient,
  matchCommercialInvoiceSender,
  normalizeCommercialInvoiceCountry,
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
  const [senders, setSenders] = useState<CommercialInvoiceSender[]>([]);
  const [savingSender, setSavingSender] = useState(false);
  const [countries, setCountries] = useState<CommercialInvoiceCountry[]>([]);
  const [previewZoom, setPreviewZoom] = useState(0.72);
  const previewBodyRef = useRef<HTMLDivElement>(null);
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

  const loadSenders = useCallback(async () => {
    try {
      const res = await getCommercialInvoiceSenders();
      setSenders(res.senders ?? []);
    } catch {
      showToast("No se pudo cargar los expedidores", "error");
    }
  }, []);

  const loadCountries = useCallback(async () => {
    try {
      const res = await getCommercialInvoiceCountries();
      setCountries(res.countries ?? []);
    } catch {
      showToast("No se pudo cargar los países", "error");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  useEffect(() => {
    void loadSenders();
  }, [loadSenders]);

  useEffect(() => {
    void loadCountries();
  }, [loadCountries]);

  useEffect(() => {
    const el = previewBodyRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setPreviewZoom((z) => Math.min(1.6, Math.max(0.4, Math.round((z + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      items: [...p.items, emptyCommercialInvoiceShippingItem()],
    }));
  };

  const selectedRecipientId = matchCommercialInvoiceRecipient(form, recipients);
  const selectedSenderId = matchCommercialInvoiceSender(form, senders);

  const onSaveSender = async () => {
    if (!canEdit) return;
    if (!form.sellerName.trim()) {
      showToast("Completá el nombre del expedidor para guardarlo.", "error");
      return;
    }
    setSavingSender(true);
    try {
      const res = await createCommercialInvoiceSender({
        name: form.sellerName.trim(),
        taxId: form.sellerTaxId.trim(),
        address: form.sellerAddress.trim(),
        phone: form.sellerPhone.trim(),
        email: form.sellerEmail.trim(),
        country: (form.sellerCountry || form.originCountry).trim(),
      });
      setSenders((p) => [...p.filter((s) => s.id !== res.sender.id), res.sender].sort((a, b) => a.userNumber - b.userNumber));
      setForm((p) => ({ ...p, ...applyCommercialInvoiceSender(res.sender) }));
      showToast(`Usuario ${res.sender.userCode} guardado`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar el expedidor", "error");
    } finally {
      setSavingSender(false);
    }
  };

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

  const countryNames = countries.map((c) => c.name);
  const countryOptions = (() => {
    const extras = [
      form.goodsOriginCountry,
      form.originCountry,
      form.destinationCountry,
      ...form.items.flatMap((it) => [it.shippingFrom ?? "", it.shippingTo ?? ""]),
    ]
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => !countryNames.some((c) => c.toUpperCase() === v.toUpperCase()));
    return [...countryNames, ...Array.from(new Set(extras))];
  })();

  const resolveCountry = (value: string) => {
    const hit = countries.find((c) => c.name.toUpperCase() === value.trim().toUpperCase());
    return hit?.name ?? value;
  };

  const persistNewCountry = async (raw: string): Promise<string | null> => {
    if (!canEdit) return null;
    const name = normalizeCommercialInvoiceCountry(raw);
    if (!name) {
      showToast("Escribí el país para agregarlo.", "error");
      return null;
    }
    const existing = countries.find((c) => normalizeCommercialInvoiceCountry(c.name) === name);
    if (existing) {
      showToast(`${existing.name} ya está en la lista. Elegilo en el selector.`, "error");
      return existing.name;
    }
    try {
      const res = await createCommercialInvoiceCountry({ name });
      setCountries((p) => [...p.filter((c) => c.id !== res.country.id), res.country].sort((a, b) => a.name.localeCompare(b.name)));
      showToast(`${res.country.name} agregado`, "success");
      return res.country.name;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar el país", "error");
      return null;
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
              {(
                [
                  {
                    slot: "goods" as const,
                    label: "País de origen (mercadería)",
                    value: resolveCountry(form.goodsOriginCountry),
                    onSelect: (origin: string) => set("goodsOriginCountry", origin),
                  },
                  {
                    slot: "origin" as const,
                    label: "País origen (expedidor)",
                    value: resolveCountry(form.originCountry),
                    onSelect: (originCountry: string) => setForm((p) => ({ ...p, originCountry, sellerCountry: originCountry })),
                  },
                  {
                    slot: "dest" as const,
                    label: "País destino (consignatario)",
                    value: resolveCountry(form.destinationCountry),
                    onSelect: (destinationCountry: string) =>
                      setForm((p) => ({ ...p, destinationCountry, buyerCountry: destinationCountry })),
                  },
                ] as const
              ).map((field) => (
                <div key={field.slot}>
                  <label className="fact-label">{field.label}</label>
                  <CommercialInvoiceCountrySelect
                    value={field.value}
                    options={countryOptions}
                    disabled={!canEdit || busy}
                    canAdd={canEdit}
                    onChange={field.onSelect}
                    onCreate={persistNewCountry}
                  />
                </div>
              ))}
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
              <div className="ci-span-2 ci-party-user">
                <div>
                  <label className="fact-label">Usuario / expedidor</label>
                  <CommercialInvoicePartyPicker
                    parties={senders}
                    selectedId={selectedSenderId}
                    name={form.sellerName}
                    disabled={!canEdit || busy}
                    onPick={(rec) => setForm((p) => ({ ...p, ...applyCommercialInvoiceSender(rec) }))}
                    onAddNew={() =>
                      setForm((p) => ({
                        ...p,
                        sellerName: "",
                        sellerTaxId: "",
                        sellerAddress: "",
                        sellerPhone: "",
                        sellerEmail: "",
                        sellerCountry: "",
                      }))
                    }
                    onNameChange={(sellerName) => set("sellerName", sellerName)}
                  />
                </div>
                <div className="ci-party-user__save">
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-outline-success btn-sm"
                      disabled={busy || savingSender}
                      onClick={() => void onSaveSender()}
                    >
                      {savingSender ? "Guardando…" : "+ Guardar usuario nuevo"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="fact-label">Identification / Cédula o Pasaporte</label>
                <input className="fact-input" value={form.sellerTaxId} disabled={!canEdit || busy} onChange={(e) => set("sellerTaxId", e.target.value)} />
              </div>
              <div>
                <label className="fact-label">Address / Dirección</label>
                <input className="fact-input" value={form.sellerAddress} disabled={!canEdit || busy} onChange={(e) => set("sellerAddress", e.target.value)} />
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
              <div className="ci-span-2 ci-party-user">
                <div>
                  <label className="fact-label">Usuario / consignatario</label>
                  <CommercialInvoicePartyPicker
                    parties={recipients}
                    selectedId={selectedRecipientId}
                    name={form.buyerName}
                    disabled={!canEdit || busy}
                    onPick={(rec) => setForm((p) => ({ ...p, ...applyCommercialInvoiceRecipient(rec) }))}
                    onAddNew={() =>
                      setForm((p) => ({
                        ...p,
                        buyerName: "",
                        buyerTaxId: "",
                        buyerAddress: "",
                        buyerPhone: "",
                        buyerEmail: "",
                        buyerCountry: "",
                      }))
                    }
                    onNameChange={(buyerName) => set("buyerName", buyerName)}
                  />
                </div>
                <div className="ci-party-user__save">
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-outline-success btn-sm"
                      disabled={busy || savingRecipient}
                      onClick={() => void onSaveRecipient()}
                    >
                      {savingRecipient ? "Guardando…" : "+ Guardar usuario nuevo"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="fact-label">RUC / Tax ID</label>
                <input className="fact-input" value={form.buyerTaxId} disabled={!canEdit || busy} onChange={(e) => set("buyerTaxId", e.target.value)} />
              </div>
              <div>
                <label className="fact-label">Address / Dirección</label>
                <input className="fact-input" value={form.buyerAddress} disabled={!canEdit || busy} onChange={(e) => set("buyerAddress", e.target.value)} />
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
                        <div className="ci-shipping-row">
                          <CommercialInvoiceShippingPicker
                            item={it}
                            disabled={!canEdit || busy}
                            onChange={(next) => patchItem(idx, next)}
                          />
                          <CommercialInvoiceCountrySelect
                            value={resolveCountry(it.shippingFrom || "")}
                            options={countryOptions}
                            disabled={!canEdit || busy}
                            canAdd={canEdit}
                            placeholder="Origen"
                            onChange={(shippingFrom) => patchItem(idx, patchCommercialInvoiceShipping(it, { shippingFrom }))}
                            onCreate={persistNewCountry}
                          />
                          <CommercialInvoiceCountrySelect
                            value={resolveCountry(it.shippingTo || "")}
                            options={countryOptions}
                            disabled={!canEdit || busy}
                            canAdd={canEdit}
                            placeholder="Destino"
                            onChange={(shippingTo) => patchItem(idx, patchCommercialInvoiceShipping(it, { shippingTo }))}
                            onCreate={persistNewCountry}
                          />
                        </div>
                      ) : (
                        <CommercialInvoiceItemCatalogPicker
                          item={it}
                          equipos={equipos}
                          disabled={!canEdit || busy}
                          onPick={(patch) => patchItem(idx, patch)}
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
                    <td className="ci-items-remove-cell">
                      {canEdit ? (
                        <button
                          type="button"
                          className="ci-items-remove"
                          title="Quitar ítem"
                          aria-label="Quitar ítem"
                          onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                        >
                          ×
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit ? (
              <div className="ci-items-actions">
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={addItem}>
                  + Agregar ítem
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={addShipping}>
                  + Agregar Shipping
                </button>
              </div>
            ) : null}

            <h2 className="mt-4">Números de serie</h2>
            {form.items.filter((it) => !isCommercialInvoiceShippingItem(it)).length === 0 ? (
              <p className="small text-muted mb-0">Agregá un equipo en Ítems para cargar su número de serie.</p>
            ) : (
              <div className="ci-serials">
                {form.items.map((it, idx) =>
                  isCommercialInvoiceShippingItem(it) ? null : (
                    <div key={idx} className="ci-serials__row">
                      <div className="ci-serials__label">{it.description.trim() || `Equipo ${idx + 1}`}</div>
                      <div className="ci-serials__fields">
                        {commercialInvoiceSerialSlots(it).map((sn, si) => (
                          <input
                            key={si}
                            className="fact-input"
                            placeholder={commercialInvoiceSerialSlots(it).length > 1 ? `N° de serie ${si + 1}` : "Número de serie"}
                            value={sn}
                            disabled={!canEdit || busy}
                            onChange={(e) => {
                              const slots = commercialInvoiceSerialSlots(it);
                              slots[si] = e.target.value;
                              patchItem(idx, { serialNumber: slots.join(", ") });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="ci-aside">
            <div className="ci-paper-shell mb-3">
              <div className="ci-paper-shell__head">
                <span>Vista previa del documento</span>
                <div className="ci-zoom">
                  <button
                    type="button"
                    className="ci-zoom__btn"
                    aria-label="Alejar"
                    onClick={() => setPreviewZoom((z) => Math.min(1.6, Math.max(0.4, Math.round((z - 0.1) * 10) / 10)))}
                  >
                    −
                  </button>
                  <span className="ci-zoom__value">{Math.round(previewZoom * 100)}%</span>
                  <button
                    type="button"
                    className="ci-zoom__btn"
                    aria-label="Acercar"
                    onClick={() => setPreviewZoom((z) => Math.min(1.6, Math.max(0.4, Math.round((z + 0.1) * 10) / 10)))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="ci-paper-shell__body" ref={previewBodyRef}>
                <div className="ci-paper-zoom" style={{ zoom: previewZoom }}>
                  <CommercialInvoicePreview fields={form} number={displayNumber} />
                </div>
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
