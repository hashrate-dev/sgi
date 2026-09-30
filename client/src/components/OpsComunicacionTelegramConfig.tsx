import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  detectOpsComunicacionTelegramChats,
  getOpsComunicacionTelegram,
  putOpsComunicacionTelegram,
  testOpsComunicacionTelegram,
  type OpsComunicacionTelegramRecipient,
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
    const n = s.recipients?.length || s.chatIds?.length || 0;
    const bot = s.botUsername ? `@${s.botUsername}` : "Bot API";
    return n ? `${bot} · ${n} chat${n === 1 ? "" : "s"} privado${n === 1 ? "" : "s"}` : bot;
  }
  return "Sin bot: pegá el token de BotFather abajo y Guardar";
}

function isPrivateUserId(raw: string): boolean {
  return /^\d{5,20}$/.test(String(raw || "").trim());
}

function realName(name: string | undefined, chatId: string): string {
  const t = String(name ?? "").trim();
  if (t && t !== chatId) return t.slice(0, 80);
  if (chatId === "1022374559") return "JL";
  return "";
}

function mergeRecipients(
  ...lists: OpsComunicacionTelegramRecipient[][]
): OpsComunicacionTelegramRecipient[] {
  const byId = new Map<string, OpsComunicacionTelegramRecipient>();
  for (const list of lists) {
    for (const r of list) {
      const chatId = String(r.chatId || "").trim();
      if (!isPrivateUserId(chatId) || (byId.size >= 250 && !byId.has(chatId))) continue;
      const prev = byId.get(chatId);
      const name = realName(r.name, chatId) || realName(prev?.name, chatId) || chatId;
      const username = (r.username || prev?.username || "").replace(/^@/, "");
      const poolUser = String(r.poolUser !== undefined ? r.poolUser : prev?.poolUser || "")
        .trim()
        .slice(0, 80);
      const row: OpsComunicacionTelegramRecipient = { chatId, name };
      if (username) row.username = username;
      if (poolUser) row.poolUser = poolUser;
      byId.set(chatId, row);
    }
  }
  return [...byId.values()];
}

