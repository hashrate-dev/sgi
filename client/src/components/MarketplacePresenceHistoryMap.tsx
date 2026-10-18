import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MarketplacePresenceMapPoint } from "../lib/api";

function viewerTypeLabel(raw: string): string {
  const t = String(raw || "").toLowerCase().trim();
  if (t === "cliente") return "Cliente logueado";
  if (t === "staff") return "Staff logueado";
  return "Invitado (sin cuenta)";
}

function pointColor(viewerType: string): string {
  const t = String(viewerType || "").toLowerCase().trim();
  if (t === "cliente") return "#16a34a";
  if (t === "staff") return "#2563eb";
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
  const positions = points.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <div className="hrs-mplive-table-wrap hrs-mphist-map">
      <div className="hrs-mplive-map-head">
        <h3>Mapa de accesos</h3>
        <span>{loading ? "cargando…" : `${points.length} IP${points.length === 1 ? "" : "s"}`}</span>
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
          {points.map((p) => (
            <CircleMarker
              key={`${p.clientIp || p.visitorId}-${p.lat}-${p.lng}`}
              center={[p.lat, p.lng]}
              radius={6}
              pathOptions={{
                color: pointColor(p.viewerType),
                fillColor: pointColor(p.viewerType),
                fillOpacity: 0.85,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.96}>
                <div className="hrs-mphist-tip">
                  <strong>{p.userEmail || "Sin email"}</strong>
                  <div>{p.clientIp || "Sin IP"}</div>
                  <div>
                    {p.city ? `${p.city}, ` : ""}
                    {p.countryName}
                    {p.countryCode ? ` (${p.countryCode})` : ""}
                  </div>
                  <div>{viewerTypeLabel(p.viewerType)}</div>
                  <div>{formatWhen(p.recordedAt)}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      )}
      <div className="hrs-mphist-map__legend">
        <span><i className="hrs-mphist-dot hrs-mphist-dot--cliente" /> Cliente</span>
        <span><i className="hrs-mphist-dot hrs-mphist-dot--staff" /> Staff</span>
        <span><i className="hrs-mphist-dot hrs-mphist-dot--anon" /> Sin cuenta</span>
        <span className="hrs-mphist-map__note">Un punto por IP, en la ubicación de la conexión.</span>
      </div>
    </div>
  );
}
