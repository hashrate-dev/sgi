import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { OpsComunicacionCatalogSelect } from "../components/OpsComunicacionCatalogSelect";
import { OpsComunicacionShareBotModal } from "../components/OpsComunicacionShareBotModal";
import { OpsComunicacionTelegramConfig } from "../components/OpsComunicacionTelegramConfig";
import { OpsComunicacionTelegramPreview } from "../components/OpsComunicacionTelegramPreview";
import { composeBilingualOpsCuerpo } from "../lib/opsComunicacionTelegramHtml";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  createOpsComunicacion,
  createOpsComunicacionTitle,
  cancelOpsComunicacionSchedule,
  deleteOpsComunicacionTitle,
  getOpsComunicacion,
  putOpsComunicacionCopy,
  sendOpsComunicacionTelegram,
  translateOpsComunicacion,
  updateOpsComunicacionTitle,
  type OpsComunicacionItem,
  type OpsComunicacionTitle,
} from "../lib/api";
import { getOpsComHiresMarkUrl } from "../lib/opsComunicacionTelegramAvatar";
import { CORTE_PROGRAMADO_CUERPO, fillOpsComunicacionMessage, messageHasScheduleSlots, plantillaFromFilledMessage } from "../lib/opsComunicacionTemplates";
import { canAccessComunicacionModule, canEditComunicacionModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/crypto-noticias.css";
import "../styles/ops-comunicacion.css";

const DEFAULT_TG_HEADER = "Comunicación granja HRS";
const DEFAULT_TG_CIERRE = "Hashrate Space\nhashrate.space";
const PATH = "/gestion-administrativa/comunicacion";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultScheduleParts(): { date: string; time: string } {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
}

function publishedAt(row: OpsComunicacionItem): string {
  if (row.telegramSent && row.sentAt) return row.sentAt;
  if (!row.telegramSent && row.scheduledAt) return row.scheduledAt;
  return row.createdAt;
}

function formatPublishedParts(iso: string): { date: string; time: string } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { date: "—", time: "" };
  const d = new Date(t);
  return {
    date: d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function OpsComPublishedStamp({ iso, compact }: { iso: string; compact?: boolean }) {
  const { date, time } = formatPublishedParts(iso);
  return (
    <time className={`ops-com-hist__when${compact ? " ops-com-hist__when--compact" : ""}`} dateTime={iso}>
      <span className="ops-com-hist__when-label">Publicado</span>
      <span className="ops-com-hist__when-date">{date}</span>
      {time ? <span className="ops-com-hist__when-time">{time} hs</span> : null}
    </time>
  );
}

export function OpsComunicacionPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<OpsComunicacionItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [histOpen, setHistOpen] = useState<OpsComunicacionItem | null>(null);
  const [heroMarkSrc, setHeroMarkSrc] = useState("/images/wp-uploads/cropped-favicoin-32x32.png");
  const [tituloId, setTituloId] = useState("");
  const [titles, setTitles] = useState<OpsComunicacionTitle[]>([]);
  const [titleBusy, setTitleBusy] = useState(false);
  const [cuerpoOverride, setCuerpoOverride] = useState<string | null>(null);
  const [mensajeLibre, setMensajeLibre] = useState(false);
  const prevTituloId = useRef("");
  const [fechaAviso, setFechaAviso] = useState(todayIso);
  const [horario1From, setHorario1From] = useState("9:00");
  const [horario1To, setHorario1To] = useState("17:00");
  const [horario2From, setHorario2From] = useState("20:00");
  const [horario2To, setHorario2To] = useState("24:00");
  const [cuerpo, setCuerpo] = useState("");
  const [categoria, setCategoria] = useState("general");
  const [telegramHeader, setTelegramHeader] = useState(DEFAULT_TG_HEADER);
  const [headerDraft, setHeaderDraft] = useState(DEFAULT_TG_HEADER);
  const [telegramCierre, setTelegramCierre] = useState(DEFAULT_TG_CIERRE);
  const [cierreDraft, setCierreDraft] = useState(DEFAULT_TG_CIERRE);
  const [categoryLabelDraft, setCategoryLabelDraft] = useState("Operaciones");
  const [copyBusy, setCopyBusy] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  const [scheduleDate, setScheduleDate] = useState(() => defaultScheduleParts().date);
  const [scheduleTime, setScheduleTime] = useState(() => defaultScheduleParts().time);
  const [queueOpen, setQueueOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [telegramRecipientCount, setTelegramRecipientCount] = useState(0);
  const [cuerpoEn, setCuerpoEn] = useState("");
  const [translatingEn, setTranslatingEn] = useState(false);
  const cuerpoEnSeq = useRef(0);
  const pendingEs = useRef("");
  const translatingLock = useRef(false);

  const canEdit = Boolean(user && canEditComunicacionModule(user));
  const tituloRow = titles.find((t) => String(t.id) === tituloId);
  const titulo = tituloRow?.titulo || "";
  const tituloEsCorte = Boolean(tituloRow?.isBuiltin);
  const plantilla = mensajeLibre ? "" : tituloRow?.cuerpo || (tituloEsCorte ? CORTE_PROGRAMADO_CUERPO : "");
  const usesSchedule = Boolean(plantilla && messageHasScheduleSlots(plantilla));
  const cuerpoLleno = usesSchedule
    ? fillOpsComunicacionMessage(plantilla, {
        fecha: fechaAviso,
        horario1From,
        horario1To,
        horario2From,
        horario2To,
      })
    : plantilla;
  const cuerpoDraft = cuerpoOverride ?? (plantilla ? cuerpoLleno : cuerpo);
  const cuerpoFinal = cuerpoDraft.trim();
  const queuedItems = items
    .filter((x) => !x.telegramSent && String(x.scheduledAt || "").trim())
    .slice()
    .sort((a, b) => Date.parse(a.scheduledAt || "") - Date.parse(b.scheduledAt || ""));
  const modeloDirty = Boolean(
    tituloRow &&
      !mensajeLibre &&
      cuerpoOverride != null &&
      cuerpoOverride.replace(/\r\n/g, "\n").trim() !== cuerpoLleno.replace(/\r\n/g, "\n").trim()
  );
  const savedCategoryLabel = categories.find((c) => c.id === categoria)?.label || "";
  const copyDirty =
    headerDraft.replace(/\s+/g, " ").trim() !== telegramHeader.replace(/\s+/g, " ").trim() ||
    categoryLabelDraft.replace(/\s+/g, " ").trim() !== savedCategoryLabel.replace(/\s+/g, " ").trim() ||
    cierreDraft.replace(/\r\n/g, "\n").trim() !== telegramCierre.replace(/\r\n/g, "\n").trim();

  const load = useCallback(async () => {
    setTableLoading(true);
    try {
      const res = await getOpsComunicacion();
      setItems(res.items || []);
      setCategories(res.categories || []);
      const header = (res.telegramHeader || DEFAULT_TG_HEADER).trim() || DEFAULT_TG_HEADER;
      setTelegramHeader(header);
      setHeaderDraft(header);
      const cierre = String(res.telegramCierre || "").replace(/\r\n/g, "\n").trim() || DEFAULT_TG_CIERRE;
      setTelegramCierre(cierre);
      setCierreDraft(cierre);
      setTelegramRecipientCount(res.telegramRecipientCount || res.telegramRecipients?.length || 0);
      const nextTitles = res.titles || [];
      setTitles(nextTitles);
      setTituloId((cur) => {
        if (nextTitles.some((t) => String(t.id) === cur)) return cur;
        const corte = nextTitles.find((t) => t.isBuiltin);
        return String((corte || nextTitles[0])?.id || "");
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar Comunicación.");
      setItems([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessComunicacionModule(user) && !canUserAccessNavPath(user, PATH)) return;
    void load();
  }, [loading, user, load]);

  useEffect(() => {
    let alive = true;
    void getOpsComHiresMarkUrl()
      .then((url) => {
        if (alive) setHeroMarkSrc(url);
      })
      .catch(() => {
        /* favicon fallback */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    pendingEs.current = cuerpoDraft;
    if (!cuerpoDraft.trim()) {
      cuerpoEnSeq.current += 1;
      translatingLock.current = false;
      setCuerpoEn("");
      setTranslatingEn(false);
      return;
    }
    setTranslatingEn(true);
    const kick = () => {
      if (translatingLock.current) return;
      const snapshot = pendingEs.current;
      if (!snapshot.trim()) {
        setTranslatingEn(false);
        return;
      }
      translatingLock.current = true;
      const seq = ++cuerpoEnSeq.current;
      void translateOpsComunicacion(snapshot)
        .then((r) => {
          if (seq !== cuerpoEnSeq.current) return;
          setCuerpoEn(String(r.text || "").replace(/\r\n/g, "\n").trim());
        })
        .catch(() => {
          /* se deja el inglés anterior */
        })
        .finally(() => {
          translatingLock.current = false;
          if (seq !== cuerpoEnSeq.current) return;
          if (pendingEs.current !== snapshot && pendingEs.current.trim()) {
            kick();
            return;
          }
          setTranslatingEn(false);
        });
    };
    kick();
  }, [cuerpoDraft]);

  useEffect(() => {
    if (!histOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistOpen(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [histOpen]);

  useEffect(() => {
    const switched = prevTituloId.current !== tituloId;
    prevTituloId.current = tituloId;
    if (!switched) return;
    setMensajeLibre(false);
    setCuerpoOverride(null);
    if (tituloEsCorte) setCategoria("energia");
  }, [tituloEsCorte, tituloId]);

  useEffect(() => {
    const lab = categories.find((c) => c.id === categoria)?.label || "";
    if (lab) setCategoryLabelDraft(lab);
  }, [categoria, categories]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessComunicacionModule(user) && !canUserAccessNavPath(user, PATH)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setErr("");
    setOk("");
    if (titulo.trim().length < 3) {
      setErr("Elegí un título de la lista o agregá uno nuevo.");
      return;
    }
    if (cuerpoFinal.length < 8) {
      setErr("Escribí el mensaje o elegí un título que ya tenga texto.");
      return;
    }
    let scheduledAt = "";
    if (!sendNow) {
      const when = Date.parse(`${scheduleDate}T${scheduleTime}`);
      if (!Number.isFinite(when)) {
        setErr("Completá la fecha y la hora de publicación.");
        return;
      }
      if (when < Date.now() + 20_000) {
        setErr("Programá al menos un minuto más adelante.");
        return;
      }
      scheduledAt = new Date(when).toISOString();
    }
    setBusy(true);
    try {
      if (copyDirty) {
        const header = headerDraft.replace(/\s+/g, " ").trim() || DEFAULT_TG_HEADER;
        const tipo = categoryLabelDraft.replace(/\s+/g, " ").trim();
        const saved = await putOpsComunicacionCopy({
          telegramHeader: header,
          telegramCierre: cierreDraft.replace(/\r\n/g, "\n").trim() || DEFAULT_TG_CIERRE,
          categories: (categories.length ? categories : [{ id: categoria, label: tipo }]).map((c) =>
            c.id === categoria && tipo ? { ...c, label: tipo } : c
          ),
        });
        setTelegramHeader(saved.telegramHeader || header);
        setHeaderDraft(saved.telegramHeader || header);
        const cierre = String(saved.telegramCierre || "").replace(/\r\n/g, "\n").trim() || DEFAULT_TG_CIERRE;
        setTelegramCierre(cierre);
        setCierreDraft(cierre);
        if (saved.categories?.length) setCategories(saved.categories);
      }
      const r = await createOpsComunicacion({
        titulo: titulo.trim(),
        cuerpo: cuerpoFinal,
        categoria,
        imageUrl: "",
        sendNow,
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(tituloEsCorte || usesSchedule
          ? {
              corteControl: {
                fecha: fechaAviso,
                motivo: tituloEsCorte ? "Reducción 23 kV ANDE · 10% potencia reservada" : titulo.trim(),
                windows: [
                  { from: horario1From, to: horario1To },
                  { from: horario2From, to: horario2To },
                ].filter((w) => w.from.trim() && w.to.trim()),
              },
            }
          : {}),
      });
      setOk(
        sendNow
          ? `Comunicado enviado a Telegram${r.sentTo ? ` (${r.sentTo} chat${r.sentTo === 1 ? "" : "s"} privados)` : ""}.`
          : r.queued
            ? `Publicación programada para ${scheduleDate} ${scheduleTime}.`
            : "Comunicado guardado. Todavía no se envió a Telegram."
      );
      setCuerpoOverride(null);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "No se pudo publicar el comunicado.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onSaveModelo = async () => {
    if (!canEdit) return;
    const id = tituloRow?.id;
    if (!id) {
      setErr("Elegí un título para guardar el mensaje.");
      return;
    }
    if (cuerpoFinal.length < 8) {
      setErr("El texto del mensaje tiene que tener al menos 8 caracteres.");
      return;
    }
    const cuerpoGuardar = usesSchedule
      ? plantillaFromFilledMessage(cuerpoFinal, plantilla, {
          fecha: fechaAviso,
          horario1From,
          horario1To,
          horario2From,
          horario2To,
        })
      : cuerpoFinal;
    setTitleBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await updateOpsComunicacionTitle(id, { cuerpo: cuerpoGuardar });
      setTitles(r.titles || []);
      setMensajeLibre(false);
      setCuerpoOverride(null);
      setOk("Mensaje guardado en este título.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el mensaje.");
    } finally {
      setTitleBusy(false);
    }
  };

  const onClearMensaje = () => {
    setMensajeLibre(true);
    setCuerpo("");
    setCuerpoOverride("");
    setFechaAviso(todayIso());
    setHorario1From("9:00");
    setHorario1To("17:00");
    setHorario2From("20:00");
    setHorario2To("24:00");
    setErr("");
    setOk("Mensaje en blanco. Escribí uno nuevo o volvé a elegir el título.");
  };

  const onSaveCopy = async () => {
    if (!canEdit) return;
    const header = headerDraft.replace(/\s+/g, " ").trim();
    const tipo = categoryLabelDraft.replace(/\s+/g, " ").trim();
    if (header.length < 3) {
      setErr("El encabezado de Telegram tiene que tener al menos 3 caracteres.");
      return;
    }
    if (tipo.length < 2) {
      setErr("El tipo (segunda línea de Telegram) tiene que tener al menos 2 caracteres.");
      return;
    }
    setCopyBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await putOpsComunicacionCopy({
        telegramHeader: header,
        telegramCierre: cierreDraft.replace(/\r\n/g, "\n").trim() || DEFAULT_TG_CIERRE,
        categories: (categories.length
          ? categories
          : [{ id: categoria, label: tipo }]
        ).map((c) => (c.id === categoria ? { ...c, label: tipo } : c)),
      });
      setCategories(r.categories || []);
      setTelegramHeader(r.telegramHeader || header);
      setHeaderDraft(r.telegramHeader || header);
      const cierre = String(r.telegramCierre || "").replace(/\r\n/g, "\n").trim() || DEFAULT_TG_CIERRE;
      setTelegramCierre(cierre);
      setCierreDraft(cierre);
      setOk("Textos de Telegram guardados. Los próximos envíos usan este encabezado, tipo y cierre.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron guardar los textos de Telegram.");
    } finally {
      setCopyBusy(false);
    }
  };

  const onCancelQueue = async (row: OpsComunicacionItem) => {
    if (!canEdit || row.telegramSent) return;
    setCancellingId(row.id);
    setErr("");
    setOk("");
    try {
      await cancelOpsComunicacionSchedule(row.id);
      setOk(`Se sacó de la cola: ${row.titulo}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cancelar la programación.");
    } finally {
      setCancellingId(null);
    }
  };

  const onSend = async (row: OpsComunicacionItem) => {
    if (!canEdit || row.telegramSent) return;
    setSendingId(row.id);
    setErr("");
    setOk("");
    try {
      await sendOpsComunicacionTelegram(row.id);
      setOk(`Enviado a Telegram: ${row.titulo}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo enviar a Telegram.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="fact-page crypto-news-page">
      <div className="container">
        <PageHeader
          title="Comunicación"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver atrás"
        />

        <section className="crypto-news-hero hrs-card sgi-glass-panel">
          <div className="crypto-news-hero__top">
            <div className="ops-com-hero-brand">
              <div className="ops-com-hero-avatar-wrap">
                <span className="ops-com-hero-avatar" aria-hidden>
                  <span className="ops-com-hero-avatar__circle">
                    <span className="ops-com-hero-avatar__farm" />
                    <img className="ops-com-hero-avatar__mark" src={heroMarkSrc} alt="" draggable={false} />
                  </span>
                  <span className="ops-com-hero-avatar__mega" title="Comunicación">
                    <svg viewBox="0 0 24 24" width="15" height="15">
                      <path
                        fill="currentColor"
                        d="M12 8H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1v4a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-4h3l5 4V4l-5 4m9.5 4c0 1.71-.96 3.26-2.5 4V8c1.53.75 2.5 2.3 2.5 4Z"
                      />
                    </svg>
                  </span>
                </span>
              </div>
              <div>
              <div className="crypto-news-kicker">Bot Telegram · Operaciones Data Center</div>
              <h1 className="crypto-news-hero__title">Comunicación de Data Center</h1>
              <p className="crypto-news-hero__lead">
                Avisos internos de operaciones (energía, mantenimiento, hashrate). El bot los manda uno a uno, en
                chat privado: los clientes no se ven entre sí.
              </p>
              </div>
            </div>
            <div className="crypto-news-hero__stats">
              <div className="crypto-news-stat">
                <div className="crypto-news-stat__label">En historial</div>
                <div className="crypto-news-stat__value">{tableLoading ? "…" : items.length}</div>
              </div>
              <div className="crypto-news-stat">
                <div className="crypto-news-stat__label">Enviados</div>
                <div className="crypto-news-stat__value">
                  {tableLoading ? "…" : items.filter((x) => x.telegramSent).length}
                </div>
              </div>
              <div className="crypto-news-stat">
                <div className="crypto-news-stat__label">Chats bot</div>
                <div className="crypto-news-stat__value">{tableLoading ? "…" : telegramRecipientCount}</div>
              </div>
              <button
                type="button"
                className="ops-com-users-btn"
                onClick={() => navigate("/gestion-administrativa/comunicacion/cortes")}
              >
                Cortes
              </button>
              <button type="button" className="ops-com-users-btn" onClick={() => setQueueOpen(true)}>
                Cola{queuedItems.length ? ` (${queuedItems.length})` : ""}
              </button>
              <button type="button" className="ops-com-users-btn" onClick={() => setShareOpen(true)}>
                Compartir
              </button>
              <button
                type="button"
                className="ops-com-users-btn"
                onClick={() => navigate("/gestion-administrativa/comunicacion/usuarios-bot")}
              >
                Usuarios del bot
              </button>
              <button
                type="button"
                className="crypto-news-config-btn"
                onClick={() => setConfigOpen(true)}
                aria-label="Configuración de Telegram"
                title="Bot Telegram de Comunicación granja"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.24l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {err ? <div className="alert alert-danger py-2 mb-0">{err}</div> : null}
          {ok ? <div className="alert alert-success py-2 mb-0">{ok}</div> : null}

          {canEdit ? (
            <form className="ops-com-form" onSubmit={onSubmit}>
              <fieldset className="ops-com-tg-copy">

                <div className="ops-com-form__row">
                  <div className="ops-com-field">
                    <label htmlFor="ops-tg-header">Encabezado</label>
                    <input
                      id="ops-tg-header"
                      className="fact-input"
                      value={headerDraft}
                      onChange={(e) => setHeaderDraft(e.target.value)}
                      disabled={busy || copyBusy}
                      maxLength={80}
                      placeholder={DEFAULT_TG_HEADER}
                    />
                  </div>
                  <div className="ops-com-field">
                    <label htmlFor="ops-tg-tipo-line">Tipo (segunda línea)</label>
                    <input
                      id="ops-tg-tipo-line"
                      className="fact-input"
                      value={categoryLabelDraft}
                      onChange={(e) => setCategoryLabelDraft(e.target.value)}
                      disabled={busy || copyBusy}
                      maxLength={60}
                      placeholder="Energía / ANDE"
                    />
                  </div>
                </div>
                <div className="ops-com-tg-copy__save">
                  <button
                    type="button"
                    className="ops-com-save-model-btn"
                    disabled={busy || copyBusy || !copyDirty}
                    onClick={() => void onSaveCopy()}
                  >
                    {copyBusy ? "Guardando…" : "Guardar textos"}
                  </button>
                  <span className="ops-com-model-save__hint">
                    {copyDirty ? "Hay cambios en el encabezado, el tipo o el cierre." : "Así se ve ahora en Telegram."}
                  </span>
                </div>
              </fieldset>
              <div className="ops-com-form__row">
                <div className="ops-com-field">
                  <label htmlFor="ops-titulo">Título</label>
                  <OpsComunicacionCatalogSelect
                    triggerId="ops-titulo"
                    placeholder="Seleccioná un título"
                    addLabel="Agregar nuevo título"
                    newTitle="Nuevo título"
                    panelLabel="Títulos"
                    items={titles.map((t) => ({ id: t.id, label: t.titulo, isBuiltin: t.isBuiltin }))}
                    valueId={tituloId}
                    disabled={busy || titleBusy}
                    onError={(msg) => {
                      setOk("");
                      setErr(msg);
                    }}
                    onChange={(id) => {
                      setTituloId(id);
                      setMensajeLibre(false);
                      setCuerpoOverride(null);
                      setErr("");
                    }}
                    create={async (nombre) => {
                      const r = await createOpsComunicacionTitle(nombre);
                      const next = r.titles || [];
                      setTitles(next);
                      return {
                        itemId: r.item ? String(r.item.id) : "",
                        items: next.map((t) => ({ id: t.id, label: t.titulo, isBuiltin: t.isBuiltin })),
                      };
                    }}
                    update={async (id, nombre) => {
                      const r = await updateOpsComunicacionTitle(id, { titulo: nombre });
                      const next = r.titles || [];
                      setTitles(next);
                      return { items: next.map((t) => ({ id: t.id, label: t.titulo, isBuiltin: t.isBuiltin })) };
                    }}
                    remove={async (id) => {
                      const r = await deleteOpsComunicacionTitle(id);
                      const next = r.titles || [];
                      setTitles(next);
                      return { items: next.map((t) => ({ id: t.id, label: t.titulo, isBuiltin: t.isBuiltin })) };
                    }}
                  />
                </div>
                <div className="ops-com-field ops-com-field--cat">
                  <label htmlFor="ops-cat">Tipo</label>
                  <select
                    id="ops-cat"
                    className="fact-input"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    disabled={busy}
                  >
                    {(categories.length
                      ? categories
                      : [{ id: "general", label: "Operaciones" }]
                    ).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="ops-com-field">
                <label htmlFor="ops-cuerpo">Mensaje</label>
                <div className="ops-com-title">
                  {usesSchedule ? (
                    <div className="ops-com-schedule">
                      <div className="ops-com-field">
                        <label htmlFor="ops-fecha">Fecha del aviso</label>
                        <input
                          id="ops-fecha"
                          className="fact-input"
                          type="date"
                          value={fechaAviso}
                          onChange={(e) => {
                            setFechaAviso(e.target.value);
                            setCuerpoOverride(null);
                          }}
                          disabled={busy || titleBusy}
                        />
                      </div>
                      <div className="ops-com-field">
                        <label htmlFor="ops-h1-from">Mañana (etapa 1)</label>
                        <p className="ops-com-tg-copy__hint" style={{ margin: "0 0 0.35rem" }}>
                          Si hay un horario:
                        </p>
                        <div className="ops-com-title__row">
                          <input
                            id="ops-h1-from"
                            className="fact-input"
                            value={horario1From}
                            onChange={(e) => {
                              setHorario1From(e.target.value);
                              setCuerpoOverride(null);
                            }}
                            disabled={busy || titleBusy}
                            placeholder="9:00"
                          />
                          <input
                            className="fact-input"
                            value={horario1To}
                            onChange={(e) => {
                              setHorario1To(e.target.value);
                              setCuerpoOverride(null);
                            }}
                            disabled={busy || titleBusy}
                            placeholder="17:00"
                          />
                        </div>
                      </div>
                      <div className="ops-com-field">
                        <label htmlFor="ops-h2-from">Tarde (etapa 2)</label>
                        <p className="ops-com-tg-copy__hint" style={{ margin: "0 0 0.35rem" }}>
                          Si hay dos horarios, en el medio se prende. Dejá tarde vacío si ese día es una sola etapa:
                        </p>
                        <div className="ops-com-title__row">
                          <input
                            id="ops-h2-from"
                            className="fact-input"
                            value={horario2From}
                            onChange={(e) => {
                              setHorario2From(e.target.value);
                              setCuerpoOverride(null);
                            }}
                            disabled={busy || titleBusy}
                            placeholder="20:00"
                          />
                          <input
                            className="fact-input"
                            value={horario2To}
                            onChange={(e) => {
                              setHorario2To(e.target.value);
                              setCuerpoOverride(null);
                            }}
                            disabled={busy || titleBusy}
                            placeholder="24:00"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="ops-com-body-split">
                    <div className="ops-com-body-split__pane">
                      <label htmlFor="ops-cuerpo" className="ops-com-body-split__label">
                        Español
                      </label>
                      <textarea
                        id="ops-cuerpo"
                        className="fact-input ops-com-textarea"
                        value={cuerpoDraft}
                        onChange={(e) => {
                          setCuerpoOverride(e.target.value);
                          if (!tituloRow) setCuerpo(e.target.value);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        disabled={busy || titleBusy}
                        maxLength={8000}
                        rows={14}
                        placeholder="Texto del comunicado. En modelos con {{FECHA}} y {{HORARIOS}} se completa con la fecha y los horarios de arriba."
                      />
                    </div>
                    <div className="ops-com-body-split__pane">
                      <label htmlFor="ops-cuerpo-en" className="ops-com-body-split__label">
                        Inglés{translatingEn ? " · al escribir…" : ""}
                      </label>
                      <textarea
                        id="ops-cuerpo-en"
                        className="fact-input ops-com-textarea ops-com-textarea--en"
                        value={cuerpoEn}
                        readOnly
                        onKeyDown={(e) => e.stopPropagation()}
                        rows={14}
                        placeholder="Se traduce al inglés mientras escribís a la izquierda."
                      />
                    </div>
                  </div>
                  <div className="ops-com-cierre">
                    <label htmlFor="ops-cierre" className="ops-com-body-split__label">
                      Cierre (abajo de todo en Telegram)
                    </label>
                    <textarea
                      id="ops-cierre"
                      className="fact-input ops-com-textarea ops-com-textarea--cierre"
                      value={cierreDraft}
                      onChange={(e) => setCierreDraft(e.target.value)}
                      onBlur={() => {
                        if (!canEdit || copyBusy) return;
                        if (cierreDraft.replace(/\r\n/g, "\n").trim() === telegramCierre.replace(/\r\n/g, "\n").trim()) {
                          return;
                        }
                        void onSaveCopy();
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      disabled={busy || copyBusy}
                      maxLength={400}
                      rows={3}
                      placeholder={"Hashrate Space\nhashrate.space"}
                    />
                  </div>
                  <div className="ops-com-model-save">
                    <button
                      type="button"
                      className="ops-com-save-model-btn"
                      disabled={busy || titleBusy || !tituloRow || !modeloDirty}
                      onClick={() => void onSaveModelo()}
                    >
                      {titleBusy ? "Guardando…" : "Guardar cambios"}
                    </button>
                    <button
                      type="button"
                      className="ops-com-clear-msg-btn"
                      disabled={busy || titleBusy}
                      onClick={onClearMensaje}
                    >
                      Empezar de cero
                    </button>
                    <span className="ops-com-model-save__hint">
                      {mensajeLibre
                        ? "Mensaje en blanco. Escribí el texto o volvé a elegir el título."
                        : modeloDirty
                          ? "Hay ediciones. Guardá para dejarlas en este título."
                          : "El mensaje de este título."}
                    </span>
                  </div>
                </div>
              </div>
              <div className="ops-com-actions">
                <div className="ops-com-publish">
                  <label className="ops-com-check">
                    <input
                      type="radio"
                      name="ops-publish-when"
                      checked={sendNow}
                      disabled={busy}
                      onChange={() => setSendNow(true)}
                    />
                    Publicar ahora
                    {telegramRecipientCount ? ` (${telegramRecipientCount})` : ""}
                  </label>
                  <label className="ops-com-check">
                    <input
                      type="radio"
                      name="ops-publish-when"
                      checked={!sendNow}
                      disabled={busy}
                      onChange={() => setSendNow(false)}
                    />
                    Programar
                  </label>
                  {!sendNow ? (
                    <div className="ops-com-schedule-publish">
                      <input
                        className="fact-input"
                        type="date"
                        value={scheduleDate}
                        disabled={busy}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        aria-label="Fecha de publicación"
                      />
                      <input
                        className="fact-input"
                        type="time"
                        value={scheduleTime}
                        disabled={busy}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        aria-label="Hora de publicación"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="ops-com-actions__btns">
                  <button type="submit" className="btn btn-success" disabled={busy}>
                    {busy ? "Publicando…" : sendNow ? "Publicar y enviar" : "Programar envío"}
                  </button>
                  <button
                    type="button"
                    className="ops-com-preview-btn"
                    disabled={busy}
                    onClick={() => setPreviewOpen(true)}
                  >
                    Vista Previa
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </section>

        <OpsComunicacionShareBotModal open={shareOpen} onClose={() => setShareOpen(false)} markSrc={heroMarkSrc} />

        <OpsComunicacionTelegramConfig
          canEdit={canEdit}
          open={configOpen}
          onClose={() => {
            setConfigOpen(false);
            void load();
          }}
        />

        <OpsComunicacionTelegramPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={titulo.trim()}
          body={composeBilingualOpsCuerpo(cuerpoFinal, cuerpoEn, cierreDraft)}
          headerLine={headerDraft}
          categoryLabel={
            categoryLabelDraft.trim() ||
            (categories.find((c) => c.id === categoria) || { label: "Operaciones" }).label
          }
        />
        {queueOpen ? (
          <div
            className="ops-tg-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-queue-title"
            onMouseDown={() => setQueueOpen(false)}
          >
            <div className="ops-tg-preview__dialog ops-com-hist-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="ops-tg-preview__bar">
                <p id="ops-queue-title" className="ops-tg-preview__bar-title">
                  Cola de publicaciones
                </p>
                <button type="button" className="ops-tg-preview__close" onClick={() => setQueueOpen(false)}>
                  Cerrar
                </button>
              </div>
              <div className="ops-com-hist-modal__panel ops-com-queue">
                {queuedItems.length === 0 ? (
                  <p className="ops-com-queue__empty">No hay avisos programados.</p>
                ) : (
                  queuedItems.map((n) => (
                    <div key={n.id} className="ops-com-queue__row">
                      <div>
                        <strong>{n.titulo}</strong>
                        <p>
                          {formatPublishedParts(n.scheduledAt || "").date} · {formatPublishedParts(n.scheduledAt || "").time}
                        </p>
                      </div>
                      {canEdit ? (
                        <div className="ops-com-queue__btns">
                          <button
                            type="button"
                            className="crypto-news-send-tg"
                            disabled={sendingId != null || cancellingId != null}
                            onClick={() => void onSend(n)}
                          >
                            {sendingId === n.id ? "Enviando…" : "Enviar ahora"}
                          </button>
                          <button
                            type="button"
                            className="ops-com-clear-msg-btn"
                            disabled={sendingId != null || cancellingId != null}
                            onClick={() => void onCancelQueue(n)}
                          >
                            {cancellingId === n.id ? "Sacando…" : "Sacar de la cola"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
        {histOpen ? (
          <div
            className="ops-tg-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-hist-full-title"
            onMouseDown={() => setHistOpen(null)}
          >
            <div className="ops-tg-preview__dialog ops-com-hist-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="ops-tg-preview__bar">
                <p className="ops-tg-preview__bar-title">Mensaje completo</p>
                <button type="button" className="ops-tg-preview__close" onClick={() => setHistOpen(null)}>
                  Cerrar
                </button>
              </div>
              <div className="ops-com-hist-modal__panel">
                <div className="ops-com-hist-modal__head">
                  <span className="ops-com-hist__mark" title="Aviso" aria-hidden>
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      <path
                        fill="currentColor"
                        d="M12 2.4 22 21H2L12 2.4Zm0 4.2L5.2 19.2h13.6L12 6.6ZM11 10.2h2v4.6h-2v-4.6Zm0 5.8h2V18h-2v-2Z"
                      />
                    </svg>
                  </span>
                  <div>
                    <h2 id="ops-hist-full-title">
                      {histOpen.titulo}
                      {histOpen.corteId ? <span className="ops-com-hist__corte-id">ID corte {histOpen.corteId}</span> : null}
                    </h2>
                    <p className="ops-com-hist-modal__meta">
                      {histOpen.categoriaLabel}
                      {histOpen.telegramSent
                        ? " · Enviado"
                        : histOpen.scheduledAt
                          ? " · Programado"
                          : " · Pendiente"}
                    </p>
                    <OpsComPublishedStamp iso={publishedAt(histOpen)} compact />
                  </div>
                </div>
                <p className="ops-com-hist-modal__body">{histOpen.cuerpo || "Sin texto."}</p>
              </div>
            </div>
          </div>
        ) : null}

        {tableLoading ? (
          <div className="crypto-news-loading text-muted">Cargando historial…</div>
        ) : items.length === 0 ? (
          <div className="hrs-card sgi-glass-panel p-4 text-muted">
            Todavía no hay comunicados. {canEdit ? "Escribí el primero arriba y envialo al bot." : ""}
          </div>
        ) : (
          <section className="crypto-news-grid" aria-label="Historial de comunicación granja">
            {items.map((n) => (
              <article key={n.id} className="crypto-news-card ops-com-hist">
                <div className="crypto-news-card__body">
                  <div className="crypto-news-card__meta ops-com-hist__meta">
                    <span className="crypto-news-source">{n.categoriaLabel}</span>
                    <OpsComPublishedStamp iso={publishedAt(n)} />
                  </div>
                  <div className="ops-com-hist__head">
                    <span className="ops-com-hist__mark" title="Aviso" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path
                          fill="currentColor"
                          d="M12 2.4 22 21H2L12 2.4Zm0 4.2L5.2 19.2h13.6L12 6.6ZM11 10.2h2v4.6h-2v-4.6Zm0 5.8h2V18h-2v-2Z"
                        />
                      </svg>
                    </span>
                    <h3 className="crypto-news-card__title">
                      {n.titulo}
                      {n.corteId ? <span className="ops-com-hist__corte-id">ID corte {n.corteId}</span> : null}
                    </h3>
                  </div>
                  {n.cuerpo ? <p className="crypto-news-card__summary">{n.cuerpo}</p> : null}
                  <div className="crypto-news-card__actions">
                    <span className={`crypto-news-send-tg${n.telegramSent ? " crypto-news-send-tg--sent" : ""}`}>
                      {n.telegramSent ? "Ya enviado" : n.scheduledAt ? "Programado" : "Pendiente"}
                    </span>
                    <button type="button" className="ops-com-hist-full" onClick={() => setHistOpen(n)}>
                      Ver completo
                    </button>
                    {canEdit && !n.telegramSent ? (
                      <button
                        type="button"
                        className="crypto-news-send-tg"
                        disabled={sendingId != null}
                        onClick={() => void onSend(n)}
                      >
                        {sendingId === n.id ? "Enviando…" : "Enviar a Telegram"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
