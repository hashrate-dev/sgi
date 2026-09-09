import { useMemo, useState } from "react";
import type { Client } from "../lib/types";
import { AppModal } from "./ui";
import { ClienteNewForm } from "./ClienteNewForm";

type Props = {
  clients: Client[];
  selectedClientId: number | string | "";
  onSelectClientId: (id: number | string | "") => void;
  canAdd?: boolean;
  onClientCreated?: (created: { id: number; code: string; name: string }) => void | Promise<void>;
  listId?: string;
  emptyHint?: string;
};

function clientOptionLabel(c: Client): string {
  const name = `${String(c.name ?? "").trim()}${c.name2?.trim() ? ` ${c.name2.trim()}` : ""}`.trim();
  const code = String(c.code ?? "").trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || "—";
}

/**
 * Listado siempre visible (como el select size=8 histórico de facturación)
 * + búsqueda + alta con el mismo formulario que Clientes → Hosting.
 */
export function BillingHostingClientPicker({
  clients,
  selectedClientId,
  onSelectClientId,
  canAdd = false,
  onClientCreated,
  listId,
  emptyHint = "No hay clientes cargados. Agregalos en Clientes → Hosting.",
}: Props) {
  const [clientQuery, setClientQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const filtered = !q
      ? clients
      : clients.filter((c) => {
          const label = clientOptionLabel(c).toLowerCase();
          return label.includes(q) || String(c.name ?? "").toLowerCase().includes(q);
        });
    if (selectedClientId === "" || selectedClientId == null) return filtered;
    if (filtered.some((c) => String(c.id) === String(selectedClientId))) return filtered;
    const sel = clients.find((c) => String(c.id) === String(selectedClientId));
    return sel ? [sel, ...filtered] : filtered;
  }, [clients, clientQuery, selectedClientId]);

  const closeAddModal = () => setAdding(false);

  return (
    <div className="billing-hosting-client-picker">
      <input
        className="fact-input"
        type="text"
        placeholder="Buscar por nombre o código..."
        value={clientQuery}
        onChange={(e) => setClientQuery(e.target.value)}
        aria-label="Buscar cliente"
      />
      <select
        id={listId}
        className="fact-select"
        size={8}
        value={selectedClientId === "" || selectedClientId == null ? "" : String(selectedClientId)}
        onChange={(e) => {
          const v = e.target.value;
          onSelectClientId(v === "" ? "" : Number.isFinite(Number(v)) ? Number(v) : v);
        }}
        style={{ marginTop: "0.5rem" }}
        aria-label="Lista de clientes"
      >
        <option value="">Seleccione cliente</option>
        {visibleClients.map((c) => (
          <option key={String(c.id ?? c.code)} value={String(c.id ?? "")}>
            {clientOptionLabel(c)}
          </option>
        ))}
      </select>

      {clients.length === 0 ? (
        <small className="text-muted d-block mt-1">{emptyHint}</small>
      ) : null}

      {canAdd ? (
        <div className="billing-hosting-client-picker__add mt-2">
          <button
            type="button"
            className="billing-hosting-client-picker__add-btn"
            onClick={() => setAdding(true)}
          >
            <span className="billing-hosting-client-picker__add-btn-icon" aria-hidden>
              +
            </span>
            Agregar cliente ASIC / Hosting
          </button>
        </div>
      ) : null}

      <AppModal
        open={adding}
        onOpenChange={(open) => {
          if (!open) closeAddModal();
          else setAdding(true);
        }}
        title="Agregar nuevo cliente"
        description="Mismos datos que en Clientes · Hosting"
        variant="emerald_panel"
        contentMaxW="min(100%, 980px)"
        contentClassName="billing-hosting-client-add-dialog"
        blurBackdrop
        closeOnInteractOutside
      >
        <div className="billing-hosting-client-add-modal billing-hosting-client-add-modal--full">
          <ClienteNewForm
            variant="modal"
            showExcel={false}
            onCancel={closeAddModal}
            onSuccess={async (_message, created) => {
              const id = Number(created?.id ?? 0);
              const code = String(created?.code ?? "").trim();
              const createdName = String(created?.name ?? "").trim();
              if (Number.isFinite(id) && id > 0) {
                await onClientCreated?.({ id, code, name: createdName });
                onSelectClientId(id);
                setClientQuery("");
              } else {
                await onClientCreated?.({ id: 0, code, name: createdName });
              }
              closeAddModal();
            }}
          />
        </div>
      </AppModal>
    </div>
  );
}
