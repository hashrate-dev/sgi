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
        className="reportes-card mineria-hub-card"
        h="100%"
        minH={{ base: "176px", md: "176px" }}
        transition="all 0.2s ease"
        _hover={{ transform: "translateY(-2px)", boxShadow: "md" }}
      >
        <Flex
          className="reportes-card-icon"
          mb={3}
        >
          <i className={`bi ${item.icon}`} aria-hidden />
        </Flex>
        <Heading
          as="h3"
          className="reportes-card-title"
        >
          {item.label}
        </Heading>
        <Text
          className="reportes-card-desc"
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
    <Box minH="100vh" px={{ base: 4, md: 6 }} pt={{ base: 2, md: 2 }} pb={{ base: 3, md: 4 }} bgGradient="linear(135deg, #f0fdf4 0%, #ffffff 30%, #f0f9f4 100%)">
      <Box maxW="1320px" mx="auto">
        <PageHeader title="Configuración" />

        <AppCard mt={3} p={{ base: 3, md: 4 }}>
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
