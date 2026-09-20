import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  detectOpsComunicacionTelegramChats,
  getOpsComunicacionTelegram,
  putOpsComunicacionTelegram,
  type OpsComunicacionTelegramRecipient,
} from "../lib/api";
import { canAccessComunicacionModule, canEditComunicacionModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/ops-comunicacion.css";

const PATH = "/gestion-administrativa/comunicacion/usuarios-bot";
const PARENT = "/gestion-administrativa/comunicacion";

function displayName(c: OpsComunicacionTelegramRecipient): string {
  const n = String(c.name || "").trim();
  if (n && n !== c.chatId) return n;
  if (c.chatId === "1022374559") return "JL";
  return "";
}

export function OpsComunicacionBotUsersPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<OpsComunicacionTelegramRecipient[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [poolUsers, setPoolUsers] = useState<Record<string, string>>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const canEdit = Boolean(user && canEditComunicacionModule(user));

  const load = useCallback(async () => {
    setTableLoading(true);
    setErr("");
    try {
      const tg = await getOpsComunicacionTelegram();
      const list = tg.recipients || [];
      setEnabled(Boolean(tg.enabled));
      setRows(list);
      setNames(Object.fromEntries(list.map((c) => [c.chatId, displayName(c)])));
      setPoolUsers(Object.fromEntries(list.map((c) => [c.chatId, String(c.poolUser || "")])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron cargar los usuarios del bot.");
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

  const persist = async (next: OpsComunicacionTelegramRecipient[]) => {
    const saved = await putOpsComunicacionTelegram({
      enabled: enabled && next.length > 0,
      recipients: next,
    });
    const list = saved.recipients || next;
    setRows(list);
    setNames(Object.fromEntries(list.map((c) => [c.chatId, displayName(c)])));
    setPoolUsers(Object.fromEntries(list.map((c) => [c.chatId, String(c.poolUser || "")])));
    return list;
  };

  const onSaveNames = async () => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const next = rows.map((c) => {
        const name = (names[c.chatId] || "").trim() || c.name || c.chatId;
        const poolUser = (poolUsers[c.chatId] || "").trim();
        return { ...c, name, poolUser };
      });
      await persist(next);
      setOk("Datos de clientes guardados.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron guardar los datos.");
    } finally {
      setBusy(false);
    }
  };

  const onDetect = async () => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await detectOpsComunicacionTelegramChats();
      const found = r.chats || [];
      const byId = new Map(rows.map((c) => [c.chatId, c]));
      for (const c of found) {
        const prev = byId.get(c.chatId);
        const name = (names[c.chatId] || "").trim() || (c.name && c.name !== c.chatId ? c.name : "") || prev?.name || c.chatId;
        byId.set(c.chatId, {
          chatId: c.chatId,
          name,
          username: c.username || prev?.username,
          poolUser: (poolUsers[c.chatId] || prev?.poolUser || "").trim(),
        });
      }
      const next = [...byId.values()];
      await persist(next);
      setOk(
        found.length
          ? `Lista actualizada: ${next.length} usuario(s) conectado(s) al bot.`
          : r.hint || "No apareció nadie nuevo. Que manden /start al bot y volvé a actualizar."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron detectar chats.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (chatId: string) => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await persist(rows.filter((c) => c.chatId !== chatId));
      setOk("Usuario quitado. Ya no recibe avisos.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo quitar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fact-page crypto-news-page">
      <div className="container">
        <PageHeader title="Usuarios del bot" showBackButton backTo={PARENT} backText="Volver a Comunicación" />

        <section className="hrs-card sgi-glass-panel ops-com-users">
          <div className="ops-com-users__head">
            <div>
              <h1 className="ops-com-users__title">Conectados a Hashrate Operations</h1>
              <p className="ops-com-users__lead">
                Cada fila es un chat privado. Ellos no ven esta tabla ni a los demás. El nombre de cliente y el usuario
                pool los cargás vos en el SGI.
              </p>
            </div>
            <div className="ops-com-users__actions">
              <Link to={PARENT} className="ops-com-users-btn ops-com-users-btn--back">
                Volver atrás
              </Link>
              {canEdit ? (
                <>
                  <button type="button" className="ops-com-hist-full" disabled={busy} onClick={() => void onDetect()}>
                    {busy ? "Actualizando…" : "Actualizar desde Telegram"}
                  </button>
                  <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => void onSaveNames()}>
                    Guardar
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {err ? <div className="alert alert-danger py-2">{err}</div> : null}
          {ok ? <div className="alert alert-success py-2">{ok}</div> : null}

          {tableLoading ? (
            <p className="text-muted mb-0">Cargando usuarios…</p>
          ) : rows.length === 0 ? (
            <p className="ops-com-users__empty">
              Todavía no hay usuarios. Que manden /start a @hashrate_operations_bot y tocá Actualizar desde Telegram.
            </p>
          ) : (
            <div className="ops-com-users__table-wrap">
              <table className="ops-com-users__table">
                <thead>
                  <tr>
                    <th>Nombre del cliente</th>
                    <th>Usuario pool</th>
                    <th>Chat ID</th>
                    {canEdit ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.chatId}>
                      <td>
                        {canEdit ? (
                          <input
                            className="fact-input ops-com-users__name"
                            value={names[c.chatId] ?? ""}
                            placeholder="Nombre del cliente"
                            disabled={busy}
                            maxLength={80}
                            onChange={(e) => setNames((cur) => ({ ...cur, [c.chatId]: e.target.value }))}
                          />
                        ) : (
                          displayName(c) || "—"
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            className="fact-input ops-com-users__name ops-com-users__pool"
                            value={poolUsers[c.chatId] ?? ""}
                            placeholder="Usuario pool"
                            disabled={busy}
                            maxLength={80}
                            autoComplete="off"
                            onChange={(e) => setPoolUsers((cur) => ({ ...cur, [c.chatId]: e.target.value }))}
                          />
                        ) : (
                          c.poolUser || "—"
                        )}
                      </td>
                      <td>
                        <code>{c.chatId}</code>
                      </td>
                      {canEdit ? (
                        <td>
                          <button
                            type="button"
                            className="ops-com-tg-recip__del"
                            disabled={busy}
                            onClick={() => void onRemove(c.chatId)}
                          >
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
        </section>
      </div>
    </div>
  );
}
