import { useState, useEffect, useRef } from "react";
import { Navigate, Link as RouterLink } from "react-router-dom";
import { Badge, Box, Flex, Grid, Heading, Image as ChakraImage, Stack, Text } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { getMarketplacePresenceStats, getMarketplaceQuoteTicketsStats, updateMyPassword } from "../lib/api";
import { canViewMarketplaceQuoteTickets } from "../lib/auth.js";
import { playMarketplaceOrderNotificationSound } from "../lib/marketplaceCartSound";
import { showToast } from "../components/ToastNotification";
import "../styles/marketplace-hashrate.css";
import { AppButton, AppCard, AppInput, AppModal } from "../components/ui";

type MenuItem = {
  to: string;
  icon?: string;
  label: string;
  desc: string;
  roles?: string[];
  /** Logo en la tarjeta (ej. Hosting = marca HASHRATE) en lugar del icono Bootstrap */
  cardLogoSrc?: string;
  cardLogoAlt?: string;
};

const ICON_SLOT_PROPS = {
  w: "72px",
  h: "72px",
  align: "center" as const,
  justify: "center" as const,
  borderRadius: "xl",
  bg: "green.50",
  color: "green.700",
  flexShrink: 0,
  borderWidth: "1px",
  borderColor: "green.100",
};

/** Tamaño uniforme de iconos Bootstrap en tarjetas del home (rellena más el recuadre) */
const DASHBOARD_BI_ICON_SIZE = "2.125rem";
const DASHBOARD_BI_ICON_SIZE_LG = "2.35rem";

const menuItems: MenuItem[] = [
  {
    to: "/marketplace",
    icon: "bi-bag-heart",
    label: "Tienda online",
    desc: "Catálogo público de equipos ASIC — vista cliente (sin administración)",
  },
  {
    to: "/hosting",
    label: "Servicios de Hosting",
    desc: "Información de facturación de servicios de hosting",
    roles: ["admin_a", "admin_b", "operador"],
    cardLogoSrc: "/images/LOGO-HASHRATE.png",
    cardLogoAlt: "Hashrate",
  },
  {
    to: "/equipos-asic",
    icon: "bi-cpu",
    label: "Equipos ASIC",
    desc: "Información de facturación de equipos de minería ASIC",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/kryptex",
    icon: "bi-currency-bitcoin",
    label: "Kryptex",
    desc: "Información de Kryptex",
    roles: ["admin_a", "admin_b", "lector"],
  },
  {
    to: "/cuenta-cliente",
    icon: "bi-journal-text",
    label: "Cuenta por cliente",
    desc: "Detalle histórico de movimientos por cliente (hosting + ASIC)",
  },
  { to: "/historial", icon: "bi-clock-history", label: "Historial", desc: "Ver y gestionar comprobantes" },
  {
    to: "/clientes-hub",
    icon: "bi-people",
    label: "Clientes",
    desc: "Administración de clientes de tienda online y de hosting",
  },
  { to: "/reportes", icon: "bi-graph-up", label: "Reportes", desc: "Estadísticas y análisis" },
];

function DashboardCardIconSlot({ item }: { item: MenuItem }) {
  if (item.cardLogoSrc) {
    return (
      <Flex {...ICON_SLOT_PROPS} mb={3}>
        <img
          src={item.cardLogoSrc}
          alt={item.cardLogoAlt ?? "Hashrate"}
          style={{ maxHeight: 50, width: "auto", maxWidth: 64, objectFit: "contain", display: "block" }}
        />
      </Flex>
    );
  }
  if (item.icon) {
    return (
      <Flex {...ICON_SLOT_PROPS} mb={3}>
        <Box as="i" className={`bi ${item.icon}`} fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
      </Flex>
    );
  }
  return null;
}

