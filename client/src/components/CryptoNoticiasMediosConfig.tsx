import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  createCryptoNoticiaMedio,
  deleteCryptoNoticiaMedio,
  detectCryptoNoticiasTelegramChats,
  getCryptoNoticiasMedios,
  getCryptoNoticiasTelegram,
  putCryptoNoticiasTelegram,
  testCryptoNoticiasTelegram,
  updateCryptoNoticiaMedio,
  type CryptoNoticiaMedio,
  type CryptoNoticiaTopic,
  type CryptoNoticiasTelegramSettings,
} from "../lib/api";

type Props = {
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
};

const TOPIC_OPTS: Array<{ id: CryptoNoticiaTopic; label: string }> = [
  { id: "cripto", label: "Cripto" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "dogecoin", label: "Dogecoin" },
  { id: "litecoin", label: "Litecoin" },
  { id: "zcash", label: "Zcash" },
  { id: "inversion", label: "Inversiones" },
  { id: "gobierno_usa", label: "Gobierno USA" },
  { id: "usa", label: "Cripto USA" },
  { id: "uruguay", label: "Cripto Uruguay" },
];

function channelLabel(s: CryptoNoticiasTelegramSettings | null): string {
  if (!s) return "…";
  if (s.tokenConfigured) {
    return s.botUsername ? `Telegram @${s.botUsername}` : "Telegram Bot API";
  }
  return "Sin bot (falta TELEGRAM_BOT_TOKEN en el servidor)";
}

