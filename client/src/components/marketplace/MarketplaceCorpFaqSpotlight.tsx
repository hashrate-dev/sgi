import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import type { CorpFaqSpotlightRow } from "../../lib/marketplaceFullFaqKeys.js";

export type MarketplaceCorpFaqSpotlightProps = {
  rows: CorpFaqSpotlightRow[];
  /** id del H2 principal (accesibilidad) */
  headingId: string;
  /** Índice abierto al montar (omitir = 0). `null` = todos cerrados. */
  defaultOpenIndex?: number | null;
  /** `aurora`: fondo local; `wpHero`: foto hydro + degradado tipo WordPress */
  variant?: "aurora" | "wpHero";
  /** Botón contacto: callback (p. ej. scroll a #contacto) */
  onContactClick?: () => void;
  /** Clases extra en el contenedor exterior del bloque (p. ej. ancho máximo) */
  className?: string;
};

function splitAnswer(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function MarketplaceCorpFaqSpotlight({
  rows,
  headingId,
  defaultOpenIndex,
  variant = "aurora",
  onContactClick,
  className = "",
}: MarketplaceCorpFaqSpotlightProps) {
  const { t } = useMarketplaceLang();
  const faqAccordionId = useId();
  const initialOpen = defaultOpenIndex === undefined ? 0 : defaultOpenIndex;
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(initialOpen);

  const rootClass =
    "market-corp-faq-spotlight" +
    (variant === "wpHero" ? " market-corp-faq-spotlight--wp-hero" : "") +
    (rows.length > 6 ? " market-corp-faq-spotlight--long" : "");

  return (
    <div className={`${rootClass} ${className}`.trim()}>
      <div className="market-corp-faq-spotlight__gradient" aria-hidden />
      <div className="market-corp-faq-spotlight__shine" aria-hidden />
      <div className="market-corp-faq-spotlight__inner">
        <div className="market-corp-faq-spotlight__grid">
          <div className="market-corp-faq-spotlight__lead">
            <p className="market-corp-faq-spotlight__kicker">{t("corp.faq.spot.kicker")}</p>
            <h2 id={headingId} className="market-corp-faq-spotlight__h2">
              {t("corp.faq.title")}
            </h2>
            <p className="market-corp-faq-spotlight__lede">{t("corp.faq.spot.specs")}</p>
            <div className="market-corp-faq-spotlight__lead-actions">
              <Link to="/marketplace" className="market-corp-faq-spotlight__btn market-corp-faq-spotlight__btn--primary">
                {t("corp.faq.shop_cta")}
              </Link>
              {onContactClick ? (
                <button
                  type="button"
                  className="market-corp-faq-spotlight__btn market-corp-faq-spotlight__btn--ghost"
                  onClick={onContactClick}
                >
                  {t("corp.faq.contact_cta")}
                </button>
              ) : (
                <Link
                  to="/marketplace/contact"
                  className="market-corp-faq-spotlight__btn market-corp-faq-spotlight__btn--ghost"
                >
                  {t("corp.faq.contact_cta")}
                </Link>
              )}
            </div>
          </div>
          <div className="market-corp-faq-spotlight__visual">
            <img
              src={`${import.meta.env.BASE_URL}images/Antminer_S21_Range.png`}
              alt={t("corp.faq.spot.img_alt")}
              width={960}
              height={640}
              loading="lazy"
              decoding="async"
              className="market-corp-faq-spotlight__img"
            />
          </div>
          <div className="market-corp-faq-spotlight__faqs">
            <p className="market-corp-faq-spotlight__faqs-kicker">{t("corp.faq.spot.acc_heading")}</p>
            <div className="market-corp-faq-spotlight__accordion" role="region" aria-label={t("corp.faq.title")}>
              {rows.map((row, i) => {
                const panelId = `${faqAccordionId}-panel-${i}`;
                const tabId = `${faqAccordionId}-tab-${i}`;
                const isOpen = openFaqIdx === i;
                const paragraphs = splitAnswer(t(row.a));
                return (
                  <div key={row.q} className="market-corp-faq-spotlight__acc-item">
                    <button
                      type="button"
                      id={tabId}
                      className="market-corp-faq-spotlight__acc-trigger"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenFaqIdx((cur) => (cur === i ? null : i))}
                    >
                      <span className="market-corp-faq-spotlight__acc-q">{t(row.q)}</span>
                      <span className="market-corp-faq-spotlight__acc-icon" aria-hidden>
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    <div
                      id={panelId}
                      aria-labelledby={tabId}
                      className="market-corp-faq-spotlight__acc-panel"
                      hidden={!isOpen}
                    >
                      <div className="market-corp-faq-spotlight__acc-body">
                        {paragraphs.map((para, j) => (
                          <p key={j} className="market-corp-faq-spotlight__acc-a">
                            {para}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="market-corp-faq-spotlight__footnote">{t("corp.faq.lede")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
