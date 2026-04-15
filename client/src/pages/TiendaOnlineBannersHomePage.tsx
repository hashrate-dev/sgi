import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
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
    return [...equipos].sort((a, b) => {
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

        <AppCard mt={4} p={{ base: 4, md: 5 }}>
          <Text color="gray.600" fontSize="sm" mb={3}>
            Definí qué equipos ASIC se muestran en <code>/marketplace/home</code> (sección «Equipos más vendidos» y «Otros Productos Interesantes»).
          </Text>

          <AppCard
            as="form"
            borderColor="gray.200"
            bg="gray.50"
            mb={4}
            aria-label="Bloqueo de seguridad para edición"
            p={3}
          >
            <Flex align="center" gap={2} wrap="wrap">
              <input
                id="tienda-home-banners-lock"
                className="form-check-input"
                type="checkbox"
                checked={isEditionLocked}
                onChange={(ev) => setIsEditionLocked(ev.target.checked)}
              />
              <Text as="label" htmlFor="tienda-home-banners-lock" fontWeight="semibold" color="gray.800">
                Bloquear cambios de banners (seguridad)
              </Text>
            </Flex>
            <Text fontSize="sm" color="gray.600" mt={2}>
              {isEditionLocked
                ? "Edición bloqueada. Desmarcá este tic para habilitar cambios temporales."
                : "Edición habilitada temporalmente. Marcá el tic nuevamente para volver a bloquear."}
            </Text>
          </AppCard>

          <AppCard borderColor="green.300" mb={4} aria-labelledby="hrs-corp-best-h">
            <Box mb={3}>
              <Heading id="hrs-corp-best-h" size="sm" color="green.800">
                ⭐ Equipos más vendidos (home pública)
              </Heading>
              <Text color="gray.700" fontSize="sm" mt={2}>
                Elegí hasta <strong>4</strong> equipos del listado ASIC (tienda + inventario). Se publican en la sección homónima de{" "}
                <code>/marketplace/home</code> (orden: posición 1 → 4).
              </Text>
            </Box>
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
                    size="sm"
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
              <Flex align="center" gap={2} mt={3}>
                <AppButton
                  onClick={() => void handleSaveCorpBestSelling()}
                  disabled={bestSellingSaving || loading || isEditionLocked}
                  loading={bestSellingSaving}
                >
                  {bestSellingSaving ? "Guardando..." : "Guardar en la home"}
                </AppButton>
              </Flex>
            </Box>
          </AppCard>

          <AppCard borderColor="green.300" mb={0} aria-labelledby="hrs-corp-interesting-h">
            <Box mb={3}>
              <Heading id="hrs-corp-interesting-h" size="sm" color="green.800">
                🛒 Otros Productos Interesantes (home pública)
              </Heading>
              <Text color="gray.700" fontSize="sm" mt={2}>
                Elegí hasta <strong>4</strong> equipos del listado ASIC. Se muestran en la sección homónima de <code>/marketplace/home</code> (orden:
                posición 1 → 4).
              </Text>
            </Box>
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
                    size="sm"
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
              <Flex align="center" gap={2} mt={3}>
                <AppButton
                  onClick={() => void handleSaveCorpInteresting()}
                  disabled={interestingSaving || loading || isEditionLocked}
                  loading={interestingSaving}
                >
                  {interestingSaving ? "Guardando..." : "Guardar en la home"}
                </AppButton>
              </Flex>
            </Box>
          </AppCard>
        </AppCard>
      </Box>
    </Box>
  );
}
