import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { deleteAllInvoices, deleteEmittedDocumentOne, deleteEmittedDocumentsAll, deleteInvoice, getClients, getInvoices, verifyPassword, wakeUpBackend } from "../lib/api";
import { dispatchEmittedChanged } from "../lib/emittedEvents";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { loadInvoicesAsic, saveInvoicesAsic } from "../lib/storage";
import type { ComprobanteType, Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteHistorial, canExport } from "../lib/auth";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

// Función auxiliar para encontrar columna en Excel por nombres posibles
function findCol(headerRow: (string | number)[], ...names: string[]): number {
  for (let i = 1; i < headerRow.length; i++) {
    const h = String(headerRow[i] || "").trim().toLowerCase();
    for (const k of names) {
      if (h === k || h.includes(k) || k.includes(h)) return i;
    }
  }
  return -1;
}

// Parsear Excel de facturas (mismo formato que exportExcel)
async function parseExcelInvoices(file: File): Promise<Invoice[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: (string | number)[][] = [];
  sheet.eachRow((row) => rows.push(row.values as (string | number)[]));
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  const idx = {
    number: findCol(headerRow, "número", "numero", "number", "n°"),
    type: findCol(headerRow, "tipo", "type"),
    clientName: findCol(headerRow, "cliente", "clientname", "client"),
    date: findCol(headerRow, "fecha emisión", "fecha emision", "date", "fecha"),
    emissionTime: findCol(headerRow, "hora emisión", "hora emision", "emissiontime", "hora"),
    dueDate: findCol(headerRow, "fecha vencimiento", "duedate", "vencimiento"),
    paymentDate: findCol(headerRow, "fecha pago", "paymentdate", "pago"),
    month: findCol(headerRow, "mes", "month"),
    subtotal: findCol(headerRow, "total (s/desc)", "subtotal", "total s/desc"),
    discounts: findCol(headerRow, "descuento", "discounts", "discount"),
    total: findCol(headerRow, "total", "total final")
  };

  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";
  const getNum = (row: (string | number)[], i: number): number => {
    const val = get(row, i);
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^\d.-]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const result: Invoice[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const number = idx.number >= 0 ? get(row, idx.number) : get(row, 1);
    const type = idx.type >= 0 ? get(row, idx.type) : get(row, 2);
    if (!number || !type) continue;

    const clientName = idx.clientName >= 0 ? get(row, idx.clientName) : get(row, 3);
    const date = idx.date >= 0 ? get(row, idx.date) : get(row, 4);
    const emissionTime = idx.emissionTime >= 0 ? get(row, idx.emissionTime) : undefined;
    const dueDate = idx.dueDate >= 0 ? get(row, idx.dueDate) : undefined;
    const paymentDate = idx.paymentDate >= 0 ? get(row, idx.paymentDate) : undefined;
    const month = idx.month >= 0 ? get(row, idx.month) : get(row, 8);
    const subtotal = idx.subtotal >= 0 ? getNum(row, idx.subtotal) : getNum(row, 9);
    const discounts = idx.discounts >= 0 ? getNum(row, idx.discounts) : getNum(row, 10);
    const total = idx.total >= 0 ? getNum(row, idx.total) : getNum(row, 11);

    // Validar tipo
    const validType = type === "Factura" || type === "Recibo" || type === "Nota de Crédito" ? type : "Factura";
    
    // Generar ID único
    const id = `${validType}-${number}-${Date.now()}-${r}`;

    // Parsear mes (si viene como YYYY-MM o necesita conversión)
    let monthFormatted = month;
    if (month && !month.match(/^\d{4}-\d{2}$/)) {
      // Intentar convertir formato DD/MM/YYYY o MM/YYYY a YYYY-MM
      const parts = month.split("/");
      if (parts.length === 2) {
        monthFormatted = `${parts[1]}-${parts[0].padStart(2, "0")}`;
      } else if (parts.length === 3) {
        monthFormatted = `${parts[2]}-${parts[1].padStart(2, "0")}`;
      }
    }

    result.push({
      id,
      number,
      type: validType as ComprobanteType,
      clientName: clientName || "Sin cliente",
      date: date || new Date().toLocaleDateString(),
      emissionTime: emissionTime || undefined,
      dueDate: dueDate || undefined,
      paymentDate: paymentDate && paymentDate !== "Pendiente" && paymentDate !== "-" ? paymentDate : undefined,
      month: monthFormatted || new Date().toISOString().slice(0, 7),
      subtotal: Math.abs(subtotal),
      discounts: Math.abs(discounts),
      total: Math.abs(total),
      items: [] // Items vacíos por defecto, se pueden editar después
    });
  }
  return result;
}

// Función para calcular fecha de vencimiento desde fecha de emisión
function calculateDueDate(dateStr: string): string {
  try {
    // Intentar parsear la fecha (puede estar en formato DD/MM/YYYY o MM/DD/YYYY)
    let date: Date;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        // Asumir formato DD/MM/YYYY
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Los meses en Date son 0-indexed
        const year = parseInt(parts[2], 10);
        date = new Date(year, month, day);
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = new Date(dateStr);
    }
    
    // Validar que la fecha sea válida
    if (isNaN(date.getTime())) {
      return "-";
    }
    
    // Sumar 7 días
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate.toLocaleDateString();
  } catch {
    return "-";
  }
}

