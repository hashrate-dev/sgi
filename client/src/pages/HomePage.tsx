import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { keyframes } from "@emotion/react";
import { Navigate, Link as RouterLink } from "react-router-dom";
import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { getMarketplacePresenceStats, getMarketplaceQuoteTicketsStats } from "../lib/api";
import {
  lectorHasExplicitGrantList,
  lectorHasKryptexPool,
  canViewMarketplaceQuoteTickets,
} from "../lib/auth.js";
import { canUserAccessNavPath, canUserAccessScreen } from "../lib/sgiNavigation.js";
import { playMarketplaceOrderNotificationSound } from "../lib/marketplaceCartSound";
import { HOME_DASHBOARD_SHELL } from "../lib/sgiDashboardShell";
import { getBrowserHostname, isPrimaryPublicHost } from "../lib/hashrateHosts";
import "../styles/marketplace-hashrate.css";
import { AppCard } from "../components/ui";

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
    to: "/gestion-administrativa",
    icon: "bi-buildings",
    label: "Gestión Administrativa",
    desc: "HRS GROUP S.A. — Hosting, Equipos ASIC y Gestión Financiera",
    roles: ["admin_a", "admin_b", "operador"],
    iconBg: "#f1f5f9",
    iconColor: "#1e293b",
    iconBorderColor: "#e2e8f0",
    iconHoverBg: "#e2e8f0",
    iconHoverColor: "#0f172a",
    iconHoverBorderColor: "#cbd5e1",
  },
  {
    to: "/asic/monitor-equipos?watcher=total",
    icon: "bi-activity",
    label: "Watcher Equipos",
    desc: "NiceHash: vista TOTAL (todos los enlaces W1…WN) o un watcher suelto. El inicio abre TOTAL para ver todos los ASICs configurados.",
    roles: ["admin_a", "admin_b"],
    iconBg: "#ecf8f2",
    iconColor: "#2d5d46",
    iconBorderColor: "#c5e0d5",
    iconHoverBg: "#dff3ea",
    iconHoverColor: "#234a38",
    iconHoverBorderColor: "#9dceb8",
  },
  {
    to: "/kryptex",
    icon: "bi-currency-bitcoin",
    label: "Kryptex",
    desc: "Información de Kryptex",
    roles: ["admin_a", "admin_b", "lector"],
  },
  {
    to: "/clients/account",
    icon: "bi-journal-text",
    label: "Cuenta por cliente",
    desc: "Detalle histórico de movimientos por cliente (hosting + ASIC)",
  },
  { to: "/history", icon: "bi-clock-history", label: "Historial", desc: "Ver y gestionar comprobantes" },
  {
    to: "/clients",
    icon: "bi-people",
    label: "Clientes",
    desc: "Administración de clientes de tienda online y de hosting",
  },
  { to: "/reports", icon: "bi-graph-up", label: "Reportes", desc: "Estadísticas y análisis" },
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
  if (isPrimaryPublicHost(getBrowserHostname())) {
    return <Navigate to="/marketplace/home" replace />;
  }
  const { user } = useAuth();
  const [marketplaceOpenCount, setMarketplaceOpenCount] = useState(0);
  const [marketplaceBadgePulse, setMarketplaceBadgePulse] = useState(false);
  const [marketplaceOnlineTotal, setMarketplaceOnlineTotal] = useState(0);
  const [marketplaceOnlineLogged, setMarketplaceOnlineLogged] = useState(0);
  const [marketplaceOnlineAnon, setMarketplaceOnlineAnon] = useState(0);
  const prevOpenCountRef = useRef(0);
  const roleNorm = (r: string | undefined) => (r ?? "").toLowerCase().trim();
  const visibleMenuItems = menuItems.filter((item) => {
    if (!user) return false;
    return canUserAccessNavPath(user, item.to);
  });
  const canSeeMarketplaceOrdersCard = Boolean(user && canViewMarketplaceQuoteTickets(user));
  const canSeeMarketplacePresenceCard = Boolean(user && canUserAccessScreen(user, "marketplace-presence"));
  const canSeeMarketplaceBannersCard = Boolean(user && canUserAccessNavPath(user, "/marketplace/home-banners"));

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
    if (!canSeeMarketplacePresenceCard) return;
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
  }, [canSeeMarketplacePresenceCard]);

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
    /* Más aire arriba: el slot de icono quedaba pegado al borde superior de la tarjeta */
    pt: { base: 5, md: 6 },
    px: 4,
    pb: 4,
    display: "flex",
    flexDirection: "column" as const,
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
    _hover: { transform: "translateY(-2px)", boxShadow: "md", borderColor: "green.200" },
  };

  if (user?.role === "lector") {
    const soloKryptexLegacy =
      !lectorHasExplicitGrantList(user) || (user.lector_grants?.length ?? 0) === 0;
    if (soloKryptexLegacy && lectorHasKryptexPool(user)) {
      return <Navigate to="/kryptex" replace />;
    }
  }
  if (user?.role === "cliente") {
    return <Navigate to="/marketplace" replace />;
  }

  return (
    <Box
      minH="100vh"
      w="100%"
      maxW="100%"
      minW={0}
      px={0}
      pt={0}
      pb={{ base: 3, md: 4 }}
      bgGradient="linear(135deg, #074025 0%, #2d8f3a 55%, #49f227 100%)"
    >
      <Box {...HOME_DASHBOARD_SHELL} pt={{ base: 3, md: 4 }}>
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
            <RouterLink to="/marketplace/orders" style={DASHBOARD_CARD_LINK_STYLE}>
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

          {canSeeMarketplacePresenceCard ? (
            <RouterLink to="/marketplace/presence" role="status" aria-live="polite" style={DASHBOARD_CARD_LINK_STYLE}>
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

          {canSeeMarketplaceBannersCard ? (
            <RouterLink to="/marketplace/home-banners" style={DASHBOARD_CARD_LINK_STYLE}>
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
            <RouterLink to="/settings" style={DASHBOARD_CARD_LINK_STYLE}>
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
    </Box>
  );
}
