import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEmittedDocument,
  createInvoice,
  getClients,
  getEmittedDocuments,
  getInvoiceById,
  getInvoices,
  getNextInvoiceNumber,
  wakeUpBackend,
  type InvoiceCreateBody,
} from "../lib/api";
import { serviceCatalog } from "../lib/constants";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { loadInvoices, saveInvoices } from "../lib/storage";
import type { Client, ComprobanteType, Invoice, LineItem } from "../lib/types";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { InvoicePreview } from "../components/InvoicePreview";
import { ConfirmModal } from "../components/ConfirmModal";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditFacturacion } from "../lib/auth";
import { formatCurrencyNumber, formatUSD } from "../lib/formatCurrency";
import { isClienteTiendaOnline } from "../lib/clientTienda";
import { isLinkedToInvoice } from "../lib/invoiceLinks";
import { buildReciboPaymentLineDescription, buildReciboConceptLine, getReciboConceptParts } from "../lib/reciboConceptText";
import { reciboHasSettlementRows, reciboIsPaymentLineSettledTable } from "../lib/receiptSettlementLine";
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

/** Nombre de archivo PDF para Hosting: HRS_GROUP_F100143_PIROTTO_ANA_LUCIA_ENERO_2026.pdf */
function buildHostingPdfFilename(number: string, clientName: string, monthStr: string): string {
  const safeName = (clientName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente").replace(/\s+/g, "_");
  const meses: Record<string, string> = {
    "01": "ENERO", "02": "FEBRERO", "03": "MARZO", "04": "ABRIL", "05": "MAYO", "06": "JUNIO",
    "07": "JULIO", "08": "AGOSTO", "09": "SEPTIEMBRE", "10": "OCTUBRE", "11": "NOVIEMBRE", "12": "DICIEMBRE"
  };
  const [year, month] = monthStr.split("-");
  const mesLabel = (month && meses[month]) || "SIN_MES";
  const anio = year || new Date().getFullYear().toString();
  return `HRS_GROUP_${number}_${safeName}_${mesLabel}_${anio}.pdf`;
}

const MAX_INVOICE_NUM = 999999;
const MIN_INVOICE_NUM = 1001;

function nextNumber(type: ComprobanteType, invoices: Invoice[]) {
  const prefix = 
    type === "Factura" ? "F" : 
    type === "Recibo" ? "RC" : 
    "N"; // Nota de Crédito
  const filtered = invoices.filter((i) => 
    i.number.startsWith(prefix + "-") || i.number.startsWith(prefix)
  );
  const next =
    filtered.length === 0
      ? MIN_INVOICE_NUM
      : Math.min(
          MAX_INVOICE_NUM,
          Math.max(
            ...filtered.map((i) => {
              let numStr = i.number;
              if (numStr.includes("-")) {
                numStr = numStr.split("-")[1];
              } else {
                numStr = numStr.replace(/^[A-Z]+/, "");
              }
              const n = Number(numStr);
              if (!Number.isFinite(n) || n > MAX_INVOICE_NUM) return 0;
              return n;
            })
          ) + 1
        );
  return `${prefix}${String(Math.max(MIN_INVOICE_NUM, next)).padStart(6, "0")}`;
}

function calcTotals(items: LineItem[]) {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const discounts = items.reduce((s, it) => s + it.discount * it.quantity, 0);
  const total = subtotal - discounts;
  return { subtotal, discounts, total };
}

/** Meses abreviados en español */
const MESES_ABREV = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Opciones de mes para el select: lista de { value: "YYYY-MM", label: "Nov 2024" } */
function getOpcionesMes(): { value: string; label: string }[] {
  const opciones: { value: string; label: string }[] = [];
  const hoy = new Date();
  const yearInicio = Math.max(2025, hoy.getFullYear() - 2); /* Solo de 2025 para adelante */
  const yearFin = hoy.getFullYear() + 1;
  for (let y = yearInicio; y <= yearFin; y++) {
    for (let m = 0; m < 12; m++) {
      opciones.push({
        value: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: `${MESES_ABREV[m]} ${y}`
      });
    }
  }
  return opciones;
}
const OPCIONES_MES = getOpcionesMes();

function currentMonthValue(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

/** Normaliza nombre de cliente para comparar (quita tildes, dobles espacios, mayúsculas/minúsculas) */
function normalizeClientName(name: string | undefined | null): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isNumericId(id: string | undefined): boolean {
  return typeof id === "string" && /^\d+$/.test(id);
}

const INVOICE_BALANCE_EPS = 0.0001;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Saldo pendiente de cobro (misma lógica que Pendientes): factura − NC vinculadas − recibos vinculados. */
function invoicePendingCollectionAmount(factura: Invoice, all: Invoice[]): number {
  const ncs = all.filter((inv) => inv.type === "Nota de Crédito" && isLinkedToInvoice(inv, factura));
  const recibos = all.filter((inv) => inv.type === "Recibo" && isLinkedToInvoice(inv, factura));
  const originalTotal = Math.abs(Number(factura.total) || 0);
  const creditApplied = ncs.reduce((s, nc) => s + Math.abs(Number(nc.total) || 0), 0);
  const paidApplied = recibos.reduce((s, r) => s + Math.abs(Number(r.total) || 0), 0);
  return Math.max(0, originalTotal - creditApplied - paidApplied);
}

type ReciboLinkedEmitResult = {
  items: LineItem[];
  lineTotals: { subtotal: number; discounts: number; total: number };
  pending: number;
  creditApplied: number;
  paidApplied: number;
  finalTotals: { subtotal: number; discounts: number; total: number };
};

/**
 * Recibo sobre factura bloqueada:
 * - Si ya hubo NC o recibos previos: ítems de **liquidación** (factura + documentos − saldo), sin repetir líneas de servicio.
 * - Si no: mismas líneas que la factura; si el neto de líneas no coincide con el saldo, una línea de ajuste (Zod: price/discount ≥ 0).
 */
function buildReciboLinkedEmitItems(
  type: ComprobanteType,
  relatedInvoiceId: string,
  itemsLocked: boolean,
  activeItems: LineItem[],
  invoicesAll: Invoice[]
): ReciboLinkedEmitResult | null {
  if (type !== "Recibo" || !relatedInvoiceId || !itemsLocked || activeItems.length === 0) return null;
  const factura = invoicesAll.find((i) => i.type === "Factura" && String(i.id) === String(relatedInvoiceId));
  if (!factura) return null;
  const lineTotals = calcTotals(activeItems);
  const pending = invoicePendingCollectionAmount(factura, invoicesAll);
  const ncs = invoicesAll.filter((inv) => inv.type === "Nota de Crédito" && isLinkedToInvoice(inv, factura));
  const recs = invoicesAll.filter((inv) => inv.type === "Recibo" && isLinkedToInvoice(inv, factura));
  const creditApplied = ncs.reduce((s, nc) => s + Math.abs(Number(nc.total) || 0), 0);
  const paidApplied = recs.reduce((s, r) => s + Math.abs(Number(r.total) || 0), 0);
  const priorDocs = creditApplied + paidApplied;
  const delta = pending - lineTotals.total;

  let items: LineItem[];
  if (priorDocs > INVOICE_BALANCE_EPS) {
    const month = activeItems[0]?.month || factura.month || currentMonthValue();
    const pay = roundMoney(pending);
    const parts = getReciboConceptParts(factura, invoicesAll);
    const desc = buildReciboPaymentLineDescription(
      parts.facturaNumber,
      parts.creditNoteNumbers,
      parts.priorReceiptNumbers
    );
    items = [
      {
        reciboLineKind: "payment_line",
        serviceName: desc,
        month,
        quantity: 1,
        price: pay,
        discount: 0,
      },
    ];
  } else {
    items = activeItems;
    if (Math.abs(delta) > INVOICE_BALANCE_EPS) {
      const month = activeItems[0]!.month || currentMonthValue();
      const price = delta > 0 ? delta : 0;
      const discount = delta < 0 ? Math.abs(delta) : 0;
      items = [
        ...activeItems,
        {
          serviceName: "Ajuste: notas de crédito y/o recibos ya aplicados a la factura relacionada",
          month,
          quantity: 1,
          price,
          discount,
        },
      ];
    }
  }

  return {
    items,
    lineTotals,
    pending,
    creditApplied,
    paidApplied,
    finalTotals: calcTotals(items),
  };
}

export function FacturacionPage() {
  const { user } = useAuth();
  const location = useLocation();
  const isHostingPath = location.pathname === "/hosting/billing" || location.pathname === "/hosting/billing/";
  const [type, setType] = useState<ComprobanteType>("Factura");
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | "">("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [relatedInvoiceId, setRelatedInvoiceId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [itemsLocked, setItemsLocked] = useState(false); // Indica si los items están bloqueados por venir de factura relacionada
  const [isPartialCreditNote, setIsPartialCreditNote] = useState(false);
  const [partialCreditItems, setPartialCreditItems] = useState<LineItem[]>([]);
  /** Días para fecha de vencimiento (5, 6 o 7). Por defecto 6. */
  const [dueDateDays, setDueDateDays] = useState<5 | 6 | 7>(6);

  const [invoices, setInvoices] = useState<Invoice[]>(() => loadInvoices());
  /** Facturas / recibos / NC leídos desde la base de datos (source=hosting) para habilitar recibos/NC sobre facturas de la base */
  const [dbInvoices, setDbInvoices] = useState<Invoice[]>([]);
  /** Siguiente número desde el servidor; null = aún no pedido, "" = API falló (usar fallback local) */
  const [nextNumFromApi, setNextNumFromApi] = useState<string | null>(null);
  /** Documentos emitidos en esta sesión: se muestran solo 24 h, luego se quitan de la tabla (siguen en Historial/Pendientes) */
  const [emittedInSession, setEmittedInSession] = useState<{ invoice: Invoice; emittedAt: string }[]>([]);
  /** Modal: ¿Descargar documento en PDF? Sí → registrar + descargar; No → solo registrar */
  const [showEmitPdfConfirm, setShowEmitPdfConfirm] = useState(false);
  /** Documento emitido a mostrar en la vista previa (al hacer clic en Visualizar) */
  const [previewEmitted, setPreviewEmitted] = useState<{ invoice: Invoice; emittedAt: string } | null>(null);

  /** Emoji naranja 🔖 solo las primeras 22 h; la tabla muestra documentos hasta 10 días 22 h */
  const MS_22H = 22 * 60 * 60 * 1000;
  const MS_TABLE_WINDOW = 10 * 24 * 60 * 60 * 1000 + MS_22H;

  const emittedInLast24h = useMemo(() => {
    const now = Date.now();
    return emittedInSession.filter((item) => now - new Date(item.emittedAt).getTime() < MS_TABLE_WINDOW);
  }, [emittedInSession]);

  useEffect(() => {
    const now = Date.now();
    const windowMs = 10 * 24 * 60 * 60 * 1000 + 22 * 60 * 60 * 1000;
    setEmittedInSession((prev) => prev.filter((item) => now - new Date(item.emittedAt).getTime() < windowMs));
  }, []);

  /** Cargar facturas desde base (source=hosting) para selects de NC/Recibo en Hosting. */
  const fetchDbInvoices = useCallback(async () => {
    try {
      await wakeUpBackend();
      const r = await getInvoices({ source: "hosting" });
      const list: Invoice[] = (r.invoices ?? []).map((inv) => ({
        id: String(inv.id),
        number: inv.number,
        type: inv.type as ComprobanteType,
        clientName: inv.clientName,
        date: inv.date,
        month: inv.month,
        subtotal: inv.subtotal,
        discounts: inv.discounts,
        total: inv.total,
        relatedInvoiceId: inv.relatedInvoiceId != null ? String(inv.relatedInvoiceId) : undefined,
        relatedInvoiceNumber: inv.relatedInvoiceNumber,
        paymentDate: inv.paymentDate,
        emissionTime: inv.emissionTime,
        dueDate: inv.dueDate,
        items: [],
      }));
      setDbInvoices(list);
    } catch {
      setDbInvoices([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchDbInvoices();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchDbInvoices]);

  /** Conjunto combinado de facturas/recibos/NC.
   * En Hosting priorizamos solo BD para evitar "fantasmas" borrados manualmente en DB.
   */
  const invoicesAll = useMemo<Invoice[]>(() => {
    const map = new Map<string, Invoice>();
    const addAll = (src: Invoice[]) => {
      for (const inv of src) {
        const key = `${inv.type}-${inv.number}`;
        const prev = map.get(key);
        if (!prev) {
          map.set(key, inv);
          continue;
        }
        // Preferir el registro "de base" (id numérico) por sobre el local (id tipo timestamp_uuid)
        const prevIsDb = isNumericId(prev.id);
        const invIsDb = isNumericId(inv.id);
        if (!prevIsDb && invIsDb) map.set(key, inv);
      }
    };
    if (!isHostingPath) addAll(invoices);
    addAll(dbInvoices);
    return Array.from(map.values());
  }, [invoices, dbInvoices, isHostingPath]);

  /** Cargar documentos emitidos (hosting) desde el servidor; al borrar del historial se borran también de aquí. */
  function fetchEmittedHosting() {
    const windowMs = 10 * 24 * 60 * 60 * 1000 + 22 * 60 * 60 * 1000;
    getEmittedDocuments("hosting")
      .then((r) => {
        const now = Date.now();
        const list = (r.items ?? [])
          .filter((item) => now - new Date(item.emittedAt).getTime() < windowMs)
          .map((i) => ({ invoice: i.invoice as Invoice, emittedAt: i.emittedAt }));
        setEmittedInSession(list);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!isHostingPath) return;
    fetchEmittedHosting();
  }, [location.pathname, isHostingPath]);

  /** Refrescar lista al volver a esta pestaña (p. ej. después de borrar en Historial) */
  useEffect(() => {
    if (!isHostingPath) return;
    const onFocus = () => {
      fetchEmittedHosting();
      void fetchDbInvoices();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [location.pathname, isHostingPath, fetchDbInvoices]);

  /** Refrescar Documentos Emitidos cuando se elimina en Historial (hosting) */
  useEffect(() => {
    const handler = (e: CustomEvent<{ source: string }>) => {
      if (e.detail?.source === "hosting") fetchEmittedHosting();
    };
    window.addEventListener("hrs-emitted-changed", handler as EventListener);
    return () => window.removeEventListener("hrs-emitted-changed", handler as EventListener);
  }, []);

  useEffect(() => {
    getClients()
      .then((r) => {
        const all = (r.clients ?? []) as Client[];
        /* Solo clientes Hosting (C01…); excluye tienda online A9… / WEB- */
        setClients(all.filter((c) => !isClienteTiendaOnline(c)));
      })
      .catch(() => setClients([]));
  }, []);

  /** Vista previa: pedir siguiente número sin consumir (peek) para no gastar números al solo abrir la página */
  useEffect(() => {
    setNextNumFromApi(null);
    getNextInvoiceNumber((type === "Recibo Devolución" ? "Recibo" : type) as "Factura" | "Recibo" | "Nota de Crédito", { peek: true })
      .then((r) => setNextNumFromApi(r.number))
      .catch(() => setNextNumFromApi(""));
  }, [type]);

  const number = useMemo(
    () => (nextNumFromApi !== null && nextNumFromApi !== "" ? nextNumFromApi : nextNumber(type, isHostingPath ? dbInvoices : invoices)),
    [type, invoices, dbInvoices, isHostingPath, nextNumFromApi]
  );
  const activeItems = useMemo(
    () => (type === "Nota de Crédito" && isPartialCreditNote ? partialCreditItems : items),
    [type, isPartialCreditNote, partialCreditItems, items]
  );
  const totals = useMemo(() => calcTotals(activeItems), [activeItems]);

  const reciboLinkedEmit = useMemo(
    () => buildReciboLinkedEmitItems(type, relatedInvoiceId, itemsLocked, activeItems, invoicesAll),
    [type, relatedInvoiceId, itemsLocked, activeItems, invoicesAll]
  );

  const displaySummary = useMemo(() => {
    if (reciboLinkedEmit) {
      const invNet = roundMoney(reciboLinkedEmit.lineTotals.subtotal - reciboLinkedEmit.lineTotals.discounts);
      const showNote = Math.abs(reciboLinkedEmit.pending - reciboLinkedEmit.lineTotals.total) > INVOICE_BALANCE_EPS;
      return {
        subtotal: roundMoney(reciboLinkedEmit.finalTotals.subtotal),
        discounts: roundMoney(reciboLinkedEmit.finalTotals.discounts),
        total: roundMoney(reciboLinkedEmit.pending),
        invoiceNetLines: invNet,
        previewItems: reciboLinkedEmit.items,
        previewSubtotal: roundMoney(reciboLinkedEmit.finalTotals.subtotal),
        previewDiscounts: roundMoney(reciboLinkedEmit.finalTotals.discounts),
        previewTotal: roundMoney(reciboLinkedEmit.finalTotals.total),
        showPendingNote: showNote,
        creditApplied: roundMoney(reciboLinkedEmit.creditApplied),
        paidApplied: roundMoney(reciboLinkedEmit.paidApplied),
      };
    }
    return {
      subtotal: totals.subtotal,
      discounts: totals.discounts,
      total: totals.total,
      invoiceNetLines: roundMoney(totals.subtotal - totals.discounts),
      previewItems: activeItems,
      previewSubtotal: totals.subtotal,
      previewDiscounts: totals.discounts,
      previewTotal: totals.total,
      showPendingNote: false,
      creditApplied: 0,
      paidApplied: 0,
    };
  }, [reciboLinkedEmit, totals, activeItems]);

  /** Texto de concepto del recibo (PDF / vista previa) y aviso si hay NC sobre la factura. */
  const reciboConceptForForm = useMemo(() => {
    if (type !== "Recibo" || !relatedInvoiceId) {
      return { line: "", hasLinkedNc: false };
    }
    const factura = invoicesAll.find((i) => i.type === "Factura" && String(i.id) === String(relatedInvoiceId));
    if (!factura) return { line: "", hasLinkedNc: false };
    const parts = getReciboConceptParts(factura, invoicesAll);
    return {
      line: buildReciboConceptLine(parts),
      hasLinkedNc: parts.creditNoteNumbers.length > 0,
    };
  }, [type, relatedInvoiceId, invoicesAll]);

  const reciboModeIndicator = useMemo(() => {
    if (type !== "Recibo" || !relatedInvoiceId) return null;
    const isPartial = reciboIsPaymentLineSettledTable(displaySummary.previewItems);
    if (isPartial) {
      return {
        label: "PARCIAL",
        detail: "El PDF saldrá con una sola línea de liquidación (pago neto pendiente).",
        bg: "rgba(59, 130, 246, 0.2)",
        border: "1px solid rgba(96, 165, 250, 0.5)",
        color: "#e0f2fe",
      };
    }
    return {
      label: "TOTAL",
      detail: "El PDF saldrá con todos los ítems de la factura (formato completo).",
      bg: "rgba(16, 185, 129, 0.2)",
      border: "1px solid rgba(52, 211, 153, 0.5)",
      color: "#dcfce7",
    };
  }, [type, relatedInvoiceId, displaySummary.previewItems]);

  /** La fila 4% se agrega manual (desde el selector de ítem). Solo actualizamos precio/cantidad de cada D (4% de la fila de servicio correspondiente) y orden: Servicio, 4%, Servicio, 4%, ... */
  useEffect(() => {
    setItems((prev) => {
      const serviceItems = prev.filter((it) => it.serviceKey === "A" || it.serviceKey === "B" || it.serviceKey === "C");
      const dItems = prev.filter((it) => it.serviceKey === "D");
      const numService = serviceItems.length;
      const basePorFila = serviceItems.map((s) => (s.price - (s.discount || 0)) * s.quantity);

      if (dItems.length === 0) return prev;

      const newDItems = dItems.map((d, i) => {
        const amount = Math.round((basePorFila[i] ?? 0) * 0.04 * 100) / 100;
        return {
          ...d,
          month: serviceItems[i]?.month ?? d.month,
          price: amount,
          quantity: 1,
          discount: 0
        };
      });

      const ordered: LineItem[] = [];
      const n = Math.max(numService, newDItems.length);
      for (let i = 0; i < n; i++) {
        if (serviceItems[i]) ordered.push(serviceItems[i]);
        if (newDItems[i]) ordered.push(newDItems[i]);
      }

      if (ordered.length !== prev.length) return ordered;
      const same = ordered.every((o, i) => {
        const p = prev[i];
        return p && o.serviceKey === p.serviceKey && o.price === p.price && o.quantity === p.quantity && (o.month === p.month) && (o.discount ?? 0) === (p.discount ?? 0);
      });
      return same ? prev : ordered;
    });
  }, [items]);

  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    const filtered = clients.filter(
      (c) => `${c.code} - ${c.name}`.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
    // Mantener el cliente seleccionado en la lista aunque no coincida el filtro (evita que el select se resetee)
    if (selectedClientId !== "" && !filtered.some((c) => String(c.id) === String(selectedClientId))) {
      const sel = clients.find((c) => String(c.id) === String(selectedClientId));
      if (sel) return [sel, ...filtered];
    }
    return filtered;
  }, [clients, clientQuery, selectedClientId]);

  const selectedClient = useMemo(
    () => (selectedClientId !== "" ? clients.find((c) => String(c.id) === String(selectedClientId)) ?? null : null),
    [clients, selectedClientId]
  );

  // Obtener facturas disponibles para Nota de Crédito: sin NC y sin Recibo (no pagadas)
  const invoicesWithoutCreditNote = useMemo(() => {
    if (!selectedClient || type !== "Nota de Crédito") return [];
    const clientNorm = normalizeClientName(selectedClient.name);
    // Obtener todas las facturas del cliente (comparando nombre normalizado)
    const facturas = invoicesAll.filter((inv) => inv.type === "Factura" && normalizeClientName(inv.clientName) === clientNorm);
    const recibos = invoicesAll.filter((inv) => inv.type === "Recibo");
    const ncs = invoicesAll.filter((inv) => inv.type === "Nota de Crédito");
    // Disponibles para NC: no tienen recibo ni NC vinculados
    return facturas.filter((f) => !recibos.some((r) => isLinkedToInvoice(r, f)) && !ncs.some((nc) => isLinkedToInvoice(nc, f)));
  }, [invoicesAll, selectedClient, type]);

  // Recibo sobre factura: listar si queda saldo por cobrar (permite NC parcial + recibo del saldo restante)
  const invoicesWithoutReceipt = useMemo(() => {
    if (!selectedClient || type !== "Recibo") return [];
    const clientNorm = normalizeClientName(selectedClient.name);
    const facturas = invoicesAll.filter((inv) => inv.type === "Factura" && normalizeClientName(inv.clientName) === clientNorm);
    return facturas.filter((f) => invoicePendingCollectionAmount(f, invoicesAll) > INVOICE_BALANCE_EPS);
  }, [invoicesAll, selectedClient, type]);

  // Limpiar factura relacionada cuando cambia el tipo o el cliente
  useEffect(() => {
    if (type !== "Nota de Crédito" && type !== "Recibo") {
      setRelatedInvoiceId("");
      setItemsLocked(false);
    }
    if (type !== "Nota de Crédito") {
      setIsPartialCreditNote(false);
      setPartialCreditItems([]);
    }
  }, [type]);

  // Limpiar factura relacionada cuando cambia el cliente
  useEffect(() => {
    setRelatedInvoiceId("");
    setItems([]);
    setItemsLocked(false);
    setIsPartialCreditNote(false);
    setPartialCreditItems([]);
  }, [selectedClientId]);

  /** Sincronizar ítems con month vacío, inválido o anterior a 2025 al mes actual (solo 2025 para adelante) */
  useEffect(() => {
    const def = currentMonthValue();
    setItems((prev) => {
      const needsUpdate = prev.some((it) => {
        const m = it.month || "";
        if (!/^\d{4}-\d{2}$/.test(m)) return true;
        const year = parseInt(m.slice(0, 4), 10);
        return year < 2025;
      });
      if (!needsUpdate) return prev;
      return prev.map((it) => {
        const m = it.month || "";
        if (!/^\d{4}-\d{2}$/.test(m)) return { ...it, month: def };
        const year = parseInt(m.slice(0, 4), 10);
        return year < 2025 ? { ...it, month: def } : it;
      });
    });
  }, []);

  // Cargar ítems de la factura relacionada cuando se selecciona
  useEffect(() => {
    if ((type === "Nota de Crédito" || type === "Recibo") && relatedInvoiceId && selectedClient) {
      const relatedInvoice = invoicesAll.find((inv) => inv.id === relatedInvoiceId);
      if (relatedInvoice && relatedInvoice.items && relatedInvoice.items.length > 0) {
        // Cargar los ítems de la factura relacionada con todos los campos copiados correctamente
        const loadedItems: LineItem[] = relatedInvoice.items.map((item) => {
          // Asegurar que todos los campos estén presentes y correctos
          const loadedItem: LineItem = {
            serviceKey: item.serviceKey || "A", // Fallback si no existe
            serviceName: item.serviceName || serviceCatalog[item.serviceKey || "A"].name,
            month: item.month || "", // Mes debe estar presente
            quantity: item.quantity || 1, // Cantidad debe ser al menos 1
            price: item.price || 0, // Precio debe estar presente
            discount: item.discount || 0 // Descuento debe estar presente
          };
          
          // Si el serviceKey existe pero no coincide con el serviceName, actualizar el nombre desde el catálogo
          if (loadedItem.serviceKey && serviceCatalog[loadedItem.serviceKey]) {
            const catalogService = serviceCatalog[loadedItem.serviceKey];
            // Solo actualizar el nombre si el precio coincide con el catálogo (para mantener precios personalizados)
            if (loadedItem.price === catalogService.price) {
              loadedItem.serviceName = catalogService.name;
            }
          }
          
          return loadedItem;
        });
        
        setItems(loadedItems);
        // Para recibos y notas de crédito, bloquear la edición de items para que coincidan exactamente con la factura
        if (type === "Recibo" || type === "Nota de Crédito") {
          setItemsLocked(true);
          const tipoMensaje = type === "Recibo" ? "recibo" : "nota de crédito";
          showToast(`Factura ${relatedInvoice.number} cargada. Los detalles están bloqueados para mantener el mismo monto que la factura en este ${tipoMensaje}.`, "success");
        } else {
          setItemsLocked(false);
          showToast(`Factura ${relatedInvoice.number} cargada. Puedes modificar los ítems si es necesario.`, "info");
        }
      } else if (relatedInvoice && (!relatedInvoice.items || relatedInvoice.items.length === 0)) {
        // Factura de la base sin ítems en memoria: traer ítems desde la API para que el recibo muestre las líneas reales
        const invId = typeof relatedInvoice.id === "number" ? relatedInvoice.id : Number(relatedInvoice.id);
        if (!Number.isFinite(invId)) {
          const totalAbs = Math.abs(Number(relatedInvoice.total) || 0);
          const month = (relatedInvoice.month && /^\d{4}-\d{2}$/.test(relatedInvoice.month)) ? relatedInvoice.month : currentMonthValue();
          setItems([{ serviceKey: "A", serviceName: `Total factura ${relatedInvoice.number}`, month, quantity: 1, price: totalAbs, discount: 0 }]);
          setItemsLocked(true);
          return;
        }
        getInvoiceById(invId)
          .then((res) => {
            const apiItems = res.invoice?.items ?? [];
            if (apiItems.length > 0) {
              const loadedItems: LineItem[] = apiItems.map((item) => {
                const serviceName = item.service || "";
                const key = (["A", "B", "C", "D"] as const).find((k) => serviceCatalog[k].name === serviceName || serviceCatalog[k].price === item.price) ?? "A";
                return {
                  serviceKey: key,
                  serviceName: serviceName || serviceCatalog[key].name,
                  month: item.month || currentMonthValue(),
                  quantity: item.quantity || 1,
                  price: item.price || 0,
                  discount: item.discount || 0
                };
              });
              setItems(loadedItems);
              setItemsLocked(true);
              showToast(`Factura ${relatedInvoice.number} cargada con sus ítems. Podés emitir el ${type === "Recibo" ? "recibo" : "NC"}.`, "success");
            } else {
              const totalAbs = Math.abs(Number(relatedInvoice.total) || 0);
              const month = (relatedInvoice.month && /^\d{4}-\d{2}$/.test(relatedInvoice.month)) ? relatedInvoice.month : currentMonthValue();
              setItems([{ serviceKey: "A", serviceName: `Total factura ${relatedInvoice.number}`, month, quantity: 1, price: totalAbs, discount: 0 }]);
              setItemsLocked(true);
              showToast(`Factura ${relatedInvoice.number} sin ítems en la base; se usó el total. Podés emitir el ${type === "Recibo" ? "recibo" : "NC"}.`, "success");
            }
          })
          .catch(() => {
            const totalAbs = Math.abs(Number(relatedInvoice.total) || 0);
            const month = (relatedInvoice.month && /^\d{4}-\d{2}$/.test(relatedInvoice.month)) ? relatedInvoice.month : currentMonthValue();
            setItems([{ serviceKey: "A", serviceName: `Total factura ${relatedInvoice.number}`, month, quantity: 1, price: totalAbs, discount: 0 }]);
            setItemsLocked(true);
            showToast(`No se pudieron cargar los ítems de la factura; se usó el total. Podés emitir el ${type === "Recibo" ? "recibo" : "NC"}.`, "warning");
          });
      }
    } else {
      setItemsLocked(false);
    }
  }, [relatedInvoiceId, type, selectedClient, invoicesAll]);

  // NC parcial: inicializa grilla manual independiente (se emite con estos ítems)
  useEffect(() => {
    if (type !== "Nota de Crédito" || !isPartialCreditNote || !relatedInvoiceId) {
      return;
    }
    const relatedInvoice = invoicesAll.find((inv) => String(inv.id) === String(relatedInvoiceId));
    const monthDefault =
      relatedInvoice?.month && /^\d{4}-\d{2}$/.test(relatedInvoice.month)
        ? relatedInvoice.month
        : currentMonthValue();
    setPartialCreditItems((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          serviceKey: "A",
          serviceName: serviceCatalog.A.name,
          month: monthDefault,
          quantity: 1,
          price: 0,
          discount: 0,
        },
      ];
    });
  }, [type, isPartialCreditNote, relatedInvoiceId, invoicesAll]);

  function addItem() {
    const def = serviceCatalog.A;
    const now = new Date();
    const monthDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setItems((prev) => [
      ...prev,
      {
        serviceKey: "A",
        serviceName: def.name,
        month: monthDefault,
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
    setItems((prev) => {
      const it = prev[idx];
      const isService = it && (it.serviceKey === "A" || it.serviceKey === "B" || it.serviceKey === "C");
      if (isService && prev[idx + 1]?.serviceKey === "D") {
        return prev.filter((_, i) => i !== idx && i !== idx + 1);
      }
      return prev.filter((_, i) => i !== idx);
    });
  }

  function addPartialCreditItem() {
    const def = serviceCatalog.A;
    const now = new Date();
    const monthDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setPartialCreditItems((prev) => [
      ...prev,
      {
        serviceKey: "A",
        serviceName: def.name,
        month: monthDefault,
        quantity: 1,
        price: def.price,
        discount: 0,
      },
    ]);
  }

  function updatePartialCreditItem(idx: number, patch: Partial<LineItem>) {
    setPartialCreditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removePartialCreditItem(idx: number) {
    setPartialCreditItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleClickEmitir() {
    if (clients.length === 0) {
      showToast("No hay clientes Hosting cargados. Agregalos en Clientes → Clientes Hosting.", "error");
      return;
    }
    if (!selectedClient) {
      showToast("Debe seleccionar un cliente de la lista antes de emitir.", "error");
      return;
    }
    if (type === "Nota de Crédito" && !relatedInvoiceId) {
      showToast("Debe seleccionar una factura a cancelar para la Nota de Crédito.", "error");
      return;
    }
    if (type === "Nota de Crédito" && relatedInvoiceId) {
      const factura = invoicesAll.find((i) => i.type === "Factura" && String(i.id) === String(relatedInvoiceId)) || null;
      const hasExistingNC = !!factura && invoicesAll.some((inv) => inv.type === "Nota de Crédito" && isLinkedToInvoice(inv, factura));
      if (hasExistingNC) {
        showToast("Esta factura ya tiene una Nota de Crédito relacionada. No se puede crear otra.", "error");
        return;
      }
    }
    if (type === "Recibo" && !paymentDate) {
      showToast("Debe ingresar la fecha de pago para el recibo.", "error");
      return;
    }
    if (type === "Recibo" && relatedInvoiceId) {
      const factura = invoicesAll.find((i) => i.type === "Factura" && String(i.id) === String(relatedInvoiceId)) || null;
      if (factura && invoicePendingCollectionAmount(factura, invoicesAll) <= INVOICE_BALANCE_EPS) {
        showToast(
          "Esta factura no tiene saldo pendiente de cobro (puede estar totalmente pagada o cancelada por nota(s) de crédito).",
          "error"
        );
        return;
      }
    }
    if (activeItems.length === 0) {
      showToast(
        type === "Nota de Crédito" && isPartialCreditNote
          ? "La NC parcial no tiene ítems manuales cargados."
          : "La factura no tiene ítems cargados.",
        "error"
      );
      return;
    }
    if (Math.abs(displaySummary.total) < INVOICE_BALANCE_EPS) {
      showToast("Hay que llenar los campos para emitir el documento. El total no puede ser cero.", "error");
      return;
    }
    if (activeItems.some((it) => !it.month)) {
      showToast("Por favor, indique el mes para todos los ítems.", "warning");
      return;
    }
    setShowEmitPdfConfirm(true);
  }

  async function performEmit(downloadPdf: boolean) {
    setShowEmitPdfConfirm(false);
    if (!selectedClient) return;

    if (downloadPdf) showToast("Guardando documento...", "info");

    const linkedEmit = buildReciboLinkedEmitItems(type, relatedInvoiceId, itemsLocked, activeItems, invoicesAll);
    const itemsToEmit = linkedEmit?.items ?? activeItems;
    const { subtotal, discounts, total } = linkedEmit?.finalTotals ?? calcTotals(itemsToEmit);
    const dateNow = new Date();
    const dateStr = todayLocale();
    const emissionTime = getCurrentTime();
    const month = itemsToEmit[0]!.month;
    const dueDate = new Date(dateNow);
    dueDate.setDate(dueDate.getDate() + dueDateDays);
    const dueDateStr = dueDate.toLocaleDateString();

    const relatedInvoice = relatedInvoiceId
      ? invoicesAll.find((inv) => inv.type === "Factura" && String(inv.id) === String(relatedInvoiceId))
      : null;
    const reciboConceptText =
      type === "Recibo" && relatedInvoice && reciboHasSettlementRows(itemsToEmit)
        ? buildReciboConceptLine(getReciboConceptParts(relatedInvoice, invoicesAll))
        : undefined;
    const isNegativeType = type === "Recibo" || type === "Nota de Crédito";
    const finalSubtotal = isNegativeType ? -(Math.abs(subtotal)) : subtotal;
    const finalDiscounts = isNegativeType ? -(Math.abs(discounts)) : discounts;
    const finalTotal = isNegativeType ? -(Math.abs(total)) : total;

    const apiBody: InvoiceCreateBody = {
      type: type === "Recibo Devolución" ? "Recibo" : type,
      source: "hosting",
      clientName: selectedClient.name,
      date: dateStr,
      month,
      subtotal: finalSubtotal,
      discounts: finalDiscounts,
      total: finalTotal,
      items: itemsToEmit.map((it) => ({
        service: it.serviceName || "Servicio",
        month: it.month,
        quantity: it.quantity,
        price: it.price,
        discount: it.discount
      })),
      relatedInvoiceNumber: relatedInvoice?.number,
      paymentDate: type === "Recibo" ? paymentDate : undefined,
      emissionTime,
      dueDate: dueDateStr
    };

    let createdInvoice: { number: string };
    try {
      const res = await createInvoice(apiBody);
      createdInvoice = res.invoice;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      showToast(msg || "No se pudo guardar. Revisá la conexión con el servidor.", "error");
      getNextInvoiceNumber((type === "Recibo Devolución" ? "Recibo" : type) as "Factura" | "Recibo" | "Nota de Crédito", { peek: true })
        .then((r) => setNextNumFromApi(r.number))
        .catch(() => setNextNumFromApi(""));
      return;
    }

    const numberToUse = createdInvoice.number;

    if (downloadPdf) {
      showToast("Generando factura PDF...", "info");
      let logoBase64: string | undefined;
      try {
        logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
      } catch {
        //
      }
      const doc = generateFacturaPdf(
        {
          number: numberToUse,
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
          items: itemsToEmit,
          subtotal,
          discounts,
          total,
          dueDateDays,
          relatedInvoiceNumber: relatedInvoice?.number,
          reciboConceptText,
          creditNoteMode:
            type === "Nota de Crédito"
              ? isPartialCreditNote
                ? "partial"
                : "total"
              : undefined
        },
        { logoBase64 }
      );
      const pdfFilename = buildHostingPdfFilename(numberToUse, selectedClient.name, month);
      doc.save(pdfFilename);
      const tipoMensaje = type === "Factura" ? "Factura" : type === "Recibo" ? "Recibo" : "Nota de Crédito";
      showToast(`${tipoMensaje} generada y guardada correctamente.`, "success");
    } else {
      const tipoMensaje = type === "Factura" ? "Factura" : type === "Recibo" ? "Recibo" : "Nota de Crédito";
      showToast(`${tipoMensaje} registrada correctamente.`, "success");
    }

    const inv: Invoice = {
      id: genId(),
      number: numberToUse,
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
      date: dateStr,
      emissionTime,
      dueDate: dueDateStr,
      paymentDate: type === "Recibo" ? paymentDate : undefined,
      month,
      subtotal: finalSubtotal,
      discounts: finalDiscounts,
      total: finalTotal,
      items: itemsToEmit,
      relatedInvoiceId: relatedInvoice?.id,
      relatedInvoiceNumber: relatedInvoice?.number
    };
    if (!isHostingPath) {
      const hist = loadInvoices();
      hist.push(inv);
      saveInvoices(hist);
      setInvoices(loadInvoices());
    } else {
      // Hosting: fuente única en BD. Evita que aparezcan facturas borradas manualmente por cache local.
      void fetchDbInvoices();
    }
    const now = Date.now();
    const MS_22H_EMIT = 22 * 60 * 60 * 1000;
    const MS_TABLE_WINDOW_EMIT = 10 * 24 * 60 * 60 * 1000 + MS_22H_EMIT;
    const emittedAt = new Date().toISOString();
    setEmittedInSession((prev) => [
      ...prev.filter((item) => now - new Date(item.emittedAt).getTime() < MS_TABLE_WINDOW_EMIT),
      { invoice: inv, emittedAt }
    ]);
    addEmittedDocument("hosting", inv as Record<string, unknown>, emittedAt).catch(() => {});
    setItems([]);
    setPartialCreditItems([]);
    setRelatedInvoiceId("");
    setPaymentDate("");
    setItemsLocked(false);
    getNextInvoiceNumber((type === "Recibo Devolución" ? "Recibo" : type) as "Factura" | "Recibo" | "Nota de Crédito", { peek: true }).then((r) => setNextNumFromApi(r.number)).catch(() => setNextNumFromApi(""));
  }

  /** Parsea fecha de vencimiento guardada (dd/mm/yyyy o ISO) para el PDF */
  function parseDueDateStr(s: string): Date | undefined {
    if (!s?.trim()) return undefined;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    const parts = s.trim().split(/[/-]/);
    if (parts.length === 3) {
      const a = Number(parts[0]), b = Number(parts[1]), c = Number(parts[2]);
      if (parts[0].length === 4) return new Date(a, b - 1, c);
      return new Date(c, b - 1, a);
    }
    return undefined;
  }

  /** Descargar PDF de un documento emitido en esta sesión */
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
    const relatedForNc =
      inv.type === "Nota de Crédito"
        ? invoicesAll.find(
            (i) =>
              i.type === "Factura" &&
              (i.number === inv.relatedInvoiceNumber || String(i.id) === String(inv.relatedInvoiceId ?? ""))
          )
        : undefined;
    const inferredNcMode =
      inv.type === "Nota de Crédito" && relatedForNc
        ? Math.abs(Math.abs(inv.total) - Math.abs(relatedForNc.total)) < 0.0001
          ? "total"
          : "partial"
        : undefined;

    const relatedForReciboConcept =
      inv.type === "Recibo"
        ? invoicesAll.find(
            (i) =>
              i.type === "Factura" &&
              (String(i.id) === String(inv.relatedInvoiceId ?? "") || i.number === inv.relatedInvoiceNumber)
          )
        : undefined;
    const reciboConceptTextForSession =
      inv.type === "Recibo" && relatedForReciboConcept && reciboHasSettlementRows(inv.items)
        ? buildReciboConceptLine(getReciboConceptParts(relatedForReciboConcept, invoicesAll, { excludeReciboId: String(inv.id) }))
        : undefined;

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
        total,
        dueDate: parseDueDateStr(inv.dueDate ?? ""),
        relatedInvoiceNumber: inv.relatedInvoiceNumber ?? relatedForNc?.number,
        reciboConceptText: reciboConceptTextForSession,
        creditNoteMode: inferredNcMode
      },
      { logoBase64 }
    );
    const monthStr = inv.month || (inv.items?.[0]?.month ?? "");
    const pdfFilename = buildHostingPdfFilename(inv.number, inv.clientName, monthStr);
    doc.save(pdfFilename);
    showToast(`PDF ${inv.number} descargado.`, "success");
  }

  /** Mostrar documento emitido en la vista previa de abajo (sin abrir enlace) */
  function viewEmittedInPreview(item: { invoice: Invoice; emittedAt: string }) {
    setPreviewEmitted(item);
  }

  /** Limpiar vista previa de documento emitido cuando el usuario edita el formulario */
  useEffect(() => {
    setPreviewEmitted(null);
  }, [type, selectedClientId, items, partialCreditItems, isPartialCreditNote]);

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
        <PageHeader title="Facturación Hosting" />

        <div className="fact-layout">
          {/* Panel configuración: mismo estilo que Detalle de servicios (panel verde) */}
          <aside className="fact-sidebar">
            <div className="fact-card fact-panel-nuevo-documento">
              <div className="fact-panel-nuevo-documento-header"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>🗂️</span> Nuevo documento</div>
              <div className="fact-card-body">
                <div className="row g-2">
                  <div className="col-6">
                    <div className="fact-field">
                      <label className="fact-label"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>📑</span> Tipo</label>
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
                        <option value="Nota de Crédito">NC</option>
                      </select>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="fact-field">
                      <label className="fact-label"><span style={{ fontSize: "1.25em", lineHeight: 1, filter: "brightness(1.3) saturate(1.1)" }}>#️⃣</span> Número</label>
                      <input className="fact-input" readOnly value={number} />
                    </div>
                  </div>
                </div>
                {type === "Factura" && (
                <div className="fact-field" style={{ paddingTop: "0.5rem" }}>
                  <label className="fact-label"><span style={{ fontSize: "1.1em" }}>📅</span> Plazo de vencimiento</label>
                  <div className="d-flex gap-2 mt-1 flex-wrap">
                    {([5, 6, 7] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`btn btn-sm ${dueDateDays === d ? "btn-success" : "btn-outline-secondary"}`}
                        onClick={() => setDueDateDays(d)}
                      >
                        {d} días
                      </button>
                    ))}
                  </div>
                </div>
                )}
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
                          <option value="">-- Seleccione factura --</option>
                          {invoicesWithoutCreditNote.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} - {inv.date} - Total: {formatUSD(Math.abs(inv.total))}
                            </option>
                          ))}
                        </select>
                        {invoicesWithoutCreditNote.length === 0 && selectedClient && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#f8d7da", border: "1px solid #dc3545", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-danger">
                              ⚠️ Este cliente no tiene Facturas disponibles en Pendientes.
                            </small>
                          </div>
                        )}
                        {relatedInvoiceId && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#d1e7dd", border: "1px solid #00a652", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-success" style={{ fontWeight: "bold" }}>
                              ✓ Factura Pendiente seleccionada para cancelar con Nota de Credito.
                            </small>
                          </div>
                        )}
                        {relatedInvoiceId && (
                          <label
                            style={{
                              marginTop: "0.65rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              color: "#fff",
                              fontSize: "0.9rem",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isPartialCreditNote}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setIsPartialCreditNote(checked);
                                if (!checked) setPartialCreditItems([]);
                              }}
                            />
                            Nota de Crédito parcial (mostrar ventana manual debajo)
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Selector de factura relacionada para Recibo */}
                {type === "Recibo" && (
                  <div className="fact-field" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.25)", paddingTop: "1rem", marginTop: "1rem" }}>
                    <label className="fact-label" style={{ fontWeight: "bold", color: "#fff" }}>
                      <span style={{ fontSize: "1.3em", lineHeight: 1 }}>🧾</span> Factura abonada (Requerido)
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
                          <option value="">-- Seleccione factura --</option>
                          {invoicesWithoutReceipt.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} - {inv.date} - Total: {formatUSD(Math.abs(inv.total))}
                            </option>
                          ))}
                        </select>
                        {invoicesWithoutReceipt.length === 0 && selectedClient && (
                          <div style={{ padding: "0.75rem 1rem", backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", marginTop: "0.5rem", color: "#166534" }}>
                            <small style={{ fontWeight: 500 }}>
                              ℹ️ Este cliente no tiene facturas por liquidar pendientes.
                            </small>
                          </div>
                        )}
                        {relatedInvoiceId && (
                          <div style={{ padding: "0.75rem", backgroundColor: "#d1ecf1", border: "1px solid #0d6efd", borderRadius: "4px", marginTop: "0.5rem" }}>
                            <small className="text-info" style={{ fontWeight: "bold" }}>
                              ✓ Los ítems se cargaron automáticamente.
                            </small>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Campo de fecha de pago para Recibo */}
                {type === "Recibo" && (
                  <div className="fact-field" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.25)", paddingTop: "1rem", marginTop: "1rem" }}>
                    <label className="fact-label" style={{ fontWeight: "bold", color: "#ffcdd2" }}>
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
                <div className="fact-detail-servicios-outer">
                  <div className="fact-detail-servicios-container">
                    <div className="card fact-detail-servicios-card">
                      <div className="fact-detail-servicios-header" style={{ marginBottom: type === "Nota de Crédito" && !relatedInvoiceId ? "1.5rem" : undefined }}>
                        <h2 className="fact-detail-servicios-title"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>📋</span> Detalle de servicios</h2>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-clear"
                            onClick={() => !itemsLocked && setItems([])}
                            disabled={itemsLocked || (type === "Nota de Crédito" && !relatedInvoiceId) || !selectedClient || items.length === 0}
                            title={itemsLocked ? "Los detalles están bloqueados" : !selectedClient ? "Primero debe seleccionar un cliente" : items.length === 0 ? "No hay ítems para borrar" : "Vaciar lista de ítems"}
                          >
                            🗑️ Borrar
                          </button>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-add"
                            onClick={addItem}
                            disabled={itemsLocked || (type === "Nota de Crédito" && !relatedInvoiceId) || !selectedClient}
                            title={
                              itemsLocked
                                ? "Los detalles están bloqueados porque vienen de una factura relacionada"
                                : !selectedClient
                                  ? "Primero debe seleccionar un cliente"
                                  : type === "Nota de Crédito" && !relatedInvoiceId
                                    ? "Primero debe seleccionar una factura a cancelar"
                                    : type === "Nota de Crédito" && relatedInvoiceId && isPartialCreditNote
                                      ? "NC parcial activa: podés agregar líneas de descuento manualmente"
                                      : (type === "Recibo" || type === "Nota de Crédito") && relatedInvoiceId
                                        ? "Los ítems se cargaron desde la factura relacionada"
                                        : ""
                            }
                          >
                            + Agregar ítem
                          </button>
                        </div>
                      </div>
                      {type === "Nota de Crédito" && !relatedInvoiceId && (
                        <div style={{ padding: "1rem", backgroundColor: "rgba(255, 193, 7, 0.2)", border: "1px solid rgba(255, 193, 7, 0.6)", borderRadius: "10px", marginBottom: "1rem" }}>
                          <small style={{ fontWeight: "bold", color: "#fff" }}>
                            ⚠️ Para crear una Nota de Crédito, primero debe seleccionar una factura a cancelar en el panel izquierdo.
                          </small>
                        </div>
                      )}
                      {type === "Nota de Crédito" && relatedInvoiceId && (
                        <div style={{ padding: "0.75rem", backgroundColor: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.4)", borderRadius: "10px", marginBottom: "1rem" }}>
                          <small style={{ fontWeight: "bold", color: "#fff" }}>
                            {isPartialCreditNote
                              ? "✍️ NC parcial activa: podés cargar y editar importes de descuento por servicio."
                              : "✓ Nota de Crédito seleccionada para cancelar la factura correspondiente."}
                          </small>
                        </div>
                      )}
                      {type === "Recibo" && relatedInvoiceId && (
                        <div style={{ padding: "0.75rem", backgroundColor: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.4)", borderRadius: "10px", marginBottom: "1rem" }}>
                          <small style={{ fontWeight: "bold", color: "#fff" }}>
                            🔒 Recibo relacionado con factura. Los detalles están bloqueados.
                          </small>
                        </div>
                      )}
                      {reciboModeIndicator && (
                        <div
                          style={{
                            padding: "0.75rem 1rem",
                            backgroundColor: reciboModeIndicator.bg,
                            border: reciboModeIndicator.border,
                            borderRadius: "10px",
                            marginBottom: "1rem",
                          }}
                        >
                          <small style={{ fontWeight: "bold", color: reciboModeIndicator.color, lineHeight: 1.45, display: "block" }}>
                            Modo automático de recibo: <strong>{reciboModeIndicator.label}</strong>. {reciboModeIndicator.detail}
                          </small>
                        </div>
                      )}
                      {type === "Recibo" && relatedInvoiceId && reciboConceptForForm.hasLinkedNc && (
                        <div
                          style={{
                            padding: "0.75rem 1rem",
                            backgroundColor: "rgba(59, 130, 246, 0.2)",
                            border: "1px solid rgba(96, 165, 250, 0.5)",
                            borderRadius: "10px",
                            marginBottom: "1rem",
                          }}
                        >
                          <small style={{ fontWeight: "bold", color: "#e0f2fe", lineHeight: 1.45, display: "block" }}>
                            Importante: hay nota(s) de crédito aplicada(s) a la factura. El sistema calcula el saldo pendiente; el PDF del recibo incluirá el{" "}
                            <strong>concepto de pago</strong> y el detalle de <strong>liquidación</strong> (no se repite el listado completo de ítems de la
                            factura). Los importes y totales siguen alineados con la cuenta corriente.
                          </small>
                        </div>
                      )}

                      <div className="fact-detail-servicios-table-wrap">
                  <table className="fact-table fact-table-hosting fact-detail-servicios-table">
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th className="fact-cell-center">Mes</th>
                        <th className="fact-cell-center fact-col-cantidad">CANTIDAD</th>
                        <th className="fact-cell-center">PRECIO X EQ</th>
                        <th className="fact-cell-center">DTO x EQ</th>
                        <th className="fact-cell-center">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="fact-detail-servicios-empty">
                            <span className="fact-detail-servicios-empty-icon">📋</span>
                            <p className="fact-detail-servicios-empty-text">
                              {type === "Nota de Crédito" && !relatedInvoiceId
                                ? "Seleccioná una factura a cancelar en el panel izquierdo para cargar los ítems."
                                : "Agregá tu primer ítem para armar la factura."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        items.map((it, idx) => {
                          const is4Pct = it.serviceKey === "D";
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
                                    maxWidth: "100%",
                                    backgroundColor: itemsLocked ? "#f3f4f6" : "white",
                                    cursor: itemsLocked ? "not-allowed" : "pointer",
                                    opacity: itemsLocked ? 0.7 : 1
                                  }}
                                  value={it.serviceKey || ""}
                                  onChange={(e) => {
                                    if (itemsLocked) return;
                                    const key = e.target.value as LineItem["serviceKey"];
                                    if (key && serviceCatalog[key]) {
                                      const def = serviceCatalog[key];
                                      updateItem(idx, { serviceKey: key, serviceName: def.name, price: def.price, discount: key === "D" ? 0 : it.discount });
                                    }
                                  }}
                                  disabled={itemsLocked}
                                >
                                  <option value="A">{serviceCatalog.A.name}</option>
                                  <option value="B">{serviceCatalog.B.name}</option>
                                  <option value="C">{serviceCatalog.C.name}</option>
                                  <option value="D">{serviceCatalog.D.name}</option>
                                </select>
                              </td>
                              <td className="fact-cell-center">
                                <select
                                  className="fact-select"
                                  value={/^\d{4}-\d{2}$/.test(it.month || "") ? it.month : currentMonthValue()}
                                  onChange={(e) => {
                                    if (itemsLocked) return;
                                    updateItem(idx, { month: e.target.value });
                                  }}
                                  style={{
                                    width: "100%",
                                    maxWidth: "100%",
                                    padding: "0.4rem 0.5rem",
                                    fontSize: "0.8125rem",
                                    backgroundColor: itemsLocked ? "#f3f4f6" : "white",
                                    cursor: itemsLocked ? "not-allowed" : "pointer",
                                    opacity: itemsLocked ? 0.7 : 1
                                  }}
                                  disabled={itemsLocked}
                                >
                                  {OPCIONES_MES.map((op) => (
                                    <option key={op.value} value={op.value}>{op.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="fact-cell-center fact-col-cantidad">
                                <input
                                  type="number"
                                  className="fact-input"
                                  style={{ 
                                    padding: "0.4rem 0.35rem", 
                                    fontSize: "0.8125rem", 
                                    width: "100%",
                                    maxWidth: "100%",
                                    textAlign: "center",
                                    boxSizing: "border-box",
                                    backgroundColor: itemsLocked || is4Pct ? "#f3f4f6" : "white",
                                    cursor: itemsLocked || is4Pct ? "not-allowed" : "text",
                                    opacity: itemsLocked ? 0.7 : 1
                                  }}
                                  min={1}
                                  value={it.quantity}
                                  onChange={(e) => {
                                    if (itemsLocked || is4Pct) return;
                                    updateItem(idx, { quantity: Math.max(1, Number(e.target.value || 1)) });
                                  }}
                                  readOnly={itemsLocked || is4Pct}
                                  disabled={itemsLocked || is4Pct}
                                  title={is4Pct ? "Cantidad fija para el 4%" : undefined}
                                />
                              </td>
                              <td className="fact-cell-center">
                                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", width: "100%" }}>
                                  <input
                                    type="number"
                                    className="fact-input"
                                    value={it.price}
                                    onChange={(e) => {
                                      if (itemsLocked || is4Pct) return;
                                      updateItem(idx, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) });
                                    }}
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      padding: "0.4rem 0.35rem",
                                      fontSize: "0.8125rem",
                                      textAlign: "center",
                                      boxSizing: "border-box",
                                      backgroundColor: itemsLocked || is4Pct ? "#f3f4f6" : "white",
                                      cursor: itemsLocked || is4Pct ? "not-allowed" : "text",
                                      opacity: itemsLocked ? 0.7 : 1
                                    }}
                                    min={0}
                                    step={1}
                                    readOnly={itemsLocked || is4Pct}
                                    disabled={itemsLocked || is4Pct}
                                    title={is4Pct ? "4% solo sobre el valor de la fila de arriba (alojamiento), no sobre el total" : undefined}
                                  />
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", flexShrink: 0 }}>USD</span>
                                </div>
                              </td>
                              <td className="fact-cell-center">
                                <input
                                  type="number"
                                  className="fact-input"
                                  style={{ 
                                    padding: "0.4rem 0.35rem", 
                                    fontSize: "0.8125rem", 
                                    width: "100%",
                                    maxWidth: "100%",
                                    textAlign: "center",
                                    boxSizing: "border-box",
                                    backgroundColor: itemsLocked || is4Pct ? "#f3f4f6" : "white",
                                    cursor: itemsLocked || is4Pct ? "not-allowed" : "text",
                                    opacity: itemsLocked ? 0.7 : 1
                                  }}
                                  min={0}
                                  value={it.discount}
                                  onChange={(e) => {
                                    if (itemsLocked || is4Pct) return;
                                    updateItem(idx, { discount: Math.max(0, Number(e.target.value || 0)) });
                                  }}
                                  readOnly={itemsLocked || is4Pct}
                                  disabled={itemsLocked || is4Pct}
                                  title={is4Pct ? "No aplica descuento" : undefined}
                                />
                              </td>
                              <td className="fact-cell-center fact-cell-total">
                                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", width: "100%" }}>
                                  <input readOnly value={formatCurrencyNumber(lineTotal)} className="fact-detail-servicios-input-total" style={{ flex: 1, minWidth: 0 }} />
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", flexShrink: 0 }}>USD</span>
                                </div>
                              </td>
                              <td className="fact-cell-center">
                                <button 
                                  type="button" 
                                  className="fact-detail-servicios-btn-remove" 
                                  onClick={() => {
                                    if (itemsLocked) return;
                                    removeItem(idx);
                                  }} 
                                  title={itemsLocked ? "No se pueden eliminar ítems cuando vienen de una factura relacionada" : "Quitar ítem"}
                                  disabled={itemsLocked}
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

                      {type === "Nota de Crédito" && relatedInvoiceId && isPartialCreditNote && (
                        <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.25)", paddingTop: "1rem" }}>
                          <div className="fact-detail-servicios-header" style={{ marginBottom: "0.75rem" }}>
                            <h2 className="fact-detail-servicios-title" style={{ fontSize: "1.05rem" }}>
                              <span style={{ fontSize: "1.1em", lineHeight: 1 }}>✍️</span> Detalle manual NC parcial
                            </h2>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                              <button
                                type="button"
                                className="fact-detail-servicios-btn-clear"
                                onClick={() => setPartialCreditItems([])}
                                disabled={partialCreditItems.length === 0}
                                title={partialCreditItems.length === 0 ? "No hay ítems manuales para borrar" : "Vaciar ítems manuales NC"}
                              >
                                🗑️ Borrar
                              </button>
                              <button
                                type="button"
                                className="fact-detail-servicios-btn-add"
                                onClick={addPartialCreditItem}
                              >
                                + Agregar ítem
                              </button>
                            </div>
                          </div>

                          <div className="fact-detail-servicios-table-wrap">
                            <table className="fact-table fact-table-hosting fact-detail-servicios-table">
                              <thead>
                                <tr>
                                  <th>Servicio</th>
                                  <th className="fact-cell-center">Mes</th>
                                  <th className="fact-cell-center fact-col-cantidad">CANTIDAD</th>
                                  <th className="fact-cell-center">PRECIO X EQ</th>
                                  <th className="fact-cell-center">DTO x EQ</th>
                                  <th className="fact-cell-center">Total</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {partialCreditItems.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="fact-detail-servicios-empty">
                                      <span className="fact-detail-servicios-empty-icon">✍️</span>
                                      <p className="fact-detail-servicios-empty-text">
                                        Agregá ítems manuales para definir el descuento parcial de la Nota de Crédito.
                                      </p>
                                    </td>
                                  </tr>
                                ) : (
                                  partialCreditItems.map((it, idx) => {
                                    const lineTotal = (it.price - it.discount) * it.quantity;
                                    return (
                                      <tr key={`partial-${idx}`}>
                                        <td>
                                          <select
                                            className="fact-select"
                                            style={{ padding: "0.4rem 0.5rem", fontSize: "0.8125rem", width: "100%", maxWidth: "100%" }}
                                            value={it.serviceKey || ""}
                                            onChange={(e) => {
                                              const key = e.target.value as LineItem["serviceKey"];
                                              if (key && serviceCatalog[key]) {
                                                const def = serviceCatalog[key];
                                                updatePartialCreditItem(idx, { serviceKey: key, serviceName: def.name, price: def.price });
                                              }
                                            }}
                                          >
                                            <option value="A">{serviceCatalog.A.name}</option>
                                            <option value="B">{serviceCatalog.B.name}</option>
                                            <option value="C">{serviceCatalog.C.name}</option>
                                            <option value="D">{serviceCatalog.D.name}</option>
                                          </select>
                                        </td>
                                        <td className="fact-cell-center">
                                          <select
                                            className="fact-select"
                                            value={/^\d{4}-\d{2}$/.test(it.month || "") ? it.month : currentMonthValue()}
                                            onChange={(e) => updatePartialCreditItem(idx, { month: e.target.value })}
                                            style={{ width: "100%", maxWidth: "100%", padding: "0.4rem 0.5rem", fontSize: "0.8125rem" }}
                                          >
                                            {OPCIONES_MES.map((op) => (
                                              <option key={op.value} value={op.value}>{op.label}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="fact-cell-center fact-col-cantidad">
                                          <input
                                            type="number"
                                            className="fact-input"
                                            style={{ padding: "0.4rem 0.35rem", fontSize: "0.8125rem", width: "100%", maxWidth: "100%", textAlign: "center", boxSizing: "border-box" }}
                                            min={1}
                                            value={it.quantity}
                                            onChange={(e) => updatePartialCreditItem(idx, { quantity: Math.max(1, Number(e.target.value || 1)) })}
                                          />
                                        </td>
                                        <td className="fact-cell-center">
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", width: "100%" }}>
                                            <input
                                              type="number"
                                              className="fact-input"
                                              value={it.price}
                                              onChange={(e) => updatePartialCreditItem(idx, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                              style={{ flex: 1, minWidth: 0, padding: "0.4rem 0.35rem", fontSize: "0.8125rem", textAlign: "center", boxSizing: "border-box" }}
                                              min={0}
                                              step={1}
                                            />
                                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", flexShrink: 0 }}>USD</span>
                                          </div>
                                        </td>
                                        <td className="fact-cell-center">
                                          <input
                                            type="number"
                                            className="fact-input"
                                            style={{ padding: "0.4rem 0.35rem", fontSize: "0.8125rem", width: "100%", maxWidth: "100%", textAlign: "center", boxSizing: "border-box" }}
                                            min={0}
                                            value={it.discount}
                                            onChange={(e) => updatePartialCreditItem(idx, { discount: Math.max(0, Number(e.target.value || 0)) })}
                                          />
                                        </td>
                                        <td className="fact-cell-center fact-cell-total">
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", width: "100%" }}>
                                            <input readOnly value={formatCurrencyNumber(lineTotal)} className="fact-detail-servicios-input-total" style={{ flex: 1, minWidth: 0 }} />
                                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", flexShrink: 0 }}>USD</span>
                                          </div>
                                        </td>
                                        <td className="fact-cell-center">
                                          <button
                                            type="button"
                                            className="fact-detail-servicios-btn-remove"
                                            onClick={() => removePartialCreditItem(idx)}
                                            title="Quitar ítem manual de NC parcial"
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
                        </div>
                      )}

                      {activeItems.length > 0 && (
                        <div className="fact-detail-servicios-summary">
                          <div className="fact-summary-cards">
                            <div className="fact-summary-card fact-summary-card--sub">
                              <span className="fact-summary-card-label">Subtotal</span>
                              <span className="fact-summary-card-value">{formatCurrencyNumber(displaySummary.subtotal)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                            <div className="fact-summary-card fact-summary-card--disc">
                              <span className="fact-summary-card-label">Descuentos</span>
                              <span className="fact-summary-card-value">− {formatCurrencyNumber(displaySummary.discounts)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                            <div className="fact-summary-card fact-summary-card--total">
                              <span className="fact-summary-card-label">
                                {displaySummary.showPendingNote ? "Total a cobrar" : "Total"}
                              </span>
                              <span className="fact-summary-card-value">{formatCurrencyNumber(displaySummary.total)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                          </div>
                          {displaySummary.showPendingNote ? (
                            <div
                              className="fact-recibo-nc-adjust"
                              role="region"
                              aria-label="Desglose: neto de líneas, descuentos por documentos previos y total del recibo"
                            >
                              <span className="fact-recibo-nc-adjust__label">Neto de líneas (como en la factura)</span>
                              <span className="fact-recibo-nc-adjust__value">
                                {formatCurrencyNumber(displaySummary.invoiceNetLines)} USD
                              </span>
                              <span className="fact-recibo-nc-adjust__label">Menos NC y recibos previos</span>
                              <span className="fact-recibo-nc-adjust__value">
                                − {formatCurrencyNumber(displaySummary.creditApplied + displaySummary.paidApplied)} USD
                              </span>
                              <span className="fact-recibo-nc-adjust__label">Total de este recibo</span>
                              <span className="fact-recibo-nc-adjust__value fact-recibo-nc-adjust__value--emph">
                                {formatCurrencyNumber(displaySummary.total)} USD
                              </span>
                            </div>
                          ) : null}
                          <button type="button" className="fact-detail-servicios-btn-emitir" onClick={handleClickEmitir}>
                            📄 Emitir documento
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Documentos emitidos en esta sesión (solo últimos 24 h); el resto sigue en Historial/Pendientes */}
                {emittedInLast24h.length > 0 && (
                  <div className="fact-emitted-section">
                    <h3 className="fact-section-title" style={{ marginTop: "2rem", marginBottom: "1rem" }}>
                      📄 Documentos Emitidos
                    </h3>
                    <div className="fact-table-wrap">
                      <table className="fact-table fact-emitted-table fact-emitted-table--7col" style={{ tableLayout: "auto", width: "100%", minWidth: "980px" }}>
                        <thead className="fact-emitted-thead">
                          <tr>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Tipo</th>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Número</th>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Cliente</th>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Fecha<br />emisión</th>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Hora<br />emisión</th>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Total</th>
                            <th style={{ borderLeft: "1px solid #2D5D46", borderRight: "1px solid #2D5D46" }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...emittedInLast24h].reverse().map((item) => {
                            const inv = item.invoice;
                            return (
                              <tr key={item.invoice.id}>
                                <td>
                                  {inv.type === "Nota de Crédito" ? "Nota C." : inv.type}
                                  {inv.type === "Recibo" && " "}
                                  {(inv.type === "Factura" || inv.type === "Recibo" || inv.type === "Nota de Crédito") && (Date.now() - new Date(item.emittedAt).getTime() < MS_22H) && (
                                    <span
                                      style={{
                                        marginLeft: "0.35rem",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "1.2rem",
                                        height: "1.2rem",
                                        borderRadius: "50%",
                                        backgroundColor: "#ff9800",
                                        fontSize: "0.7rem",
                                        lineHeight: 1
                                      }}
                                      title={inv.type}
                                    >
                                      🔖
                                    </span>
                                  )}
                                </td>
                                <td className="fw-bold">{inv.number}</td>
                                <td>{inv.clientName}</td>
                                <td>{inv.date}</td>
                                <td>{inv.emissionTime ?? "-"}</td>
                                <td style={{ textAlign: "left" }}>{formatUSD(inv.total)}</td>
                                <td className="text-center">
                                  <div className="d-flex gap-1 justify-content-center flex-wrap">
                                    <button
                                      type="button"
                                      className="btn btn-sm border"
                                      onClick={() => viewEmittedInPreview(item)}
                                      title="Visualizar"
                                      style={{ width: "1.3rem", height: "1.3rem", padding: 0, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, backgroundColor: "#fff9c4", color: "#5d4037", borderColor: "#d4c44a" }}
                                    >
                                      👁️
                                    </button>
                                    <button
                                      type="button"
                                      className="fact-btn fact-btn-primary btn-sm"
                                      onClick={() => downloadEmittedPdf(item)}
                                      title="Descargar PDF"
                                      style={{ width: "1.3rem", height: "1.3rem", padding: 0, fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                    >
                                      📄
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="fact-emitted-count d-flex align-items-center gap-2 flex-wrap">
                      <span className="fact-emitted-count-badge">
                        <span className="fact-emitted-count-num">{emittedInLast24h.length}</span>
                        <span className="fact-emitted-count-label">
                          {emittedInLast24h.length === 1 ? "Documento" : "Documentos"}
                        </span>
                        <span className="fact-emitted-count-period"> emitidos en los últimos 10 días</span>
                      </span>
                      <Link
                        to="/hosting/email-flow"
                        className="fact-emitted-monitor-btn"
                      >
                        ✉️ Monitor
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Vista previa: documento emitido (Visualizar) o comprobante en edición */}
            <div className="fact-panel-vista-previa">
              <div className="fact-panel-vista-previa-header"><span style={{ fontSize: "1.25em", lineHeight: 1 }}>🔍</span> Vista previa</div>
              <div className="fact-panel-vista-previa-body">
                <div className="fact-panel-vista-previa-inner">
                  {previewEmitted ? (
                    <InvoicePreview
                      type={previewEmitted.invoice.type}
                      number={previewEmitted.invoice.number}
                      client={{
                        code: "",
                        name: previewEmitted.invoice.clientName,
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
                      items={previewEmitted.invoice.items}
                      subtotal={previewEmitted.invoice.subtotal}
                      discounts={previewEmitted.invoice.discounts}
                      total={previewEmitted.invoice.total}
                      dueDateDays={dueDateDays}
                      relatedInvoiceNumber={previewEmitted.invoice.relatedInvoiceNumber}
                      creditNoteMode={
                        previewEmitted.invoice.type === "Nota de Crédito"
                          ? (() => {
                              const related = invoicesAll.find(
                                (i) =>
                                  i.type === "Factura" &&
                                  (i.number === previewEmitted.invoice.relatedInvoiceNumber ||
                                    String(i.id) === String(previewEmitted.invoice.relatedInvoiceId ?? ""))
                              );
                              if (!related) return undefined;
                              return Math.abs(Math.abs(previewEmitted.invoice.total) - Math.abs(related.total)) < 0.0001
                                ? "total"
                                : "partial";
                            })()
                          : undefined
                      }
                      reciboConceptText={
                        previewEmitted.invoice.type === "Recibo" && reciboHasSettlementRows(previewEmitted.invoice.items)
                          ? (() => {
                              const f = invoicesAll.find(
                                (i) =>
                                  i.type === "Factura" &&
                                  (String(i.id) === String(previewEmitted.invoice.relatedInvoiceId ?? "") ||
                                    (previewEmitted.invoice.relatedInvoiceNumber != null &&
                                      i.number === previewEmitted.invoice.relatedInvoiceNumber))
                              );
                              return f
                                ? buildReciboConceptLine(
                                    getReciboConceptParts(f, invoicesAll, { excludeReciboId: String(previewEmitted.invoice.id) })
                                  )
                                : undefined;
                            })()
                          : undefined
                      }
                    />
                  ) : selectedClient && activeItems.length > 0 ? (
                    <InvoicePreview
                      type={type}
                      number={number}
                      client={selectedClient}
                      date={new Date()}
                      items={displaySummary.previewItems}
                      subtotal={displaySummary.previewSubtotal}
                      discounts={displaySummary.previewDiscounts}
                      total={displaySummary.previewTotal}
                      dueDateDays={dueDateDays}
                      relatedInvoiceNumber={
                        type === "Nota de Crédito"
                          ? invoicesAll.find((i) => String(i.id) === String(relatedInvoiceId))?.number
                          : undefined
                      }
                      creditNoteMode={
                        type === "Nota de Crédito"
                          ? isPartialCreditNote
                            ? "partial"
                            : "total"
                          : undefined
                      }
                      reciboConceptText={
                        type === "Recibo" && reciboConceptForForm.line && reciboHasSettlementRows(displaySummary.previewItems)
                          ? reciboConceptForForm.line
                          : undefined
                      }
                    />
                  ) : selectedClient ? (
                    <div className="fact-panel-vista-previa-empty">
                      <p className="fact-panel-vista-previa-empty-text" style={{ marginBottom: "0.5rem" }}>
                        <strong>{type}</strong> {number}
                      </p>
                      <p className="fact-panel-vista-previa-empty-text" style={{ marginBottom: "0.25rem" }}>
                        Cliente: {selectedClient.name}
                      </p>
                      <p className="fact-panel-vista-previa-empty-text">
                        Vencimiento: {dueDateDays} días
                      </p>
                      <p className="fact-panel-vista-previa-empty-text" style={{ marginTop: "0.75rem", fontSize: "0.9em", opacity: 0.85 }}>
                        Agregá ítems en «Detalle de servicios» para ver la vista previa completa.
                      </p>
                    </div>
                  ) : (
                    <div className="fact-panel-vista-previa-empty">
                      <span className="fact-panel-vista-previa-empty-icon" aria-hidden>📄</span>
                      <p className="fact-panel-vista-previa-empty-text">No hay documento</p>
                      <p className="fact-panel-vista-previa-empty-text" style={{ fontSize: "0.9em", marginTop: "0.5rem" }}>Seleccioná un cliente y agregá ítems.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
      <ConfirmModal
        open={showEmitPdfConfirm}
        title="Emitir documento"
        message="¿Desea descargar el documento en PDF?"
        confirmLabel="Sí"
        cancelLabel="No"
        variant="info"
        onConfirm={() => performEmit(true)}
        onCancel={() => performEmit(false)}
      />
    </div>
  );
}
