import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Box, Flex, Grid, Heading, Image, Text } from "@chakra-ui/react";
import {
  getEquiposMarketplaceCorpManufacturers,
  putEquiposMarketplaceCorpManufacturers,
  uploadMarketplaceAsicImage,
  type CorpIndustryManufacturerDto,
} from "../lib/api.js";
import {
  resolveCorpManufacturerImageSrc,
  slugFromManufacturerName,
} from "../lib/marketplaceCorpManufacturers.js";
import { showToast } from "./ToastNotification.js";
import { AppButton, AppCard } from "./ui/index.js";

type Props = {
  isEditionLocked: boolean;
};

function newManufacturerId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TiendaOnlineCorpManufacturersSection({ isEditionLocked }: Props) {
  const [manufacturers, setManufacturers] = useState<CorpIndustryManufacturerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const [pendingAddName, setPendingAddName] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    getEquiposMarketplaceCorpManufacturers()
      .then((r) => setManufacturers(Array.isArray(r.manufacturers) ? r.manufacturers : []))
      .catch(() => setLoadError("No se pudieron cargar los logos de fabricantes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(async (next: CorpIndustryManufacturerDto[], toastMsg?: string) => {
    setSaving(true);
    try {
      const r = await putEquiposMarketplaceCorpManufacturers({ manufacturers: next });
      setManufacturers(r.manufacturers ?? next);
      if (toastMsg) showToast(toastMsg, "success", "Fabricantes");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar", "error", "Fabricantes");
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const enabledCount = manufacturers.filter((m) => m.enabled).length;

  async function handleToggleEnabled(id: string) {
    if (isEditionLocked) return;
    const next = manufacturers.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m));
    setManufacturers(next);
    try {
      await persist(next);
    } catch {
      load();
    }
  }

  async function handleRemove(id: string) {
    if (isEditionLocked) return;
    if (!window.confirm("¿Quitar este logo de fabricantes?")) return;
    const next = manufacturers.filter((m) => m.id !== id);
    setManufacturers(next);
    try {
      await persist(next, "Logo eliminado");
    } catch {
      load();
    }
  }

  async function handleMove(id: string, dir: -1 | 1) {
    if (isEditionLocked) return;
    const idx = manufacturers.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= manufacturers.length) return;
    const next = [...manufacturers];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setManufacturers(next);
    try {
      await persist(next, "Orden actualizado");
    } catch {
      load();
    }
  }

  async function handleFieldChange(id: string, patch: Partial<CorpIndustryManufacturerDto>) {
    if (isEditionLocked) return;
    const next = manufacturers.map((m) => {
      if (m.id !== id) return m;
      const merged = { ...m, ...patch };
      if ("name" in patch && !("slug" in patch)) {
        merged.slug = slugFromManufacturerName(merged.name);
      }
      return merged;
    });
    setManufacturers(next);
  }

  async function saveFields() {
    try {
      await persist(manufacturers, "Cambios guardados");
    } catch {
      load();
    }
  }

  async function uploadImageForManufacturer(manufacturerId: string, file: File) {
    setUploadingId(manufacturerId);
    try {
      const { url } = await uploadMarketplaceAsicImage(file);
      const next = manufacturers.map((m) => (m.id === manufacturerId ? { ...m, imageUrl: url } : m));
      setManufacturers(next);
      await persist(next, "Imagen actualizada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al subir imagen", "error", "Fabricantes");
    } finally {
      setUploadingId(null);
    }
  }

  function triggerReplaceImage(manufacturerId: string) {
    if (isEditionLocked) return;
    fileInputRef.current?.setAttribute("data-manufacturer-id", manufacturerId);
    fileInputRef.current?.click();
  }

  async function handleAddManufacturer(file: File, name: string) {
    if (isEditionLocked) return;
    const label = name.trim() || file.name.replace(/\.[^.]+$/, "") || "Fabricante";
    setUploadingId("__new__");
    try {
      const { url } = await uploadMarketplaceAsicImage(file);
      const slug = slugFromManufacturerName(label);
      const next: CorpIndustryManufacturerDto[] = [
        ...manufacturers,
        {
          id: newManufacturerId(),
          name: label.slice(0, 120),
          href: "",
          imageUrl: url,
          enabled: true,
          slug,
        },
      ];
      setManufacturers(next);
      await persist(next, "Fabricante agregado");
      setPendingAddName("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al agregar", "error", "Fabricantes");
    } finally {
      setUploadingId(null);
      if (addFileRef.current) addFileRef.current.value = "";
    }
  }

  return (
    <AppCard borderColor="green.200" mt={4} aria-labelledby="hrs-corp-manufacturers-h" p={{ base: 4, md: 5 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const mid = fileInputRef.current?.getAttribute("data-manufacturer-id");
          e.target.value = "";
          if (f && mid) void uploadImageForManufacturer(mid, f);
        }}
      />
      <input
        ref={addFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleAddManufacturer(f, pendingAddName);
        }}
      />

      <Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} gap={2} mb={3}>
        <Box>
          <Heading id="hrs-corp-manufacturers-h" size="md" color="green.800">
            🏭 Confiamos en los mejores fabricantes de la industria
          </Heading>
          <Text color="gray.700" fontSize="sm" mt={1}>
            Logos en <code>/marketplace/home</code> (sección de fabricantes, arriba del FAQ). Orden de izquierda a derecha.
          </Text>
        </Box>
        <Badge colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
          Visibles: {enabledCount}/{manufacturers.length}
        </Badge>
      </Flex>

      {loadError ? (
        <AppCard borderColor="orange.300" bg="orange.50" mb={3}>
          <Text color="orange.700" fontSize="sm">{loadError}</Text>
        </AppCard>
      ) : null}

      {loading ? (
        <Text color="gray.600" fontSize="sm">
          Cargando fabricantes…
        </Text>
      ) : (
        <>
          <Grid templateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }} gap={3} mb={4}>
            {manufacturers.map((m, index) => (
              <AppCard key={m.id} borderColor="gray.200" bg="white" p={3}>
                <Flex gap={3} align="flex-start">
                  <Box
                    flexShrink={0}
                    w="120px"
                    h="56px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    bg="gray.50"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="gray.200"
                    overflow="hidden"
                  >
                    {m.imageUrl ? (
                      <Image
                        src={resolveCorpManufacturerImageSrc(m.imageUrl)}
                        alt=""
                        maxW="100%"
                        maxH="100%"
                        objectFit="contain"
                      />
                    ) : (
                      <Text fontSize="xs" color="gray.400">
                        Sin imagen
                      </Text>
                    )}
                  </Box>
                  <Box flex="1" minW={0}>
                    <input
                      className="form-control form-control-sm mb-2"
                      value={m.name}
                      disabled={isEditionLocked}
                      placeholder="Nombre (fabricante)"
                      onChange={(e) => void handleFieldChange(m.id, { name: e.target.value })}
                    />
                    <input
                      className="form-control form-control-sm mb-2"
                      value={m.slug}
                      disabled={isEditionLocked}
                      placeholder="slug-css (ej: bitmain)"
                      onChange={(e) => void handleFieldChange(m.id, { slug: e.target.value })}
                    />
                    <input
                      className="form-control form-control-sm mb-2"
                      value={m.href}
                      disabled={isEditionLocked}
                      placeholder="https://… (opcional)"
                      onChange={(e) => void handleFieldChange(m.id, { href: e.target.value })}
                    />
                    <Flex flexWrap="wrap" gap={1} align="center">
                      <label className="form-check form-check-inline mb-0 small">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={m.enabled}
                          disabled={isEditionLocked || saving}
                          onChange={() => void handleToggleEnabled(m.id)}
                        />
                        <span className="form-check-label">Visible en home</span>
                      </label>
                    </Flex>
                    <Flex flexWrap="wrap" gap={1} mt={2}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={isEditionLocked || index === 0 || saving}
                        onClick={() => void handleMove(m.id, -1)}
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={isEditionLocked || index === manufacturers.length - 1 || saving}
                        onClick={() => void handleMove(m.id, 1)}
                        title="Bajar"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={isEditionLocked || uploadingId === m.id}
                        onClick={() => triggerReplaceImage(m.id)}
                      >
                        {uploadingId === m.id ? "Subiendo…" : "Cambiar logo"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={isEditionLocked || saving}
                        onClick={() => void handleRemove(m.id)}
                      >
                        Quitar
                      </button>
                    </Flex>
                  </Box>
                </Flex>
              </AppCard>
            ))}
          </Grid>

          <AppCard borderColor="gray.200" bg="gray.50" p={3} mb={3}>
            <Text fontWeight="bold" color="gray.800" fontSize="sm" mb={2}>
              Agregar fabricante
            </Text>
            <Flex direction={{ base: "column", sm: "row" }} gap={2} align={{ sm: "flex-end" }}>
              <Box flex="1">
                <label className="form-label small mb-1">Nombre</label>
                <input
                  className="form-control form-control-sm"
                  value={pendingAddName}
                  disabled={isEditionLocked}
                  placeholder="Ej: Bitmain"
                  onChange={(e) => setPendingAddName(e.target.value)}
                />
              </Box>
              <AppButton
                size="md"
                minW={{ sm: "200px" }}
                disabled={isEditionLocked || uploadingId === "__new__"}
                loading={uploadingId === "__new__"}
                onClick={() => addFileRef.current?.click()}
              >
                Subir logo y agregar
              </AppButton>
            </Flex>
          </AppCard>

          <Flex justify="flex-end" gap={2}>
            <AppButton variant="outline" size="md" onClick={() => load()} disabled={loading || saving}>
              Recargar
            </AppButton>
            <AppButton
              size="md"
              minW={{ base: "100%", sm: "220px" }}
              disabled={isEditionLocked || saving || loading}
              loading={saving}
              onClick={() => void saveFields()}
            >
              Guardar textos y enlaces
            </AppButton>
          </Flex>
        </>
      )}
    </AppCard>
  );
}