export function CryptoNoticiasMediosConfig({ canEdit, open, onClose }: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<CryptoNoticiaMedio[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [topics, setTopics] = useState<CryptoNoticiaTopic[]>(["cripto"]);
  const [saving, setSaving] = useState(false);

  const [tg, setTg] = useState<CryptoNoticiasTelegramSettings | null>(null);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgChatId, setTgChatId] = useState("");
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgDetecting, setTgDetecting] = useState(false);
  const [tgChats, setTgChats] = useState<Array<{ chatId: string; name: string; username?: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [r, tgRes] = await Promise.all([getCryptoNoticiasMedios(), getCryptoNoticiasTelegram()]);
      setItems(r.items || []);
      setTg(tgRes);
      setTgEnabled(Boolean(tgRes.enabled));
      setTgChatId(tgRes.chatId || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la configuración de medios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setOk("");
    setErr("");
    void load();
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const toggleEnabled = async (m: CryptoNoticiaMedio) => {
    if (!canEdit) return;
    setBusyId(m.id);
    setErr("");
    setOk("");
    try {
      const r = await updateCryptoNoticiaMedio(m.id, { enabled: !m.enabled });
      if (r.item) {
        setItems((prev) => prev.map((x) => (x.id === m.id ? r.item! : x)));
      } else {
        await load();
      }
      setOk(m.enabled ? `Medio desactivado: ${m.name}` : `Medio aceptado: ${m.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo actualizar el medio.");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (m: CryptoNoticiaMedio) => {
    if (!canEdit || m.isBuiltin) return;
    if (!window.confirm(`¿Eliminar el medio «${m.name}»?`)) return;
    setBusyId(m.id);
    setErr("");
    setOk("");
    try {
      await deleteCryptoNoticiaMedio(m.id);
      setItems((prev) => prev.filter((x) => x.id !== m.id));
      setOk(`Medio eliminado: ${m.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar el medio.");
    } finally {
      setBusyId(null);
    }
  };

  const onAdd = async () => {
    if (!canEdit) return;
    setErr("");
    setOk("");
    const n = name.trim();
    const u = url.trim();
    if (n.length < 2) {
      setErr("Indicá el nombre del medio de comunicación.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setErr("La URL del RSS debe empezar con http:// o https://");
      return;
    }
    setSaving(true);
    try {
      const r = await createCryptoNoticiaMedio({
        name: n,
        url: u,
        topics: topics.length ? topics : ["cripto"],
        enabled: true,
      });
      if (r.item) {
        setItems((prev) =>
          [...prev, r.item!].sort(
            (a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name, "es")
          )
        );
      } else await load();
      setName("");
      setUrl("");
      setTopics(["cripto"]);
      setOk(`Medio agregado: ${n}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo agregar el medio.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveTelegram = async () => {
    if (!canEdit) return;
    setTgSaving(true);
    setErr("");
    setOk("");
    try {
      const r = await putCryptoNoticiasTelegram({ enabled: tgEnabled, chatId: tgChatId });
      setTg(r);
      setTgEnabled(Boolean(r.enabled));
      setTgChatId(r.chatId || "");
      setOk(
        r.enabled
          ? r.readyToSend
            ? "Telegram del wire guardado. Las noticias nuevas del bot se enviarán a ese chat."
            : "Guardado, pero falta TELEGRAM_BOT_TOKEN en el servidor (Vercel)."
          : "Avisos Telegram del wire desactivados."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar Telegram.");
    } finally {
      setTgSaving(false);
    }
  };

  const onTestTelegram = async () => {
    if (!canEdit) return;
    setTgTesting(true);
    setErr("");
    setOk("");
    try {
      await putCryptoNoticiasTelegram({ enabled: tgEnabled || true, chatId: tgChatId });
      await testCryptoNoticiasTelegram();
      setOk("Prueba enviada por Telegram. Revisá el chat del bot.");
      const refreshed = await getCryptoNoticiasTelegram();
      setTg(refreshed);
      setTgEnabled(Boolean(refreshed.enabled));
      setTgChatId(refreshed.chatId || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falló la prueba de Telegram.");
    } finally {
      setTgTesting(false);
    }
  };

  const onDetectTelegramChats = async () => {
    if (!canEdit) return;
    setTgDetecting(true);
    setErr("");
    setOk("");
    try {
      const r = await detectCryptoNoticiasTelegramChats();
      setTgChats(r.chats || []);
      if (r.chats?.[0]?.chatId && !tgChatId.trim()) {
        setTgChatId(r.chats[0].chatId);
      }
      setOk(
        r.chats?.length
          ? `Detecté ${r.chats.length} chat(s). Elegí uno o dejá el Chat ID cargado.`
          : r.hint || "No hay chats todavía: abrí el bot y mandale /start."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron detectar chats.");
    } finally {
      setTgDetecting(false);
    }
  };

  if (!open) return null;

  const enabledCount = items.filter((m) => m.enabled).length;

  return (
    <div
      className="crypto-news-medios-modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="crypto-news-medios-modal__dialog hrs-card sgi-glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="crypto-news-medios-modal__head">
          <div>
            <h2 id={titleId} className="crypto-news-medios__title">
              Configuración de medios
            </h2>
            <p className="crypto-news-medios__lead">
              Aceptá o rechazá las fuentes que el bot consulta. También podés indicar un medio propio con
              su URL RSS.
              {!loading ? ` (${enabledCount} activos de ${items.length})` : ""}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="crypto-news-medios-modal__close"
            onClick={onClose}
            aria-label="Cerrar configuración de medios"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path
                fill="currentColor"
                d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z"
              />
            </svg>
          </button>
        </div>

        <div className="crypto-news-medios-modal__body crypto-news-medios__body">
          {err ? <div className="alert alert-danger py-2">{err}</div> : null}
          {ok ? <div className="alert alert-success py-2">{ok}</div> : null}
          {loading ? (
            <p className="text-muted small mb-0">Cargando medios…</p>
          ) : (
            <>
              <section className="crypto-news-tg" aria-label="Telegram wire">
                <h3 className="crypto-news-medios__add-title">Telegram · avisos del bot</h3>
                <p className="crypto-news-medios__lead" style={{ marginBottom: "0.75rem" }}>
                  Cuando el bot carga noticias <strong>nuevas</strong> (manual, cron o auto), te manda un
                  resumen a este chat. No reenvía el historial viejo.
                </p>
                <div className="crypto-news-tg__status">
                  <span className={`crypto-news-medios__badge${tg?.readyToSend ? " is-ok" : " is-no"}`}>
                    {tg?.readyToSend ? "Listo para enviar" : "Pendiente"}
                  </span>
                  <span className="crypto-news-medios__badge is-manual">{channelLabel(tg)}</span>
                </div>
                {canEdit ? (
                  <div className="row g-2 align-items-end">
                    <div className="col-12">
                      <label className="crypto-news-tg__check">
                        <input
                          type="checkbox"
                          checked={tgEnabled}
                          disabled={tgSaving || tgTesting || tgDetecting}
                          onChange={(e) => setTgEnabled(e.target.checked)}
                        />
                        <span>Enviar noticias nuevas del bot por Telegram</span>
                      </label>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label small mb-1" htmlFor="crypto-tg-chat">
                        Chat ID
                      </label>
                      <input
                        id="crypto-tg-chat"
                        className="form-control form-control-sm"
                        placeholder="Ej. 123456789"
                        value={tgChatId}
                        disabled={tgSaving || tgTesting || tgDetecting}
                        onChange={(e) => setTgChatId(e.target.value.trim())}
                      />
                    </div>
                    <div className="col-12 col-md-6 d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={tgSaving || tgTesting || tgDetecting}
                        onClick={() => void onSaveTelegram()}
                      >
                        {tgSaving ? "Guardando…" : "Guardar Telegram"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        disabled={tgSaving || tgTesting || tgDetecting || !tgChatId.trim()}
                        onClick={() => void onTestTelegram()}
                      >
                        {tgTesting ? "Enviando…" : "Enviar prueba"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-info btn-sm"
                        disabled={tgSaving || tgTesting || tgDetecting}
                        onClick={() => void onDetectTelegramChats()}
                      >
                        {tgDetecting ? "Detectando…" : "Detectar chats"}
                      </button>
                    </div>
                    {tgChats.length > 0 ? (
                      <div className="col-12">
                        <div className="crypto-news-tg__chats" role="list">
                          {tgChats.map((c) => (
                            <button
                              key={c.chatId}
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setTgChatId(c.chatId)}
                              title={c.chatId}
                            >
                              {c.name}
                              {c.username ? ` (@${c.username})` : ""} · {c.chatId}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="col-12">
                      <p className="crypto-news-tg__hint mb-0">
                        1) Creá un bot con <code>@BotFather</code> → token. 2) En Vercel:{" "}
                        <code>TELEGRAM_BOT_TOKEN</code> (+ opcional <code>TELEGRAM_BOT_USERNAME</code>). 3)
                        Abrí el bot, mandá <code>/start</code>, tocá «Detectar chats» o pegá el Chat ID. Detalle
                        en <code>server/docs/TELEGRAM_WIRE.md</code>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted small mb-0">
                    {tgEnabled
                      ? `Avisos activos hacia chat ${tgChatId || "—"}.`
                      : "Avisos Telegram desactivados."}
                  </p>
                )}
              </section>

              <ul className="crypto-news-medios__list">
                {items.map((m) => (
                  <li key={m.id} className={`crypto-news-medios__item${m.enabled ? " is-on" : " is-off"}`}>
                    <div className="crypto-news-medios__item-main">
                      <div className="crypto-news-medios__item-title">
                        <span>{m.name}</span>
                        <span className={`crypto-news-medios__badge${m.isBuiltin ? "" : " is-manual"}`}>
                          {m.isBuiltin ? "Bot" : "Manual"}
                        </span>
                        <span className={`crypto-news-medios__badge${m.enabled ? " is-ok" : " is-no"}`}>
                          {m.enabled ? "Aceptado" : "Rechazado"}
                        </span>
                      </div>
                      <div className="crypto-news-medios__item-url" title={m.url}>
                        {m.url}
                      </div>
                      <div className="crypto-news-medios__item-topics">
                        {m.topics.map((t) => (
                          <span key={t}>{TOPIC_OPTS.find((o) => o.id === t)?.label ?? t}</span>
                        ))}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="crypto-news-medios__item-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${m.enabled ? "btn-outline-warning" : "btn-success"}`}
                          disabled={busyId === m.id}
                          onClick={() => void toggleEnabled(m)}
                        >
                          {busyId === m.id ? "…" : m.enabled ? "Rechazar" : "Aceptar"}
                        </button>
                        {!m.isBuiltin ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={busyId === m.id}
                            onClick={() => void onDelete(m)}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canEdit ? (
                <div className="crypto-news-medios__add">
                  <h3 className="crypto-news-medios__add-title">Agregar medio manualmente</h3>
                  <div className="row g-2">
                    <div className="col-12 col-md-4">
                      <label className="form-label small text-white-50 mb-1">Nombre del medio</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Ej. Cointelegraph, Bloomberg Crypto…"
                        value={name}
                        disabled={saving}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-md-8">
                      <label className="form-label small text-white-50 mb-1">URL del feed RSS</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="https://ejemplo.com/rss.xml"
                        value={url}
                        disabled={saving}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                    <div className="col-12">
                      <div className="crypto-news-medios__topics" role="group" aria-label="Temas">
                        {TOPIC_OPTS.map((t) => {
                          const on = topics.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              className={`crypto-news-chip${on ? " is-active" : ""}`}
                              disabled={saving}
                              onClick={() =>
                                setTopics((prev) =>
                                  on ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                                )
                              }
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="col-12">
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={saving}
                        onClick={() => void onAdd()}
                      >
                        {saving ? "Guardando…" : "Agregar medio"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted small mb-0 mt-2">
                  Solo lectura: pedile a un administrador que active o agregue medios.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
