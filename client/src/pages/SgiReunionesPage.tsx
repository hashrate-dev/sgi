import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { canViewSiteMeetings } from "../lib/auth";
import { getReunionesAgenda, type ReunionAgendaItem } from "../lib/api";
import { sgiHome } from "../lib/marketplacePaths";
import "../styles/facturacion.css";
import "../styles/sgi-reuniones.css";

type RangeTab = "upcoming" | "past";

function formatDayKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeRange(startIso: string, endIso: string, tz: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(tz ? { timeZone: tz } : {}),
  };
  const start = new Date(startIso).toLocaleTimeString("es-AR", opts);
  const end = new Date(endIso).toLocaleTimeString("es-AR", opts);
  return `${start} – ${end}`;
}

function durationMinutes(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

function inviteeSummary(invitees: ReunionAgendaItem["invitees"]): string {
  if (!invitees.length) return "Sin invitado registrado";
  const first = invitees[0];
  const name = first.name?.trim();
  const email = first.email?.trim();
  if (name && email) return `${name} · ${email}`;
  return name || email || "Invitado";
}

function groupByDay(events: ReunionAgendaItem[]): Array<{ day: string; items: ReunionAgendaItem[] }> {
  const map = new Map<string, ReunionAgendaItem[]>();
  for (const ev of events) {
    const key = formatDayKey(ev.startTime);
    const list = map.get(key) ?? [];
    list.push(ev);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
}

export function SgiReunionesPage() {
  const { user } = useAuth();
  const canView = Boolean(user && canViewSiteMeetings(user));
  const [range, setRange] = useState<RangeTab>("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [configMessage, setConfigMessage] = useState("");
  const [events, setEvents] = useState<ReunionAgendaItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [ownerName, setOwnerName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getReunionesAgenda(range);
      setConfigured(data.configured !== false);
      setConfigMessage(data.message ?? "");
      setEvents(Array.isArray(data.events) ? data.events : []);
      setFetchedAt(data.fetchedAt ?? "");
      setOwnerName(data.ownerName ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la agenda.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  const grouped = useMemo(() => groupByDay(events), [events]);
  const updatedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  if (!canView) return <Navigate to={sgiHome()} replace />;

  return (
    <div className="fact-page sgi-reuniones-page">
      <div className="container py-4">
        <div className="sgi-reuniones-head">
          <div>
            <Link to={sgiHome()} className="fact-back d-inline-flex align-items-center gap-1 mb-2">
              <i className="bi bi-arrow-left" aria-hidden />
              Volver al inicio
            </Link>
            <h1 className="sgi-reuniones-title">Reuniones</h1>
            <p className="sgi-reuniones-subtitle">
              Agenda de reservas Calendly{ownerName ? ` · ${ownerName}` : ""}. Solo visible para administradores del sitio.
            </p>
          </div>
          <div className="sgi-reuniones-head__actions">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                const opener = (window as Window & { HrsCalendly?: { open?: () => void } }).HrsCalendly;
                if (opener?.open) opener.open();
                else window.open("https://calendly.com/hashrate-space/30min", "_blank", "noopener,noreferrer");
              }}
            >
              <i className="bi bi-calendar-event me-1" aria-hidden />
              Abrir Calendly
            </button>
            <button type="button" className="btn btn-success btn-sm" onClick={() => void load()} disabled={loading}>
              <i className={`bi bi-arrow-clockwise me-1${loading ? " spin" : ""}`} aria-hidden />
              Actualizar
            </button>
          </div>
        </div>

        <div className="sgi-reuniones-tabs" role="tablist" aria-label="Rango de reuniones">
          <button
            type="button"
            role="tab"
            aria-selected={range === "upcoming"}
            className={`sgi-reuniones-tabs__btn${range === "upcoming" ? " is-active" : ""}`}
            onClick={() => setRange("upcoming")}
          >
            Próximas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={range === "past"}
            className={`sgi-reuniones-tabs__btn${range === "past" ? " is-active" : ""}`}
            onClick={() => setRange("past")}
          >
            Pasadas
          </button>
        </div>

        {!configured ? (
          <div className="alert alert-warning sgi-reuniones-alert" role="status">
            <strong>Calendly no configurado.</strong>{" "}
            {configMessage ||
              "Definí CALENDLY_API_TOKEN en el servidor (token personal en Calendly → Integrations → API & Webhooks)."}
          </div>
        ) : null}

        {error ? (
          <div className="alert alert-danger sgi-reuniones-alert" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="sgi-reuniones-loading">
            <div className="spinner-border text-success" role="status" aria-label="Cargando agenda" />
            <span>Cargando reuniones…</span>
          </div>
        ) : null}

        {!loading && configured && events.length === 0 ? (
          <div className="sgi-reuniones-empty">
            <i className="bi bi-calendar-x" aria-hidden />
            <p>{range === "upcoming" ? "No hay reuniones programadas en los próximos meses." : "No hay reuniones pasadas en el período consultado."}</p>
          </div>
        ) : null}

        {!loading && events.length > 0 ? (
          <div className="sgi-reuniones-agenda">
            {grouped.map(({ day, items }) => (
              <section key={day} className="sgi-reuniones-day">
                <h2 className="sgi-reuniones-day__title">{day}</h2>
                <div className="sgi-reuniones-day__list">
                  {items.map((ev) => {
                    const mins = durationMinutes(ev.startTime, ev.endTime);
                    return (
                      <article key={ev.id} className="sgi-reuniones-card">
                        <div className="sgi-reuniones-card__time">
                          <span className="sgi-reuniones-card__clock">{formatTimeRange(ev.startTime, ev.endTime, ev.timezone)}</span>
                          <span className="sgi-reuniones-card__duration">{mins} min</span>
                        </div>
                        <div className="sgi-reuniones-card__body">
                          <h3 className="sgi-reuniones-card__name">{ev.name}</h3>
                          <p className="sgi-reuniones-card__invitee">
                            <i className="bi bi-person-lines-fill" aria-hidden />
                            {inviteeSummary(ev.invitees)}
                          </p>
                          {ev.locationLabel ? (
                            <p className="sgi-reuniones-card__meta">
                              <i className="bi bi-geo-alt" aria-hidden />
                              {ev.locationLabel}
                            </p>
                          ) : null}
                        </div>
                        <div className="sgi-reuniones-card__actions">
                          {ev.joinUrl ? (
                            <a href={ev.joinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-success btn-sm">
                              Unirse
                            </a>
                          ) : null}
                          {ev.rescheduleUrl ? (
                            <a href={ev.rescheduleUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
                              Reprogramar
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {updatedLabel ? <p className="sgi-reuniones-footnote">Actualizado a las {updatedLabel}</p> : null}
      </div>
    </div>
  );
}
