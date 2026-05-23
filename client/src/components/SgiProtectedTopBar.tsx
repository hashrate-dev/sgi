import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { Badge, Box, Flex, Heading, Image as ChakraImage, Stack, Text } from "@chakra-ui/react";
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
        className="hrs-dashboard-glass-top hrs-sgi-home-topbar hrs-sgi-shell-header"
      >
        <Box w="100%" {...HOME_DASHBOARD_SHELL} py={{ base: 3, md: 3.5 }}>
          <Flex align="center" justify="space-between" gap={4} flexWrap="wrap" rowGap={4} w="100%">
            <RouterLink
              to={homePath}
              aria-label="Ir al inicio SGI"
              title="Ir al inicio SGI"
              style={{ textDecoration: "none", color: "inherit", minWidth: 0, flexShrink: 0 }}
            >
              <Flex align="center" gap={4} minW={0} flex={{ base: "1 1 100%", lg: "0 1 auto" }}>
                <ChakraImage
                  src={logoSrc}
                  alt="HRS Logo"
                  h={{ base: "56px", md: "72px" }}
                  w="auto"
                  maxW={{ base: "200px", md: "260px" }}
                  objectFit="contain"
                  flexShrink={0}
                  onError={() => setLogoSrc("/images/HASHRATELOGO2.png")}
                />
                <Box minW={0}>
                  <Heading size="md" color="gray.800" lineHeight="short">
                    HRS GROUP S.A
                  </Heading>
                  <Text fontSize="sm" color="gray.600" mt={0.5}>
                    Sistema de gestión interna
                  </Text>
                </Box>
              </Flex>
            </RouterLink>
            <Flex
              flex={{ base: "1 1 100%", lg: "0 1 auto" }}
              minW={0}
              align="flex-start"
              justify={{ base: "flex-start", lg: "flex-end" }}
              gap={3}
              flexWrap="wrap"
              w={{ base: "100%", lg: "auto" }}
              ml={{ base: 0, lg: "auto" }}
            >
              {!isHome ? (
                <AppButton
                  variant="plain"
                  size="xs"
                  h="auto"
                  minW="auto"
                  px={1}
                  py={0.5}
                  color="gray.600"
                  fontWeight="medium"
                  borderRadius="sm"
                  _hover={{ bg: "transparent", color: "green.700", textDecoration: "underline" }}
                  _active={{ bg: "transparent" }}
                  onClick={() => navigate(homePath)}
                  flexShrink={0}
                >
                  <Flex align="center" gap={2}>
                    <Box as="i" className="bi bi-house-door" fontSize="12px" aria-hidden />
                    Volver al inicio
                  </Flex>
                </AppButton>
              ) : null}
              <Flex direction="column" alignItems="flex-end" gap={1.5} minW={0}>
                <Flex align="center" gap={2} flexWrap="wrap" justify="flex-end">
                  {isHome ? (
                    <AppButton
                      variant="plain"
                      size="xs"
                      h="auto"
                      minW="auto"
                      px={1}
                      py={0.5}
                      color="gray.600"
                      fontWeight="medium"
                      borderRadius="sm"
                      _hover={{ bg: "transparent", color: "green.700", textDecoration: "underline" }}
                      _active={{ bg: "transparent" }}
                      onClick={() => setShowPasswordModal(true)}
                      flexShrink={0}
                    >
                      <Flex align="center" gap={2}>
                        <Box as="i" className="bi bi-key" fontSize="12px" aria-hidden />
                        Cambiar contraseña
                      </Flex>
                    </AppButton>
                  ) : null}
                  <Badge
                    colorPalette="green"
                    px={3}
                    py={1.5}
                    borderRadius="full"
                    fontWeight="medium"
                    maxW={{ base: "min(100%, 22rem)", md: "min(100%, 24rem)" }}
                    flexShrink={0}
                  >
                    <Flex as="span" align="center" gap={2} minW={0}>
                      <Box as="i" className="bi bi-person-circle" flexShrink={0} aria-hidden />
                      <Text as="span" truncate fontSize="sm">
                        {user.email || user.username} · {user.role}
                      </Text>
                    </Flex>
                  </Badge>
                </Flex>
                <AppButton
                  variant="solid"
                  size="xs"
                  h="24px"
                  minH="24px"
                  px={2.5}
                  fontSize="xs"
                  borderRadius="full"
                  fontWeight="semibold"
                  onClick={logout}
                  flexShrink={0}
                  alignSelf="flex-end"
                >
                  <Flex align="center" gap={1.5}>
                    <Box as="i" className="bi bi-box-arrow-right" fontSize="11px" aria-hidden />
                    Cerrar sesión
                  </Flex>
                </AppButton>
              </Flex>
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
