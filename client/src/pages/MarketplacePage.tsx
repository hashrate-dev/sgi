import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ASIC_MARKETPLACE_PRODUCTS,
  asicProductShowsMinerEconomyContent,
} from "../lib/marketplaceAsicCatalog.js";
import type { AsicAlgo, AsicProduct } from "../lib/marketplaceAsicCatalog.js";
import type { AddQuoteLineOptions } from "../lib/marketplaceQuoteCart.js";
import { getMarketplaceAsicVitrina, postMarketplaceAsicYields, wakeUpBackend, type MarketplaceAsicLiveYield } from "../lib/api.js";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext";
import { MarketplaceQuoteCartProvider, useMarketplaceQuoteCart } from "../contexts/MarketplaceQuoteCartContext.js";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader.js";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter.js";
import { MarketplaceCatalogFilters } from "../components/marketplace/MarketplaceCatalogFilters.js";
import { AsicShelfProduct } from "../components/marketplace/AsicShelfProduct.js";
import { AsicProductModal } from "../components/marketplace/AsicProductModal.js";
import { MarketplaceQuoteCartDrawer } from "../components/marketplace/MarketplaceQuoteCartDrawer.js";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../lib/i18n.js";
import "../styles/marketplace-hashrate.css";

const DOC_TITLE = "Hashrate Space - Marketplace";
const DOC_DESC =
  "Equipos ASIC para minería de Bitcoin y Scrypt. Hashrate Space — Paraguay y Uruguay: infraestructura, energía y soporte.";

export function MarketplacePage() {
  return (
    <MarketplaceQuoteCartProvider>
      <MarketplacePageBody />
    </MarketplaceQuoteCartProvider>
  );
}

