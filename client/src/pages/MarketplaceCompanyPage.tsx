import { useCallback, useEffect, useId, useState } from "react";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";

const UP = "https://hashrate.space/wp-content/uploads";

type TeamKey = "fab" | "jv" | "af" | "dg" | "rg" | "ab";

const TEAM: readonly {
  key: TeamKey;
  img: string;
  linkedin?: string;
}[] = [
  { key: "fab", img: `${UP}/FB-Team-1-1024x991.png`, linkedin: "https://www.linkedin.com/in/fabrianchi/" },
  { key: "jv", img: `${UP}/JV-Team-1024x991.png`, linkedin: "https://www.linkedin.com/in/jlvilasoler/" },
  { key: "af", img: `${UP}/AF-Team-1024x991.png`, linkedin: "https://www.linkedin.com/in/figueroaanthony/" },
  { key: "dg", img: `${UP}/DG-Team-HRS-1024x991.png` },
  { key: "rg", img: `${UP}/RG-1024x991.png` },
  { key: "ab", img: `${UP}/AB-Team-1024x991.png` },
] as const;

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4V8zm7.5 0h3.8v2h.05c.53-1 1.84-2.31 3.8-2.31 4.06 0 4.8 2.67 4.8 6.14V23h-4v-7.7c0-1.84-.03-4.2-2.56-4.2-2.56 0-2.95 2-2.95 4.1V23h-4V8z"
      />
    </svg>
  );
}

