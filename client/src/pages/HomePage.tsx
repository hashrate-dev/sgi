import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { keyframes } from "@emotion/react";
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
  iconBg?: string;
  iconColor?: string;
  iconBorderColor?: string;
  iconHoverBg?: string;
  iconHoverColor?: string;
  iconHoverBorderColor?: string;
  /** Logo en la tarjeta (ej. Hosting = marca HASHRATE) en lugar del icono Bootstrap */
  cardLogoSrc?: string;
  cardLogoAlt?: string;
};

const ICON_SLOT_PROPS = {
  w: "74px",
  h: "74px",
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
const DASHBOARD_BI_ICON_SIZE_LG = "3rem";

/** Enlace que ocupa toda la celda del grid para igualar alturas entre tarjetas (misma fila = misma altura) */
const DASHBOARD_CARD_LINK_STYLE: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  display: "flex",
  minHeight: 0,
  height: "100%",
  alignSelf: "stretch",
};

const marketplaceLiveAlertPulse = keyframes`
  0%, 100% {
    background: #f0fdf4;
    border-color: #dcfce7;
    box-shadow: 0 0 0 rgba(249, 115, 22, 0);
  }
  50% {
    background: #ffedd5;
    border-color: #fb923c;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.24);
  }
`;

const marketplaceLiveIconFlash = keyframes`
  0%, 100% {
    filter: none;
  }
  50% {
    filter: sepia(1) saturate(9) hue-rotate(-18deg) brightness(1.04);
  }
`;

const marketplaceOrdersAlertPulse = keyframes`
  0%, 100% {
    background: #f0fdf4;
    border-color: #dcfce7;
    box-shadow: 0 0 0 rgba(239, 68, 68, 0);
  }
  50% {
    background: #fee2e2;
    border-color: #f87171;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.22);
  }
`;

const marketplaceOrdersIconFlash = keyframes`
  0%, 100% {
    color: #15803d;
  }
  50% {
    color: #dc2626;
  }
`;

