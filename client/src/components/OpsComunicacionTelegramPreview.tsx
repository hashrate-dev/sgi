import { useEffect, useId, useRef, useState } from "react";
import { getOpsComunicacionTelegram } from "../lib/api";
import { formatOpsFarmTelegramHtml, telegramHtmlToPreviewMarkup } from "../lib/opsComunicacionTelegramHtml";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  categoryLabel: string;
  imageUrl?: string;
};

function clockNow(): string {
  try {
    return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export function OpsComunicacionTelegramPreview({ open, onClose, title, body, categoryLabel, imageUrl }: Props) {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const botName = "Hashrate Operations";
  const [botUser, setBotUser] = useState("hashrate_operations_bot");
  const [photoBroken, setPhotoBroken] = useState(false);
  const photo = String(imageUrl || "").trim();
  const showPhoto = /^https?:\/\//i.test(photo) && !photoBroken;
  const html = formatOpsFarmTelegramHtml({ title, body, categoryLabel });

  useEffect(() => {
    if (!open) return;
    setPhotoBroken(false);
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    void getOpsComunicacionTelegram()
      .then((s) => {
        if (s.botUsername) setBotUser(s.botUsername.replace(/^@/, ""));
      })
      .catch(() => {
        /* preview local */
      });
    return () => window.clearTimeout(t);
  }, [open]);

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

  if (!open) return null;

  return (
    <div className="ops-tg-preview" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={onClose}>
      <div
        className="ops-tg-preview__dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ops-tg-preview__bar">
          <p id={titleId} className="ops-tg-preview__bar-title">
            Vista previa · Telegram
          </p>
          <button
            ref={closeBtnRef}
            type="button"
            className="ops-tg-preview__close"
            onClick={onClose}
            aria-label="Cerrar vista previa"
          >
            Cerrar
          </button>
        </div>

        <div className="ops-tg-phone" aria-label="Así se vería el mensaje en Telegram">
          <header className="ops-tg-phone__header">
            <span className="ops-tg-phone__back" aria-hidden>
              ‹
            </span>
            <span className="ops-tg-phone__avatar" aria-hidden>
              H
            </span>
            <div className="ops-tg-phone__who">
              <strong>{botName}</strong>
              <span>bot{botUser ? ` · @{botUser}` : ""}</span>
            </div>
          </header>

          <div className="ops-tg-phone__chat">
            <article className={`ops-tg-bubble${showPhoto ? " ops-tg-bubble--photo" : ""}`}>
              {showPhoto ? (
                <img
                  className="ops-tg-bubble__photo"
                  src={photo}
                  alt=""
                  onError={() => setPhotoBroken(true)}
                />
              ) : null}
              <div
                className="ops-tg-bubble__text"
                dangerouslySetInnerHTML={{ __html: telegramHtmlToPreviewMarkup(html) }}
              />
              <time className="ops-tg-bubble__time" dateTime={new Date().toISOString()}>
                {clockNow()}
              </time>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
