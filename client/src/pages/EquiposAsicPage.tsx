import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  Heading,
  Input,
  NativeSelect,
  Portal,
  Text,
} from "@chakra-ui/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  getEquipos,
  createEquipo,
  updateEquipo,
  deleteEquipo,
  deleteEquiposAll,
  createEquiposBulk,
  wakeUpBackend,
  getEquipoWhatToMineYield,
} from "../lib/api";
import type { EquipoASIC } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { EquipoAsicDashboardCard } from "../components/equipos/EquipoAsicDashboardCard";
import { CardImageUploadField, GalleryImagesUploadField } from "../components/equipos/MarketplaceImageUploadFields";
import { MarketplaceDetailRowsEditor, sanitizeDetailRowsForApi } from "../components/equipos/MarketplaceDetailRowsEditor";
import { AsicProductModal } from "../components/marketplace/AsicProductModal";
import { PrecioHistorialFullModal } from "../components/equipos/PrecioHistorialFullModal";
import { equipoASICToModalProduct } from "../lib/equipoAsicModalMapper";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canEditEquipoMarketplacePrecioYTienda, canExport } from "../lib/auth";
import { codigoProductoVitrina as vitrinaCodigoFromSpecs } from "../lib/marketplaceProductCode";
import { resolveMarketplaceListingKind } from "../lib/marketplaceAsicCatalog";
import "../styles/facturacion.css";
import "../styles/marketplace-hashrate.css";
import { AppButton, AppCard, AppInput, AppModal } from "../components/ui";

function findCol(headerRow: (string | number)[], ...names: string[]): number {
  for (let i = 1; i < headerRow.length; i++) {
    const h = String(headerRow[i] ?? "").trim().toLowerCase();
    for (const n of names) {
      const k = n.toLowerCase();
      if (h === k || h.includes(k) || k.includes(h)) return i;
    }
  }
  return -1;
}

/** Opciones del formulario; si un equipo ya guardado tiene otro texto, se muestra como opción extra al editar. */
const MARCAS_EQUIPO_OPCIONES = ["Bitmain"] as const;
/** Modelos del desplegable; en edición, si en BD hay otro texto se ofrece como opción extra. */
const MODELOS_EQUIPO_OPCIONES = [
  "Antminer S21",
  "Antminer L7",
  "Antminer L9",
  "Antminer Z15",
  "AntSpace Hydro HW5",
  "AntSpace Hydro MD5",
] as const;

/** Texto por defecto en vitrina cuando el producto no tiene precio fijo (editable). */
const DEFAULT_MARKETPLACE_PRICE_LABEL = "SOLICITA PRECIO";

function opcionesModeloConActual(actual: string): string[] {
  const base = [...MODELOS_EQUIPO_OPCIONES];
  const a = (actual ?? "").trim();
  if (a && !base.some((x) => x === a)) return [a, ...base];
  return base;
}

type FamiliaProcesadorPreset = "l9" | "l7" | "s21" | "z15";

/** Presets de hashrate según modelo (texto guardado en BD = valor del `option`). L9/L7 en MH/s, S21 en TH/s. */
const PROCESADOR_PRESETS_L9 = ["15.000 MH/s", "16.000 MH/s", "16.500 MH/s", "17.000 MH/s"] as const;
const PROCESADOR_PRESETS_L7 = ["8.800 MH/s", "9.050 MH/s", "9.500 MH/s"] as const;
const PROCESADOR_PRESETS_Z15 = ["420 kSol/s", "840 kSol/s"] as const;
const PROCESADOR_PRESETS_S21 = [
  "200 TH/s",
  "234 TH/s",
  "235 TH/s",
  "245 TH/s",
  "270 TH/s",
  "473 TH/s Hydro",
] as const;

/** S21 → TH/s; L7 / L9 (y variantes en texto libre) → MH/s — solo para modelo sin preset de lista. */
function unidadProcesadorDesdeModelo(modelo: string): "th" | "mh" | null {
  const m = (modelo ?? "").trim().toLowerCase();
  if (!m) return null;
  if (/\bl7\b/.test(m) || /\bl9\b/.test(m)) return "mh";
  if (/\bs21\b/.test(m)) return "th";
  return null;
}

function familiaProcesadorPreset(modelo: string): FamiliaProcesadorPreset | null {
  const m = (modelo ?? "").trim().toLowerCase();
  if (!m) return null;
  if (/\bl9\b/.test(m)) return "l9";
  if (/\bl7\b/.test(m)) return "l7";
  if (/\bz15\b/.test(m)) return "z15";
  if (/\bs21\b/.test(m)) return "s21";
  return null;
}

function presetsProcesadorFamilia(f: FamiliaProcesadorPreset): readonly string[] {
  switch (f) {
    case "l9":
      return PROCESADOR_PRESETS_L9;
    case "l7":
      return PROCESADOR_PRESETS_L7;
    case "z15":
      return PROCESADOR_PRESETS_Z15;
    case "s21":
      return PROCESADOR_PRESETS_S21;
  }
}

/** Opciones del desplegable: presets + valor actual si no está en la lista (import Excel / datos viejos). */
function opcionesProcesadorSelect(f: FamiliaProcesadorPreset, actual: string): string[] {
  const base = [...presetsProcesadorFamilia(f)];
  const a = (actual ?? "").trim();
  if (a && !base.some((x) => x === a)) return [a, ...base];
  return base;
}

/** Intercambia la unidad en Procesador si el modelo no usa presets (texto libre). */
function ajustarProcesadorSegunModelo(modelo: string, procesador: string): string {
  if (familiaProcesadorPreset(modelo)) return procesador;
  const objetivo = unidadProcesadorDesdeModelo(modelo);
  if (!objetivo) return procesador;
  const p = (procesador ?? "").trim();
  if (!p) return objetivo === "th" ? "TH/s" : "MH/s";
  if (objetivo === "th") {
    return p
      .replace(/\b(mh\/s|mhs)\b/gi, "TH/s")
      .replace(/\b(gh\/s|ghs)\b/gi, "TH/s");
  }
  return p.replace(/\b(th\/s|ths)\b/gi, "MH/s");
}

function procesadorTrasCambioModelo(modeloAnterior: string, modeloNuevo: string, procesador: string): string {
  const prev = familiaProcesadorPreset(modeloAnterior);
  const next = familiaProcesadorPreset(modeloNuevo);
  if (next !== prev) return next ? "" : ajustarProcesadorSegunModelo(modeloNuevo, procesador);
  if (next) return procesador;
  return ajustarProcesadorSegunModelo(modeloNuevo, procesador);
}

function opcionesMarcaConActual(actual: string): string[] {
  const a = (actual ?? "").trim();
  const base = [...MARCAS_EQUIPO_OPCIONES];
  if (a && !base.some((x) => x === a)) return [a, ...base];
  return base;
}

/** Parsea Excel de equipos ASIC (mismo formato que exportExcel: Código de Producto, Fecha Ingreso, Marca Equipo, Modelo, Procesador, Precio USD, Observaciones) */
async function parseExcelEquipos(file: File): Promise<Omit<EquipoASIC, "id">[]> {
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
    numeroSerie: findCol(
      headerRow,
      "código de producto",
      "codigo de producto",
      "código producto",
      "codigo producto",
      "nº serie",
      "numero serie",
      "numeroSerie",
      "n° serie"
    ),
    fechaIngreso: findCol(headerRow, "fecha ingreso", "fechaIngreso", "fecha"),
    marcaEquipo: findCol(headerRow, "marca equipo", "marcaEquipo", "marca"),
    modelo: findCol(headerRow, "modelo"),
    procesador: findCol(headerRow, "procesador"),
    precioUSD: findCol(headerRow, "precio usd", "precioUSD", "precio"),
    observaciones: findCol(headerRow, "observaciones"),
  };

  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";
  const getNum = (row: (string | number)[], i: number): number => {
    const val = get(row, i);
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^\d.-]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  /** Convierte fecha en DD/MM/YYYY o similar a YYYY-MM-DD */
  function toYyyyMmDd(s: string): string {
    if (!s) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const parts = s.split(/[/-]/).map((p) => p.trim());
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
      return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    return new Date().toISOString().slice(0, 10);
  }

  const result: Omit<EquipoASIC, "id">[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const marcaEquipo = idx.marcaEquipo >= 0 ? get(row, idx.marcaEquipo) : get(row, 3);
    const modelo = idx.modelo >= 0 ? get(row, idx.modelo) : get(row, 4);
    const procesador = idx.procesador >= 0 ? get(row, idx.procesador) : get(row, 5);
    if (!marcaEquipo && !modelo && !procesador) continue;

    const numeroSerie = idx.numeroSerie >= 0 ? get(row, idx.numeroSerie) || undefined : undefined;
    const fechaIngreso = idx.fechaIngreso >= 0 ? toYyyyMmDd(get(row, idx.fechaIngreso)) : toYyyyMmDd(get(row, 2));
    const precioUSD = idx.precioUSD >= 0 ? getNum(row, idx.precioUSD) : 0;
    const observaciones = idx.observaciones >= 0 ? get(row, idx.observaciones) || undefined : undefined;

    result.push({
      numeroSerie: numeroSerie && numeroSerie !== "—" ? numeroSerie : undefined,
      fechaIngreso,
      marcaEquipo: marcaEquipo || "—",
      modelo: modelo || "—",
      procesador: procesador || "—",
      precioUSD: Math.max(0, precioUSD),
      observaciones: observaciones || undefined,
    });
  }
  return result;
}