function MarketplacePageBody() {
  const { user, loading } = useAuth();
  const { lang, t } = useMarketplaceLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addProduct, openDrawer } = useMarketplaceQuoteCart();
  const [filterAlgo, setFilterAlgo] = useState<AsicAlgo | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  /** Catálogo estático en el primer frame; la API lo reemplaza cuando responde (percepción de carga más rápida). */
  const [products, setProducts] = useState<AsicProduct[]>(() => ASIC_MARKETPLACE_PRODUCTS);
  /** null = primer fetch en curso; true = vitrina API; false = fallback local tras vacío o error */
  const [catalogFromApi, setCatalogFromApi] = useState<boolean | null>(null);
  const [liveYieldsById, setLiveYieldsById] = useState<Record<string, MarketplaceAsicLiveYield>>({});
  const [yieldsLoading, setYieldsLoading] = useState(false);

  const handleAddToQuote = useCallback(
    (p: AsicProduct, opts?: AddQuoteLineOptions) => {
      if (loading) return;
      if (!user || !canUseMarketplaceQuoteCart(user.role)) {
        navigate("/marketplace/login", { replace: false, state: { from: "quote" } });
        return;
      }
      addProduct(p, 1, opts);
      openDrawer();
    },
    [addProduct, openDrawer, user, loading, navigate]
  );

  const addToQuoteLabel = t("catalog.add_short");
  const sortLoc = marketplaceLocale(lang);

  /** Tras login/registro desde flujo cotización: abrir drawer una vez. */
  useEffect(() => {
    const st = location.state as { openQuoteDrawer?: boolean } | null;
    if (!st?.openQuoteDrawer) return;
    if (loading) return;
    if (!user || !canUseMarketplaceQuoteCart(user.role)) {
      navigate("/marketplace", { replace: true, state: {} });
      return;
    }
    const t = window.setTimeout(() => {
      openDrawer();
      navigate("/marketplace", { replace: true, state: {} });
    }, 0);
    return () => window.clearTimeout(t);
  }, [location.state, loading, user, openDrawer, navigate]);

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
    meta.setAttribute("content", DOC_DESC);

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
    let cancelled = false;
    /** No encadenar: el GET a la vitrina ya despierta el backend; evita espera extra en cold start. */
    void wakeUpBackend();
    getMarketplaceAsicVitrina()
      .then((res) => {
        if (cancelled) return;
        const list = res.products ?? [];
        if (list.length > 0) {
          setProducts(list);
          setCatalogFromApi(true);
        } else {
          setProducts(ASIC_MARKETPLACE_PRODUCTS);
          setCatalogFromApi(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProducts(ASIC_MARKETPLACE_PRODUCTS);
        setCatalogFromApi(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    /** Evita POST de yields contra el catálogo placeholder mientras llega la API. */
    if (catalogFromApi === null || products.length === 0) return;
    let cancelled = false;
    /** Defer: deja pintar la grilla antes del POST (red + CoinGecko puede tardar). */
    const tid = window.setTimeout(() => {
      if (cancelled) return;
      const minerProducts = products.filter(asicProductShowsMinerEconomyContent);
      if (minerProducts.length === 0) {
        setLiveYieldsById({});
        setYieldsLoading(false);
        return;
      }
      setYieldsLoading(true);
      postMarketplaceAsicYields(
        minerProducts.map((p) => ({
          id: p.id,
          algo: p.algo,
          hashrate: p.hashrate,
          detailRows: p.detailRows,
        }))
      )
        .then((res) => {
          if (cancelled || !res.yields?.length) return;
          const map: Record<string, MarketplaceAsicLiveYield> = {};
          for (const y of res.yields) map[y.id] = y;
          setLiveYieldsById(map);
        })
        .catch(() => {
          if (!cancelled) setLiveYieldsById({});
        })
        .finally(() => {
          if (!cancelled) setYieldsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [products, catalogFromApi]);

  /** Sin filtro: alfabético. Con filtro: primero el algoritmo activo, luego el resto (oculto en grilla). */
  const shelfProducts = useMemo(() => {
    const list = [...products];
    const label = (p: AsicProduct) => `${p.brand} ${p.model}`.toLowerCase();
    if (filterAlgo == null) {
      // Siempre mostrar Bitcoin (SHA-256) arriba en el catálogo.
      list.sort((a, b) => {
        const ma = a.algo === "sha256" ? 0 : 1;
        const mb = b.algo === "sha256" ? 0 : 1;
        if (ma !== mb) return ma - mb;
        return label(a).localeCompare(label(b), sortLoc);
      });
      return list;
    }
    list.sort((a, b) => {
      const ma = a.algo === filterAlgo ? 0 : 1;
      const mb = b.algo === filterAlgo ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return label(a).localeCompare(label(b), sortLoc);
    });
    return list;
  }, [products, filterAlgo, sortLoc]);

  /** Deep link desde home corporativa: `/marketplace?asic=<id>` abre el modal de esa ficha. */
  useEffect(() => {
    const id = searchParams.get("asic")?.trim();
    if (!id) return;
    const idx = shelfProducts.findIndex((p) => p.id === id);
    const next = new URLSearchParams(searchParams);
    next.delete("asic");
    if (idx < 0) {
      setSearchParams(next, { replace: true });
      return;
    }
    setModalIndex(idx);
    setSearchParams(next, { replace: true });
  }, [searchParams, shelfProducts, setSearchParams]);

  const modalProduct = modalIndex != null ? shelfProducts[modalIndex] ?? null : null;
  const modalLiveYield = modalProduct ? liveYieldsById[modalProduct.id] : undefined;

  return (
    <div className="marketplace-asic-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <section className="section section--market-shelf">
            <div className="market-intro-wrap">
              <header className="market-intro">
                <p className="market-intro__kicker">{t("catalog.kicker")}</p>
                <p className="market-intro__desc">{t("catalog.intro")}</p>
                {catalogFromApi === false ? (
                  <p className="market-intro__desc market-intro__desc--note mt-2 mb-0">{t("catalog.fallback_note")}</p>
                ) : null}
              </header>
            </div>
            <div className="market-shelf-wrap">
              <MarketplaceCatalogFilters value={filterAlgo} onChange={setFilterAlgo} />
              {catalogFromApi === null ? (
                <p className="text-muted small mb-3 market-catalog-sync-hint" aria-live="polite">
                  {t("catalog.syncing")}
                </p>
              ) : null}
              <div className="shelf-grid">
                {shelfProducts.map((p, i) => (
                  <AsicShelfProduct
                    key={p.id}
                    product={p}
                    productIndex={i}
                    filteredHidden={filterAlgo != null && p.algo !== filterAlgo}
                    onOpenModal={setModalIndex}
                    onAddToQuote={handleAddToQuote}
                    addToQuoteLabel={addToQuoteLabel}
                  />
                ))}
              </div>
            </div>
          </section>
        </main>
        <MarketplaceSiteFooter />
      </div>
      {modalProduct ? (
        <AsicProductModal
          product={modalProduct}
          onClose={() => setModalIndex(null)}
          liveYield={modalLiveYield}
          liveYieldLoading={yieldsLoading && !modalLiveYield}
          onAddToQuote={handleAddToQuote}
          addToQuoteLabel={addToQuoteLabel}
        />
      ) : null}
      <MarketplaceQuoteCartDrawer />
    </div>
  );
}
