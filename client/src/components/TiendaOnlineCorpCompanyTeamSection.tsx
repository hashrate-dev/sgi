import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { wpUpload } from "../lib/marketplaceWpAssets.js";
import {
  getEquiposMarketplaceCorpCompanyTeam,
  getMarketplaceCorpCompanyTeam,
  notifyCorpCompanyTeamUpdated,
  patchEquiposMarketplaceCorpCompanyTeamPhoto,
  putEquiposMarketplaceCorpCompanyTeam,
  uploadMarketplaceAsicImage,
  type CorpCompanyTeamMemberDto,
} from "../lib/api.js";
import { normalizeCorpTeamPhotoFile } from "../lib/corpTeamPhotoNormalize.js";
import { isAcceptableMarketplaceImageFile } from "../lib/marketplaceImageOptimize.js";
import { showToast } from "./ToastNotification.js";
import { AppButton, AppCard, AppModal } from "./ui/index.js";
import {
  CorpTeamProductionCardPreview,
  toCorpTeamProductionCardMember,
} from "./CorpTeamProductionCardPreview.js";

type TeamDefaultKey = "fab" | "jv" | "af" | "rg" | "ab" | "dv" | "dg";

const TEAM_DEFAULTS: readonly {
  key: TeamDefaultKey;
  img: string;
  linkedin?: string;
}[] = [
  { key: "fab", img: wpUpload("FB-Team-1-1024x991.png?v=2"), linkedin: "https://www.linkedin.com/in/fabrianchi/" },
  { key: "jv", img: wpUpload("JV-Team-1024x991.png"), linkedin: "https://www.linkedin.com/in/jlvilasoler/" },
  { key: "af", img: wpUpload("AF-Team-1024x991.png"), linkedin: "https://www.linkedin.com/in/figueroaanthony/" },
  { key: "rg", img: wpUpload("RG-1024x991.png") },
  { key: "dv", img: wpUpload("DV-Team.png") },
  { key: "ab", img: wpUpload("AB-Team-1024x991.png") },
  { key: "dg", img: wpUpload("DG-Team-HRS-1024x991.png") },
];

/** Foto de fábrica (wp-uploads) por id legacy del team. */
const BUILTIN_ORIGINAL_PHOTO: Record<string, string> = Object.fromEntries(
  TEAM_DEFAULTS.map((d) => [d.key, d.img])
);

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

function snapshotOriginalPhotos(list: CorpCompanyTeamMemberDto[]): Record<string, string> {
  return Object.fromEntries(list.map((m) => [m.id, m.imageUrl]));
}

