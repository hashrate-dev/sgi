import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  detectOpsComunicacionTelegramChats,
  getOpsComunicacionTelegram,
  putOpsComunicacionTelegram,
  testOpsComunicacionTelegram,
  type OpsComunicacionTelegramSettings,
} from "../lib/api";

type Props = {
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
};

function channelLabel(s: OpsComunicacionTelegramSettings | null): string {
  if (!s) return "…";
  if (s.tokenConfigured) {
    return s.botUsername ? `Telegram @${s.botUsername}` : "Telegram Bot API";
  }
  return "Sin bot (falta TELEGRAM_BOT_TOKEN o TELEGRAM_OPS_BOT_TOKEN)";
}

export function OpsComunicacionTelegramConfig({ canEdit, open, onClose }: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [tg, setTg] = useState<OpsComunicacionTelegramSettings | null>(null);
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
      const tgRes = await getOpsComunicacionTelegram();
      setTg(tgRes);
      setTgEnabled(Boolean(tgRes.enabled));
      setTgChatId(tgRes.chatId || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar Telegram.");
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

  const onSaveTelegram = async () => {
    if (!canEdit) return;
    setTgSaving(true);
    setErr("");
    setOk("");
    try {
      const r = await putOpsComunicacionTelegram({ enabled: tgEnabled, chatId: tgChatId });
      setTg(r);
      setTgEnabled(Boolean(r.enabled));
      setTgChatId(r.chatId || "");
      setOk(
        r.enabled
          ? r.readyToSend
            ? "Telegram de Comunicación granja guardado. Ya podés enviar comunicados."
            : "Guardado, pero falta TELEGRAM_BOT_TOKEN (o TELEGRAM_OPS_BOT_TOKEN) en el servidor."
          : "Avisos Telegram de Comunicación desactivados."
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
      const r = await testOpsComunicacionTelegram({ enabled: true, chatId: tgChatId });
      setTg(r);
      setTgEnabled(Boolean(r.enabled));
      setTgChatId(r.chatId || tgChatId);
      setOk("Prueba enviada. Revisá el chat del bot de Comunicación granja.");
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
      const r = await detectOpsComunicacionTelegramChats();
      setTgChats(r.chats || []);
      if (r.chats?.[0]?.chatId && !tgChatId.trim()) {
        setTgChatId(r.chats[0].chatId);
      }
      setOk(
        r.chats?.length
          ? `Detecté ${r.chats.length} chat(s). Elegí uno o dejá el Chat ID cargado.`
          : r.hint || "No hay chats todavía: abrí el bot de Comunicación y mandale /start."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron detectar chats.");
    } finally {
      setTgDetecting(false);
    }
  };

  if (!open) return null;

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
              Telegram · Comunicación granja
            </h2>
            <p className="crypto-news-medios__lead">
              Este bot es independiente del wire de noticias de mercado. Sirve solo para avisar operaciones de la
              granja. Creá un bot en @BotFather con otro nombre, o usá el mismo token del servidor.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="crypto-news-medios-modal__close"
            onClick={onClose}
            aria-label="Cerrar configuración de Telegram"
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
            <p className="text-muted small mb-0">Cargando Telegram…</p>
          ) : (
            <section className="crypto-news-tg" aria-label="Telegram Comunicación granja">
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
                      <span>Activar envíos de Comunicación granja por Telegram</span>
                    </label>
                  </div>
                  <div className="col-12 col-md-7">
                    <label className="form-label small mb-1" htmlFor="ops-tg-chat">
                      Chat ID
                    </label>
                    <input
                      id="ops-tg-chat"
                      className="form-control form-control-sm"
                      placeholder="Ej. 123456789"
                      value={tgChatId}
                      disabled={tgSaving || tgTesting || tgDetecting}
                      onChange={(e) => setTgChatId(e.target.value.trim())}
                    />
                  </div>
                  <div className="col-12 d-flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={tgSaving || tgTesting || tgDetecting}
                      onClick={() => void onSaveTelegram()}
                    >
                      {tgSaving ? "Guardando…" : "Guardar Telegram"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-light"
                      disabled={tgSaving || tgTesting || tgDetecting}
                      onClick={() => void onDetectTelegramChats()}
                    >
                      {tgDetecting ? "Detectando…" : "Detectar chats"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-light"
                      disabled={tgSaving || tgTesting || tgDetecting || !tgChatId}
                      onClick={() => void onTestTelegram()}
                    >
                      {tgTesting ? "Enviando…" : "Enviar prueba"}
                    </button>
                  </div>
                  {tgChats.length > 0 ? (
                    <div className="col-12">
                      <p className="small text-muted mb-1 mt-2">Chats detectados</p>
                      <div className="d-flex flex-wrap gap-1">
                        {tgChats.map((c) => (
                          <button
                            key={c.chatId}
                            type="button"
                            className="btn btn-sm btn-outline-light"
                            onClick={() => setTgChatId(c.chatId)}
                          >
                            {c.name} · {c.chatId}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="small text-muted mb-0">Solo lectura: no podés cambiar el bot.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
