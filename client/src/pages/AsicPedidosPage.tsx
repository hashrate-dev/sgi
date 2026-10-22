import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AsicCotizadorCatalogSelect } from "../components/AsicCotizadorCatalogSelect";
import { BillingHostingClientPicker } from "../components/BillingHostingClientPicker";
import { useAuth } from "../contexts/AuthContext";
import { getClients, getEquipos } from "../lib/api";
import { canEditClientes } from "../lib/auth";
import { isClienteTiendaOnline } from "../lib/clientTienda";
import { canUserAccessScreen } from "../lib/sgiNavigation";
import type { Client, EquipoASIC } from "../lib/types";
import {
  asicPedidoEtapaLabel,
  asicPedidoMedioLabel,
  asicPedidoOrigenLabel,
  asicPedidoStageDetail,
  asicPedidoStageSummary,
  asicPedidoStageTitle,
  asicPedidoStagesFor,
  confirmAsicPedidoStage,
  createAsicPedido,
  deleteAsicPedido,
  formatAsicPedidoFecha,
  listAsicPedidos,
  reopenAsicPedidoStage,
  updateAsicPedido,
  type AsicPedido,
  type AsicPedidoMedioDinero,
  type AsicPedidoModoCobro,
  type AsicPedidoOrigen,
  type AsicPedidoStageKey,
} from "../lib/asicPedidoFlow";
import "../styles/facturacion.css";
import "../styles/asic-pedidos.css";

function todayISO(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "No se pudo completar la acción.";
}

