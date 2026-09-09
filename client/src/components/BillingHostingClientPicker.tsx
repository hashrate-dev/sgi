import { useMemo, useState } from "react";
import { createClient } from "../lib/api";
import type { Client } from "../lib/types";

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
 * + búsqueda + alta rápida opcional debajo.
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
          {err ? <div className="small text-danger mb-1">{err}</div> : null}
          {adding ? (
            <div className="billing-hosting-client-picker__add-form">
              <input
                className="fact-input mb-1"
                placeholder="Nombre completo / razón social *"
                value={name}
                disabled={busy}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="fact-input mb-1"
                placeholder="Nombre 2 (opcional)"
                value={name2}
                disabled={busy}
                onChange={(e) => setName2(e.target.value)}
              />
              <div className="d-flex gap-1 mb-1">
                <input
                  className="fact-input"
                  placeholder="Teléfono"
                  value={phone}
                  disabled={busy}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <input
                  className="fact-input"
                  placeholder="Email"
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="d-flex flex-wrap gap-1">
                <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => void saveNew()}>
                  {busy ? "Guardando…" : "Agregar"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light"
                  disabled={busy}
                  onClick={() => {
                    setAdding(false);
                    resetDraft();
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-sm btn-outline-light w-100" onClick={() => setAdding(true)}>
              + Agregar cliente ASIC / Hosting
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
