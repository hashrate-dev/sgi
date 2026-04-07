import { ASIC_FILTER_GROUPS } from "../../lib/marketplaceAsicCatalog.js";
import type { AsicAlgo } from "../../lib/marketplaceAsicCatalog.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

const FILTER_LABEL_KEY: Record<AsicAlgo, string> = {
  sha256: "filter.bitcoin",
  scrypt: "filter.doge_ltc",
};

export function MarketplaceCatalogFilters({
  value,
  onChange,
}: {
  value: AsicAlgo | null;
  onChange: (next: AsicAlgo | null) => void;
}) {
  const { t } = useMarketplaceLang();
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
        {ASIC_FILTER_GROUPS.map((g) => (
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
