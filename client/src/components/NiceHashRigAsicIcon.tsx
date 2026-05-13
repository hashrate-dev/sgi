import { useId } from "react";

export type NiceHashRigAsicPowerState = "on" | "off" | "other";

/** Alineado con nhRigStatusClass en NiceHashWatcherDashboard. */
export function niceHashRigAsicPowerState(minerStatus: string): NiceHashRigAsicPowerState {
  const u = minerStatus.trim().toUpperCase();
  if (u === "MINING") return "on";
  if (u === "OFFLINE" || u === "STOPPED" || u === "DISABLED") return "off";
  return "other";
}

type NiceHashRigAsicIconProps = {
  className?: string;
  title?: string;
  /** Estado del ASIC (NiceHash minerStatus): barra inferior verde / roja / naranja. */
  minerStatus: string;
};

/**
 * Minero ASIC estilo crypto/Bitcoin: chasis limpio, rejilla, ventilador y barra de estado (BTC / online / offline).
 * Animaciones suaves; con prefers-reduced-motion se fijan estados tranquilos.
 */
export function NiceHashRigAsicIcon({ className, title, minerStatus }: NiceHashRigAsicIconProps) {
  const uid = useId().replace(/:/g, "");
  const gChassis = `nhAsicCh-${uid}`;
  const gEdge = `nhAsicEd-${uid}`;
  const gAmbient = `nhAsicAm-${uid}`;
  const gFan = `nhAsicFn-${uid}`;
  const power = niceHashRigAsicPowerState(minerStatus);
  const capClass =
    power === "on"
      ? "nh-rig-asic-icon__btc-cap nh-rig-asic-icon__btc-cap--on"
      : power === "off"
        ? "nh-rig-asic-icon__btc-cap nh-rig-asic-icon__btc-cap--off"
        : "nh-rig-asic-icon__btc-cap nh-rig-asic-icon__btc-cap--other";

  return (
    <span
      className={`nh-rig-asic-icon${className ? ` ${className}` : ""}`}
      title={title ?? "Minero ASIC (Bitcoin / crypto)"}
      aria-hidden
    >
      <svg className="nh-rig-asic-icon__svg" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gChassis} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3d4450" />
            <stop offset="42%" stopColor="#282e36" />
            <stop offset="100%" stopColor="#141920" />
          </linearGradient>
          <linearGradient id={gEdge} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8cc8ff" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#6eb5ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f7931a" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id={gAmbient} cx="50%" cy="38%" r="58%">
            <stop offset="0%" stopColor="#f7931a" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#58a6ff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#58a6ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={gFan} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#6eb5ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7ee787" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        <ellipse cx="24" cy="28" rx="21" ry="25" fill={`url(#${gAmbient})`} className="nh-rig-asic-icon__ambient" />

        <rect
          x="9"
          y="5"
          width="30"
          height="46"
          rx="7.5"
          fill={`url(#${gChassis})`}
          stroke={`url(#${gEdge})`}
          strokeWidth="1.05"
          className="nh-rig-asic-icon__chassis"
        />

        <rect x="12" y="46.5" width="24" height="3.5" rx="1.75" className={capClass} />

        <g className="nh-rig-asic-icon__vents" stroke="#6e7681" strokeWidth="1.1" strokeLinecap="round" opacity="0.72">
          <line x1="14" y1="12" x2="34" y2="12" />
          <line x1="14" y1="15.5" x2="34" y2="15.5" />
          <line x1="14" y1="19" x2="34" y2="19" />
          <line x1="14" y1="22.5" x2="34" y2="22.5" />
        </g>

        <g transform="translate(24 35.5)">
          <g className="nh-rig-asic-icon__fan">
            <circle r="9.5" fill="none" stroke="#353b44" strokeWidth="1.05" />
            <circle
              r="9.5"
              fill="none"
              stroke={`url(#${gFan})`}
              strokeWidth="1.35"
              strokeDasharray="2.2 4.4"
              strokeLinecap="round"
            />
            <circle r="3.15" fill="#0d1117" stroke="#2d333b" strokeWidth="0.55" />
          </g>
        </g>

        <circle cx="24" cy="9" r="2.1" className="nh-rig-asic-icon__led" fill="#7ee787" />
      </svg>
    </span>
  );
}
