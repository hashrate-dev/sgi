import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AsicProduct } from "../lib/marketplaceAsicCatalog.js";
import {
  getMarketplaceGarantiaQuotePrices,
  getMarketplaceSetupQuotePrices,
  getMyMarketplaceQuoteTickets,
  getMyMarketplaceQuoteTicket,
  syncMarketplaceQuoteTicket,
  isOneActiveOrderError,
} from "../lib/api.js";
import type { MarketplaceQuoteTicket } from "../lib/api.js";
import {
  mergeAddLine,
  readQuoteCartFromStorageKey,
  writeQuoteCartToStorageKey,
  quoteCartTotalUnits,
  quoteCartSubtotalUsd,
  quoteCartLinesFromApiPayload,
  mergeCartLinesForPipelineOrder,
  buildQuoteMailto,
  buildQuoteWhatsAppUrl,
  quoteCartStorageKeyForUser,
  quoteCartLineKey,
  QUOTE_CART_GUEST_KEY,
  isMarketplacePipelineTicketStatus,
  QUOTE_ADDON_SETUP_USD_FALLBACK,
  type QuoteCartLine,
  type AddQuoteLineOptions,
  type GarantiaQuotePriceItem,
} from "../lib/marketplaceQuoteCart.js";
import { canUseMarketplaceQuoteCart, enforceSingleMarketplaceOrderForRole } from "../lib/auth.js";
import { playMarketplaceCartItemAddedSound, playMarketplaceCartItemRemovedSound } from "../lib/marketplaceCartSound.js";
import { useAuth } from "./AuthContext";

export type QuoteTicketRef = { orderNumber: string; ticketCode: string };

function pickBlockingPipelineTicket(tickets: MarketplaceQuoteTicket[]): MarketplaceQuoteTicket | null {
  return tickets.find((x) => isMarketplacePipelineTicketStatus(x.status)) ?? null;
}

export const MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT = "marketplace-active-order-changed";

export type MarketplaceCartDrawerSubView = "cart" | "orders";

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
  /** Precios garantía ANDE (items-garantia); vacío hasta cargar la API pública. */
  garantiaQuoteItems: GarantiaQuotePriceItem[];
  drawerOpen: boolean;
  /** Vista dentro del panel: carrito o seguimiento de órdenes (sin ruta aparte). */
  drawerSubView: MarketplaceCartDrawerSubView;
  /** Cliente o admin A/B: sincronizan carrito con el servidor y lista persistida por cuenta. */
  canUseQuoteCart: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** Abre el carrito en la vista de órdenes (p. ej. tras generar ticket). */
  openDrawerOrders: () => void;
  /** Solo cambia a vista órdenes (el drawer ya está abierto). */
  switchDrawerToOrders: () => void;
  /** Vuelve al carrito sin cerrar el panel. */
  switchDrawerToCart: () => void;
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
  /** Consulta en pipeline (un pedido activo por cuenta): el carrito se fusiona en ese ticket al sincronizar. */
  blockingPipelineOrder: { id: number; orderNumber: string; ticketCode: string } | null;
  /** Refresca el bloqueo desde el servidor (tras cancelar orden, etc.). */
  refreshActiveOrderGate: () => Promise<void>;
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
    ...(Number.isFinite(Number(l.hashrateSharePct)) && Number(l.hashrateSharePct) >= 1 && Number(l.hashrateSharePct) <= 100
      ? { hashrateSharePct: Math.round(Number(l.hashrateSharePct)) }
      : {}),
    ...(Number.isFinite(Number(l.hashrateWarrantyPct)) && Number(l.hashrateWarrantyPct) >= 0 && Number(l.hashrateWarrantyPct) <= 100
      ? { hashrateWarrantyPct: Math.round(Number(l.hashrateWarrantyPct)) }
      : {}),
    ...(Number.isFinite(Number(l.hashrateSetupUsd)) && Number(l.hashrateSetupUsd) >= 0
      ? { hashrateSetupUsd: Math.round(Number(l.hashrateSetupUsd)) }
      : {}),
    includeSetup: l.includeSetup,
    includeWarranty: l.includeWarranty,
  }));
}

