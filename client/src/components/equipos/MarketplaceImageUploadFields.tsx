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
      const key = galleryFileKey(url) || url.slice(0, 80);
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
      s.add(galleryFileKey(t));
    }
    return s;
  }, [excludeUrls]);

  const visible = useMemo(
    () =>
      library.filter((item) => {
        const key = galleryFileKey(item.url);
        return !excludeKeys.has(item.url) && !excludeKeys.has(key);
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
  library = [],
  disabled,
}: {
  cardSrc: string;
  onCardChange: (src: string) => void;
  galleryLines: string;
  onGalleryLinesChange: (lines: string) => void;
  library?: MarketplaceImageLibraryItem[];
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const card = cardSrc.trim();
  const gallery = parseGalleryLines(galleryLines);
  const emptySlots = (card ? 0 : 1) + Math.max(0, MARKETPLACE_PRODUCT_GALLERY_MAX - gallery.length);
  const allUrls = card ? [card, ...gallery] : [...gallery];
  const busy = Boolean(disabled || uploading);
  const canAdd = !busy && emptySlots > 0;

  function applyNewUrls(incoming: string[]) {
    let nextCard = card;
    const nextGal = [...gallery];
    const seen = new Set(allUrls.map((u) => galleryFileKey(u)));
    let added = 0;

    for (const raw of incoming) {
      const url = raw.trim();
      if (!url) continue;
      const key = galleryFileKey(url) || url;
      if (seen.has(key)) continue;
      if (!nextCard) {
        nextCard = url;
        seen.add(key);
        added += 1;
        continue;
      }
      if (nextGal.length >= MARKETPLACE_PRODUCT_GALLERY_MAX) continue;
      nextGal.push(url);
      seen.add(key);
      added += 1;
    }

    if (added === 0) {
      showToast(
        emptySlots <= 0
          ? `Ya tenés la tarjeta y ${MARKETPLACE_PRODUCT_GALLERY_MAX} fotos de detalle.`
          : "Esas fotos ya estaban agregadas.",
        emptySlots <= 0 ? "warning" : "info",
        "Equipos ASIC"
      );
      return;
    }

    onCardChange(nextCard);
    onGalleryLinesChange(nextGal.join("\n"));
    showToast(
      added === 1 ? "1 foto agregada." : `${added} fotos agregadas.`,
      "success",
      "Equipos ASIC"
    );
  }

  async function processFiles(files: FileList | File[]) {
    if (!canAdd) {
      showToast(
        `Cupo completo: 1 tarjeta + hasta ${MARKETPLACE_PRODUCT_GALLERY_MAX} de detalle.`,
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
    const toUpload = list.slice(0, emptySlots);
    if (toUpload.length < list.length) {
      showToast(
        `Solo se tomaron ${toUpload.length}: queda espacio para ${emptySlots} foto(s).`,
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
      applyNewUrls(urls);
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
    if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
  }

  function openPcPicker() {
    if (canAdd) inputRef.current?.click();
  }

  function clearCard() {
    onCardChange("");
  }

  function removeGalleryAt(index: number) {
    onGalleryLinesChange(gallery.filter((_, j) => j !== index).join("\n"));
  }

  function promoteGalleryToCard(index: number) {
    const url = gallery[index];
    if (!url) return;
    const rest = gallery.filter((_, j) => j !== index);
    if (card) rest.unshift(card);
    onCardChange(url);
    onGalleryLinesChange(rest.slice(0, MARKETPLACE_PRODUCT_GALLERY_MAX).join("\n"));
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
          <span className="hrs-upload-slot-label">Tarjeta (principal)</span>
          {card ? (
            <div className="hrs-upload-slot-thumb">
              <img src={imgSrcForPreview(card)} alt="Imagen de tarjeta" />
              {!disabled ? (
                <button type="button" className="hrs-upload-gallery-remove" onClick={clearCard} title="Quitar" aria-label="Quitar imagen de tarjeta">
                  ×
                </button>
              ) : null}
            </div>
          ) : (
            <div className="hrs-upload-slot-empty">Sin foto</div>
          )}
        </div>

        <div className="hrs-upload-slot hrs-upload-slot--gallery">
          <span className="hrs-upload-slot-label">Detalle (máx. {MARKETPLACE_PRODUCT_GALLERY_MAX})</span>
          <div className="hrs-upload-gallery-grid hrs-upload-gallery-grid--unified">
            {gallery.map((u, i) => (
              <div key={`${i}-${u.slice(0, 24)}`} className="hrs-upload-gallery-item">
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
                      title="Usar como imagen de tarjeta"
                    >
                      Tarjeta
                    </button>
                  </>
                ) : null}
              </div>
            ))}
            {gallery.length === 0 ? <p className="hrs-upload-gallery-empty">Sin fotos de detalle</p> : null}
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
            openPcPicker();
          }
        }}
        onClick={() => openPcPicker()}
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
          disabled={!canAdd}
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
            La primera foto vacía va a la tarjeta; el resto al detalle (máx. {MARKETPLACE_PRODUCT_GALLERY_MAX}).
            {marketplaceUploadUsesInlineImages()
              ? " · en hashrate.space se comprimen (~300 KB c/u)"
              : " · JPG, PNG, WebP o GIF"}
          </p>
        </div>
      </div>

      <div className="hrs-upload-unified-actions">
        <button type="button" className="hrs-upload-btn" disabled={!canAdd} onClick={openPcPicker}>
          Desde mi PC…
        </button>
        <button
          type="button"
          className="hrs-upload-btn"
          disabled={busy || library.length === 0 || emptySlots <= 0}
          onClick={() => setLibraryOpen(true)}
          title={library.length === 0 ? "Todavía no hay fotos en otros equipos" : undefined}
        >
          Desde otros equipos…
        </button>
      </div>

      <ExistingImagesPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        library={library}
        maxSelect={Math.max(1, emptySlots)}
        excludeUrls={allUrls}
        onConfirm={(urls) => applyNewUrls(urls)}
      />
    </div>
  );
}
