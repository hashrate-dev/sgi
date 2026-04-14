import { useEffect, useId } from "react";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { MarketplaceCorpFaqSpotlight } from "../components/marketplace/MarketplaceCorpFaqSpotlight";
import { MARKETPLACE_WP_FAQ_ROWS } from "../lib/marketplaceFullFaqKeys.js";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";

export function MarketplaceFaqPage() {
  const { t } = useMarketplaceLang();
  const headingId = useId();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = t("corp.faq.doc_title");
    let meta = document.querySelector('meta[name="description"]');
    const prevContent = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", t("corp.faq.meta_desc"));

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

  return (
    <div className="marketplace-asic-page market-corp-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-faq">
        <MarketplaceSiteHeader />
        <main
          id="page-main"
          className="page-main page-main--market page-main--market--corp page-main--market--faq"
        >
          <div className="market-corp-inner market-corp-inner--flush-top market-corp-faq-page">
            <section className="market-corp-section market-corp-faq-page__section" aria-labelledby={headingId}>
              <MarketplaceCorpFaqSpotlight
                headingId={headingId}
                rows={MARKETPLACE_WP_FAQ_ROWS}
                defaultOpenIndex={null}
                variant="aurora"
              />
            </section>
          </div>
        </main>
        <MarketplaceSiteFooter />
      </div>
    </div>
  );
}
