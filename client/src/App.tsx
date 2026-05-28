import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProtectedAppLayout } from "./components/ProtectedAppLayout";
import { LoginPage } from "./pages/LoginPage";
import { FacturacionPage } from "./pages/FacturacionPage";
import { FacturacionMineriaPage } from "./pages/FacturacionMineriaPage";
import { HostingHubPage } from "./pages/HostingHubPage";
import { GestionAdministrativaPage } from "./pages/GestionAdministrativaPage";
import { LeadsBasePage } from "./pages/LeadsBasePage";
import { NuevosLeadsPage } from "./pages/NuevosLeadsPage";
import { PruebaPage } from "./pages/PruebaPage";
import { CambioUsdtHubPage } from "./pages/CambioUsdtHubPage";
import { FxExchangeClientsPage } from "./pages/FxExchangeClientsPage";
import { FxExchangeClienteEditPage } from "./pages/FxExchangeClienteEditPage";
import { GestionFinancieraHubPage } from "./pages/GestionFinancieraHubPage";
import { ProveedoresHrsPage } from "./pages/ProveedoresHrsPage";
import { ContabilidadGastosPage } from "./pages/ContabilidadGastosPage";
import { MonitorFinancieroPage } from "./pages/MonitorFinancieroPage";
import { FacturasMesHostingPage } from "./pages/FacturasMesHostingPage";
import { HostingExchangeOperationsPage } from "./pages/HostingExchangeOperationsPage";
import { HostingTipoCambioHistorialPage } from "./pages/HostingTipoCambioHistorialPage";
import { MineriaHubPage } from "./pages/MineriaHubPage";
import { MonitorEquiposAsicPage } from "./pages/MonitorEquiposAsicPage";
import { MonitorEquiposAsicBajasPage } from "./pages/MonitorEquiposAsicBajasPage";
import { AsicCotizadorChinaPyPage } from "./pages/AsicCotizadorChinaPyPage";
import { HistorialPage } from "./pages/HistorialPage";
import { HistorialMineriaPage } from "./pages/HistorialMineriaPage";
import { PendientesPage } from "./pages/PendientesPage";
import { PendientesMineriaPage } from "./pages/PendientesMineriaPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ClienteEditPage } from "./pages/ClienteEditPage";
import { EquiposAsicPage } from "./pages/EquiposAsicPage";
import { TiendaOnlineBannersHomePage } from "./pages/TiendaOnlineBannersHomePage";
import { SetupPage } from "./pages/SetupPage";
import { ReparacionPage } from "./pages/ReparacionPage";
import { ReportesPage } from "./pages/ReportesPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { ConfiguracionPage } from "./pages/ConfiguracionPage";
import { TransporteFletesPage } from "./pages/TransporteFletesPage";
import { ClientesTiendaOnlinePage } from "./pages/ClientesTiendaOnlinePage";
import { ClientesHubPage } from "./pages/ClientesHubPage";
import { CotizacionesMarketplacePage } from "./pages/CotizacionesMarketplacePage";
import { CotizacionesMarketplaceHistorialDetallePage } from "./pages/CotizacionesMarketplaceHistorialDetallePage";
import { GarantiaAndePage } from "./pages/GarantiaAndePage";
import { GarantiasAndeItemsPage } from "./pages/GarantiasAndeItemsPage";
import { GarantiaAndeItemNewPage } from "./pages/GarantiaAndeItemNewPage";
import { HistorialGarantiasPage } from "./pages/HistorialGarantiasPage";
import { KryptexPage } from "./pages/KryptexPage";
import { KryptexDetallePage } from "./pages/KryptexDetallePage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { MarketplaceCorporateHomePage } from "./pages/MarketplaceCorporateHomePage";
import { MarketplaceServicesPage } from "./pages/MarketplaceServicesPage";
import { MarketplaceCompanyPage } from "./pages/MarketplaceCompanyPage";
import { MarketplaceFaqPage } from "./pages/MarketplaceFaqPage";
import { MarketplaceContactPage } from "./pages/MarketplaceContactPage";
import { MarketplaceAsicEmailInquiryPage } from "./pages/MarketplaceAsicEmailInquiryPage";
import { MarketplaceClienteLoginPage } from "./pages/MarketplaceClienteLoginPage";
import { MarketplaceClienteRegistroPage } from "./pages/MarketplaceClienteRegistroPage";
import { MarketplacePresencePage } from "./pages/MarketplacePresencePage";
import { MarketplacePresenceHistorialPage } from "./pages/MarketplacePresenceHistorialPage";
import { PasswordResetPage } from "./pages/PasswordResetPage";
import { AccountActivatePage } from "./pages/AccountActivatePage";
import { CuentaClientePage } from "./pages/CuentaClientePage";
import { CuentaClienteDetallePage } from "./pages/CuentaClienteDetallePage";
import { ToastContainer } from "./components/ToastNotification";
import { ScrollToTop } from "./components/ScrollToTop";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import { MarketplaceLanguageProvider } from "./contexts/MarketplaceLanguageContext";
import { MarketplaceQuoteCartProvider, useMarketplaceQuoteCart } from "./contexts/MarketplaceQuoteCartContext";
import { MarketplaceQuoteCartDrawer } from "./components/marketplace/MarketplaceQuoteCartDrawer";
import { LegacyWpLangRedirect } from "./components/marketplace/LegacyWpLangRedirect";
import { RootIndex } from "./components/RootIndex";
import { getStoredUser } from "./lib/auth";
import { postMarketplacePresenceHeartbeat, type MarketplacePresenceViewerType } from "./lib/api";
import { getBrowserHostname, isPrimaryPublicHost } from "./lib/hashrateHosts";
import { isMarketplacePublicPath, MARKETPLACE, mpHome, SGI_DASHBOARD_PATH, sgiHome } from "./lib/marketplacePaths";
import { HomePage } from "./pages/HomePage";
import { getMarketplaceAsicVitrina, getMarketplaceCorpHomeSections } from "./lib/api";
import { clearMarketplaceCorpHomeCache } from "./lib/marketplaceCorpHomeCache";
import { clearMarketplaceVitrinaCache } from "./lib/marketplaceVitrinaCache";

