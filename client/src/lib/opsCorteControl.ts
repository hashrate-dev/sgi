/** Ventanas de corte ANDE: 24:00 = fin de día; si el fin ≤ inicio, cruza medianoche. */

export function normalizeOpsTime(raw: string): string {
  const s = String(raw || "")
    .trim()
    .replace(/\s*hs\s*/gi, "")
    .replace(".", ":");
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return "";
  if (h === 24 && min === 0) return "24:00";
  if (h < 0 || h > 23) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function minutesFromOpsTime(raw: string): number | null {
  const n = normalizeOpsTime(raw);
  if (!n) return null;
  if (n === "24:00") return 24 * 60;
  const parts = n.split(":");
  const h = Number(parts[0] ?? "");
  const min = Number(parts[1] ?? "");
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

export function durationHours(from: string, to: string): number {
  const a = minutesFromOpsTime(from);
  const b = minutesFromOpsTime(to);
  if (a == null || b == null) return 0;
  let end = b;
  if (end <= a) end += 24 * 60;
  return (end - a) / 60;
}

export function formatCorteId(n: number, etapa?: number): string {
  const x = Math.trunc(Number(n));
  if (!Number.isFinite(x) || x <= 0) return "";
  const digits = String(x).padStart(6, "0");
  if (etapa === 2) return `T${digits}`;
  if (etapa === 3) return `N${digits}`;
  return `M${digits}`;
}

export function formatHoursLabel(hours: number): string {
  const signed = hours < 0;
  const x = Math.round(Math.abs(hours) * 100) / 100;
  const hh = Math.floor(x + 1e-9);
  const mm = Math.round((x - hh) * 60);
  const core = mm === 0 ? `${hh} h` : `${hh} h ${String(mm).padStart(2, "0")} min`;
  return signed ? `−${core}` : core;
}

export function labelEtapa(etapa: number): string {
  if (etapa === 2) return "Tarde";
  if (etapa === 3) return "Noche";
  return "Mañana";
}
