import type { ReactNode } from "react";

type Variant = "card" | "plain" | "standalone";

type Props = {
  title: string;
  subtitle?: ReactNode;
  variant?: Variant;
  className?: string;
};

/** Franja azul vertical + `reportes-dash__section-title` + subtítulo (formato Monitor Financiero). */
export function MonitorFinancieroSectionHeader({ title, subtitle, variant = "plain", className }: Props) {
  const v = variant;
  const cls = ["monitor-financiero-chart-head", v === "card" ? "monitor-financiero-chart-head--card" : "", v === "standalone" ? "monitor-financiero-chart-head--standalone" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <header className={cls}>
      <span className="monitor-financiero-chart-head__accent" aria-hidden />
      <div className="monitor-financiero-chart-head__text">
        <h2 className="reportes-dash__section-title mb-0">{title}</h2>
        {subtitle != null ? <div className="monitor-financiero-chart-head__subtitle">{subtitle}</div> : null}
      </div>
    </header>
  );
}
