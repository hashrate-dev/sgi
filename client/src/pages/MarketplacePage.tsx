import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ASIC_MARKETPLACE_PRODUCTS,
  asicProductShowsMinerEconomyContent,
  compareMarketplaceShelfProducts,
  marketplaceShelfPrimaryGroup,
  mergeAsicCatalogWithCorpGridExtras,
} from "../lib/marketplaceAsicCatalog.js";
import type { AsicProduct, MarketplaceCatalogFilter } from "../lib/marketplaceAsicCatalog.js";
import type { AddQuoteLineOptions } from "../lib/marketplaceQuoteCart.js";
import { getMarketplaceAsicVitrina, postMarketplaceAsicYields, wakeUpBackend, type MarketplaceAsicLiveYield } from "../lib/api.js";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext";
import { useMarketplaceQuoteCart } from "../contexts/MarketplaceQuoteCartContext.js";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader.js";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter.js";
import { MarketplaceCatalogFilters } from "../components/marketplace/MarketplaceCatalogFilters.js";
import { AsicShelfProduct } from "../components/marketplace/AsicShelfProduct.js";
import { AsicProductModal } from "../components/marketplace/AsicProductModal.js";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../lib/i18n.js";
import "../styles/marketplace-hashrate.css";

const DOC_TITLE = "Hashrate Space - Marketplace";
const DOC_DESC =
  "Equipos ASIC para minería de Bitcoin y Scrypt. Hashrate Space — Paraguay y Uruguay: infraestructura, energía y soporte.";

const SKELETON_GRID_COUNT = 8;

function scheduleIdle(cb: () => void, timeoutMs: number): number {
  const w = window as Window & { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") {
    return w.requestIdleCallback(cb, { timeout: timeoutMs });
  }
  return window.setTimeout(cb, 120);
}

function cancelIdle(id: number): void {
  const w = window as Window & { cancelIdleCallback?: (n: number) => void };
  if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(id);
  else window.clearTimeout(id);
}

