import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Flex } from "@chakra-ui/react";
import NiceHashWatcherDashboard from "../components/NiceHashWatcherDashboard";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { AppButton, AppModal } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import {
  MONITOR_POOL_OPTIONS,
  coerceMonitorPool,
  emptyMonitorEquipoAsicRow,
  potenciaChoicesWithCurrent,
  type MonitorEquipoAsicRow,
} from "../data/monitorEquiposAsicData";
import {
  getMonitorEquiposAsicHistorial,
  isBenignFetchAbort,
  postMonitorEquipoAsicBaja,
  postMonitorEquiposAsicHistorialFeed,
  postMonitorEquiposAsicHistorialNote,
  postMonitorEquiposAsicHistorialSummary,
  wakeUpBackend,
  type MonitorEquipoAsicHistorialEntry,
  type MonitorEquipoAsicHistorialFeedEntry,
} from "../lib/api";
import {
  loadHistorialLastReadMap,
  removeHistorialLastReadForEquipo,
  saveHistorialLastReadForEquipo,
} from "../lib/monitorEquiposAsicHistorialRead";
import {
  filterSummaryCacheToRowIds,
  loadMonitorNotasSummaryCache,
  saveMonitorNotasSummaryCache,
} from "../lib/monitorNotasSummaryCache";
import { canAccessMonitorEquiposAsic } from "../lib/auth";
import { loadMonitorEquiposAsicRows, saveMonitorEquiposAsicRows } from "../lib/monitorEquiposAsicStorage";
import "../styles/facturacion.css";

/** Solo UUID (el POST de resumen rechaza el body si mezcla ids viejos). */
const MONITOR_EQUIPO_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Pelotitas visibles ya en el 1er frame usando el último resumen guardado en esta pestaña. */
function initialNotasSummaryFromSessionCache(): Record<string, { total: number; unread: number }> {
  const rows = loadMonitorEquiposAsicRows();
  return filterSummaryCacheToRowIds(loadMonitorNotasSummaryCache(), rows.map((r) => r.equipoId));
}

let notasPingAudioCtx: AudioContext | null = null;

/** Pitido muy breve al aparecer notificación en Notas (animación del ícono respeta “reducir movimiento” en CSS). */
function playNotasBadgePing() {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!notasPingAudioCtx) notasPingAudioCtx = new AC();
    const ctx = notasPingAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, t0);
    osc.frequency.exponentialRampToValueAtTime(990, t0 + 0.07);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.07, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  } catch {
    /* sin permiso de audio o API ausente */
  }
}

/** Sufijo fijo en columna Potencia: MH/s (L7/L9), TH/s (S21). */
function potenciaFixedUnitSuffix(modelo: string): "MH/s" | "TH/s" | null {
  const m = modelo.trim().toUpperCase();
  if (m === "L7" || m === "L9") return "MH/s";
  if (m === "S21") return "TH/s";
  return null;
}

