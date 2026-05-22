import { useMemo } from "react";
import {
  buildSgiPermissionZoneGroups,
  countEnabledScreens,
  uniqueScreenIdsInZones,
  zoneIconForSgiMap,
  type SgiPermissionAudience,
  type SgiPermissionZoneGroup,
} from "../lib/sgiPermissionsScreenMap";

type Props = {
  audience: SgiPermissionAudience;
  userId: number;
  selected: Record<string, boolean>;
  disabled?: boolean;
  onToggleScreenId: (screenId: string) => void;
  onSetZoneScreenIds: (screenIds: string[], enabled: boolean) => void;
};

export function SgiPermissionsMapPanel({
  audience,
  userId,
  selected,
  disabled,
  onToggleScreenId,
  onSetZoneScreenIds,
}: Props) {
  const zones = useMemo(() => buildSgiPermissionZoneGroups(audience), [audience]);

  const stats = useMemo(() => countEnabledScreens(zones, selected), [zones, selected]);

  return (
    <div className="sgi-perm-map">
      <div className="sgi-perm-map-summary" role="status">
        <i className="bi bi-map-fill sgi-perm-map-summary-icon" aria-hidden />
        <div>
          <strong>Mapa de acceso al SGI</strong>
          <p className="mb-0">
            Cada fila es independiente: podés marcar solo la pantalla que quieras (por ejemplo solo Nuevos Leads o solo
            Historial de hosting). Las rutas indican qué URL podrá abrir el usuario.
          </p>
          <p className="mb-0 sgi-perm-map-summary-count">
            <span>
              <strong>{stats.screens}</strong> pantallas habilitadas
            </span>
          </p>
        </div>
      </div>

      {zones.map((zone) => (
        <SgiPermissionZoneSection
          key={`${userId}-${zone.zone}`}
          zone={zone}
          userId={userId}
          selected={selected}
          disabled={disabled}
          onToggleScreenId={onToggleScreenId}
          onSetZoneScreenIds={onSetZoneScreenIds}
        />
      ))}
    </div>
  );
}

function SgiPermissionZoneSection({
  zone,
  userId,
  selected,
  disabled,
  onToggleScreenId,
  onSetZoneScreenIds,
}: {
  zone: SgiPermissionZoneGroup;
  userId: number;
  selected: Record<string, boolean>;
  disabled?: boolean;
  onToggleScreenId: (screenId: string) => void;
  onSetZoneScreenIds: (screenIds: string[], enabled: boolean) => void;
}) {
  const zoneScreenIds = useMemo(() => uniqueScreenIdsInZones([zone]), [zone]);
  const actionableRows = zone.rows.filter((r) => !r.infoOnly);
  const infoRows = zone.rows.filter((r) => r.infoOnly);
  const zoneAllOn = zoneScreenIds.length > 0 && zoneScreenIds.every((id) => selected[id]);

  return (
    <section className="sgi-perm-map-zone usuarios-admin-b-grants-section">
      <div className="usuarios-admin-b-grants-section-head">
        <div className="usuarios-admin-b-grants-section-title-row">
          <span className="usuarios-admin-b-grants-section-icon" aria-hidden>
            <i className={`bi ${zoneIconForSgiMap(zone.zone)}`} />
          </span>
          <h4 className="usuarios-admin-b-grants-section-title">{zone.zone}</h4>
        </div>
        {zoneScreenIds.length > 0 && (
          <div className="usuarios-admin-b-grants-section-actions">
            <button
              type="button"
              className="usuarios-admin-b-grants-pill-btn usuarios-admin-b-grants-pill-btn--on"
              disabled={disabled}
              onClick={() => onSetZoneScreenIds(zoneScreenIds, true)}
            >
              <i className="bi bi-check2-all" aria-hidden />
              Marcar zona
            </button>
            <button
              type="button"
              className="usuarios-admin-b-grants-pill-btn"
              disabled={disabled}
              onClick={() => onSetZoneScreenIds(zoneScreenIds, false)}
            >
              <i className="bi bi-slash-circle" aria-hidden />
              Desmarcar
            </button>
          </div>
        )}
      </div>

      <div className="sgi-perm-map-table-wrap">
        <table className="sgi-perm-map-table">
          <thead>
            <tr>
              <th scope="col" className="sgi-perm-map-th-check">
                {zoneAllOn ? "✓" : ""}
              </th>
              <th scope="col">Pantalla</th>
              <th scope="col">Qué habilita</th>
              <th scope="col">Rutas en el SGI</th>
            </tr>
          </thead>
          <tbody>
            {actionableRows.map((row) => {
              const on = Boolean(selected[row.id]);
              const gid = `sgi-map-${userId}-${row.id}`;
              return (
                <tr key={row.id} className={on ? "sgi-perm-map-row--on" : ""}>
                  <td className="sgi-perm-map-td-check">
                    <input
                      className="form-check-input sgi-perm-map-check"
                      type="checkbox"
                      id={gid}
                      checked={on}
                      disabled={disabled}
                      onChange={() => onToggleScreenId(row.id)}
                      aria-label={`Acceso a ${row.title}`}
                    />
                  </td>
                  <td className="sgi-perm-map-td-title">
                    <label htmlFor={gid}>{row.title}</label>
                  </td>
                  <td className="sgi-perm-map-td-note">{row.accessNote}</td>
                  <td className="sgi-perm-map-td-routes">
                    {row.routes.length === 0 ? (
                      <span className="text-muted small">—</span>
                    ) : (
                      <ul className="sgi-perm-map-routes">
                        {row.routes.map((route) => (
                          <li key={`${row.id}-${route}`}>
                            <code>{route}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {infoRows.map((row) => (
              <tr key={row.id} className="sgi-perm-map-row--info">
                <td className="sgi-perm-map-td-check">
                  <i className="bi bi-info-circle text-muted" aria-hidden title="Informativo" />
                </td>
                <td className="sgi-perm-map-td-title">
                  <span>{row.title}</span>
                  <span className="sgi-perm-map-info-tag">Info</span>
                </td>
                <td className="sgi-perm-map-td-note">{row.accessNote}</td>
                <td className="sgi-perm-map-td-routes">
                  {row.routes.length > 0 && (
                    <ul className="sgi-perm-map-routes">
                      {row.routes.map((route) => (
                        <li key={`${row.id}-${route}`}>
                          <code>{route}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
