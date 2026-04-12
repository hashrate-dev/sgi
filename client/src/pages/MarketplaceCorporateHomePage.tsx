import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { AsicDetailSvg } from "../components/marketplace/AsicDetailIcon.js";
import { ASIC_MARKETPLACE_PRODUCTS, formatAsicPriceUsd } from "../lib/marketplaceAsicCatalog.js";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";

const DOC_TITLE = "Hashrate – Space";
const UP = "https://hashrate.space/wp-content/uploads";
const VIDEO_URL = "https://hashrate.space/video/Hashrate-Farm-Py.mp4";
const FAQ_SPOTLIGHT_IMG = `${import.meta.env.BASE_URL}images/Antminer_S21_Range.png`;
/** Promo Z15 — reemplazá `public/images/bitmain-z15-pro.png` por el render oficial si querés otro asset */
const CORP_Z15_PROMO_IMG = `${import.meta.env.BASE_URL}images/bitmain-z15-pro.png`;
const CORP_ZCASH_LOGO_IMG = `${import.meta.env.BASE_URL}images/zcash-logo.png`;

const CORP_FAQ_ROWS = [
  { q: "corp.faq.q1" as const, a: "corp.faq.a1" as const },
  { q: "corp.faq.q2" as const, a: "corp.faq.a2" as const },
  { q: "corp.faq.q3" as const, a: "corp.faq.a3" as const },
  { q: "corp.faq.q4" as const, a: "corp.faq.a4" as const },
];

const CORP_ANCHOR_IDS = ["servicios", "faq", "empresa", "contacto"] as const;

const STAT_ICONS = {
  security: `${UP}/Security-150x150.png`,
  dc: `${UP}/Data_Center-150x150.png`,
  watt: `${UP}/Watt-150x150.png`,
  miner: `${UP}/HRS-asic-1-e1745411075254.png`,
} as const;

/** Tarjeta 1: minero ASIC — `public/images/corp-how-miner-card1.png` (asset usuario, fondo verde degradé). */
const CORP_HOW_MINER_PRODUCT_IMG = `${import.meta.env.BASE_URL}images/corp-how-miner-card1.png`;

/** Panel gráfico — `corp-how-chart-panel.png` (recorte CSS oculta el título del PNG). Va en tarjeta 2 (orden visual). */
const CORP_HOW_CHART_PANEL_IMG = `${import.meta.env.BASE_URL}images/corp-how-chart-panel.png`;

/** Mano con celular — `corp-how-mobile-hand.png`. Va en tarjeta 3 (orden visual). */
const CORP_HOW_MOBILE_HAND_IMG = `${import.meta.env.BASE_URL}images/corp-how-mobile-hand.png`;

const CORP_HOW_CARD_IMAGES = [
  CORP_HOW_MINER_PRODUCT_IMG,
  CORP_HOW_CHART_PANEL_IMG,
  CORP_HOW_MOBILE_HAND_IMG,
] as const;

const CORP_HOW_STEPS = [
  { titleKey: "corp.how.step1_title" as const, bodyKey: "corp.how.step1_body" as const, imgAltKey: "corp.how.step1_img_alt" as const },
  { titleKey: "corp.how.step3_title" as const, bodyKey: "corp.how.step3_body" as const, imgAltKey: "corp.how.step3_img_alt" as const },
  { titleKey: "corp.how.step2_title" as const, bodyKey: "corp.how.step2_body" as const, imgAltKey: "corp.how.step2_img_alt" as const },
] as const;

/** Accesos directos al catálogo `/marketplace?asic=<id>` (mismas fichas que el marketplace). */
const CORP_MARKETPLACE_SHORTCUT_IDS = [
  "fallback-s21-pro-235",
  "fallback-s21-xp-270",
  "fallback-l9-16g",
  "fallback-l9-17g",
] as const;

const ROW2 = [
  { src: `${UP}/S21-335.png`, alt: "Antminer S21 Hydro" },
  { src: `${UP}/S21-473.png`, alt: "Antminer S21 XP Hydro" },
  { src: `${UP}/ANTRACK.png`, alt: "Antrack" },
  { src: `${UP}/ANTSPACE-HK3.png`, alt: "Antspace HK3" },
] as const;