/** KPI circular tipo anillo (SVG): proporción count/total con gradiente y núcleo centrado. */
function MonitorAsicRingGauge({
  label,
  count,
  total,
  variant,
}: {
  label: string;
  count: number;
  total: number;
  variant: "online" | "offline";
}) {
  const uid = useId().replace(/:/g, "");
  const vb = 116;
  const cx = vb / 2;
  const cy = vb / 2;
  const r = 44;
  const strokeW = 11;
  const cLen = 2 * Math.PI * r;
  const pct = total <= 0 ? 0 : Math.min(1, Math.max(0, count / total));
  const dash = pct * cLen;
  const pctRounded = total <= 0 ? null : Math.round(pct * 100);

  const gid = `mar-grad-${variant}-${uid}`;
  const aria = total <= 0 ? `${label}: sin datos` : `${label}: ${count} de ${total} (${pctRounded}%)`;

  return (
    <article
      className={`monitor-asic-dash-card monitor-asic-dash-card--${variant}`}
      aria-label={aria}
    >
      <div className="monitor-asic-dash-card__inner">
        <div className="monitor-asic-dash-ring-host">
          <svg
            className="monitor-asic-dash-svg"
            viewBox={`0 0 ${vb} ${vb}`}
            width="200"
            height="200"
            role="img"
            aria-hidden
          >
            <defs>
              {variant === "online" ? (
                <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4ade80" />
                  <stop offset="55%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#15803d" />
                </linearGradient>
              ) : (
                <linearGradient id={gid} x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fca5a5" />
                  <stop offset="45%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="#b91c1c" />
                </linearGradient>
              )}
              <filter id={`mar-shadow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.12" />
              </filter>
            </defs>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={variant === "online" ? "rgba(34, 197, 94, 0.22)" : "rgba(248, 113, 113, 0.2)"}
              strokeWidth={strokeW + 4}
              opacity={0.85}
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="rgba(148, 163, 184, 0.35)"
              strokeWidth={strokeW}
              className="monitor-asic-dash-track"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${cLen}`}
              transform={`rotate(-90 ${cx} ${cy})`}
              filter={`url(#mar-shadow-${uid})`}
              className="monitor-asic-dash-arc"
            />
          </svg>
          <div className="monitor-asic-dash-core">
            <span className="monitor-asic-dash-core__icon" aria-hidden>
              <i className={`bi ${variant === "online" ? "bi-wifi" : "bi-wifi-off"}`} />
            </span>
            <strong className="monitor-asic-dash-core__n">{count}</strong>
            <span className="monitor-asic-dash-core__label">{label}</span>
            <span className="monitor-asic-dash-core__pct">
              {pctRounded === null ? "—" : `${pctRounded}% del total`}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Icono rack/ASIC usado en la franja verde de cada grupo (estilo monitor original). */
function MonitorAsicSectionMinerIcon() {
  return (
    <svg
      className="monitor-asic-section-miner-icon flex-shrink-0"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M4 3h16a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm0 8h7a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1v-7a1 1 0 011-1zm10 0h6a1 1 0 011 1v3a1 1 0 01-1 1h-6a1 1 0 01-1-1v-3a1 1 0 011-1zm0 6h6a1 1 0 011 1v3a1 1 0 01-1 1h-6a1 1 0 01-1-1v-3a1 1 0 011-1zM6 5h2v2H6V5zm0 11h2v2H6v-2zm10 11H8v2h8v-2z" />
    </svg>
  );
}

function formatHistorialTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-UY", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

function normEmailCompare(s: string): string {
  return s.trim().toLowerCase();
}

/** Burbuja derecha (celeste) = nota del usuario actual; izquierda = otro admin de la app. */
function isHistorialEntryFromCurrentUser(entryEmail: string, currentUserEmail: string | undefined): boolean {
  if (!currentUserEmail?.trim() || !entryEmail.trim()) return false;
  return normEmailCompare(entryEmail) === normEmailCompare(currentUserEmail);
}

function maxHistorialCreatedAtIso(entries: MonitorEquipoAsicHistorialEntry[]): string {
  if (entries.length === 0) return new Date().toISOString();
  return entries.reduce((best, e) => (e.createdAt > best ? e.createdAt : best), entries[0].createdAt);
}

/** Etiqueta corta del equipo (misma lógica que el título del modal Notas). */
function monitorRowNotasLabel(row: MonitorEquipoAsicRow): string {
  return [row.usuario.trim(), row.nombreNuevo.trim()].filter(Boolean).join(" · ") || "Equipo";
}

/** Prefijos guardados en el servidor para distinguir cambios ONLINE/OFFLINE en la línea de tiempo. */
const MONITOR_HISTORIAL_ESTADO_PREFIX_ONLINE = "[[monitor-asic:estado:ONLINE]]";
const MONITOR_HISTORIAL_ESTADO_PREFIX_OFFLINE = "[[monitor-asic:estado:OFFLINE]]";
/** Registrado al dar de baja un equipo (ver POST /monitor-equipos-asic/baja). */
const MONITOR_HISTORIAL_BAJA_PREFIX = "[[monitor-asic:baja]]";

function defaultEstadoHistorialLine(variant: "online" | "offline"): string {
  return variant === "online"
    ? "Marcado como ONLINE (en línea)."
    : "Marcado como OFFLINE (fuera de línea).";
}

function defaultBajaHistorialLine(): string {
  return "Equipo dado de baja.";
}

function parseMonitorAsicHistorialEstado(body: string):
  | { kind: "estado"; variant: "online" | "offline"; userText: string }
  | { kind: "baja"; userText: string }
  | { kind: "text" } {
  if (body.startsWith(MONITOR_HISTORIAL_BAJA_PREFIX)) {
    const rest = body.slice(MONITOR_HISTORIAL_BAJA_PREFIX.length).replace(/^\s*\n+/, "").trim();
    return { kind: "baja", userText: rest };
  }
  if (body.startsWith(MONITOR_HISTORIAL_ESTADO_PREFIX_ONLINE)) {
    return {
      kind: "estado",
      variant: "online",
      userText: body.slice(MONITOR_HISTORIAL_ESTADO_PREFIX_ONLINE.length).trim(),
    };
  }
  if (body.startsWith(MONITOR_HISTORIAL_ESTADO_PREFIX_OFFLINE)) {
    return {
      kind: "estado",
      variant: "offline",
      userText: body.slice(MONITOR_HISTORIAL_ESTADO_PREFIX_OFFLINE.length).trim(),
    };
  }
  return { kind: "text" };
}

/** Clases de globo (estado / baja) + texto a mostrar en feed global y modal de notas. */
function formatMonitorHistorialBubble(body: string): { estadoExtra: string; bodyDisplay: string } {
  const parsed = parseMonitorAsicHistorialEstado(body);
  if (parsed.kind === "estado") {
    return {
      estadoExtra: ` monitor-equipo-notas-modal__entry--estado monitor-equipo-notas-modal__entry--estado-${parsed.variant}`,
      bodyDisplay: parsed.userText || defaultEstadoHistorialLine(parsed.variant),
    };
  }
  if (parsed.kind === "baja") {
    const main = defaultBajaHistorialLine();
    const bodyDisplay = parsed.userText.trim() ? `${main}\n${parsed.userText.trim()}` : main;
    return {
      estadoExtra: " monitor-equipo-notas-modal__entry--estado monitor-equipo-notas-modal__entry--estado-baja",
      bodyDisplay,
    };
  }
  return { estadoExtra: "", bodyDisplay: body };
}

function notasBadgeEquipoHaAbiertoModal(equipoId: string): boolean {
  return Boolean(loadHistorialLastReadMap()[equipoId]?.trim());
}

/** Rojo: no leídas (últ. 20 días). Azul: ya abriste Notas al menos una vez, sin pendientes, con actividad reciente. */
function monitorNotasCirclesVisible(
  c: { total: number; unread: number } | undefined,
  equipoId: string
): boolean {
  if (!c) return false;
  const opened = notasBadgeEquipoHaAbiertoModal(equipoId);
  return c.unread > 0 || (opened && c.unread === 0 && c.total > 0);
}

const MONITOR_ROW_MENU_MIN_W = 200;

type MonitorAsicRowMenuOpen = { equipoId: string; top: number; left: number } | null;

function MonitorAsicNotasBadges({
  counts,
  equipoId,
}: {
  counts: { total: number; unread: number } | undefined;
  equipoId: string;
}) {
  if (!counts || !monitorNotasCirclesVisible(counts, equipoId)) return null;
  const { total, unread } = counts;
  const showRed = unread > 0;
  const showBlue = notasBadgeEquipoHaAbiertoModal(equipoId) && unread === 0 && total > 0;
  if (!showRed && !showBlue) return null;
  const fmt = (n: number) => (n > 99 ? "99+" : String(n));
  return (
    <span className="monitor-asic-notas-badge-stack" aria-hidden>
      {showRed ? (
        <span
          className="monitor-asic-notas-badge monitor-asic-notas-badge--new"
          title={`${unread} ${unread === 1 ? "nota nueva" : "notas nuevas"} (no leídas, últimos 20 días)`}
        >
          {fmt(unread)}
        </span>
      ) : null}
      {showBlue ? (
        <span
          className="monitor-asic-notas-badge monitor-asic-notas-badge--total"
          title={`${total} ${total === 1 ? "nota" : "notas"} en los últimos 20 días (historial ya abierto)`}
        >
          {fmt(total)}
        </span>
      ) : null}
    </span>
  );
}

function MonitorEquiposAsicPageContent() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MonitorEquipoAsicRow[]>(() => loadMonitorEquiposAsicRows());
  const [equipoQuery, setEquipoQuery] = useState("");
  const equipoQNorm = equipoQuery.trim().toLowerCase();

  const [historialModal, setHistorialModal] = useState<{
    equipoId: string;
    label: string;
  } | null>(null);
  const [historialEntries, setHistorialEntries] = useState<MonitorEquipoAsicHistorialEntry[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialNoteDraft, setHistorialNoteDraft] = useState("");
  const [historialSaving, setHistorialSaving] = useState(false);
  const historialNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const historialScrollRef = useRef<HTMLDivElement>(null);
  const globalFeedScrollRef = useRef<HTMLDivElement>(null);

  const [globalFeedEntries, setGlobalFeedEntries] = useState<MonitorEquipoAsicHistorialFeedEntry[]>([]);
  const [globalFeedLoading, setGlobalFeedLoading] = useState(false);
  const [globalFeedError, setGlobalFeedError] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<MonitorAsicRowMenuOpen>(null);


  /** Contadores por equipo para badges Notas (no leídas / total en ventana 20 días, servidor). Hidrata desde sessionStorage. */
  const [notasSummary, setNotasSummary] =
    useState<Record<string, { total: number; unread: number }>>(initialNotasSummaryFromSessionCache);
  const prevNotasSummaryRef = useRef<Record<string, { total: number; unread: number }>>({});

  useLayoutEffect(() => {
    prevNotasSummaryRef.current = { ...notasSummary };
  }, []);

  /** Altura tipo WhatsApp Web: crece con el texto hasta un máximo. */
  useLayoutEffect(() => {
    const el = historialNoteTextareaRef.current;
    if (!el || !historialModal) return;
    el.style.height = "0px";
    const h = Math.min(Math.max(el.scrollHeight, 44), 168);
    el.style.height = `${h}px`;
  }, [historialNoteDraft, historialModal]);

  /** Orden tipo chat: lo más reciente abajo; al cargar o al agregar nota, scroll al final. */
  useLayoutEffect(() => {
    const wrap = historialScrollRef.current;
    if (!wrap || historialLoading || historialEntries.length === 0 || !historialModal) return;
    wrap.scrollTop = wrap.scrollHeight;
  }, [historialEntries, historialLoading, historialModal]);

  /** Feed global: scroll al último mensaje. */
  useLayoutEffect(() => {
    const wrap = globalFeedScrollRef.current;
    if (!wrap || globalFeedLoading || globalFeedEntries.length === 0) return;
    wrap.scrollTop = wrap.scrollHeight;
  }, [globalFeedEntries, globalFeedLoading]);

  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [rowMenu]);

  useEffect(() => {
    if (!rowMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRowMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowMenu]);

  useEffect(() => {
    if (!rowMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-monitor-asic-row-menu-root]")) return;
      setRowMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [rowMenu]);

  const refreshNotasSummary = useCallback(async () => {
    const ids = [...new Set(rows.map((r) => r.equipoId))].filter((id) => MONITOR_EQUIPO_UUID_RE.test(id.trim()));
    if (ids.length === 0) {
      setNotasSummary({});
      saveMonitorNotasSummaryCache({});
      return;
    }
    const lastReadAtByEquipo: Record<string, string | null> = {};
    const stored = loadHistorialLastReadMap();
    for (const id of ids) {
      lastReadAtByEquipo[id] = stored[id] ?? null;
    }
    const payload = { equipoIds: ids, lastReadAtByEquipo };
    const fetchOnce = async () => {
      const { summary } = await postMonitorEquiposAsicHistorialSummary(payload);
      setNotasSummary(summary);
      saveMonitorNotasSummaryCache(summary);
    };
    try {
      await fetchOnce();
    } catch {
      /* Cold start / red: un reintento corto para que las pelotitas aparezcan sin abrir Notas */
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await fetchOnce();
      } catch {
        /* sin toast en segundo plano */
      }
    }
  }, [rows]);

  const refreshGlobalFeed = useCallback(async () => {
    const ids = [...new Set(rows.map((r) => r.equipoId))].filter((id) => MONITOR_EQUIPO_UUID_RE.test(id.trim()));
    if (ids.length === 0) {
      setGlobalFeedEntries([]);
      setGlobalFeedError(null);
      return;
    }
    setGlobalFeedLoading(true);
    setGlobalFeedError(null);
    try {
      const { entries } = await postMonitorEquiposAsicHistorialFeed({ equipoIds: ids, limit: 280 });
      setGlobalFeedEntries(entries);
    } catch (e) {
      if (!isBenignFetchAbort(e)) {
        setGlobalFeedError(e instanceof Error ? e.message : "No se pudo cargar el resumen de notas.");
      } else {
        setGlobalFeedError(null);
      }
      setGlobalFeedEntries([]);
    } finally {
      setGlobalFeedLoading(false);
    }
  }, [rows]);

  /** Resumen enseguida + tras warmup (Vercel): badges y feed de actividad. */
  useEffect(() => {
    void refreshNotasSummary();
    void refreshGlobalFeed();
    void wakeUpBackend()
      .catch(() => {})
      .finally(() => {
        void refreshNotasSummary();
        void refreshGlobalFeed();
      });
  }, [refreshNotasSummary, refreshGlobalFeed]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshNotasSummary();
        void refreshGlobalFeed();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => {
      void refreshNotasSummary();
      void refreshGlobalFeed();
    }, 90_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [refreshNotasSummary, refreshGlobalFeed]);

  /** Sonido al aparecer un círculo (rojo/azul), al subir no leídas, o al hidratar el resumen con algún badge. */
  useEffect(() => {
    const prev = prevNotasSummaryRef.current;
    let play = false;
    for (const id of new Set([...Object.keys(prev), ...Object.keys(notasSummary)])) {
      const p = prev[id];
      const n = notasSummary[id];
      if (!n) continue;
      if (monitorNotasCirclesVisible(n, id) && !monitorNotasCirclesVisible(p, id)) {
        play = true;
        break;
      }
      if (p && n.unread > p.unread) {
        play = true;
        break;
      }
    }
    prevNotasSummaryRef.current = { ...notasSummary };
    if (play) playNotasBadgePing();
  }, [notasSummary]);

  useEffect(() => {
    if (!historialModal) {
      setHistorialEntries([]);
      setHistorialNoteDraft("");
      return;
    }
    setHistorialEntries([]);
    let cancelled = false;
    const equipoId = historialModal.equipoId;
    setHistorialLoading(true);
    void getMonitorEquiposAsicHistorial(equipoId)
      .then((d) => {
        if (cancelled) return;
        setHistorialEntries(d.entries);
        saveHistorialLastReadForEquipo(equipoId, maxHistorialCreatedAtIso(d.entries));
        void refreshNotasSummary();
        void refreshGlobalFeed();
      })
      .catch((e: unknown) => {
        if (!cancelled && !isBenignFetchAbort(e)) {
          showToast(e instanceof Error ? e.message : "Error al cargar historial", "error");
        }
        if (!cancelled) setHistorialEntries([]);
      })
      .finally(() => {
        if (!cancelled) setHistorialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historialModal, refreshNotasSummary]);

  const ringTotal = rows.length;
  const ringOnline = useMemo(() => rows.filter((r) => r.online).length, [rows]);
  const ringOffline = Math.max(0, ringTotal - ringOnline);

  const filteredEquipoRows = useMemo(() => {
    return rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (!equipoQNorm) return true;
      const hay =
        `${row.usuario} ${row.modelo} ${row.potencia} ${row.nombreAnt} ${row.nombreNuevo} ${row.serial} ${row.pool} ${row.comentario ?? ""}`.toLowerCase();
      return hay.includes(equipoQNorm);
    });
  }, [rows, equipoQNorm]);

  /** Agrupa por modelo como en el monitor original (cabecera verde por grupo). */
  const equiposByModelo = useMemo(() => {
    const map = new Map<string, Array<{ row: MonitorEquipoAsicRow; index: number }>>();
    for (const item of filteredEquipoRows) {
      const key = item.row.modelo.trim() || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "es", { numeric: true, sensitivity: "base" })
    );
  }, [filteredEquipoRows]);

  const labelByEquipoId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const id = r.equipoId.trim();
      if (MONITOR_EQUIPO_UUID_RE.test(id)) m.set(id, monitorRowNotasLabel(r));
    }
    return m;
  }, [rows]);

  function patchEquipoRow(index: number, patch: Partial<MonitorEquipoAsicRow>) {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;
      next[index] = { ...cur, ...patch };
      saveMonitorEquiposAsicRows(next);
      return next;
    });
  }

  function removeEquipoFromLocalState(equipoId: string) {
    if (historialModal?.equipoId === equipoId) setHistorialModal(null);
    removeHistorialLastReadForEquipo(equipoId);
    setRows((prev) => {
      const next = prev.filter((r) => r.equipoId !== equipoId);
      if (next.length === prev.length) return prev;
      saveMonitorEquiposAsicRows(next);
      const summary = loadMonitorNotasSummaryCache();
      saveMonitorNotasSummaryCache(filterSummaryCacheToRowIds(summary, next.map((r) => r.equipoId)));
      return next;
    });
    setNotasSummary((prev) => {
      const n = { ...prev };
      delete n[equipoId];
      return n;
    });
  }

  function removeEquipoById(equipoId: string) {
    if (
      !window.confirm(
        "¿Eliminar este equipo del listado local? Se quitan los datos guardados en este navegador para esta fila. Las notas en el servidor no se borran."
      )
    ) {
      return;
    }
    setRowMenu(null);
    removeEquipoFromLocalState(equipoId);
    showToast("Equipo quitado del listado local.", "success");
  }

  async function darDeBajaEquipoFromMenu(equipoId: string) {
    const row = rows.find((r) => r.equipoId === equipoId);
    if (!row) {
      showToast("No se encontró la fila del equipo.", "error");
      setRowMenu(null);
      return;
    }
    if (
      !window.confirm(
        "¿Dar de baja este equipo? Se quitará del listado del monitor en este navegador y quedará registrado en el servidor (retiro, venta, etc.). Las notas en el servidor no se eliminan."
      )
    ) {
      return;
    }
    const motivoRaw = window.prompt("Motivo (opcional), ej. venta, retiro de cliente:", "");
    if (motivoRaw === null) return;
    const motivo = motivoRaw.trim();
    setRowMenu(null);
    const rowSnapshot: Record<string, unknown> = { ...row };
    try {
      await postMonitorEquipoAsicBaja({
        equipoId: row.equipoId,
        rowSnapshot,
        ...(motivo ? { motivo } : {}),
      });
      removeEquipoFromLocalState(row.equipoId);
      void refreshGlobalFeed();
      void refreshNotasSummary();
      showToast("Equipo dado de baja. Podés verlo en Equipos ASIC → Equipos ASIC dados de baja.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo registrar la baja en el servidor.", "error");
    }
  }

  async function handleMonitorOnlineToggle(index: number, row: MonitorEquipoAsicRow) {
    if (row.rowLocked) return;
    const wasOnline = row.online;
    const nextOnline = !wasOnline;
    const variant: "online" | "offline" = nextOnline ? "online" : "offline";
    patchEquipoRow(index, { online: nextOnline, luxorOnlineSync: false });
    const prefix = nextOnline ? MONITOR_HISTORIAL_ESTADO_PREFIX_ONLINE : MONITOR_HISTORIAL_ESTADO_PREFIX_OFFLINE;
    const body = `${prefix} ${defaultEstadoHistorialLine(variant)}`;
    try {
      const { entry } = await postMonitorEquiposAsicHistorialNote(row.equipoId, { body });
      void refreshNotasSummary();
      void refreshGlobalFeed();
      if (historialModal?.equipoId === row.equipoId) {
        setHistorialEntries((prev) => [...prev, entry]);
      }
    } catch (e) {
      patchEquipoRow(index, { online: wasOnline, luxorOnlineSync: row.luxorOnlineSync });
      if (!isBenignFetchAbort(e)) {
        showToast(e instanceof Error ? e.message : "No se pudo registrar el cambio en el historial.", "error");
      }
    }
  }

  /** Inserta una fila nueva al final del bloque de ese modelo (clave de grupo = modelo.trim() || "—"). */
  function addEquipoForModelo(modelKey: string) {
    setRows((prev) => {
      const next = [...prev];
      const modeloValue = modelKey === "—" ? "" : modelKey;
      const base = emptyMonitorEquipoAsicRow();
      const newRow: MonitorEquipoAsicRow = {
        ...base,
        modelo: modeloValue,
      };
      let lastIdx = -1;
      for (let i = 0; i < next.length; i++) {
        const k = next[i].modelo.trim() || "—";
        if (k === modelKey) lastIdx = i;
      }
      if (lastIdx === -1) {
        next.push(newRow);
      } else {
        next.splice(lastIdx + 1, 0, newRow);
      }
      saveMonitorEquiposAsicRows(next);
      return next;
    });
    showToast(`Equipo nuevo (${modelKey}). Completá usuario y nombre nuevo.`, "success");
  }

  function openHistorialModal(row: MonitorEquipoAsicRow) {
    setRowMenu(null);
    setHistorialModal({
      equipoId: row.equipoId,
      label: monitorRowNotasLabel(row),
    });
    setHistorialNoteDraft("");
  }

  function openHistorialForEquipoId(equipoId: string) {
    const row = rows.find((r) => r.equipoId.trim() === equipoId.trim());
    if (row) openHistorialModal(row);
  }

  async function submitHistorialNote() {
    const h = historialModal;
    const text = historialNoteDraft.trim();
    if (!h || text.length === 0) {
      showToast("Escribí una nota.", "error");
      return;
    }
    setHistorialSaving(true);
    try {
      const { entry } = await postMonitorEquiposAsicHistorialNote(h.equipoId, { body: text });
      setHistorialEntries((prev) => [...prev, entry]);
      saveHistorialLastReadForEquipo(h.equipoId, entry.createdAt);
      void refreshNotasSummary();
      void refreshGlobalFeed();
      setHistorialNoteDraft("");
      showToast("Nota registrada.", "success");
    } catch (e) {
      if (!isBenignFetchAbort(e)) {
        showToast(e instanceof Error ? e.message : "Error al guardar", "error");
      }
    } finally {
      setHistorialSaving(false);
    }
  }

  return (
    <div className="fact-page mineria-page">
      <div className="container">
        <PageHeader title="Registro de Equipos ASIC" />

        <div className="alert alert-success border-0 shadow-sm mb-3 py-2 px-3 small d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span className="me-2">
            <i className="bi bi-activity me-2" aria-hidden />
            Tablero en vivo NiceHash: misma vista que «TOTAL»; cada equipo se alimenta del enlace watcher (W1…WN) que
            configurás.
          </span>
          <Link to="/asic/monitor-equipos" className="btn btn-sm btn-success rounded-pill text-decoration-none flex-shrink-0">
            Ir al tablero NiceHash
          </Link>
        </div>

        <div className="hrs-card p-4 mb-3">
          <div className="monitor-asic-dash-head mb-3 mb-md-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="h6 mb-0 monitor-asic-dash-kicker">
                <i className="bi bi-speedometer2 me-2 text-success" aria-hidden />
                Panel de estado (listado local)
              </h2>
              <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border px-3 py-2">
                {rows.length === 0
                  ? "Sin equipos"
                  : `${rows.length} ${rows.length === 1 ? "equipo" : "equipos"}`}
                <span className="text-muted fw-normal ms-1 d-none d-md-inline">· guardado en el navegador</span>
              </span>
            </div>
            <div className="row g-3 g-md-4 align-items-stretch">
              <div className="col-12 col-md-6">
                <MonitorAsicRingGauge label="ONLINE" count={ringOnline} total={ringTotal} variant="online" />
              </div>
              <div className="col-12 col-md-6">
                <MonitorAsicRingGauge label="OFFLINE" count={ringOffline} total={ringTotal} variant="offline" />
              </div>
            </div>
          </div>
        </div>

        <div className="hrs-card mb-3 monitor-asic-global-feed border-0 shadow-sm overflow-hidden">
          <div className="monitor-asic-global-feed__head px-3 px-md-4 py-3">
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
              <div className="min-w-0">
                <h2 className="h6 mb-1 monitor-asic-global-feed__title">
                  <i className="bi bi-chat-dots-fill me-2 text-success" aria-hidden />
                  Actividad de notas (todos los equipos)
                </h2>
                <p className="monitor-asic-global-feed__subtitle small mb-0">
                  Resumen unificado: cada línea muestra equipo, hora y quién registró la nota o el cambio de estado. Se
                  actualiza al guardar, al marcar online/offline y cada pocos minutos.
                </p>
              </div>
              <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0">
                {!globalFeedLoading && globalFeedEntries.length > 0 ? (
                  <span className="monitor-asic-global-feed__pill">{globalFeedEntries.length} en pantalla</span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                  disabled={globalFeedLoading || rows.length === 0}
                  onClick={() => void refreshGlobalFeed()}
                  title="Actualizar ahora"
                >
                  {globalFeedLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden />
                      Cargando…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-arrow-clockwise me-1" aria-hidden />
                      Actualizar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div ref={globalFeedScrollRef} className="monitor-asic-global-feed__scroll" role="log" aria-live="polite">
            {rows.length === 0 ? (
              <div className="monitor-asic-global-feed__empty text-muted small">
                Agregá equipos en la tabla de abajo para ver aquí el historial de notas.
              </div>
            ) : globalFeedError ? (
              <div className="monitor-asic-global-feed__empty text-danger small">{globalFeedError}</div>
            ) : globalFeedLoading && globalFeedEntries.length === 0 ? (
              <div className="monitor-asic-global-feed__empty d-flex align-items-center gap-2 text-muted small">
                <div className="spinner-border spinner-border-sm text-success" role="status" aria-hidden />
                Cargando actividad…
              </div>
            ) : globalFeedEntries.length === 0 ? (
              <div className="monitor-asic-global-feed__empty text-muted small">
                Todavía no hay notas en servidor para estos equipos. Las nuevas aparecerán aquí automáticamente.
              </div>
            ) : (
              <div className="monitor-asic-global-feed__entries px-2 px-md-3 pb-3">
                {globalFeedEntries.map((e) => {
                  const mine = isHistorialEntryFromCurrentUser(e.createdByEmail, user?.email);
                  const { estadoExtra, bodyDisplay } = formatMonitorHistorialBubble(e.body);
                  const equipoLabel =
                    labelByEquipoId.get(e.equipoId) ??
                    (e.equipoLabelHint?.trim() ? e.equipoLabelHint.trim() : null) ??
                    e.equipoId.slice(0, 8);
                  return (
                    <div key={`${e.equipoId}-${e.id}`} className="monitor-asic-global-feed__row">
                      <div className="monitor-asic-global-feed__meta">
                        <button
                          type="button"
                          className="monitor-asic-global-feed__equipo-btn"
                          onClick={() => openHistorialForEquipoId(e.equipoId)}
                          title="Abrir notas de este equipo"
                        >
                          <i className="bi bi-hdd-network me-1" aria-hidden />
                          {equipoLabel}
                        </button>
                        <span className="monitor-asic-global-feed__meta-sep" aria-hidden>
                          ·
                        </span>
                        <time className="monitor-asic-global-feed__time" dateTime={e.createdAt}>
                          {formatHistorialTimestamp(e.createdAt)}
                        </time>
                        <span className="monitor-asic-global-feed__meta-sep" aria-hidden>
                          ·
                        </span>
                        <span className="monitor-asic-global-feed__user" title={e.createdByEmail || undefined}>
                          <i className="bi bi-person-fill me-1" aria-hidden />
                          {e.createdByEmail || "—"}
                        </span>
                      </div>
                      <article
                        className={`monitor-equipo-notas-modal__entry monitor-asic-global-feed__bubble ${mine ? "monitor-equipo-notas-modal__entry--mine" : "monitor-equipo-notas-modal__entry--other"}${estadoExtra}`}
                      >
                        <div className="monitor-equipo-notas-modal__entry-inner">
                          <div className="monitor-equipo-notas-modal__entry-body">{bodyDisplay}</div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="hrs-card p-4 mb-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 className="h6 mb-0 fw-bold text-secondary">
              <i className="bi bi-hdd-network me-2 text-primary" aria-hidden />
              Equipos registrados (listado local)
            </h2>
            <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border px-3 py-2">
              {filteredEquipoRows.length}
              {equipoQuery.trim() ? ` / ${rows.length}` : ""} equipos
            </span>
          </div>

          <div className="mb-3 mb-md-4">
            <label htmlFor="equipo-panel-search" className="form-label small fw-semibold text-secondary mb-1">
              Buscar
            </label>
            <input
              id="equipo-panel-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="Buscar (usuario, modelo, hash, pool, serial...)"
              value={equipoQuery}
              onChange={(e) => setEquipoQuery(e.target.value)}
              autoComplete="off"
            />
            <div className="form-text">Ej. Nicehash, S21, HAYESB…</div>
          </div>

          {rows.length === 0 ? (
            <div className="text-center text-muted py-4 px-3 small rounded-3 border bg-light">
              <p className="mb-3">No hay equipos en el listado local.</p>
              <button
                type="button"
                className="btn btn-success btn-sm rounded-pill px-3"
                onClick={() => addEquipoForModelo("—")}
              >
                <i className="bi bi-plus-lg me-1" aria-hidden />
                Agregar equipo nuevo
              </button>
            </div>
          ) : filteredEquipoRows.length === 0 ? (
            <div className="text-center text-muted py-4 small rounded-3 border bg-light">Ningún equipo coincide con la búsqueda.</div>
          ) : (
            <div className="d-flex flex-column gap-4">
              {equiposByModelo.map(([modelKey, items]) => (
                <div
                  key={modelKey}
                  className="monitor-asic-equipos-group rounded-3 border bg-white shadow-sm overflow-hidden"
                >
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 border-bottom bg-success-subtle">
                    <div className="d-flex align-items-center gap-2 min-w-0">
                      <MonitorAsicSectionMinerIcon />
                      <span className="fw-bold text-success-emphasis text-truncate">Modelo: {modelKey}</span>
                    </div>
                    <div className="d-flex align-items-center flex-wrap gap-2 justify-content-end">
                      <button
                        type="button"
                        className="btn btn-success btn-sm rounded-pill px-2 px-md-3"
                        onClick={() => addEquipoForModelo(modelKey)}
                      >
                        <i className="bi bi-plus-lg me-1" aria-hidden />
                        Agregar equipo
                      </button>
                      <span className="badge rounded-pill bg-white text-success border border-success-subtle px-3 py-2">
                        {items.length} equipos
                      </span>
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table
                      className="table table-sm table-hover align-middle mb-0 small"
                      style={{ minWidth: "1120px" }}
                    >
                      <thead className="table-light">
                        <tr>
                          <th
                            scope="col"
                            className="monitor-asic-edit-switch-th text-center text-nowrap small fw-semibold text-secondary"
                            style={{ width: "3rem" }}
                            title="Habilitá la edición por fila (usuario, potencia, nombres, serial, pool)"
                          >
                            Editar
                          </th>
                          <th scope="col">Usuario</th>
                          <th scope="col">Modelo</th>
                          <th scope="col">Potencia</th>
                          <th scope="col">Nombre ant.</th>
                          <th scope="col">Nombre nuevo</th>
                          <th scope="col">Serial</th>
                          <th scope="col" style={{ minWidth: "7rem" }}>
                            Pool
                          </th>
                          <th scope="col" className="text-center">
                            Online
                          </th>
                          <th scope="col" className="text-nowrap monitor-asic-notas-th" style={{ width: "1%" }}>
                            Notas
                          </th>
                          <th
                            scope="col"
                            className="text-end text-nowrap monitor-asic-row-actions-th"
                            style={{ width: "1%" }}
                          >
                            <span className="visually-hidden">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(({ row, index }) => {
                          const locked = row.rowLocked === true;
                          const potenciaUnit = potenciaFixedUnitSuffix(row.modelo);
                          const potenciaChoices = potenciaChoicesWithCurrent(row.modelo, row.potencia);
                          const notasCounts = notasSummary[row.equipoId];
                          const notasCircles = monitorNotasCirclesVisible(notasCounts, row.equipoId);
                          return (
                            <tr
                              key={`equipo-${row.equipoId}`}
                              className={locked ? "monitor-asic-row--locked" : undefined}
                            >
                              <td className="monitor-asic-edit-switch-cell align-middle bg-white text-center">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={!locked}
                                  className="monitor-asic-edit-switch"
                                  onClick={() => patchEquipoRow(index, { rowLocked: !locked })}
                                  title={
                                    locked
                                      ? "Activá para editar usuario, potencia, nombre ant., nombre nuevo, serial y pool"
                                      : "Desactivá para evitar cambios accidentales en los datos"
                                  }
                                  aria-label={
                                    locked
                                      ? "Habilitar edición de datos del equipo"
                                      : "Deshabilitar edición de datos del equipo"
                                  }
                                >
                                  <span className="monitor-asic-edit-switch__track" aria-hidden>
                                    <span className="monitor-asic-edit-switch__thumb" />
                                  </span>
                                </button>
                              </td>
                              <td style={{ minWidth: "7.5rem" }}>
                                <div className="input-group input-group-sm monitor-asic-usuario-input">
                                  <span className="input-group-text py-0 px-2">
                                    <i className="bi bi-person-fill text-success" aria-hidden />
                                  </span>
                                  <input
                                    className="form-control font-monospace"
                                    value={row.usuario}
                                    disabled={locked}
                                    onChange={(e) => patchEquipoRow(index, { usuario: e.target.value })}
                                    aria-label="Usuario"
                                  />
                                </div>
                              </td>
                              <td style={{ minWidth: "6rem" }}>
                                <div className="input-group input-group-sm monitor-asic-modelo-input">
                                  <span className="input-group-text monitor-asic-modelo-icon-slot py-0 px-2">
                                    <i className="bi bi-gpu-card monitor-asic-miner-glyph" style={{ fontSize: "1.05rem" }} aria-hidden />
                                  </span>
                                  <span
                                    className="form-control form-control-sm bg-body-secondary border font-monospace fw-semibold d-flex align-items-center text-body"
                                    style={{ minHeight: 31 }}
                                    title="Modelo fijo (definido por el grupo de la tabla)"
                                  >
                                    {row.modelo.trim() || "—"}
                                  </span>
                                </div>
                              </td>
                              <td style={{ minWidth: potenciaUnit ? "10.5rem" : "7rem" }}>
                                <div className="input-group input-group-sm monitor-asic-potencia-input">
                                  <span className="input-group-text monitor-asic-potencia-icon-slot py-0 px-2">
                                    <i className="bi bi-speedometer2" aria-hidden />
                                  </span>
                                  {potenciaChoices ? (
                                    <select
                                      className="form-select form-select-sm"
                                      value={row.potencia}
                                      disabled={locked}
                                      onChange={(e) => patchEquipoRow(index, { potencia: e.target.value })}
                                      aria-label="Potencia (elegir)"
                                    >
                                      <option value="">— Elegir —</option>
                                      {potenciaChoices.map((c) => (
                                        <option key={c.value} value={c.value}>
                                          {c.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      className="form-control"
                                      value={row.potencia}
                                      disabled={locked}
                                      onChange={(e) => patchEquipoRow(index, { potencia: e.target.value })}
                                      aria-label="Potencia"
                                    />
                                  )}
                                  {potenciaUnit ? (
                                    <span
                                      className="input-group-text monitor-asic-potencia-unit-suffix py-0 px-2"
                                      title={
                                        potenciaUnit === "MH/s"
                                          ? "Unidad fija: megahash por segundo"
                                          : "Unidad fija: terahash por segundo"
                                      }
                                    >
                                      {potenciaUnit}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td style={{ minWidth: "6.5rem" }}>
                                <input
                                  className="form-control form-control-sm font-monospace"
                                  value={row.nombreAnt}
                                  disabled={locked}
                                  placeholder="—"
                                  onChange={(e) => patchEquipoRow(index, { nombreAnt: e.target.value })}
                                  aria-label="Nombre anterior"
                                />
                              </td>
                              <td style={{ minWidth: "7.5rem" }}>
                                <input
                                  className="form-control form-control-sm font-monospace"
                                  value={row.nombreNuevo}
                                  disabled={locked}
                                  onChange={(e) => patchEquipoRow(index, { nombreNuevo: e.target.value })}
                                  aria-label="Nombre nuevo"
                                />
                              </td>
                              <td style={{ minWidth: "6.5rem" }}>
                                <div className="input-group input-group-sm monitor-asic-serial-input">
                                  <span className="input-group-text monitor-asic-serial-icon-slot py-0 px-2">
                                    <i className="bi bi-upc-scan" aria-hidden />
                                  </span>
                                  <input
                                    className="form-control font-monospace small"
                                    value={row.serial}
                                    disabled={locked}
                                    onChange={(e) => patchEquipoRow(index, { serial: e.target.value })}
                                    aria-label="Serial"
                                  />
                                </div>
                              </td>
                              <td>
                                <select
                                  className="form-select form-select-sm"
                                  value={row.pool}
                                  disabled={locked}
                                  onChange={(e) => patchEquipoRow(index, { pool: coerceMonitorPool(e.target.value) })}
                                  aria-label="Pool"
                                >
                                  {MONITOR_POOL_OPTIONS.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="text-center text-nowrap">
                                <button
                                  type="button"
                                  className={`btn btn-sm rounded-pill px-2 py-1 fw-semibold ${row.online ? "btn-success" : "btn-outline-secondary border-danger text-danger"}`}
                                  style={row.online ? undefined : { borderWidth: "2px" }}
                                  disabled={locked}
                                  title="Cambiás el estado manualmente; queda guardado en este navegador junto al resto de la fila."
                                  onClick={() => void handleMonitorOnlineToggle(index, row)}
                                >
                                  {row.online ? "ONLINE" : "OFFLINE"}
                                </button>
                              </td>
                              <td className="align-middle monitor-asic-notas-td">
                                <span className="position-relative d-inline-block monitor-asic-notas-btn-wrap">
                                  <button
                                    type="button"
                                    className={`btn btn-outline-primary btn-sm rounded-0 px-2 py-1 monitor-asic-notas-btn${notasCircles ? " monitor-asic-notas-btn--badges" : ""}`}
                                    title="Historial en servidor y notas con fecha y usuario"
                                    onClick={() => openHistorialModal(row)}
                                  >
                                    <i
                                      className="bi bi-journal-text me-1 flex-shrink-0 monitor-asic-notas-btn__icon"
                                      aria-hidden
                                      key={notasCircles ? `${notasCounts?.unread ?? 0}-${notasCounts?.total ?? 0}` : "no-badges"}
                                    />
                                    Notas
                                  </button>
                                  <MonitorAsicNotasBadges counts={notasCounts} equipoId={row.equipoId} />
                                </span>
                              </td>
                              <td className="align-middle text-end monitor-asic-row-actions-td">
                                <span data-monitor-asic-row-menu-root>
                                  <button
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm px-2 py-1 monitor-asic-row-menu-trigger"
                                    title="Más acciones"
                                    aria-label="Menú de acciones de la fila"
                                    aria-haspopup="menu"
                                    aria-expanded={rowMenu?.equipoId === row.equipoId}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                      const left = Math.max(
                                        8,
                                        Math.min(rect.left, window.innerWidth - MONITOR_ROW_MENU_MIN_W - 8)
                                      );
                                      setRowMenu((cur) =>
                                        cur?.equipoId === row.equipoId
                                          ? null
                                          : {
                                              equipoId: row.equipoId,
                                              top: rect.bottom + 4,
                                              left,
                                            }
                                      );
                                    }}
                                  >
                                    <i className="bi bi-list" aria-hidden />
                                  </button>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {typeof document !== "undefined" && rowMenu
        ? createPortal(
            <div
              data-monitor-asic-row-menu-root
              className="monitor-asic-row-menu-popover shadow border rounded-2 bg-white py-1"
              style={{
                position: "fixed",
                zIndex: 1080,
                top: rowMenu.top,
                left: rowMenu.left,
                minWidth: `${MONITOR_ROW_MENU_MIN_W}px`,
              }}
              role="presentation"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <ul className="list-unstyled mb-0" role="menu" aria-label="Acciones del equipo">
                <li role="none">
                  <button
                    type="button"
                    className="btn btn-link text-body text-decoration-none w-100 text-start rounded-0 py-2 px-3 d-flex align-items-center gap-2"
                    role="menuitem"
                    onClick={() => void darDeBajaEquipoFromMenu(rowMenu.equipoId)}
                  >
                    <i className="bi bi-box-arrow-down" aria-hidden />
                    Dar de baja equipo
                  </button>
                </li>
                <li role="none">
                  <hr className="dropdown-divider my-0" />
                </li>
                <li role="none">
                  <button
                    type="button"
                    className="btn btn-link text-danger text-decoration-none w-100 text-start rounded-0 py-2 px-3 d-flex align-items-center gap-2"
                    role="menuitem"
                    onClick={() => removeEquipoById(rowMenu.equipoId)}
                  >
                    <i className="bi bi-trash3" aria-hidden />
                    Eliminar del listado local
                  </button>
                </li>
              </ul>
            </div>,
            document.body
          )
        : null}

      <AppModal
        open={historialModal != null}
        onOpenChange={(open) => {
          if (!open) setHistorialModal(null);
        }}
        title={historialModal ? `Notas — ${historialModal.label}` : "Notas"}
        description="Registro centralizado: fecha, hora y usuario. Las notas nuevas quedan guardadas en la base de datos."
        size="xl"
        contentMaxW="min(calc(100vw - 2rem), 980px)"
        titleFontSize="xl"
        descriptionFontSize="md"
        footer={
          <Flex className="monitor-equipo-notas-modal__footer" w="100%" justify="flex-end" align="center">
            <AppButton
              type="button"
              variant="outline"
              colorPalette="gray"
              size="lg"
              minH="2.85rem"
              px={7}
              fontWeight="semibold"
              borderRadius="lg"
              borderWidth="2px"
              className="monitor-equipo-notas-modal__footer-btn monitor-equipo-notas-modal__footer-btn--close"
              onClick={() => setHistorialModal(null)}
            >
              <i className="bi bi-x-lg me-2" aria-hidden />
              Cerrar
            </AppButton>
          </Flex>
        }
      >
        <div className="monitor-equipo-notas-modal">
          <section className="monitor-equipo-notas-modal__timeline" aria-labelledby="monitor-equipo-notas-timeline-title">
            <div className="monitor-equipo-notas-modal__section-head">
              <h3 id="monitor-equipo-notas-timeline-title" className="monitor-equipo-notas-modal__section-title">
                <i className="bi bi-clock-history" aria-hidden />
                Línea de tiempo
              </h3>
              {!historialLoading && historialEntries.length > 0 ? (
                <span className="monitor-equipo-notas-modal__count">{historialEntries.length} entradas</span>
              ) : null}
            </div>

            {historialLoading ? (
              <div className="monitor-equipo-notas-modal__loading" role="status" aria-live="polite">
                <div className="spinner-border text-success" aria-hidden />
                <span>Cargando historial…</span>
              </div>
            ) : historialEntries.length === 0 ? (
              <div className="monitor-equipo-notas-modal__empty">
                <i className="bi bi-journal-plus monitor-equipo-notas-modal__empty-icon" aria-hidden />
                <p className="monitor-equipo-notas-modal__empty-title">Aún no hay notas</p>
                <p className="monitor-equipo-notas-modal__empty-text">
                  Escribí el primer registro abajo; se guardará con fecha y hora del servidor.
                </p>
              </div>
            ) : (
              <div ref={historialScrollRef} className="monitor-equipo-notas-modal__scroll">
                <div className="monitor-equipo-notas-modal__entries">
                  {historialEntries.map((e) => {
                    const mine = isHistorialEntryFromCurrentUser(e.createdByEmail, user?.email);
                    const { estadoExtra, bodyDisplay } = formatMonitorHistorialBubble(e.body);
                    return (
                    <article
                      key={e.id}
                      className={`monitor-equipo-notas-modal__entry ${mine ? "monitor-equipo-notas-modal__entry--mine" : "monitor-equipo-notas-modal__entry--other"}${estadoExtra}`}
                    >
                      <div className="monitor-equipo-notas-modal__entry-inner">
                        <div className="monitor-equipo-notas-modal__entry-body">
                          {bodyDisplay}
                        </div>
                        <div className="monitor-equipo-notas-modal__entry-meta" aria-label="Metadatos de la nota">
                          <time className="monitor-equipo-notas-modal__entry-time" dateTime={e.createdAt}>
                            {formatHistorialTimestamp(e.createdAt)}
                          </time>
                          {e.createdByEmail ? (
                            <span className="monitor-equipo-notas-modal__entry-user" title={e.createdByEmail}>
                              <i className="bi bi-person-fill" aria-hidden />
                              {e.createdByEmail}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="monitor-equipo-notas-modal__composer monitor-equipo-notas-modal__composer--wa" aria-label="Escribir nota">
            <div className="monitor-equipo-notas-modal__wa-bar">
              <div className="monitor-equipo-notas-modal__wa-bar-row">
                <div className="monitor-equipo-notas-modal__wa-field">
                  <label htmlFor="monitor-equipo-historial-nota" className="visually-hidden">
                    Texto de la nueva nota
                  </label>
                  <textarea
                    ref={historialNoteTextareaRef}
                    id="monitor-equipo-historial-nota"
                    className="monitor-equipo-notas-modal__wa-textarea"
                    rows={1}
                    cols={1}
                    placeholder="Escribí una nota…"
                    title="Enter: nueva línea. Ctrl+Enter: enviar."
                    value={historialNoteDraft}
                    onChange={(ev) => setHistorialNoteDraft(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
                        ev.preventDefault();
                        void submitHistorialNote();
                      }
                    }}
                    maxLength={8000}
                  />
                  <span className="monitor-equipo-notas-modal__wa-counter" aria-live="polite">
                    {historialNoteDraft.length.toLocaleString("es-UY")} / 8.000
                  </span>
                </div>
                <button
                  type="button"
                  className={`monitor-equipo-notas-modal__wa-send${historialNoteDraft.trim() && !historialSaving ? " monitor-equipo-notas-modal__wa-send--active" : ""}`}
                  title={historialSaving ? "Guardando…" : "Enviar nota"}
                  aria-label={historialSaving ? "Guardando nota" : "Enviar nota"}
                  disabled={historialSaving || !historialNoteDraft.trim()}
                  onClick={() => void submitHistorialNote()}
                >
                  {historialSaving ? (
                    <span className="spinner-border spinner-border-sm text-light" role="status" aria-hidden />
                  ) : (
                    <i className="bi bi-send-fill" aria-hidden />
                  )}
                </button>
              </div>
              <p className="monitor-equipo-notas-modal__wa-foot-hint">Máximo 8.000 caracteres · Ctrl+Enter para enviar</p>
            </div>
          </section>
        </div>
      </AppModal>
    </div>
  );
}

/** Listado local de equipos + notas (no es el tablero NiceHash por enlaces watcher). */
function isRegistroLegacyRouteParam(raw: string | null): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "legacy";
}

/** Activa el tablero NiceHash a pantalla completa (no es el índice de slot; el slot viene de `?slot=` o de localStorage). */
function isWatcherOnlyRouteParam(raw: string | null): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isWatcherTotalRouteParam(raw: string | null): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === "total" || v === "all";
}

/** Administrador A, o Administrador B con permiso inventario equipos ASIC (`equipos`), no solo tienda. */
export function MonitorEquiposAsicPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  if (!canAccessMonitorEquiposAsic(user)) {
    return <Navigate to="/asic" replace />;
  }
  if (isRegistroLegacyRouteParam(searchParams.get("registro"))) {
    return <MonitorEquiposAsicPageContent />;
  }
  if (isWatcherTotalRouteParam(searchParams.get("watcher"))) {
    return <NiceHashWatcherDashboard active layout="fullscreen" viewMode="allConfiguredSlots" />;
  }
  if (isWatcherOnlyRouteParam(searchParams.get("watcher"))) {
    return <NiceHashWatcherDashboard active layout="fullscreen" />;
  }
  /** Por defecto: mismo tablero que `?watcher=total` (todos los enlaces W1…WN → NiceHash `rigs2` por cuenta). */
  return <NiceHashWatcherDashboard active layout="fullscreen" viewMode="allConfiguredSlots" />;
}