function galleryLinesFromJson(j: string | null | undefined): string {
  if (!j?.trim()) return "";
  try {
    const a = JSON.parse(j) as unknown;
    if (Array.isArray(a) && a.every((x) => typeof x === "string")) return (a as string[]).join("\n");
  } catch {
    /* ignore */
  }
  return "";
}

type PrecioHistEntry = { precioUsd: number; actualizadoEn: string };

/** Datos para abrir el modal de historial completo (desde edición o desde listado / detalle). */
type PrecioHistorialFullPayload = {
  historial: PrecioHistEntry[];
  marca: string;
  modelo: string;
  procesador: string;
  codigoProducto: string | null;
};

function sortPrecioHistorialAsc(entries: PrecioHistEntry[]): PrecioHistEntry[] {
  return [...entries].sort((a, b) => a.actualizadoEn.localeCompare(b.actualizadoEn));
}

function sortPrecioHistorialDesc(entries: PrecioHistEntry[]): PrecioHistEntry[] {
  return [...entries].sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
}

function appendPrecioHistorialClient(prev: PrecioHistEntry[], precioUsd: number, actualizadoEn: string): PrecioHistEntry[] {
  const n = Math.max(0, Math.round(Number(precioUsd) || 0));
  const last = prev[prev.length - 1];
  if (last && last.precioUsd === n) return [...prev];
  return [...prev, { precioUsd: n, actualizadoEn }];
}

type EquipoFormState = {
  fechaIngreso: string;
  marcaEquipo: string;
  modelo: string;
  procesador: string;
  precioUSD: number;
  /** Copia local del historial para el modal de precio (equipo nuevo o hasta refrescar desde API). */
  precioHistorialLocal: PrecioHistEntry[];
  observaciones: string;
  marketplaceVisible: boolean;
  /** Publicar en tienda sin importe USD: se muestra `marketplacePriceLabel` en la vitrina. */
  marketplacePriceConsultMode: boolean;
  marketplacePriceLabel: string;
  marketplaceImageSrc: string;
  marketplaceGalleryLines: string;
  marketplaceDetailRowsJson: string;
};

function buildMarketplacePayload(form: EquipoFormState): {
  marketplaceVisible: boolean;
  marketplaceAlgo: "sha256" | "scrypt" | null;
  marketplaceHashrateDisplay: string | null;
  marketplaceImageSrc: string | null;
  marketplaceGalleryJson: string | null;
  marketplaceDetailRowsJson: string | null;
  marketplaceYieldJson: string | null;
  marketplaceSortOrder: number;
  marketplacePriceLabel: string | null;
  marketplaceListingKind: "miner" | "infrastructure" | null;
} {
  const vis = form.marketplaceVisible === true;
  const lines = form.marketplaceGalleryLines.split("\n").map((s) => s.trim()).filter(Boolean);
  const galleryJson = vis && lines.length > 0 ? JSON.stringify(lines) : null;
  const detailTrim = form.marketplaceDetailRowsJson.trim();
  const detailJson = vis && detailTrim ? sanitizeDetailRowsForApi(form.marketplaceDetailRowsJson) : null;
  const consult = vis && form.marketplacePriceConsultMode === true;
  const labelTrim = form.marketplacePriceLabel.trim();
  const marketplacePriceLabel =
    consult ? (labelTrim || DEFAULT_MARKETPLACE_PRICE_LABEL).slice(0, 120) : null;
  /** Siempre automático (heurística marca/modelo en vitrina); sin override manual en formulario. */
  const marketplaceListingKind = null;
  return {
    marketplaceVisible: vis,
    marketplaceAlgo: null,
    marketplaceHashrateDisplay: null,
    marketplaceImageSrc: vis ? (form.marketplaceImageSrc.trim() || null) : null,
    marketplaceGalleryJson: galleryJson,
    marketplaceDetailRowsJson: detailJson,
    marketplaceYieldJson: null,
    marketplaceSortOrder: 0,
    marketplacePriceLabel,
    marketplaceListingKind,
  };
}