function originalPhotoUrlFor(memberId: string, loaded: Record<string, string>): string | undefined {
  return BUILTIN_ORIGINAL_PHOTO[memberId] ?? loaded[memberId];
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
  /** URL de la foto previa por integrante (solo tras «Cambiar foto» en esta sesión). */
  const [photoUndoByMemberId, setPhotoUndoByMemberId] = useState<Record<string, string>>({});

  const fallbackMembersRef = useRef(fallbackMembers);
  fallbackMembersRef.current = fallbackMembers;
  const hasLoadedOnceRef = useRef(false);
  const savedSnapshotRef = useRef<string>("");
  /** Foto al cargar/guardar (integrantes nuevos); legacy usa BUILTIN_ORIGINAL_PHOTO. */
  const loadedOriginalPhotosRef = useRef<Record<string, string>>({});
  const [hydratedFromApi, setHydratedFromApi] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAvatarFileRef = useRef<HTMLInputElement>(null);

  const [pendingAddRole, setPendingAddRole] = useState("");
  const [pendingAddName, setPendingAddName] = useState("");
  const [pendingAddLinkedin, setPendingAddLinkedin] = useState("");
  const [pendingAddBioText, setPendingAddBioText] = useState("");
  /** Tarjetas en producción (/company), API pública con URLs resueltas. */
  const [liveById, setLiveById] = useState<Record<string, CorpCompanyTeamMemberDto>>({});
  const [cardPreviewMemberId, setCardPreviewMemberId] = useState<string | null>(null);

  const refreshLiveFromProduction = useCallback(() => {
    void getMarketplaceCorpCompanyTeam()
      .then((res) => {
        const map: Record<string, CorpCompanyTeamMemberDto> = {};
        for (const m of Array.isArray(res.members) ? res.members : []) {
          if (m.enabled === false) continue;
          map[m.id] = m;
        }
        setLiveById(map);
      })
      .catch(() => {
        /* silencioso: draft sigue usable */
      });
  }, []);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true && hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    setLoadError(null);
    void getEquiposMarketplaceCorpCompanyTeam()
      .then((r) => {
        const incoming = Array.isArray(r.members) ? r.members : [];
        const next = incoming.length > 0 ? incoming : fallbackMembersRef.current;
        setMembers(next);
        savedSnapshotRef.current = JSON.stringify(next);
        loadedOriginalPhotosRef.current = snapshotOriginalPhotos(next);
        setPhotoUndoByMemberId({});
        hasLoadedOnceRef.current = true;
        refreshLiveFromProduction();
      })
      .catch(() => setLoadError("No se pudieron cargar los datos del equipo."))
      .finally(() => {
        setLoading(false);
        setHydratedFromApi(true);
      });
  }, [refreshLiveFromProduction]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (next: CorpCompanyTeamMemberDto[], toastMsg?: string) => {
      setSaving(true);
      try {
        const r = await putEquiposMarketplaceCorpCompanyTeam({ members: next });
        const saved = r.members ?? next;
        setMembers(saved);
        savedSnapshotRef.current = JSON.stringify(saved);
        loadedOriginalPhotosRef.current = snapshotOriginalPhotos(saved);
        setPhotoUndoByMemberId({});
        notifyCorpCompanyTeamUpdated();
        refreshLiveFromProduction();
        if (toastMsg) showToast(toastMsg, "success", "Equipo de la empresa");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Error al guardar", "error", "Equipo de la empresa");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [refreshLiveFromProduction]
  );

  function handleFieldChange(id: string, patch: Partial<CorpCompanyTeamMemberDto>) {
    if (isEditionLocked) return;
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function prepareTeamPhotoUpload(file: File): Promise<File> {
    if (!(await isAcceptableMarketplaceImageFile(file))) {
      throw new Error("Archivo no válido. Usá JPG, PNG o WebP.");
    }
    return normalizeCorpTeamPhotoFile(file);
  }

  async function uploadImageForMember(memberId: string, file: File) {
    setUploadingId(memberId);
    try {
      const previousUrl = members.find((m) => m.id === memberId)?.imageUrl;
      const prepared = await prepareTeamPhotoUpload(file);
      const { url } = await uploadMarketplaceAsicImage(prepared);
      if (previousUrl && previousUrl !== url) {
        setPhotoUndoByMemberId((prev) => ({ ...prev, [memberId]: previousUrl }));
      }
      const patched = await patchEquiposMarketplaceCorpCompanyTeamPhoto(memberId, url);
      const saved = patched.members ?? members.map((m) => (m.id === memberId ? { ...m, imageUrl: url } : m));
      setMembers(saved);
      savedSnapshotRef.current = JSON.stringify(saved);
      loadedOriginalPhotosRef.current = snapshotOriginalPhotos(saved);
      notifyCorpCompanyTeamUpdated();
      refreshLiveFromProduction();
      showToast("Foto guardada — ya visible en /company", "success", "Equipo de la empresa");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al subir imagen", "error", "Equipo de la empresa");
    } finally {
      setUploadingId(null);
    }
  }

  function restorePreviousPhoto(memberId: string) {
    if (isEditionLocked) return;
    const previousUrl = photoUndoByMemberId[memberId];
    if (!previousUrl) return;
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, imageUrl: previousUrl } : m)));
    setPhotoUndoByMemberId((prev) => {
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
    showToast("Se restauró la foto anterior (pendiente de guardar).", "success", "Equipo de la empresa");
  }

  function restoreOriginalPhoto(memberId: string) {
    if (isEditionLocked) return;
    const originalUrl = originalPhotoUrlFor(memberId, loadedOriginalPhotosRef.current);
    if (!originalUrl) return;
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, imageUrl: originalUrl } : m)));
    setPhotoUndoByMemberId((prev) => {
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
    showToast("Se restauró la foto original (pendiente de guardar).", "success", "Equipo de la empresa");
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
      const prepared = await prepareTeamPhotoUpload(file);
      const { url } = await uploadMarketplaceAsicImage(prepared);
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
  const membersJson = JSON.stringify(members);
  const hasUnsavedChanges = hydratedFromApi && membersJson !== savedSnapshotRef.current;

  function openCardPreviewModal(memberId: string) {
    setCardPreviewMemberId(memberId);
  }

  function closeCardPreviewModal() {
    setCardPreviewMemberId(null);
  }

  function savedMemberById(memberId: string): CorpCompanyTeamMemberDto | undefined {
    try {
      const saved = JSON.parse(savedSnapshotRef.current) as CorpCompanyTeamMemberDto[];
      return Array.isArray(saved) ? saved.find((x) => x.id === memberId) : undefined;
    } catch {
      return undefined;
    }
  }

  const readBioLabel = t("company.team.read_bio");

  const previewMember = cardPreviewMemberId ? members.find((m) => m.id === cardPreviewMemberId) : undefined;
  const previewDraftCard = previewMember ? toCorpTeamProductionCardMember(previewMember, t) : null;
  const previewLiveSource = cardPreviewMemberId
    ? liveById[cardPreviewMemberId] ?? savedMemberById(cardPreviewMemberId)
    : undefined;
  const previewLiveCard = previewLiveSource ? toCorpTeamProductionCardMember(previewLiveSource, t) : null;
  const previewMemberName = previewMember?.name.trim() || previewDraftCard?.name || "Integrante";

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
          {hasUnsavedChanges ? (
            <Text color="orange.700" fontSize="sm" mt={1} fontWeight="semibold">
              Tenés cambios sin guardar — usá «Guardar cambios» para publicarlos en la web.
            </Text>
          ) : null}
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

      {loading && !hydratedFromApi ? (
        <Box minH="280px" display="flex" alignItems="center" justifyContent="center">
          <Text color="gray.600" fontSize="sm">
            Cargando equipo…
          </Text>
        </Box>
      ) : (
        <>
          {loading ? (
            <Text color="gray.500" fontSize="xs" mb={2}>
              Actualizando…
            </Text>
          ) : null}
          <Grid templateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }} gap={3} mb={4}>
            {members.map((m) => {
              const originalPhotoUrl = originalPhotoUrlFor(m.id, loadedOriginalPhotosRef.current);
              const canRestoreOriginal = Boolean(originalPhotoUrl && m.imageUrl !== originalPhotoUrl);
              const isPreviewModalOpen = cardPreviewMemberId === m.id;
              return (
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
                    className="corp-team-editor-photo"
                    data-member-id={m.id}
                  >
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="corp-team-editor-photo__img" />
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
                      {photoUndoByMemberId[m.id] ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={isEditionLocked || uploadingId === m.id || saving}
                          onClick={() => restorePreviousPhoto(m.id)}
                        >
                          Foto anterior
                        </button>
                      ) : null}
                      {canRestoreOriginal ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={isEditionLocked || uploadingId === m.id || saving}
                          onClick={() => restoreOriginalPhoto(m.id)}
                        >
                          Foto original
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={isEditionLocked || saving}
                        onClick={() => void handleRemoveMember(m.id)}
                      >
                        Quitar
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${isPreviewModalOpen ? "btn-success" : "btn-outline-success"}`}
                        disabled={loading}
                        onClick={() => openCardPreviewModal(m.id)}
                      >
                        Ver tarjeta
                      </button>
                    </Flex>
                  </Box>
                </Flex>
              </AppCard>
              );
            })}
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
            <AppButton variant="outline" size="md" onClick={() => load({ silent: true })} disabled={loading || saving}>
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

      <AppModal
        open={cardPreviewMemberId !== null}
        onOpenChange={(open) => {
          if (!open) closeCardPreviewModal();
        }}
        title={`Tarjeta en /company — ${previewMemberName}`}
        description="Compará la vista previa (cambios sin guardar) con la tarjeta en vivo en producción."
        contentMaxW="min(100%, 760px)"
        variant="emerald_panel"
      >
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={4} py={2}>
          <Box>
            <Text
              className="corp-team-production-preview-panel__label corp-team-production-preview-panel__label--draft"
              mb={2}
            >
              Vista previa
            </Text>
            {previewDraftCard ? (
              <CorpTeamProductionCardPreview member={previewDraftCard} readBioLabel={readBioLabel} />
            ) : null}
          </Box>
          <Box>
            <Text
              className="corp-team-production-preview-panel__label corp-team-production-preview-panel__label--live"
              mb={2}
            >
              En vivo (producción)
            </Text>
            {previewLiveCard ? (
              <CorpTeamProductionCardPreview member={previewLiveCard} readBioLabel={readBioLabel} />
            ) : (
              <Text fontSize="sm" color="gray.500">
                No hay datos en producción para este integrante.
              </Text>
            )}
          </Box>
        </Grid>
      </AppModal>
    </AppCard>
  );
}