export function OpsComunicacionTelegramConfig({ canEdit, open, onClose }: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [tg, setTg] = useState<OpsComunicacionTelegramSettings | null>(null);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [recipients, setRecipients] = useState<OpsComunicacionTelegramRecipient[]>([]);
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgDetecting, setTgDetecting] = useState(false);
  const [pending, setPending] = useState<OpsComunicacionTelegramRecipient[]>([]);

  const applySettings = (r: OpsComunicacionTelegramSettings) => {
    setTg(r);
    setTgEnabled(Boolean(r.enabled));
    setRecipients(mergeRecipients(r.recipients || (r.chatId ? [{ chatId: r.chatId, name: r.chatId }] : [])));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const tgRes = await getOpsComunicacionTelegram();
      applySettings(tgRes);
      const detected = await detectOpsComunicacionTelegramChats().catch(() => null);
      const found = (detected?.chats || []).filter((c) => isPrivateUserId(c.chatId));
      if (found.length) {
        const next = mergeRecipients(
          tgRes.recipients || (tgRes.chatId ? [{ chatId: tgRes.chatId, name: tgRes.chatId }] : []),
          found
        );
        applySettings({ ...tgRes, recipients: next });
        if (canEdit && JSON.stringify(next) !== JSON.stringify(tgRes.recipients || [])) {
          await putOpsComunicacionTelegram({
            enabled: Boolean(tgRes.enabled),
            recipients: next,
          }).then(applySettings).catch(() => undefined);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar Telegram.");
    } finally {
      setLoading(false);
    }
  }, [canEdit]);

  useEffect(() => {
    if (!open) return;
    setOk("");
    setErr("");
    setPending([]);
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

  const persist = async (next: OpsComunicacionTelegramRecipient[], enabled = tgEnabled) => {
    const r = await putOpsComunicacionTelegram({
      enabled,
      recipients: next,
      botToken: tgBotToken.trim() || undefined,
    });
    applySettings(r);
    setTgBotToken("");
    return r;
  };

  const onSaveTelegram = async () => {
    if (!canEdit) return;
    setTgSaving(true);
    setErr("");
    setOk("");
    try {
      const r = await persist(recipients, tgEnabled);
      setOk(
        r.enabled
          ? r.readyToSend
            ? `Listo. Cada aviso se manda aparte a ${r.recipients?.length || r.chatIds?.length || 0} chat(s) privado(s).`
            : "Guardado. Falta el token del bot o al menos un cliente."
          : r.tokenConfigured
            ? "Token guardado. Agregá clientes, activá envíos y Guardar."
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
      const r = await testOpsComunicacionTelegram({
        enabled: true,
        recipients,
        botToken: tgBotToken.trim() || undefined,
      });
      applySettings(r);
      setTgBotToken("");
      const n = r.sentTo ?? r.recipients?.length ?? recipients.length;
      setOk(`Prueba enviada a ${n} chat(s) privado(s). Cada uno la ve solo en su conversación con el bot.`);
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
      if (tgBotToken.trim()) {
        const saved = await putOpsComunicacionTelegram({
          enabled: Boolean(tgEnabled && recipients.length),
          recipients,
          botToken: tgBotToken.trim(),
        });
        applySettings(saved);
        setTgBotToken("");
      }
      const r = await detectOpsComunicacionTelegramChats();
      const found = (r.chats || []).filter((c) => isPrivateUserId(c.chatId));
      const known = new Set(recipients.map((x) => x.chatId));
      const fresh = found.filter((c) => !known.has(c.chatId));
      const next = mergeRecipients(recipients, found);
      setRecipients(next);
      setPending(fresh);
      const saved = await persist(next, tgEnabled);
      setPending([]);
      if (fresh.length) {
        setOk(
          `Agregué ${fresh.length} chat(s) y actualicé los nombres. Ahora hay ${saved.recipients?.length || next.length}.`
        );
      } else if (found.length) {
        setOk("Actualicé los nombres de Telegram en las pastillas. No había chats nuevos.");
      } else {
        setOk(r.hint || "Nadie nuevo: cada cliente abre el bot y manda /start, después Detectar chats.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron detectar chats.");
    } finally {
      setTgDetecting(false);
    }
  };

  const onAddManual = () => {
    const chatId = manualId.trim();
    if (!isPrivateUserId(chatId)) {
      setErr("El Chat ID tiene que ser el número positivo del chat privado (no un grupo ni un canal).");
      setOk("");
      return;
    }
    setErr("");
    setRecipients((cur) => mergeRecipients(cur, [{ chatId, name: manualName.trim() || chatId }]));
    setManualId("");
    setManualName("");
    setOk("Cliente agregado a la lista. Tocá Guardar Telegram para dejarlo fijo.");
  };

  const onRemove = (chatId: string) => {
    setRecipients((cur) => cur.filter((x) => x.chatId !== chatId));
    setOk("Quitado de la lista. Guardá Telegram para que no reciba más avisos.");
  };

  if (!open) return null;

  const botLink = tg?.botUsername ? `https://t.me/${tg.botUsername.replace(/^@/, "")}` : "";

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
              El bot escribe a cada cliente por separado. No hay canal ni lista de miembros a la vista.
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
                <div className="crypto-news-tg-form">
                  <label className="crypto-news-tg__check">
                    <input
                      type="checkbox"
                      checked={tgEnabled}
                      disabled={tgSaving || tgTesting || tgDetecting}
                      onChange={(e) => setTgEnabled(e.target.checked)}
                    />
                    <span>Activar envíos uno a uno por Telegram</span>
                  </label>
                  <div className="ops-com-tg-field">
                    <label className="crypto-news-tg-field__label" htmlFor="ops-tg-token">
                      Token del bot
                    </label>
                    <input
                      id="ops-tg-token"
                      className="form-control"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={tg?.tokenConfigured ? "Ya está cargado" : "123456789:AAH…"}
                      value={tgBotToken}
                      disabled={tgSaving || tgTesting || tgDetecting}
                      onChange={(e) => setTgBotToken(e.target.value)}
                    />
                    <p className="crypto-news-tg-field__hint">
                      {tg?.tokenConfigured
                        ? "Dejalo vacío. Solo pegá un token nuevo si BotFather te dio otro."
                        : "Copiá el API Token de @BotFather (Hashrate Operations)."}
                    </p>
                  </div>

                  <div className="ops-com-tg-recip">
                    <p className="crypto-news-tg-field__label">Clientes (chats privados)</p>
                    <p className="crypto-news-tg-field__hint">
                      Cada persona abre {botLink ? <a href={botLink} target="_blank" rel="noreferrer">el bot</a> : "el bot"}{" "}
                      y manda /start. Después Detectar chats. Nadie ve a los demás ni cuántos hay.
                    </p>
                    {recipients.length ? (
                      <ul className="ops-com-tg-recip__list">
                        {recipients.map((c) => {
                          const label = realName(c.name, c.chatId) || (c.username ? `@${c.username}` : "Cliente");
                          return (
                            <li key={c.chatId}>
                              <span className="ops-com-tg-recip__pill">
                                <strong className="ops-com-tg-recip__name">{label}</strong>
                                <span className="ops-com-tg-recip__id">{c.chatId}</span>
                              </span>
                              <button
                                type="button"
                                className="ops-com-tg-recip__del"
                                disabled={tgSaving || tgTesting || tgDetecting}
                                onClick={() => onRemove(c.chatId)}
                              >
                                Quitar
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="ops-com-tg-recip__empty">Todavía no hay clientes en la lista.</p>
                    )}
                    <div className="ops-com-tg-recip__add">
                      <input
                        className="form-control"
                        placeholder="Nombre (opcional)"
                        value={manualName}
                        disabled={tgSaving || tgTesting || tgDetecting}
                        onChange={(e) => setManualName(e.target.value)}
                      />
                      <input
                        className="form-control"
                        inputMode="numeric"
                        placeholder="Chat ID (número)"
                        value={manualId}
                        disabled={tgSaving || tgTesting || tgDetecting}
                        onChange={(e) => setManualId(e.target.value.trim())}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-light"
                        disabled={tgSaving || tgTesting || tgDetecting || !manualId.trim()}
                        onClick={onAddManual}
                      >
                        Agregar
                      </button>
                    </div>
                    {pending.length ? (
                      <p className="crypto-news-tg-field__hint">
                        Nuevos detectados: {pending.map((p) => p.name || p.chatId).join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="crypto-news-tg-form__actions">
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
                      disabled={tgSaving || tgTesting || tgDetecting || recipients.length === 0}
                      onClick={() => void onTestTelegram()}
                    >
                      {tgTesting ? "Enviando…" : "Enviar prueba a todos"}
                    </button>
                  </div>
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
