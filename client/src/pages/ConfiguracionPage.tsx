import { Link } from "react-router-dom";
import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { AppCard } from "../components/ui";

const configMenuItems: Array<{ to: string; icon: string; label: string; desc: string }> = [
  {
    to: "/marketplacedashboard",
    icon: "bi-shop-window",
    label: "Tienda Online Configuración",
    desc: "Configuración de precios y productos publicados en la tienda ASIC",
  },
  { to: "/equipos-asic/equipos", icon: "bi-gear", label: "Gestión de Equipos ASIC", desc: "Configuración de Equipos ASIC por marca y modelo" },
  { to: "/equipos-asic/setup", icon: "bi-tools", label: "Gestión de Setup", desc: "Configuración de tipos de Setup" },
  { to: "/equipos-asic/items-garantia", icon: "bi-list-ul", label: "Gestión de Garantías ANDE", desc: "Configuración de Garantías ANDE por tipo de equipo" },
];

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

const DASHBOARD_BI_ICON_SIZE_LG = "2.35rem";

type ConfigCardItem = { to: string; icon: string; label: string; desc: string };

function ConfigMenuCard(item: ConfigCardItem) {
  return (
    <Box
      as={Link}
      to={item.to}
      textDecoration="none"
      _hover={{ textDecoration: "none" }}
    >
      <AppCard
        h="100%"
        minH={{ base: "190px", md: "210px" }}
        p={{ base: 4, md: 5 }}
        transition="all 0.2s ease"
        _hover={{ transform: "translateY(-2px)", boxShadow: "md" }}
      >
        <Flex
          {...ICON_SLOT_PROPS}
          mb={3}
        >
          <Box as="i" className={`bi ${item.icon}`} fontSize={DASHBOARD_BI_ICON_SIZE_LG} lineHeight={1} aria-hidden />
        </Flex>
        <Heading
          as="h3"
          fontSize={{ base: "1.55rem", md: "1.75rem" }}
          lineHeight={1.15}
          color="gray.800"
          mb={2}
          letterSpacing="-0.01em"
          fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
        >
          {item.label}
        </Heading>
        <Text
          fontSize={{ base: "0.95rem", md: "1rem" }}
          lineHeight={1.4}
          color="gray.600"
          fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
        >
          {item.desc}
        </Text>
      </AppCard>
    </Box>
  );
}

export function ConfiguracionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_a" || user?.role === "admin_b";
  const cards: ConfigCardItem[] = [
    ...configMenuItems,
    ...(isAdmin
      ? [{ to: "/usuarios", icon: "bi-shield-lock", label: "Usuarios y permisos", desc: "Gestionar accesos y roles" }]
      : []),
  ];

  return (
    <Box minH="100vh" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }} bgGradient="linear(135deg, #f0fdf4 0%, #ffffff 30%, #f0f9f4 100%)">
      <Box maxW="1200px" mx="auto">
        <PageHeader title="Configuración" />

        <AppCard mt={4} p={{ base: 4, md: 5 }}>
          <Text color="gray.600" fontSize="sm" mb={3}>Opciones de configuración del sistema:</Text>
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap={4}>
            {cards.map((item) => (
              <Box key={item.to}>{ConfigMenuCard(item)}</Box>
            ))}
          </Grid>
        </AppCard>
      </Box>
    </Box>
  );
}