const menuItems: MenuItem[] = [
  {
    to: "/marketplace",
    icon: "bi-bag",
    label: "Tienda online",
    desc: "Catálogo público de equipos ASIC — vista cliente (sin administración)",
    iconBg: "#fff7d1",
    iconColor: "#d97706",
    iconBorderColor: "#fcd34d",
    iconHoverBg: "#fde68a",
    iconHoverColor: "#b45309",
    iconHoverBorderColor: "#f59e0b",
  },
  {
    to: "/hosting",
    icon: "bi-hdd-network",
    label: "Servicios de Hosting",
    desc: "Información de facturación de servicios de hosting",
    roles: ["admin_a", "admin_b", "operador"],
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
  if (item.to === "/marketplace") {
    return (
      <Flex
        {...ICON_SLOT_PROPS}
        className="dashboard-card-icon-slot dashboard-card-icon-slot--marketplace"
        bg="#fff7d1"
        color="#1f2937"
        borderColor="#fcd34d"
        transition="background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease"
        position="relative"
        mb={3}
      >
        <Box as="i" className="bi bi-bag" fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
        <Flex
          className="dashboard-card-icon-slot__marketplace-play"
          position="absolute"
          bottom="9px"
          left="50%"
          transform="translateX(-50%)"
          w="14px"
          h="14px"
          borderRadius="4px"
          bg="#f59e0b"
          align="center"
          justify="center"
        >
          <Box as="i" className="bi bi-play-fill" color="white" fontSize="0.5rem" lineHeight={1} aria-hidden />
        </Flex>
      </Flex>
    );
  }
  if (item.cardLogoSrc) {
    return (
      <Flex
        {...ICON_SLOT_PROPS}
        className="dashboard-card-icon-slot"
        mb={3}
      >
        <img
          src={item.cardLogoSrc}
          alt={item.cardLogoAlt ?? "Hashrate"}
          style={{
            maxHeight: 70,
            width: "auto",
            maxWidth: 82,
            objectFit: "contain",
            display: "block",
          }}
        />
      </Flex>
    );
  }
  if (item.icon) {
    return (
      <Flex
        {...ICON_SLOT_PROPS}
        className="dashboard-card-icon-slot"
        bg={item.iconBg ?? ICON_SLOT_PROPS.bg}
        color={item.iconColor ?? ICON_SLOT_PROPS.color}
        borderColor={item.iconBorderColor ?? ICON_SLOT_PROPS.borderColor}
        transition="background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease"
        mb={3}
      >
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
      const instalado = Number(byStatus.instalado ?? 0) || 0;
      const total = Object.values(byStatus).reduce((s, n) => s + (Number(n) || 0), 0);
      return Math.max(0, total - cerrado - descartado - instalado);
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
    fontSize: { base: "1.55rem", md: "1.65rem" },
    fontWeight: "700",
    color: "gray.800",
    lineHeight: "1.12",
    mb: 1.5,
    letterSpacing: "-0.01em",
  };

  const cardDescProps = {
    fontSize: { base: "0.88rem", md: "0.9rem" },
    color: "gray.600",
    lineHeight: "1.28",
  };

  const dashboardCardProps = {
    flex: 1,
    w: "100%",
    minH: "208px",
    h: "100%",
    p: 4,
    display: "flex",
    flexDirection: "column" as const,
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
    _hover: { transform: "translateY(-2px)", boxShadow: "md", borderColor: "green.200" },
  };

  if (user?.role === "lector") {
    return <Navigate to="/kryptex" replace />;
  }
  if (user?.role === "cliente") {
    return <Navigate to="/marketplace" replace />;
  }

  return (
    <Box
      minH="100vh"
      px={{ base: 4, md: 6 }}
      pt={{ base: 2, md: 2 }}
      pb={{ base: 3, md: 4 }}
      bgGradient="linear(135deg, #074025 0%, #2d8f3a 55%, #49f227 100%)"
    >
      <Box maxW="1320px" mx="auto">
        <AppCard mb={3} p={{ base: 3, md: 4 }} boxShadow="md">
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
                h={{ base: "56px", md: "72px" }}
                w="auto"
                maxW={{ base: "200px", md: "260px" }}
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
          gap={3}
          alignItems="stretch"
        >
          {visibleMenuItems.map((item) => (
            <RouterLink key={item.to + item.label} to={item.to} style={DASHBOARD_CARD_LINK_STYLE}>
              <AppCard
                {...dashboardCardProps}
                _hover={{
                  ...dashboardCardProps._hover,
                  "& .dashboard-card-icon-slot": {
                    bg: item.iconHoverBg ?? "green.200",
                    color: item.iconHoverColor ?? "green.800",
                    borderColor: item.iconHoverBorderColor ?? "green.300",
                  },
                  ...(item.to === "/marketplace"
                    ? {
                        "& .dashboard-card-icon-slot--marketplace": {
                          bg: "#d97706",
                          color: "white",
                          borderColor: "#d97706",
                        },
                        "& .dashboard-card-icon-slot__marketplace-play": {
                          bg: "#b45309",
                        },
                      }
                    : {}),
                }}
              >
                <DashboardCardIconSlot item={item} />
                <Heading {...cardTitleProps}>{item.label}</Heading>
                <Text {...cardDescProps}>{item.desc}</Text>
              </AppCard>
            </RouterLink>
          ))}

          {canSeeMarketplaceOrdersCard ? (
            <RouterLink to="/cotizaciones-marketplace" style={DASHBOARD_CARD_LINK_STYLE}>
              <AppCard
                {...dashboardCardProps}
                borderLeftWidth="4px"
                borderLeftColor="green.500"
                _hover={{
                  transform: "translateY(-2px)",
                  boxShadow: "md",
                  borderColor: "gray.200",
                  "& .dashboard-card-icon-slot": {
                    bg: "green.200",
                    color: "green.800",
                    borderColor: "green.300",
                  },
                }}
              >
                <Flex
                  {...ICON_SLOT_PROPS}
                  className="dashboard-card-icon-slot"
                  mb={3}
                  position="relative"
                  animation={marketplaceOpenCount > 0 ? `${marketplaceOrdersAlertPulse} 1.12s ease-in-out infinite` : undefined}
                >
                  <Box
                    as="i"
                    className="bi bi-ticket-perforated"
                    fontSize={DASHBOARD_BI_ICON_SIZE_LG}
                    lineHeight={1}
                    aria-hidden
                    style={{
                      animation: marketplaceOpenCount > 0 ? `${marketplaceOrdersIconFlash} 1.12s ease-in-out infinite` : undefined,
                    }}
                  />
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
                <Text {...cardDescProps}>
                  Borrador = carrito sin orden; pendiente = orden generada para cierre por ventas (tel./WhatsApp).
                </Text>
              </AppCard>
            </RouterLink>
          ) : null}

          {canSeeMarketplaceOrdersCard ? (
            <RouterLink to="/marketplace-presencia" role="status" aria-live="polite" style={DASHBOARD_CARD_LINK_STYLE}>
              <AppCard
                {...dashboardCardProps}
                _hover={{
                  ...dashboardCardProps._hover,
                  "& .dashboard-card-icon-slot": {
                    bg: "green.200",
                    color: "green.800",
                    borderColor: "green.300",
                  },
                }}
              >
                <Flex
                  {...ICON_SLOT_PROPS}
                  className="dashboard-card-icon-slot"
                  mb={3}
                  animation={marketplaceOnlineTotal > 0 ? `${marketplaceLiveAlertPulse} 1.12s ease-in-out infinite` : undefined}
                >
                  <Box
                    as="i"
                    className="bi bi-broadcast-pin"
                    fontSize={DASHBOARD_BI_ICON_SIZE_LG}
                    lineHeight={1}
                    aria-hidden
                    style={{
                      animation: marketplaceOnlineTotal > 0 ? `${marketplaceLiveIconFlash} 1.12s ease-in-out infinite` : undefined,
                    }}
                  />
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
            <RouterLink to="/tienda-online-banners-home" style={DASHBOARD_CARD_LINK_STYLE}>
              <AppCard
                {...dashboardCardProps}
                _hover={{
                  ...dashboardCardProps._hover,
                  "& .dashboard-card-icon-slot": {
                    bg: "green.200",
                    color: "green.800",
                    borderColor: "green.300",
                  },
                }}
              >
                <Flex {...ICON_SLOT_PROPS} className="dashboard-card-icon-slot" mb={3}>
                  <Box as="i" className="bi bi-images" fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
                </Flex>
                <Heading {...cardTitleProps}>Tienda online — banners home</Heading>
                <Text {...cardDescProps}>Destacados de la home pública: más vendidos y otros productos</Text>
              </AppCard>
            </RouterLink>
          ) : null}

          {user ? (
            <RouterLink to="/configuracion" style={DASHBOARD_CARD_LINK_STYLE}>
              <AppCard
                {...dashboardCardProps}
                _hover={{
                  ...dashboardCardProps._hover,
                  "& .dashboard-card-icon-slot": {
                    bg: "green.200",
                    color: "green.800",
                    borderColor: "green.300",
                  },
                  "& .dashboard-card-icon--gear": {
                    transform: "rotate(18deg)",
                  },
                }}
              >
                <Flex {...ICON_SLOT_PROPS} className="dashboard-card-icon-slot" mb={3}>
                  <Box
                    as="i"
                    className="bi bi-gear-fill dashboard-card-icon--gear"
                    fontSize={DASHBOARD_BI_ICON_SIZE_LG}
                    lineHeight={1}
                    aria-hidden
                    transition="transform 0.22s ease"
                    transformOrigin="center"
                  />
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

      {/* Siempre montado con user: evita desmontar el Dialog al cerrar (dejaba backdrop/bloqueo de puntero) */}
      {user ? (
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
    </Box>
  );
}
