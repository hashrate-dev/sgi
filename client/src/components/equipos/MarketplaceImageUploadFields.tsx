import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadMarketplaceAsicImage } from "../../lib/api";
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
    if (!file.type.startsWith("image/")) {
      showToast("Elegí un archivo de imagen (JPG, PNG, WebP o GIF).", "error", "Equipos ASIC");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadMarketplaceAsicImage(file);
      onChange(url);
      showToast("Imagen subida correctamente.", "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al subir", "error", "Equipos ASIC");
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
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
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="d-none"
        onChange={onFile}
        disabled={disabled || uploading}
      />

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
        {!preview ? (
          <div className="hrs-upload-dropzone-inner">
            <div className="hrs-upload-dropzone-icon" aria-hidden>
              🖼️
            </div>
            <p className="hrs-upload-dropzone-title">
              {uploading ? "Subiendo…" : "Arrastrá una imagen aquí o hacé clic para elegir"}
            </p>
            <p className="hrs-upload-dropzone-hint">JPG, PNG, WebP o GIF · hasta 8 MB</p>
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
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      showToast("No hay imágenes válidas.", "error", "Equipos ASIC");
      return;
    }
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of list) {
        const { url } = await uploadMarketplaceAsicImage(file);
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
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length || disabled) return;
    void processFiles(files);
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
    if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
  }

  function openPicker() {
    if (!disabled && !uploading) inputRef.current?.click();
  }

  const zoneClass = [
    "hrs-upload-dropzone",
    "hrs-upload-gallery-drop",
    disabled || uploading ? "hrs-upload-dropzone--disabled" : "",
    dragActive ? "hrs-upload-dropzone--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fact-field hrs-upload-field">
      <span className="hrs-upload-label">Galería modal (fotos del detalle)</span>

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

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="d-none"
        onChange={onFiles}
        disabled={disabled || uploading}
      />

      <div
        className={zoneClass}
        role="button"
        aria-label="Agregar fotos a la galería"
        tabIndex={disabled || uploading ? -1 : 0}
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
        <div className="hrs-upload-dropzone-inner">
          <div className="hrs-upload-dropzone-icon" aria-hidden>
            ➕
          </div>
          <p className="hrs-upload-dropzone-title">
            {uploading ? "Subiendo…" : "Arrastrá fotos aquí o hacé clic para agregar las que quieras"}
          </p>
          <p className="hrs-upload-dropzone-hint">Podés elegir varias a la vez · JPG, PNG, WebP, GIF</p>
        </div>
      </div>
    </div>
  );
}
