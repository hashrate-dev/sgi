import { useEffect, useId, useRef, useState } from "react";

const BOT_USER = "hashrate_operations_bot";
const BOT_URL = `https://t.me/${BOT_USER}`;
const QR_SRC = "/images/ops-comunicacion/hashrate-operations-bot-qr.svg";

type Props = {
  open: boolean;
  onClose: () => void;
  markSrc: string;
};

const STEPS = [
  {
    n: "01",
    title: "Abrí Telegram",
    body: "En el celular o en la computadora, con tu cuenta de Telegram. No hace falta un grupo ni un canal.",
  },
  {
    n: "02",
    title: "Entrá al bot",
    body: "Escaneá el QR o abrí el enlace. Tiene que aparecer @hashrate_operations_bot.",
  },
  {
    n: "03",
    title: "Tocá Iniciar",
    body: "Si Telegram no muestra el botón, escribí /start y enviá. Eso abre el chat privado con Hashrate Operations.",
  },
  {
    n: "04",
    title: "Esperá la autorización",
    body: "Esperá a que te autoricen para acceder al bot de Hashrate. Cuando esté habilitado, vas a recibir los avisos de operaciones en este mismo chat.",
  },
];

export function OpsComunicacionShareBotModal({ open, onClose, markSrc }: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<"link" | "">("");

  useEffect(() => {
    if (!open) return;
    setCopied("");
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = async (kind: "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      setCopied("");
    }
  };

  const shareNative = async () => {
    if (!navigator.share) {
      await copy("link", BOT_URL);
      return;
    }
    try {
      await navigator.share({
        title: "@hashrate_operations_bot",
        text: "Bot de operaciones Hashrate Space. Abrí el chat y mandá /start.",
        url: BOT_URL,
      });
    } catch {
      /* canceló */
    }
  };

  return (
    <div
      className="crypto-news-medios-modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="crypto-news-medios-modal__dialog ops-com-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ops-com-share-phone">
          <div className="ops-com-share-phone__bar">
            <span className="ops-com-share-phone__notch" aria-hidden />
            <button
              ref={closeBtnRef}
              type="button"
              className="crypto-news-medios-modal__close ops-com-share-phone__close"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z"
                />
              </svg>
            </button>
          </div>

          <p className="ops-com-share-kicker">Telegram</p>
          <h2 id={titleId} className="ops-com-share-phone__title">
            Bot Hashrate
          </h2>

          <div className="ops-com-share-card__stage">
            <span className="ops-com-share-card__avatar" aria-hidden>
              <img src={markSrc} alt="" />
            </span>
            <div className="ops-com-share-card__plate">
              <img src={QR_SRC} width={512} height={512} alt={`QR para abrir ${BOT_URL}`} />
              <span className="ops-com-share-card__plane" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    fill="currentColor"
                    d="M21.5 3.4 2.8 10.6c-.7.27-.7 1.26.05 1.5l4.6 1.46 1.78 5.66c.2.64 1.02.8 1.47.3l2.57-2.84 4.5 3.32c.58.43 1.42.1 1.57-.62L22.4 4.2c.16-.78-.64-1.4-1.4-.8Zm-3.05 3.12-8.7 7.95-.3 3.38-1.4-4.45 10.4-6.88Z"
                  />
                </svg>
              </span>
            </div>
            <p className="ops-com-share-card__handle">@{BOT_USER.toUpperCase()}</p>
          </div>

          <ol className="ops-com-share-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="ops-com-share-step">
                <span className="ops-com-share-step__n">{s.n}</span>
                <div>
                  <h3 className="ops-com-share-step__title">{s.title}</h3>
                  <p className="ops-com-share-step__body">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="ops-com-share-card__actions">
            <a className="ops-com-share-btn ops-com-share-btn--primary" href={BOT_URL} target="_blank" rel="noreferrer">
              Abrir en Telegram
            </a>
            <button type="button" className="ops-com-share-btn" onClick={() => void copy("link", BOT_URL)}>
              {copied === "link" ? "Enlace copiado" : "Copiar enlace"}
            </button>
            <button type="button" className="ops-com-share-btn" onClick={() => void shareNative()}>
              Compartir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
