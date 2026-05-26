import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { wpUpload } from "../lib/marketplaceWpAssets.js";
import {
  getEquiposMarketplaceCorpCompanyTeam,
  putEquiposMarketplaceCorpCompanyTeam,
  uploadMarketplaceAsicImage,
  type CorpCompanyTeamMemberDto,
} from "../lib/api.js";
import { showToast } from "./ToastNotification.js";
import { AppButton, AppCard } from "./ui/index.js";

type TeamDefaultKey = "fab" | "jv" | "af" | "rg" | "ab" | "dv" | "dg";

const TEAM_DEFAULTS: readonly {
  key: TeamDefaultKey;
  img: string;
  linkedin?: string;
}[] = [
  { key: "fab", img: wpUpload("FB-Team-1-1024x991.png"), linkedin: "https://www.linkedin.com/in/fabrianchi/" },
  { key: "jv", img: wpUpload("JV-Team-1024x991.png"), linkedin: "https://www.linkedin.com/in/jlvilasoler/" },
  { key: "af", img: wpUpload("AF-Team-1024x991.png"), linkedin: "https://www.linkedin.com/in/figueroaanthony/" },
  { key: "rg", img: wpUpload("RG-1024x991.png") },
  { key: "dv", img: wpUpload("DV-Team.png") },
  { key: "ab", img: wpUpload("AB-Team-1024x991.png") },
  { key: "dg", img: wpUpload("DG-Team-HRS-1024x991.png") },
];

function newTeamMemberId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function bioTextToParas(text: string): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  return t
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parasToBioText(paras: string[]): string {
  return (paras ?? []).map((p) => p.trim()).filter(Boolean).join("\n\n");
}

