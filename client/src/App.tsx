import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { FacturacionPage } from "./pages/FacturacionPage";
import { HistorialPage } from "./pages/HistorialPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ClienteEditPage } from "./pages/ClienteEditPage";
import { ClienteNewPage } from "./pages/ClienteNewPage";
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
            <Route path="/facturacion" element={<FacturacionPage />} />
            <Route path="/historial" element={<HistorialPage />} />
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
