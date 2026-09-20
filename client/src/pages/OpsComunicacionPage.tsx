import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { OpsComunicacionTelegramConfig } from "../components/OpsComunicacionTelegramConfig";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  createOpsComunicacion,
  getOpsComunicacion,
  sendOpsComunicacionTelegram,
  type OpsComunicacionItem,
} from "../lib/api";
import { canAccessComunicacionModule, canEditComunicacionModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/crypto-noticias.css";
import "../styles/ops-comunicacion.css";

const PATH = "/gestion-administrativa/comunicacion";

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
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [categoria, setCategoria] = useState("general");
  const [imageUrl, setImageUrl] = useState("");
  const [sendNow, setSendNow] = useState(true);

  const canEdit = Boolean(user && canEditComunicacionModule(user));

  const load = useCallback(async () => {
    setTableLoading(true);
    try {
      const res = await getOpsComunicacion();
      setItems(res.items || []);
      setCategories(res.categories || []);
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
      setErr("El título tiene que tener al menos 3 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const r = await createOpsComunicacion({
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim(),
        categoria,
        imageUrl: imageUrl.trim(),
        sendNow,
      });
      setOk(
        sendNow
          ? `Comunicado enviado a Telegram${r.sentTo ? ` (${r.sentTo} chat)` : ""}.`
          : "Comunicado guardado. Todavía no se envió a Telegram."
      );
      setTitulo("");
      setCuerpo("");
      setImageUrl("");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "No se pudo publicar el comunicado.");
      await load();
    } finally {
      setBusy(false);
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
                  <input
                    id="ops-titulo"
                    className="fact-input"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    disabled={busy}
                    maxLength={180}
                    placeholder="Ej. Corte programado ANDE — sitio A"
                    autoComplete="off"
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
                <textarea
                  id="ops-cuerpo"
                  className="fact-input ops-com-textarea"
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  disabled={busy}
                  maxLength={3200}
                  rows={5}
                  placeholder="Qué pasa, horario, impacto en la flota y a quién avisar en sitio."
                />
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
                <button type="submit" className="btn btn-success" disabled={busy}>
                  {busy ? "Publicando…" : sendNow ? "Publicar y enviar" : "Guardar sin enviar"}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <OpsComunicacionTelegramConfig canEdit={canEdit} open={configOpen} onClose={() => setConfigOpen(false)} />

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