function ShelfSkeletonGrid({ count = SKELETON_GRID_COUNT }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shelf-product shelf-product--skeleton" aria-hidden>
          <div className="shelf-product__media">
            <div className="shelf-product__media-inner">
              <div className="shelf-product__skeleton-photo" />
            </div>
          </div>
          <div className="shelf-product__body">
            <div className="shelf-product__skeleton-line shelf-product__skeleton-line--lg" />
            <div className="shelf-product__skeleton-line shelf-product__skeleton-line--md" />
            <div className="shelf-product__skeleton-line shelf-product__skeleton-line--sm" />
            <div className="shelf-product__skeleton-line shelf-product__skeleton-line--full" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Evita re-render de toda la grilla cuando solo llegan yields en vivo (el modal los consume). */
const MemoAsicShelfProduct = memo(AsicShelfProduct, (prev, next) => {
  return (
    prev.product === next.product &&
    prev.productIndex === next.productIndex &&
    prev.filteredHidden === next.filteredHidden &&
    prev.addToQuoteLabel === next.addToQuoteLabel &&
    prev.onAddToQuote === next.onAddToQuote &&
    prev.onOpenModal === next.onOpenModal
  );
});
MemoAsicShelfProduct.displayName = "AsicShelfProduct";

function matchesCatalogFilter(p: AsicProduct, f: MarketplaceCatalogFilter): boolean {
  const g = marketplaceShelfPrimaryGroup(p);
  if (f === "sha256") return g === 0;
  if (f === "scrypt") return g === 2;
  if (f === "zcash") return g === 1;
  // Otros = infraestructura (contenedores/racks/PDU).
  return g === 5;
}

export function MarketplacePage() {
  return <MarketplacePageBody />;
}

function MarketplacePageBody() {
  const { user, loading } = useAuth();
  const { lang, t } = useMarketplaceLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addProduct, openDrawer } = useMarketplaceQuoteCart();
  const [filterAlgo, setFilterAlgo] = useState<MarketplaceCatalogFilter | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  /** Vacío hasta la vitrina: evita pintar catálogo placeholder y reemplazarlo por el de la API (doble trabajo y “ola” visual). */
  const [products, setProducts] = useState<AsicProduct[]>(() => []);
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
    let linkInter = document.querySelector('link[data-hrs-font="inter-catalog"]');
    if (!linkInter) {
      linkInter = document.createElement("link");
      linkInter.setAttribute("rel", "stylesheet");
      linkInter.setAttribute(
        "href",
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      );
      linkInter.setAttribute("data-hrs-font", "inter-catalog");
      document.head.appendChild(linkInter);
    }

    return () => {
      document.title = prevTitle;
      meta?.setAttribute("content", prevContent);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let fallbackApplied = false;
    const localFallbackProducts = mergeAsicCatalogWithCorpGridExtras(ASIC_MARKETPLACE_PRODUCTS);

    const applyLocalFallback = () => {
      if (cancelled) return;
      fallbackApplied = true;
      setProducts(localFallbackProducts);
      setCatalogFromApi(false);
    };

    /**
     * En localhost, si el backend está apagado/lento, `api()` puede tardar varios reintentos.
     * Evita que la vitrina quede en skeleton por minutos.
     */
    const fallbackTimer = window.setTimeout(() => {
      if (fallbackApplied) return;
      applyLocalFallback();
    }, 12000);

    /** No encadenar: el GET a la vitrina ya despierta el backend; evita espera extra en cold start. */
    void wakeUpBackend();
    getMarketplaceAsicVitrina()
      .then((res) => {
        if (cancelled) return;
        window.clearTimeout(fallbackTimer);
        const list = res.products ?? [];
        if (list.length > 0) {
          setProducts(mergeAsicCatalogWithCorpGridExtras(list));
          setCatalogFromApi(true);
        } else {
          applyLocalFallback();
        }
      })
      .catch(() => {
        if (cancelled) return;
        window.clearTimeout(fallbackTimer);
        applyLocalFallback();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    /** Evita POST de yields hasta tener catálogo definitivo y dar tiempo al primer paint de la grilla. */
    if (catalogFromApi === null || products.length === 0) return;
    let cancelled = false;
    const idleId = scheduleIdle(() => {
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
    }, 1800);
    return () => {
      cancelled = true;
      cancelIdle(idleId);
    };
  }, [products, catalogFromApi]);

  /**
   * Sin filtro: mineros de aire (Bitcoin → Zcash → L9 → otro scrypt), luego hydro/líquido, al final infra.
   * Con filtro: primero el algoritmo activo; dentro de cada bloque, el mismo orden por familia.
   */
  const shelfProducts = useMemo(() => {
    const list = [...products];
    if (filterAlgo == null) {
      list.sort((a, b) => compareMarketplaceShelfProducts(a, b, sortLoc));
      return list;
    }
    list.sort((a, b) => {
      const ma = matchesCatalogFilter(a, filterAlgo) ? 0 : 1;
      const mb = matchesCatalogFilter(b, filterAlgo) ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return compareMarketplaceShelfProducts(a, b, sortLoc);
    });
    return list;
  }, [products, filterAlgo, sortLoc]);

  /** Deep link desde home corporativa: `/marketplace?asic=<id>` abre el modal de esa ficha. */
  useEffect(() => {
    if (catalogFromApi === null) return;
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
  }, [searchParams, shelfProducts, setSearchParams, catalogFromApi]);

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
            <div className="market-shelf-wrap market-shelf-wrap--catalog-v2">
              <MarketplaceCatalogFilters value={filterAlgo} onChange={setFilterAlgo} />
              {catalogFromApi === null ? (
                <p className="text-muted small mb-3 market-catalog-sync-hint" aria-live="polite">
                  {t("catalog.syncing")}
                </p>
              ) : null}
              <div className="shelf-grid market-shelf-grid--catalog-v2">
                {catalogFromApi === null ? (
                  <ShelfSkeletonGrid />
                ) : (
                  shelfProducts.map((p, i) => (
                    <MemoAsicShelfProduct
                      key={p.id}
                      product={p}
                      productIndex={i}
                      filteredHidden={filterAlgo != null && !matchesCatalogFilter(p, filterAlgo)}
                      onOpenModal={setModalIndex}
                      onAddToQuote={handleAddToQuote}
                      addToQuoteLabel={addToQuoteLabel}
                    />
                  ))
                )}
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
    </div>
  );
}
