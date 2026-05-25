import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ASIC_MARKETPLACE_PRODUCTS,
  asicProductShowsMinerEconomyContent,
  compareMarketplaceShelfProducts,
  inferMarketplaceCatalogFilter,
  mergeAsicCatalogWithCorpGridExtras,
  normalizeAsicCatalogProducts,
  normalizeAsicProductImages,
} from "../lib/marketplaceAsicCatalog.js";
import type { AsicProduct, MarketplaceCatalogFilter } from "../lib/marketplaceAsicCatalog.js";
import type { AddQuoteLineOptions } from "../lib/marketplaceQuoteCart.js";
import {
  getMarketplaceAsicVitrina,
  getMarketplaceAsicVitrinaItem,
  peekMarketplaceVitrinaCache,
  postMarketplaceAsicYields,
  type MarketplaceAsicLiveYield,
} from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext";
import { useMarketplaceQuoteCart } from "../contexts/MarketplaceQuoteCartContext.js";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader.js";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter.js";
import { MarketplaceCatalogFilters } from "../components/marketplace/MarketplaceCatalogFilters.js";
import { AsicShelfProduct } from "../components/marketplace/AsicShelfProduct.js";
import { AsicProductModal } from "../components/marketplace/AsicProductModal.js";
import { MarketplaceInlineLoginModal } from "../components/marketplace/MarketplaceInlineLoginModal.js";
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
    prev.showPrice === next.showPrice &&
    prev.addToQuoteLabel === next.addToQuoteLabel &&
    prev.onAddToQuote === next.onAddToQuote &&
    prev.onOpenModal === next.onOpenModal
  );
});
MemoAsicShelfProduct.displayName = "AsicShelfProduct";

