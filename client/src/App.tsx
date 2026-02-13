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
import { ClienteNewPage } from "./pages/ClienteNewPage";
import { EquiposAsicPage } from "./pages/EquiposAsicPage";
import { SetupPage } from "./pages/SetupPage";
import { ReportesPage } from "./pages/ReportesPage";
import { UsuariosPage } from "./pages/UsuariosPage";
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
            <Route path="/historial-hosting" element={<HistorialPage />} />
            <Route path="/pendientes-hosting" element={<PendientesPage />} />
            <Route path="/facturacion" element={<Navigate to="/facturacion-hosting" replace />} />
            <Route path="/historial" element={<Navigate to="/historial-hosting" replace />} />
            <Route path="/pendientes" element={<Navigate to="/pendientes-hosting" replace />} />
            <Route path="/equipos-asic" element={<MineriaHubPage />} />
            <Route path="/equipos-asic/equipos" element={<EquiposAsicPage />} />
            <Route path="/equipos-asic/setup" element={<SetupPage />} />
            <Route path="/mineria" element={<Navigate to="/equipos-asic" replace />} />
            <Route path="/facturacion-equipos" element={<FacturacionMineriaPage />} />
            <Route path="/historial-equipos" element={<HistorialMineriaPage />} />
            <Route path="/pendientes-equipos" element={<PendientesMineriaPage />} />
            <Route path="/facturacion-mineria" element={<Navigate to="/facturacion-equipos" replace />} />
            <Route path="/historial-mineria" element={<Navigate to="/historial-equipos" replace />} />
            <Route path="/pendientes-mineria" element={<Navigate to="/pendientes-equipos" replace />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/clientes/nuevo" element={<ClienteNewPage />} />
            <Route path="/clientes/:id/edit" element={<ClienteEditPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