function cartLinesMergeSig(ls: QuoteCartLine[]): string {
  const rows = [...ls].sort((a, b) => quoteCartLineKey(a).localeCompare(quoteCartLineKey(b)));
  return JSON.stringify(
    rows.map((l) => ({
      k: quoteCartLineKey(l),
      q: l.qty,
      s: l.includeSetup,
      w: l.includeWarranty,
      p: l.priceUsd,
    }))
  );
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
  const [drawerSubView, setDrawerSubView] = useState<MarketplaceCartDrawerSubView>("cart");
  const [ticketRef, setTicketRef] = useState<QuoteTicketRef | null>(null);
  const [blockingPipelineOrder, setBlockingPipelineOrder] = useState<{
    id: number;
    orderNumber: string;
    ticketCode: string;
  } | null>(null);
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [garantiaQuoteItems, setGarantiaQuoteItems] = useState<GarantiaQuotePriceItem[]>([]);

  /** Quién tenía carrito “de cuenta” en el render anterior (cliente / admin con carrito marketplace). */
  const prevMarketplaceCartUserIdRef = useRef<number | null>(null);
  /** Evita hidratar el mismo ticket en pipeline más de una vez por id (Strict Mode / re-renders). */
  const pipelineHydratedForIdRef = useRef<number | null>(null);
  /** Tras generar consulta (carrito vacío): no enviar clearPipelineCart al servidor (evitaría borrar el ticket recién creado). */
  const skipEmptyPipelineSyncRef = useRef(false);

  const refreshActiveOrderGate = useCallback(async () => {
    if (!canUseQuoteCart || !user) {
      setBlockingPipelineOrder(null);
      return;
    }
    if (!enforceSingleMarketplaceOrderForRole(user.role)) {
      setBlockingPipelineOrder(null);
      return;
    }
    try {
      const { tickets } = await getMyMarketplaceQuoteTickets();
      const b = pickBlockingPipelineTicket(tickets);
      setBlockingPipelineOrder(
        b
          ? {
              id: b.id,
              orderNumber: b.orderNumber ?? "",
              ticketCode: b.ticketCode,
            }
          : null
      );
    } catch {
      setBlockingPipelineOrder(null);
    }
  }, [canUseQuoteCart, user?.id, user?.role]);

  useEffect(() => {
    if (loading || !canUseQuoteCart) return;
    void refreshActiveOrderGate();
  }, [loading, canUseQuoteCart, refreshActiveOrderGate]);

  useEffect(() => {
    const fn = () => void refreshActiveOrderGate();
    window.addEventListener(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT, fn);
    return () => window.removeEventListener(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT, fn);
  }, [refreshActiveOrderGate]);

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
    let cancelled = false;
    void getMarketplaceGarantiaQuotePrices()
      .then((r) => {
        if (cancelled) return;
        const items = Array.isArray(r.items) ? r.items : [];
        setGarantiaQuoteItems(
          items.filter(
            (x) =>
              x &&
              typeof x.codigo === "string" &&
              typeof x.marca === "string" &&
              typeof x.modelo === "string" &&
              Number.isFinite(Number(x.precioGarantia)) &&
              Number(x.precioGarantia) >= 0
          ) as GarantiaQuotePriceItem[]
        );
      })
      .catch(() => {
        /* fallback 200 USD en lógica de carrito */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const prevCartUserId = prevMarketplaceCartUserIdRef.current;
    const cartUserId = user && canUseMarketplaceQuoteCart(user.role) ? user.id : null;

    /* Cerró sesión: no mostrar el carrito de la cuenta. Sigue guardado solo en la clave del usuario (_u{id}). */
    if (prevCartUserId != null && cartUserId == null) {
      writeQuoteCartToStorageKey(QUOTE_CART_GUEST_KEY, []);
      setLines([]);
      if (!canUseQuoteCart) setTicketRef(null);
      prevMarketplaceCartUserIdRef.current = cartUserId;
      return;
    }

    setLines(readQuoteCartFromStorageKey(storageKey));
    if (!canUseQuoteCart) setTicketRef(null);
    prevMarketplaceCartUserIdRef.current = cartUserId;
  }, [loading, storageKey, canUseQuoteCart, user?.id, user?.role]);

  useEffect(() => {
    if (loading) return;
    writeQuoteCartToStorageKey(storageKey, lines);
  }, [lines, storageKey, loading]);

  const totalUnits = useMemo(() => quoteCartTotalUnits(lines), [lines]);

  useEffect(() => {
    pipelineHydratedForIdRef.current = null;
  }, [user?.id]);

  /**
   * Con orden en pipeline: traer ítems del ticket al carrito para que el usuario vea y edite el pedido completo
   * antes de sumar otro producto (misma regla de fusión que el servidor).
   */
  useEffect(() => {
    if (!canUseQuoteCart || loading) {
      if (!blockingPipelineOrder) pipelineHydratedForIdRef.current = null;
      return;
    }
    if (!blockingPipelineOrder) {
      pipelineHydratedForIdRef.current = null;
      return;
    }
    const bid = blockingPipelineOrder.id;
    if (pipelineHydratedForIdRef.current === bid) return;

    let cancelled = false;
    void (async () => {
      try {
        const { ticket } = await getMyMarketplaceQuoteTicket(bid);
        const fromServer = quoteCartLinesFromApiPayload(ticket.items as unknown[]);
        if (cancelled) return;
        if (fromServer.length === 0) {
          pipelineHydratedForIdRef.current = bid;
          return;
        }
        setLines((prev) => mergeCartLinesForPipelineOrder(fromServer, prev));
        pipelineHydratedForIdRef.current = bid;
      } catch {
        /* sin marcar id: se reintenta si cambia el gate o el usuario navega */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blockingPipelineOrder, canUseQuoteCart, loading]);

  useEffect(() => {
    if (!canUseQuoteCart) {
      return;
    }
    const isEmpty = lines.length === 0;
    if (isEmpty) {
      setTicketRef(null);
      /** Sin orden en pipeline no hace falta POST vacío aquí (clearCart ya llama a la API). */
      if (blockingPipelineOrder?.id == null) {
        return;
      }
      if (skipEmptyPipelineSyncRef.current) {
        skipEmptyPipelineSyncRef.current = false;
        return;
      }
    }
    const delayMs = blockingPipelineOrder?.id != null ? 420 : 880;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await syncMarketplaceQuoteTicket({
            lines: linesToPayload(lines),
            event: "sync",
            ...(isEmpty ? { clearPipelineCart: true as const } : {}),
          });
          if (res.orderNumber && res.ticketCode) {
            setTicketRef({ orderNumber: res.orderNumber, ticketCode: res.ticketCode });
          }
          if (res.merged && Array.isArray(res.lines)) {
            const next = quoteCartLinesFromApiPayload(res.lines);
            setLines((prev) => (cartLinesMergeSig(prev) === cartLinesMergeSig(next) ? prev : next));
            window.dispatchEvent(new CustomEvent(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT));
          }
        } catch (e) {
          if (isOneActiveOrderError(e)) void refreshActiveOrderGate();
        }
      })();
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [lines, canUseQuoteCart, refreshActiveOrderGate, blockingPipelineOrder?.id]);

  const openDrawer = useCallback(() => {
    setDrawerSubView("cart");
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerSubView("cart");
    setDrawerOpen(false);
  }, []);
  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => {
      const next = !prev;
      if (next) setDrawerSubView("cart");
      else setDrawerSubView("cart");
      return next;
    });
  }, []);
  const openDrawerOrders = useCallback(() => {
    setDrawerSubView("orders");
    setDrawerOpen(true);
  }, []);
  const switchDrawerToOrders = useCallback(() => setDrawerSubView("orders"), []);
  const switchDrawerToCart = useCallback(() => setDrawerSubView("cart"), []);

  const addProduct = useCallback((product: AsicProduct, qty = 1, opts?: AddQuoteLineOptions) => {
    setLines((prev) => mergeAddLine(prev, product, qty, opts));
    playMarketplaceCartItemAddedSound();
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
    let removed = false;
    setLines((prev) => {
      const next = prev.filter((l) => quoteCartLineKey(l) !== lineKey);
      removed = next.length < prev.length;
      return next;
    });
    if (removed) playMarketplaceCartItemRemovedSound();
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
    if (!canUseQuoteCart) return;
    void (async () => {
      try {
        /** Con orden en pipeline el effect de sync envía `[]` al servidor (evita doble POST). */
        if (blockingPipelineOrder?.id != null) return;
        await syncMarketplaceQuoteTicket({ lines: [], event: "sync", clearPipelineCart: true });
      } catch {
        /* ignore */
      }
    })();
  }, [canUseQuoteCart, blockingPipelineOrder?.id]);

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
      garantiaItems: garantiaQuoteItems,
    });
    const unitCount = quoteCartTotalUnits(lines);
    const lineCount = lines.length;
    const payload = linesToPayload(lines);
    let r: Awaited<ReturnType<typeof syncMarketplaceQuoteTicket>>;
    try {
      r = await syncMarketplaceQuoteTicket({ lines: payload, event: "submit_ticket" });
    } catch (e) {
      if (isOneActiveOrderError(e)) void refreshActiveOrderGate();
      throw e;
    }
    if (!r.orderNumber || !r.ticketCode || r.id == null) {
      throw new Error("No se pudo registrar el ticket. Probá de nuevo.");
    }
    if (r.merged && Array.isArray(r.lines)) {
      const next = quoteCartLinesFromApiPayload(r.lines);
      setLines(next);
      setTicketRef({ orderNumber: r.orderNumber, ticketCode: r.ticketCode });
      void refreshActiveOrderGate();
      window.dispatchEvent(new CustomEvent(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT));
      return {
        id: r.id,
        orderNumber: r.orderNumber,
        ticketCode: r.ticketCode,
        status: r.status ?? "enviado_consulta",
        subtotalUsd:
          r.subtotalUsd ??
          quoteCartSubtotalUsd(next, {
            setupEquipoCompletoUsd,
            setupCompraHashrateUsd,
            garantiaItems: garantiaQuoteItems,
          }),
        unitCount: r.unitCount ?? quoteCartTotalUnits(next),
        lineCount: r.lineCount ?? next.length,
      };
    }
    /** No llamar quote-sync vacío: el servidor vaciaba la orden en pipeline recién creada. */
    skipEmptyPipelineSyncRef.current = true;
    setLines([]);
    setTicketRef(null);
    void refreshActiveOrderGate();
    return {
      id: r.id,
      orderNumber: r.orderNumber,
      ticketCode: r.ticketCode,
      status: r.status ?? "enviado_consulta",
      subtotalUsd,
      unitCount,
      lineCount,
    };
  }, [canUseQuoteCart, lines, setupEquipoCompletoUsd, setupCompraHashrateUsd, garantiaQuoteItems, refreshActiveOrderGate]);

  const openQuoteEmail = useCallback(async () => {
    let ref: QuoteTicketRef | undefined;
    let mailLines = lines;
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
        if (r.merged && Array.isArray(r.lines)) {
          const next = quoteCartLinesFromApiPayload(r.lines);
          setLines((prev) => (cartLinesMergeSig(prev) === cartLinesMergeSig(next) ? prev : next));
          mailLines = next;
          window.dispatchEvent(new CustomEvent(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT));
        }
      }
    } catch (e) {
      if (isOneActiveOrderError(e)) {
        void refreshActiveOrderGate();
        throw e;
      }
      /* mailto igual */
    }
    window.location.href = buildQuoteMailto(mailLines, ref, {
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
      garantiaItems: garantiaQuoteItems,
    });
  }, [lines, canUseQuoteCart, setupEquipoCompletoUsd, setupCompraHashrateUsd, garantiaQuoteItems, refreshActiveOrderGate]);

  const openQuoteWhatsApp = useCallback(async () => {
    let ref: QuoteTicketRef | undefined;
    let waLines = lines;
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
        if (r.merged && Array.isArray(r.lines)) {
          const next = quoteCartLinesFromApiPayload(r.lines);
          setLines((prev) => (cartLinesMergeSig(prev) === cartLinesMergeSig(next) ? prev : next));
          waLines = next;
          window.dispatchEvent(new CustomEvent(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT));
        }
      }
    } catch (e) {
      if (isOneActiveOrderError(e)) {
        void refreshActiveOrderGate();
        throw e;
      }
      /* seguimos */
    }
    window.open(
      buildQuoteWhatsAppUrl(waLines, ref, {
        setupEquipoCompletoUsd,
        setupCompraHashrateUsd,
        garantiaItems: garantiaQuoteItems,
      }),
      "_blank",
      "noopener,noreferrer"
    );
  }, [lines, canUseQuoteCart, setupEquipoCompletoUsd, setupCompraHashrateUsd, garantiaQuoteItems, refreshActiveOrderGate]);

  const value = useMemo<Ctx>(
    () => ({
      lines,
      totalUnits,
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
      garantiaQuoteItems,
      drawerOpen,
      drawerSubView,
      canUseQuoteCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      openDrawerOrders,
      switchDrawerToOrders,
      switchDrawerToCart,
      addProduct,
      setLineQty,
      removeLine,
      setLineAddons,
      clearCart,
      ticketRef,
      submitConsultationTicket,
      openQuoteEmail,
      openQuoteWhatsApp,
      blockingPipelineOrder,
      refreshActiveOrderGate,
    }),
    [
      lines,
      totalUnits,
      setupEquipoCompletoUsd,
      setupCompraHashrateUsd,
      garantiaQuoteItems,
      drawerOpen,
      drawerSubView,
      canUseQuoteCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      openDrawerOrders,
      switchDrawerToOrders,
      switchDrawerToCart,
      addProduct,
      setLineQty,
      removeLine,
      setLineAddons,
      clearCart,
      ticketRef,
      submitConsultationTicket,
      openQuoteEmail,
      openQuoteWhatsApp,
      blockingPipelineOrder,
      refreshActiveOrderGate,
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