function matchesCatalogFilter(p: AsicProduct, f: MarketplaceCatalogFilter): boolean {
  return inferMarketplaceCatalogFilter(p) === f;
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
  const [hidePricesForGuests, setHidePricesForGuests] = useState(true);
  const canViewMarketplacePrices = Boolean(!loading && (user || !hidePricesForGuests));
  const [filterAlgo, setFilterAlgo] = useState<MarketplaceCatalogFilter | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalProduct, setModalProduct] = useState<AsicProduct | null>(null);
  const openProductModal = useCallback((index: number) => {
    setModalIndex(index);
  }, []);
  /** Catálogo visible al instante (caché de sesión o bundle local); la API actualiza en segundo plano. */
  const [products, setProducts] = useState<AsicProduct[]>(() => {
    const cached = peekMarketplaceVitrinaCache();
    if (cached?.products?.length) {
      return mergeAsicCatalogWithCorpGridExtras(normalizeAsicCatalogProducts(cached.products));
    }
    return mergeAsicCatalogWithCorpGridExtras(ASIC_MARKETPLACE_PRODUCTS);
  });
  const [catalogRevalidating, setCatalogRevalidating] = useState(false);
  const [catalogSyncFailed, setCatalogSyncFailed] = useState(false);
  const [liveYieldsById, setLiveYieldsById] = useState<Record<string, MarketplaceAsicLiveYield>>({});
  const [yieldsLoading, setYieldsLoading] = useState(false);
  const loginModalOpen = searchParams.get("login") === "1";
  const closeInlineLoginModal = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("login");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const handleAddToQuote = useCallback(
    (p: AsicProduct, opts?: AddQuoteLineOptions) => {
      if (loading) return;
      if (!user) {
        const next = new URLSearchParams(searchParams);
        next.set("login", "1");
        setSearchParams(next, { replace: false });
        return;
      }
      addProduct(p, 1, opts);
      openDrawer();
    },
    [addProduct, openDrawer, user, loading, searchParams, setSearchParams]
  );

  const addToQuoteLabel = t("catalog.add_short");
  const sortLoc = marketplaceLocale(lang);

  /** Tras login/registro desde flujo cotización: abrir drawer una vez. */
  useEffect(() => {
    const st = location.state as { openQuoteDrawer?: boolean } | null;
    if (!st?.openQuoteDrawer) return;
    if (loading) return;
    if (!user) {
      navigate("/equipment", { replace: true, state: {} });
      return;
    }
    const t = window.setTimeout(() => {
      openDrawer();
      navigate("/equipment", { replace: true, state: {} });
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
    const hadCache = Boolean(peekMarketplaceVitrinaCache()?.products?.length);
    if (!hadCache) setCatalogRevalidating(true);
    setCatalogSyncFailed(false);

    getMarketplaceAsicVitrina()
      .then((res) => {
        if (cancelled) return;
        setHidePricesForGuests(res.hidePricesForGuests !== false);
        const list = res.products ?? [];
        if (list.length > 0) {
          setProducts(mergeAsicCatalogWithCorpGridExtras(normalizeAsicCatalogProducts(list)));
          setCatalogSyncFailed(false);
        } else if (!hadCache) {
          setCatalogSyncFailed(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (!hadCache) setCatalogSyncFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCatalogRevalidating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    /** Evita POST de yields hasta tener catálogo definitivo y dar tiempo al primer paint de la grilla. */
    if (products.length === 0) return;
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
          brand: p.brand,
          model: p.model,
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
    }, 600);
    return () => {
      cancelled = true;
      cancelIdle(idleId);
    };
  }, [products]);

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

  /** Solo tarjetas visibles: no montar DOM oculto por filtro (mejora scroll y paint). */
  const visibleShelfEntries = useMemo(() => {
    if (filterAlgo == null) {
      return shelfProducts.map((p, i) => ({ product: p, index: i }));
    }
    const out: { product: AsicProduct; index: number }[] = [];
    for (let i = 0; i < shelfProducts.length; i++) {
      const p = shelfProducts[i]!;
      if (matchesCatalogFilter(p, filterAlgo)) out.push({ product: p, index: i });
    }
    return out;
  }, [shelfProducts, filterAlgo]);

  const availableFilters = useMemo<MarketplaceCatalogFilter[]>(() => {
    const seen = new Set<MarketplaceCatalogFilter>();
    for (const p of shelfProducts) seen.add(inferMarketplaceCatalogFilter(p));
    const order: MarketplaceCatalogFilter[] = ["sha256", "scrypt", "zcash", "monero", "other"];
    return order.filter((f) => seen.has(f));
  }, [shelfProducts]);

  useEffect(() => {
    if (filterAlgo != null && !availableFilters.includes(filterAlgo)) {
      setFilterAlgo(null);
    }
  }, [filterAlgo, availableFilters]);

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

  const shelfProductAtModal = modalIndex != null ? shelfProducts[modalIndex] ?? null : null;

  useEffect(() => {
    if (modalIndex == null || !shelfProductAtModal) {
      setModalProduct(null);
      return;
    }
    setModalProduct(shelfProductAtModal);
    let cancelled = false;
    void getMarketplaceAsicVitrinaItem(shelfProductAtModal.id)
      .then((full) => {
        if (cancelled) return;
        setModalProduct(normalizeAsicProductImages(full));
      })
      .catch(() => {
        /* grilla sigue visible con datos livianos */
      });
    return () => {
      cancelled = true;
    };
  }, [modalIndex, shelfProductAtModal?.id]);

  const modalLiveYield = modalProduct ? liveYieldsById[modalProduct.id] : undefined;

  return (
    <div className="marketplace-asic-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <section className={`section section--market-shelf${loginModalOpen ? " section--market-shelf--blurred" : ""}`}>
            <div className="market-intro-wrap">
              <header className="market-intro">
                <p className="market-intro__kicker">{t("catalog.kicker")}</p>
                <p className="market-intro__desc">{t("catalog.intro")}</p>
                {catalogSyncFailed && !catalogRevalidating ? (
                  <p className="market-intro__desc market-intro__desc--note mt-2 mb-0">{t("catalog.fallback_note")}</p>
                ) : null}
              </header>
            </div>
            <div className="market-shelf-wrap market-shelf-wrap--catalog-v2">
              <MarketplaceCatalogFilters
                value={filterAlgo}
                onChange={setFilterAlgo}
                availableFilters={availableFilters}
              />
              {catalogRevalidating ? (
                <p className="text-muted small mb-3 market-catalog-sync-hint" aria-live="polite">
                  {t("catalog.syncing")}
                </p>
              ) : null}
              <div className="shelf-grid market-shelf-grid--catalog-v2">
                {products.length === 0 && catalogRevalidating ? (
                  <ShelfSkeletonGrid />
                ) : (
                  visibleShelfEntries.map(({ product: p, index: i }) => (
                    <MemoAsicShelfProduct
                      key={p.id}
                      product={p}
                      productIndex={i}
                      filteredHidden={false}
                      showPrice={canViewMarketplacePrices}
                      onOpenModal={openProductModal}
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
          showPrice={canViewMarketplacePrices}
          onAddToQuote={handleAddToQuote}
          addToQuoteLabel={addToQuoteLabel}
        />
      ) : null}
      <MarketplaceInlineLoginModal open={loginModalOpen} onClose={closeInlineLoginModal} />
    </div>
  );
}
