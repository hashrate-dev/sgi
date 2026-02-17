import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";
import { addEmittedDocument, createInvoice, getClients, getEmittedDocuments, getNextInvoiceNumber } from "../lib/api";
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
    type === "Factura" ? "F" : 
    type === "Recibo" ? "RC" : 
    "N"; // Nota de Crédito
  // Filtrar facturas que empiecen con el prefijo (F incluye FC por compatibilidad con datos antiguos)
  const filtered = invoices.filter((i) => 
    i.number.startsWith(prefix + "-") || i.number.startsWith(prefix)
  );
  const next =
    filtered.length === 0
      ? 1001
      : Math.max(
          ...filtered.map((i) => {
            // Extraer el número: puede ser "F-1001" o "F1001", "FC1001" (legacy), etc.
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
  return `${prefix}${String(next).padStart(6, "0")}`;
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

export function FacturacionPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [type, setType] = useState<ComprobanteType>("Factura");
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | "">("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [relatedInvoiceId, setRelatedInvoiceId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [itemsLocked, setItemsLocked] = useState(false); // Indica si los items están bloqueados por venir de factura relacionada
  /** Días para fecha de vencimiento (5, 6 o 7). Por defecto 6. */
  const [dueDateDays, setDueDateDays] = useState<5 | 6 | 7>(6);

  const [invoices, setInvoices] = useState<Invoice[]>(() => loadInvoices());
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
    if (location.pathname !== "/facturacion-hosting") return;
    fetchEmittedHosting();
  }, [location.pathname]);

  /** Refrescar lista al volver a esta pestaña (p. ej. después de borrar en Historial) */
  useEffect(() => {
    if (location.pathname !== "/facturacion-hosting") return;
    const onFocus = () => fetchEmittedHosting();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [location.pathname]);

  useEffect(() => {
    getClients()
      .then((r) => setClients((r.clients ?? []) as Client[]))
      .catch(() => setClients([]));
  }, []);

  /** Vista previa: pedir siguiente número sin consumir (peek) para no gastar números al solo abrir la página */
  useEffect(() => {
    setNextNumFromApi(null);
    getNextInvoiceNumber(type, { peek: true })
      .then((r) => setNextNumFromApi(r.number))
      .catch(() => setNextNumFromApi(""));
  }, [type]);

  const number = useMemo(
    () => (nextNumFromApi !== null && nextNumFromApi !== "" ? nextNumFromApi : nextNumber(type, invoices)),
    [type, invoices, nextNumFromApi]
  );
  const totals = useMemo(() => calcTotals(items), [items]);

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
      setItemsLocked(false);
    }
  }, [type]);

  // Limpiar factura relacionada cuando cambia el cliente
  useEffect(() => {
    setRelatedInvoiceId("");
    setItems([]);
    setItemsLocked(false);
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
      const relatedInvoice = invoices.find((inv) => inv.id === relatedInvoiceId);
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
        showToast(`La factura ${relatedInvoice.number} no tiene ítems cargados.`, "warning");
        setItemsLocked(false);
      }
    } else {
      setItemsLocked(false);
    }
  }, [relatedInvoiceId, type, selectedClient, invoices]);

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

  function exportExcel() {
    const hist = loadInvoices();
    if (hist.length === 0) return;
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "-");
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
    wb.xlsx.writeBuffer().then((buf) => saveAs(new Blob([buf]), `HRS-Historial-Hosting-${fecha}.xlsx`));
  }

  function handleClickEmitir() {
    if (!selectedClient) {
      showToast("Debe seleccionar un cliente válido.", "error");
      return;
    }
    if (type === "Nota de Crédito" && !relatedInvoiceId) {
      showToast("Debe seleccionar una factura a cancelar para la Nota de Crédito.", "error");
      return;
    }
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
    if (totals.total === 0) {
      showToast("Hay que llenar los campos para emitir el documento. El total no puede ser cero.", "error");
      return;
    }
    if (items.some((it) => !it.month)) {
      showToast("Por favor, indique el mes para todos los ítems.", "warning");
      return;
    }
    setShowEmitPdfConfirm(true);
  }

  async function performEmit(downloadPdf: boolean) {
    setShowEmitPdfConfirm(false);
    if (!selectedClient) return;

    if (downloadPdf) showToast("Generando factura PDF...", "info");

    let numberToUse = number;
    try {
      const res = await getNextInvoiceNumber(type);
      numberToUse = res.number;
    } catch {
      //
    }

    const { subtotal, discounts, total } = calcTotals(items);
    const dateNow = new Date();
    const dateStr = todayLocale();
    const emissionTime = getCurrentTime();
    const month = items[0]!.month;
    const dueDate = new Date(dateNow);
    dueDate.setDate(dueDate.getDate() + dueDateDays);
    const dueDateStr = dueDate.toLocaleDateString();

    if (downloadPdf) {
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
          items,
          subtotal,
          discounts,
          total,
          dueDateDays
        },
        { logoBase64 }
      );
      const safeName = selectedClient.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
      doc.save(`${numberToUse}_${safeName}.pdf`);
      const tipoMensaje = type === "Factura" ? "Factura" : type === "Recibo" ? "Recibo" : "Nota de Crédito";
      showToast(`${tipoMensaje} generada y guardada correctamente.`, "success");
    } else {
      const tipoMensaje = type === "Factura" ? "Factura" : type === "Recibo" ? "Recibo" : "Nota de Crédito";
      showToast(`${tipoMensaje} registrada correctamente.`, "success");
    }

    const relatedInvoice = relatedInvoiceId ? invoices.find((inv) => inv.id === relatedInvoiceId) : null;
    /** Contable: Recibo y Nota de Crédito con montos en negativo (anulan factura). */
    const isNegativeType = type === "Recibo" || type === "Nota de Crédito";
    const finalSubtotal = isNegativeType ? -(Math.abs(subtotal)) : subtotal;
    const finalDiscounts = isNegativeType ? -(Math.abs(discounts)) : discounts;
    const finalTotal = isNegativeType ? -(Math.abs(total)) : total;

    const apiBody = {
      number: numberToUse,
      type,
      clientName: selectedClient.name,
      date: dateStr,
      month,
      subtotal: finalSubtotal,
      discounts: finalDiscounts,
      total: finalTotal,
      items: items.map((it) => ({
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
    try {
      await createInvoice(apiBody);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.includes("already exists")) {
        showToast("Este número de documento ya existe en la base de datos. No se guardó.", "error");
      } else if (msg.includes("Invalid body") || msg.includes("Invalid")) {
        showToast("Datos rechazados por el servidor. Revisá que todos los ítems tengan mes (YYYY-MM) y valores válidos.", "error");
      } else {
        showToast("No se pudo guardar en la base de datos. Revisá la conexión.", "error");
      }
      return;
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
      items,
      relatedInvoiceId: relatedInvoice?.id,
      relatedInvoiceNumber: relatedInvoice?.number
    };
    const hist = loadInvoices();
    hist.push(inv);
    saveInvoices(hist);
    setInvoices(loadInvoices());
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
    setRelatedInvoiceId("");
    setPaymentDate("");
    setItemsLocked(false);
    getNextInvoiceNumber(type, { peek: true }).then((r) => setNextNumFromApi(r.number)).catch(() => setNextNumFromApi(""));
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
        dueDate: parseDueDateStr(inv.dueDate ?? "")
      },
      { logoBase64 }
    );
    const safeName = inv.clientName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
    doc.save(`${inv.number}_${safeName}.pdf`);
    showToast(`PDF ${inv.number} descargado.`, "success");
  }

  /** Mostrar documento emitido en la vista previa de abajo (sin abrir enlace) */
  function viewEmittedInPreview(item: { invoice: Invoice; emittedAt: string }) {
    setPreviewEmitted(item);
  }

  /** Limpiar vista previa de documento emitido cuando el usuario edita el formulario */
  useEffect(() => {
    setPreviewEmitted(null);
  }, [type, selectedClientId, items]);

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
                            disabled={itemsLocked || (type === "Nota de Crédito" && !relatedInvoiceId)}
                            title={itemsLocked ? "Los detalles están bloqueados" : "Vaciar lista de ítems"}
                          >
                            🗑️ Borrar
                          </button>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-add"
                            onClick={exportExcel}
                            title="Exportar a Excel"
                          >
                            📊 Exportar Excel
                          </button>
                          <button
                            type="button"
                            className="fact-detail-servicios-btn-add"
                            onClick={addItem}
                            disabled={itemsLocked || (type === "Nota de Crédito" && !relatedInvoiceId)}
                            title={itemsLocked ? "Los detalles están bloqueados porque vienen de una factura relacionada" : type === "Nota de Crédito" && !relatedInvoiceId ? "Primero debe seleccionar una factura a cancelar" : (type === "Recibo" || type === "Nota de Crédito") && relatedInvoiceId ? "Los ítems se cargaron desde la factura relacionada" : ""}
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
                            ✓ Nota de Crédito seleccionada para cancelar la factura correspondiente.
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

                      {items.length > 0 && (
                        <div className="fact-detail-servicios-summary">
                          <div className="fact-summary-cards">
                            <div className="fact-summary-card fact-summary-card--sub">
                              <span className="fact-summary-card-label">Subtotal</span>
                              <span className="fact-summary-card-value">{formatCurrencyNumber(totals.subtotal)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                            <div className="fact-summary-card fact-summary-card--disc">
                              <span className="fact-summary-card-label">Descuentos</span>
                              <span className="fact-summary-card-value">− {formatCurrencyNumber(totals.discounts)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                            <div className="fact-summary-card fact-summary-card--total">
                              <span className="fact-summary-card-label">Total</span>
                              <span className="fact-summary-card-value">{formatCurrencyNumber(totals.total)}</span>
                              <span className="fact-summary-card-currency">USD</span>
                            </div>
                          </div>
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
                      <table className="fact-table fact-emitted-table fact-emitted-table--7col" style={{ tableLayout: "fixed", width: "100%", minWidth: "640px" }}>
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
                        to="/hosting/control-documentos-cobros"
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
                    />
                  ) : selectedClient && items.length > 0 ? (
                    <InvoicePreview
                      type={type}
                      number={number}
                      client={selectedClient}
                      date={new Date()}
                      items={items}
                      subtotal={totals.subtotal}
                      discounts={totals.discounts}
                      total={totals.total}
                      dueDateDays={dueDateDays}
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
