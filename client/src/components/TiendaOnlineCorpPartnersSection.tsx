import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Box, Flex, Grid, Heading, Image, Text } from "@chakra-ui/react";
import {
  getEquiposMarketplaceCorpPartners,
  putEquiposMarketplaceCorpPartners,
  uploadMarketplaceAsicImage,
  type CorpOfficialPartnerDto,
} from "../lib/api.js";
import { resolveCorpPartnerImageSrc } from "../lib/marketplaceCorpPartners.js";
import { showToast } from "./ToastNotification.js";
import { AppButton, AppCard } from "./ui/index.js";

type Props = {
  isEditionLocked: boolean;
};

function newPartnerId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TiendaOnlineCorpPartnersSection({ isEditionLocked }: Props) {
  const [partners, setPartners] = useState<CorpOfficialPartnerDto[]>([]);
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
    getEquiposMarketplaceCorpPartners()
      .then((r) => setPartners(Array.isArray(r.partners) ? r.partners : []))
      .catch(() => setLoadError("No se pudieron cargar los partners oficiales."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(async (next: CorpOfficialPartnerDto[], toastMsg?: string) => {
    setSaving(true);
    try {
      const r = await putEquiposMarketplaceCorpPartners({ partners: next });
      setPartners(r.partners ?? next);
      if (toastMsg) showToast(toastMsg, "success", "Partners oficiales");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar", "error", "Partners oficiales");
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const enabledCount = partners.filter((p) => p.enabled).length;

  async function handleToggleEnabled(id: string) {
    if (isEditionLocked) return;
    const next = partners.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    setPartners(next);
    try {
      await persist(next);
    } catch {
      load();
    }
  }

  async function handleRemove(id: string) {
    if (isEditionLocked) return;
    if (!window.confirm("¿Quitar este logo de Partners oficiales?")) return;
    const next = partners.filter((p) => p.id !== id);
    setPartners(next);
    try {
      await persist(next, "Logo eliminado");
    } catch {
      load();
    }
  }

  async function handleMove(id: string, dir: -1 | 1) {
    if (isEditionLocked) return;
    const idx = partners.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= partners.length) return;
    const next = [...partners];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setPartners(next);
    try {
      await persist(next, "Orden actualizado");
    } catch {
      load();
    }
  }

  async function handleFieldChange(id: string, patch: Partial<CorpOfficialPartnerDto>) {
    if (isEditionLocked) return;
    const next = partners.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPartners(next);
  }

  async function saveFields() {
    try {
      await persist(partners, "Cambios guardados");
    } catch {
      load();
    }
  }

  async function uploadImageForPartner(partnerId: string, file: File) {
    setUploadingId(partnerId);
    try {
      const { url } = await uploadMarketplaceAsicImage(file);
      const next = partners.map((p) => (p.id === partnerId ? { ...p, imageUrl: url } : p));
      setPartners(next);
      await persist(next, "Imagen actualizada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al subir imagen", "error", "Partners oficiales");
    } finally {
      setUploadingId(null);
    }
  }

  function triggerReplaceImage(partnerId: string) {
    if (isEditionLocked) return;
    fileInputRef.current?.setAttribute("data-partner-id", partnerId);
    fileInputRef.current?.click();
  }

  async function handleAddPartner(file: File, name: string) {
    if (isEditionLocked) return;
    const label = name.trim() || file.name.replace(/\.[^.]+$/, "") || "Partner";
    setUploadingId("__new__");
    try {
      const { url } = await uploadMarketplaceAsicImage(file);
      const next: CorpOfficialPartnerDto[] = [
        ...partners,
        { id: newPartnerId(), name: label.slice(0, 120), href: "", imageUrl: url, enabled: true },
      ];
      setPartners(next);
      await persist(next, "Partner agregado");
      setPendingAddName("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al agregar", "error", "Partners oficiales");
    } finally {
      setUploadingId(null);
      if (addFileRef.current) addFileRef.current.value = "";
    }
  }

  return (
    <AppCard borderColor="green.200" mt={4} aria-labelledby="hrs-corp-partners-h" p={{ base: 4, md: 5 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const pid = fileInputRef.current?.getAttribute("data-partner-id");
          e.target.value = "";
          if (f && pid) void uploadImageForPartner(pid, f);
        }}
      />
      <input
        ref={addFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleAddPartner(f, pendingAddName);
        }}
      />

      <Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} gap={2} mb={3}>
        <Box>
          <Heading id="hrs-corp-partners-h" size="md" color="green.800">
            🤝 Partners oficiales
          </Heading>
          <Text color="gray.700" fontSize="sm" mt={1}>
            Logos al pie de <code>/marketplace/home</code> (sección «Partners oficiales»). Usá <strong>PNG con fondo transparente</strong> para que no se vea caja gris alrededor del logo.
          </Text>
        </Box>
        <Badge colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
          Visibles: {enabledCount}/{partners.length}
        </Badge>
      </Flex>

      {loadError ? (
        <AppCard borderColor="orange.300" bg="orange.50" mb={3}>
          <Text color="orange.700" fontSize="sm">{loadError}</Text>
        </AppCard>
      ) : null}

      {loading ? (
        <Text color="gray.600" fontSize="sm">
          Cargando partners…
        </Text>
      ) : (
        <>
          <Grid templateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }} gap={3} mb={4}>
            {partners.map((p, index) => (
              <AppCard key={p.id} borderColor="gray.200" bg="white" p={3}>
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
                    {p.imageUrl ? (
                      <Image
                        src={resolveCorpPartnerImageSrc(p.imageUrl)}
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
                      value={p.name}
                      disabled={isEditionLocked}
                      placeholder="Nombre (marca)"
                      onChange={(e) => void handleFieldChange(p.id, { name: e.target.value })}
                    />
                    <input
                      className="form-control form-control-sm mb-2"
                      value={p.href}
                      disabled={isEditionLocked}
                      placeholder="https://… (opcional)"
                      onChange={(e) => void handleFieldChange(p.id, { href: e.target.value })}
                    />
                    <Flex flexWrap="wrap" gap={1} align="center">
                      <label className="form-check form-check-inline mb-0 small">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={p.enabled}
                          disabled={isEditionLocked || saving}
                          onChange={() => void handleToggleEnabled(p.id)}
                        />
                        <span className="form-check-label">Visible en home</span>
                      </label>
                    </Flex>
                    <Flex flexWrap="wrap" gap={1} mt={2}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={isEditionLocked || index === 0 || saving}
                        onClick={() => void handleMove(p.id, -1)}
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={isEditionLocked || index === partners.length - 1 || saving}
                        onClick={() => void handleMove(p.id, 1)}
                        title="Bajar"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={isEditionLocked || uploadingId === p.id}
                        onClick={() => triggerReplaceImage(p.id)}
                      >
                        {uploadingId === p.id ? "Subiendo…" : "Cambiar logo"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={isEditionLocked || saving}
                        onClick={() => void handleRemove(p.id)}
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
              Agregar partner
            </Text>
            <Flex direction={{ base: "column", sm: "row" }} gap={2} align={{ sm: "flex-end" }}>
              <Box flex="1">
                <label className="form-label small mb-1">Nombre</label>
                <input
                  className="form-control form-control-sm"
                  value={pendingAddName}
                  disabled={isEditionLocked}
                  placeholder="Ej: NiceHash"
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
