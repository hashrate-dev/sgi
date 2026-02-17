import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { FacturacionPage } from "./pages/FacturacionPage";
import { FacturacionMineriaPage } from "./pages/FacturacionMineriaPage";
import { HostingHubPage } from "./pages/HostingHubPage";
import { MineriaHubPage } from "./pages/MineriaHubPage";
import { HistorialPage } from "./pages/HistorialPage";
import { HistorialMineriaPage } from "./pages/HistorialMineriaPage";
import { PendientesPage } from "./pages/PendientesPage";
import { PendientesMineriaPage } from "./pages/PendientesMineriaPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ClienteEditPage } from "./pages/ClienteEditPage";
import { EquiposAsicPage } from "./pages/EquiposAsicPage";
import { EquiposAsicNuevoPage } from "./pages/EquiposAsicNuevoPage";
import { SetupPage } from "./pages/SetupPage";
import { ReportesPage } from "./pages/ReportesPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { ConfiguracionPage } from "./pages/ConfiguracionPage";
import { GarantiaAndePage } from "./pages/GarantiaAndePage";
import { GarantiasAndeItemsPage } from "./pages/GarantiasAndeItemsPage";
import { GarantiaAndeItemNewPage } from "./pages/GarantiaAndeItemNewPage";
import { HistorialGarantiasPage } from "./pages/HistorialGarantiasPage";
import { ToastContainer } from "./components/ToastNotification";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastContainer />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/hosting" element={<HostingHubPage />} />
            <Route path="/facturacion-hosting" element={<FacturacionPage />} />
            <Route path="/historial" element={<HistorialPage />} />
            <Route path="/historial-hosting" element={<Navigate to="/historial" replace />} />
            <Route path="/pendientes-hosting" element={<PendientesPage />} />
            <Route path="/facturacion" element={<Navigate to="/facturacion-hosting" replace />} />
            <Route path="/pendientes" element={<Navigate to="/pendientes-hosting" replace />} />
            <Route path="/equipos-asic" element={<MineriaHubPage />} />
            <Route path="/equipos-asic/equipos" element={<EquiposAsicPage />} />
            <Route path="/equipos-asic/equipos/nuevos" element={<EquiposAsicNuevoPage />} />
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
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/clientes/nuevo" element={<Navigate to="/clientes" replace />} />
            <Route path="/clientes/:id/edit" element={<ClienteEditPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
