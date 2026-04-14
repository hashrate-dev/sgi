import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProtectedAppLayout } from "./components/ProtectedAppLayout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { FacturacionPage } from "./pages/FacturacionPage";
import { FacturacionMineriaPage } from "./pages/FacturacionMineriaPage";
import { HostingHubPage } from "./pages/HostingHubPage";
import { FacturasMesHostingPage } from "./pages/FacturasMesHostingPage";
import { MineriaHubPage } from "./pages/MineriaHubPage";
import { HistorialPage } from "./pages/HistorialPage";
import { HistorialMineriaPage } from "./pages/HistorialMineriaPage";
import { PendientesPage } from "./pages/PendientesPage";
import { PendientesMineriaPage } from "./pages/PendientesMineriaPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ClienteEditPage } from "./pages/ClienteEditPage";
import { EquiposAsicPage } from "./pages/EquiposAsicPage";
import { SetupPage } from "./pages/SetupPage";
import { ReportesPage } from "./pages/ReportesPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { ConfiguracionPage } from "./pages/ConfiguracionPage";
import { ClientesTiendaOnlinePage } from "./pages/ClientesTiendaOnlinePage";
import { ClientesHubPage } from "./pages/ClientesHubPage";
import { CotizacionesMarketplacePage } from "./pages/CotizacionesMarketplacePage";
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
import { MarketplaceClienteLoginPage } from "./pages/MarketplaceClienteLoginPage";
import { MarketplaceClienteRegistroPage } from "./pages/MarketplaceClienteRegistroPage";
import { MarketplacePresencePage } from "./pages/MarketplacePresencePage";
import { CuentaClientePage } from "./pages/CuentaClientePage";
import { CuentaClienteDetallePage } from "./pages/CuentaClienteDetallePage";
import { ToastContainer } from "./components/ToastNotification";
import { ScrollToTop } from "./components/ScrollToTop";
import { MarketplaceLanguageProvider } from "./contexts/MarketplaceLanguageContext";
import { getStoredUser } from "./lib/auth";
import type { MarketplacePresenceViewerType } from "./lib/api";

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

