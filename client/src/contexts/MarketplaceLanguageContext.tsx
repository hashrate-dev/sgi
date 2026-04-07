import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { t as translate, tf as translateFormat, type MarketplaceLang } from "../lib/i18n.js";

const STORAGE_KEY = "marketplace-lang";

function readStoredLang(): MarketplaceLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "es") return v;
  } catch {
    /* ignore */
  }
  return "es";
}

type Ctx = {
  lang: MarketplaceLang;
  setLang: (l: MarketplaceLang) => void;
  t: (key: string) => string;
  tf: (key: string, vars?: Record<string, string>) => string;
};

const MarketplaceLanguageContext = createContext<Ctx | null>(null);

export function MarketplaceLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<MarketplaceLang>(() => readStoredLang());

  const setLang = useCallback((l: MarketplaceLang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "es";
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (key: string) => translate(lang, key),
      tf: (key: string, vars?: Record<string, string>) => translateFormat(lang, key, vars ?? {}),
    }),
    [lang, setLang]
  );

  return (
    <MarketplaceLanguageContext.Provider value={value}>{children}</MarketplaceLanguageContext.Provider>
  );
}

/** Dentro de `/marketplace/*`. Fuera del provider: español por defecto. */
export function useMarketplaceLang(): Ctx {
  const ctx = useContext(MarketplaceLanguageContext);
  const lang = ctx?.lang ?? "es";
  const setLang = ctx?.setLang ?? (() => {});
  return useMemo(
    () => ({
      lang,
      setLang,
      t: (key: string) => translate(lang, key),
      tf: (key: string, vars?: Record<string, string>) => translateFormat(lang, key, vars ?? {}),
    }),
    [lang, setLang]
  );
}
