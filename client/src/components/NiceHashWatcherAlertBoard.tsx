import type { NhWatcherFleetAlert } from "../lib/nicehashWatcherAlerts";

type Props = {
  alerts: NhWatcherFleetAlert[];
  soundMuted: boolean;
  onToggleMute: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onFocusRig?: (seriesKey: string) => void;
};

function kindIcon(kind: NhWatcherFleetAlert["kind"]): string {
  if (kind === "offline") return "bi-power";
  if (kind === "zero_hash") return "bi-exclamation-octagon";
  if (kind === "low_hashrate") return "bi-graph-down-arrow";
  return "bi-clock-history";
}

export function NiceHashWatcherAlertBoard({
  alerts,
  soundMuted,
  onToggleMute,
  onDismiss,
  onDismissAll,
  onFocusRig,
}: Props) {
  if (alerts.length === 0) return null;

  const criticalN = alerts.filter((a) => a.severity === "critical").length;

  return (
    <section
      className={`nh-watcher-alert-board${criticalN > 0 ? " is-critical" : " is-warn"}`}
      aria-live="polite"
      aria-label="Alertas de flota"
    >
      <header className="nh-watcher-alert-board__head">
        <div className="nh-watcher-alert-board__title-wrap">
          <span className="nh-watcher-alert-board__pulse" aria-hidden />
          <div>
            <h3 className="nh-watcher-alert-board__title">Tablero de mando · alertas</h3>
            <p className="nh-watcher-alert-board__sub">
              {criticalN > 0
                ? `${criticalN} crítico${criticalN === 1 ? "" : "s"} · ${alerts.length} en total`
                : `${alerts.length} aviso${alerts.length === 1 ? "" : "s"} de rendimiento`}
            </p>
          </div>
        </div>
        <div className="nh-watcher-alert-board__actions">
          <button
            type="button"
            className="nh-watcher-alert-board__btn"
            onClick={onToggleMute}
            title={soundMuted ? "Activar sonido de alertas" : "Silenciar sonido"}
          >
            <i className={`bi ${soundMuted ? "bi-volume-mute" : "bi-volume-up"}`} aria-hidden />
            {soundMuted ? "Sonido off" : "Sonido on"}
          </button>
          <button type="button" className="nh-watcher-alert-board__btn" onClick={onDismissAll}>
            Descartar todas
          </button>
        </div>
      </header>
      <ul className="nh-watcher-alert-board__list">
        {alerts.map((a) => (
          <li key={a.id} className={`nh-watcher-alert-board__item is-${a.severity}`}>
            <button
              type="button"
              className="nh-watcher-alert-board__item-main"
              onClick={() => onFocusRig?.(a.seriesKey)}
            >
              <span className="nh-watcher-alert-board__icon" aria-hidden>
                <i className={`bi ${kindIcon(a.kind)}`} />
              </span>
              <span className="nh-watcher-alert-board__body">
                <strong className="nh-watcher-alert-board__item-title">{a.title}</strong>
                <span className="nh-watcher-alert-board__item-detail">{a.detail}</span>
              </span>
            </button>
            <button
              type="button"
              className="nh-watcher-alert-board__dismiss"
              aria-label="Descartar alerta"
              onClick={() => onDismiss(a.id)}
            >
              <i className="bi bi-x-lg" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
