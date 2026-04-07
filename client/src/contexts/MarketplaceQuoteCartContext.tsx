import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AsicProduct } from "../lib/marketplaceAsicCatalog.js";
import { getMarketplaceSetupQuotePrices, syncMarketplaceQuoteTicket } from "../lib/api.js";
import {
  mergeAddLine,
  readQuoteCartFromStorageKey,
  writeQuoteCartToStorageKey,
  quoteCartTotalUnits,
  quoteCartSubtotalUsd,
  buildQuoteMailto,
  buildQuoteWhatsAppUrl,
  quoteCartStorageKeyForUser,
  quoteCartLineKey,
  QUOTE_CART_GUEST_KEY,
  QUOTE_ADDON_SETUP_USD_FALLBACK,
  type QuoteCartLine,
  type AddQuoteLineOptions,
} from "../lib/marketplaceQuoteCart.js";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "./AuthContext";

export type QuoteTicketRef = { orderNumber: string; ticketCode: string };

/** Tras «Generar ticket de consulta» en el carrito. */
export type SubmittedConsultationSummary = {
  id: number;
  orderNumber: string;
  ticketCode: string;
  status: string;
  subtotalUsd: number;
  unitCount: number;
  lineCount: number;
};

type Ctx = {
  lines: QuoteCartLine[];
  totalUnits: number;
  /** Setup equipo completo (S02) y fracción hashrate (S03); fallback 50 hasta cargar. */
  setupEquipoCompletoUsd: number;
  setupCompraHashrateUsd: number;
  drawerOpen: boolean;
  /** Cliente o admin A/B: sincronizan carrito con el servidor y lista persistida por cuenta. */
  canUseQuoteCart: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  addProduct: (product: AsicProduct, qty?: number, opts?: AddQuoteLineOptions) => void;
  setLineQty: (lineKey: string, qty: number) => void;
  removeLine: (lineKey: string) => void;
  setLineAddons: (lineKey: string, patch: { includeSetup?: boolean; includeWarranty?: boolean }) => void;
  clearCart: () => void;
  ticketRef: QuoteTicketRef | null;
  /** Registra el ticket en la BD (estado enviado_consulta) y vacía el carrito. */
  submitConsultationTicket: () => Promise<SubmittedConsultationSummary>;
  openQuoteEmail: () => Promise<void>;
  openQuoteWhatsApp: () => Promise<void>;
};

const MarketplaceQuoteCartContext = createContext<Ctx | null>(null);

function linesToPayload(lines: QuoteCartLine[]) {
  return lines.map((l) => ({
    productId: l.productId,
    qty: l.qty,
    brand: l.brand,
    model: l.model,
    hashrate: l.hashrate,
    priceUsd: l.priceUsd,
    priceLabel: l.priceLabel,
    ...(l.hashrateSharePct === 25 || l.hashrateSharePct === 50 || l.hashrateSharePct === 75
      ? { hashrateSharePct: l.hashrateSharePct }
      : {}),
    includeSetup: l.includeSetup,
    includeWarranty: l.includeWarranty,
  }));
}

export function MarketplaceQuoteCartProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const canUseQuoteCart = Boolean(!loading && canUseMarketplaceQuoteCart(user?.role));

  const storageKey = useMemo(() => {
    if (!loading && user && canUseMarketplaceQuoteCart(user.role)) return quoteCartStorageKeyForUser(user.id);
    return QUOTE_CART_GUEST_KEY;
  }, [loading, user?.id, user?.role]);

  const [lines, setLines] = useState<QuoteCartLine[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ticketRef, setTicketRef] = useState<QuoteTicketRef | null>(null);
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void getMarketplaceSetupQuotePrices()
      .then((r) => {
        if (cancelled) return;
        const a = Number(r.setupEquipoCompletoUsd);
        const b = Number(r.setupCompraHashrateUsd);
        if (Number.isFinite(a) && a >= 0) setSetupEquipoCompletoUsd(Math.round(a));
        if (Number.isFinite(b) && b >= 0) setSetupCompraHashrateUsd(Math.round(b));
      })
      .catch(() => {
        /* mantener fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    setLines(readQuoteCartFromStorageKey(storageKey));
    if (!canUseQuoteCart) setTicketRef(null);
  }, [loading, storageKey, canUseQuoteCart]);

  useEffect(() => {
    if (loading) return;
    writeQuoteCartToStorageKey(storageKey, lines);
  }, [lines, storageKey, loading]);

  const totalUnits = useMemo(() => quoteCartTotalUnits(lines), [lines]);

  useEffect(() => {
    if (!canUseQuoteCart) {
      return;
    }
    if (lines.length === 0) {
      setTicketRef(null);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await syncMarketplaceQuoteTicket({
            lines: linesToPayload(lines),
            event: "sync",
          });
          if (res.orderNumber && res.ticketCode) {
            setTicketRef({ orderNumber: res.orderNumber, ticketCode: res.ticketCode });
          }
        } catch {
          /* sin red / API */
        }
      })();
    }, 900);
    return () => window.clearTimeout(t);
  }, [lines, canUseQuoteCart]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((o) => !o), []);

  const addProduct = useCallback((product: AsicProduct, qty = 1, opts?: AddQuoteLineOptions) => {
    setLines((prev) => mergeAddLine(prev, product, qty, opts));
  }, []);

  const setLineQty = useCallback((lineKey: string, qty: number) => {
    const q = Math.min(99, Math.max(1, Math.round(qty) || 1));
    setLines((prev) => {
      const idx = prev.findIndex((l) => quoteCartLineKey(l) === lineKey);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], qty: q };
      return next;
    });
  }, []);

  const removeLine = useCallback((lineKey: string) => {
    setLines((prev) => prev.filter((l) => quoteCartLineKey(l) !== lineKey));
  }, []);

  const setLineAddons = useCallback(
    (lineKey: string, patch: { includeSetup?: boolean; includeWarranty?: boolean }) => {
      setLines((prev) => {
        const idx = prev.findIndex((l) => quoteCartLineKey(l) === lineKey);
        if (idx < 0) return prev;
        const next = [...prev];
        const cur = next[idx];
        next[idx] = {
          ...cur,
          ...(patch.includeSetup != null ? { includeSetup: patch.includeSetup } : {}),
          ...(patch.includeWarranty != null ? { includeWarranty: patch.includeWarranty } : {}),
        };
        return next;
      });
    },
    []
  );

  const clearCart = useCallback(() => {
    setLines([]);
    if (canUseQuoteCart) {
      void (async () => {
        try {
          await syncMarketplaceQuoteTicket({ lines: [], event: "sync" });
        } catch {
          /* ignore */
        }
      })();
    }
  }, [canUseQuoteCart]);

  const submitConsultationTicket = useCallback(async () => {
    if (!canUseQuoteCart) {
      throw new Error("Iniciá sesión para generar un ticket.");
    }
    if (lines.length === 0) {
      throw new Error("Agregá al menos un equipo a la lista.");
    }
    const subtotalUsd = quoteCartSubtotalUsd(lines, {
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
    });
    const unitCount = quoteCartTotalUnits(lines);
    const lineCount = lines.length;
    const payload = linesToPayload(lines);
    const r = await syncMarketplaceQuoteTicket({ lines: payload, event: "submit_ticket" });
    if (!r.orderNumber || !r.ticketCode || r.id == null) {
      throw new Error("No se pudo registrar el ticket. Probá de nuevo.");
    }
    setLines([]);
    setTicketRef(null);
    try {
      await syncMarketplaceQuoteTicket({ lines: [], event: "sync" });
    } catch {
      /* borrador: idem */
    }
    return {
      id: r.id,
      orderNumber: r.orderNumber,
      ticketCode: r.ticketCode,
      status: r.status ?? "enviado_consulta",
      subtotalUsd,
      unitCount,
      lineCount,
    };
  }, [canUseQuoteCart, lines, setupEquipoCompletoUsd, setupCompraHashrateUsd]);

  const openQuoteEmail = useCallback(async () => {
    let ref: QuoteTicketRef | undefined;
    try {
      if (canUseQuoteCart && lines.length > 0) {
        const r = await syncMarketplaceQuoteTicket({
          lines: linesToPayload(lines),
          event: "contact_email",
        });
        if (r.orderNumber && r.ticketCode) {
          ref = { orderNumber: r.orderNumber, ticketCode: r.ticketCode };
          setTicketRef(ref);
        }
      }
    } catch {
      /* mailto igual */
    }
    window.location.href = buildQuoteMailto(lines, ref, {
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
    });
  }, [lines, canUseQuoteCart, setupEquipoCompletoUsd, setupCompraHashrateUsd]);

  const openQuoteWhatsApp = useCallback(async () => {
    let ref: QuoteTicketRef | undefined;
    try {
      if (canUseQuoteCart && lines.length > 0) {
        const r = await syncMarketplaceQuoteTicket({
          lines: linesToPayload(lines),
          event: "contact_whatsapp",
        });
        if (r.orderNumber && r.ticketCode) {
          ref = { orderNumber: r.orderNumber, ticketCode: r.ticketCode };
          setTicketRef(ref);
        }
      }
    } catch {
      /* seguimos */
    }
    window.open(
      buildQuoteWhatsAppUrl(lines, ref, { setupEquipoCompletoUsd, setupCompraHashrateUsd }),
      "_blank",
      "noopener,noreferrer"
    );
  }, [lines, canUseQuoteCart, setupEquipoCompletoUsd, setupCompraHashrateUsd]);

  const value = useMemo<Ctx>(
    () => ({
      lines,
      totalUnits,
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
      drawerOpen,
      canUseQuoteCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      addProduct,
      setLineQty,
      removeLine,
      setLineAddons,
      clearCart,
      ticketRef,
      submitConsultationTicket,
      openQuoteEmail,
      openQuoteWhatsApp,
    }),
    [
      lines,
      totalUnits,
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
      drawerOpen,
      canUseQuoteCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      addProduct,
      setLineQty,
      removeLine,
      setLineAddons,
      clearCart,
      ticketRef,
      submitConsultationTicket,
      openQuoteEmail,
      openQuoteWhatsApp,
    ]
  );

  return <MarketplaceQuoteCartContext.Provider value={value}>{children}</MarketplaceQuoteCartContext.Provider>;
}

export function useMarketplaceQuoteCart(): Ctx {
  const ctx = useContext(MarketplaceQuoteCartContext);
  if (!ctx) {
    throw new Error("useMarketplaceQuoteCart debe usarse dentro de MarketplaceQuoteCartProvider");
  }
  return ctx;
}

export function useOptionalMarketplaceQuoteCart(): Ctx | null {
  return useContext(MarketplaceQuoteCartContext);
}
