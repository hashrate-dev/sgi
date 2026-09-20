import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { OpsComunicacionCatalogSelect } from "../components/OpsComunicacionCatalogSelect";
import { OpsComunicacionTelegramConfig } from "../components/OpsComunicacionTelegramConfig";
import { OpsComunicacionTelegramPreview } from "../components/OpsComunicacionTelegramPreview";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  createOpsComunicacion,
  createOpsComunicacionTitle,
  deleteOpsComunicacionTitle,
  getOpsComunicacion,
  sendOpsComunicacionTelegram,
  updateOpsComunicacionTitle,
  type OpsComunicacionItem,
  type OpsComunicacionTitle,
} from "../lib/api";
import { CORTE_PROGRAMADO_CUERPO, fillOpsComunicacionMessage, messageHasScheduleSlots, plantillaFromFilledMessage } from "../lib/opsComunicacionTemplates";
import { canAccessComunicacionModule, canEditComunicacionModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/crypto-noticias.css";
import "../styles/ops-comunicacion.css";

const PATH = "/gestion-administrativa/comunicacion";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "hace instantes";
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  try {
    return new Date(t).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso.slice(0, 16);
  }
}

export function OpsComunicacionPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<OpsComunicacionItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const [imageUrl, setImageUrl] = useState("");
  const [sendNow, setSendNow] = useState(true);

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
  const cuerpoFinal = (cuerpoOverride ?? (plantilla ? cuerpoLleno : cuerpo)).trim();
  const modeloDirty = Boolean(
    tituloRow &&
      !mensajeLibre &&
      cuerpoOverride != null &&
      cuerpoOverride.replace(/\r\n/g, "\n").trim() !== cuerpoLleno.replace(/\r\n/g, "\n").trim()
  );

  const load = useCallback(async () => {
    setTableLoading(true);
    try {
      const res = await getOpsComunicacion();
      setItems(res.items || []);
      setCategories(res.categories || []);
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
    const switched = prevTituloId.current !== tituloId;
    prevTituloId.current = tituloId;
    if (!switched) return;
    setMensajeLibre(false);
    setCuerpoOverride(null);
    if (tituloEsCorte) setCategoria("energia");
  }, [tituloEsCorte, tituloId]);

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
    setBusy(true);
    try {
      const r = await createOpsComunicacion({
        titulo: titulo.trim(),
        cuerpo: cuerpoFinal,
        categoria,
        imageUrl: imageUrl.trim(),
        sendNow,
      });
      setOk(
        sendNow
          ? `Comunicado enviado a Telegram${r.sentTo ? ` (${r.sentTo} chat)` : ""}.`
          : "Comunicado guardado. Todavía no se envió a Telegram."
      );
      setImageUrl("");
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
    setImageUrl("");
    setErr("");
    setOk("Mensaje en blanco. Escribí uno nuevo o volvé a elegir el título.");
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
            <div>
              <div className="crypto-news-kicker">Bot Telegram · Operaciones de granja</div>
              <h1 className="crypto-news-hero__title">Comunicación de la granja</h1>
              <p className="crypto-news-hero__lead">
                Avisos internos de operaciones (energía, mantenimiento, hashrate). No mezcla con el wire de noticias de
                mercado.
              </p>
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
                        <label htmlFor="ops-h1-from">Horario 1</label>
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
                        <label htmlFor="ops-h2-from">Horario 2</label>
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
                  <textarea
                    id="ops-cuerpo"
                    className="fact-input ops-com-textarea"
                    value={cuerpoFinal}
                    onChange={(e) => {
                      setCuerpoOverride(e.target.value);
                      if (!tituloRow) setCuerpo(e.target.value);
                    }}
                    disabled={busy || titleBusy}
                    maxLength={8000}
                    rows={14}
                    placeholder="Texto del comunicado. En modelos con {{FECHA}} y {{HORARIOS}} se completa con la fecha y los horarios de arriba."
                  />
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
              <div className="ops-com-field">
                <label htmlFor="ops-img">Imagen (URL, opcional)</label>
                <input
                  id="ops-img"
                  className="fact-input"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  disabled={busy}
                  placeholder="https://…"
                  autoComplete="off"
                />
              </div>
              <div className="ops-com-actions">
                <label className="ops-com-check">
                  <input
                    type="checkbox"
                    checked={sendNow}
                    disabled={busy}
                    onChange={(e) => setSendNow(e.target.checked)}
                  />
                  Enviar ahora a Telegram
                </label>
                <div className="ops-com-actions__btns">
                  <button type="submit" className="btn btn-success" disabled={busy}>
                    {busy ? "Publicando…" : sendNow ? "Publicar y enviar" : "Guardar sin enviar"}
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

        <OpsComunicacionTelegramConfig canEdit={canEdit} open={configOpen} onClose={() => setConfigOpen(false)} />
        <OpsComunicacionTelegramPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={titulo.trim()}
          body={cuerpoFinal}
          categoryLabel={
            (categories.find((c) => c.id === categoria) || { label: "Operaciones" }).label
          }
          imageUrl={imageUrl}
        />

        {tableLoading ? (
          <div className="crypto-news-loading text-muted">Cargando historial…</div>
        ) : items.length === 0 ? (
          <div className="hrs-card sgi-glass-panel p-4 text-muted">
            Todavía no hay comunicados. {canEdit ? "Escribí el primero arriba y envialo al bot." : ""}
          </div>
        ) : (
          <section className="crypto-news-grid" aria-label="Historial de comunicación granja">
            {items.map((n) => (
              <article key={n.id} className="crypto-news-card">
                <div className="crypto-news-card__body">
                  <div className="crypto-news-card__meta">
                    <span className="crypto-news-source">{n.categoriaLabel}</span>
                    <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                  </div>
                  <h3 className="crypto-news-card__title">{n.titulo}</h3>
                  {n.cuerpo ? <p className="crypto-news-card__summary">{n.cuerpo}</p> : null}
                  <div className="crypto-news-card__actions">
                    <span className={`crypto-news-send-tg${n.telegramSent ? " crypto-news-send-tg--sent" : ""}`}>
                      {n.telegramSent ? "Ya enviado" : "Pendiente"}
                    </span>
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
