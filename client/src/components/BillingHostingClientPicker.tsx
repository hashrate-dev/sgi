import { useMemo, useState } from "react";
import { createClient } from "../lib/api";
import type { Client } from "../lib/types";
import { AppModal } from "./ui";

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
 * + búsqueda + alta rápida opcional en modal.
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
  const [name, setName] = useState("");
  const [name2, setName2] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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

  const resetDraft = () => {
    setName("");
    setName2("");
    setPhone("");
    setEmail("");
    setErr("");
  };

  const closeAddModal = () => {
    if (busy) return;
    setAdding(false);
    resetDraft();
  };

  const saveNew = async () => {
    if (!canAdd) return;
    setErr("");
    const nombre = name.trim();
    if (!nombre) {
      setErr("Ingresá el nombre completo del cliente.");
      return;
    }
    setBusy(true);
    try {
      const r = await createClient({
        name: nombre,
        name2: name2.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });
      const id = Number(r.client?.id ?? 0);
      const code = String(r.client?.code ?? "").trim();
      const createdName = String(r.client?.name ?? nombre).trim();
      if (!Number.isFinite(id) || id <= 0) throw new Error("No se obtuvo el ID del cliente creado.");
      await onClientCreated?.({ id, code, name: createdName });
      onSelectClientId(id);
      resetDraft();
      setAdding(false);
      setClientQuery("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el cliente.");
    } finally {
      setBusy(false);
    }
  };

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
        title="Nuevo cliente"
        description="Alta rápida para facturación ASIC / Hosting"
        variant="emerald_panel"
        contentMaxW="min(100%, 480px)"
        contentClassName="billing-hosting-client-add-dialog"
        closeOnInteractOutside={!busy}
        footer={
          <div className="billing-hosting-client-add-modal__actions">
            <button
              type="button"
              className="billing-hosting-client-add-modal__btn billing-hosting-client-add-modal__btn--ghost"
              disabled={busy}
              onClick={closeAddModal}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="billing-hosting-client-add-modal__btn billing-hosting-client-add-modal__btn--primary"
              disabled={busy}
              onClick={() => void saveNew()}
            >
              {busy ? "Guardando…" : "Agregar cliente"}
            </button>
          </div>
        }
      >
        <div className="billing-hosting-client-add-modal">
          <div className="billing-hosting-client-add-modal__panel">
            <div className="billing-hosting-client-add-modal__badge" aria-hidden>
              <span>👤</span>
              <span>Cliente ASIC / Hosting</span>
            </div>

            {err ? <div className="billing-hosting-client-add-modal__error">{err}</div> : null}

            <label className="billing-hosting-client-add-modal__label" htmlFor="billing-new-client-name">
              Nombre completo / razón social
              <span className="billing-hosting-client-add-modal__req" aria-hidden>
                {" "}
                *
              </span>
            </label>
            <input
              id="billing-new-client-name"
              className="fact-input billing-hosting-client-add-modal__input"
              placeholder="Ej. PIROTTO, PABLO"
              value={name}
              disabled={busy}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveNew();
                }
              }}
            />

            <label className="billing-hosting-client-add-modal__label" htmlFor="billing-new-client-name2">
              Nombre 2 <span className="billing-hosting-client-add-modal__optional">(opcional)</span>
            </label>
            <input
              id="billing-new-client-name2"
              className="fact-input billing-hosting-client-add-modal__input"
              placeholder="Segundo nombre o alias"
              value={name2}
              disabled={busy}
              onChange={(e) => setName2(e.target.value)}
            />

            <div className="billing-hosting-client-add-modal__row">
              <div className="billing-hosting-client-add-modal__col">
                <label className="billing-hosting-client-add-modal__label" htmlFor="billing-new-client-phone">
                  Teléfono <span className="billing-hosting-client-add-modal__optional">(opcional)</span>
                </label>
                <input
                  id="billing-new-client-phone"
                  className="fact-input billing-hosting-client-add-modal__input"
                  placeholder="(+598) …"
                  value={phone}
                  disabled={busy}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="billing-hosting-client-add-modal__col">
                <label className="billing-hosting-client-add-modal__label" htmlFor="billing-new-client-email">
                  Email <span className="billing-hosting-client-add-modal__optional">(opcional)</span>
                </label>
                <input
                  id="billing-new-client-email"
                  className="fact-input billing-hosting-client-add-modal__input"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
