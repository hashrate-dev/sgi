import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import {
  getEquipos,
  getEquiposMarketplaceCorpBestSellingIds,
  getEquiposMarketplaceCorpInterestingIds,
  putEquiposMarketplaceCorpBestSelling,
  putEquiposMarketplaceCorpInteresting,
  wakeUpBackend,
} from "../lib/api";
import type { EquipoASIC } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditEquipoMarketplacePrecioYTienda } from "../lib/auth";
import { AppButton, AppCard, AppSelect } from "../components/ui";

/**
 * Banners / destacados de `/marketplace/home` (más vendidos + otros interesantes).
 * Solo Administrador A/B (misma regla que guardar vitrina en equipos).
 */
export function TiendaOnlineBannersHomePage() {
  const { user } = useAuth();
  const canEditTienda = user ? canEditEquipoMarketplacePrecioYTienda(user.role) : false;

  const [equipos, setEquipos] = useState<EquipoASIC[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bestSellingSlotIds, setBestSellingSlotIds] = useState<string[]>(["", "", "", ""]);
  const [bestSellingLoadError, setBestSellingLoadError] = useState<string | null>(null);
  const [bestSellingSaving, setBestSellingSaving] = useState(false);
  const [isEditionLocked, setIsEditionLocked] = useState(true);

  const [interestingSlotIds, setInterestingSlotIds] = useState<string[]>(["", "", "", ""]);
  const [interestingLoadError, setInterestingLoadError] = useState<string | null>(null);
  const [interestingSaving, setInterestingSaving] = useState(false);

  const selectedBestSellingCount = useMemo(
    () => bestSellingSlotIds.filter((id) => id.trim().length > 0).length,
    [bestSellingSlotIds]
  );
  const selectedInterestingCount = useMemo(
    () => interestingSlotIds.filter((id) => id.trim().length > 0).length,
    [interestingSlotIds]
  );

  useEffect(() => {
    if (!canEditTienda) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    wakeUpBackend()
      .then(() => getEquipos())
      .then((res) => {
        if (!cancelled) setEquipos(res.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Error al cargar equipos");
          setEquipos([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canEditTienda]);

  useEffect(() => {
    if (!canEditTienda) {
      return;
    }
    let cancelled = false;
    void getEquiposMarketplaceCorpBestSellingIds()
      .then((res) => {
        if (cancelled) return;
        const ids = res.ids ?? [];
        setBestSellingSlotIds([ids[0] ?? "", ids[1] ?? "", ids[2] ?? "", ids[3] ?? ""]);
        setBestSellingLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setBestSellingLoadError("No se pudieron cargar los destacados de la home pública.");
      });
    void getEquiposMarketplaceCorpInterestingIds()
      .then((res) => {
        if (cancelled) return;
        const ids = res.ids ?? [];
        setInterestingSlotIds([ids[0] ?? "", ids[1] ?? "", ids[2] ?? "", ids[3] ?? ""]);
        setInterestingLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setInterestingLoadError("No se pudieron cargar «Otros Productos Interesantes».");
      });
    return () => {
      cancelled = true;
    };
  }, [canEditTienda]);

  const equiposBestSellingSelectList = useMemo(() => {
    return [...equipos]
      .filter((e) => Boolean(e.marketplaceVisible))
      .sort((a, b) => {
      const la = `${a.numeroSerie ?? a.id} ${a.marcaEquipo} ${a.modelo}`.toLowerCase();
      const lb = `${b.numeroSerie ?? b.id} ${b.marcaEquipo} ${b.modelo}`.toLowerCase();
      return la.localeCompare(lb, "es");
      });
  }, [equipos]);

  const equiposOptionsForBestSellingSlot = useCallback(
    (slotIndex: number) => {
      const selectedElsewhere = new Set(
        bestSellingSlotIds
          .map((id, j) => (j !== slotIndex && id.trim() ? id.trim() : null))
          .filter((x): x is string => Boolean(x))
      );
      return equiposBestSellingSelectList.filter(
        (e) => !selectedElsewhere.has(e.id) || bestSellingSlotIds[slotIndex] === e.id
      );
    },
    [bestSellingSlotIds, equiposBestSellingSelectList]
  );

  function setBestSellingSlot(slot: number, value: string) {
    setBestSellingSlotIds((prev) => {
      const next = [...prev];
      next[slot] = value;
      return next;
    });
  }

  const handleSaveCorpBestSelling = useCallback(async () => {
    if (!canEditTienda) {
      showToast("No tenés permisos para modificar esta sección.", "error", "Permisos");
      return;
    }
    const ids = bestSellingSlotIds.map((x) => x.trim()).filter(Boolean);
    setBestSellingSaving(true);
    try {
      await putEquiposMarketplaceCorpBestSelling({ ids });
      showToast("Destacados de la home actualizados.", "success", "Equipos más vendidos");
      setBestSellingLoadError(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar", "error", "Equipos más vendidos");
    } finally {
      setBestSellingSaving(false);
    }
  }, [bestSellingSlotIds, canEditTienda]);

  const equiposOptionsForInterestingSlot = useCallback(
    (slotIndex: number) => {
      const selectedElsewhere = new Set(
        interestingSlotIds
          .map((id, j) => (j !== slotIndex && id.trim() ? id.trim() : null))
          .filter((x): x is string => Boolean(x))
      );
      return equiposBestSellingSelectList.filter(
        (e) => !selectedElsewhere.has(e.id) || interestingSlotIds[slotIndex] === e.id
      );
    },
    [interestingSlotIds, equiposBestSellingSelectList]
  );

  function setInterestingSlot(slot: number, value: string) {
    setInterestingSlotIds((prev) => {
      const next = [...prev];
      next[slot] = value;
      return next;
    });
  }

  const handleSaveCorpInteresting = useCallback(async () => {
    if (!canEditTienda) {
      showToast("No tenés permisos para modificar esta sección.", "error", "Permisos");
      return;
    }
    const ids = interestingSlotIds.map((x) => x.trim()).filter(Boolean);
    setInterestingSaving(true);
    try {
      await putEquiposMarketplaceCorpInteresting({ ids });
      showToast("Sección «Otros Productos Interesantes» actualizada.", "success", "Home pública");
      setInterestingLoadError(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar", "error", "Home pública");
    } finally {
      setInterestingSaving(false);
    }
  }, [interestingSlotIds, canEditTienda]);

  if (!user || !canEditTienda) {
    return <Navigate to="/" replace />;
  }

  return (
    <Box minH="100vh" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }} bgGradient="linear(135deg, #074025 0%, #49f227 100%)">
      <Box maxW="1200px" mx="auto">
        <PageHeader title="Tienda Online Banners Home" showBackButton backTo="/" backText="Volver al inicio" />

        {loadError ? (
          <AppCard mt={4} borderColor="red.300" bg="red.50">
            <Text color="red.700" fontWeight="medium">{loadError}</Text>
          </AppCard>
        ) : null}

        <AppCard
          mt={4}
          p={{ base: 4, md: 6 }}
          borderColor="#2D5D46"
          borderWidth="1px"
          boxShadow="md"
        >
          <AppCard
            as="form"
            mb={5}
            p={{ base: 3, md: 4 }}
            borderColor={isEditionLocked ? "orange.200" : "green.200"}
            bg={isEditionLocked ? "orange.50" : "green.50"}
          >
            <Flex direction={{ base: "column", md: "row" }} align={{ base: "flex-start", md: "center" }} justify="space-between" gap={3}>
              <Flex align="center" gap={2}>
                <input
                  id="tienda-home-banners-lock"
                  className="form-check-input"
                  type="checkbox"
                  checked={isEditionLocked}
                  onChange={(ev) => setIsEditionLocked(ev.target.checked)}
                />
                <Text as="label" htmlFor="tienda-home-banners-lock" fontWeight="bold" color="gray.800">
                  Bloquear cambios de banners
                </Text>
              </Flex>
              <Badge colorPalette={isEditionLocked ? "orange" : "green"} variant="solid" borderRadius="full" px={3} py={1}>
                {isEditionLocked ? "Protegido" : "Editable"}
              </Badge>
            </Flex>
            <Text fontSize="sm" color="gray.700" mt={2}>
              {isEditionLocked
                ? "Edición bloqueada. Desmarcá el check para habilitar cambios temporales."
                : "Edición habilitada temporalmente. Volvé a marcar el check para proteger los cambios."}
            </Text>
          </AppCard>

          <AppCard borderColor="green.200" mb={4} aria-labelledby="hrs-corp-best-h" p={{ base: 4, md: 5 }}>
            <Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} gap={2} mb={3}>
              <Box>
                <Heading id="hrs-corp-best-h" size="md" color="green.800">
                  ⭐ Equipos más vendidos
                </Heading>
                <Text color="gray.700" fontSize="sm" mt={1}>
                  Se muestran en la primera grilla de <code>/marketplace/home</code> (orden: posición 1 → 4).
                </Text>
              </Box>
              <Badge colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
                Seleccionados: {selectedBestSellingCount}/4
              </Badge>
            </Flex>
            <Box>
              {bestSellingLoadError ? (
                <AppCard borderColor="orange.300" bg="orange.50" mb={3}>
                  <Text color="orange.700" fontSize="sm">{bestSellingLoadError}</Text>
                </AppCard>
              ) : null}
              <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }} gap={3}>
                {[0, 1, 2, 3].map((slot) => (
                  <AppSelect
                    key={slot}
                    label={`Posición ${slot + 1}`}
                    id={`hrs-corp-best-slot-${slot}`}
                    size="md"
                    rootProps={{ mb: 0 }}
                    placeholder="— Sin equipo —"
                    onChange={(ev) => setBestSellingSlot(slot, ev.target.value)}
                    disabled={loading || equipos.length === 0 || isEditionLocked}
                    value={bestSellingSlotIds[slot] ?? ""}
                  >
                    <option value="">— Sin equipo —</option>
                    {equiposOptionsForBestSellingSlot(slot).map((e) => (
                      <option key={e.id} value={e.id}>
                        {(e.numeroSerie?.trim() || e.id).slice(0, 48)} · {e.marcaEquipo} {e.modelo} · {e.procesador}
                      </option>
                    ))}
                  </AppSelect>
                ))}
              </Grid>
              <Flex align="center" gap={2} mt={4} justify="flex-end">
                <AppButton
                  onClick={() => void handleSaveCorpBestSelling()}
                  disabled={bestSellingSaving || loading || isEditionLocked}
                  loading={bestSellingSaving}
                  size="md"
                  minW={{ base: "100%", sm: "190px" }}
                  h="42px"
                  px={6}
                  borderRadius="xl"
                  fontWeight="bold"
                  letterSpacing="0.01em"
                >
                  {bestSellingSaving ? "Guardando..." : "Guardar sección"}
                </AppButton>
              </Flex>
            </Box>
          </AppCard>

          <AppCard borderColor="green.200" mb={0} aria-labelledby="hrs-corp-interesting-h" p={{ base: 4, md: 5 }}>
            <Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} gap={2} mb={3}>
              <Box>
                <Heading id="hrs-corp-interesting-h" size="md" color="green.800">
                  🛒 Otros Productos Interesantes
                </Heading>
                <Text color="gray.700" fontSize="sm" mt={1}>
                  Se muestran en la segunda grilla de <code>/marketplace/home</code> (orden: posición 1 → 4).
                </Text>
              </Box>
              <Badge colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
                Seleccionados: {selectedInterestingCount}/4
              </Badge>
            </Flex>
            <Box>
              {interestingLoadError ? (
                <AppCard borderColor="orange.300" bg="orange.50" mb={3}>
                  <Text color="orange.700" fontSize="sm">{interestingLoadError}</Text>
                </AppCard>
              ) : null}
              <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }} gap={3}>
                {[0, 1, 2, 3].map((slot) => (
                  <AppSelect
                    key={slot}
                    label={`Posición ${slot + 1}`}
                    id={`hrs-corp-interesting-slot-${slot}`}
                    size="md"
                    rootProps={{ mb: 0 }}
                    placeholder="— Sin equipo —"
                    onChange={(ev) => setInterestingSlot(slot, ev.target.value)}
                    disabled={loading || equipos.length === 0 || isEditionLocked}
                    value={interestingSlotIds[slot] ?? ""}
                  >
                    <option value="">— Sin equipo —</option>
                    {equiposOptionsForInterestingSlot(slot).map((e) => (
                      <option key={e.id} value={e.id}>
                        {(e.numeroSerie?.trim() || e.id).slice(0, 48)} · {e.marcaEquipo} {e.modelo} · {e.procesador}
                      </option>
                    ))}
                  </AppSelect>
                ))}
              </Grid>
              <Flex align="center" gap={2} mt={4} justify="flex-end">
                <AppButton
                  onClick={() => void handleSaveCorpInteresting()}
                  disabled={interestingSaving || loading || isEditionLocked}
                  loading={interestingSaving}
                  size="md"
                  minW={{ base: "100%", sm: "190px" }}
                  h="42px"
                  px={6}
                  borderRadius="xl"
                  fontWeight="bold"
                  letterSpacing="0.01em"
                >
                  {interestingSaving ? "Guardando..." : "Guardar sección"}
                </AppButton>
              </Flex>
            </Box>
          </AppCard>
        </AppCard>
      </Box>
    </Box>
  );
}
