import { useCallback, useEffect, useId, useMemo, useState, memo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { MarketplaceCorpFaqSpotlight } from "../components/marketplace/MarketplaceCorpFaqSpotlight";
import { MarketplaceCorpContactCard } from "../components/marketplace/MarketplaceCorpContactCard";
import { AsicShelfProduct } from "../components/marketplace/AsicShelfProduct.js";
import { useMarketplaceQuoteCart } from "../contexts/MarketplaceQuoteCartContext.js";
import {
  ASIC_MARKETPLACE_PRODUCTS,
  CORP_HOME_GRID_PRODUCT_IDS,
  normalizeAsicCatalogProducts,
} from "../lib/marketplaceAsicCatalog.js";
import type { AsicProduct } from "../lib/marketplaceAsicCatalog.js";
import {
  getMarketplaceCorpHomeSections,
  getMarketplaceCorpIndustryManufacturers,
  getMarketplaceCorpOfficialPartners,
  peekMarketplaceCorpHomeCache,
  wakeUpBackend,
  type CorpIndustryManufacturerDto,
  type CorpOfficialPartnerDto,
} from "../lib/api.js";
import { resolveCorpManufacturerImageSrc } from "../lib/marketplaceCorpManufacturers.js";
import { resolveCorpPartnerImageSrc } from "../lib/marketplaceCorpPartners.js";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { isCorpHomePath, MARKETPLACE } from "../lib/marketplacePaths.js";
import { CORP_INSTITUTIONAL_VIDEO_URL, wpUpload } from "../lib/marketplaceWpAssets.js";
import { useAuth } from "../contexts/AuthContext";
import "../styles/marketplace-hashrate.css";

/** Fondo sección “Nuestros datacenters” / Itaipú (antes en WordPress). */
const CORP_ITAIPU_BG = wpUpload("itaipu-py.webp");

const MemoAsicShelfProduct = memo(AsicShelfProduct, (prev, next) => {
  return (
    prev.product === next.product &&
    prev.productIndex === next.productIndex &&
    prev.filteredHidden === next.filteredHidden &&
    prev.showPrice === next.showPrice &&
    prev.addToQuoteLabel === next.addToQuoteLabel &&
    prev.onAddToQuote === next.onAddToQuote &&
    prev.onOpenModal === next.onOpenModal
  );
});
MemoAsicShelfProduct.displayName = "AsicShelfProduct";

const DOC_TITLE = "Hashrate – Space";
const VIDEO_URL = CORP_INSTITUTIONAL_VIDEO_URL;
/** Promo Z15 — reemplazá `public/images/bitmain-z15-pro.png` por el render oficial si querés otro asset */
const CORP_Z15_PROMO_IMG = `${import.meta.env.BASE_URL}images/bitmain-z15-pro.png`;
const CORP_ZCASH_LOGO_IMG = `${import.meta.env.BASE_URL}images/zcash-logo.png`;
/** Fondo faja “Servicio todo incluido” (mineros / hosting) */
const CORP_HOSTING_BAND_IMG = `${import.meta.env.BASE_URL}images/hosting-mining-farm-04.png`;

const CORP_FAQ_ROWS = [
  /** Intro comercial (tomadas del FAQ completo /marketplace/faq) */
  { q: "corp.faq.wp.3.q" as const, a: "corp.faq.wp.3.a" as const },
  { q: "corp.faq.wp.6.q" as const, a: "corp.faq.wp.6.a" as const },
  { q: "corp.faq.wp.4.q" as const, a: "corp.faq.wp.4.a" as const },
  { q: "corp.faq.wp.8.q" as const, a: "corp.faq.wp.8.a" as const },
];

const CORP_ANCHOR_IDS = ["servicios", "faq", "contacto"] as const;

const STAT_ICONS = {
  security: wpUpload("Security-150x150.png"),
  dc: wpUpload("Data_Center-150x150.png"),
  watt: wpUpload("Watt-150x150.png"),
  miner: wpUpload("HRS-asic-1-e1745411075254.png"),
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

/**
 * Clon funcional en React de la home pública (estructura tipo hashrate.space),
 * sin WordPress: mismas secciones, imágenes CDN y navegación interna.
 */
export function MarketplaceCorporateHomePage() {
  const { t } = useMarketplaceLang();
  const { user, loading } = useAuth();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const { addProduct, openDrawer } = useMarketplaceQuoteCart();
  const cachedHome = peekMarketplaceCorpHomeCache();
  const [hidePricesForGuests, setHidePricesForGuests] = useState(
    () => cachedHome?.hidePricesForGuests !== false
  );
  const canViewMarketplacePrices = Boolean(!loading && (user || !hidePricesForGuests));

  const localHomeProductsPool = useMemo(
    () => ASIC_MARKETPLACE_PRODUCTS.filter((p) => Boolean(p.imageSrc)).slice(0, 12),
    []
  );
  const corpBestSellingFallback = useMemo(() => localHomeProductsPool.slice(0, 4), [localHomeProductsPool]);
  const interestingFallback = useMemo(() => {
    const rest = localHomeProductsPool.slice(4, 8);
    return rest.length > 0 ? rest : localHomeProductsPool.slice(0, 4);
  }, [localHomeProductsPool]);

  /** Render inmediato: caché de sesión y luego refresco con API (un solo request). */
  const [corpBestSellingProducts, setCorpBestSellingProducts] = useState<AsicProduct[]>(() =>
    cachedHome?.bestSelling?.length
      ? normalizeAsicCatalogProducts(cachedHome.bestSelling)
      : corpBestSellingFallback
  );

  /** Segunda fila (debajo de “Servicio todo incluido”): extras de catálogo + `/marketplace?asic=`. */
  const corpMarketplaceAfterHostingProducts = useMemo(
    () => {
      const byIds = CORP_HOME_GRID_PRODUCT_IDS.map((id) => ASIC_MARKETPLACE_PRODUCTS.find((p) => p.id === id)).filter(
        (p): p is AsicProduct => Boolean(p)
      );
      if (byIds.length > 0) return byIds;
      return localHomeProductsPool.slice(8, 12);
    },
    [localHomeProductsPool]
  );

  /** Equipos elegidos en el panel ASIC (hasta 4); vacío si no hay selección o la API falla. */
  const [interestingVitrina, setInterestingVitrina] = useState<AsicProduct[]>(() =>
    cachedHome?.interesting?.length
      ? normalizeAsicCatalogProducts(cachedHome.interesting)
      : interestingFallback
  );

  const addToQuoteLabel = t("catalog.add_short");

  const goEquipmentAsic = useCallback(
    (productId: string) => {
      void navigate(`${MARKETPLACE.catalog}?asic=${encodeURIComponent(productId)}`);
    },
    [navigate]
  );

  const handleAddToQuote = useCallback(
    (p: AsicProduct) => {
      if (loading) return;
      if (!user) {
        void navigate(`${MARKETPLACE.catalog}?login=1`);
        return;
      }
      addProduct(p, 1);
      openDrawer();
    },
    [addProduct, openDrawer, user, loading, navigate]
  );

  const goCorpHash = useCallback((id: (typeof CORP_ANCHOR_IDS)[number]) => {
    navigate({ pathname, hash: `#${id}` });
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [navigate, pathname]);
  const videoTitleId = useId();
  const [videoOpen, setVideoOpen] = useState(false);
  const [officialPartners, setOfficialPartners] = useState<CorpOfficialPartnerDto[]>([]);
  const [industryManufacturers, setIndustryManufacturers] = useState<CorpIndustryManufacturerDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    void wakeUpBackend();
    void getMarketplaceCorpHomeSections()
      .then((res) => {
        if (cancelled) return;
        setHidePricesForGuests(res.hidePricesForGuests !== false);
        if (res.bestSelling.length > 0) {
          setCorpBestSellingProducts(normalizeAsicCatalogProducts(res.bestSelling));
        }
        if (res.interesting.length > 0) {
          setInterestingVitrina(normalizeAsicCatalogProducts(res.interesting));
        }
      })
      .catch(() => {
        /* mantener caché / fallback */
      });
    void getMarketplaceCorpOfficialPartners()
      .then((res) => {
        if (!cancelled && Array.isArray(res.partners)) setOfficialPartners(res.partners);
      })
      .catch(() => {});
    void getMarketplaceCorpIndustryManufacturers()
      .then((res) => {
        if (!cancelled && Array.isArray(res.manufacturers)) setIndustryManufacturers(res.manufacturers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!isCorpHomePath(pathname)) return;
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
                      <Link to="/equipment" className="market-corp-btn market-corp-btn--ghost">
                        {t("corp.hero.cta_shop")}
                      </Link>
                      <Link to={MARKETPLACE.contact} className="market-corp-btn market-corp-btn--see-through">
                        {t("corp.hero.cta_contact")}
                      </Link>
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
                <Link to="/equipment" className="market-corp-spotlight__cta">
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

          {corpBestSellingProducts.length > 0 ? (
            <div className="market-corp-inner market-corp-inner--flush-top">
              <h2 className="market-corp-products-title">{t("corp.best_selling.title")}</h2>
              <div
                className="shelf-grid market-shelf-grid--catalog-v2 market-corp-home-catalog-grid"
                aria-label={t("corp.market_shortcuts_aria")}
              >
                {corpBestSellingProducts.map((p, idx) => (
                  <MemoAsicShelfProduct
                    key={p.id}
                    product={p}
                    productIndex={idx}
                    filteredHidden={false}
                    showPrice={canViewMarketplacePrices}
                    onOpenModal={() => goEquipmentAsic(p.id)}
                    onAddToQuote={handleAddToQuote}
                    addToQuoteLabel={addToQuoteLabel}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="market-corp-hosting-split-band">
              <div
                className="market-corp-hosting-split-band__bg"
                style={{ backgroundImage: `url(${CORP_HOSTING_BAND_IMG})` }}
                aria-hidden
              />
              <div className="market-corp-hosting-split-band__overlay" aria-hidden />
              <div className="market-corp-hosting-split-band__inner">
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
                </section>
              </div>
            </div>

            {interestingVitrina.length > 0 ? (
            <section
              className="market-corp-interesting-slot"
              aria-labelledby="corp-interesting-products-title"
            >
              <div className="market-corp-interesting-slot__inner">
                <h2 id="corp-interesting-products-title" className="market-corp-interesting-slot__title">
                  {t("corp.interesting_products.title")}
                </h2>
                <div
                  className="shelf-grid market-shelf-grid--catalog-v2 market-corp-home-catalog-grid market-corp-interesting-slot__shortcuts"
                  aria-label={t("corp.interesting_products.grid_aria")}
                >
                  {interestingVitrina.map((p, idx) => (
                    <MemoAsicShelfProduct
                      key={p.id}
                      product={p}
                      productIndex={idx}
                      filteredHidden={false}
                      showPrice={canViewMarketplacePrices}
                      onOpenModal={() => goEquipmentAsic(p.id)}
                      onAddToQuote={handleAddToQuote}
                      addToQuoteLabel={addToQuoteLabel}
                    />
                  ))}
                </div>
              </div>
            </section>
            ) : null}

            {corpMarketplaceAfterHostingProducts.length > 0 ? (
              <div className="market-corp-inner">
              <section className="market-corp-home-row2" aria-labelledby="corp-home-row2-title">
                <h2 id="corp-home-row2-title" className="market-corp-products-title market-corp-products-title--row2">
                  {t("corp.home_row2.title")}
                </h2>
                <div
                  className="shelf-grid market-shelf-grid--catalog-v2 market-corp-home-catalog-grid"
                  aria-label={t("corp.home_row2.grid_aria")}
                >
                  {corpMarketplaceAfterHostingProducts.map((p, idx) => (
                    <MemoAsicShelfProduct
                      key={p.id}
                      product={p}
                      productIndex={idx}
                      filteredHidden={false}
                      showPrice={canViewMarketplacePrices}
                      onOpenModal={() => goEquipmentAsic(p.id)}
                      onAddToQuote={handleAddToQuote}
                      addToQuoteLabel={addToQuoteLabel}
                    />
                  ))}
                </div>
              </section>
              </div>
            ) : null}

            <section className="market-corp-itaipu" aria-labelledby="corp-itaipu-title">
              <div
                className="market-corp-itaipu__bg"
                style={{ backgroundImage: `url(${CORP_ITAIPU_BG})` }}
                aria-hidden
              />
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

            <div className="market-corp-inner">
            {industryManufacturers.length > 0 ? (
              <section className="market-corp-luxor market-corp-logo-strip--bw corp-logo-home-style" aria-labelledby="corp-brands-title">
                <h2 id="corp-brands-title" className="market-corp-brands-block__title market-corp-luxor__heading">
                  {t("corp.brands.title")}
                </h2>
                <div className="market-corp-luxor__row" role="list">
                  {industryManufacturers.map((m) => {
                    const src = resolveCorpManufacturerImageSrc(m.imageUrl);
                    if (!src) return null;
                    const slug = (m.slug || m.id).trim() || "marca";
                    const alt = m.name.trim() || "Fabricante";
                    const href = m.href.trim();
                    const img = (
                      <span className="corp-logo-home-style__frame">
                        <img
                          className="corp-logo-home-style__img market-corp-luxor__img"
                          src={src}
                          alt={alt}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      </span>
                    );
                    const linkClass = `market-corp-luxor__link market-corp-luxor__link--${slug.replace(/[^a-z0-9_-]+/gi, "-")}`;
                    if (href) {
                      return (
                        <a
                          key={m.id}
                          className={linkClass}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          role="listitem"
                          aria-label={alt}
                        >
                          {img}
                        </a>
                      );
                    }
                    return (
                      <span key={m.id} className={linkClass} role="listitem" aria-label={alt}>
                        {img}
                      </span>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section id="faq" className="market-corp-section market-corp-anchor" aria-labelledby="corp-faq-title">
              <MarketplaceCorpFaqSpotlight
                headingId="corp-faq-title"
                rows={CORP_FAQ_ROWS}
                defaultOpenIndex={null}
                variant="aurora"
                onContactClick={() => goCorpHash("contacto")}
              />
              <div className="market-corp-faq-home-more">
                <Link to={MARKETPLACE.faq} className="market-corp-faq-home-more__link">
                  {t("corp.faq.view_all")}
                </Link>
              </div>
            </section>
            </div>

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

            <div className="market-corp-inner">
            <MarketplaceCorpContactCard titleId="corp-contact-title" anchorId="contacto" />

            {officialPartners.length > 0 ? (
              <section className="market-corp-luxor market-corp-logo-strip--bw corp-logo-home-style" aria-labelledby="corp-luxor-title">
                <h2 id="corp-luxor-title" className="market-corp-brands-block__title market-corp-luxor__heading">
                  {t("corp.partners.title")}
                </h2>
                <div className="market-corp-luxor__row">
                  {officialPartners.map((p) => {
                    const src = resolveCorpPartnerImageSrc(p.imageUrl);
                    if (!src) return null;
                    const href = p.href.trim();
                    const aria = p.name.trim() || "Partner";
                    const img = (
                      <span className="corp-logo-home-style__frame">
                        <img
                          className="corp-logo-home-style__img market-corp-luxor__img"
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      </span>
                    );
                    const partnerLinkClass = `market-corp-luxor__link market-corp-luxor__link--${p.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
                    return href ? (
                      <a
                        key={p.id}
                        className={partnerLinkClass}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={aria}
                      >
                        {img}
                      </a>
                    ) : (
                      <span key={p.id} className={partnerLinkClass} aria-label={aria}>
                        {img}
                      </span>
                    );
                  })}
                </div>
              </section>
            ) : null}
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
