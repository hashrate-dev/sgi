import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  createOpsComunicacionCorte,
  deleteOpsComunicacionCorte,
  getOpsComunicacionCortes,
  updateOpsComunicacionCorte,
  type OpsCorteWindow,
} from "../lib/api";
import { canAccessComunicacionModule, canEditComunicacionModule } from "../lib/auth";
import { durationHours, formatHoursLabel, labelEtapa } from "../lib/opsCorteControl";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/ops-comunicacion.css";

const PATH = "/gestion-administrativa/comunicacion/cortes";
const PARENT = "/gestion-administrativa/comunicacion";

type Draft = { startActual: string; endActual: string; note: string; confirmed: boolean };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function draftFrom(row: OpsCorteWindow): Draft {
  return {
    startActual: row.startActual,
    endActual: row.endActual,
    note: row.adjustmentNote,
    confirmed: row.confirmed,
  };
}

export function OpsComunicacionCortesPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<OpsCorteWindow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [addFecha, setAddFecha] = useState(todayIso);
  const [addMotivo, setAddMotivo] = useState("Reducción 23 kV ANDE · 10% potencia reservada");
  const [addFrom, setAddFrom] = useState("09:00");
  const [addTo, setAddTo] = useState("17:00");
  const [addEtapa, setAddEtapa] = useState(1);

  const canEdit = Boolean(user && canEditComunicacionModule(user));

  const applyList = (list: OpsCorteWindow[]) => {
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.id, draftFrom(r)])));
  };

  const load = useCallback(async () => {
    setTableLoading(true);
    setErr("");
    try {
      const r = await getOpsComunicacionCortes();
      applyList(r.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar el control de cortes.");
      setRows([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessComunicacionModule(user) && !canUserAccessNavPath(user, PATH) && !canUserAccessNavPath(user, PARENT)) return;
    void load();
  }, [loading, user, load]);

  const live = useMemo(() => {
    return rows.map((r) => {
      const d = drafts[r.id] || draftFrom(r);
      const hoursActual = durationHours(d.startActual, d.endActual);
      const hoursAnnounced = durationHours(r.startAnnounced, r.endAnnounced);
      return {
        ...r,
        ...d,
        hoursActual,
        hoursAnnounced,
        deltaHours: hoursActual - hoursAnnounced,
        adjusted: d.startActual !== r.startAnnounced || d.endActual !== r.endAnnounced,
      };
    });
  }, [rows, drafts]);

  const totals = useMemo(() => {
    const hoursAnnounced = live.reduce((s, x) => s + x.hoursAnnounced, 0);
    const hoursActual = live.reduce((s, x) => s + x.hoursActual, 0);
    return {
      ventanas: live.length,
      hoursAnnounced,
      hoursActual,
      deltaHours: hoursActual - hoursAnnounced,
    };
  }, [live]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (
    !loading &&
    user &&
    !canAccessComunicacionModule(user) &&
    !canUserAccessNavPath(user, PATH) &&
    !canUserAccessNavPath(user, PARENT)
  ) {
    return <Navigate to={sgiHome()} replace />;
  }

  const patchDraft = (id: number, next: Partial<Draft>) => {
    setDrafts((cur) => ({ ...cur, [id]: { ...(cur[id] || draftFrom(rows.find((r) => r.id === id)!)), ...next } }));
  };

  const onSave = async () => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      for (const r of rows) {
        const d = drafts[r.id];
        if (!d) continue;
        const same =
          d.startActual === r.startActual &&
          d.endActual === r.endActual &&
          d.note === r.adjustmentNote &&
          d.confirmed === r.confirmed;
        if (same) continue;
        await updateOpsComunicacionCorte(r.id, {
          startActual: d.startActual,
          endActual: d.endActual,
          confirmed: d.confirmed,
          adjustmentNote: d.note,
        });
      }
      await load();
      setOk("Bitácora de cortes actualizada. El mensaje de Telegram no se modifica.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron guardar los ajustes.");
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async () => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const saved = await createOpsComunicacionCorte({
        fecha: addFecha,
        motivo: addMotivo,
        from: addFrom,
        to: addTo,
        etapa: addEtapa,
      });
      applyList(saved.items || []);
      setOk("Ventana agregada al control (no se reenvía Telegram).");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo agregar la ventana.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: number) => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const saved = await deleteOpsComunicacionCorte(id);
      applyList(saved.items || []);
      setOk("Ventana quitada del control. El aviso enviado al cliente queda igual.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo quitar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fact-page crypto-news-page">
      <div className="container">
        <PageHeader title="Cortes" showBackButton backTo={PARENT} backText="Volver a Comunicación" />

        <section className="hrs-card sgi-glass-panel ops-com-cortes">
          <div className="ops-com-users__head">
            <div>
              <h1 className="ops-com-users__title">Control de cortes 23 kV</h1>
              <p className="ops-com-users__lead">
                Registro operativo de horas de curtailment. Un mismo ID puede tener dos etapas (mañana y tarde) si
                ANDE corta, se restablece un rato y vuelve a cortar. El hueco con tensión no suma horas. El aviso al
                cliente queda congelado; si los horarios se corren, ajustá inicio/fin reales.
              </p>
            </div>
            <div className="ops-com-users__actions">
              <Link to={PARENT} className="ops-com-users-btn ops-com-users-btn--back">
                Volver atrás
              </Link>
              {canEdit ? (
                <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => void onSave()}>
                  Guardar ajustes
                </button>
              ) : null}
            </div>
          </div>

          {err ? <div className="alert alert-danger py-2">{err}</div> : null}
          {ok ? <div className="alert alert-success py-2">{ok}</div> : null}

          {canEdit ? (
            <div className="ops-com-cortes__add">
              <label>
                Fecha
                <input className="fact-input" type="date" value={addFecha} onChange={(e) => setAddFecha(e.target.value)} />
              </label>
              <label className="ops-com-cortes__motivo">
                Motivo
                <input className="fact-input" value={addMotivo} maxLength={180} onChange={(e) => setAddMotivo(e.target.value)} />
              </label>
              <label>
                Etapa
                <select className="fact-input" value={addEtapa} onChange={(e) => setAddEtapa(Number(e.target.value))}>
                  <option value={1}>Mañana</option>
                  <option value={2}>Tarde</option>
                </select>
              </label>
              <label>
                Inicio
                <input className="fact-input" value={addFrom} onChange={(e) => setAddFrom(e.target.value)} />
              </label>
              <label>
                Fin
                <input className="fact-input" value={addTo} onChange={(e) => setAddTo(e.target.value)} />
              </label>
              <button type="button" className="ops-com-users-btn" disabled={busy} onClick={() => void onAdd()}>
                Agregar etapa
              </button>
            </div>
          ) : null}

          {tableLoading ? (
            <p className="text-muted mb-0">Cargando cortes…</p>
          ) : live.length === 0 ? (
            <p className="ops-com-users__empty">
              Todavía no hay etapas. Al publicar un Corte Programado se cargan mañana y tarde si el aviso trae dos
              horarios.
            </p>
          ) : (
            <div className="ops-com-users__table-wrap">
              <table className="ops-com-users__table ops-com-cortes__table">
                <thead>
                  <tr>
                    <th>ID corte</th>
                    <th>Etapa</th>
                    <th>Fecha de corte</th>
                    <th>Motivo</th>
                    <th>Inicio anunc.</th>
                    <th>Fin anunc.</th>
                    <th>Inicio real</th>
                    <th>Fin real</th>
                    <th>Horas</th>
                    <th>Δ</th>
                    <th>Confirmar</th>
                    {canEdit ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {live.map((r) => (
                    <tr key={r.id} className={r.adjusted ? "is-adjusted" : undefined}>
                      <td>
                        <code className="ops-com-cortes__id">{r.corteId || "—"}</code>
                      </td>
                      <td>
                        <span className={`ops-com-cortes__etapa ops-com-cortes__etapa--${r.etapa === 2 ? "tarde" : "manana"}`}>
                          {r.etapaLabel || labelEtapa(r.etapa || 1)}
                        </span>
                      </td>
                      <td>{r.fecha.split("-").reverse().join("/")}</td>
                      <td className="ops-com-cortes__motivo-cell">
                        {r.motivo}
                        {r.note ? <span className="ops-com-cortes__note">{r.note}</span> : null}
                      </td>
                      <td>
                        <code>{r.startAnnounced}</code>
                      </td>
                      <td>
                        <code>{r.endAnnounced}</code>
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            className="fact-input ops-com-cortes__time"
                            value={r.startActual}
                            disabled={busy}
                            onChange={(e) => patchDraft(r.id, { startActual: e.target.value })}
                          />
                        ) : (
                          <code>{r.startActual}</code>
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            className="fact-input ops-com-cortes__time"
                            value={r.endActual}
                            disabled={busy}
                            onChange={(e) => patchDraft(r.id, { endActual: e.target.value })}
                          />
                        ) : (
                          <code>{r.endActual}</code>
                        )}
                      </td>
                      <td>{formatHoursLabel(r.hoursActual)}</td>
                      <td className={r.deltaHours === 0 ? "" : r.deltaHours > 0 ? "is-plus" : "is-minus"}>
                        {r.deltaHours === 0 ? "—" : formatHoursLabel(r.deltaHours)}
                      </td>
                      <td>
                        {canEdit ? (
                          <label className="ops-com-cortes__check">
                            <input
                              type="checkbox"
                              checked={r.confirmed}
                              disabled={busy}
                              onChange={(e) => patchDraft(r.id, { confirmed: e.target.checked })}
                            />
                            <span>En sitio</span>
                          </label>
                        ) : r.confirmed ? (
                          "Confirmado"
                        ) : (
                          "Pendiente"
                        )}
                        {canEdit ? (
                          <input
                            className="fact-input ops-com-cortes__note-in"
                            placeholder="Nota de ajuste"
                            value={r.note}
                            disabled={busy}
                            onChange={(e) => patchDraft(r.id, { note: e.target.value })}
                          />
                        ) : null}
                      </td>
                      {canEdit ? (
                        <td>
                          <button type="button" className="ops-com-tg-recip__del" disabled={busy} onClick={() => void onRemove(r.id)}>
                            Quitar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="ops-com-cortes__totals">
            <div>
              <span>Etapas</span>
              <strong>{totals.ventanas}</strong>
            </div>
            <div>
              <span>Horas anunciadas</span>
              <strong>{formatHoursLabel(totals.hoursAnnounced)}</strong>
            </div>
            <div>
              <span>Horas efectivas</span>
              <strong>{formatHoursLabel(totals.hoursActual)}</strong>
            </div>
            <div>
              <span>Ajuste neto</span>
              <strong>{totals.deltaHours === 0 ? "0 h" : formatHoursLabel(totals.deltaHours)}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
