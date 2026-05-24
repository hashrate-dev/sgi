import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadMarketplaceAsicImage } from "../../lib/api";
import { MARKETPLACE_PRODUCT_GALLERY_MAX } from "../../lib/marketplaceAsicCatalog.js";
import {
  isAcceptableMarketplaceImageFile,
  marketplaceUploadUsesInlineImages,
  optimizeMarketplaceImage,
} from "../../lib/marketplaceImageOptimize.js";
import { showToast } from "../ToastNotification";
import "./MarketplaceImageUploadFields.css";

function imgSrcForPreview(path: string): string {
  const t = path.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return t;
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

/** Imagen tarjeta: dropzone + vista previa (solo subida de archivo). */
export function CardImageUploadField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const preview = imgSrcForPreview(value);

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
    </div>
  );
}

/** Galería: miniaturas + dropzone (solo subida de archivos). */
export function GalleryImagesUploadField({
  lines,
  onLinesChange,
  disabled,
}: {
  lines: string;
  onLinesChange: (s: string) => void;
  disabled?: boolean;
}) {
  const urls = lines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
    const slotsLeft = Math.max(0, MARKETPLACE_PRODUCT_GALLERY_MAX - urls.length);
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
    </div>
  );
}
