import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { MarketplaceLang } from "../../lib/i18n.js";

const STORAGE_KEY = "marketplace-lang";

/** Rutas del WordPress antiguo (slug sin prefijo de idioma) → app React. */
const SLUG_TO_PATH: Record<string, string> = {
  "": "/marketplace/home",
  home: "/marketplace/home",
  services: "/marketplace/services",
  servicios: "/marketplace/services",
  company: "/marketplace/company",
  empresa: "/marketplace/company",
  faq: "/marketplace/faq",
  contact: "/marketplace/contact",
  contacto: "/marketplace/contact",
  equipment: "/marketplace",
  equipos: "/marketplace",
  marketplace: "/marketplace",
};

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
  const dest = SLUG_TO_PATH[slug] ?? "/marketplace/home";
  return <Navigate to={dest} replace />;
}
