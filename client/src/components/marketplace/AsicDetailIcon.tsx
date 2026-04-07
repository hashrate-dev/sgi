import type { AsicDetailIcon as IconKind } from "../../lib/marketplaceAsicCatalog.js";

const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" as const, stroke: "currentColor", strokeWidth: 1.65 };

export function AsicDetailSvg({ kind }: { kind: IconKind }) {
  switch (kind) {
    case "bolt":
      return (
        <svg className="shelf-detail-strip__svg" {...common} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13 3L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "chip":
      return (
        <svg className="shelf-detail-strip__svg" {...common} aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path
            d="M9 9h2.5v2.5H9zm5.5 0H17v2.5h-2.5zm-5.5 5.5h2.5V17H9zm5.5 0H17V17h-2.5z"
            fill="currentColor"
            stroke="none"
            opacity={0.35}
          />
        </svg>
      );
    case "sun":
      return (
        <svg className="shelf-detail-strip__svg" {...common} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="2.8" />
          <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3" />
          <path d="M7 7l2 2M15 7l-2 2M7 17l2-2M15 17l-2-2" />
        </svg>
      );
    case "fan": {
      const cx = 12;
      const cy = 12;
      const r1 = 4.15;
      const r2 = 9.35;
      let d = "";
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        d += `M${cx + r1 * c},${cy + r1 * s}L${cx + r2 * c},${cy + r2 * s}`;
      }
      return (
        <svg className="shelf-detail-strip__svg" {...common} strokeLinecap="round" aria-hidden>
          <circle cx={cx} cy={cy} r="2.05" />
          <path d={d} />
        </svg>
      );
    }
    case "droplet":
      return (
        <svg className="shelf-detail-strip__svg" {...common} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4.2c.35 0 .85.62 1.55 1.58 1.9 2.65 3.85 5.65 3.85 8.55A5.4 5.4 0 0112 20a5.4 5.4 0 01-5.4-5.67c0-2.9 1.95-5.9 3.85-8.55.7-.96 1.2-1.58 1.55-1.58z" />
        </svg>
      );
    case "btc":
      return (
        <svg className="shelf-detail-strip__svg" {...common} strokeLinecap="round" aria-hidden>
          <path d="M10 5v2.5M14 5v2.5M10 16.5V19M14 16.5V19" />
          <path d="M8 9h7a2 2 0 010 4H9v4M9 13h6a2 2 0 010 4H8" />
        </svg>
      );
    case "dual":
      return (
        <svg className="shelf-detail-strip__svg" {...common} strokeLinecap="round" aria-hidden>
          <path d="M6 16V8m0 0L3.5 10.5M6 8l2.5 2.5" />
          <path d="M18 8v8m0 0l2.5-2.5M18 16l-2.5-2.5" />
        </svg>
      );
    default:
      return null;
  }
}