async function sendMarketplacePresenceHeartbeat(payload: {
  visitorId: string;
  viewerType: MarketplacePresenceViewerType;
  countryCode?: string;
  countryName?: string;
  clientIp?: string;
  locale?: string;
  timezone?: string;
  currentPath: string;
}): Promise<void> {
  await fetch("/api/marketplace/presence/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "include",
  });
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
  const byLocale = getBrowserCountryInfo();
  if (isValidCountryCode(byLocale.countryCode)) return byLocale;

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
  if (!isValidCountryCode(cc)) return { countryCode: "", countryName: "" };
  let name = cc;
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    name = dn.of(cc) || cc;
  } catch {
    name = cc;
  }
  return { countryCode: cc, countryName: name };
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
    if (!location.pathname.startsWith("/marketplace")) return;
    const visitorId = getMarketplacePresenceVisitorId();
    const currentPath = `${location.pathname}${location.search ?? ""}`.slice(0, 200);
    const viewerType = resolveMarketplaceViewerType();
    const browserCountry = countryFromLocaleOrTimezone();
    let cancelled = false;
    const sendBeat = async () => {
      if (cancelled) return;
      const ipCountry = await getCountryByPublicIp().catch(() => browserCountry);
      const clientIp = await getPublicIpAddress().catch(() => "");
      if (cancelled) return;
      await sendMarketplacePresenceHeartbeat({
        visitorId,
        viewerType,
        countryCode: sanitizeCountryCodeForPayload(ipCountry.countryCode || browserCountry.countryCode),
        countryName: (ipCountry.countryName || browserCountry.countryName || "").trim() || undefined,
        clientIp: clientIp.trim() || undefined,
        locale: navigator.language || "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        currentPath,
      }).catch(() => {});
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

/** Outlet para anidar /marketplace, /marketplace/login, /marketplace/registro (matching estable en RR7). */
function MarketplaceLayout() {
  return (
    <MarketplaceLanguageProvider>
      <MarketplacePresenceBeacon />
      <Outlet />
    </MarketplaceLanguageProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <ToastContainer />
        <Routes>
          {/* Tienda primero: catálogo público + login/registro cliente (anidado para matching estable en RR7) */}
          <Route path="/marketplace" element={<MarketplaceLayout />}>
            <Route index element={<MarketplacePage />} />
            <Route path="home" element={<MarketplaceCorporateHomePage />} />
            <Route path="services" element={<MarketplaceServicesPage />} />
            <Route path="company" element={<MarketplaceCompanyPage />} />
            <Route path="faq" element={<MarketplaceFaqPage />} />
            <Route path="contact" element={<MarketplaceContactPage />} />
            <Route path="login" element={<MarketplaceClienteLoginPage />} />
            <Route path="registro" element={<MarketplaceClienteRegistroPage />} />
            <Route path="mis-ordenes" element={<Navigate to="/marketplace" replace />} />
          </Route>
          <Route path="/marketplace/" element={<Navigate to="/marketplace" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><ProtectedAppLayout /></ProtectedRoute>}>
            {/* `index`: en layout sin path, `path="/"` como hijo puede no matchear `/` y el * devuelve bucle infinito */}
            <Route index element={<HomePage />} />
            <Route path="/kryptex" element={<KryptexPage />} />
            <Route path="/kryptex/detalle" element={<KryptexDetallePage />} />
            <Route path="/marketplacedashboard" element={<EquiposAsicPage />} />
            <Route path="/hosting" element={<HostingHubPage />} />
            <Route path="/hosting/control-documentos-cobros" element={<FacturasMesHostingPage />} />
            <Route path="/facturacion-hosting" element={<FacturacionPage />} />
            <Route path="/historial" element={<HistorialPage />} />
            <Route path="/historial-hosting" element={<HistorialPage sourceFilter="hosting" />} />
            <Route path="/pendientes-hosting" element={<PendientesPage />} />
            <Route path="/facturacion" element={<Navigate to="/facturacion-hosting" replace />} />
            <Route path="/pendientes" element={<Navigate to="/pendientes-hosting" replace />} />
            <Route path="/equipos-asic" element={<MineriaHubPage />} />
            <Route path="/equipos-asic/equipos" element={<EquiposAsicPage />} />
            <Route path="/equipos-asic/equipos/nuevos" element={<Navigate to="/equipos-asic/equipos" replace />} />
            <Route path="/equipos-asic/setup" element={<SetupPage />} />
            <Route path="/equipos-asic/garantia-ande" element={<GarantiaAndePage />} />
            <Route path="/equipos-asic/items-garantia" element={<GarantiasAndeItemsPage />} />
            <Route path="/equipos-asic/items-garantia/nuevo" element={<GarantiaAndeItemNewPage />} />
            <Route path="/equipos-asic/garantias-historial" element={<HistorialGarantiasPage />} />
            <Route path="/mineria" element={<Navigate to="/equipos-asic" replace />} />
            <Route path="/facturacion-equipos" element={<FacturacionMineriaPage />} />
            <Route path="/historial-equipos" element={<HistorialMineriaPage />} />
            <Route path="/pendientes-equipos" element={<PendientesMineriaPage />} />
            <Route path="/facturacion-mineria" element={<Navigate to="/facturacion-equipos" replace />} />
            <Route path="/historial-mineria" element={<Navigate to="/historial-equipos" replace />} />
            <Route path="/pendientes-mineria" element={<Navigate to="/pendientes-equipos" replace />} />
            <Route path="/clientes-hub" element={<ClientesHubPage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/cuenta-cliente" element={<CuentaClientePage />} />
            <Route path="/cuenta-cliente/detalle" element={<CuentaClienteDetallePage />} />
            <Route path="/clientes/nuevo" element={<Navigate to="/clientes" replace />} />
            <Route path="/clientes/:id/edit" element={<ClienteEditPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/clientes-tienda-online" element={<ClientesTiendaOnlinePage />} />
            <Route path="/cotizaciones-marketplace" element={<CotizacionesMarketplacePage />} />
            <Route path="/marketplace-presencia" element={<MarketplacePresencePage />} />
            <Route path="/usuarios/*" element={<UsuariosPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
