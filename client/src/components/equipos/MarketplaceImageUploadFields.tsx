import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadMarketplaceAsicImage } from "../../lib/api";
import {
  galleryFileKey,
  MARKETPLACE_PRODUCT_GALLERY_MAX,
  normalizeMarketplaceImageSrc,
} from "../../lib/marketplaceAsicCatalog.js";
import {
  isAcceptableMarketplaceImageFile,
  marketplaceUploadUsesInlineImages,
  optimizeMarketplaceImage,
} from "../../lib/marketplaceImageOptimize.js";
import { showToast } from "../ToastNotification";
import "./MarketplaceImageUploadFields.css";

export type MarketplaceImageLibraryItem = {
  url: string;
  label: string;
};

type EquipoImageSource = {
  id: string;
  marcaEquipo?: string;
  modelo?: string;
  procesador?: string;
  numeroSerie?: string | null;
  marketplaceImageSrc?: string | null;
  marketplaceGalleryJson?: string | null;
};

/** Imágenes ya usadas en equipos (tarjeta + galería), deduplicadas. */
export function collectMarketplaceImageLibrary(
  equipos: EquipoImageSource[],
  opts?: { excludeEquipoId?: string | null }
): MarketplaceImageLibraryItem[] {
  const excludeId = (opts?.excludeEquipoId ?? "").trim();
  const byKey = new Map<string, MarketplaceImageLibraryItem>();

  for (const eq of equipos) {
    if (excludeId && eq.id === excludeId) continue;
    const labelParts = [eq.marcaEquipo, eq.modelo, eq.procesador].map((x) => String(x ?? "").trim()).filter(Boolean);
    const code = String(eq.numeroSerie ?? "").trim();
    const label = [labelParts.join(" "), code ? `(${code})` : ""].filter(Boolean).join(" ") || "Equipo ASIC";

    const pushUrl = (raw: string | null | undefined) => {
      const url = String(raw ?? "").trim();
      if (!url) return;
      const key = imageIdentity(url) || galleryFileKey(url) || url.slice(0, 80);
      if (byKey.has(key)) return;
      byKey.set(key, { url, label });
    };

    pushUrl(eq.marketplaceImageSrc);
    const galleryRaw = String(eq.marketplaceGalleryJson ?? "").trim();
    if (galleryRaw) {
      try {
        const parsed = JSON.parse(galleryRaw) as unknown;
        if (Array.isArray(parsed)) {
          for (const x of parsed) {
            if (typeof x === "string") pushUrl(x);
          }
        }
      } catch {
        /* ignore bad json */
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
}

function imgSrcForPreview(path: string): string {
  const t = path.trim();
  if (!t) return "";
  if (/^data:image\//i.test(t) || /^https?:\/\//i.test(t)) return t;
  return normalizeMarketplaceImageSrc(t) || t;
}

function parseGalleryLines(lines: string): string[] {
  return lines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Identidad estable para dedupe. Distingue bien data URLs distintas (p. ej. sin logo vs con logo). */
function imageIdentity(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^data:image\//i.test(t)) {
    const comma = t.indexOf(",");
    const body = comma >= 0 ? t.slice(comma + 1) : t;
    let h = 2166136261 >>> 0;
    const step = Math.max(1, Math.floor(body.length / 1024));
    for (let i = 0; i < body.length; i += step) {
      h ^= body.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const mid = Math.floor(body.length / 2);
    for (const start of [0, mid, Math.max(0, body.length - 96)]) {
      const end = Math.min(start + 96, body.length);
      for (let j = start; j < end; j++) {
        h ^= body.charCodeAt(j);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return `data:${body.length}:${h.toString(16)}`;
  }
  return galleryFileKey(t) || t.toLowerCase();
}

function ExistingImagesPicker({
  open,
  onClose,
  library,
  maxSelect,
  excludeUrls,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  library: MarketplaceImageLibraryItem[];
  maxSelect: number;
  excludeUrls?: string[];
  onConfirm: (urls: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const excludeKeys = useMemo(() => {
    const s = new Set<string>();
    for (const u of excludeUrls ?? []) {
      const t = u.trim();
      if (!t) continue;
      s.add(t);
      s.add(imageIdentity(t));
      const fk = galleryFileKey(t);
      if (fk && !/^data:/i.test(t)) s.add(fk);
    }
    return s;
  }, [excludeUrls]);

  const visible = useMemo(
    () =>
      library.filter((item) => {
        const id = imageIdentity(item.url);
        const key = galleryFileKey(item.url);
        if (excludeKeys.has(item.url) || excludeKeys.has(id)) return false;
        if (key && !/^data:/i.test(item.url) && excludeKeys.has(key)) return false;
        return true;
      }),
    [library, excludeKeys]
  );

  if (!open) return null;

  function toggle(url: string) {
    setSelected((prev) => {
      if (prev.includes(url)) return prev.filter((x) => x !== url);
      if (prev.length >= maxSelect) {
        showToast(`Podés elegir hasta ${maxSelect} foto(s).`, "warning", "Equipos ASIC");
        return prev;
      }
      return [...prev, url];
    });
  }

  function confirm() {
    if (!selected.length) {
      showToast("Elegí al menos una imagen.", "warning", "Equipos ASIC");
      return;
    }
    onConfirm(selected);
    setSelected([]);
    onClose();
  }

  return (
    <div className="hrs-upload-library-overlay" role="dialog" aria-modal="true" aria-label="Elegir fotos del marketplace">
      <div className="hrs-upload-library-panel">
        <div className="hrs-upload-library-head">
          <h3 className="hrs-upload-library-title">Fotos ya guardadas en equipos</h3>
          <button type="button" className="hrs-upload-library-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <p className="hrs-upload-library-hint">
          {visible.length === 0
            ? "No hay otras fotos cargadas en marketplace todavía."
            : `Seleccioná hasta ${maxSelect}. Se reutilizan (no se vuelven a subir).`}
        </p>
        {visible.length > 0 ? (
          <div className="hrs-upload-library-grid">
            {visible.map((item) => {
              const isOn = selected.includes(item.url);
              return (
                <button
                  key={galleryFileKey(item.url) || item.url.slice(0, 40)}
                  type="button"
                  className={"hrs-upload-library-tile" + (isOn ? " is-selected" : "")}
                  onClick={() => toggle(item.url)}
                  title={item.label}
                >
                  <img src={imgSrcForPreview(item.url)} alt="" loading="lazy" />
                  <span className="hrs-upload-library-tile-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="hrs-upload-library-actions">
          <button type="button" className="hrs-upload-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="hrs-upload-btn hrs-upload-btn--primary"
            disabled={selected.length === 0 || visible.length === 0}
            onClick={confirm}
          >
            Agregar ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Un solo bloque: imagen de tarjeta + galería, con las 3 formas de agregar
 * (arrastrar, carpeta PC, reutilizar de otros equipos) sin zonas repetidas.
 */
export function MarketplaceAnuncioPhotosField({
  cardSrc,
  onCardChange,
  galleryLines,
  onGalleryLinesChange,
  onPhotosChange,
  library = [],
  disabled,
}: {
  cardSrc: string;
  onCardChange: (src: string) => void;
  galleryLines: string;
  onGalleryLinesChange: (lines: string) => void;
  /** Preferible para aplicar tarjeta+galería en un solo setState (evita que se pisen). */
  onPhotosChange?: (next: { cardSrc: string; galleryLines: string }) => void;
  library?: MarketplaceImageLibraryItem[];
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addTargetRef = useRef<"auto" | "gallery">("auto");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const card = cardSrc.trim();
  const gallery = parseGalleryLines(galleryLines);
  const gallerySlotsLeft = Math.max(0, MARKETPLACE_PRODUCT_GALLERY_MAX - gallery.length);
  const emptySlots = (card ? 0 : 1) + gallerySlotsLeft;
  const allUrls = card ? [card, ...gallery] : [...gallery];
  const busy = Boolean(disabled || uploading);
  const canAdd = !busy && emptySlots > 0;
  const canAddGallery = !busy && gallerySlotsLeft > 0;

  function commitPhotos(nextCard: string, nextGal: string[]) {
    const galleryLinesNext = nextGal.join("\n");
    if (onPhotosChange) {
      onPhotosChange({ cardSrc: nextCard, galleryLines: galleryLinesNext });
      return;
    }
    onCardChange(nextCard);
    onGalleryLinesChange(galleryLinesNext);
  }

  function applyNewUrls(incoming: string[], opts?: { preferGallery?: boolean }) {
    const preferGallery = opts?.preferGallery === true;
    let nextCard = card;
    const nextGal = [...gallery];
    const seen = new Set(allUrls.map((u) => imageIdentity(u)));
    let added = 0;

    for (const raw of incoming) {
      const url = raw.trim();
      if (!url) continue;
      const key = imageIdentity(url);
      if (key && seen.has(key)) continue;
      if (!preferGallery && !nextCard) {
        nextCard = url;
        if (key) seen.add(key);
        added += 1;
        continue;
      }
      if (nextGal.length >= MARKETPLACE_PRODUCT_GALLERY_MAX) continue;
      nextGal.push(url);
      if (key) seen.add(key);
      added += 1;
    }

    if (added === 0) {
      showToast(
        emptySlots <= 0
          ? `Ya tenés la foto de tienda y ${MARKETPLACE_PRODUCT_GALLERY_MAX} de inventario.`
          : "Esa foto ya está en este equipo. Subí otro archivo (p. ej. la versión con logo Hashrate para Inventario).",
        emptySlots <= 0 ? "warning" : "info",
        "Equipos ASIC"
      );
      return;
    }

    commitPhotos(nextCard, nextGal);
    showToast(
      added === 1 ? "1 foto agregada." : `${added} fotos agregadas.`,
      "success",
      "Equipos ASIC"
    );
  }

  async function processFiles(files: FileList | File[]) {
    const preferGallery = addTargetRef.current === "gallery";
    addTargetRef.current = "auto";
    const slots = preferGallery ? gallerySlotsLeft : emptySlots;
    if (slots <= 0 || busy) {
      showToast(
        preferGallery
          ? `La galería admite hasta ${MARKETPLACE_PRODUCT_GALLERY_MAX} fotos de detalle.`
          : `Cupo completo: 1 tarjeta + hasta ${MARKETPLACE_PRODUCT_GALLERY_MAX} de detalle.`,
        "warning",
        "Equipos ASIC"
      );
      return;
    }
    const list: File[] = [];
    for (const f of Array.from(files)) {
      if (await isAcceptableMarketplaceImageFile(f)) list.push(f);
    }
    if (!list.length) {
      showToast("No hay imágenes válidas (JPG, PNG, WebP o GIF).", "error", "Equipos ASIC");
      return;
    }
    const toUpload = list.slice(0, slots);
    if (toUpload.length < list.length) {
      showToast(
        `Solo se tomaron ${toUpload.length}: queda espacio para ${slots} foto(s).`,
        "warning",
        "Equipos ASIC"
      );
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of toUpload) {
        const optimized = await optimizeMarketplaceImage(file);
        const { url } = await uploadMarketplaceAsicImage(optimized);
        urls.push(url);
      }
      applyNewUrls(urls, { preferGallery });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al subir", "error", "Equipos ASIC");
    } finally {
      setUploading(false);
    }
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!picked.length || busy) return;
    void processFiles(picked);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (canAdd) setDragActive(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!canAdd) return;
    addTargetRef.current = "auto";
    if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
  }

  function openPcPicker(target: "auto" | "gallery" = "auto") {
    if (busy) return;
    if (target === "gallery") {
      if (!canAddGallery) {
        showToast(`Ya hay ${MARKETPLACE_PRODUCT_GALLERY_MAX} fotos de detalle.`, "warning", "Equipos ASIC");
        return;
      }
    } else if (!canAdd) {
      return;
    }
    addTargetRef.current = target;
    inputRef.current?.click();
  }

  function clearCard() {
    commitPhotos("", gallery);
  }

  function removeGalleryAt(index: number) {
    commitPhotos(card, gallery.filter((_, j) => j !== index));
  }

  function promoteGalleryToCard(index: number) {
    const url = gallery[index];
    if (!url) return;
    const rest = gallery.filter((_, j) => j !== index);
    if (card) rest.unshift(card);
    commitPhotos(url, rest.slice(0, MARKETPLACE_PRODUCT_GALLERY_MAX));
  }

  const zoneClass = [
    "hrs-upload-dropzone",
    "hrs-upload-unified-drop",
    !canAdd ? "hrs-upload-dropzone--disabled" : "",
    dragActive ? "hrs-upload-dropzone--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fact-field hrs-upload-field hrs-upload-unified">
      <div className="hrs-upload-slots">
        <div className="hrs-upload-slot hrs-upload-slot--card">
          <span className="hrs-upload-slot-label">Tienda (sin logo)</span>
          {card ? (
            <div className="hrs-upload-slot-thumb">
              <img src={imgSrcForPreview(card)} alt="Imagen de tarjeta en tienda" />
              {!disabled ? (
                <button type="button" className="hrs-upload-gallery-remove" onClick={clearCard} title="Quitar" aria-label="Quitar imagen de tarjeta">
                  ×
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="hrs-upload-slot-empty hrs-upload-slot-empty--btn"
              disabled={busy}
              onClick={() => openPcPicker("auto")}
            >
              + Agregar
            </button>
          )}
        </div>

        <div className="hrs-upload-slot hrs-upload-slot--gallery">
          <span className="hrs-upload-slot-label">
            Inventario (1ª = listado SGI) ({gallery.length}/{MARKETPLACE_PRODUCT_GALLERY_MAX})
          </span>
          <div className="hrs-upload-gallery-grid hrs-upload-gallery-grid--unified">
            {gallery.map((u, i) => (
              <div key={`g-${i}-${imageIdentity(u).slice(0, 48)}`} className="hrs-upload-gallery-item">
                <img src={imgSrcForPreview(u)} alt="" />
                {!disabled ? (
                  <>
                    <button
                      type="button"
                      className="hrs-upload-gallery-remove"
                      onClick={() => removeGalleryAt(i)}
                      title="Quitar"
                      aria-label="Quitar imagen"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className="hrs-upload-make-card"
                      onClick={() => promoteGalleryToCard(i)}
                      title="Usar en tienda (sin logo Hashrate)"
                    >
                      Tienda
                    </button>
                  </>
                ) : null}
              </div>
            ))}
            {canAddGallery
              ? Array.from({ length: gallerySlotsLeft }, (_, i) => (
                  <button
                    key={`empty-gal-${i}`}
                    type="button"
                    className="hrs-upload-gallery-item hrs-upload-gallery-item--empty"
                    disabled={busy}
                    onClick={() => openPcPicker("gallery")}
                    title="Agregar foto de detalle"
                    aria-label="Agregar foto de detalle"
                  >
                    <span aria-hidden>+</span>
                  </button>
                ))
              : null}
          </div>
        </div>
      </div>

      <div
        className={zoneClass}
        role="button"
        aria-label="Agregar fotos del anuncio"
        tabIndex={canAdd ? 0 : -1}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && canAdd) {
            e.preventDefault();
            openPcPicker("auto");
          }
        }}
        onClick={() => openPcPicker("auto")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hrs-upload-file-input"
          aria-hidden
          tabIndex={-1}
          onChange={onFileInput}
          disabled={busy}
        />
        <div className="hrs-upload-dropzone-inner">
          <div className="hrs-upload-dropzone-icon" aria-hidden>
            🖼️
          </div>
          <p className="hrs-upload-dropzone-title">
            {uploading
              ? "Subiendo…"
              : emptySlots <= 0
                ? "Cupo completo"
                : "Arrastrá fotos acá o hacé clic para elegirlas en tu PC"}
          </p>
          <p className="hrs-upload-dropzone-hint">
            {card
              ? `Nuevas fotos → Inventario (quedan ${gallerySlotsLeft}). La 1ª de Inventario se muestra en el listado SGI; el logo va en la imagen que subís (no se superpone).`
              : `La primera va a Tienda (sin logo); el resto a Inventario (máx. ${MARKETPLACE_PRODUCT_GALLERY_MAX}).`}
            {marketplaceUploadUsesInlineImages()
              ? " · en hashrate.space se comprimen (~300 KB c/u)"
              : " · JPG, PNG, WebP o GIF"}
          </p>
        </div>
      </div>

      <div className="hrs-upload-unified-actions">
        <button type="button" className="hrs-upload-btn" disabled={!canAdd} onClick={() => openPcPicker("auto")}>
          Desde mi PC…
        </button>
        <button
          type="button"
          className="hrs-upload-btn"
          disabled={busy || library.length === 0 || emptySlots <= 0}
          onClick={() => {
            addTargetRef.current = card ? "gallery" : "auto";
            setLibraryOpen(true);
          }}
          title={library.length === 0 ? "Todavía no hay fotos en otros equipos" : undefined}
        >
          Desde otros equipos…
        </button>
      </div>

      <ExistingImagesPicker
        open={libraryOpen}
        onClose={() => {
          addTargetRef.current = "auto";
          setLibraryOpen(false);
        }}
        library={library}
        maxSelect={Math.max(1, addTargetRef.current === "gallery" ? gallerySlotsLeft : emptySlots)}
        excludeUrls={allUrls}
        onConfirm={(urls) => {
          const preferGallery = addTargetRef.current === "gallery" || Boolean(card);
          addTargetRef.current = "auto";
          applyNewUrls(urls, { preferGallery });
        }}
      />
    </div>
  );
}