const MARKETPLACE_PRESENCE_VISITOR_KEY = "hrs_marketplace_presence_visitor_id";
const MARKETPLACE_PRESENCE_COUNTRY_CACHE_KEY = "hrs_marketplace_presence_country_v1";

function getMarketplacePresenceVisitorId(): string {
  const fallback = `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const found = localStorage.getItem(MARKETPLACE_PRESENCE_VISITOR_KEY)?.trim();
    if (found && found.length >= 8) return found;
    localStorage.setItem(MARKETPLACE_PRESENCE_VISITOR_KEY, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

function resolveMarketplaceViewerType(): MarketplacePresenceViewerType {
  const role = String(getStoredUser()?.role ?? "").toLowerCase().trim();
  if (role === "cliente") return "cliente";
  if (role === "admin_a" || role === "admin_b" || role === "operador" || role === "lector") return "staff";
  return "anon";
}

function getBrowserCountryInfo(): { countryCode: string; countryName: string } {
  try {
    const locale =
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      "";
    const m = locale.match(/[-_]([A-Za-z]{2})$/);
    const cc = (m?.[1] || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return { countryCode: "", countryName: "" };
    let countryName = cc;
    try {
      const dn = new Intl.DisplayNames(["es"], { type: "region" });
      countryName = dn.of(cc) || cc;
    } catch {
      countryName = cc;
    }
    return { countryCode: cc, countryName };
  } catch {
    return { countryCode: "", countryName: "" };
  }
}

let countryByIpPromise: Promise<{ countryCode: string; countryName: string }> | null = null;
let publicIpPromise: Promise<string> | null = null;

function isValidCountryCode(cc: string): boolean {
  return /^[A-Z]{2}$/.test(String(cc || "").trim().toUpperCase());
}

function sanitizeCountryCodeForPayload(cc: string): string | undefined {
  const code = String(cc || "").trim().toUpperCase();
  if (!isValidCountryCode(code)) return undefined;
  if (code === "UN" || code === "LO") return undefined;
  return code;
}

function countryFromLocaleOrTimezone(): { countryCode: string; countryName: string } {
  const tz = String(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  const tzToCountry: Record<string, string> = {
    "America/Asuncion": "PY",
    "America/Montevideo": "UY",
    "America/Argentina/Buenos_Aires": "AR",
    "America/Sao_Paulo": "BR",
    "America/Santiago": "CL",
    "America/Lima": "PE",
    "America/Bogota": "CO",
    "America/La_Paz": "BO",
    "America/Mexico_City": "MX",
    "America/New_York": "US",
    "Europe/Madrid": "ES",
    "Europe/Lisbon": "PT",
  };
  const cc = tzToCountry[tz] || "";
  if (isValidCountryCode(cc)) {
    let name = cc;
    try {
      const dn = new Intl.DisplayNames(["es"], { type: "region" });
      name = dn.of(cc) || cc;
    } catch {
      name = cc;
    }
    return { countryCode: cc, countryName: name };
  }

  // Fallback secundario: locale del navegador (menos confiable que timezone)
  const byLocale = getBrowserCountryInfo();
  if (isValidCountryCode(byLocale.countryCode)) return byLocale;
  return { countryCode: "", countryName: "" };
}

async function getCountryByPublicIp(): Promise<{ countryCode: string; countryName: string }> {
  if (countryByIpPromise) return countryByIpPromise;
  countryByIpPromise = (async () => {
    try {
      const cachedRaw = localStorage.getItem(MARKETPLACE_PRESENCE_COUNTRY_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { countryCode?: string; countryName?: string; exp?: number };
        if (
          typeof cached.exp === "number" &&
          cached.exp > Date.now() &&
          isValidCountryCode(String(cached.countryCode || "")) &&
          String(cached.countryName || "").trim()
        ) {
          return {
            countryCode: String(cached.countryCode).toUpperCase(),
            countryName: String(cached.countryName).trim(),
          };
        }
      }
    } catch {
      /* ignore cache read */
    }

    const fallback = countryFromLocaleOrTimezone();
    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch("https://ipwho.is/?fields=success,country,country_code", { signal: controller.signal });
      const data = (await r.json()) as { success?: boolean; country?: string; country_code?: string };
      const cc = String(data?.country_code ?? "").trim().toUpperCase();
      const countryCode = isValidCountryCode(cc) ? cc : fallback.countryCode;
      const countryName = String(data?.country ?? "").trim() || fallback.countryName || countryCode || "";
      const out = { countryCode, countryName };
      if (isValidCountryCode(countryCode) && countryName.trim()) {
        try {
          localStorage.setItem(
            MARKETPLACE_PRESENCE_COUNTRY_CACHE_KEY,
            JSON.stringify({ countryCode, countryName, exp: Date.now() + 24 * 60 * 60 * 1000 })
          );
        } catch {
          /* ignore cache write */
        }
      }
      return out;
    } catch {
      try {
        const r2 = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        const d2 = (await r2.json()) as { country_code?: string; country_name?: string };
        const cc2 = String(d2?.country_code ?? "").trim().toUpperCase();
        const countryCode = isValidCountryCode(cc2) ? cc2 : fallback.countryCode;
        const countryName = String(d2?.country_name ?? "").trim() || fallback.countryName || countryCode || "";
        const out = { countryCode, countryName };
        if (isValidCountryCode(countryCode) && countryName.trim()) {
          try {
            localStorage.setItem(
              MARKETPLACE_PRESENCE_COUNTRY_CACHE_KEY,
              JSON.stringify({ countryCode, countryName, exp: Date.now() + 24 * 60 * 60 * 1000 })
            );
          } catch {
            /* ignore cache write */
          }
        }
        return out;
      } catch {
        return fallback;
      }
    } finally {
      window.clearTimeout(t);
    }
  })();
  return countryByIpPromise;
}

async function getPublicIpAddress(): Promise<string> {
  if (publicIpPromise) return publicIpPromise;
  publicIpPromise = (async () => {
    try {
      const ac = new AbortController();
      const t = window.setTimeout(() => ac.abort(), 3000);
      const r = await fetch("https://api.ipify.org?format=json", { signal: ac.signal });
      window.clearTimeout(t);
      const d = (await r.json()) as { ip?: string };
      return String(d?.ip || "").trim();
    } catch {
      return "";
    }
  })();
  return publicIpPromise;
}

function MarketplacePresenceBeacon() {
  const location = useLocation();
  useEffect(() => {
    if (!isMarketplacePublicPath(location.pathname)) return;
    const visitorId = getMarketplacePresenceVisitorId();
    const currentPath = `${location.pathname}${location.search ?? ""}`.slice(0, 200);
    const viewerType = resolveMarketplaceViewerType();
    const authUser = getStoredUser();
    const userEmail =
      viewerType === "anon" ? "" : String(authUser?.email || authUser?.username || "").trim().toLowerCase();
    const browserCountry = countryFromLocaleOrTimezone();
    const locale = navigator.language || "";
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    let cancelled = false;
    const sendBeat = async () => {
      if (cancelled) return;
      // 1) Enviar de inmediato con timezone/locale para no depender de APIs externas.
      await postMarketplacePresenceHeartbeat({
        visitorId,
        viewerType,
        userEmail: userEmail || undefined,
        countryCode: sanitizeCountryCodeForPayload(browserCountry.countryCode),
        countryName: (browserCountry.countryName || "").trim() || undefined,
        locale,
        timezone,
        currentPath,
      });

      // 2) Enriquecer con IP pública/geo cuando esté disponible.
      const [ipCountry, clientIp] = await Promise.all([
        getCountryByPublicIp().catch(() => browserCountry),
        getPublicIpAddress().catch(() => ""),
      ]);
      if (cancelled) return;
      await postMarketplacePresenceHeartbeat({
        visitorId,
        viewerType,
        userEmail: userEmail || undefined,
        countryCode: sanitizeCountryCodeForPayload(ipCountry.countryCode || browserCountry.countryCode),
        countryName: (ipCountry.countryName || browserCountry.countryName || "").trim() || undefined,
        clientIp: clientIp.trim() || undefined,
        locale,
        timezone,
        currentPath,
      });
    };
    void sendBeat();
    const intervalId = window.setInterval(() => {
      void sendBeat();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sendBeat();
    };
    const onFocus = () => void sendBeat();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [location.pathname, location.search]);
  return null;
}

/** Cierra el drawer del carrito en login/registro para no tapar ni mezclar blur con el formulario. */
function MarketplaceCloseCartOnAuthRoute() {
  const { pathname } = useLocation();
  const { closeDrawer } = useMarketplaceQuoteCart();
  useEffect(() => {
    const p = pathname.replace(/\/+$/, "") || "/";
    if (p === MARKETPLACE.clientLogin || p === MARKETPLACE.clientSignup) {
      closeDrawer();
    }
  }, [pathname, closeDrawer]);
  return null;
}

/** Outlet para anidar /marketplace, /marketplace/login, /marketplace/signup (matching estable en RR7). */
function MarketplaceLayout() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (user) {
      clearMarketplaceVitrinaCache();
      clearMarketplaceCorpHomeCache();
    }
    void getMarketplaceAsicVitrina().catch(() => {});
    void getMarketplaceCorpHomeSections().catch(() => {});
  }, [loading, user?.id]);
  return (
    <MarketplaceLanguageProvider>
      <MarketplaceQuoteCartProvider>
        <MarketplaceCloseCartOnAuthRoute />
        <MarketplacePresenceBeacon />
        <Outlet />
        <MarketplaceQuoteCartDrawer />
      </MarketplaceQuoteCartProvider>
    </MarketplaceLanguageProvider>
  );
}

function AppNotFoundRedirect() {
  if (isPrimaryPublicHost(getBrowserHostname())) {
    return <Navigate to={mpHome()} replace />;
  }
  return <Navigate to={sgiHome()} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <GoogleAnalytics />
        <ToastContainer />
        <Routes>
          {/* URLs legacy WordPress: /en/, /es/, /pt/ */}
          <Route path="/en/*" element={<LegacyWpLangRedirect lang="en" />} />
          <Route path="/en" element={<LegacyWpLangRedirect lang="en" />} />
          <Route path="/es/*" element={<LegacyWpLangRedirect lang="es" />} />
          <Route path="/es" element={<LegacyWpLangRedirect lang="es" />} />
          <Route path="/pt/*" element={<LegacyWpLangRedirect lang="pt" />} />
          <Route path="/pt" element={<LegacyWpLangRedirect lang="pt" />} />
          <Route path="/" element={<RootIndex />} />
          {/* Sitio público (sin /marketplace en la URL) */}
          <Route element={<MarketplaceLayout />}>
            <Route path="/home" element={<MarketplaceCorporateHomePage />} />
            <Route path={MARKETPLACE.services} element={<MarketplaceServicesPage />} />
            <Route path={MARKETPLACE.company} element={<MarketplaceCompanyPage />} />
            <Route path={MARKETPLACE.faq} element={<MarketplaceFaqPage />} />
            <Route path={MARKETPLACE.contact} element={<MarketplaceContactPage />} />
            <Route path={MARKETPLACE.catalog} element={<MarketplacePage />} />
            <Route path={MARKETPLACE.emailInquiry} element={<MarketplaceAsicEmailInquiryPage />} />
            <Route path={MARKETPLACE.emailInquiryCart} element={<MarketplaceAsicEmailInquiryPage />} />
            <Route path={MARKETPLACE.clientLogin} element={<MarketplaceClienteLoginPage />} />
            <Route path={MARKETPLACE.clientSignup} element={<MarketplaceClienteRegistroPage />} />
          </Route>
          {/* Redirects legacy /marketplace/* */}
          <Route path="/marketplace" element={<Navigate to={MARKETPLACE.catalog} replace />} />
          <Route path="/marketplace/" element={<Navigate to={MARKETPLACE.catalog} replace />} />
          <Route path="/marketplace/home" element={<Navigate to={mpHome()} replace />} />
          <Route path="/marketplace/home/" element={<Navigate to={mpHome()} replace />} />
          <Route path="/marketplace/services" element={<Navigate to={MARKETPLACE.services} replace />} />
          <Route path="/marketplace/services/" element={<Navigate to={MARKETPLACE.services} replace />} />
          <Route path="/marketplace/company" element={<Navigate to={MARKETPLACE.company} replace />} />
          <Route path="/marketplace/company/" element={<Navigate to={MARKETPLACE.company} replace />} />
          <Route path="/marketplace/faq" element={<Navigate to={MARKETPLACE.faq} replace />} />
          <Route path="/marketplace/faq/" element={<Navigate to={MARKETPLACE.faq} replace />} />
          <Route path="/marketplace/contact" element={<Navigate to={MARKETPLACE.contact} replace />} />
          <Route path="/marketplace/contact/" element={<Navigate to={MARKETPLACE.contact} replace />} />
          <Route path="/marketplace/login" element={<Navigate to={MARKETPLACE.clientLogin} replace />} />
          <Route path="/marketplace/login/" element={<Navigate to={MARKETPLACE.clientLogin} replace />} />
          <Route path="/marketplace/acceso" element={<Navigate to={MARKETPLACE.clientLogin} replace />} />
          <Route path="/marketplace/signup" element={<Navigate to={MARKETPLACE.clientSignup} replace />} />
          <Route path="/marketplace/signup/" element={<Navigate to={MARKETPLACE.clientSignup} replace />} />
          <Route path="/marketplace/registro" element={<Navigate to={MARKETPLACE.clientSignup} replace />} />
          <Route path="/marketplace/consultar-correo" element={<Navigate to={MARKETPLACE.emailInquiry} replace />} />
          <Route path="/marketplace/consultar-correo-carrito" element={<Navigate to={MARKETPLACE.emailInquiryCart} replace />} />
          <Route path="/marketplace/mis-ordenes" element={<Navigate to={MARKETPLACE.catalog} replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<PasswordResetPage />} />
          <Route path={MARKETPLACE.activateAccount} element={<AccountActivatePage />} />
          {/* Legacy ES → EN (URLs públicas tienda) */}
          <Route path="/activar-cuenta" element={<Navigate to={MARKETPLACE.activateAccount} replace />} />
          <Route path="/acceso" element={<Navigate to={MARKETPLACE.clientLogin} replace />} />
          <Route path="/registro" element={<Navigate to={MARKETPLACE.clientSignup} replace />} />
          <Route path="/consultar-correo" element={<Navigate to={MARKETPLACE.emailInquiry} replace />} />
          <Route path="/consultar-correo-carrito" element={<Navigate to={MARKETPLACE.emailInquiryCart} replace />} />
          <Route element={<ProtectedRoute><ProtectedAppLayout /></ProtectedRoute>}>
            <Route path={SGI_DASHBOARD_PATH} element={<HomePage />} />
            <Route path="/kryptex" element={<KryptexPage />} />
            <Route path="/kryptex/detalle" element={<KryptexDetallePage />} />
            <Route path="/asic/equipment" element={<EquiposAsicPage />} />
            <Route path="/marketplace/home-banners" element={<TiendaOnlineBannersHomePage />} />
            <Route path="/gestion-administrativa" element={<GestionAdministrativaPage />} />
            <Route path="/gestion-administrativa/nuevos-leads" element={<NuevosLeadsPage />} />
            <Route path="/gestion-administrativa/leads-base" element={<LeadsBasePage />} />
            <Route path="/gestion-administrativa/cambio-usdt" element={<CambioUsdtHubPage />} />
            <Route path="/gestion-administrativa/cambio-usdt/clientes" element={<FxExchangeClientsPage />} />
            <Route
              path="/gestion-administrativa/cambio-usdt/clientes/:id/edit"
              element={<FxExchangeClienteEditPage />}
            />
            <Route path="/gestion-administrativa/exchange" element={<PruebaPage />} />
            <Route path="/gestion-administrativa/prueba" element={<Navigate to="/gestion-administrativa/exchange" replace />} />
            <Route path="/gestion-financiera" element={<GestionFinancieraHubPage />} />
            <Route path="/gestion-financiera/proveedores" element={<ProveedoresHrsPage />} />
            <Route path="/gestion-financiera/contabilidad" element={<ContabilidadGastosPage />} />
            <Route path="/gestion-financiera/monitor-financiero" element={<MonitorFinancieroPage />} />
            <Route path="/hosting" element={<HostingHubPage />} />
            <Route path="/hosting/email-flow" element={<FacturasMesHostingPage />} />
            <Route path="/hosting/exchange-operations" element={<HostingExchangeOperationsPage />} />
            <Route path="/hosting/tipo-cambio-historial" element={<HostingTipoCambioHistorialPage />} />
            <Route path="/hosting/billing" element={<FacturacionPage />} />
            <Route path="/history" element={<HistorialPage />} />
            <Route path="/hosting/history" element={<HistorialPage sourceFilter="hosting" />} />
            <Route path="/hosting/pending" element={<PendientesPage />} />
            <Route path="/asic/monitor-equipos" element={<MonitorEquiposAsicPage />} />
            <Route path="/asic/equipos-dados-de-baja" element={<MonitorEquiposAsicBajasPage />} />
            <Route path="/asic" element={<MineriaHubPage />} />
            <Route path="/asic/cotizador-china-py" element={<AsicCotizadorChinaPyPage />} />
            <Route path="/asic/setup" element={<SetupPage />} />
            <Route path="/asic/reparacion" element={<ReparacionPage />} />
            <Route path="/asic/ande-warranty" element={<GarantiaAndePage />} />
            <Route path="/asic/warranty-items" element={<GarantiasAndeItemsPage />} />
            <Route path="/asic/warranty-items/new" element={<GarantiaAndeItemNewPage />} />
            <Route path="/asic/warranties-history" element={<HistorialGarantiasPage />} />
            <Route path="/asic/billing" element={<FacturacionMineriaPage />} />
            <Route path="/asic/history" element={<HistorialMineriaPage />} />
            <Route path="/asic/pending" element={<PendientesMineriaPage />} />
            <Route path="/clients" element={<ClientesHubPage />} />
            <Route path="/clients/hosting" element={<ClientesPage />} />
            <Route path="/clients/account" element={<CuentaClientePage />} />
            <Route path="/clients/account/detail" element={<CuentaClienteDetallePage />} />
            <Route path="/clients/hosting/new" element={<Navigate to="/clients/hosting" replace />} />
            <Route path="/clients/hosting/:id/edit" element={<ClienteEditPage />} />
            <Route path="/reports" element={<ReportesPage />} />
            <Route path="/settings" element={<ConfiguracionPage />} />
            <Route path="/transporte-fletes" element={<TransporteFletesPage />} />
            <Route path="/clients/store" element={<ClientesTiendaOnlinePage />} />
            <Route path="/marketplace/orders/history-detail" element={<CotizacionesMarketplaceHistorialDetallePage />} />
            <Route path="/marketplace/orders" element={<CotizacionesMarketplacePage />} />
            <Route path="/marketplace/presence/history" element={<MarketplacePresenceHistorialPage />} />
            <Route path="/marketplace/presence" element={<MarketplacePresencePage />} />

            {/* Compatibilidad legacy ES -> EN */}
            <Route path="/marketplacedashboard" element={<Navigate to="/asic/equipment" replace />} />
            <Route path="/tienda-online-banners-home" element={<Navigate to="/marketplace/home-banners" replace />} />
            <Route path="/hosting/control-documentos-cobros" element={<Navigate to="/hosting/email-flow" replace />} />
            <Route path="/facturacion-hosting" element={<Navigate to="/hosting/billing" replace />} />
            <Route path="/historial" element={<Navigate to="/history" replace />} />
            <Route path="/historial-hosting" element={<Navigate to="/hosting/history" replace />} />
            <Route path="/pendientes-hosting" element={<Navigate to="/hosting/pending" replace />} />
            <Route path="/facturacion" element={<Navigate to="/hosting/billing" replace />} />
            <Route path="/pendientes" element={<Navigate to="/hosting/pending" replace />} />
            <Route path="/equipos-asic" element={<Navigate to="/asic" replace />} />
            <Route path="/equipos-asic/equipos" element={<Navigate to="/asic/equipment" replace />} />
            <Route path="/equipos-asic/equipos/nuevos" element={<Navigate to="/asic/equipment" replace />} />
            <Route path="/equipos-asic/setup" element={<Navigate to="/asic/setup" replace />} />
            <Route path="/equipos-asic/garantia-ande" element={<Navigate to="/asic/ande-warranty" replace />} />
            <Route path="/equipos-asic/items-garantia" element={<Navigate to="/asic/warranty-items" replace />} />
            <Route path="/equipos-asic/items-garantia/nuevo" element={<Navigate to="/asic/warranty-items/new" replace />} />
            <Route path="/equipos-asic/garantias-historial" element={<Navigate to="/asic/warranties-history" replace />} />
            <Route path="/mineria" element={<Navigate to="/asic" replace />} />
            <Route path="/facturacion-equipos" element={<Navigate to="/asic/billing" replace />} />
            <Route path="/historial-equipos" element={<Navigate to="/asic/history" replace />} />
            <Route path="/pendientes-equipos" element={<Navigate to="/asic/pending" replace />} />
            <Route path="/facturacion-mineria" element={<Navigate to="/asic/billing" replace />} />
            <Route path="/historial-mineria" element={<Navigate to="/asic/history" replace />} />
            <Route path="/pendientes-mineria" element={<Navigate to="/asic/pending" replace />} />
            <Route path="/clientes-hub" element={<Navigate to="/clients" replace />} />
            <Route path="/clientes" element={<Navigate to="/clients/hosting" replace />} />
            <Route path="/cuenta-cliente" element={<Navigate to="/clients/account" replace />} />
            <Route path="/cuenta-cliente/detalle" element={<CuentaClienteDetallePage />} />
            <Route path="/clientes/nuevo" element={<Navigate to="/clients/hosting/new" replace />} />
            <Route path="/clientes/:id/edit" element={<ClienteEditPage />} />
            <Route path="/reportes" element={<Navigate to="/reports" replace />} />
            <Route path="/configuracion" element={<Navigate to="/settings" replace />} />
            <Route path="/clientes-tienda-online" element={<Navigate to="/clients/store" replace />} />
            <Route path="/cotizaciones-marketplace/historial-detalle" element={<CotizacionesMarketplaceHistorialDetallePage />} />
            <Route path="/cotizaciones-marketplace" element={<Navigate to="/marketplace/orders" replace />} />
            <Route path="/marketplace-presencia/historial" element={<MarketplacePresenceHistorialPage />} />
            <Route path="/marketplace-presencia" element={<Navigate to="/marketplace/presence" replace />} />
            <Route path="/usuarios/*" element={<UsuariosPage />} />
          </Route>
          <Route path="*" element={<AppNotFoundRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
