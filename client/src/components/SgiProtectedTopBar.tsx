import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { Box, Flex, Heading, Image as ChakraImage, Stack, Text } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { updateMyPassword } from "../lib/api";
import { HOME_DASHBOARD_SHELL } from "../lib/sgiDashboardShell";
import { isSgiDashboardPath, sgiHome } from "../lib/marketplacePaths.js";
import { showToast } from "./ToastNotification";
import { AppButton, AppInput, AppModal } from "./ui";
import "../styles/marketplace-hashrate.css";

type SgiProtectedTopBarProps = {
  onHeightChange: (heightPx: number) => void;
};

export function SgiProtectedTopBar({ onHeightChange }: SgiProtectedTopBarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const homePath = sgiHome();
  const isHome = isSgiDashboardPath(pathname);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/images/HRSLOGO.png");
  const rootRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) onHeightChange(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setLogoSrc("/images/HRSLOGO.png");
    img.onerror = () => setLogoSrc("/images/HASHRATELOGO2.png");
    img.src = "/images/HRSLOGO.png";
  }, []);

  useEffect(() => {
    if (!isHome) setShowPasswordModal(false);
  }, [isHome]);

  function handleChangePassword() {
    if (newPassword.length < 6) {
      showToast("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Las contraseñas no coinciden.", "error");
      return;
    }
    setSaving(true);
    updateMyPassword(newPassword)
      .then(() => {
        showToast("✓ Tu contraseña ha sido cambiada exitosamente.", "success");
        setShowPasswordModal(false);
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Error al actualizar la contraseña", "error"))
      .finally(() => setSaving(false));
  }

  if (!user) return null;

  return (
    <>
      <Box
        ref={rootRef}
        as="header"
        role="banner"
        aria-label="Cabecera SGI"
        className="hrs-sgi-shell-header"
      >
        <Box
          w="100%"
          {...HOME_DASHBOARD_SHELL}
          className="hrs-sgi-shell-header__inner"
        >
          <Flex
            className="hrs-sgi-shell-header__row"
            align="center"
            justify="space-between"
            gap={{ base: 3, lg: 4 }}
            flexWrap={{ base: "wrap", lg: "nowrap" }}
            w="100%"
          >
            <RouterLink
              to={homePath}
              aria-label="Ir al inicio SGI"
              title="Ir al inicio SGI"
              className="hrs-sgi-shell-header__brand"
            >
              <Flex align="center" gap={3} minW={0} flex={{ base: "1 1 100%", lg: "0 1 auto" }}>
                <ChakraImage
                  src={logoSrc}
                  alt="HRS Logo"
                  className="hrs-sgi-shell-header__logo"
                  h={{ base: "44px", md: "52px" }}
                  w="auto"
                  maxW={{ base: "168px", md: "210px" }}
                  objectFit="contain"
                  flexShrink={0}
                  onError={() => setLogoSrc("/images/HASHRATELOGO2.png")}
                />
                <Box minW={0} lineHeight="1.15" className="hrs-sgi-shell-header__titles">
                  <Heading as="h1" className="hrs-sgi-shell-header__title">
                    HRS GROUP S.A
                  </Heading>
                  <Text className="hrs-sgi-shell-header__subtitle">Sistema de gestión interna</Text>
                </Box>
              </Flex>
            </RouterLink>

            <Flex
              className="hrs-sgi-shell-header__actions"
              flex={{ base: "1 1 100%", lg: "0 1 auto" }}
              minW={0}
              align="center"
              justify={{ base: "flex-start", lg: "flex-end" }}
              gap={2}
              flexWrap="wrap"
              w={{ base: "100%", lg: "auto" }}
              ml={{ base: 0, lg: "auto" }}
            >
              {!isHome ? (
                <button
                  type="button"
                  className="hrs-sgi-shell-header__link"
                  onClick={() => navigate(homePath)}
                >
                  <i className="bi bi-house-door" aria-hidden />
                  <span>Volver al inicio</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="hrs-sgi-shell-header__link"
                  onClick={() => setShowPasswordModal(true)}
                >
                  <i className="bi bi-key" aria-hidden />
                  <span>Cambiar contraseña</span>
                </button>
              )}

              <span className="hrs-sgi-shell-header__user" title={`${user.email || user.username} · ${user.role}`}>
                <i className="bi bi-person-circle" aria-hidden />
                <span className="hrs-sgi-shell-header__user-text">
                  {user.email || user.username} · {user.role}
                </span>
              </span>

              <button type="button" className="hrs-sgi-shell-header__logout" onClick={logout}>
                <i className="bi bi-box-arrow-right" aria-hidden />
                <span>Cerrar sesión</span>
              </button>
            </Flex>
          </Flex>
        </Box>
      </Box>

      {isHome ? (
        <AppModal
          open={showPasswordModal}
          onOpenChange={setShowPasswordModal}
          title="Cambiar mi contraseña"
          description="Elegí una contraseña segura. Mínimo 6 caracteres; podés combinar letras y números."
          size="md"
          footer={
            <>
              <AppButton variant="outline" size="md" minH="42px" px={5} onClick={() => setShowPasswordModal(false)}>
                Cancelar
              </AppButton>
              <AppButton size="md" minH="42px" px={5} onClick={handleChangePassword} loading={saving}>
                Guardar contraseña
              </AppButton>
            </>
          }
        >
          <Stack gap={5} align="stretch">
            <AppInput
              label="Usuario"
              value={user.email || user.username}
              readOnly
              bg="gray.50"
              color="gray.700"
              cursor="default"
              _readOnly={{ opacity: 1, cursor: "default" }}
              helperText="Solo lectura. El usuario no se modifica desde aquí."
            />
            <AppInput
              label="Nueva contraseña"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              helperText="No compartas esta contraseña con nadie."
            />
            <AppInput
              label="Confirmar nueva contraseña"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              placeholder="Repetí la misma contraseña"
            />
          </Stack>
        </AppModal>
      ) : null}
    </>
  );
}
