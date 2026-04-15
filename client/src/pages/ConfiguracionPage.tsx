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

export function ConfiguracionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_a" || user?.role === "admin_b";

  return (
    <Box minH="100vh" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }} bgGradient="linear(135deg, #f0fdf4 0%, #ffffff 30%, #f0f9f4 100%)">
      <Box maxW="1200px" mx="auto">
        <PageHeader title="Configuración" />

        <AppCard mt={4} p={{ base: 4, md: 5 }}>
          <Text color="gray.600" fontSize="sm" mb={3}>Opciones de configuración del sistema:</Text>
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap={4}>
            {configMenuItems.map((item) => (
              <Box
                key={item.to}
                as={Link}
                to={item.to}
                textDecoration="none"
                _hover={{ textDecoration: "none" }}
              >
                <AppCard h="100%" transition="all 0.2s ease" _hover={{ transform: "translateY(-2px)", boxShadow: "md" }}>
                  <Flex
                    w="44px"
                    h="44px"
                    align="center"
                    justify="center"
                    borderRadius="12px"
                    bg="green.50"
                    color="green.700"
                    fontSize="lg"
                    mb={3}
                  >
                  <i className={`bi ${item.icon}`} />
                  </Flex>
                  <Heading size="sm" color="gray.800" mb={1}>{item.label}</Heading>
                  <Text fontSize="sm" color="gray.600">{item.desc}</Text>
                </AppCard>
              </Box>
            ))}
            {isAdmin && (
              <Box as={Link} to="/usuarios" textDecoration="none" _hover={{ textDecoration: "none" }}>
                <AppCard h="100%" transition="all 0.2s ease" _hover={{ transform: "translateY(-2px)", boxShadow: "md" }}>
                  <Flex
                    w="44px"
                    h="44px"
                    align="center"
                    justify="center"
                    borderRadius="12px"
                    bg="blue.50"
                    color="blue.700"
                    fontSize="lg"
                    mb={3}
                  >
                    <i className="bi bi-shield-lock" />
                  </Flex>
                  <Heading size="sm" color="gray.800" mb={1}>Usuarios y permisos</Heading>
                  <Text fontSize="sm" color="gray.600">Gestionar accesos y roles</Text>
                </AppCard>
              </Box>
            )}
          </Grid>
        </AppCard>
      </Box>
    </Box>
  );
}