/** Muestra fecha de ingreso en listado / modal (acepta ISO completo o solo yyyy-mm-dd). */
function formatFechaIngresoDisplay(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00`) : new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

function buildEquipoSavePayload(form: EquipoFormState) {
  const mp = buildMarketplacePayload(form);
  return {
    fechaIngreso: form.fechaIngreso || "",
    marcaEquipo: form.marcaEquipo,
    modelo: form.modelo,
    procesador: form.procesador,
    precioUSD: form.precioUSD,
    observaciones: form.observaciones || undefined,
    ...mp,
  };
}

function emptyEquipoForm(): EquipoFormState {
  return {
    fechaIngreso: "",
    marcaEquipo: "Bitmain",
    modelo: "",
    procesador: "",
    precioUSD: 0,
    precioHistorialLocal: [],
    observaciones: "",
    marketplaceVisible: false,
    marketplacePriceConsultMode: false,
    marketplacePriceLabel: "",
    marketplaceImageSrc: "",
    marketplaceGalleryLines: "",
    marketplaceDetailRowsJson: "",
  };
}

export function EquiposAsicPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canEditTienda = user ? canEditEquipoMarketplacePrecioYTienda(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [equipos, setEquipos] = useState<EquipoASIC[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  /** Evita que el cierre programático del paso 1 dispare `handleDeleteCancel` y cancele el paso 2. */
  const advancingDeleteAllWizardRef = useRef(false);
  /** Equipo a eliminar tras confirmar en el diálogo (un solo ítem). */
  const [equipoDeleteConfirm, setEquipoDeleteConfirm] = useState<EquipoASIC | null>(null);
  const [deletingSingleEquipo, setDeletingSingleEquipo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [editingEquipo, setEditingEquipo] = useState<EquipoASIC | null>(null);
  const [formData, setFormData] = useState<EquipoFormState>(emptyEquipoForm());
  const [detailEquipo, setDetailEquipo] = useState<EquipoASIC | null>(null);
  const [detailYieldLoading, setDetailYieldLoading] = useState(false);
  const [detailYieldLines, setDetailYieldLines] = useState<{ line1: string; line2: string } | null>(null);
  const [detailYieldNote, setDetailYieldNote] = useState<string | null>(null);
  const [detailYieldHint, setDetailYieldHint] = useState<string | null>(null);
  const [showPrecioModal, setShowPrecioModal] = useState(false);
  const [precioHistorialFullPayload, setPrecioHistorialFullPayload] = useState<PrecioHistorialFullPayload | null>(null);
  const [precioModalInput, setPrecioModalInput] = useState("");
  const [precioModalSaving, setPrecioModalSaving] = useState(false);
  /** Tras completar las 3 specs o al editar: bloqueadas hasta activar el switch único. */
  const [equipoSpecsEditEnabled, setEquipoSpecsEditEnabled] = useState(false);
  /** Plegar la grilla “Solo inventario / No visibles en tienda” (persiste en localStorage). */
  const SOLO_INVENTARIO_EXPANDED_KEY = "hrs_equipos_asic_solo_inventario_expanded";
  const [soloInventarioExpanded, setSoloInventarioExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(SOLO_INVENTARIO_EXPANDED_KEY) !== "false";
    } catch {
      return true;
    }
  });

  function toggleSoloInventarioSection() {
    setSoloInventarioExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOLO_INVENTARIO_EXPANDED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const specsCommitted = useMemo(
    () =>
      Boolean(editingEquipo) ||
      Boolean(
        formData.marcaEquipo.trim() &&
          formData.modelo.trim() &&
          formData.procesador.trim()
      ),
    [editingEquipo, formData.marcaEquipo, formData.modelo, formData.procesador]
  );

  const specsFieldsLocked = specsCommitted && !equipoSpecsEditEnabled;

  const equipoDetailModalProduct = useMemo(() => {
    if (!detailEquipo) return null;
    const base = equipoASICToModalProduct(detailEquipo);
    if (!detailYieldLines && !detailYieldLoading && detailYieldHint) {
      return { ...base, estimatedYield: { line1: detailYieldHint, line2: "—" } };
    }
    return base;
  }, [detailEquipo, detailYieldLines, detailYieldLoading, detailYieldHint]);

  const equipoDetailLiveYield = useMemo(() => {
    if (!detailEquipo || !detailYieldLines) return undefined;
    return { id: detailEquipo.id, ...detailYieldLines, note: detailYieldNote ?? "" };
  }, [detailEquipo, detailYieldLines, detailYieldNote]);

  /** Código tipo vitrina (M+modelo+hashrate) según modelo/procesador; no implica que esté publicado. */
  const vitrinaCodigoDesdeSpecs = useMemo(
    () => vitrinaCodigoFromSpecs(formData.modelo, formData.procesador, true),
    [formData.modelo, formData.procesador]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    wakeUpBackend()
      .then(() => getEquipos())
      .then((res) => {
        if (!cancelled) {
          setEquipos(res.items ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Error al cargar equipos");
          setEquipos([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (showAddModal) {
      setEquipoSpecsEditEnabled(false);
    }
  }, [showAddModal, editingEquipo?.id]);

  async function handleSave() {
    if (!formData.marcaEquipo || !formData.modelo || !formData.procesador) {
      showToast("Debe completar Marca, Modelo y Procesador.", "error", "Equipos ASIC");
      return;
    }
    if (formData.marketplaceVisible) {
      if (formData.marketplacePriceConsultMode) {
        const lbl = (formData.marketplacePriceLabel.trim() || DEFAULT_MARKETPLACE_PRICE_LABEL).slice(0, 120);
        if (lbl.length < 8) {
          showToast("Completá un texto comercial claro para el precio bajo consulta (mín. 8 caracteres).", "error", "Equipos ASIC");
          return;
        }
      } else if (formData.precioUSD <= 0) {
        showToast(
          "Para publicar con precio de lista indicá un importe USD mayor a 0, o activá «Precio bajo consulta».",
          "error",
          "Equipos ASIC"
        );
        return;
      }
    }
    const mp = buildMarketplacePayload(formData);
    const basePayload = buildEquipoSavePayload(formData);

    try {
      if (editingEquipo) {
        await updateEquipo(editingEquipo.id, basePayload);
        setEquipos((prev) =>
          prev.map((e) =>
            e.id === editingEquipo.id
              ? {
                  ...e,
                  fechaIngreso: editingEquipo.fechaIngreso,
                  marcaEquipo: formData.marcaEquipo,
                  modelo: formData.modelo,
                  procesador: formData.procesador,
                  precioUSD: formData.precioUSD,
                  observaciones: formData.observaciones || undefined,
                  marketplaceVisible: mp.marketplaceVisible,
                  marketplaceAlgo: mp.marketplaceAlgo,
                  marketplaceHashrateDisplay: mp.marketplaceHashrateDisplay,
                  marketplaceImageSrc: mp.marketplaceImageSrc,
                  marketplaceGalleryJson: mp.marketplaceGalleryJson,
                  marketplaceDetailRowsJson: mp.marketplaceDetailRowsJson,
                  marketplaceYieldJson: mp.marketplaceYieldJson,
                  marketplaceSortOrder: mp.marketplaceSortOrder,
                  marketplacePriceLabel: mp.marketplacePriceLabel ?? null,
                  marketplaceListingKind: mp.marketplaceListingKind ?? null,
                }
              : e
          )
        );
        showToast("Equipo actualizado correctamente.", "success", "Equipos ASIC");
      } else {
        const res = await createEquipo({
          ...basePayload,
          ...(formData.precioHistorialLocal.length > 0
            ? { precioHistorialJson: JSON.stringify(formData.precioHistorialLocal) }
            : {}),
        });
        setEquipos((prev) => [
          ...prev,
          {
            id: res.id,
            numeroSerie: res.numeroSerie,
            fechaIngreso: res.fechaIngreso,
            marcaEquipo: formData.marcaEquipo,
            modelo: formData.modelo,
            procesador: formData.procesador,
            precioUSD: formData.precioUSD,
            precioHistorial: formData.precioHistorialLocal.length > 0 ? formData.precioHistorialLocal : undefined,
            observaciones: formData.observaciones || undefined,
            marketplaceVisible: mp.marketplaceVisible,
            marketplaceAlgo: mp.marketplaceAlgo,
            marketplaceHashrateDisplay: mp.marketplaceHashrateDisplay,
            marketplaceImageSrc: mp.marketplaceImageSrc,
            marketplaceGalleryJson: mp.marketplaceGalleryJson,
            marketplaceDetailRowsJson: mp.marketplaceDetailRowsJson,
            marketplaceYieldJson: mp.marketplaceYieldJson,
            marketplaceSortOrder: mp.marketplaceSortOrder,
            marketplacePriceLabel: mp.marketplacePriceLabel ?? null,
            marketplaceListingKind: mp.marketplaceListingKind ?? null,
          },
        ]);
        showToast("Equipo agregado correctamente.", "success", "Equipos ASIC");
      }
      const refreshed = await getEquipos();
      const items = refreshed.items ?? [];
      setEquipos(items);
      const savedId = editingEquipo?.id;
      setDetailEquipo((d) => {
        if (!d || !savedId || d.id !== savedId) return d;
        return items.find((x) => x.id === savedId) ?? d;
      });
      setShowPrecioModal(false);
      setPrecioHistorialFullPayload(null);
      setShowAddModal(false);
      setEditingEquipo(null);
      setFormData(emptyEquipoForm());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error", "Equipos ASIC");
    }
  }

  function handleEdit(e: EquipoASIC) {
    setEditingEquipo(e);
    setShowPrecioModal(false);
    setFormData({
      fechaIngreso: e.fechaIngreso,
      marcaEquipo: e.marcaEquipo,
      modelo: e.modelo,
      procesador: e.procesador,
      precioUSD: e.precioUSD,
      precioHistorialLocal: sortPrecioHistorialAsc(e.precioHistorial ?? []),
      observaciones: e.observaciones ?? "",
      marketplaceVisible: e.marketplaceVisible ?? false,
      marketplacePriceConsultMode: Boolean(e.marketplacePriceLabel?.trim()) && (e.precioUSD ?? 0) <= 0,
      marketplacePriceLabel: e.marketplacePriceLabel?.trim() ?? "",
      marketplaceImageSrc: e.marketplaceImageSrc ?? "",
      marketplaceGalleryLines: galleryLinesFromJson(e.marketplaceGalleryJson),
      marketplaceDetailRowsJson: e.marketplaceDetailRowsJson ?? "",
    });
    setShowAddModal(true);
  }

  function openPrecioModal() {
    if (!canEditTienda) return;
    if (formData.marketplacePriceConsultMode) {
      showToast("Desactivá «Precio bajo consulta» para cargar un importe fijo en USD.", "warning", "Equipos ASIC");
      return;
    }
    setPrecioModalInput(formData.precioUSD > 0 ? String(formData.precioUSD) : "");
    setShowPrecioModal(true);
  }

  function closePrecioModal() {
    setShowPrecioModal(false);
    setPrecioModalSaving(false);
  }

  function dismissAddModal() {
    setShowPrecioModal(false);
    setPrecioHistorialFullPayload(null);
    setShowAddModal(false);
    setEditingEquipo(null);
    setFormData(emptyEquipoForm());
  }

  async function handleConfirmPrecioModal() {
    if (!canEditTienda) return;
    if (formData.marketplacePriceConsultMode) {
      showToast("Desactivá «Precio bajo consulta» antes de guardar un precio en USD.", "warning", "Equipos ASIC");
      return;
    }
    const newP = Math.max(0, parseInt(precioModalInput, 10) || 0);
    if (newP <= 0) {
      showToast("Ingresá un precio mayor a 0.", "error", "Equipos ASIC");
      return;
    }
    if (newP === formData.precioUSD) {
      showToast("El precio debe ser distinto al actual.", "error", "Equipos ASIC");
      return;
    }
    /** Momento exacto del clic en «Guardar precio» (histórico local hasta que el servidor confirme). */
    const isoAlGuardar = new Date().toISOString();
    try {
      setPrecioModalSaving(true);
      if (editingEquipo) {
        await updateEquipo(editingEquipo.id, {
          ...buildEquipoSavePayload({ ...formData, precioUSD: newP }),
        });
        const refreshed = await getEquipos();
        const items = refreshed.items ?? [];
        setEquipos(items);
        const row = items.find((x) => x.id === editingEquipo.id);
        setFormData((prev) => ({
          ...prev,
          precioUSD: newP,
          marketplacePriceConsultMode: false,
          marketplacePriceLabel: "",
          precioHistorialLocal: sortPrecioHistorialAsc(row?.precioHistorial ?? []),
        }));
        showToast("Precio actualizado.", "success", "Equipos ASIC");
      } else {
        setFormData((prev) => ({
          ...prev,
          precioUSD: newP,
          marketplacePriceConsultMode: false,
          marketplacePriceLabel: "",
          precioHistorialLocal: appendPrecioHistorialClient(prev.precioHistorialLocal, newP, isoAlGuardar),
        }));
        showToast("Precio registrado. Confirmá con «Guardar» para crear el equipo.", "success", "Equipos ASIC");
      }
      closePrecioModal();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar precio", "error", "Equipos ASIC");
    } finally {
      setPrecioModalSaving(false);
    }
  }

  function openEquipoDetail(e: EquipoASIC) {
    setDetailEquipo(e);
    setDetailYieldLines(null);
    setDetailYieldNote(null);
    setDetailYieldHint(null);
    const lk =
      e.marketplaceListingKind === "miner" || e.marketplaceListingKind === "infrastructure"
        ? e.marketplaceListingKind
        : undefined;
    const isMinerListing =
      resolveMarketplaceListingKind({ brand: e.marcaEquipo, model: e.modelo, listingKind: lk }) === "miner";
    if (!isMinerListing) {
      setDetailYieldLoading(false);
      return;
    }
    setDetailYieldLoading(true);
    getEquipoWhatToMineYield(e.id)
      .then((res) => {
        if (res.yield) {
          setDetailYieldLines({ line1: res.yield.line1, line2: res.yield.line2 });
          setDetailYieldNote(res.yield.note);
          setDetailYieldHint(null);
        } else {
          setDetailYieldLines(null);
          setDetailYieldNote(null);
          setDetailYieldHint(res.hint ?? "Sin datos de rendimiento.");
        }
      })
      .catch((err) => {
        setDetailYieldHint(err instanceof Error ? err.message : "Error al consultar WhatToMine.");
        setDetailYieldLines(null);
        setDetailYieldNote(null);
      })
      .finally(() => setDetailYieldLoading(false));
  }

  function closeEquipoDetail() {
    setDetailEquipo(null);
    setDetailYieldLines(null);
    setDetailYieldNote(null);
    setDetailYieldHint(null);
    setDetailYieldLoading(false);
  }

  function openPrecioHistorialFullFromEquipo(e: EquipoASIC) {
    const hist = e.precioHistorial ?? [];
    if (!hist.length) return;
    setPrecioHistorialFullPayload({
      historial: sortPrecioHistorialAsc(hist),
      marca: e.marcaEquipo,
      modelo: e.modelo,
      procesador: e.procesador,
      codigoProducto: e.numeroSerie ?? null,
    });
  }

  function handleDeleteRequest(e: EquipoASIC) {
    setEquipoDeleteConfirm(e);
  }

  async function handleDeleteEquipoConfirmado() {
    const e = equipoDeleteConfirm;
    if (!e) return;
    setDeletingSingleEquipo(true);
    try {
      await deleteEquipo(e.id);
      setEquipos((prev) => prev.filter((eq) => eq.id !== e.id));
      setEquipoDeleteConfirm(null);
      if (detailEquipo?.id === e.id) {
        setDetailEquipo(null);
        setDetailYieldLines(null);
        setDetailYieldNote(null);
        setDetailYieldHint(null);
      }
      showToast("Equipo eliminado correctamente.", "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al eliminar", "error", "Equipos ASIC");
    } finally {
      setDeletingSingleEquipo(false);
    }
  }

  function handleDeleteEquipoCancel() {
    setEquipoDeleteConfirm(null);
  }

  function handleDeleteAllClick() {
    setShowDeleteConfirm1(true);
  }

  function handleDeleteConfirm1() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(true);
  }

  async function handleDeleteConfirm2() {
    setShowDeleteConfirm2(false);
    setDeleting(true);
    try {
      await deleteEquiposAll();
      setEquipos([]);
      showToast("Todos los equipos han sido eliminados.", "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al eliminar", "error", "Equipos ASIC");
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx =
      file.name.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (!isXlsx) {
      showToast("Elegí un archivo Excel (.xlsx).", "error", "Equipos ASIC");
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    e.target.value = "";
    try {
      const parsed = await parseExcelEquipos(file);
      if (parsed.length === 0) {
        showToast(
          "No se encontraron filas válidas en el Excel. Use encabezados: Código de Producto (o Nº Serie), Fecha Ingreso, Marca Equipo, Modelo, Procesador, Precio USD, Observaciones.",
          "error",
          "Equipos ASIC"
        );
        setExcelLoading(false);
        return;
      }
      const items = parsed.map((row) => ({
        fechaIngreso: row.fechaIngreso,
        marcaEquipo: row.marcaEquipo,
        modelo: row.modelo,
        procesador: row.procesador,
        precioUSD: row.precioUSD ?? 0,
        observaciones: row.observaciones,
        numeroSerie: row.numeroSerie,
      }));
      const res = await createEquiposBulk(items);
      const { items: updated } = await getEquipos();
      setEquipos(updated ?? []);
      showToast(`Se importaron ${res.inserted} equipo(s) correctamente.`, "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al importar Excel.", "error", "Equipos ASIC");
    } finally {
      setExcelLoading(false);
    }
  }

  function exportExcel() {
    if (equipos.length === 0) {
      showToast("No hay equipos para exportar.", "warning", "Equipos ASIC");
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Equipos ASIC");

    ws.columns = [
      { header: "Código de Producto", key: "numeroSerie", width: 18 },
      { header: "Fecha Ingreso", key: "fechaIngreso", width: 18 },
      { header: "Marca Equipo", key: "marcaEquipo", width: 25 },
      { header: "Modelo", key: "modelo", width: 30 },
      { header: "Procesador", key: "procesador", width: 25 },
      { header: "Precio USD", key: "precioUSD", width: 14 },
      { header: "Observaciones", key: "observaciones", width: 35 },
    ];

    equipos.forEach((eq) => {
      ws.addRow({
        numeroSerie: eq.numeroSerie ?? "—",
        fechaIngreso: eq.fechaIngreso,
        marcaEquipo: eq.marcaEquipo,
        modelo: eq.modelo,
        procesador: eq.procesador,
        precioUSD: eq.precioUSD ?? 0,
        observaciones: eq.observaciones ?? "",
      });
    });

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D5D46" }
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
    });

    wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0].replace(/-/g, "");
      saveAs(new Blob([buf]), `Equipos_ASIC_${fecha}.xlsx`);
      showToast("Excel exportado correctamente.", "success", "Equipos ASIC");
    });
  }

  const filteredEquipos = equipos.filter((e) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      e.marcaEquipo?.toLowerCase().includes(searchLower) ||
      e.modelo?.toLowerCase().includes(searchLower) ||
      e.procesador?.toLowerCase().includes(searchLower) ||
      e.numeroSerie?.toLowerCase().includes(searchLower)
    );
  });

  const equiposEnTienda = filteredEquipos.filter((e) => e.marketplaceVisible);
  const equiposFueraTienda = filteredEquipos.filter((e) => !e.marketplaceVisible);

  const grillaEquipos = (list: EquipoASIC[]) => (
    <div className="hrs-asic-dash-grid">
      {list.map((e) => (
        <EquipoAsicDashboardCard
          key={e.id}
          equipo={e}
          canEdit={canEdit}
          onDetail={openEquipoDetail}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
        />
      ))}
    </div>
  );

  return (
    <Box minH="100vh" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }} bgGradient="linear(135deg, #f0fdf4 0%, #ffffff 30%, #f0f9f4 100%)">
      <Box maxW="1300px" mx="auto">
        <PageHeader title="Equipos ASIC" />

        <AppCard mt={4} p={{ base: 4, md: 5 }}>
          <div className="clientes-filtros-outer">
            <div className="clientes-filtros-container">
              <AppCard className="clientes-filtros-card">
                <Heading size="sm" borderBottomWidth="1px" borderColor="gray.200" pb={2} mb={2}>🔍 Filtros</Heading>
                <div className="row g-2 align-items-end">
                  <div className="col-md-4">
                    <AppInput
                      label="Buscar"
                      placeholder="Marca, modelo, código de producto o procesador..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      size="sm"
                      rootProps={{ mb: 0 }}
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end filtros-limpiar-col">
                    <AppButton variant="outline" className="filtros-limpiar-btn" onClick={() => setSearchTerm("")}>
                      Limpiar
                    </AppButton>
                  </div>
                  <div className="col-md-auto d-flex align-items-end gap-2 ms-auto">
                    {canEditTienda ? (
                      <>
                        <Input
                          ref={excelFileInputRef}
                          type="file"
                          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          display="none"
                          onChange={handleExcelImport}
                          disabled={excelLoading}
                        />
                        <AppButton
                          type="button"
                          variant="outline"
                          className="historial-import-excel-btn mb-0"
                          bg="rgba(45, 93, 70, 0.35)"
                          cursor={excelLoading ? "not-allowed" : "pointer"}
                          disabled={excelLoading}
                          onClick={() => excelFileInputRef.current?.click()}
                        >
                          {excelLoading ? "⏳ Importando..." : "📥 Importar Excel"}
                        </AppButton>
                      </>
                    ) : null}
                    {canExportData && (
                      <AppButton variant="outline" className="clientes-export-excel-btn" onClick={exportExcel} disabled={equipos.length === 0}>
                        📊 Exportar Excel
                      </AppButton>
                    )}
                    {canDelete && (
                      <AppButton variant="outline" className="clientes-borrar-todo-btn" onClick={handleDeleteAllClick}>
                        🗑️ Borrar todo
                      </AppButton>
                    )}
                  </div>
                </div>
              </AppCard>
            </div>
          </div>

          <div className="clientes-listado-wrap">
            <Flex justify="space-between" align="center" mb={2} wrap="wrap" gap={2}>
              <Heading size="sm" m={0}>
                ⚙️ Listado de Equipos ASIC ({filteredEquipos.length}
                {filteredEquipos.length > 0 ? (
                  <Text as="span" color="gray.500" fontWeight="normal" fontSize="sm" ml={1}>
                    · Tienda {equiposEnTienda.length} · Inventario {equiposFueraTienda.length}
                  </Text>
                ) : null}
                ){!canEdit && <Text as="span" color="gray.500" fontSize="sm" ml={2}>(solo consulta)</Text>}
              </Heading>
              {canEdit && (
                <AppButton
                  size="sm"
                  onClick={() => {
                    setEditingEquipo(null);
                    setShowPrecioModal(false);
                    setFormData(emptyEquipoForm());
                    setShowAddModal(true);
                  }}
                >
                  ➕ Nuevo Equipo
                </AppButton>
              )}
            </Flex>

            {loading ? (
              <AppCard>
                <Text color="gray.600">Cargando equipos...</Text>
              </AppCard>
            ) : loadError ? (
              <AppCard borderColor="red.300" bg="red.50">
                <Text color="red.700">⚠️ {loadError}</Text>
              </AppCard>
            ) : filteredEquipos.length === 0 ? (
              <AppCard>
                <Text color="gray.700">
                  {searchTerm ? "No se encontraron equipos con ese criterio de búsqueda." : "No hay equipos cargados. Agregá uno con el botón \"Nuevo Equipo\"."}
                </Text>
              </AppCard>
            ) : (
              <div className="hrs-equipo-asic-listado-grupos">
                <div className="mb-4 pb-2 hrs-equipo-asic-listado-grupos--tienda">
                  <Flex as="h6" fontWeight="bold" mb={2} align="center" gap={2} wrap="wrap" borderBottomWidth="1px" borderColor="gray.200" pb={2}>
                    <Badge colorPalette="green">Tienda online</Badge>
                    <Text>Visibles en /marketplace</Text>
                    <Text color="gray.500" fontWeight="normal" fontSize="sm">({equiposEnTienda.length})</Text>
                  </Flex>
                  {equiposEnTienda.length === 0 ? (
                    <p className="text-muted small mb-0">
                      {searchTerm
                        ? "Ningún equipo publicado en tienda coincide con la búsqueda."
                        : "No hay equipos publicados en la tienda online."}
                    </p>
                  ) : (
                    grillaEquipos(equiposEnTienda)
                  )}
                </div>
                <div className="hrs-equipo-asic-listado-grupos--inventory">
                  <button
                    type="button"
                    className="hrs-equipo-asic-inventory-toggle fw-bold mb-2 d-flex flex-wrap align-items-center gap-2 w-100"
                    onClick={toggleSoloInventarioSection}
                    aria-expanded={soloInventarioExpanded}
                    aria-controls="hrs-equipo-asic-solo-inventario-panel"
                    id="hrs-equipo-asic-solo-inventario-heading"
                  >
                    <span className="badge bg-secondary">Solo inventario</span>
                    <span>No visibles en tienda online</span>
                    <span className="text-muted fw-normal small">({equiposFueraTienda.length})</span>
                    <span className="ms-auto d-inline-flex align-items-center gap-1 text-muted fw-normal small">
                      {soloInventarioExpanded ? "Ocultar" : "Mostrar"}
                      <i className={`bi bi-chevron-${soloInventarioExpanded ? "up" : "down"}`} aria-hidden />
                    </span>
                  </button>
                  <div
                    id="hrs-equipo-asic-solo-inventario-panel"
                    role="region"
                    aria-labelledby="hrs-equipo-asic-solo-inventario-heading"
                    hidden={!soloInventarioExpanded}
                  >
                    {equiposFueraTienda.length === 0 ? (
                      <p className="text-muted small mb-0">
                        {searchTerm
                          ? "Ningún equipo fuera de tienda coincide con la búsqueda."
                          : "No hay equipos solo en inventario (todos están publicados)."}
                      </p>
                    ) : (
                      grillaEquipos(equiposFueraTienda)
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </AppCard>

        <AppModal
          open={showDeleteConfirm1}
          onOpenChange={(open) => {
            if (!open) {
              if (advancingDeleteAllWizardRef.current) {
                advancingDeleteAllWizardRef.current = false;
                return;
              }
              handleDeleteCancel();
            }
          }}
          title="Confirmar eliminación"
          footer={
            <Flex gap={2} w="100%" justify="flex-end" wrap="wrap">
              <AppButton variant="outline" onClick={handleDeleteCancel}>
                Cancelar
              </AppButton>
              <AppButton colorPalette="red" onClick={handleDeleteConfirm1}>
                Confirmar
              </AppButton>
            </Flex>
          }
        >
          <Text>
            ¿Estás seguro de que querés eliminar <strong>todos</strong> los equipos?
          </Text>
        </AppModal>

        <AppModal
          open={showDeleteConfirm2}
          onOpenChange={(open) => {
            if (!open && !deleting) handleDeleteCancel();
          }}
          title="Confirmación final"
          closeOnInteractOutside={!deleting}
          footer={
            <Flex gap={2} w="100%" justify="flex-end" wrap="wrap">
              <AppButton variant="outline" onClick={handleDeleteCancel} disabled={deleting}>
                Cancelar
              </AppButton>
              <AppButton colorPalette="red" disabled={deleting} loading={deleting} onClick={handleDeleteConfirm2}>
                {deleting ? "Eliminando..." : "Eliminar todo"}
              </AppButton>
            </Flex>
          }
        >
          <Text color="red.600" fontWeight="bold">
            Esta acción no se puede deshacer.
          </Text>
          <Text mt={2}>¿Realmente querés eliminar todos los equipos?</Text>
        </AppModal>

        <AppModal
          open={Boolean(equipoDeleteConfirm)}
          onOpenChange={(open) => {
            if (!open && !deletingSingleEquipo) handleDeleteEquipoCancel();
          }}
          title="Eliminar equipo"
          closeOnInteractOutside={!deletingSingleEquipo}
          footer={
            <Flex gap={2} w="100%" justify="flex-end" wrap="wrap">
              <AppButton variant="outline" onClick={handleDeleteEquipoCancel} disabled={deletingSingleEquipo}>
                Cancelar
              </AppButton>
              <AppButton
                colorPalette="red"
                disabled={deletingSingleEquipo}
                loading={deletingSingleEquipo}
                onClick={() => void handleDeleteEquipoConfirmado()}
              >
                {deletingSingleEquipo ? "Eliminando…" : "Eliminar"}
              </AppButton>
            </Flex>
          }
        >
          {equipoDeleteConfirm ? (
            <>
              <Text mb={2}>¿Seguro que querés eliminar este producto?</Text>
              <Box as="ul" fontSize="sm" color="gray.600" pl={5} mb={0}>
                <li>
                  <Text as="span" fontWeight="semibold" color="gray.800">
                    {equipoDeleteConfirm.marcaEquipo}
                  </Text>{" "}
                  {equipoDeleteConfirm.modelo}
                </li>
                <li>
                  Código:{" "}
                  <Text as="span" fontWeight="semibold" color="gray.800">
                    {equipoDeleteConfirm.numeroSerie ?? "—"}
                  </Text>
                </li>
                {equipoDeleteConfirm.procesador ? <li>{equipoDeleteConfirm.procesador}</li> : null}
              </Box>
              <Text color="red.600" fontSize="sm" fontWeight="bold" mt={3} mb={0}>
                Esta acción no se puede deshacer.
              </Text>
            </>
          ) : null}
        </AppModal>

        {detailEquipo && equipoDetailModalProduct ? (
          <AsicProductModal
            product={equipoDetailModalProduct}
            onClose={closeEquipoDetail}
            liveYield={equipoDetailLiveYield}
            liveYieldLoading={detailYieldLoading}
            storeTitle="Inventario ASIC"
            storeSub="Ficha del equipo · Misma presentación que la tienda"
            inventoryAside={
              <div className="product-modal__host-card">
                <h3 className="product-modal__host-title">Datos de inventario</h3>
                <table className="product-modal__host-table">
                  <tbody>
                    <tr>
                      <td className="product-modal__host-label">Código de producto</td>
                      <td className="product-modal__host-value">{detailEquipo.numeroSerie ?? "—"}</td>
                    </tr>
                    <tr>
                      <td className="product-modal__host-label">Fecha ingreso</td>
                      <td className="product-modal__host-value">{formatFechaIngresoDisplay(detailEquipo.fechaIngreso)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="product-modal__host-divider" aria-hidden="true" />
                <p className="product-modal__host-loc-txt" style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", lineHeight: 1.45 }}>
                  {detailEquipo.marketplaceVisible ? (
                    <span className="badge bg-success d-inline-flex align-items-center gap-1">
                      <i className="bi bi-check-lg" aria-hidden />
                      Publicado
                    </span>
                  ) : (
                    <span style={{ opacity: 0.88 }}>No publicado</span>
                  )}
                </p>
                {detailEquipo.precioHistorial && detailEquipo.precioHistorial.length > 0 ? (
                  <>
                    <h4 className="product-modal__yield-title" style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
                      Historial precio USD
                    </h4>
                    <table className="product-modal__host-table">
                      <tbody>
                        {sortPrecioHistorialDesc(detailEquipo.precioHistorial).slice(0, 5).map((h, i) => (
                          <tr key={`${h.actualizadoEn}-${i}`}>
                            <td className="product-modal__host-label">USD {h.precioUsd.toLocaleString("es-PY")}</td>
                            <td className="product-modal__host-value">
                              {(() => {
                                const d = new Date(h.actualizadoEn);
                                return Number.isNaN(d.getTime())
                                  ? h.actualizadoEn
                                  : d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="plain"
                  className="product-modal__btn product-modal__btn--outline"
                  mt="0.75rem"
                  w="100%"
                  textAlign="center"
                  fontSize="0.8125rem"
                  disabled={!detailEquipo.precioHistorial?.length}
                  title={
                    detailEquipo.precioHistorial?.length
                      ? "Abrir tabla y gráfico con todo el historial de precios"
                      : "No hay registros de cambios de precio para este equipo"
                  }
                  onClick={() => detailEquipo && openPrecioHistorialFullFromEquipo(detailEquipo)}
                >
                  Ver histórico completo
                </Button>
                {canEditTienda ? (
                  <Button
                    type="button"
                    variant="plain"
                    className="product-modal__btn product-modal__btn--solid"
                    mt="1rem"
                    w="100%"
                    textAlign="center"
                    onClick={() => {
                      const row = detailEquipo;
                      closeEquipoDetail();
                      if (row) {
                        handleEdit(row);
                        setPrecioModalInput(row.precioUSD > 0 ? String(row.precioUSD) : "");
                        setShowPrecioModal(true);
                      }
                    }}
                  >
                    Modificar precio
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : null}

        <Dialog.Root
          open={showAddModal}
          size="xl"
          closeOnInteractOutside={false}
          onOpenChange={(details) => {
            if (!details.open) dismissAddModal();
          }}
        >
          <Portal>
            <Dialog.Backdrop className="professional-modal-overlay" />
            <Dialog.Positioner>
              <Box className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable clientes-new-modal-dialog hrs-equipo-asic-modal-dialog">
                <Dialog.Content
                  className="modal-content professional-modal professional-modal-form clientes-new-modal-content hrs-equipo-asic-modal-content"
                  maxH="92dvh"
                  display="flex"
                  flexDirection="column"
                  overflow="hidden"
                >
                <div className="modal-header professional-modal-header">
                  <div className="professional-modal-icon-wrapper">
                    <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h5 className="modal-title professional-modal-title">
                    {editingEquipo ? "Editar Equipo ASIC" : "Agregar nuevo equipo"}
                  </h5>
                  <CloseButton size="sm" className="professional-modal-close" onClick={dismissAddModal} aria-label="Cerrar" />
                </div>
                <div className="modal-body professional-modal-body" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                  <div className="hrs-equipo-asic-modal-form">
                    <div className="hrs-equipo-asic-modal-form__main">
                      <div className="client-form-column hrs-equipo-asic-modal-form__left">
                        <h3 className="client-form-section-title">Identificación</h3>
                        <div className="hrs-equipo-asic-modal-form__ident-strip">
                          {!editingEquipo ||
                          formData.marketplaceVisible ||
                          Boolean(editingEquipo?.numeroSerie) ? (
                            <div className="fact-field hrs-equipo-asic-modal-form__ident-field">
                              <label className="fact-label">Código de producto</label>
                              <Input
                                type="text"
                                className="fact-input hrs-equipo-asic-modal-form__product-code-input"
                                value={
                                  !editingEquipo
                                    ? vitrinaCodigoDesdeSpecs ?? "—"
                                    : formData.marketplaceVisible
                                      ? vitrinaCodigoDesdeSpecs ?? editingEquipo?.numeroSerie ?? "—"
                                      : editingEquipo?.numeroSerie ?? "—"
                                }
                                readOnly
                                title={
                                  !editingEquipo
                                    ? vitrinaCodigoDesdeSpecs
                                      ? "Código si publicás en tienda. Si no marcás «Publicar en tienda», al guardar se asigna código interno (M…)."
                                      : "Completá marca, modelo y procesador para ver el código vitrina."
                                    : formData.marketplaceVisible
                                      ? "Generado: M + modelo (S21 / L7 / L9) + hashrate numérico (TH/s o MH/s). Se confirma al guardar."
                                      : "Código interno del equipo"
                                }
                                aria-readonly="true"
                              />
                            </div>
                          ) : null}
                          <div className="fact-field hrs-equipo-asic-modal-form__ident-field">
                            <label className="fact-label">Fecha y hora de ingreso</label>
                            {editingEquipo ? (
                              <Input
                                type="text"
                                className="fact-input hrs-equipo-asic-modal-form__product-code-input"
                                readOnly
                                value={formatFechaIngresoDisplay(formData.fechaIngreso)}
                                title="Registrada al crear el equipo; no se puede modificar"
                                aria-readonly="true"
                                cursor="not-allowed"
                              />
                            ) : (
                              <Input
                                type="text"
                                className="fact-input"
                                readOnly
                                value="Al guardar se registra automáticamente (servidor)"
                                title="La fecha y hora se fijan en el momento de crear el equipo"
                                aria-readonly="true"
                                bg="#f9fafb"
                                color="#4b5563"
                                cursor="default"
                              />
                            )}
                          </div>
                        </div>

                        {specsCommitted ? (
                          <div className="hrs-equipo-asic-modal-form__equipo-heading">
                            <div className="hrs-equipo-asic-modal-form__equipo-switch-group">
                              <span className="hrs-equipo-asic-modal-form__equipo-switch-caption">Editar datos</span>
                              <label
                                className="hrs-equipo-asic-modal-form__spec-switch"
                                title={
                                  equipoSpecsEditEnabled
                                    ? "Desactivá para bloquear marca, modelo y procesador"
                                    : "Activá para poder cambiar marca, modelo y procesador"
                                }
                              >
                                <span className="hrs-equipo-asic-modal-form__spec-switch-track" aria-hidden />
                                <input
                                  type="checkbox"
                                  className="hrs-equipo-asic-modal-form__spec-switch-input"
                                  role="switch"
                                  checked={equipoSpecsEditEnabled}
                                  onChange={(e) => setEquipoSpecsEditEnabled(e.target.checked)}
                                  aria-label="Habilitar edición de marca, modelo y procesador"
                                />
                              </label>
                            </div>
                          </div>
                        ) : null}
                        <div className="hrs-equipo-asic-modal-form__equipo-fields">
                          <div className="fact-field">
                            <label className="fact-label">Marca *</label>
                            <NativeSelect.Root disabled={specsFieldsLocked} width="100%">
                              <NativeSelect.Field
                                className={
                                  "fact-input" + (specsFieldsLocked ? " hrs-equipo-asic-modal-form__spec-input--locked" : "")
                                }
                                value={formData.marcaEquipo}
                                onChange={(e) => setFormData({ ...formData, marcaEquipo: e.target.value })}
                                aria-label="Marca del equipo"
                              >
                                <option value="">Seleccionar…</option>
                                {opcionesMarcaConActual(formData.marcaEquipo).map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </NativeSelect.Field>
                              <NativeSelect.Indicator />
                            </NativeSelect.Root>
                          </div>
                          <div className="fact-field">
                            <label className="fact-label">Modelo *</label>
                            <NativeSelect.Root disabled={specsFieldsLocked} width="100%">
                              <NativeSelect.Field
                                className={
                                  "fact-input" + (specsFieldsLocked ? " hrs-equipo-asic-modal-form__spec-input--locked" : "")
                                }
                                value={(() => {
                                  const opts = opcionesModeloConActual(formData.modelo);
                                  return opts.includes(formData.modelo) ? formData.modelo : "";
                                })()}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const nuevoProc = procesadorTrasCambioModelo(formData.modelo, v, formData.procesador);
                                  setFormData({
                                    ...formData,
                                    modelo: v,
                                    procesador: nuevoProc,
                                  });
                                }}
                                aria-label="Modelo del equipo"
                              >
                                <option value="">Seleccionar…</option>
                                {opcionesModeloConActual(formData.modelo).map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </NativeSelect.Field>
                              <NativeSelect.Indicator />
                            </NativeSelect.Root>
                          </div>
                          <div className="fact-field">
                            <label className="fact-label">Procesador *</label>
                            {(() => {
                              const fam = familiaProcesadorPreset(formData.modelo);
                              if (fam) {
                                const opts = opcionesProcesadorSelect(fam, formData.procesador);
                                const val =
                                  formData.procesador && opts.includes(formData.procesador) ? formData.procesador : "";
                                return (
                                  <NativeSelect.Root disabled={specsFieldsLocked} width="100%">
                                    <NativeSelect.Field
                                      className={
                                        "fact-input" +
                                        (specsFieldsLocked ? " hrs-equipo-asic-modal-form__spec-input--locked" : "")
                                      }
                                      value={val}
                                      onChange={(e) => setFormData({ ...formData, procesador: e.target.value })}
                                      aria-label="Hashrate (procesador)"
                                    >
                                      <option value="">Seleccionar hashrate…</option>
                                      {opts.map((o) => (
                                        <option key={o} value={o}>
                                          {o}
                                        </option>
                                      ))}
                                    </NativeSelect.Field>
                                    <NativeSelect.Indicator />
                                  </NativeSelect.Root>
                                );
                              }
                              return (
                                <Input
                                  type="text"
                                  className={
                                    "fact-input" +
                                    (specsFieldsLocked ? " hrs-equipo-asic-modal-form__spec-input--locked" : "")
                                  }
                                  value={formData.procesador}
                                  onChange={(e) => setFormData({ ...formData, procesador: e.target.value })}
                                  readOnly={specsFieldsLocked}
                                  placeholder={(() => {
                                    const mod = (formData.modelo ?? "").trim().toLowerCase();
                                    if (/\bz15\b/.test(mod)) return "Ej: 840 kSol/s";
                                    const u = unidadProcesadorDesdeModelo(formData.modelo);
                                    if (u === "th") return "Ej: 245 TH/s";
                                    if (u === "mh") return "Ej: 17.000 MH/s";
                                    return "Ej: 245 TH/s o 17.000 MH/s";
                                  })()}
                                  required
                                />
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      <aside className="hrs-equipo-asic-modal-form__price-card" aria-label="Precio y cotización">
                        <p className="hrs-equipo-asic-modal-form__price-eyebrow">Precio de lista</p>
                        <p className="hrs-equipo-asic-modal-form__price-currency">USD</p>
                        <p className="hrs-equipo-asic-modal-form__price-amount">
                          {formData.marketplacePriceConsultMode
                            ? "—"
                            : formData.precioUSD > 0
                              ? formData.precioUSD.toLocaleString("es-PY")
                              : "—"}
                        </p>
                        <Button
                          type="button"
                          variant="plain"
                          className="hrs-equipo-asic-modal-form__price-btn"
                          onClick={openPrecioModal}
                          disabled={!canEditTienda || formData.marketplacePriceConsultMode}
                          title={
                            formData.marketplacePriceConsultMode
                              ? "Desactivá «Precio bajo consulta» para cargar un importe fijo en USD."
                              : !canEditTienda
                                ? "Solo AdministradorA o AdministradorB pueden cambiar el precio."
                                : undefined
                          }
                        >
                          Modificar precio
                        </Button>
                        {canEditTienda ? (
                          <label className="hrs-equipo-asic-modal-form__price-consult-toggle hrs-equipo-asic-modal-form__price-consult-toggle--after-list-price">
                            <input
                              type="checkbox"
                              className="hrs-equipo-asic-modal-form__price-consult-checkbox"
                              checked={formData.marketplacePriceConsultMode}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setFormData((prev) => ({
                                  ...prev,
                                  marketplacePriceConsultMode: on,
                                  marketplacePriceLabel:
                                    on && !prev.marketplacePriceLabel.trim()
                                      ? DEFAULT_MARKETPLACE_PRICE_LABEL
                                      : prev.marketplacePriceLabel,
                                  precioUSD: on ? 0 : prev.precioUSD,
                                  ...(on ? { precioHistorialLocal: [] } : {}),
                                }));
                              }}
                            />
                            <span className="hrs-equipo-asic-modal-form__price-consult-toggle-text">
                              <strong>Precio bajo consulta en tienda</strong>
                            </span>
                          </label>
                        ) : null}
                        {formData.precioHistorialLocal.length > 0 ? (
                          <Button
                            type="button"
                            variant="plain"
                            className="hrs-equipo-asic-price-history-link"
                            onClick={() =>
                              setPrecioHistorialFullPayload({
                                historial: formData.precioHistorialLocal,
                                marca: formData.marcaEquipo,
                                modelo: formData.modelo,
                                procesador: formData.procesador,
                                codigoProducto: editingEquipo?.numeroSerie ?? null,
                              })
                            }
                          >
                            {formData.precioHistorialLocal.length} cambio(s) en historial — ver todo
                          </Button>
                        ) : (
                          <p className="hrs-equipo-asic-modal-form__price-meta hrs-equipo-asic-modal-form__price-meta--dim">
                            Sin historial aún
                          </p>
                        )}
                      </aside>
                    </div>

                    <div className="hrs-equipo-asic-modal-form__market">
                      <h3 className="client-form-section-title">Tienda online / Marketplace</h3>
                      {!canEditTienda ? (
                        <p className="small text-muted mb-2">
                          Solo <strong>AdministradorA</strong> o <strong>AdministradorB</strong> pueden publicar en la tienda, subir fotos del anuncio o modificar precios. Podés editar el resto de la ficha si el equipo no está publicado.
                        </p>
                      ) : null}
                      <div className="hrs-equipo-asic-modal-form__market-inner">
                        <div className="client-form-column hrs-equipo-asic-modal-form__col-spec">
                          {canEditTienda ? (
                            <div className="hrs-equipo-asic-modal-form__detail-rows-panel">
                              <MarketplaceDetailRowsEditor
                                value={formData.marketplaceDetailRowsJson}
                                onChange={(marketplaceDetailRowsJson) => setFormData({ ...formData, marketplaceDetailRowsJson })}
                                disabled={!canEditTienda}
                              />
                            </div>
                          ) : null}
                          <div className="hrs-equipo-asic-modal-form__vitrina-callout hrs-equipo-asic-modal-form__vitrina-callout--under-detail-rows">
                            <div className="hrs-equipo-asic-modal-form__vitrina-callout-inner">
                              <input
                                type="checkbox"
                                id="mp-visible"
                                className="hrs-equipo-asic-modal-form__vitrina-checkbox"
                                checked={formData.marketplaceVisible}
                                disabled={!canEditTienda}
                                onChange={(e) => setFormData({ ...formData, marketplaceVisible: e.target.checked })}
                              />
                              <div className="hrs-equipo-asic-modal-form__vitrina-callout-text">
                                <label htmlFor="mp-visible" className="hrs-equipo-asic-modal-form__vitrina-callout-title">
                                  Publicar en tienda
                                </label>
                                <p className="hrs-equipo-asic-modal-form__vitrina-callout-sub">
                                  Hacé visible este equipo en el catálogo público <strong>/marketplace</strong>.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        {canEditTienda ? (
                          <div className="client-form-column hrs-equipo-asic-modal-form__col-media">
                            <div className="hrs-equipo-asic-modal-form__media-panel">
                              <p className="hrs-equipo-asic-modal-form__media-panel-title">Fotos del anuncio</p>
                              <CardImageUploadField
                                value={formData.marketplaceImageSrc}
                                onChange={(marketplaceImageSrc) => setFormData({ ...formData, marketplaceImageSrc })}
                                disabled={!canEditTienda}
                              />
                              <GalleryImagesUploadField
                                lines={formData.marketplaceGalleryLines}
                                onLinesChange={(marketplaceGalleryLines) => setFormData({ ...formData, marketplaceGalleryLines })}
                                disabled={!canEditTienda}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer professional-modal-footer">
                  <div className="d-flex gap-2 flex-wrap w-100" style={{ justifyContent: "flex-end" }}>
                    <Button type="button" variant="plain" className="fact-btn fact-btn-secondary" onClick={dismissAddModal}>
                      Cancelar
                    </Button>
                    <Button type="button" variant="plain" className="fact-btn fact-btn-primary" onClick={handleSave}>
                      {editingEquipo ? "Actualizar" : "Guardar"}
                    </Button>
                  </div>
                </div>
                </Dialog.Content>
              </Box>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
        {precioHistorialFullPayload ? (
          <PrecioHistorialFullModal
            open
            onClose={() => setPrecioHistorialFullPayload(null)}
            historial={precioHistorialFullPayload.historial}
            marca={precioHistorialFullPayload.marca}
            modelo={precioHistorialFullPayload.modelo}
            procesador={precioHistorialFullPayload.procesador}
            codigoProducto={precioHistorialFullPayload.codigoProducto}
          />
        ) : null}
        <Dialog.Root
          open={showPrecioModal}
          size="md"
          closeOnInteractOutside={!precioModalSaving}
          closeOnEscape={!precioModalSaving}
          onOpenChange={(details) => {
            if (!details.open && !precioModalSaving) closePrecioModal();
          }}
        >
          <Portal>
            <Dialog.Backdrop className="professional-modal-overlay hrs-equipo-precio-modal-overlay" />
            <Dialog.Positioner>
              <Box className="modal-dialog modal-dialog-centered modal-dialog-scrollable hrs-equipo-precio-modal-dialog">
                <Dialog.Content
                  className="modal-content professional-modal hrs-equipo-precio-modal-content"
                  maxH="88dvh"
                  display="flex"
                  flexDirection="column"
                  overflow="hidden"
                >
                <div className="modal-header professional-modal-header">
                  <h5 id="hrs-precio-modal-title" className="modal-title professional-modal-title">
                    Modificar precio USD
                  </h5>
                  <CloseButton
                    size="sm"
                    className="professional-modal-close"
                    onClick={closePrecioModal}
                    disabled={precioModalSaving}
                    aria-label="Cerrar"
                  />
                </div>
                <div
                  className="modal-body professional-modal-body hrs-equipo-precio-modal-body"
                  style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
                >
                  <p className="small text-muted mb-3 hrs-equipo-precio-modal-intro">
                    Indicá el nuevo precio. La <strong>fecha y hora del cambio</strong> se guardan automáticamente en el
                    momento en que pulsás <strong>Guardar precio</strong>.{" "}
                    {!editingEquipo ? "Al crear el equipo, confirmá también con «Guardar» del formulario principal." : null}
                  </p>
                  <div className="fact-field hrs-equipo-precio-modal-field">
                    <label className="fact-label">Precio USD *</label>
                    <Input
                      type="number"
                      min={1}
                      className="fact-input hrs-equipo-precio-modal-input"
                      value={precioModalInput}
                      onChange={(e) => setPrecioModalInput(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Ej: 5200"
                    />
                  </div>
                  {formData.precioHistorialLocal.length > 0 ? (
                    <>
                      <h6 className="hrs-equipo-precio-modal-history-title">
                        Histórico de precios
                      </h6>
                      <div className="table-responsive hrs-equipo-precio-modal-history-wrap">
                        <table className="table table-sm table-bordered mb-0 small hrs-equipo-precio-modal-history-table">
                          <thead className="sticky-top">
                            <tr>
                              <th>Precio USD</th>
                              <th>Fecha / hora</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortPrecioHistorialDesc(formData.precioHistorialLocal).slice(0, 5).map((h, i) => (
                              <tr key={`${h.actualizadoEn}-${i}`}>
                                <td>{h.precioUsd.toLocaleString("es-PY")}</td>
                                <td className="text-muted">
                                  {(() => {
                                    const dt = new Date(h.actualizadoEn);
                                    return Number.isNaN(dt.getTime())
                                      ? h.actualizadoEn
                                      : dt.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="small text-muted mb-0 mt-2">Aún no hay histórico; el primer registro será este precio.</p>
                  )}
                </div>
                <div className="modal-footer professional-modal-footer">
                  <Button
                    type="button"
                    variant="plain"
                    className="fact-btn fact-btn-secondary"
                    onClick={closePrecioModal}
                    disabled={precioModalSaving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="plain"
                    className="fact-btn fact-btn-primary"
                    onClick={handleConfirmPrecioModal}
                    disabled={precioModalSaving}
                  >
                    {precioModalSaving ? "Guardando…" : "Guardar precio"}
                  </Button>
                </div>
                </Dialog.Content>
              </Box>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </Box>
    </Box>
  );
}