export function HomePage() {
  const { user, logout } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/images/HRSLOGO.png");
  const [marketplaceOpenCount, setMarketplaceOpenCount] = useState(0);
  const [marketplaceBadgePulse, setMarketplaceBadgePulse] = useState(false);
  const [marketplaceOnlineTotal, setMarketplaceOnlineTotal] = useState(0);
  const [marketplaceOnlineLogged, setMarketplaceOnlineLogged] = useState(0);
  const [marketplaceOnlineAnon, setMarketplaceOnlineAnon] = useState(0);
  const prevOpenCountRef = useRef(0);
  const roleNorm = (r: string | undefined) => (r ?? "").toLowerCase().trim();
  const visibleMenuItems = menuItems.filter(
    (item) => !item.roles || (user && item.roles.some((r) => roleNorm(r) === roleNorm(user.role)))
  );
  const canSeeMarketplaceOrdersCard = Boolean(user && canViewMarketplaceQuoteTickets(user.role));

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setLogoSrc("/images/HRSLOGO.png");
    };
    img.onerror = () => {
      console.warn("HRSLOGO.png not found, using fallback");
      setLogoSrc("/images/HASHRATELOGO2.png");
    };
    img.src = "/images/HRSLOGO.png";
  }, []);

  useEffect(() => {
    if (!canSeeMarketplaceOrdersCard) return;
    let cancelled = false;
    let pulseTimeout: number | null = null;
    const computeOpenCount = (byStatus: Record<string, number> | undefined): number => {
      if (!byStatus) return 0;
      const cerrado = Number(byStatus.cerrado ?? 0) || 0;
      const descartado = Number(byStatus.descartado ?? 0) || 0;
      const total = Object.values(byStatus).reduce((s, n) => s + (Number(n) || 0), 0);
      return Math.max(0, total - cerrado - descartado);
    };
    const refresh = async () => {
      try {
        const stats = await getMarketplaceQuoteTicketsStats();
        if (cancelled) return;
        const nextOpen = computeOpenCount(stats.byStatus);
        setMarketplaceOpenCount(nextOpen);
        if (nextOpen > prevOpenCountRef.current) {
          playMarketplaceOrderNotificationSound();
          setMarketplaceBadgePulse(true);
          if (pulseTimeout) window.clearTimeout(pulseTimeout);
          pulseTimeout = window.setTimeout(() => setMarketplaceBadgePulse(false), 1600);
        }
        prevOpenCountRef.current = nextOpen;
      } catch {
        if (!cancelled) {
          setMarketplaceOpenCount(0);
        }
      }
    };
    void refresh();
    const int = window.setInterval(() => {
      void refresh();
    }, 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(int);
      window.removeEventListener("focus", onFocus);
      if (pulseTimeout) window.clearTimeout(pulseTimeout);
    };
  }, [canSeeMarketplaceOrdersCard]);

  useEffect(() => {
    if (!canSeeMarketplaceOrdersCard) return;
    let cancelled = false;
    const refreshPresence = async () => {
      try {
        const presence = await getMarketplacePresenceStats();
        if (cancelled) return;
        const total = Number(presence.onlineTotal) || 0;
        const by = presence.byViewerType ?? {};
        const logged = (Number(by.cliente ?? 0) || 0) + (Number(by.staff ?? 0) || 0);
        setMarketplaceOnlineTotal(total);
        setMarketplaceOnlineLogged(logged);
        setMarketplaceOnlineAnon(Number(by.anon ?? 0) || 0);
      } catch {
        if (!cancelled) {
          setMarketplaceOnlineTotal(0);
          setMarketplaceOnlineLogged(0);
          setMarketplaceOnlineAnon(0);
        }
      }
    };
    void refreshPresence();
    const int = window.setInterval(() => {
      void refreshPresence();
    }, 8000);
    const onFocus = () => void refreshPresence();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(int);
      window.removeEventListener("focus", onFocus);
    };
  }, [canSeeMarketplaceOrdersCard]);

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

  const cardTitleProps = {
    as: "h2" as const,
    fontSize: { base: "lg", md: "xl" },
    fontWeight: "semibold",
    color: "gray.800",
    lineHeight: "snug",
    mb: 2,
    letterSpacing: "-0.01em",
  };

  const cardDescProps = {
    fontSize: "sm",
    color: "gray.600",
    lineHeight: "tall",
  };

  if (user?.role === "lector") {
    return <Navigate to="/kryptex" replace />;
  }
  if (user?.role === "cliente") {
    return <Navigate to="/marketplace" replace />;
  }

  return (
    <Box minH="100vh" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }} bgGradient="linear(135deg, #074025 0%, #2d8f3a 55%, #49f227 100%)">
      <Box maxW="1150px" mx="auto">
        <AppCard mb={5} p={{ base: 4, md: 5 }} boxShadow="md">
          <Flex
            align="center"
            justify="space-between"
            gap={4}
            flexWrap="wrap"
            rowGap={4}
          >
            <Flex align="center" gap={4} minW={0} flex={{ base: "1 1 100%", lg: "0 1 auto" }}>
              <ChakraImage
                src={logoSrc}
                alt="HRS Logo"
                h={{ base: "40px", md: "48px" }}
                w="auto"
                maxW={{ base: "120px", md: "160px" }}
                objectFit="contain"
                flexShrink={0}
                onError={() => {
                  setLogoSrc("/images/HASHRATELOGO2.png");
                }}
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
            {user ? (
              <Flex
                align="center"
                justify={{ base: "flex-start", sm: "flex-end" }}
                gap={2}
                flexWrap="wrap"
                flex={{ base: "1 1 100%", lg: "0 1 auto" }}
                w={{ base: "100%", lg: "auto" }}
              >
                <Badge colorPalette="green" px={3} py={1.5} borderRadius="full" fontWeight="medium" maxW="100%">
                  <Flex as="span" align="center" gap={2} minW={0}>
                    <Box as="i" className="bi bi-person-circle" flexShrink={0} aria-hidden />
                    <Text as="span" truncate fontSize="sm">
                      {user.email || user.username} · {user.role}
                    </Text>
                  </Flex>
                </Badge>
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
                >
                  <Flex align="center" gap={2}>
                    <Box as="i" className="bi bi-key" fontSize="12px" aria-hidden />
                    Cambiar contraseña
                  </Flex>
                </AppButton>
                <AppButton
                  variant="solid"
                  size="xs"
                  h="28px"
                  px={3}
                  borderRadius="full"
                  fontWeight="semibold"
                  onClick={logout}
                >
                  <Flex align="center" gap={2}>
                    <Box as="i" className="bi bi-box-arrow-right" fontSize="12px" aria-hidden />
                    Cerrar sesión
                  </Flex>
                </AppButton>
              </Flex>
            ) : null}
          </Flex>
        </AppCard>

        <Grid
          templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }}
          gap={4}
          alignItems="stretch"
        >
          {visibleMenuItems.map((item) => (
            <RouterLink key={item.to + item.label} to={item.to} style={{ textDecoration: "none", color: "inherit", display: "block", minHeight: 0 }}>
              <AppCard
                h="100%"
                minH="148px"
                display="flex"
                flexDirection="column"
                transition="box-shadow 0.2s ease, transform 0.2s ease"
                _hover={{ transform: "translateY(-2px)", boxShadow: "md", borderColor: "green.200" }}
              >
                <DashboardCardIconSlot item={item} />
                <Heading {...cardTitleProps}>{item.label}</Heading>
                <Text {...cardDescProps}>{item.desc}</Text>
              </AppCard>
            </RouterLink>
          ))}

          {canSeeMarketplaceOrdersCard ? (
            <RouterLink to="/cotizaciones-marketplace" style={{ textDecoration: "none", color: "inherit", display: "block", minHeight: 0 }}>
              <AppCard
                h="100%"
                minH="148px"
                display="flex"
                flexDirection="column"
                borderLeftWidth="4px"
                borderLeftColor="green.500"
                transition="box-shadow 0.2s ease, transform 0.2s ease"
                _hover={{ transform: "translateY(-2px)", boxShadow: "md", borderColor: "gray.200" }}
              >
                <Flex {...ICON_SLOT_PROPS} mb={3} position="relative">
                  <Box as="i" className="bi bi-ticket-perforated" fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
                  {marketplaceOpenCount > 0 ? (
                    <Box
                      position="absolute"
                      top="-6px"
                      right="-6px"
                      minW="22px"
                      h="22px"
                      px={1.5}
                      borderRadius="full"
                      bg="red.500"
                      color="white"
                      fontSize="xs"
                      fontWeight="bold"
                      display="inline-flex"
                      alignItems="center"
                      justifyContent="center"
                      transform={marketplaceBadgePulse ? "scale(1.08)" : "scale(1)"}
                      transition="transform 0.2s ease"
                      boxShadow="sm"
                    >
                      {marketplaceOpenCount > 99 ? "99+" : marketplaceOpenCount}
                    </Box>
                  ) : null}
                </Flex>
                <Heading {...cardTitleProps}>Órdenes marketplace</Heading>
                <Text {...cardDescProps}>Tickets y órdenes del carrito (monitoreo en vivo)</Text>
              </AppCard>
            </RouterLink>
          ) : null}

          {canSeeMarketplaceOrdersCard ? (
            <RouterLink
              to="/marketplace-presencia"
              role="status"
              aria-live="polite"
              style={{ textDecoration: "none", color: "inherit", display: "block", minHeight: 0 }}
            >
              <AppCard
                h="100%"
                minH="148px"
                display="flex"
                flexDirection="column"
                transition="box-shadow 0.2s ease, transform 0.2s ease"
                _hover={{ transform: "translateY(-2px)", boxShadow: "md", borderColor: "green.200" }}
              >
                <Flex {...ICON_SLOT_PROPS} mb={3}>
                  <Box as="i" className="bi bi-broadcast-pin" fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
                </Flex>
                <Heading {...cardTitleProps}>Marketplace en vivo</Heading>
                <Text fontSize="sm" fontWeight="semibold" color="gray.700" mb={1.5} lineHeight="short">
                  {marketplaceOnlineTotal} en línea ahora
                </Text>
                <Text {...cardDescProps}>
                  Logueados: {marketplaceOnlineLogged} · Sin cuenta: {marketplaceOnlineAnon}
                </Text>
              </AppCard>
            </RouterLink>
          ) : null}

          {user && (roleNorm(user.role) === "admin_a" || roleNorm(user.role) === "admin_b") ? (
            <RouterLink to="/tienda-online-banners-home" style={{ textDecoration: "none", color: "inherit", display: "block", minHeight: 0 }}>
              <AppCard
                h="100%"
                minH="148px"
                display="flex"
                flexDirection="column"
                transition="box-shadow 0.2s ease, transform 0.2s ease"
                _hover={{ transform: "translateY(-2px)", boxShadow: "md", borderColor: "green.200" }}
              >
                <Flex {...ICON_SLOT_PROPS} mb={3}>
                  <Box as="i" className="bi bi-images" fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
                </Flex>
                <Heading {...cardTitleProps}>Tienda online — banners home</Heading>
                <Text {...cardDescProps}>Destacados de la home pública: más vendidos y otros productos</Text>
              </AppCard>
            </RouterLink>
          ) : null}

          {user ? (
            <RouterLink to="/configuracion" style={{ textDecoration: "none", color: "inherit", display: "block", minHeight: 0 }}>
              <AppCard
                h="100%"
                minH="148px"
                display="flex"
                flexDirection="column"
                transition="box-shadow 0.2s ease, transform 0.2s ease"
                _hover={{ transform: "translateY(-2px)", boxShadow: "md", borderColor: "green.200" }}
              >
                <Flex {...ICON_SLOT_PROPS} mb={3}>
                  <Box as="i" className="bi bi-gear-fill" fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
                </Flex>
                <Heading {...cardTitleProps}>Configuración</Heading>
                <Text {...cardDescProps}>
                  Tienda online, equipos ASIC, setup y garantías
                  {roleNorm(user?.role) === "admin_a" || roleNorm(user?.role) === "admin_b" ? "; usuarios" : ""}
                </Text>
              </AppCard>
            </RouterLink>
          ) : null}
        </Grid>
      </Box>

      {showPasswordModal && user ? (
        <AppModal
          open={showPasswordModal}
          onOpenChange={setShowPasswordModal}
          title="Cambiar mi contraseña"
          description="Elegí una contraseña segura. Mínimo 6 caracteres; podés combinar letras y números."
          size="sm"
          footer={
            <>
              <AppButton variant="outline" size="sm" onClick={() => setShowPasswordModal(false)}>
                Cancelar
              </AppButton>
              <AppButton size="sm" onClick={handleChangePassword} loading={saving}>
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
    </Box>
  );
}
