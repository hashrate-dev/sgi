import { useEffect, useId, useMemo, useState } from "react";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";

import { wpUpload } from "../lib/marketplaceWpAssets.js";
import { getMarketplaceCorpCompanyTeam } from "../lib/api.js";

type DefaultTeamMemberId = "fab" | "jv" | "af" | "dg" | "rg" | "ab" | "dv";

type TeamMemberDto = {
  id: string;
  imageUrl: string;
  linkedin?: string;
  role: string;
  name: string;
  bio: string[];
  enabled?: boolean;
};

const DEFAULT_TEAM: readonly {
  id: DefaultTeamMemberId;
  imageUrl: string;
  linkedin?: string;
}[] = [
  { id: "fab", imageUrl: wpUpload("FB-Team-1-1024x991.png"), linkedin: "https://www.linkedin.com/in/fabrianchi/" },
  { id: "jv", imageUrl: wpUpload("JV-Team-1024x991.png"), linkedin: "https://www.linkedin.com/in/jlvilasoler/" },
  { id: "af", imageUrl: wpUpload("AF-Team-1024x991.png"), linkedin: "https://www.linkedin.com/in/figueroaanthony/" },
  { id: "rg", imageUrl: wpUpload("RG-1024x991.png") },
  { id: "dv", imageUrl: wpUpload("DV-Team.png") },
  { id: "ab", imageUrl: wpUpload("AB-Team-1024x991.png") },
  { id: "dg", imageUrl: wpUpload("DG-Team-HRS-1024x991.png") },
] as const;

const KNOWN_TEAM_IDS = new Set<string>(DEFAULT_TEAM.map((m) => m.id));

function isKnownTeamMemberId(id: string): id is DefaultTeamMemberId {
  return KNOWN_TEAM_IDS.has(id);
}

function getCompanyMemberBio(t: (key: string) => string, key: DefaultTeamMemberId): string[] {
  if (key === "jv") {
    const b1 = t("company.m.jv.b1");
    const b2 = t("company.m.jv.b2");
    const b3a = t("company.m.jv.b3a");
    const brand = t("company.m.jv.brand");
    const b3b = t("company.m.jv.b3b");
    const b4 = t("company.m.jv.b4");
    const b3 = `${b3a}${brand}${b3b}`.trim();
    return [b1, b2, b3, b4].map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  const b1 = t(`company.m.${key}.b1`);
  const b2 = t(`company.m.${key}.b2`);
  return [b1, b2].map((x) => String(x ?? "").trim()).filter(Boolean);
}

function localizeCompanyTeamMember(m: TeamMemberDto, t: (key: string) => string): TeamMemberDto {
  if (!isKnownTeamMemberId(m.id)) return m;
  return {
    ...m,
    role: t(`company.m.${m.id}.role`),
    name: t(`company.m.${m.id}.name`),
    bio: getCompanyMemberBio(t, m.id),
  };
}

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
  const fallbackMembers = useMemo<TeamMemberDto[]>(() => {
    return DEFAULT_TEAM.map((m) => ({
      id: m.id,
      imageUrl: m.imageUrl,
      linkedin: m.linkedin,
      role: t(`company.m.${m.id}.role`),
      name: t(`company.m.${m.id}.name`),
      bio: getCompanyMemberBio(t, m.id),
      enabled: true,
    }));
  }, [t]);

  const [rawTeamMembers, setRawTeamMembers] = useState<TeamMemberDto[] | null>(null);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  const teamMembers = useMemo(() => {
    const source =
      rawTeamMembers && rawTeamMembers.length > 0
        ? rawTeamMembers.filter((m) => m.enabled !== false)
        : fallbackMembers;
    return source.map((m) => localizeCompanyTeamMember(m, t));
  }, [rawTeamMembers, fallbackMembers, t]);

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
    if (!openMemberId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMemberId(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openMemberId]);

  useEffect(() => {
    let cancelled = false;

    const loadTeamFromApi = () => {
      void getMarketplaceCorpCompanyTeam()
        .then((res) => {
          const incoming = (Array.isArray(res.members) ? res.members : []).filter((m) => m.enabled !== false);
          if (cancelled) return;
          if (incoming.length === 0) return;
          setRawTeamMembers(
            incoming.map((m) => ({
              id: m.id,
              imageUrl: m.imageUrl,
              linkedin: m.linkedin,
              role: m.role,
              name: m.name,
              bio: Array.isArray(m.bio) ? m.bio : [],
              enabled: m.enabled,
            }))
          );
        })
        .catch(() => {
          /* mantener fallback i18n */
        });
    };

    loadTeamFromApi();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadTeamFromApi();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const openMemberData = openMemberId ? teamMembers.find((m) => m.id === openMemberId) ?? null : null;

  return (
    <div className="marketplace-asic-page market-corp-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-company">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--corp page-main--market--company">
          <div className="market-corp-inner market-corp-inner--flush-top market-corp-company">
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
                      src={wpUpload("HRS-ASICS-HOT.png")}
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
                    {teamMembers.map((m) => (
                      <article key={m.id} className="market-corp-team-card" data-member={m.id}>
                        <button
                          type="button"
                          className="market-corp-team-card__btn"
                          onClick={() => setOpenMemberId(m.id)}
                          aria-haspopup="dialog"
                          aria-expanded={openMemberId === m.id}
                          aria-controls={openMemberId === m.id ? dialogTitleId : undefined}
                        >
                          <span className="market-corp-team-card__media">
                            <img src={m.imageUrl} alt="" width={500} height={500} loading="lazy" decoding="async" />
                          </span>
                          <span className="market-corp-team-card__meta">
                            <span className="market-corp-team-card__role">{m.role}</span>
                            <span className="market-corp-team-card__name">{m.name}</span>
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

      {openMemberId && openMemberData ? (
        <div
          className="market-corp-team-modal"
          role="presentation"
          onClick={() => setOpenMemberId(null)}
          onKeyDown={(e) => e.key === "Escape" && setOpenMemberId(null)}
        >
          <div
            id={dialogTitleId}
            className="market-corp-team-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-modal-name"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="market-corp-team-modal__close" onClick={() => setOpenMemberId(null)}>
              {t("company.team.dlg_close")}
            </button>
            <div className="market-corp-team-modal__head">
              <img
                className="market-corp-team-modal__photo"
                data-member={openMemberId}
                src={openMemberData.imageUrl}
                alt=""
                width={160}
                height={160}
              />
              <div>
                <p className="market-corp-team-modal__role">{openMemberData.role}</p>
                <h3 id="team-modal-name" className="market-corp-team-modal__name">
                  {openMemberData.name}
                </h3>
              </div>
            </div>
            <div className="market-corp-team-modal__bio">
              {(openMemberData.bio ?? []).map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
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