const BRAND_LOGOS = [
  { src: `${UP}/bitmain.png`, alt: "Bitmain", w: 512, h: 180, slug: "bitmain" as const },
  { src: `${UP}/canaan-logo.png`, alt: "Canaan", w: 616, h: 188, slug: "canaan" as const },
  { src: `${UP}/microbt-logo.png`, alt: "MicroBT", w: 400, h: 126, slug: "microbt" as const },
  { src: `${UP}/logo-inosili.png`, alt: "Innosilicon", w: 400, h: 50, slug: "innosilicon" as const },
  { src: `${UP}/iceriver-logo.webp`, alt: "IceRiver", w: 290, h: 31, slug: "iceriver" as const },
  { src: `${UP}/elphapex-logo.png`, alt: "Elphapex", w: 712, h: 148, slug: "elphapex" as const },
] as const;

/**
 * Clon funcional en React de la home pública (estructura tipo hashrate.space),
 * sin WordPress: mismas secciones, imágenes CDN y navegación interna.
 */
export function MarketplaceCorporateHomePage() {
  const { t, lang } = useMarketplaceLang();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();

  const goCorpHash = useCallback((id: (typeof CORP_ANCHOR_IDS)[number]) => {
    navigate({ pathname, hash: `#${id}` });
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [navigate, pathname]);
  const videoTitleId = useId();
  const faqAccordionId = useId();
  const [videoOpen, setVideoOpen] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [form, setForm] = useState({
    name: "",
    last: "",
    email: "",
    subject: "",
    phone: "",
    message: "",
  });

  useEffect(() => {
    const prevTitle = document.title;
    document.title = DOC_TITLE;
    let meta = document.querySelector('meta[name="description"]');
    const prevContent = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "Hashrate Space — high-performance Bitcoin mining infrastructure, datacenters and ASIC marketplace."
    );

    let linkGoogle = document.querySelector('link[href*="fonts.googleapis.com"]');
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
  }, []);

  useEffect(() => {
    if (pathname !== "/marketplace/home" && pathname !== "/marketplace/home/") return;
    const id = hash?.replace(/^#/, "") ?? "";
    if (!id || !(CORP_ANCHOR_IDS as readonly string[]).includes(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    const tid = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(tid);
  }, [pathname, hash]);

  useEffect(() => {
    if (!videoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVideoOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [videoOpen]);

  const statItems = [
    { label: t("corp.stat.security"), value: t("corp.stat.security_val"), icon: STAT_ICONS.security },
    { label: t("corp.stat.dc"), value: t("corp.stat.dc_val"), icon: STAT_ICONS.dc },
    { label: t("corp.stat.mw"), value: t("corp.stat.mw_val"), icon: STAT_ICONS.watt },
    { label: t("corp.stat.miners"), value: t("corp.stat.miners_val"), icon: STAT_ICONS.miner },
  ] as const;

  const metricItems = [
    { label: t("corp.metrics.years"), value: t("corp.metrics.years_val") },
    { label: t("corp.metrics.build"), value: t("corp.metrics.build_val") },
    { label: t("corp.metrics.tech"), value: t("corp.metrics.tech_val") },
  ] as const;

  const submitForm = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const body = [
        `${t("corp.form.name")}: ${form.name}`,
        `${t("corp.form.last_name")}: ${form.last}`,
        `${t("corp.form.email")}: ${form.email}`,
        `${t("corp.form.phone")}: ${form.phone}`,
        "",
        form.message,
      ].join("\n");
      const sales = "sales@hashrate.space";
      const q = new URLSearchParams({
        subject: form.subject || "Marketplace contact",
        body,
      });
      window.location.href = `mailto:${sales}?${q.toString()}`;
    },
    [form, t]
  );

  return (
    <div className="marketplace-asic-page market-corp-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-corporate">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--corp">
          {/* Hero full-bleed (WP: parallax + gradient) */}
          <section className="market-corp-hero-full" aria-labelledby="corp-hero-title">
            <div className="market-corp-hero-full__banner">
              <div className="market-corp-hero-full__bg" aria-hidden />
              <div className="market-corp-hero-full__overlay" aria-hidden />
              <div className="market-corp-hero-full__inner">
                <div className="market-corp-hero-full__grid">
                  <div className="market-corp-hero-full__copy">
                    <h1 id="corp-hero-title" className="market-corp-hero-full__title">
                      {t("corp.hero.title")}
                    </h1>
                    <div className="market-corp-hero__actions">
                      <Link to="/marketplace" className="market-corp-btn market-corp-btn--ghost">
                        {t("corp.hero.cta_shop")}
                      </Link>
                      <a href="#contacto" className="market-corp-btn market-corp-btn--see-through">
                        {t("corp.hero.cta_contact")}
                      </a>
                    </div>
                  </div>
                  <div className="market-corp-hero-full__video">
                    <button
                      type="button"
                      className="market-corp-play"
                      onClick={() => setVideoOpen(true)}
                      aria-haspopup="dialog"
                      aria-expanded={videoOpen}
                      aria-controls={videoTitleId}
                      aria-label={t("corp.play_video")}
                    >
                      <svg className="market-corp-play__svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden>
                        <path
                          fill="currentColor"
                          fillRule="evenodd"
                          d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              {/* Mitad sobre el banner, mitad sobre el bloque blanco: borde en el centro vertical */}
              <div className="market-corp-hero-full__stats-bridge">
                <ul className="market-corp-stats market-corp-stats--wp" aria-label={t("corp.stat.security")}>
                  {statItems.map((s) => (
                    <li key={s.label} className="market-corp-stats__item market-corp-stats__item--wp">
                      <span className="market-corp-stats__label market-corp-stats__label--top">{s.label}</span>
                      <img className="market-corp-stats__icon" src={s.icon} alt="" width={120} height={120} loading="lazy" />
                      <span className="market-corp-stats__value">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <div className="market-corp-inner market-corp-inner--flush-top">
            <section className="market-corp-spotlight" aria-labelledby="corp-spotlight-z15-title">
              <div className="market-corp-spotlight__card">
                <div className="market-corp-spotlight__text">
                  <div className="market-corp-spotlight__tags">
                    <span className="market-corp-spotlight__tag">{t("corp.spotlight.tag1")}</span>
                  </div>
                  <h2 id="corp-spotlight-z15-title" className="market-corp-spotlight__h2">
                    {t("corp.spotlight.title")}
                  </h2>
                  <ul className="market-corp-spotlight__specs" aria-label={t("corp.spotlight.specs_aria")}>
                    <li className="market-corp-spotlight__spec">
                      <span className="market-corp-spotlight__spec-value">{t("corp.spotlight.spec_v1")}</span>
                      <span className="market-corp-spotlight__spec-label">{t("corp.spotlight.spec_l1")}</span>
                    </li>
                    <li className="market-corp-spotlight__spec">
                      <span className="market-corp-spotlight__spec-value">{t("corp.spotlight.spec_v2")}</span>
                      <span className="market-corp-spotlight__spec-label">{t("corp.spotlight.spec_l2")}</span>
                    </li>
                    <li className="market-corp-spotlight__spec">
                      <span className="market-corp-spotlight__spec-value">{t("corp.spotlight.spec_v3")}</span>
                      <span className="market-corp-spotlight__spec-label">{t("corp.spotlight.spec_l3")}</span>
                    </li>
                  </ul>
                  <p className="market-corp-spotlight__body">{t("corp.spotlight.body")}</p>
                  <Link to="/marketplace" className="market-corp-spotlight__cta">
                    {t("corp.spotlight.cta")}
                  </Link>
                </div>
                <div className="market-corp-spotlight__visual">
                  <div className="market-corp-spotlight__visual-grad" aria-hidden />
                  <div className="market-corp-spotlight__visual-noise" aria-hidden />
                  <img
                    className="market-corp-spotlight__img"
                    src={CORP_Z15_PROMO_IMG}
                    alt={t("corp.spotlight.img_alt")}
                    width={800}
                    height={800}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="market-corp-spotlight__glass">
                    <img
                      className="market-corp-spotlight__glass-logo"
                      src={CORP_ZCASH_LOGO_IMG}
                      alt={t("corp.spotlight.zcash_logo_alt")}
                      width={56}
                      height={56}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>
            </section>

            <h2 className="market-corp-products-title">{t("corp.best_selling.title")}</h2>
            <div className="market-corp-mp-shortcuts" aria-label={t("corp.market_shortcuts_aria")}>
              {CORP_MARKETPLACE_SHORTCUT_IDS.map((id) => {
                const p = ASIC_MARKETPLACE_PRODUCTS.find((x) => x.id === id);
                if (!p) return null;
                const to = `/marketplace?asic=${encodeURIComponent(id)}`;
                const aria = `${p.brand} ${p.model} ${p.hashrate} — ${t("corp.mp_card_link_aria")}`;
                const goAsic = () => {
                  void navigate(to);
                };
                return (
                  <article key={id} className="shelf-product">
                    <div className="shelf-product__media">
                      <div className="shelf-product__media-gradient">
                        <Link to={to} className="shelf-product__imglink" aria-label={aria}>
                          {p.imageSrc ? (
                            <img
                              src={p.imageSrc}
                              alt=""
                              width={400}
                              height={400}
                              loading="lazy"
                              decoding="async"
                              className="shelf-product__photo"
                            />
                          ) : (
                            <div className="shelf-product__photo shelf-product__photo--fallback" aria-hidden />
                          )}
                        </Link>
                      </div>
                    </div>
                    <div className="shelf-product__body">
                      <div className="shelf-product__identity">
                        <p className="shelf-product__brand">{p.brand}</p>
                        <h3 className="shelf-product__title">{p.model}</h3>
                        <p className="shelf-product__hashrate">{p.hashrate}</p>
                      </div>
                      <div className="shelf-product__price-box">
                        <span className="shelf-product__price-value">{formatAsicPriceUsd(p.priceUsd, lang)}</span>
                      </div>
                      <div className="shelf-product__specs-box" role="group" aria-label={t("shelf.techspecs")}>
                        <ul className="shelf-detail-strip">
                          {p.detailRows.map((row, i) => (
                            <li key={i} className="shelf-detail-strip__row">
                              <AsicDetailSvg kind={row.icon} />
                              <span className="shelf-detail-strip__txt">{row.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="shelf-product__cta-row">
                        <button type="button" className="shelf-product__cta" onClick={goAsic}>
                          {t("shelf.seemore")}
                        </button>
                        <button type="button" className="shelf-product__quote-btn" onClick={goAsic} title={t("shelf.add_title")}>
                          {t("catalog.add_short")}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <section id="servicios" className="market-corp-hosting-split market-corp-anchor" aria-labelledby="corp-hosting-h1">
              <div className="market-corp-hosting-split__text">
                <h2 id="corp-hosting-h1" className="market-corp-gradient-title">
                  {t("corp.hosting.title")}
                </h2>
                <p className="market-corp-hosting-split__body">{t("corp.hosting.body")}</p>
                <ul className="market-corp-metrics market-corp-metrics--wp">
                  {metricItems.map((m) => (
                    <li key={m.label} className="market-corp-metrics__item market-corp-metrics__item--wp">
                      <span className="market-corp-metrics__value market-corp-metrics__value--grad">{m.value}</span>
                      <span className="market-corp-metrics__label">{m.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="market-corp-hosting-split__visual" aria-hidden>
                <div className="market-corp-hosting-split__visual-bg" />
              </div>
            </section>

            <div className="market-corp-product-grid market-corp-product-grid--tight">
              {ROW2.map((p) => (
                <Link key={p.src} to="/marketplace" className="market-corp-product-card">
                  <img src={p.src} alt={p.alt} width={400} height={400} loading="lazy" decoding="async" />
                </Link>
              ))}
            </div>

            <section className="market-corp-itaipu" aria-labelledby="corp-itaipu-title">
              <div className="market-corp-itaipu__bg" aria-hidden />
              <div className="market-corp-itaipu__overlay" aria-hidden />
              <div className="market-corp-itaipu__content">
                <h2 id="corp-itaipu-title" className="market-corp-itaipu__title">
                  {t("corp.green.title")}
                  <br />
                  <span className="market-corp-itaipu__accent">{t("corp.green.sub")}</span>
                </h2>
                <h3 className="market-corp-itaipu__sub">{t("corp.green.body")}</h3>
                <button type="button" className="market-corp-btn market-corp-btn--jumbo" onClick={() => goCorpHash("contacto")}>
                  {t("corp.hero.cta_contact")}
                </button>
              </div>
            </section>

            <section className="market-corp-brands-block" aria-labelledby="corp-brands-title">
              <h2 id="corp-brands-title" className="market-corp-brands-block__title">
                {t("corp.brands.title")}
              </h2>
              <div className="market-corp-clients market-corp-clients--six-cols fade-in-animation" role="list">
                {BRAND_LOGOS.map((b) => (
                  <div
                    key={b.src}
                    className={`market-corp-clients__item market-corp-clients__item--${b.slug}`}
                    role="listitem"
                  >
                    <img src={b.src} alt={b.alt} width={b.w} height={b.h} loading="lazy" decoding="async" draggable={false} />
                  </div>
                ))}
              </div>
            </section>

            <section id="faq" className="market-corp-section market-corp-anchor" aria-labelledby="corp-faq-title">
              <div className="market-corp-faq-spotlight">
                <div className="market-corp-faq-spotlight__gradient" aria-hidden />
                <div className="market-corp-faq-spotlight__shine" aria-hidden />
                <div className="market-corp-faq-spotlight__inner">
                  <div className="market-corp-faq-spotlight__grid">
                    <div className="market-corp-faq-spotlight__lead">
                      <p className="market-corp-faq-spotlight__kicker">{t("corp.faq.spot.kicker")}</p>
                      <h2 id="corp-faq-title" className="market-corp-faq-spotlight__h2">
                        {t("corp.faq.title")}
                      </h2>
                      <p className="market-corp-faq-spotlight__lede">{t("corp.faq.spot.specs")}</p>
                      <div className="market-corp-faq-spotlight__lead-actions">
                        <Link to="/marketplace" className="market-corp-faq-spotlight__btn market-corp-faq-spotlight__btn--primary">
                          {t("corp.faq.shop_cta")}
                        </Link>
                        <button
                          type="button"
                          className="market-corp-faq-spotlight__btn market-corp-faq-spotlight__btn--ghost"
                          onClick={() => goCorpHash("contacto")}
                        >
                          {t("corp.faq.contact_cta")}
                        </button>
                      </div>
                    </div>
                    <div className="market-corp-faq-spotlight__visual">
                      <img
                        src={FAQ_SPOTLIGHT_IMG}
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
                        {CORP_FAQ_ROWS.map((row, i) => {
                          const panelId = `${faqAccordionId}-panel-${i}`;
                          const tabId = `${faqAccordionId}-tab-${i}`;
                          const isOpen = openFaqIdx === i;
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
                                <p className="market-corp-faq-spotlight__acc-a">{t(row.a)}</p>
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
            </section>

            <section className="market-corp-sales-cta" aria-labelledby="corp-how-title">
              <div className="market-corp-sales-cta__wrap">
                <div className="market-corp-sales-cta__shine" aria-hidden />
                <div className="market-corp-sales-cta__wrap-inner market-corp-sales-cta__wrap-inner--on-green">
                  <div className="market-corp-how-on-green">
                    <header className="market-corp-how-on-green__head">
                      <h2 id="corp-how-title" className="market-corp-how-on-green__title">
                        {t("corp.how.title")}
                      </h2>
                      <p className="market-corp-how-on-green__lede">{t("corp.how.lede")}</p>
                    </header>

                    <div className="market-corp-how-on-green__grid">
                      {CORP_HOW_STEPS.map((step, idx) => (
                        <article
                          key={step.titleKey}
                          className={`market-corp-how-card market-corp-how-card--compass${idx === 0 ? " market-corp-how-card--product-miner" : ""}${idx === 1 ? " market-corp-how-card--chart-crop" : ""}${idx === 2 ? " market-corp-how-card--mobile-hand" : ""}`}
                        >
                          <div className="market-corp-how-card__viz market-corp-how-card__viz--compass">
                            <img
                              src={CORP_HOW_CARD_IMAGES[idx]}
                              alt={t(step.imgAltKey)}
                              width={480}
                              height={300}
                              loading={idx === 0 ? "eager" : "lazy"}
                              decoding="async"
                              className="market-corp-how-card__photo"
                            />
                          </div>
                          <div className="market-corp-how-card__body market-corp-how-card__body--compass">
                            <h3 className="market-corp-how-card__h3">{t(step.titleKey)}</h3>
                            <p className="market-corp-how-card__p">{t(step.bodyKey)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="market-corp-sales-cta__foot market-corp-sales-cta__foot--on-green">
                    <p className="market-corp-sales-cta__foot-copy">{t("corp.sales_banner.body")}</p>
                  </div>
                </div>
              </div>
            </section>

            <section id="contacto" className="market-corp-contact-wp market-corp-anchor" aria-labelledby="corp-contact-title">
              <div className="market-corp-contact-wp__panel">
                <div className="market-corp-contact-wp__gradient" aria-hidden />
                <div className="market-corp-contact-wp__noise noise-overlay" aria-hidden />
                <div className="market-corp-contact-wp__inner">
                  <div className="market-corp-contact-wp__col">
                    <h2 id="corp-contact-title" className="market-corp-contact-wp__h2">
                      {t("corp.contact.title")}
                    </h2>
                    <div className="market-corp-contact-wp__blocks">
                      <p>
                        <strong>{t("corp.contact.support")}</strong>
                        <br />
                        <a className="market-corp-contact-wp__link" href={`mailto:${t("corp.contact.support_email")}`}>
                          {t("corp.contact.support_email")}
                        </a>
                      </p>
                      <p>
                        <strong>{t("corp.contact.investors")}</strong>
                        <br />
                        <a className="market-corp-contact-wp__link" href={`mailto:${t("corp.contact.investors_email")}`}>
                          {t("corp.contact.investors_email")}
                        </a>
                      </p>
                      <p>
                        <strong>{t("corp.contact.sales")}</strong>
                        <br />
                        <a className="market-corp-contact-wp__link" href={`mailto:${t("corp.contact.sales_email")}`}>
                          {t("corp.contact.sales_email")}
                        </a>
                      </p>
                      <p>
                        <strong>{t("corp.contact.headquarter")}</strong>
                        <br />
                        {t("corp.contact.addr1")}
                        <br />
                        <span className="market-corp-contact-wp__muted">{t("corp.contact.phones")}</span>
                        <br />
                        {t("corp.contact.addr2")}
                      </p>
                    </div>
                    <h3 className="market-corp-contact-wp__h3">{t("corp.contact.social")}</h3>
                    <div className="market-corp-social">
                      <a
                        className="market-corp-social__btn"
                        href="https://www.instagram.com/hashrate.space/"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Instagram"
                      >
                        <SocialInstagram />
                      </a>
                      <a
                        className="market-corp-social__btn"
                        href="https://www.linkedin.com/company/hashrate-space"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="LinkedIn"
                      >
                        <SocialLinkedIn />
                      </a>
                      <a
                        className="market-corp-social__btn"
                        href="https://x.com/Hashrate_Space"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="X"
                      >
                        <SocialX />
                      </a>
                    </div>
                  </div>
                  <div className="market-corp-contact-wp__col">
                    <form className="market-corp-form-wp" onSubmit={submitForm}>
                      <label className="market-corp-form-wp__field">
                        <span className="sr-only">{t("corp.form.name")}</span>
                        <input
                          name="name"
                          required
                          autoComplete="given-name"
                          placeholder={t("corp.form.name")}
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </label>
                      <label className="market-corp-form-wp__field">
                        <span className="sr-only">{t("corp.form.last_name")}</span>
                        <input
                          name="last"
                          required
                          autoComplete="family-name"
                          placeholder={t("corp.form.last_name")}
                          value={form.last}
                          onChange={(e) => setForm((f) => ({ ...f, last: e.target.value }))}
                        />
                      </label>
                      <label className="market-corp-form-wp__field">
                        <span className="sr-only">{t("corp.form.email")}</span>
                        <input
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          placeholder={t("corp.form.email")}
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        />
                      </label>
                      <label className="market-corp-form-wp__field">
                        <span className="sr-only">{t("corp.form.subject")}</span>
                        <input
                          name="subject"
                          required
                          placeholder={t("corp.form.subject")}
                          value={form.subject}
                          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                        />
                      </label>
                      <label className="market-corp-form-wp__field">
                        <span className="sr-only">{t("corp.form.phone")}</span>
                        <input
                          name="phone"
                          required
                          autoComplete="tel"
                          placeholder={t("corp.form.phone")}
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        />
                      </label>
                      <label className="market-corp-form-wp__field market-corp-form-wp__field--full">
                        <span className="sr-only">{t("corp.form.message")}</span>
                        <textarea
                          name="message"
                          rows={5}
                          maxLength={2000}
                          placeholder={t("corp.form.message")}
                          value={form.message}
                          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        />
                      </label>
                      <p className="market-corp-form-wp__hint">{t("corp.form.hint")}</p>
                      <button type="submit" className="market-corp-btn market-corp-btn--submit">
                        {t("corp.form.submit")}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </section>

            <section className="market-corp-luxor" aria-labelledby="corp-luxor-title">
              <h2 id="corp-luxor-title" className="market-corp-brands-block__title market-corp-luxor__heading">
                {t("corp.partners.title")}
              </h2>
              <div className="market-corp-luxor__row">
                <a
                  className="market-corp-luxor__link"
                  href="https://www.luxor.tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("corp.partners.luxor_aria")}
                >
                  <img
                    className="market-corp-luxor__img"
                    src={`${UP}/Luxor-logo.png`}
                    alt=""
                    width={855}
                    height={294}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </a>
              </div>
            </section>
          </div>

          {/* Un solo degradado (como bloque Contacto) para franja empresa + pie — sin línea entre ambos */}
          <div className="market-corp-end-band">
            <div className="market-corp-end-band__gradient" aria-hidden />
            <MarketplaceSiteFooter variant="corp-end-band" />
          </div>
        </main>
      </div>

      {videoOpen ? (
        <div
          className="market-corp-video-modal"
          role="presentation"
          onClick={() => setVideoOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setVideoOpen(false)}
        >
          <div
            id={videoTitleId}
            className="market-corp-video-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("corp.play_video")}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="market-corp-video-modal__close" onClick={() => setVideoOpen(false)}>
              {t("corp.play_video_close")}
            </button>
            <video className="market-corp-video-modal__video" controls playsInline src={VIDEO_URL} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SocialInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A3.5 3.5 0 1 1 8.5 11 3.5 3.5 0 0 1 12 7.5zm0 2A1.5 1.5 0 1 0 13.5 11 1.5 1.5 0 0 0 12 9.5zm5.25-3.75a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"
      />
    </svg>
  );
}

function SocialLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4V8zm7.5 0h3.8v2h.05c.53-1 1.84-2.31 3.8-2.31 4.06 0 4.8 2.67 4.8 6.14V23h-4v-7.7c0-1.84-.03-4.2-2.56-4.2-2.56 0-2.95 2-2.95 4.1V23h-4V8z"
      />
    </svg>
  );
}

function SocialX() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}