export function HistorialMineriaPage() {
  const { user } = useAuth();
  const [all, setAll] = useState<Invoice[]>(() => loadInvoicesAsic());
  const [qClient, setQClient] = useState("");
  const [qType, setQType] = useState<"" | ComprobanteType>("");
  const [qMonth, setQMonth] = useState("");
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [deleteConfirmInv, setDeleteConfirmInv] = useState<Invoice | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearConfirm2, setShowClearConfirm2] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearPasswordError, setClearPasswordError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [passwordAttempts, setPasswordAttempts] = useState(0);
  const MAX_PASSWORD_ATTEMPTS = 3;
  const canDelete = user ? canDeleteHistorial(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;

  /** Cargar desde API cuando el backend está disponible (para Lector y todos: ver datos agregados por otros usuarios) */
  useEffect(() => {
    let cancelled = false;
    const doFetch = () => {
      wakeUpBackend().then(() => {
        if (cancelled) return;
        getInvoices({ source: "asic" })
          .then((r) => {
            if (cancelled) return;
            const list = (r.invoices ?? []).map((inv) => ({
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
              items: []
            }));
            setAll(list);
          })
          .catch(() => {});
      });
    };
    doFetch();
    const onVisible = () => { if (document.visibilityState === "visible") doFetch(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return all.filter((inv) => {
      const okClient = !client || inv.clientName.toLowerCase().includes(client);
      const okType = !qType || inv.type === qType;
      const okMonth = !qMonth || inv.month.startsWith(qMonth);
      return okClient && okType && okMonth;
    });
  }, [all, qClient, qType, qMonth]);

  const PAGE_SIZE_OPTIONS = [20, 25, 30] as const;
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [goToPage, setGoToPage] = useState("");
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);
  useEffect(() => {
    setPage(1);
  }, [filtered.length]);
  function handlePageSizeChange(v: number) {
    setPageSize(v);
    setPage(1);
  }
  function handleGoTo() {
    const n = parseInt(goToPage, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
      setPage(n);
      setGoToPage("");
    }
  }

  const stats = useMemo(() => {
    const facturas = all.filter((i) => i.type === "Factura").length;
    const recibos = all.filter((i) => i.type === "Recibo").length;
    const notasCredito = all.filter((i) => i.type === "Nota de Crédito").length;
    // Facturación total: suma de todas las facturas, menos las notas de crédito (restan la factura correspondiente)
    const sumaFacturas = all.filter((i) => i.type === "Factura").reduce((s, i) => s + (Number(i.total) || 0), 0);
    const sumaNotasCredito = all.filter((i) => i.type === "Nota de Crédito").reduce((s, i) => s + (Math.abs(i.total) || 0), 0);
    const facturacionTotal = sumaFacturas - sumaNotasCredito;
    // Cobros pendientes: facturas que figuran como pendiente de pago (sin recibo asociado en la BD)
    const facturasPendientes = all.filter((i) => {
      if (i.type !== "Factura") return false;
      const tieneRecibo = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === i.id);
      return !tieneRecibo;
    });
    const cobrosPendientes = facturasPendientes.reduce((s, i) => s + (Number(i.total) || 0), 0);
    // Cobros realizados = Facturación total - Cobros pendientes
    const cobrosRealizados = facturacionTotal - cobrosPendientes;
    return { facturas, recibos, notasCredito, facturacionTotal, cobrosPendientes, cobrosRealizados, registros: all.length };
  }, [all]);

  function exportExcel() {
    if (all.length === 0) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Historial");

    ws.columns = [
      { header: "Número", key: "number", width: 14 },
      { header: "Tipo", key: "type", width: 10 },
      { header: "Cliente", key: "clientName", width: 30 },
      { header: "Fecha Emisión", key: "date", width: 18 },
      { header: "Hora Emisión", key: "emissionTime", width: 12 },
      { header: "Fecha Vencimiento", key: "dueDate", width: 18 },
      { header: "Fecha Pago", key: "paymentDate", width: 18 },
      { header: "Total (S/Desc)", key: "subtotal", width: 16 },
      { header: "Descuento", key: "discounts", width: 12 },
      { header: "Total", key: "total", width: 12 },
      { header: "Estado", key: "status", width: 10 }
    ];

    all.forEach((inv) => {
      // Calcular fecha de vencimiento si no existe
      const dueDate = inv.dueDate || calculateDueDate(inv.date);
      // Aplicar signo negativo a las Notas de Crédito y Recibos relacionados con facturas
      const isNegative = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && inv.relatedInvoiceId);
      const subtotal = isNegative ? -(Math.abs(inv.subtotal) || 0) : (inv.subtotal || 0);
      // Descuento: negativo para Facturas, positivo para Recibos, negativo para Notas de Crédito
      let discounts: number;
      if (inv.type === "Factura") {
        discounts = -(Math.abs(inv.discounts) || 0);
      } else if (inv.type === "Recibo") {
        discounts = Math.abs(inv.discounts) || 0;
      } else {
        // Nota de Crédito
        discounts = -(Math.abs(inv.discounts) || 0);
      }
      const total = isNegative ? -(Math.abs(inv.total) || 0) : (inv.total || 0);
      
      // Verificar si la operación está cerrada
      let isClosed = false;
      let isCancelledByNC = false;
      if (inv.type === "Factura") {
        const hasReceipt = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
        // Solo considerar válida si hay exactamente UNA Nota de Crédito relacionada
        const creditNotes = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.id);
        const hasCreditNote = creditNotes.length === 1;
        isClosed = hasReceipt || hasCreditNote;
        isCancelledByNC = hasCreditNote;
      } else if (inv.type === "Recibo" && inv.relatedInvoiceId) {
        isClosed = true;
      } else if (inv.type === "Nota de Crédito" && inv.relatedInvoiceId) {
        // Verificar que sea la única NC para esa factura
        const otherNCs = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.relatedInvoiceId && nc.id !== inv.id);
        if (otherNCs.length === 0) {
          isClosed = true;
          isCancelledByNC = true;
        }
      }
      
      // Determinar el estado para Excel
      let status = "Pendiente";
      if (isClosed) {
        if (isCancelledByNC && inv.type === "Nota de Crédito") {
          status = "✓ Cancelado (NC)";
        } else if (isCancelledByNC) {
          status = "✓ Cancelado (NC)";
        } else {
          status = "✓ Cerrado";
        }
      } else if (inv.type === "Factura") {
        status = "⚠️ Pendiente";
      }
      // Fecha de pago: misma lógica que la tabla (Factura pagada=fecha, cancelada por NC="Cancelada", sino "Pendiente"; NC=fecha emisión)
      const relatedReciboPayment = inv.type === "Factura" ? all.find((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id) : null;
      const relatedNCPayment = inv.type === "Factura" ? all.find((n) => n.type === "Nota de Crédito" && n.relatedInvoiceId === inv.id) : null;
      let paymentDateExportCell: string;
      if (inv.type === "Factura") {
        if (relatedReciboPayment?.paymentDate) paymentDateExportCell = new Date(relatedReciboPayment.paymentDate).toLocaleDateString();
        else if (relatedNCPayment) paymentDateExportCell = "Cancelada";
        else paymentDateExportCell = "Pendiente";
      } else if (inv.type === "Nota de Crédito") {
        paymentDateExportCell = inv.date || (inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-");
      } else {
        paymentDateExportCell = inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-";
      }
      ws.addRow({
        number: inv.number,
        type: inv.type,
        clientName: inv.clientName,
        date: inv.date,
        emissionTime: inv.emissionTime || "-",
        dueDate: dueDate,
        paymentDate: paymentDateExportCell,
        discounts: discounts,
        subtotal: subtotal,
        total: total,
        status: status
      });
    });
    ws.getRow(1).font = { bold: true };

    wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buf]), `Historial_Documentos_ASIC_${fecha}.xlsx`);
    });
  }

  async function removeOne(id: string) {
    const found = all.find((i) => i.id === id);
    if (!found) return;
    const numericId = /^\d+$/.test(id) ? parseInt(id, 10) : null;
    if (numericId != null) {
      try {
        await deleteInvoice(numericId);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "No se pudo eliminar en el servidor.", "error");
        return;
      }
    }
    const next = all.filter((i) => i.id !== id);
    setAll(next);
    saveInvoicesAsic(next);
    deleteEmittedDocumentOne("asic", found.number).catch(() => {});
    dispatchEmittedChanged("asic");
  }

  function handleDeleteOneConfirm() {
    if (!deleteConfirmInv) return;
    void removeOne(deleteConfirmInv.id).then(() => setDeleteConfirmInv(null));
  }

  function handleClearClick() {
    setShowClearConfirm(true);
  }

  function handleClearConfirm() {
    setShowClearConfirm(false);
    setShowClearConfirm2(true);
    setClearPassword("");
    setClearPasswordError("");
    setPasswordAttempts(0);
  }

  async function handleClearConfirm2() {
    const pwd = clearPassword.trim();
    if (!pwd) {
      setClearPasswordError("Debes ingresar tu contraseña para confirmar");
      return;
    }
    
    if (passwordAttempts >= MAX_PASSWORD_ATTEMPTS) {
      setShowClearConfirm2(false);
      setClearPassword("");
      setClearPasswordError("");
      setPasswordAttempts(0);
      showToast("❌ Se agotaron los intentos. La operación ha sido cancelada.", "error", "Historial");
      return;
    }

    setClearing(true);
    setClearPasswordError("");
    try {
      await verifyPassword(pwd);
      try {
        await deleteAllInvoices("asic");
        await deleteEmittedDocumentsAll("asic").catch(() => {});
        setAll([]);
        saveInvoicesAsic([]);
        dispatchEmittedChanged("asic");
        showToast("Todo el historial ha sido eliminado.", "success", "Historial");
        setShowClearConfirm2(false);
        setClearPassword("");
        setClearPasswordError("");
        setPasswordAttempts(0);
      } catch (delErr) {
        showToast(delErr instanceof Error ? delErr.message : "No se pudo eliminar en el servidor.", "error");
      }
    } catch (err) {
      const newAttempts = passwordAttempts + 1;
      setPasswordAttempts(newAttempts);
      const remainingAttempts = MAX_PASSWORD_ATTEMPTS - newAttempts;
      const errorMessage = err instanceof Error ? err.message : "Contraseña incorrecta";
      
      if (remainingAttempts > 0) {
        setClearPasswordError(errorMessage);
        setClearPassword("");
        showToast(`Contraseña incorrecta. Quedan ${remainingAttempts} ${remainingAttempts === 1 ? "intento" : "intentos"}.`, "error", "Historial");
      } else {
        setShowClearConfirm2(false);
        setClearPassword("");
        setClearPasswordError("");
        setPasswordAttempts(0);
        showToast("Se agotaron los intentos. Operación cancelada.", "error", "Historial");
      }
    } finally {
      setClearing(false);
    }
  }

  function handleClearCancel() {
    setShowClearConfirm(false);
    setShowClearConfirm2(false);
    setClearPassword("");
    setClearPasswordError("");
    setPasswordAttempts(0);
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx =
      file.name.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (!isXlsx) {
      showToast("Elegí un archivo Excel (.xlsx).", "error");
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    e.target.value = "";
    try {
      const invoices = await parseExcelInvoices(file);
      if (invoices.length === 0) {
        showToast("No se encontraron facturas en el Excel. La primera fila debe ser encabezados (Número, Tipo, Cliente, etc.).", "error");
        setExcelLoading(false);
        return;
      }
      // Combinar con facturas existentes (evitar duplicados por número si ya existen)
      const existingNumbers = new Set(all.map((inv) => `${inv.type}-${inv.number}`));
      const newInvoices = invoices.filter((inv) => !existingNumbers.has(`${inv.type}-${inv.number}`));
      const duplicates = invoices.length - newInvoices.length;
      
      if (newInvoices.length === 0) {
        showToast(`Todas las facturas del Excel ya existen en el historial.`, "warning");
        setExcelLoading(false);
        return;
      }

      const updated = [...all, ...newInvoices];
      setAll(updated);
      saveInvoicesAsic(updated);
      
      if (duplicates > 0) {
        showToast(`Se importaron ${newInvoices.length} facturas. ${duplicates} ya existían y se omitieron.`, "success");
      } else {
        showToast(`Se importaron ${newInvoices.length} facturas correctamente.`, "success");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al leer el archivo Excel.", "error");
    } finally {
      setExcelLoading(false);
    }
  }

  async function generatePdfFromHistory(inv: Invoice) {
    try {
      // Validar que el invoice tenga items
      if (!inv.items || inv.items.length === 0) {
        showToast("Esta factura no tiene ítems cargados. No se puede generar el PDF.", "error");
        return;
      }

      // Buscar el cliente completo por nombre
      const clientsResponse = await getClients();
      const clients = clientsResponse.clients ?? [];
      const client = clients.find((c) => c.name === inv.clientName);
      
      if (!client) {
        showToast(`No se encontró el cliente "${inv.clientName}" en la base de datos.`, "error");
        return;
      }

      // Cargar el logo
      let logoBase64: string | undefined;
      try {
        logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
      } catch (err) {
        console.warn("No se pudo cargar el logo:", err);
        // Continuar sin logo
      }

      // Convertir la fecha del string a Date
      // La fecha puede estar en formato localizado (ej: "11/2/2026") o ISO
      let invoiceDate: Date;
      if (inv.date.includes("/")) {
        // Formato localizado: DD/MM/YYYY o M/D/YYYY
        const parts = inv.date.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Los meses en Date son 0-indexed
          const year = parseInt(parts[2], 10);
          invoiceDate = new Date(year, month, day);
        } else {
          invoiceDate = new Date(inv.date);
        }
      } else {
        invoiceDate = new Date(inv.date);
      }

      // Validar que la fecha sea válida
      if (isNaN(invoiceDate.getTime())) {
        console.warn("Fecha inválida, usando fecha actual");
        invoiceDate = new Date();
      }

      // Validar y asegurar que los items tengan la estructura correcta
      const validItems = inv.items.map((item) => {
        // Asegurar que serviceKey existe, si no, intentar inferirlo desde serviceName
        let serviceKey: "A" | "B" | "C" | "D" = (item.serviceKey as "A" | "B" | "C" | "D") || "A";
        if (!item.serviceKey && item.serviceName) {
          // Intentar inferir desde el nombre del servicio
          if (item.serviceName.includes("L7") || item.serviceName.includes("L9")) {
            serviceKey = item.serviceName.includes("L9") ? "B" : "A";
          } else {
            serviceKey = "C";
          }
        }
        
        return {
          serviceKey,
          serviceName: item.serviceName || "Servicio",
          month: item.month || inv.month,
          quantity: item.quantity || 1,
          price: item.price || 0,
          discount: item.discount || 0
        };
      });

      // Generar el PDF
      const doc = generateFacturaPdf(
        {
          number: inv.number,
          type: inv.type,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          clientAddress: client.address,
          clientCity: client.city,
          clientName2: client.name2,
          clientPhone2: client.phone2,
          clientEmail2: client.email2,
          clientAddress2: client.address2,
          clientCity2: client.city2,
          date: invoiceDate,
          items: validItems,
          subtotal: inv.subtotal || 0,
          discounts: inv.discounts || 0,
          total: inv.total || 0
        },
        { logoBase64 }
      );

      // Guardar el PDF
      const safeName = client.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
      doc.save(`${inv.number}_${safeName}.pdf`);
      showToast("PDF generado correctamente.", "success");
    } catch (error) {
      console.error("Error al generar PDF:", error);
      showToast(`Error al generar el PDF: ${error instanceof Error ? error.message : "Error desconocido"}`, "error");
    }
  }

  const pageSubtitle = "Documentos detalle por Ventas de Equipos ASIC. Filtros por cliente, tipo y mes.";

  return (
    <div className="fact-page clientes-page">
      <div className="container">
        <PageHeader title="Historial Venta de ASIC" showBackButton backTo="/" backText="Volver al inicio" />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2 align-items-end">
                  <div className="col-md-2">
                    <label className="form-label small fw-bold">Cliente</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Buscar cliente..."
                      value={qClient}
                      onChange={(e) => setQClient(e.target.value)}
                    />
                  </div>
                  <div className="col-md-1 col-lg-1">
                    <label className="form-label small fw-bold">Tipo</label>
                    <select
                      className="form-select form-select-sm"
                      value={qType}
                      onChange={(e) => setQType(e.target.value as "" | ComprobanteType)}
                      style={{ maxWidth: "8.5rem" }}
                    >
                      <option value="">Todos</option>
                      <option value="Factura">Factura</option>
                      <option value="Recibo">Recibo</option>
                      <option value="Nota de Crédito">Nota de Crédito</option>
                    </select>
                  </div>
                  <div className="col-md-1 col-lg-2">
                    <label className="form-label small fw-bold">Mes</label>
                    <input
                      type="month"
                      className="form-control form-control-sm"
                      value={qMonth}
                      onChange={(e) => setQMonth(e.target.value)}
                      style={{ maxWidth: "9rem" }}
                    />
                  </div>
                  <div className="col-md-1 d-flex align-items-end filtros-limpiar-col">
                    <button
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => {
                        setQClient("");
                        setQType("");
                        setQMonth("");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="col-md-auto d-flex align-items-end gap-2 ms-auto">
                    {canExportData && (
                      <>
                        <label
                          className="btn btn-outline-secondary btn-sm historial-import-excel-btn mb-0"
                          style={{ backgroundColor: "rgba(45, 93, 70, 0.35)", cursor: excelLoading ? "not-allowed" : "pointer" }}
                        >
                          {excelLoading ? "⏳ Importando..." : "📥 Importar Excel"}
                          <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="d-none"
                            onChange={handleExcelImport}
                            disabled={excelLoading}
                          />
                        </label>
                        <button type="button" className="btn btn-outline-secondary btn-sm clientes-export-excel-btn" style={{ backgroundColor: "rgba(13, 110, 253, 0.12)" }} onClick={exportExcel}>
                          📊 Exportar Excel
                        </button>
                      </>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm clientes-borrar-todo-btn"
                        style={{ backgroundColor: "rgba(220, 53, 69, 0.4)" }}
                        onClick={handleClearClick}
                      >
                        🗑️ Borrar Todo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="historial-listado-wrap historial-listado-outer">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">📄 Listado de documentos ({filtered.length}){user && !canExportData && !canDelete ? <span className="text-muted small ms-2">(solo consulta)</span> : ""}</h6>
            </div>
            <p className="text-muted small mb-3">{pageSubtitle}</p>
            <div className="table-responsive">
            <table className="table table-sm align-middle historial-listado-table" style={{ fontSize: "0.85rem" }}>
              <thead className="table-dark">
                <tr>
                  <th className="text-start">N°</th>
                  <th className="text-start">Tipo</th>
                  <th className="text-start">Cliente</th>
                  <th className="text-start">Fecha Emisión</th>
                  <th className="text-start">Hora Emisión</th>
                  <th className="text-start">Fecha<br />Vencimiento</th>
                  <th className="text-start">Fecha Pago</th>
                  <th className="text-start">Total (S/Desc)</th>
                  <th className="text-start">Descuento</th>
                  <th className="text-start">Total</th>
                  <th className="text-start">Estado</th>
                  <th className="text-start">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center text-muted py-4">
                      <small>No hay facturas registradas</small>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inv) => {
                    // Calcular fecha de vencimiento si no existe (para facturas antiguas)
                    const dueDate = inv.dueDate || calculateDueDate(inv.date);
                    // Aplicar signo negativo a las Notas de Crédito y Recibos relacionados con facturas
                    const isNegativeType = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && inv.relatedInvoiceId);
                    const subtotal = isNegativeType ? -(Math.abs(inv.subtotal) || 0) : (inv.subtotal || 0);
                    // Descuento: negativo para Facturas, positivo para Recibos, negativo para Notas de Crédito
                    let discounts: number;
                    if (inv.type === "Factura") {
                      discounts = -(Math.abs(inv.discounts) || 0);
                    } else if (inv.type === "Recibo") {
                      discounts = Math.abs(inv.discounts) || 0;
                    } else {
                      // Nota de Crédito
                      discounts = -(Math.abs(inv.discounts) || 0);
                    }
                    const total = isNegativeType ? -(Math.abs(inv.total) || 0) : (inv.total || 0);

                    // Fecha de pago: Factura = fecha del Recibo si pagada, "Cancelada" si cancelada por NC, sino "Pendiente"; NC = fecha emisión
                    const relatedReciboForPayment = inv.type === "Factura" ? all.find((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id) : null;
                    const relatedNCForPayment = inv.type === "Factura" ? all.find((n) => n.type === "Nota de Crédito" && n.relatedInvoiceId === inv.id) : null;
                    const paymentDateDisplay = (inv.type === "Factura" && relatedReciboForPayment?.paymentDate) ? relatedReciboForPayment.paymentDate : inv.paymentDate;
                    let paymentDateCell: string;
                    if (inv.type === "Factura") {
                      if (relatedReciboForPayment?.paymentDate) paymentDateCell = new Date(relatedReciboForPayment.paymentDate).toLocaleDateString();
                      else if (relatedNCForPayment) paymentDateCell = "Cancelada";
                      else paymentDateCell = "Pendiente";
                    } else if (inv.type === "Nota de Crédito") {
                      paymentDateCell = inv.date || (inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-");
                    } else {
                      paymentDateCell = paymentDateDisplay ? new Date(paymentDateDisplay).toLocaleDateString() : "-";
                    }
                    // Verificar si la operación está cerrada (factura con recibo relacionado, factura cancelada por NC, o recibo/NC con factura relacionada)
                    let isClosed = false;
                    let isCancelledByNC = false;
                    if (inv.type === "Factura") {
                      // Buscar si existe un recibo relacionado con esta factura
                      const hasReceipt = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
                      // Buscar si existe exactamente UNA Nota de Crédito relacionada con esta factura (no múltiples)
                      const creditNotes = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.id);
                      const hasCreditNote = creditNotes.length === 1; // Solo una NC válida
                      isClosed = hasReceipt || hasCreditNote;
                      isCancelledByNC = hasCreditNote;
                    } else if (inv.type === "Recibo" && inv.relatedInvoiceId) {
                      // Si es un recibo con factura relacionada, está cerrado
                      isClosed = true;
                    } else if (inv.type === "Nota de Crédito" && inv.relatedInvoiceId) {
                      // Verificar que sea la única NC para esa factura
                      const otherNCs = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.relatedInvoiceId && nc.id !== inv.id);
                      // Solo mostrar check si es la única NC para esa factura
                      if (otherNCs.length === 0) {
                        isClosed = true;
                        isCancelledByNC = true;
                      }
                    }
                    return (
                      <tr key={inv.id}>
                        <td className="fw-bold text-start">{inv.number}</td>
                        <td className="text-start">{inv.type === "Nota de Crédito" ? "NC" : inv.type}</td>
                        <td className="text-start">{inv.clientName}</td>
                        <td className="text-start">{inv.date}</td>
                        <td className="text-start">{inv.emissionTime || "-"}</td>
                        <td className="text-start">{dueDate}</td>
                        <td className="text-start">{paymentDateCell}</td>
                        <td className="text-start">{formatCurrency(subtotal)}</td>
                        <td className="text-start">{formatCurrency(discounts)}</td>
                        <td className="text-start fw-bold">{formatCurrency(total)}</td>
                        <td className="text-center">
                          {isClosed ? (
                            isCancelledByNC ? (
                              <span className="badge d-inline-flex" style={{ fontSize: "0.65rem", padding: "0.1rem 0.2rem", borderRadius: "50%", width: "1.05rem", height: "1.05rem", alignItems: "center", justifyContent: "center", backgroundColor: "#004085", color: "#fff" }} title={inv.type === "Nota de Crédito" ? "Nota de Crédito que cancela factura" : "Factura cancelada con Nota de Crédito"}>
                                ✓
                              </span>
                            ) : (
                              <span className="badge bg-success d-inline-flex" style={{ fontSize: "0.65rem", padding: "0.1rem 0.2rem", borderRadius: "50%", width: "1.05rem", height: "1.05rem", alignItems: "center", justifyContent: "center" }} title="Operación cerrada - Cliente pagó">
                                ✓
                              </span>
                            )
                          ) : inv.type === "Factura" ? (
                            <span className="d-inline-flex" style={{ fontSize: "0.95rem", padding: "0.1rem 0.2rem", borderRadius: "50%", width: "1.05rem", height: "1.05rem", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", color: "#ffc107" }} title="Factura pendiente de pago">
                              ⚠️
                            </span>
                          ) : (
                            <span className="text-muted" style={{ fontSize: "0.875rem" }}>-</span>
                          )}
                        </td>
                      <td className="text-center">
                        <div className="d-flex gap-1 justify-content-center align-items-center flex-nowrap historial-acciones-btns">
                          <button
                            type="button"
                            className="btn btn-sm border historial-accion-btn"
                            onClick={() => setDetailInvoice(inv)}
                            title="Ver detalles"
                          >
                            ℹ️
                          </button>
                          <button 
                            className="fact-btn fact-btn-primary btn-sm historial-accion-btn" 
                            onClick={() => generatePdfFromHistory(inv)}
                            title="PDF"
                          >
                            📄
                          </button>
                          {canDelete && (
                            <button 
                              className="btn btn-danger btn-sm historial-accion-btn historial-accion-btn-delete" 
                              onClick={() => setDeleteConfirmInv(inv)}
                              title="Eliminar"
                            >
                              <i className="bi bi-trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
              <div className="d-flex align-items-center gap-2">
                <label className="text-muted small mb-0">Mostrar</label>
                <select
                  className="form-select form-select-sm"
                  style={{ width: "auto" }}
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-muted small">registros</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small">
                  Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filtered.length)} de {filtered.length}
                </span>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ‹ Anterior
                </button>
                <span className="px-2 small text-muted">Página {page} de {totalPages}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Siguiente ›
                </button>
                <div className="d-flex align-items-center gap-1">
                  <span className="small text-muted">Ir a</span>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ width: "4rem" }}
                    min={1}
                    max={totalPages}
                    value={goToPage}
                    onChange={(e) => setGoToPage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGoTo())}
                    placeholder={String(totalPages)}
                  />
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleGoTo}>
                    Ir
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        <div className="usuarios-page-card mt-4">
          <div className="usuarios-page-header usuarios-page-header--activity">
            <div className="usuarios-page-header-inner">
              <h2 className="usuarios-page-title">
                <span className="usuarios-page-title-icon usuarios-page-title-icon--activity" aria-hidden>📊</span>
                Resumen
              </h2>
              <p className="usuarios-page-subtitle">Estadísticas de facturación y cobros.</p>
            </div>
          </div>
          <div className="usuarios-page-body">
        <div className="row g-3 historial-stats">
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-primary" />
              <div className="stat-label">Total facturas</div>
              <div className="stat-value text-primary">{stats.facturas}</div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-success" />
              <div className="stat-label">Total recibos</div>
              <div className="stat-value text-success">{stats.recibos}</div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-warning" />
              <div className="stat-label">Notas de crédito</div>
              <div className="stat-value text-warning">{stats.notasCredito}</div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-dark" />
              <div className="stat-label">Facturación total</div>
              <div className="stat-value text-dark">{formatCurrencyNumber(stats.facturacionTotal)} <span className="currency">USD</span></div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Cobros pendientes</div>
              <div className="stat-value text-danger">{formatCurrencyNumber(stats.cobrosPendientes)} <span className="currency">USD</span></div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-success" />
              <div className="stat-label">Cobros realizados</div>
              <div className="stat-value text-success">{formatCurrencyNumber(stats.cobrosRealizados)} <span className="currency">USD</span></div>
            </div>
          </div>
        </div>
        <div className="row mt-3 g-3 historial-stats">
          <div className="col-12">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-info" />
              <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap">
                <span className="stat-label mb-0">Registros en historial</span>
                <span className="stat-value text-info mb-0">{stats.registros}</span>
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>

        {/* Modal Confirmación eliminar una transacción */}
        {deleteConfirmInv && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                    <i className="bi bi-trash historial-delete-icon" style={{ fontSize: "1.5rem" }} />
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">Eliminar transacción</h5>
                  <button type="button" className="btn-close" onClick={() => setDeleteConfirmInv(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-question">
                    ¿Está eliminando una transacción. ¿Está seguro que quiere hacer esto?
                  </p>
                  <p className="historial-delete-warning text-muted small mb-0">
                    {deleteConfirmInv.type} {deleteConfirmInv.number} - {deleteConfirmInv.clientName}
                  </p>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={() => setDeleteConfirmInv(null)}>
                    No
                  </button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleDeleteOneConfirm}>
                    Sí
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Detalle del comprobante */}
        {detailInvoice && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Detalle del comprobante</h5>
                  <button type="button" className="btn-close" onClick={() => setDetailInvoice(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body">
                  {(() => {
                    const inv = detailInvoice;
                    const dueDate = inv.dueDate || calculateDueDate(inv.date);
                    const relatedRecibo = all.find((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
                    const relatedNC = all.find((n) => n.type === "Nota de Crédito" && n.relatedInvoiceId === inv.id);
                    const relatedFactura = inv.relatedInvoiceId ? all.find((f) => f.id === inv.relatedInvoiceId) : null;
                    return (
                      <>
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4"><strong>Número:</strong> {inv.number}</div>
                          <div className="col-md-4"><strong>Tipo:</strong> {inv.type}</div>
                          <div className="col-md-4"><strong>Cliente:</strong> {inv.clientName}</div>
                          <div className="col-md-4"><strong>Fecha emisión:</strong> {inv.date}</div>
                          <div className="col-md-4"><strong>Hora emisión:</strong> {inv.emissionTime || "-"}</div>
                          <div className="col-md-4"><strong>Fecha vencimiento:</strong> {dueDate}</div>
                          <div className="col-md-4"><strong>Fecha pago:</strong> {inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-"}</div>
                          <div className="col-md-4"><strong>Mes:</strong> {inv.month}</div>
                        </div>
                        {inv.items && inv.items.length > 0 && (
                          <div className="mb-3">
                            <strong>Ítems</strong>
                            <table className="table table-sm table-bordered mt-1">
                              <thead>
                                <tr>
                                  <th>Servicio</th>
                                  <th>Mes</th>
                                  <th className="text-end">Cant.</th>
                                  <th className="text-end">Precio</th>
                                  <th className="text-end">Desc.</th>
                                  <th className="text-end">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.items.map((item, idx) => (
                                  <tr key={idx}>
                                    <td>{item.serviceName}</td>
                                    <td>{item.month || "-"}</td>
                                    <td className="text-end">{item.quantity}</td>
                                    <td className="text-end">{formatCurrencyNumber(item.price)} USD</td>
                                    <td className="text-end">{formatCurrencyNumber(item.discount)} USD</td>
                                    <td className="text-end">{formatCurrencyNumber((item.quantity * item.price) - item.discount)} USD</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4 text-end"><strong>Total (S/Desc):</strong> {formatCurrency(inv.subtotal)}</div>
                          <div className="col-md-4 text-end"><strong>Descuento:</strong> {formatCurrency(inv.discounts)}</div>
                          <div className="col-md-4 text-end"><strong>Total:</strong> {formatCurrency(inv.total)}</div>
                        </div>
                        {inv.type === "Factura" && relatedRecibo && (
                          <div className="rounded p-3" style={{ backgroundColor: "#d1e7dd", border: "1px solid #0f5132" }}>
                            <strong style={{ color: "#0f5132" }}>✓ Ya fue pagada</strong>
                            <div className="mt-1 small" style={{ color: "#0f5132" }}>
                              Recibo de pago: <strong>{relatedRecibo.number}</strong>
                              {relatedRecibo.paymentDate && (
                                <> — Fecha de pago: <strong>{new Date(relatedRecibo.paymentDate).toLocaleDateString()}</strong></>
                              )}
                            </div>
                          </div>
                        )}
                        {inv.type === "Factura" && relatedNC && (
                          <div className="rounded p-3" style={{ backgroundColor: "#e7f1ff", border: "1px solid #004085" }}>
                            <strong style={{ color: "#004085" }}>✓ Factura cancelada</strong>
                            <div className="mt-1 small" style={{ color: "#004085" }}>
                              Nota de Crédito: <strong>{relatedNC.number}</strong>
                              {relatedNC.date && <> — Emisión: <strong>{relatedNC.date}</strong></>}
                            </div>
                          </div>
                        )}
                        {inv.type === "Factura" && !relatedRecibo && !relatedNC && (
                          <div className="rounded p-3" style={{ backgroundColor: "#fff3cd", border: "1px solid #856404" }}>
                            <strong style={{ color: "#856404" }}>Pendiente de Pago</strong>
                          </div>
                        )}
                        {inv.type === "Recibo" && inv.paymentDate && (
                          <div className="rounded p-3 mb-2" style={{ backgroundColor: "#d1e7dd", border: "1px solid #0f5132" }}>
                            <strong style={{ color: "#0f5132" }}>✓ Ya está pagado</strong>
                            <div className="mt-1 small" style={{ color: "#0f5132" }}>
                              Fecha de pago: <strong>{new Date(inv.paymentDate).toLocaleDateString()}</strong>
                            </div>
                          </div>
                        )}
                        {inv.type === "Recibo" && relatedFactura && (
                          <div className="border rounded p-3 bg-light small">
                            <strong>Factura relacionada:</strong> {relatedFactura.number}
                            {relatedFactura.date && <> — Emisión: {relatedFactura.date}</>}
                          </div>
                        )}
                        {inv.type === "Nota de Crédito" && relatedFactura && (
                          <div className="rounded p-3" style={{ backgroundColor: "#e7f1ff", border: "1px solid #004085" }}>
                            <strong style={{ color: "#004085" }}>✓ Factura cancelada</strong>
                            <div className="mt-1 small" style={{ color: "#004085" }}>
                              Factura: <strong>{relatedFactura.number}</strong>
                              {relatedFactura.date && <> — Emisión: <strong>{relatedFactura.date}</strong></>}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailInvoice(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Primera Confirmación - Borrar Todo */}
        {showClearConfirm && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper">
                    <svg className="historial-delete-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">
                    Eliminar Todo el Historial
                  </h5>
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-question">
                    ¿Eliminar todo el historial permanentemente?
                  </p>
                  <p className="historial-delete-warning">
                    Esta acción no se puede deshacer.
                  </p>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={handleClearCancel}>
                    Cancelar
                  </button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleClearConfirm}>
                    Continuar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Segunda Confirmación - Borrar Todo */}
        {showClearConfirm2 && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal historial-delete-modal-password">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                    <svg className="historial-delete-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">
                    Confirmar Eliminación
                  </h5>
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-warning-text">
                    Se eliminará <strong>todo</strong> el historial permanentemente.
                  </p>
                  <p className="historial-delete-password-label">
                    Ingresa tu contraseña (la misma con la que iniciaste sesión):
                  </p>
                  {passwordAttempts > 0 && (
                    <div className="historial-delete-attempts-alert">
                      <svg className="historial-delete-attempts-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Intento {passwordAttempts}/{MAX_PASSWORD_ATTEMPTS} - Quedan {MAX_PASSWORD_ATTEMPTS - passwordAttempts} {MAX_PASSWORD_ATTEMPTS - passwordAttempts === 1 ? "intento" : "intentos"}</span>
                    </div>
                  )}
                  <div className="historial-delete-password-input-wrapper">
                    <label htmlFor="clearPassword" className="historial-delete-password-label-input">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      className={`historial-delete-password-input ${clearPasswordError ? "historial-delete-password-input-error" : ""}`}
                      id="clearPassword"
                      value={clearPassword}
                      onChange={(e) => {
                        setClearPassword(e.target.value);
                        setClearPasswordError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !clearing) {
                          handleClearConfirm2();
                        }
                      }}
                      placeholder="Ingresa tu contraseña"
                      autoFocus
                      disabled={clearing}
                    />
                    {clearPasswordError && (
                      <div className="historial-delete-password-error">
                        {clearPasswordError}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={handleClearCancel} disabled={clearing}>
                    Cancelar
                  </button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleClearConfirm2} disabled={clearing || !clearPassword.trim()}>
                    {clearing ? (
                      <>
                        <span className="historial-delete-btn-spinner"></span>
                        Verificando...
                      </>
                    ) : (
                      "Sí, eliminar todo"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

