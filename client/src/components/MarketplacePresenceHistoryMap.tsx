import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import type { MarketplacePresenceMapPoint } from "../lib/api";

function viewerTypeLabel(raw: string): string {
  const t = String(raw || "").toLowerCase().trim();
  if (t === "cliente") return "Cliente logueado";
  if (t === "staff") return "Staff logueado";
  return "Invitado (sin cuenta)";
}

type MapSpot = {
  key: string;
  lat: number;
  lng: number;
  city: string;
  countryName: string;
  countryCode: string;
  points: MarketplacePresenceMapPoint[];
};

function groupSpots(points: MarketplacePresenceMapPoint[]): MapSpot[] {
  const byCoord = new Map<string, MapSpot>();
  for (const point of points) {
    const key = `${point.lat.toFixed(5)}|${point.lng.toFixed(5)}`;
    const spot = byCoord.get(key);
    if (!spot) {
      byCoord.set(key, {
        key,
        lat: point.lat,
        lng: point.lng,
        city: point.city,
        countryName: point.countryName,
        countryCode: point.countryCode,
        points: [point],
      });
      continue;
    }
    spot.points.push(point);
    if (!spot.city && point.city) spot.city = point.city;
  }
  return [...byCoord.values()];
}

function loggedEmails(points: MarketplacePresenceMapPoint[]): Array<{ email: string; viewerType: string }> {
  const seen = new Set<string>();
  const out: Array<{ email: string; viewerType: string }> = [];
  for (const point of points) {
    const email = String(point.userEmail || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, viewerType: point.viewerType });
  }
  out.sort((a, b) => a.email.localeCompare(b.email));
  return out;
}

function spotColor(points: MarketplacePresenceMapPoint[]): string {
  if (points.some((point) => String(point.viewerType).toLowerCase() === "staff")) return "#2563eb";
  if (points.some((point) => String(point.viewerType).toLowerCase() === "cliente")) return "#16a34a";
  return "#64748b";
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function MapSizeOnFullscreen() {
  const map = useMap();
  useEffect(() => {
    const fix = () => {
      window.setTimeout(() => map.invalidateSize(), 60);
    };
    document.addEventListener("fullscreenchange", fix);
    return () => document.removeEventListener("fullscreenchange", fix);
  }, [map]);
  return null;
}

function FitPresencePoints({ positions }: { positions: Array<[number, number]> }) {
  const map = useMap();
  const sig = positions.map((p) => `${p[0]},${p[1]}`).join("|");
  useEffect(() => {
    const pts = sig
      .split("|")
      .filter(Boolean)
      .map((pair) => {
        const [lat, lng] = pair.split(",").map(Number);
        return [lat, lng] as [number, number];
      })
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0]!, 5);
      return;
    }
    map.fitBounds(pts, { padding: [28, 28], maxZoom: 6 });
  }, [map, sig]);
  return null;
}

export function MarketplacePresenceHistoryMap({
  points,
  loading,
}: {
  points: MarketplacePresenceMapPoint[];
  loading: boolean;
}) {
  const spots = useMemo(() => groupSpots(points), [points]);
  const positions = spots.map((spot) => [spot.lat, spot.lng] as [number, number]);
  const mapRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === mapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const node = mapRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      void document.exitFullscreen();
      return;
    }
    void node.requestFullscreen();
  };

  return (
    <div className="hrs-mplive-table-wrap hrs-mphist-map" ref={mapRef}>
      <div className="hrs-mplive-map-head">
        <h3>Mapa de accesos</h3>
        <div className="hrs-mphist-map__tools">
          <span>{loading ? "cargando…" : `${points.length} IP${points.length === 1 ? "" : "s"}`}</span>
          <Link to="/marketplace/presence" className="hrs-mphist-full-btn">
            <i className="bi bi-arrow-left" aria-hidden />
            Volver al monitor
          </Link>
          <button type="button" className="hrs-mphist-full-btn" onClick={toggleFullscreen}>
            <i className={`bi ${fullscreen ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"}`} aria-hidden />
            {fullscreen ? "Salir" : "Pantalla completa"}
          </button>
        </div>
      </div>
      {points.length === 0 && !loading ? (
        <p className="hrs-mphist-map__empty">No hay ubicaciones para estos filtros.</p>
      ) : (
        <MapContainer
          center={[12, 0]}
          zoom={2}
          minZoom={1}
          maxZoom={19}
          scrollWheelZoom={false}
          className="hrs-mplive-map hrs-mphist-map__canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            maxNativeZoom={19}
          />
          <FitPresencePoints positions={positions} />
          <MapSizeOnFullscreen />
          {spots.map((spot) => {
            const emails = loggedEmails(spot.points);
            const color = spotColor(spot.points);
            const place = `${spot.city ? `${spot.city}, ` : ""}${spot.countryName}${spot.countryCode ? ` (${spot.countryCode})` : ""}`;
            const movements = [...spot.points].sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
            return (
              <CircleMarker
                key={spot.key}
                center={[spot.lat, spot.lng]}
                radius={emails.length > 0 ? 8 : 6}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 1 }}
              >
                <Tooltip direction="top" offset={[0, -4]} opacity={0.96}>
                  <div className="hrs-mphist-tip">
                    <strong>{place}</strong>
                    <div>
                      {spot.points.length} IP
                      {emails.length > 0 ? ` · ${emails.length} email${emails.length === 1 ? "" : "s"}` : ""}
                    </div>
                    <div>Clic para ver cada IP y su horario</div>
                  </div>
                </Tooltip>
                <Popup className="hrs-mphist-popup" maxWidth={380} minWidth={280}>
                  <div className="hrs-mphist-tip hrs-mphist-tip--list">
                    <strong>{place}</strong>
                    <div>
                      {spot.points.length} IP en este nodo
                    </div>
                    <ul>
                      {movements.map((point) => {
                        const email = String(point.userEmail || "").trim();
                        const ip = point.clientIp || "sin IP";
                        return (
                          <li key={`${ip}|${point.visitorId}|${point.recordedAt}`}>
                            <span className="hrs-mphist-tip__ip">{ip}</span>
                            <span className="hrs-mphist-tip__when"> · {formatWhen(point.recordedAt) || "sin horario"}</span>
                            <span>
                              {" "}
                              · {email ? `${email} (${viewerTypeLabel(point.viewerType)})` : viewerTypeLabel(point.viewerType)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      )}
      <div className="hrs-mphist-map__legend">
        <span><i className="hrs-mphist-dot hrs-mphist-dot--cliente" /> Cliente</span>
        <span><i className="hrs-mphist-dot hrs-mphist-dot--staff" /> Staff</span>
        <span><i className="hrs-mphist-dot hrs-mphist-dot--anon" /> Sin cuenta</span>
        <span className="hrs-mphist-map__note">Un punto por nodo de conexión. Clic para ver cada IP y su horario de acceso.</span>
      </div>
    </div>
  );
}