export function TiendaOnlineCorpCompanyTeamSection({ isEditionLocked }: { isEditionLocked: boolean }) {
  const { t } = useMarketplaceLang();

  const fallbackMembers = useMemo(() => {
    const getBio = (key: TeamDefaultKey): string[] => {
      if (key === "jv") {
        const b1 = t("company.m.jv.b1");
        const b2 = t("company.m.jv.b2");
        const b3a = t("company.m.jv.b3a");
        const brand = t("company.m.jv.brand");
        const b3b = t("company.m.jv.b3b");
        const b4 = t("company.m.jv.b4");
        const b3 = `${b3a}${brand}${b3b}`.trim();
        return [b1, b2, b3, b4].map((x) => String(x ?? "").trim()).filter(Boolean);
      }

      const b1 = t(`company.m.${key}.b1`);
      const b2 = t(`company.m.${key}.b2`);
      return [b1, b2].map((x) => String(x ?? "").trim()).filter(Boolean);
    };

    return TEAM_DEFAULTS.map((m) => ({
      id: m.key,
      role: t(`company.m.${m.key}.role`),
      name: t(`company.m.${m.key}.name`),
      imageUrl: m.img,
      linkedin: m.linkedin,
      bio: getBio(m.key),
      enabled: true,
    })) satisfies CorpCompanyTeamMemberDto[];
  }, [t]);

  const [members, setMembers] = useState<CorpCompanyTeamMemberDto[]>(() => fallbackMembers);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAvatarFileRef = useRef<HTMLInputElement>(null);

  const [pendingAddRole, setPendingAddRole] = useState("");
  const [pendingAddName, setPendingAddName] = useState("");
  const [pendingAddLinkedin, setPendingAddLinkedin] = useState("");
  const [pendingAddBioText, setPendingAddBioText] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void getEquiposMarketplaceCorpCompanyTeam()
      .then((r) => {
        const incoming = Array.isArray(r.members) ? r.members : [];
        if (incoming.length > 0) setMembers(incoming);
        else setMembers(fallbackMembers);
      })
      .catch(() => setLoadError("No se pudieron cargar los datos del equipo."))
      .finally(() => setLoading(false));
  }, [fallbackMembers]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (next: CorpCompanyTeamMemberDto[], toastMsg?: string) => {
      setSaving(true);
      try {
        const r = await putEquiposMarketplaceCorpCompanyTeam({ members: next });
        setMembers(r.members ?? next);
        if (toastMsg) showToast(toastMsg, "success", "Equipo de la empresa");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Error al guardar", "error", "Equipo de la empresa");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  function handleFieldChange(id: string, patch: Partial<CorpCompanyTeamMemberDto>) {
    if (isEditionLocked) return;
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function uploadImageForMember(memberId: string, file: File) {
    setUploadingId(memberId);
    try {
      const { url } = await uploadMarketplaceAsicImage(file);
      const next = members.map((m) => (m.id === memberId ? { ...m, imageUrl: url } : m));
      setMembers(next);
      // No persistimos auto para no forzar múltiples PUT; el usuario guarda al final.
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al subir imagen", "error", "Equipo de la empresa");
    } finally {
      setUploadingId(null);
    }
  }

  function triggerReplaceImage(memberId: string) {
    if (isEditionLocked) return;
    fileInputRef.current?.setAttribute("data-member-id", memberId);
    fileInputRef.current?.click();
  }

  async function handleAddMember(file: File | undefined) {
    if (isEditionLocked) return;
    const role = pendingAddRole.trim();
    const name = pendingAddName.trim();
    const linkedin = pendingAddLinkedin.trim();
    const bio = bioTextToParas(pendingAddBioText);
    if (!role || !name || bio.length === 0) {
      showToast("Completá Rol, Nombre y Biografía (mínimo 1 párrafo).", "warning", "Equipo de la empresa");
      return;
    }
    if (!file) {
      showToast("Elegí una foto para el integrante.", "warning", "Equipo de la empresa");
      return;
    }

    const id = newTeamMemberId();
    try {
      setUploadingId(id);
      const { url } = await uploadMarketplaceAsicImage(file);
      const next: CorpCompanyTeamMemberDto[] = [
        ...members,
        {
          id,
          role: role.slice(0, 120),
          name: name.slice(0, 140),
          linkedin: linkedin ? linkedin.slice(0, 500) : undefined,
          imageUrl: url,
          bio,
          enabled: true,
        },
      ];
      setMembers(next);
      setPendingAddRole("");
      setPendingAddName("");
      setPendingAddLinkedin("");
      setPendingAddBioText("");
      if (addAvatarFileRef.current) addAvatarFileRef.current.value = "";
      showToast("Integrante agregado (pendiente de guardar).", "success", "Equipo de la empresa");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al agregar", "error", "Equipo de la empresa");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleRemoveMember(id: string) {
    if (isEditionLocked) return;
    if (!window.confirm("¿Quitar este integrante del equipo?")) return;
    const next = members.filter((m) => m.id !== id);
    setMembers(next);
  }

  const enabledCount = members.filter((m) => m.enabled).length;

  return (
    <AppCard borderColor="green.200" mt={4} aria-labelledby="hrs-corp-team-h" p={{ base: 4, md: 5 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const mid = fileInputRef.current?.getAttribute("data-member-id");
          e.target.value = "";
          if (f && mid) void uploadImageForMember(mid, f);
        }}
      />
      <input
        ref={addAvatarFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleAddMember(f);
          e.target.value = "";
        }}
      />

      <Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} gap={2} mb={3}>
        <Box>
          <Heading id="hrs-corp-team-h" size="md" color="green.800">
            👥 Equipo de la empresa
          </Heading>
          <Text color="gray.700" fontSize="sm" mt={1}>
            Fotos y textos que se muestran en la sección de equipo (tarjetas + modal biografía).
          </Text>
        </Box>
        <Badge colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
          Integrantes: {enabledCount}/{members.length}
        </Badge>
      </Flex>

      {loadError ? (
        <AppCard borderColor="orange.300" bg="orange.50" mb={3}>
          <Text color="orange.700" fontSize="sm">{loadError}</Text>
        </AppCard>
      ) : null}

      {loading ? (
        <Text color="gray.600" fontSize="sm">
          Cargando equipo…
        </Text>
      ) : (
        <>
          <Grid templateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }} gap={3} mb={4}>
            {members.map((m) => (
              <AppCard key={m.id} borderColor="gray.200" bg="white" p={3}>
                <Flex gap={3} align="flex-start">
                  <Box
                    flexShrink={0}
                    w="120px"
                    h="120px"
                    bg="#f3f4f6"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="gray.200"
                    overflow="hidden"
                    position="relative"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    className="corp-logo-home-style"
                  >
                    {m.imageUrl ? (
                      <img
                        src={m.imageUrl}
                        alt={m.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 24%" }}
                      />
                    ) : (
                      <Text fontSize="xs" color="gray.400">
                        Sin foto
                      </Text>
                    )}
                    <Box
                      position="absolute"
                      inset={0}
                      bg="rgba(15, 23, 42, 0.05)"
                      opacity={uploadingId === m.id ? 1 : 0}
                      pointerEvents="none"
                      transition="opacity 150ms ease"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text fontSize="sm" color="gray.700">
                        Subiendo…
                      </Text>
                    </Box>
                  </Box>

                  <Box flex="1" minW={0}>
                    <input
                      className="form-control form-control-sm mb-2"
                      value={m.role}
                      disabled={isEditionLocked || saving}
                      placeholder="Rol (ej: Co-Fundador)"
                      onChange={(e) => handleFieldChange(m.id, { role: e.target.value })}
                    />
                    <input
                      className="form-control form-control-sm mb-2"
                      value={m.name}
                      disabled={isEditionLocked || saving}
                      placeholder="Nombre"
                      onChange={(e) => handleFieldChange(m.id, { name: e.target.value })}
                    />
                    <input
                      className="form-control form-control-sm mb-2"
                      value={m.linkedin ?? ""}
                      disabled={isEditionLocked || saving}
                      placeholder="LinkedIn (opcional · https://...)"
                      onChange={(e) => handleFieldChange(m.id, { linkedin: e.target.value || undefined })}
                    />
                    <textarea
                      className="form-control form-control-sm"
                      style={{ minHeight: 120, resize: "vertical" }}
                      value={parasToBioText(m.bio)}
                      disabled={isEditionLocked || saving}
                      placeholder="Biografía: separá párrafos con una línea en blanco"
                      onChange={(e) => handleFieldChange(m.id, { bio: bioTextToParas(e.target.value) })}
                    />

                    <Flex flexWrap="wrap" gap={1} mt={2} align="center">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={isEditionLocked || uploadingId === m.id}
                        onClick={() => triggerReplaceImage(m.id)}
                      >
                        {uploadingId === m.id ? "Subiendo…" : "Cambiar foto"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={isEditionLocked || saving}
                        onClick={() => void handleRemoveMember(m.id)}
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
              Agregar integrante
            </Text>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={2}>
              <Box>
                <label className="form-label small mb-1">Rol *</label>
                <input
                  className="form-control form-control-sm"
                  value={pendingAddRole}
                  disabled={isEditionLocked || saving}
                  onChange={(e) => setPendingAddRole(e.target.value)}
                  placeholder="Ej: Co-Fundador"
                />
              </Box>
              <Box>
                <label className="form-label small mb-1">Nombre *</label>
                <input
                  className="form-control form-control-sm"
                  value={pendingAddName}
                  disabled={isEditionLocked || saving}
                  onChange={(e) => setPendingAddName(e.target.value)}
                  placeholder="Nombre y apellido"
                />
              </Box>
              <Box style={{ gridColumn: "1 / -1" }}>
                <label className="form-label small mb-1">LinkedIn (opcional)</label>
                <input
                  className="form-control form-control-sm"
                  value={pendingAddLinkedin}
                  disabled={isEditionLocked || saving}
                  onChange={(e) => setPendingAddLinkedin(e.target.value)}
                  placeholder="https://..."
                />
              </Box>
              <Box style={{ gridColumn: "1 / -1" }}>
                <label className="form-label small mb-1">Biografía *</label>
                <textarea
                  className="form-control form-control-sm"
                  style={{ minHeight: 110, resize: "vertical" }}
                  value={pendingAddBioText}
                  disabled={isEditionLocked || saving}
                  onChange={(e) => setPendingAddBioText(e.target.value)}
                  placeholder="Separá párrafos con línea en blanco"
                />
              </Box>
            </Grid>

            <Flex justify="flex-end" gap={2} mt={3}>
              <AppButton variant="outline" size="md" disabled={isEditionLocked || saving} minW={{ sm: "220px" }} onClick={() => addAvatarFileRef.current?.click()}>
                Elegir foto y agregar
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
              onClick={() => void persist(members, "Equipo actualizado")}
            >
              Guardar cambios
            </AppButton>
          </Flex>
        </>
      )}
    </AppCard>
  );
}

