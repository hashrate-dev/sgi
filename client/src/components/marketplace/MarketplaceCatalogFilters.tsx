import { ASIC_FILTER_GROUPS } from "../../lib/marketplaceAsicCatalog.js";
import type { MarketplaceCatalogFilter } from "../../lib/marketplaceAsicCatalog.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

const FILTER_LABEL_KEY: Record<MarketplaceCatalogFilter, string> = {
  sha256: "filter.bitcoin",
  scrypt: "filter.doge_ltc",
  zcash: "filter.zcash",
  monero: "filter.monero",
  other: "filter.others",
};

export function MarketplaceCatalogFilters({
  value,
  onChange,
  availableFilters,
}: {
  value: MarketplaceCatalogFilter | null;
  onChange: (next: MarketplaceCatalogFilter | null) => void;
  availableFilters?: MarketplaceCatalogFilter[];
}) {
  const { t } = useMarketplaceLang();
  const visibleGroups =
    Array.isArray(availableFilters) && availableFilters.length > 0
      ? ASIC_FILTER_GROUPS.filter((g) => availableFilters.includes(g.id))
      : ASIC_FILTER_GROUPS;
  return (
    <div className="market-filter-simple">
      <span className="market-filter-simple__label" id="market-filter-label">
        {t("filter.label")}
      </span>
      <div
        className="market-filter-simple__pills"
        role="group"
        aria-labelledby="market-filter-label"
      >
        <button
          type="button"
          className={"market-filter-pill" + (value == null ? " is-on" : "")}
          onClick={() => onChange(null)}
        >
          {t("filter.all")}
        </button>
        {visibleGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={"market-filter-pill" + (value === g.id ? " is-on" : "")}
            onClick={() => onChange(g.id)}
          >
            {t(FILTER_LABEL_KEY[g.id])}
          </button>
        ))}
      </div>
    </div>
  );
}
