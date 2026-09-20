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
  const [h, min] = n.split(":").map(Number);
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
  const x = Math.round(Math.max(0, hours) * 100) / 100;
  const hh = Math.floor(x + 1e-9);
  const mm = Math.round((x - hh) * 60);
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${String(mm).padStart(2, "0")} min`;
}

export function looksLikeCorte(titulo: string, cuerpo: string): boolean {
  const t = `${titulo}\n${cuerpo}`.toLowerCase();
  return /\bcorte\b/.test(t) || /23\s*kv/.test(t) || /ande/.test(t);
}

export function parseFechaIsoFromCuerpo(cuerpo: string, hint?: string): string {
  const hinted = String(hint || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(hinted)) return hinted;
  const m = String(cuerpo || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return hinted;
  const d = String(m[1]).padStart(2, "0");
  const mo = String(m[2]).padStart(2, "0");
  return `${m[3]}-${mo}-${d}`;
}

export function labelEtapa(etapa: number): string {
  if (etapa === 2) return "Tarde";
  if (etapa === 3) return "Noche";
  return "Mañana";
}

/** Ordena ventanas y marca etapa 1 = mañana, 2 = tarde (hueco con tensión en el medio). */
export function etapasForWindows(windows: Array<{ from: string; to: string }>): Array<{ from: string; to: string; etapa: number }> {
  const sorted = [...windows].sort((a, b) => (minutesFromOpsTime(a.from) ?? 0) - (minutesFromOpsTime(b.from) ?? 0));
  return sorted.map((w, i) => {
    let etapa = i + 1;
    if (sorted.length === 1) {
      const m = minutesFromOpsTime(w.from) ?? 0;
      etapa = m < 14 * 60 ? 1 : 2;
    }
    return { ...w, etapa: etapa > 3 ? 3 : etapa };
  });
}

export function parseHorarioWindows(cuerpo: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  const re = /(\d{1,2}:\d{2})\s*hs\s*a\s*(\d{1,2}:\d{2})\s*hs/gi;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(String(cuerpo || "")))) {
    const from = normalizeOpsTime(hit[1]);
    const to = normalizeOpsTime(hit[2]);
    if (from && to) out.push({ from, to });
  }
  return out;
}
