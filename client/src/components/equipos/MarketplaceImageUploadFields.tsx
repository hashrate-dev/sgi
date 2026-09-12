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

function fileLabelFromPath(path: string): string {
  const t = path.trim();
  if (!t) return "";
  if (/^data:image\//i.test(t)) return "Imagen (inline)";
  try {
    const noQuery = t.split("?")[0] ?? t;
    const seg = noQuery.split("/").filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : t;
  } catch {
    return t.slice(-40);
  }
}

function ExistingImagesPicker({
  open,
  onClose,
  library,
  mode,
  maxSelect,
  excludeUrls,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  library: MarketplaceImageLibraryItem[];
  mode: "single" | "multi";
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
    if (mode === "single") {
      setSelected([url]);
      return;
    }
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
    <div className="hrs-upload-library-overlay" role="dialog" aria-modal="true" aria-label="Elegir imagen existente">
      <div className="hrs-upload-library-panel">
        <div className="hrs-upload-library-head">
          <h3 className="hrs-upload-library-title">
            {mode === "single" ? "Usar imagen de otro equipo" : "Elegir fotos de otros equipos"}
          </h3>
          <button type="button" className="hrs-upload-library-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <p className="hrs-upload-library-hint">
          {visible.length === 0
            ? "No hay otras fotos cargadas en marketplace todavía."
            : mode === "multi"
              ? `Seleccioná hasta ${maxSelect}. Se reutiliza la misma imagen (no se vuelve a subir).`
              : "Hacé clic en una foto para reutilizarla (no se vuelve a subir)."}
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
            {mode === "single" ? "Usar esta imagen" : `Agregar (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Imagen tarjeta: dropzone + vista previa + opción de reutilizar. */
export function CardImageUploadField({
  value,
  onChange,
  disabled,
  library = [],
}: {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
  library?: MarketplaceImageLibraryItem[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const preview = imgSrcForPreview(value);
  const canReuse = !disabled && library.length > 0;

  async function processFile(file: File) {
    if (!(await isAcceptableMarketplaceImageFile(file))) {
      showToast("Elegí un archivo de imagen (JPG, PNG, WebP o GIF).", "error", "Equipos ASIC");
      return;
    }
    setUploading(true);
    try {
      const optimized = await optimizeMarketplaceImage(file);
      const { url } = await uploadMarketplaceAsicImage(optimized);
      onChange(url);
      showToast("Imagen subida correctamente.", "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al subir", "error", "Equipos ASIC");
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    const file = picked[0];
    if (!file || disabled) return;
    void processFile(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) setDragActive(true);
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
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function openPicker() {
    if (!disabled && !uploading) inputRef.current?.click();
  }

  const zoneClass = [
    "hrs-upload-dropzone",
    disabled || uploading ? "hrs-upload-dropzone--disabled" : "",
    dragActive ? "hrs-upload-dropzone--active" : "",
    preview ? "hrs-upload-dropzone--has-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fact-field hrs-upload-field">
      <span className="hrs-upload-label">Imagen tarjeta</span>

      <div
        className={zoneClass}
        role={preview ? "group" : "button"}
        aria-label={preview ? "Vista previa imagen de tarjeta" : "Subir imagen de tarjeta"}
        tabIndex={preview || disabled || uploading ? -1 : 0}
        onKeyDown={(e) => {
          if (!preview && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openPicker();
          }
        }}
        onClick={() => {
          if (!preview && !disabled && !uploading) openPicker();
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hrs-upload-file-input"
          aria-hidden
          tabIndex={-1}
          onChange={onFile}
          disabled={disabled || uploading}
        />
        {!preview ? (
          <div className="hrs-upload-dropzone-inner">
            <div className="hrs-upload-dropzone-icon" aria-hidden>
              🖼️
            </div>
            <p className="hrs-upload-dropzone-title">
              {uploading ? "Subiendo…" : "Arrastrá una imagen aquí o hacé clic para elegir"}
            </p>
            <p className="hrs-upload-dropzone-hint">
              JPG, PNG, WebP o GIF
              {marketplaceUploadUsesInlineImages()
                ? " · en hashrate.space se comprimen al subir (máx. ~300 KB c/u)"
                : " · hasta 8 MB en local"}
            </p>
          </div>
        ) : (
          <div className="hrs-upload-preview-row">
            <div className="hrs-upload-preview-thumb-wrap">
              <img src={preview} alt="Vista previa" />
            </div>
            <div className="hrs-upload-preview-meta">
              <p className="hrs-upload-preview-caption">{fileLabelFromPath(value) || "Imagen"}</p>
              <div className="hrs-upload-actions">
                <button
                  type="button"
                  className="hrs-upload-btn"
                  disabled={disabled || uploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPicker();
                  }}
                >
                  {uploading ? "Subiendo…" : "Cambiar imagen"}
                </button>
                <button
                  type="button"
                  className="hrs-upload-btn hrs-upload-btn--danger"
                  disabled={disabled || uploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {canReuse ? (
        <button
          type="button"
          className="hrs-upload-btn hrs-upload-reuse-btn"
          disabled={uploading}
          onClick={() => setLibraryOpen(true)}
        >
          Usar imagen de otro equipo…
        </button>
      ) : null}

      <ExistingImagesPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        library={library}
        mode="single"
        maxSelect={1}
        excludeUrls={value ? [value] : []}
        onConfirm={(urls) => {
          const picked = urls[0];
          if (picked) {
            onChange(picked);
            showToast("Imagen reutilizada desde otro equipo.", "success", "Equipos ASIC");
          }
        }}
      />
    </div>
  );
}

/** Galería: miniaturas + dropzone + opción de reutilizar. */
export function GalleryImagesUploadField({
  lines,
  onLinesChange,
  disabled,
  library = [],
}: {
  lines: string;
  onLinesChange: (s: string) => void;
  disabled?: boolean;
  library?: MarketplaceImageLibraryItem[];
}) {
  const urls = lines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const slotsLeft = Math.max(0, MARKETPLACE_PRODUCT_GALLERY_MAX - urls.length);
  const canReuse = !disabled && library.length > 0 && slotsLeft > 0;

  function removeAt(index: number) {
    const next = urls.filter((_, j) => j !== index);
    onLinesChange(next.join("\n"));
  }

  async function processFiles(files: FileList | File[]) {
    const raw = Array.from(files);
    const list: File[] = [];
    for (const f of raw) {
      if (await isAcceptableMarketplaceImageFile(f)) list.push(f);
    }
    if (!list.length) {
      showToast("No hay imágenes válidas.", "error", "Equipos ASIC");
      return;
    }
    if (slotsLeft <= 0) {
      showToast(
        `La galería del modal admite hasta ${MARKETPLACE_PRODUCT_GALLERY_MAX} fotos. Quitá una para agregar otra.`,
        "warning",
        "Equipos ASIC"
      );
      return;
    }
    const toUpload = list.slice(0, slotsLeft);
    if (toUpload.length < list.length) {
      showToast(
        `Solo se agregaron ${toUpload.length} foto(s): máximo ${MARKETPLACE_PRODUCT_GALLERY_MAX} en el modal.`,
        "warning",
        "Equipos ASIC"
      );
    }
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of toUpload) {
        const optimized = await optimizeMarketplaceImage(file);
        const { url } = await uploadMarketplaceAsicImage(optimized);
        newUrls.push(url);
      }
      onLinesChange([...urls, ...newUrls].join("\n"));
      showToast(`${newUrls.length} imagen(es) agregada(s).`, "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al subir", "error", "Equipos ASIC");
    } finally {
      setUploading(false);
    }
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!picked.length || disabled) return;
    void processFiles(picked);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading && urls.length < MARKETPLACE_PRODUCT_GALLERY_MAX) setDragActive(true);
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
    if (disabled || uploading || urls.length >= MARKETPLACE_PRODUCT_GALLERY_MAX) return;
    if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
  }

  function openPicker() {
    if (!disabled && !uploading && urls.length < MARKETPLACE_PRODUCT_GALLERY_MAX) inputRef.current?.click();
  }

  const zoneClass = [
    "hrs-upload-dropzone",
    "hrs-upload-gallery-drop",
    disabled || uploading || urls.length >= MARKETPLACE_PRODUCT_GALLERY_MAX
      ? "hrs-upload-dropzone--disabled"
      : "",
    dragActive ? "hrs-upload-dropzone--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fact-field hrs-upload-field">
      <span className="hrs-upload-label">
        Galería modal (fotos del detalle, máx. {MARKETPLACE_PRODUCT_GALLERY_MAX})
      </span>

      {urls.length > 0 ? (
        <div className="hrs-upload-gallery-grid">
          {urls.map((u, i) => (
            <div key={`${i}-${u.slice(0, 24)}`} className="hrs-upload-gallery-item">
              <img src={imgSrcForPreview(u)} alt="" />
              {!disabled && (
                <button
                  type="button"
                  className="hrs-upload-gallery-remove"
                  onClick={() => removeAt(i)}
                  title="Quitar"
                  aria-label="Quitar imagen"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="hrs-upload-gallery-empty">Todavía no hay fotos en la galería.</p>
      )}

      <div
        className={zoneClass}
        role="button"
        aria-label="Agregar fotos a la galería"
        tabIndex={disabled || uploading || urls.length >= MARKETPLACE_PRODUCT_GALLERY_MAX ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onClick={() => openPicker()}
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
          onChange={onFiles}
          disabled={disabled || uploading || urls.length >= MARKETPLACE_PRODUCT_GALLERY_MAX}
        />
        <div className="hrs-upload-dropzone-inner">
          <div className="hrs-upload-dropzone-icon" aria-hidden>
            ➕
          </div>
          <p className="hrs-upload-dropzone-title">
            {uploading ? "Subiendo…" : "Arrastrá fotos aquí o hacé clic para agregar las que quieras"}
          </p>
          <p className="hrs-upload-dropzone-hint">
            Hasta {MARKETPLACE_PRODUCT_GALLERY_MAX} fotos en el modal · JPG, PNG, WebP, GIF
          </p>
        </div>
      </div>

      {canReuse ? (
        <button
          type="button"
          className="hrs-upload-btn hrs-upload-reuse-btn"
          disabled={uploading}
          onClick={() => setLibraryOpen(true)}
        >
          Elegir fotos de otros equipos…
        </button>
      ) : null}

      <ExistingImagesPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        library={library}
        mode="multi"
        maxSelect={slotsLeft}
        excludeUrls={urls}
        onConfirm={(picked) => {
          const next = [...urls];
          const seen = new Set(urls.map((u) => galleryFileKey(u)));
          let added = 0;
          for (const url of picked) {
            if (next.length >= MARKETPLACE_PRODUCT_GALLERY_MAX) break;
            const key = galleryFileKey(url);
            if (seen.has(key)) continue;
            seen.add(key);
            next.push(url);
            added += 1;
          }
          if (added === 0) {
            showToast("Esas fotos ya estaban en la galería.", "info", "Equipos ASIC");
            return;
          }
          onLinesChange(next.join("\n"));
          showToast(`${added} foto(s) reutilizada(s).`, "success", "Equipos ASIC");
        }}
      />
    </div>
  );
}
