import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { MarketplaceLang } from "../../lib/i18n.js";

const STORAGE_KEY = "marketplace-lang";

/** Rutas del WordPress antiguo (slug sin prefijo de idioma) → app React. */
import { MARKETPLACE, mpHome } from "../../lib/marketplacePaths.js";

function slugToPath(slug: string): string {
  const map: Record<string, string> = {
    "": mpHome(),
    home: mpHome(),
    services: MARKETPLACE.services,
    servicios: MARKETPLACE.services,
    company: MARKETPLACE.company,
    empresa: MARKETPLACE.company,
    faq: MARKETPLACE.faq,
    contact: MARKETPLACE.contact,
    contacto: MARKETPLACE.contact,
    equipment: MARKETPLACE.catalog,
    equipos: MARKETPLACE.catalog,
    marketplace: MARKETPLACE.catalog,
  };
  return map[slug] ?? mpHome();
}

function normalizeSlug(tail: string): string {
  return tail.replace(/^\/+|\/+$/g, "").toLowerCase().split("/")[0] ?? "";
}

type Props = { lang: MarketplaceLang };

/** /en/, /es/, /pt/ (URLs legacy de WordPress) → marketplace + idioma en localStorage. */
export function LegacyWpLangRedirect({ lang }: Props) {
  const { pathname } = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang === "en" ? "en" : lang === "pt" ? "pt" : "es";
  }, [lang]);

  const tail = pathname.replace(new RegExp(`^/${lang}/?`, "i"), "");
  const slug = normalizeSlug(tail);
  const dest = slugToPath(slug);
  return <Navigate to={dest} replace />;
}