export function AsicPedidosPage() {
  const { user } = useAuth();
  const canView = canUserAccessScreen(user, "asic-pedidos");
  const canWrite = Boolean(user && user.role !== "lector");
  const canAddClient = Boolean(user && canEditClientes(user));
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("id") || 0) || null;
  const [pedidos, setPedidos] = useState<AsicPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await listAsicPedidos();
    setPedidos(Array.isArray(res.pedidos) ? res.pedidos : []);
  }, []);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((e) => {
        if (!cancelled) setErr(errorText(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, load]);

  const selected = useMemo(
    () => pedidos.find((pedido) => pedido.id === selectedId) ?? null,
    [pedidos, selectedId]
  );

  const openPedido = (id: number) => {
    setErr(null);
    setParams({ id: String(id) });
  };

  const backToList = () => {
    setErr(null);
    setParams({});
  };

  if (!user || !canView) return <Navigate to="/asic" replace />;

  return (
    <div className="fact-page mineria-page asic-pedidos-page">
      <div className="container py-3">
        {selected ? (
          <PedidoDetail
            pedido={selected}
            canWrite={canWrite}
            busy={busy}
            err={err}
            onBack={backToList}
            onError={setErr}
            onRun={async (task) => {
              setBusy(true);
              setErr(null);
              try {
                const next = await task();
                setPedidos((prev) => prev.map((row) => (row.id === next.id ? next : row)));
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
            onDeleted={() => {
              setPedidos((prev) => prev.filter((row) => row.id !== selected.id));
              backToList();
            }}
          />
        ) : (
          <PedidoList
            pedidos={pedidos}
            loading={loading}
            err={err}
            canWrite={canWrite}
            canAddClient={canAddClient}
            showCreate={showCreate}
            busy={busy}
            onToggleCreate={() => {
              setErr(null);
              setShowCreate((v) => !v);
            }}
            onOpen={openPedido}
            onCreate={async (body) => {
              setBusy(true);
              setErr(null);
              try {
                const res = await createAsicPedido(body);
                setPedidos((prev) => [res.pedido, ...prev]);
                setShowCreate(false);
                openPedido(res.pedido.id);
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function PedidoList({
  pedidos,
  loading,
  err,
  canWrite,
  canAddClient,
  showCreate,
  busy,
  onToggleCreate,
  onOpen,
  onCreate,
}: {
  pedidos: AsicPedido[];
  loading: boolean;
  err: string | null;
  canWrite: boolean;
  canAddClient: boolean;
  showCreate: boolean;
  busy: boolean;
  onToggleCreate: () => void;
  onOpen: (id: number) => void;
  onCreate: (body: {
    cliente: string;
    clientId?: number;
    origen: AsicPedidoOrigen;
    marca: string;
    equipo: string;
    procesador: string;
    cantidad: number;
    vendedor: string;
    tieneComision: boolean;
    comisionUsd?: number;
    fechaContrato: string;
    contratoRef: string;
    notas: string;
    aduanaAplica: boolean;
  }) => Promise<void>;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [equipos, setEquipos] = useState<EquipoASIC[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [origen, setOrigen] = useState<AsicPedidoOrigen>("china");
  const [marca, setMarca] = useState("");
  const [equipoKey, setEquipoKey] = useState("");
  const [procesador, setProcesador] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [vendedor, setVendedor] = useState("");
  const [tieneComision, setTieneComision] = useState(false);
  const [comisionUsd, setComisionUsd] = useState("");
  const [fechaContrato, setFechaContrato] = useState(todayISO);
  const [contratoRef, setContratoRef] = useState("");
  const [notas, setNotas] = useState("");
  const [aduanaAplica, setAduanaAplica] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getClients()
      .then((r) => {
        if (cancelled) return;
        const hosting = ((r.clients ?? []) as Client[]).filter((c) => !isClienteTiendaOnline(c));
        setClients(hosting);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    void getEquipos()
      .then((r) => {
        if (!cancelled) setEquipos(Array.isArray(r.items) ? r.items : []);
      })
      .catch(() => {
        if (!cancelled) setEquipos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const modeloOptions = useMemo(() => {
    const map = new Map<string, { key: string; marca: string; modelo: string }>();
    for (const item of equipos) {
      const marcaItem = String(item.marcaEquipo ?? "").trim();
      const modelo = String(item.modelo ?? "").trim();
      if (!modelo) continue;
      const key = `${marcaItem.toLowerCase()}|${modelo.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, marca: marcaItem, modelo });
    }
    const marcaKey = marca.trim().toLowerCase();
    const all = [...map.values()].sort((a, b) => a.modelo.localeCompare(b.modelo, "es"));
    if (!marcaKey) return all;
    const matched = all.filter((item) => item.marca.toLowerCase() === marcaKey);
    return matched.length > 0 ? matched : all;
  }, [equipos, marca]);

  const modeloSeleccionado = modeloOptions.find((item) => item.key === equipoKey) ?? null;

  const procesadorOptions = useMemo(() => {
    if (!modeloSeleccionado) return [];
    const modeloKey = modeloSeleccionado.modelo.toLowerCase();
    const marcaKey = modeloSeleccionado.marca.toLowerCase();
    const set = new Set<string>();
    for (const item of equipos) {
      const modelo = String(item.modelo ?? "").trim();
      const marcaItem = String(item.marcaEquipo ?? "").trim();
      const proc = String(item.procesador ?? "").trim();
      if (!proc || modelo.toLowerCase() !== modeloKey) continue;
      if (marcaKey && marcaItem.toLowerCase() !== marcaKey) continue;
      set.add(proc);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [equipos, modeloSeleccionado]);

  return (
    <>
      <div className="asic-pedidos-head">
        <div>
          <h1>Seguimiento de pedidos ASIC</h1>
          <p className="asic-pedidos-lead">
            Cada pedido arranca cuando el cliente firma el contrato y sigue hasta que las máquinas quedan instaladas en el datacenter de Ayolas.
          </p>
        </div>
        <div className="asic-pedidos-actions">
          <Link to="/asic" className="asic-pedidos-ghost">
            Volver a Equipos ASIC
          </Link>
          {canWrite ? (
            <button type="button" className="asic-pedidos-primary" onClick={onToggleCreate}>
              {showCreate ? "Cerrar" : "Nuevo pedido"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="asic-pedidos-flow" aria-label="Etapas del proceso">
        {[
          "1. Contrato",
          "2. Factura o comprobante",
          "3. Dinero recibido",
          "4. Pedido",
          "5. Pago al proveedor",
          "6. Envío",
          "7. Llegada a aduana",
          "8. Salida de aduana",
          "9. Camino a Ayolas",
          "10. Llegada al DC",
          "11. Instalación",
        ].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {err ? <div className="asic-pedidos-error">{err}</div> : null}

      {showCreate ? (
        <form
          className="asic-pedidos-card mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            const qty = Number(cantidad);
            const selected = clients.find((c) => String(c.id) === String(clientId));
            const modelo = modeloSeleccionado?.modelo.trim() ?? "";
            const comision = Number(comisionUsd.replace(",", "."));
            if (!selected) {
              setCatalogError("Elegí un cliente de hosting o ASIC.");
              return;
            }
            if (!marca.trim() || !modelo || !procesador.trim()) {
              setCatalogError("Elegí marca, modelo y procesador.");
              return;
            }
            if (!vendedor.trim()) {
              setCatalogError("Indicá el vendedor.");
              return;
            }
            if (!fechaContrato || !Number.isFinite(qty) || qty < 1) return;
            if (tieneComision && !Number.isFinite(comision)) {
              setCatalogError("Indicá el monto de la comisión en USD.");
              return;
            }
            setCatalogError(null);
            const name = `${String(selected.name ?? "").trim()}${selected.name2?.trim() ? ` ${selected.name2.trim()}` : ""}`.trim();
            const code = String(selected.code ?? "").trim();
            void onCreate({
              cliente: code && name ? `${code} - ${name}` : name || code,
              clientId: Number(selected.id),
              origen,
              marca: marca.trim(),
              equipo: modelo,
              procesador: procesador.trim(),
              cantidad: qty,
              vendedor: vendedor.trim(),
              tieneComision,
              ...(tieneComision ? { comisionUsd: comision } : {}),
              fechaContrato,
              contratoRef: contratoRef.trim(),
              notas: notas.trim(),
              aduanaAplica: origen === "china" ? true : aduanaAplica,
            });
          }}
        >
          <h2 className="h6 fw-bold mb-3">Momento 0 — el cliente firma el contrato</h2>
          {catalogError ? <div className="asic-pedidos-error">{catalogError}</div> : null}
          <div className="asic-pedidos-form">
            <div className="span-2">
              <span className="asic-pedidos-label">Cliente</span>
              <BillingHostingClientPicker
                listId="asic-pedido-cliente"
                clients={clients}
                selectedClientId={clientId}
                onSelectClientId={(id) => setClientId(id === "" ? "" : Number(id))}
                canAdd={canAddClient}
                onClientCreated={async (created) => {
                  const r = await getClients();
                  const hosting = ((r.clients ?? []) as Client[]).filter((c) => !isClienteTiendaOnline(c));
                  setClients(hosting);
                  if (created.id > 0) setClientId(created.id);
                }}
                emptyHint="No hay clientes de hosting ni ASIC. Agregá uno con el botón de abajo."
              />
            </div>
            <label>
              Origen de las máquinas
              <select
                value={origen}
                onChange={(e) => {
                  const next = e.target.value === "paraguay" ? "paraguay" : "china";
                  setOrigen(next);
                  if (next === "china") setAduanaAplica(true);
                }}
              >
                <option value="china">China</option>
                <option value="paraguay">Paraguay</option>
              </select>
            </label>
            <label>
              Cantidad
              <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} required inputMode="numeric" min={1} />
            </label>
            <div>
              <span className="asic-pedidos-label" id="asic-pedido-marca">Marca</span>
              <AsicCotizadorCatalogSelect
                tipo="marca"
                value={marca}
                onChange={(value) => {
                  setMarca(value);
                  setEquipoKey((prev) => {
                    const current = modeloOptions.find((item) => item.key === prev);
                    if (current?.marca && value && current.marca.toLowerCase() !== value.trim().toLowerCase()) {
                      setProcesador("");
                      return "";
                    }
                    return prev;
                  });
                }}
                labelId="asic-pedido-marca"
                placeholder="Seleccionar marca"
                searchPlaceholder="Buscar marca…"
                addLabel="Agregar nueva marca"
                newTitle="Nueva marca"
                allowCreate={canWrite}
                onError={setCatalogError}
              />
            </div>
            <label>
              Modelo
              <select
                value={equipoKey}
                required
                onChange={(e) => {
                  const next = modeloOptions.find((item) => item.key === e.target.value);
                  setEquipoKey(e.target.value);
                  setProcesador("");
                  if (!next) return;
                  if (next.marca) setMarca(next.marca);
                  const procs = equipos
                    .filter((item) => {
                      const modelo = String(item.modelo ?? "").trim().toLowerCase();
                      const marcaItem = String(item.marcaEquipo ?? "").trim().toLowerCase();
                      return modelo === next.modelo.toLowerCase() && (!next.marca || marcaItem === next.marca.toLowerCase());
                    })
                    .map((item) => String(item.procesador ?? "").trim())
                    .filter(Boolean);
                  const unicos = [...new Set(procs)];
                  if (unicos.length === 1) setProcesador(unicos[0] ?? "");
                }}
              >
                <option value="">Seleccionar modelo</option>
                {modeloOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.modelo}
                  </option>
                ))}
              </select>
              {equipos.length === 0 ? <small className="text-muted">No hay modelos cargados en la base de equipos ASIC.</small> : null}
            </label>
            <label>
              Procesador
              <select
                value={procesador}
                required
                disabled={!modeloSeleccionado}
                onChange={(e) => setProcesador(e.target.value)}
              >
                <option value="">{modeloSeleccionado ? "Seleccionar procesador" : "Seleccionar modelo primero"}</option>
                {procesadorOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vendedor
              <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} required maxLength={200} />
            </label>
            <div>
              <span className="asic-pedidos-label">Comisión</span>
              <div className="asic-pedidos-choice">
                <button type="button" className={!tieneComision ? "is-on" : ""} onClick={() => setTieneComision(false)}>
                  <strong>Sin comisión</strong>
                </button>
                <button type="button" className={tieneComision ? "is-on" : ""} onClick={() => setTieneComision(true)}>
                  <strong>Con comisión</strong>
                </button>
              </div>
            </div>
            {tieneComision ? (
              <label>
                Monto de la comisión (USD)
                <input value={comisionUsd} onChange={(e) => setComisionUsd(e.target.value)} inputMode="decimal" required placeholder="0,00" />
              </label>
            ) : null}
            <label>
              Fecha de firma
              <input type="date" value={fechaContrato} onChange={(e) => setFechaContrato(e.target.value)} required />
            </label>
            <label>
              Referencia del contrato
              <input value={contratoRef} onChange={(e) => setContratoRef(e.target.value)} maxLength={120} />
            </label>
            {origen === "paraguay" ? (
              <label className="span-2" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={aduanaAplica}
                  onChange={(e) => setAduanaAplica(e.target.checked)}
                  style={{ width: "1rem", height: "1rem" }}
                />
                Este pedido pasa por aduana
              </label>
            ) : (
              <p className="span-2 text-muted small mb-0">Un pedido desde China pasa por aduana antes de ir a Ayolas.</p>
            )}
            <label className="span-2">
              Notas
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={2000} />
            </label>
          </div>
          <div className="asic-pedidos-actions mt-3">
            <button type="submit" className="asic-pedidos-primary" disabled={busy}>
              {busy ? "Guardando…" : "Crear pedido y seguir"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="asic-pedidos-card">
        {loading ? (
          <p className="text-muted mb-0">Cargando pedidos…</p>
        ) : pedidos.length === 0 ? (
          <p className="text-muted mb-0">Todavía no hay pedidos. El seguimiento empieza con la firma del contrato.</p>
        ) : (
          <div className="table-responsive">
            <table className="asic-pedidos-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Origen</th>
                  <th>Equipo</th>
                  <th>Etapa</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <tr key={pedido.id} onClick={() => onOpen(pedido.id)}>
                    <td>
                      <strong>{pedido.cliente}</strong>
                      <div className="text-muted small">{pedido.cantidad} equipo{pedido.cantidad === 1 ? "" : "s"}</div>
                    </td>
                    <td className="asic-pedidos-origin">{asicPedidoOrigenLabel(pedido.origen)}</td>
                    <td>
                      {[pedido.marca, pedido.equipo, pedido.procesador].filter(Boolean).join(" · ") || pedido.equipo}
                      {pedido.vendedor ? (
                        <div className="text-muted small">
                          {pedido.vendedor}
                          {pedido.tieneComision
                            ? ` · comisión ${Number(pedido.comisionUsd ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                            : " · sin comisión"}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`asic-pedidos-badge${pedido.etapaActual === "completo" ? " asic-pedidos-badge--done" : ""}`}>
                        {asicPedidoEtapaLabel(pedido)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function PedidoDetail({
  pedido,
  canWrite,
  busy,
  err,
  onBack,
  onError,
  onRun,
  onDeleted,
}: {
  pedido: AsicPedido;
  canWrite: boolean;
  busy: boolean;
  err: string | null;
  onBack: () => void;
  onError: (message: string | null) => void;
  onRun: (task: () => Promise<AsicPedido>) => Promise<void>;
  onDeleted: () => void;
}) {
  const stages = asicPedidoStagesFor(pedido);
  const doneCount = stages.filter((key) => pedido.etapas[key]?.status === "done").length;
  const customsStillOpen =
    pedido.origen === "paraguay" &&
    pedido.etapas.aduana_llegada?.status !== "done" &&
    pedido.etapas.aduana_salida?.status !== "done" &&
    pedido.etapas.camino_ayolas?.status !== "done";

  return (
    <>
      <div className="asic-pedidos-head">
        <div>
          <h1>{pedido.cliente}</h1>
          <p className="asic-pedidos-lead">
            {[pedido.marca, pedido.equipo, pedido.procesador].filter(Boolean).join(" · ") || pedido.equipo}
            {" · "}
            {pedido.cantidad} equipo{pedido.cantidad === 1 ? "" : "s"} · origen {asicPedidoOrigenLabel(pedido.origen)}
          </p>
        </div>
        <div className="asic-pedidos-actions">
          <button type="button" className="asic-pedidos-ghost" onClick={onBack}>
            Volver al listado
          </button>
          {canWrite ? (
            <button
              type="button"
              className="asic-pedidos-danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`¿Eliminar el pedido de ${pedido.cliente}?`)) return;
                void onRun(async () => {
                  await deleteAsicPedido(pedido.id);
                  onDeleted();
                  return pedido;
                });
              }}
            >
              Eliminar
            </button>
          ) : null}
        </div>
      </div>

      <div className="asic-pedidos-meta">
        <span>
          Etapa {Math.min(doneCount + (pedido.etapaActual === "completo" ? 0 : 1), stages.length)} de {stages.length}
        </span>
        <span>{doneCount} confirmada{doneCount === 1 ? "" : "s"}</span>
        <span>{pedido.aduanaAplica ? "Pasa por aduana" : "Sin aduana"}</span>
        {pedido.vendedor ? <span>Vendedor: {pedido.vendedor}</span> : null}
        <span>
          {pedido.tieneComision
            ? `Comisión ${Number(pedido.comisionUsd ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
            : "Sin comisión"}
        </span>
      </div>

      {err ? <div className="asic-pedidos-error">{err}</div> : null}

      {pedido.notas ? <p className="asic-pedidos-card mb-3">{pedido.notas}</p> : null}

      {canWrite && customsStillOpen ? (
        <div className="asic-pedidos-actions mb-3">
          <button
            type="button"
            className="asic-pedidos-ghost"
            disabled={busy}
            onClick={() => void onRun(() => updateAsicPedido(pedido.id, { aduanaAplica: !pedido.aduanaAplica }).then((r) => r.pedido))}
          >
            {pedido.aduanaAplica ? "Marcar que no pasa por aduana" : "Marcar que sí pasa por aduana"}
          </button>
        </div>
      ) : null}

      <div className="asic-pedidos-timeline">
        {stages.map((key, index) => {
          const state = pedido.etapas[key];
          const done = state?.status === "done";
          const current = pedido.etapaActual === key;
          return (
            <div key={key}>
              <article
                className={`asic-pedidos-step${done ? " asic-pedidos-step--done" : ""}${current ? " asic-pedidos-step--current" : ""}`}
              >
                <div className="asic-pedidos-num">{done ? "✓" : index + 1}</div>
                <div>
                  <h3>{asicPedidoStageTitle(key, pedido.origen)}</h3>
                  <p>{asicPedidoStageDetail(key)}</p>
                  {done && state ? <div className="asic-pedidos-summary">{asicPedidoStageSummary(key, state)}</div> : null}
                  {done && state?.notas ? <p>{state.notas}</p> : null}
                  {canWrite && done ? (
                    <div className="asic-pedidos-actions mt-2">
                      <button
                        type="button"
                        className="asic-pedidos-ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm("Se borran esta etapa y las posteriores. ¿Reabrir?")) return;
                          void onRun(() => reopenAsicPedidoStage(pedido.id, key).then((r) => r.pedido));
                        }}
                      >
                        Reabrir desde acá
                      </button>
                    </div>
                  ) : null}
                  {canWrite && current ? (
                    <StageForm
                      pedido={pedido}
                      stage={key}
                      busy={busy}
                      onError={onError}
                      onSubmit={(body) => void onRun(() => confirmAsicPedidoStage(pedido.id, key, body).then((r) => r.pedido))}
                    />
                  ) : null}
                </div>
              </article>
              {!pedido.aduanaAplica && key === "envio" ? (
                <article className="asic-pedidos-step asic-pedidos-step--skip mt-2">
                  <div className="asic-pedidos-num">—</div>
                  <div>
                    <h3>Aduana</h3>
                    <p>No aplica. El pedido sale del proveedor de Paraguay y sigue hacia Ayolas.</p>
                  </div>
                </article>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function StageForm({
  pedido,
  stage,
  busy,
  onError,
  onSubmit,
}: {
  pedido: AsicPedido;
  stage: AsicPedidoStageKey;
  busy: boolean;
  onError: (message: string | null) => void;
  onSubmit: (body: {
    fecha: string;
    notas: string;
    modoCobro?: AsicPedidoModoCobro;
    numeroFactura?: string;
    numeroRecibo?: string;
    numeroComprobante?: string;
    medioDinero?: AsicPedidoMedioDinero;
    referencia?: string;
    montoUsd?: number;
    saltarAduana?: boolean;
  }) => void;
}) {
  const [fecha, setFecha] = useState(todayISO);
  const [notas, setNotas] = useState("");
  const [modo, setModo] = useState<AsicPedidoModoCobro>("factura_recibo");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [numeroRecibo, setNumeroRecibo] = useState("");
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [medio, setMedio] = useState<AsicPedidoMedioDinero>("banco_py");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");

  useEffect(() => {
    setFecha(todayISO());
    setNotas("");
    setModo("factura_recibo");
    setNumeroFactura("");
    setNumeroRecibo("");
    setNumeroComprobante("");
    setMedio("banco_py");
    setReferencia("");
    setMonto("");
  }, [stage, pedido.id]);

  const referenciaLabel =
    stage === "pedido"
      ? pedido.origen === "china"
        ? "Referencia del pedido a China"
        : "Referencia del pedido al proveedor"
      : stage === "pago_proveedor"
        ? "Referencia del pago"
        : stage === "envio"
          ? "Tracking o referencia de envío"
          : stage === "aduana_salida"
            ? "Referencia del despacho"
            : "Referencia";

  const submit = () => {
    onError(null);
    const montoUsd = monto.trim() ? Number(monto.replace(",", ".")) : undefined;
    if (monto.trim() && !Number.isFinite(montoUsd)) {
      onError("El monto tiene que ser un número.");
      return;
    }
    onSubmit({
      fecha,
      notas: notas.trim(),
      ...(stage === "documentos" ? { modoCobro: modo, numeroFactura, numeroRecibo, numeroComprobante } : {}),
      ...(stage === "dinero" ? { medioDinero: medio } : {}),
      ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
      ...(montoUsd != null ? { montoUsd } : {}),
    });
  };

  return (
    <div className="asic-pedidos-stage">
      {stage === "documentos" ? (
        <div className="asic-pedidos-choice">
          <button type="button" className={modo === "factura_recibo" ? "is-on" : ""} onClick={() => setModo("factura_recibo")}>
            <strong>Factura crédito + recibo</strong>
            <span>Se emite la factura y el recibo del pago.</span>
          </button>
          <button type="button" className={modo === "comprobante_previo" ? "is-on" : ""} onClick={() => setModo("comprobante_previo")}>
            <strong>Comprobante de pago</strong>
            <span>El cliente paga antes de generar la factura.</span>
          </button>
        </div>
      ) : null}

      {stage === "documentos" && modo === "factura_recibo" ? (
        <div className="asic-pedidos-form">
          <label>
            Número de factura
            <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
          </label>
          <label>
            Número de recibo
            <input value={numeroRecibo} onChange={(e) => setNumeroRecibo(e.target.value)} />
          </label>
        </div>
      ) : null}

      {stage === "documentos" && modo === "comprobante_previo" ? (
        <label>
          Número de comprobante
          <input value={numeroComprobante} onChange={(e) => setNumeroComprobante(e.target.value)} />
        </label>
      ) : null}

      {stage === "dinero" ? (
        <div className="asic-pedidos-choice">
          {(["banco_py", "banco_uy", "binance"] as const).map((key) => (
            <button key={key} type="button" className={medio === key ? "is-on" : ""} onClick={() => setMedio(key)}>
              <strong>{asicPedidoMedioLabel(key)}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="asic-pedidos-form">
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <label>
          {referenciaLabel}
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </label>
        {stage === "dinero" || stage === "pago_proveedor" ? (
          <label>
            Monto USD
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="Opcional" />
          </label>
        ) : null}
        <label className="span-2">
          Notas
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
        </label>
      </div>

      <div className="asic-pedidos-actions">
        <button type="button" className="asic-pedidos-primary" disabled={busy || !fecha} onClick={submit}>
          {busy ? "Guardando…" : "Confirmar etapa"}
        </button>
        {stage === "aduana_llegada" && pedido.origen === "paraguay" ? (
          <button
            type="button"
            className="asic-pedidos-ghost"
            disabled={busy}
            onClick={() => onSubmit({ saltarAduana: true, fecha, notas: "" })}
          >
            Este pedido no pasa por aduana
          </button>
        ) : null}
      </div>
      {pedido.etapas.contrato?.fecha && stage !== "contrato" ? (
        <p className="text-muted small mb-0">
          Contrato firmado el {formatAsicPedidoFecha(pedido.etapas.contrato.fecha)}.
        </p>
      ) : null}
    </div>
  );
}