export function MarketplaceCompanyPage() {
  const { t } = useMarketplaceLang();
  const dialogTitleId = useId();
  const [openMember, setOpenMember] = useState<TeamKey | null>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = t("company.doc_title");
    let meta = document.querySelector('meta[name="description"]');
    const prevContent = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", t("company.meta_desc"));

    let linkGoogle = document.querySelector('link[href*="fonts.googleapis.com"][href*="Space+Grotesk"]');
    if (!linkGoogle) {
      linkGoogle = document.createElement("link");
      linkGoogle.setAttribute("rel", "stylesheet");
      linkGoogle.setAttribute(
        "href",
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap"
      );
      document.head.appendChild(linkGoogle);
    }

    return () => {
      document.title = prevTitle;
      meta?.setAttribute("content", prevContent);
    };
  }, [t]);

  useEffect(() => {
    if (!openMember) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMember(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openMember]);

  const renderMemberBio = useCallback(
    (key: TeamKey) => {
      const paras: React.ReactNode[] = [];
      if (key === "jv") {
        paras.push(<p key="1">{t("company.m.jv.b1")}</p>);
        paras.push(<p key="2">{t("company.m.jv.b2")}</p>);
        paras.push(
          <p key="3">
            {t("company.m.jv.b3a")}
            <strong>{t("company.m.jv.brand")}</strong>
            {t("company.m.jv.b3b")}
          </p>
        );
        paras.push(<p key="4">{t("company.m.jv.b4")}</p>);
        return paras;
      }
      const bKeys = [`company.m.${key}.b1`, `company.m.${key}.b2`, `company.m.${key}.b3`] as const;
      for (const bk of bKeys) {
        const text = t(bk);
        if (!text || text === bk) break;
        paras.push(<p key={bk}>{text}</p>);
      }
      return paras;
    },
    [t]
  );

  const openMemberData = openMember ? TEAM.find((m) => m.key === openMember) : null;

  return (
    <div className="marketplace-asic-page market-corp-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-company">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--corp page-main--market--company">
          <div className="market-corp-inner market-corp-inner--flush-top market-corp-company">
            {/* Intro — dos columnas (WP) */}
            <section className="market-corp-company-intro" aria-labelledby="company-intro-h3">
              <div className="market-corp-company-intro__grid">
                <div className="market-corp-company-intro__copy">
                  <h3 id="company-intro-h3" className="market-corp-gradient-title market-corp-company-intro__h3">
                    {t("company.intro.h3")}
                  </h3>
                  <div className="market-corp-company-intro__text">
                    <p>{t("company.intro.p1")}</p>
                    <p>{t("company.intro.p2")}</p>
                    <p>{t("company.intro.p3")}</p>
                  </div>
                  <h3 className="market-corp-gradient-title market-corp-company-intro__h3 market-corp-company-intro__h3--spaced">
                    {t("company.values.h3")}
                  </h3>
                  <div className="market-corp-company-intro__text">
                    <p>{t("company.values.p1")}</p>
                    <p>{t("company.values.p2")}</p>
                  </div>
                </div>
                <div className="market-corp-company-intro__visual">
                  <div className="market-corp-company-intro__img-wrap">
                    <img
                      src={`${UP}/HRS-ASICS-HOT.png`}
                      alt={t("company.intro.img_alt")}
                      width={772}
                      height={1376}
                      loading="eager"
                      decoding="async"
                      className="market-corp-company-intro__img"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Liderazgo + equipo */}
            <section className="market-corp-company-team" aria-labelledby="company-lead-h2">
              <div className="market-corp-company-team__grid">
                <div className="market-corp-company-team__lead">
                  <h2 id="company-lead-h2" className="market-corp-gradient-title market-corp-company-team__h2">
                    {t("company.lead.h2")}
                  </h2>
                  <p className="market-corp-company-team__lede">{t("company.lead.p")}</p>
                  <div className="market-corp-company-team__accent" aria-hidden />
                </div>
                <div className="market-corp-company-team__cards">
                  <div className="market-corp-company-team__cards-grid">
                    {TEAM.map((m) => (
                      <article key={m.key} className="market-corp-team-card">
                        <button
                          type="button"
                          className="market-corp-team-card__btn"
                          onClick={() => setOpenMember(m.key)}
                          aria-haspopup="dialog"
                          aria-expanded={openMember === m.key}
                          aria-controls={openMember === m.key ? dialogTitleId : undefined}
                        >
                          <span className="market-corp-team-card__media">
                            <img src={m.img} alt="" width={500} height={500} loading="lazy" decoding="async" />
                          </span>
                          <span className="market-corp-team-card__meta">
                            <span className="market-corp-team-card__role">{t(`company.m.${m.key}.role`)}</span>
                            <span className="market-corp-team-card__name">{t(`company.m.${m.key}.name`)}</span>
                            <span className="market-corp-team-card__hint">{t("company.team.read_bio")}</span>
                          </span>
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="market-corp-end-band">
            <div className="market-corp-end-band__gradient" aria-hidden />
            <MarketplaceSiteFooter variant="corp-end-band" />
          </div>
        </main>
      </div>

      {openMember && openMemberData ? (
        <div
          className="market-corp-team-modal"
          role="presentation"
          onClick={() => setOpenMember(null)}
          onKeyDown={(e) => e.key === "Escape" && setOpenMember(null)}
        >
          <div
            id={dialogTitleId}
            className="market-corp-team-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-modal-name"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="market-corp-team-modal__close" onClick={() => setOpenMember(null)}>
              {t("company.team.dlg_close")}
            </button>
            <div className="market-corp-team-modal__head">
              <img
                className="market-corp-team-modal__photo"
                src={openMemberData.img}
                alt=""
                width={160}
                height={160}
              />
              <div>
                <p className="market-corp-team-modal__role">{t(`company.m.${openMember}.role`)}</p>
                <h3 id="team-modal-name" className="market-corp-team-modal__name">
                  {t(`company.m.${openMember}.name`)}
                </h3>
              </div>
            </div>
            <div className="market-corp-team-modal__bio">{renderMemberBio(openMember)}</div>
            {openMemberData.linkedin ? (
              <a
                className="market-corp-team-modal__linkedin"
                href={openMemberData.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("company.team.linkedin_aria")}
              >
                <LinkedInIcon />
                {t("company.team.linkedin_label")}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
