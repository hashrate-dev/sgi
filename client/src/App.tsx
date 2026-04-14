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
import { CuentaClientePage } from "./pages/CuentaClientePage";
import { CuentaClienteDetallePage } from "./pages/CuentaClienteDetallePage";
import { ToastContainer } from "./components/ToastNotification";
import { ScrollToTop } from "./components/ScrollToTop";
import { MarketplaceLanguageProvider } from "./contexts/MarketplaceLanguageContext";
import { getStoredUser } from "./lib/auth";
import type { MarketplacePresenceViewerType } from "./lib/api";

const MARKETPLACE_PRESENCE_VISITOR_KEY = "hrs_marketplace_presence_visitor_id";

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

function MarketplacePresenceBeacon() {
  const location = useLocation();
  useEffect(() => {
    if (!location.pathname.startsWith("/marketplace")) return;
    const visitorId = getMarketplacePresenceVisitorId();
    const currentPath = `${location.pathname}${location.search ?? ""}`.slice(0, 200);
    const viewerType = resolveMarketplaceViewerType();
    let cancelled = false;
    const sendBeat = () => {
      if (cancelled) return;
      void sendMarketplacePresenceHeartbeat({ visitorId, viewerType, currentPath }).catch(() => {});
    };
    sendBeat();
    const intervalId = window.setInterval(sendBeat, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sendBeat();
    };
    window.addEventListener("focus", sendBeat);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", sendBeat);
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
            <Route path="/usuarios/*" element={<UsuariosPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
