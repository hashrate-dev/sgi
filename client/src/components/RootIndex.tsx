import { ProtectedRoute } from "./ProtectedRoute";
import { ProtectedAppLayout } from "./ProtectedAppLayout";
import { HomePage } from "../pages/HomePage";
import { MarketplaceCorporateHomePage } from "../pages/MarketplaceCorporateHomePage";
import { MarketplaceLanguageProvider } from "../contexts/MarketplaceLanguageContext";
import { MarketplaceQuoteCartProvider } from "../contexts/MarketplaceQuoteCartContext";
import { MarketplaceQuoteCartDrawer } from "./marketplace/MarketplaceQuoteCartDrawer";
import { getBrowserHostname, isPrimaryPublicHost } from "../lib/hashrateHosts";

/** `/` = home pública en hashrate.space; panel SGI en localhost / sgi.hashrate.space. */
export function RootIndex() {
  if (isPrimaryPublicHost(getBrowserHostname())) {
    return (
      <MarketplaceLanguageProvider>
        <MarketplaceQuoteCartProvider>
          <MarketplaceCorporateHomePage />
          <MarketplaceQuoteCartDrawer />
        </MarketplaceQuoteCartProvider>
      </MarketplaceLanguageProvider>
    );
  }
  return (
    <ProtectedRoute>
      <ProtectedAppLayout>
        <HomePage />
      </ProtectedAppLayout>
    </ProtectedRoute>
  );
}
