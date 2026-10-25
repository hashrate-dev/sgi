import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AsicBillingCatalogQuickAddKind } from "./AsicBillingCatalogQuickAddModal";
import type { EquipoASIC, ReparacionTipo, Setup, TransporteFleteTipo } from "../lib/types";

type MenuEntry = {
  value: string;
  label: string;
  editId?: string;
  create?: boolean;
  disabled?: boolean;
};

type Group = {
  label: string;
  kind: AsicBillingCatalogQuickAddKind;
  entries: MenuEntry[];
};

type Props = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  equipos: EquipoASIC[];
  setups: Setup[];
  reparaciones: ReparacionTipo[];
  fletes: TransporteFleteTipo[];
  canAddEquipo: boolean;
  canAddCatalog: boolean;
  canEditEquipo: boolean;
  canEditCatalog: boolean;
  newEquipoValue: string;
  newSetupValue: string;
  newReparacionValue: string;
  newFleteValue: string;
  onPick: (value: string) => void;
  onEdit: (kind: AsicBillingCatalogQuickAddKind, id: string) => void;
};

function money(n: number): string {
  return `$${Number(n || 0).toLocaleString("es-AR")} USD`;
}

export function AsicBillingItemMenu({
  value,
  placeholder,
  disabled,
  equipos,
  setups,
  reparaciones,
  fletes,
  canAddEquipo,
  canAddCatalog,
  canEditEquipo,
  canEditCatalog,
  newEquipoValue,
  newSetupValue,
  newReparacionValue,
  newFleteValue,
  onPick,
  onEdit,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [panel, setPanel] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const groups: Group[] = [];
  if (equipos.length > 0 || canAddEquipo) {
    const entries: MenuEntry[] = equipos.map((eq) => ({
      value: `equipo_${eq.id}`,
      label: `${eq.marcaEquipo} - ${eq.modelo} - ${eq.procesador}`,
      editId: canEditEquipo ? eq.id : undefined,
    }));
    if (canAddEquipo) entries.push({ value: newEquipoValue, label: "+ Nuevo equipo ASIC…", create: true });
    groups.push({ label: "Equipos ASIC", kind: "equipo", entries });
  }
  groups.push({
    label: "Setup",
    kind: "setup",
    entries: [
      ...(setups.length > 0
        ? setups.map((s) => ({
            value: `setup_${s.id}`,
            label: `${s.nombre} - ${money(s.precioUSD)}`,
            editId: canEditCatalog ? s.id : undefined,
          }))
        : [{ value: "", label: "No hay Setup disponibles.", disabled: true }]),
      ...(canAddCatalog ? [{ value: newSetupValue, label: "+ Nuevo Setup…", create: true }] : []),
    ],
  });
  groups.push({
    label: "Reparación",
    kind: "reparacion",
    entries: [
      ...(reparaciones.length > 0
        ? reparaciones.map((r) => ({
            value: `reparacion_${r.id}`,
            label: `${r.nombre} - ${money(r.precioUSD)}`,
            editId: canEditCatalog ? r.id : undefined,
          }))
        : [{ value: "", label: "No hay tipos de reparación.", disabled: true }]),
      ...(canAddCatalog ? [{ value: newReparacionValue, label: "+ Nuevo tipo de reparación…", create: true }] : []),
    ],
  });
  groups.push({
    label: "Transporte y fletes",
    kind: "flete",
    entries: [
      ...(fletes.length > 0
        ? fletes.map((f) => ({
            value: `flete_${f.id}`,
            label: `${f.nombre} - ${money(f.precioUSD)}`,
            editId: canEditCatalog ? f.id : undefined,
          }))
        : [{ value: "", label: "No hay ítems de transporte/flete.", disabled: true }]),
      ...(canAddCatalog ? [{ value: newFleteValue, label: "+ Nuevo transporte / flete…", create: true }] : []),
    ],
  });

  const selected = groups.flatMap((group) => group.entries).find((entry) => entry.value && entry.value === value);
  const triggerLabel = selected?.label || placeholder || "Seleccionar...";

  function placePanel() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(360, (openUp ? spaceAbove : spaceBelow) - 12));
    const top = openUp ? Math.max(8, rect.top - 4 - maxHeight) : rect.bottom + 4;
    setPanel({
      top,
      left: rect.left,
      width: Math.max(rect.width, 280),
      maxHeight,
    });
  }

  useEffect(() => {
    if (!open) return;
    placePanel();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onMove = () => placePanel();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  return (
    <div className="asic-bill-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="asic-bill-menu-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
      >
        <span>{triggerLabel}</span>
        <i className="bi bi-chevron-down" aria-hidden="true" />
      </button>
      {open && panel
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className="asic-bill-menu-panel"
              role="listbox"
              style={{ top: panel.top, left: panel.left, width: panel.width, maxHeight: panel.maxHeight }}
            >
              {groups.map((group) => (
                <div key={group.kind} className="asic-bill-menu-group">
                  <div className="asic-bill-menu-group-label">{group.label}</div>
                  {group.entries.map((entry) => (
                    <div
                      key={`${group.kind}-${entry.value || entry.label}`}
                      className={`asic-bill-menu-row${entry.create ? " is-create" : ""}${entry.value === value ? " is-on" : ""}${entry.disabled ? " is-disabled" : ""}`}
                    >
                      <button
                        type="button"
                        className="asic-bill-menu-pick"
                        disabled={entry.disabled}
                        onClick={() => {
                          if (entry.disabled || !entry.value) return;
                          setOpen(false);
                          onPick(entry.value);
                        }}
                      >
                        {entry.label}
                      </button>
                      {entry.editId ? (
                        <button
                          type="button"
                          className="asic-bill-menu-edit"
                          title="Editar"
                          aria-label={`Editar ${entry.label}`}
                          onClick={() => {
                            setOpen(false);
                            onEdit(group.kind, entry.editId!);
                          }}
                        >
                          <i className="bi bi-pencil" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
