import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getMarketplacePresenceLive, getMarketplacePresenceStats } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { canViewMarketplaceQuoteTickets } from "../lib/auth";
import { PageHeader } from "../components/PageHeader";
import "../styles/facturacion.css";
import "../styles/hrs-marketplace-presence.css";

type PresenceRow = {
  visitorId: string;
  viewerType: string;
  countryCode: string;
  countryName: string;
  clientIp: string;
  userEmail: string;
  currentPath: string;
  lastSeenAt: string;
};

type PresenceCountry = {
  countryCode: string;
  countryName: string;
  count: number;
  loggedCount: number;
  anonCount: number;
};

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AR: [-38.4, -63.6],
  AU: [-25.3, 133.8],
  BO: [-16.3, -63.6],
  BR: [-14.2, -51.9],
  CA: [56.1, -106.3],
  CH: [46.8, 8.3],
  CL: [-35.7, -71.5],
  CN: [35.9, 104.2],
  CO: [4.6, -74.1],
  DE: [51.2, 10.4],
  EC: [-1.8, -78.2],
  ES: [40.4, -3.7],
  FR: [46.2, 2.2],
  GB: [55.0, -3.4],
  IN: [20.6, 78.9],
  IT: [41.9, 12.6],
  JP: [36.2, 138.3],
  MX: [23.6, -102.5],
  PE: [-9.1, -75.0],
  PT: [39.4, -8.2],
  PY: [-23.4, -58.4],
  RU: [61.5, 105.3],
  UY: [-32.5, -55.8],
  US: [37.1, -95.7],
};

function viewerTypeLabel(raw: string): string {
  const t = String(raw || "").toLowerCase().trim();
  if (t === "cliente") return "Cliente logueado";
  if (t === "staff") return "Staff logueado";
  return "Invitado (sin cuenta)";
}

export function MarketplacePresencePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [onlineTotal, setOnlineTotal] = useState(0);
  const [onlineLogged, setOnlineLogged] = useState(0);
  const [onlineAnon, setOnlineAnon] = useState(0);
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [countries, setCountries] = useState<PresenceCountry[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");

  const canView = Boolean(user && canViewMarketplaceQuoteTickets(user.role));

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [stats, live] = await Promise.all([getMarketplacePresenceStats(), getMarketplacePresenceLive()]);
        if (cancelled) return;
        const by = stats.byViewerType ?? {};
        setOnlineTotal(Number(stats.onlineTotal) || 0);
        setOnlineLogged((Number(by.staff ?? 0) || 0) + (Number(by.cliente ?? 0) || 0));
        setOnlineAnon(Number(by.anon ?? 0) || 0);
        setRows(Array.isArray(live.rows) ? live.rows : []);
        setCountries(Array.isArray(live.countries) ? live.countries : []);
        setUpdatedAt(
          new Date((live.asOf || stats.asOf || Date.now()) as string).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const int = window.setInterval(() => void refresh(), 8000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(int);
      window.removeEventListener("focus", onFocus);
    };
  }, [canView]);

  const topRows = useMemo(() => rows.slice(0, 40), [rows]);
  const mapCountries = useMemo(
    () =>
      countries
        .map((c) => ({ ...c, coords: COUNTRY_CENTROIDS[c.countryCode] }))
        .filter((c): c is PresenceCountry & { coords: [number, number] } => Array.isArray(c.coords)),
    [countries]
  );

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div className="fact-page hrs-mplive-page">
      <div className="container">
        <PageHeader
          title="Marketplace en vivo"
          logoHref="/"
          rightContent={
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <Link to="/marketplace-presencia/historial" className="fact-back">
                <i className="bi bi-table me-1" aria-hidden />
                Historial detalle
              </Link>
              <Link to="/cotizaciones-marketplace" className="fact-back">
                Ver órdenes marketplace
              </Link>
            </div>
          }
        />

        <section className="hrs-mplive-panel">
          <p className="hrs-mplive-intro">Monitoreo en tiempo real de usuarios navegando en marketplace (logueados y sin cuenta).</p>

          <div className="hrs-mplive-stats">
            <article className="hrs-mplive-stat hrs-mplive-stat--accent">
              <div className="hrs-mplive-stat__val">{onlineTotal}</div>
              <div className="hrs-mplive-stat__lbl">Online ahora</div>
            </article>
            <article className="hrs-mplive-stat">
              <div className="hrs-mplive-stat__val">{onlineLogged}</div>
              <div className="hrs-mplive-stat__lbl">Logueados</div>
            </article>
            <article className="hrs-mplive-stat">
              <div className="hrs-mplive-stat__val">{onlineAnon}</div>
              <div className="hrs-mplive-stat__lbl">Sin cuenta</div>
            </article>
          </div>

          <div className="hrs-mplive-table-wrap">
            <div className="hrs-mplive-map-wrap">
              <div className="hrs-mplive-map-head">
                <h3>Mapa mundial de accesos</h3>
                <span>Marcadores por país de origen</span>
              </div>
              <MapContainer
                center={[12, 0]}
                zoom={1.4}
                minZoom={1}
                maxZoom={6}
                maxBounds={[
                  [-85, -180],
                  [85, 180],
                ]}
                maxBoundsViscosity={1.0}
                scrollWheelZoom={false}
                className="hrs-mplive-map"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  noWrap
                />
                {mapCountries.map((c) => (
                  <CircleMarker
                    key={`${c.countryCode}-${c.countryName}`}
                    center={c.coords}
                    radius={Math.max(6, Math.min(18, 5 + c.count * 2))}
                    pathOptions={{
                      color: c.loggedCount > 0 ? "#00a652" : "#64748b",
                      fillColor: c.loggedCount > 0 ? "#00a652" : "#64748b",
                      fillOpacity: 0.45,
                      weight: 2,
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                      {c.countryName}: {c.count} (logueados: {c.loggedCount} · sin cuenta: {c.anonCount})
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
              <div className="hrs-mplive-country-list">
                {countries.length === 0 ? (
                  <span className="hrs-mplive-country-empty">Sin países detectados aún.</span>
                ) : (
                  countries.slice(0, 10).map((c) => (
                    <span key={`${c.countryCode}-${c.countryName}`} className="hrs-mplive-country-chip">
                      <span className="hrs-mplive-country-chip__name">{c.countryName}</span>
                      <span className="hrs-mplive-country-chip__total">{c.count}</span>
                      <span className="hrs-mplive-country-chip__meta">L:{c.loggedCount}</span>
                      <span className="hrs-mplive-country-chip__meta hrs-mplive-country-chip__meta--anon">I:{c.anonCount}</span>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="hrs-mplive-table-head">
              <h3>Sesiones activas detectadas</h3>
              <span>{loading ? "actualizando..." : `actualizado: ${updatedAt}`}</span>
            </div>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0 hrs-mplive-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 140 }}>Tipo</th>
                    <th>Ruta</th>
                    <th style={{ minWidth: 180 }}>Última actividad</th>
                    <th style={{ minWidth: 220 }}>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {topRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="hrs-mplive-empty">
                        Sin actividad detectada dentro de la ventana en vivo.
                      </td>
                    </tr>
                  ) : (
                    topRows.map((r) => (
                      <tr key={r.visitorId}>
                        <td>{viewerTypeLabel(r.viewerType)}</td>
                        <td>
                          {r.currentPath || "/marketplace"}
                          <span className="hrs-mplive-row-country"> · {r.countryName || r.countryCode || "Desconocido"}</span>
                        </td>
                        <td>{new Date(r.lastSeenAt).toLocaleString("es-AR")}</td>
                        <td>
                          <code>{r.userEmail || "—"}</code>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
