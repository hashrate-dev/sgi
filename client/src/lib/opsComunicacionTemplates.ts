export const CORTE_PROGRAMADO_NOMBRE = "Corte Programado";

export const CORTE_PROGRAMADO_CUERPO = `Estimados clientes,

Por alta demanda energética y restricciones informadas por ANDE, hoy {{FECHA}} se realizará una reducción temporal del suministro eléctrico en 23 kV, limitándose al 10% de la potencia reservada.

{{HORARIOS}}

Esta medida es ajena a Hashrate Space y responde a disposiciones del proveedor eléctrico.
Quedamos a disposición ante cualquier consulta.`;

export const OPS_COM_FECHA = "{{FECHA}}";
export const OPS_COM_HORARIOS = "{{HORARIOS}}";

export function messageHasScheduleSlots(cuerpo: string): boolean {
  return cuerpo.includes(OPS_COM_FECHA) || cuerpo.includes(OPS_COM_HORARIOS);
}

export function formatOpsFechaEs(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || "").trim());
  if (!m) return String(isoDate || "").trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return `${m[3]}/${m[2]}/${m[1]}`;
  const weekday = dt.toLocaleDateString("es-PY", { weekday: "long" });
  return `${weekday} ${m[3]}/${m[2]}/${m[1]}`;
}

export function formatOpsHorarioLine(from: string, to: string, label = ""): string {
  const a = String(from || "").trim();
  const b = String(to || "").trim();
  if (!a || !b) return "";
  return label ? `• ${label}: ${a} a ${b} hs` : `• ${a} a ${b} hs`;
}

export function formatOpsHorariosBlock(opts: {
  horario1From: string;
  horario1To: string;
  horario2From: string;
  horario2To: string;
}): string {
  const manana = formatOpsHorarioLine(opts.horario1From, opts.horario1To, "Mañana");
  const tarde = formatOpsHorarioLine(opts.horario2From, opts.horario2To, "Tarde");
  if (manana && tarde) {
    return [
      "Horarios (UTC-3)",
      manana,
      tarde,
      "Entre ambas etapas el suministro se restablece un rato.",
    ].join("\n");
  }
  if (manana) return ["Horarios (UTC-3)", manana].join("\n");
  if (tarde) return ["Horarios (UTC-3)", tarde].join("\n");
  return "";
}

export function fillOpsComunicacionMessage(
  plantilla: string,
  opts: { fecha: string; horario1From: string; horario1To: string; horario2From: string; horario2To: string }
): string {
  const fecha = formatOpsFechaEs(opts.fecha);
  const horarios = formatOpsHorariosBlock(opts);
  return String(plantilla || "")
    .replaceAll(OPS_COM_FECHA, fecha || OPS_COM_FECHA)
    .replaceAll(OPS_COM_HORARIOS, horarios || OPS_COM_HORARIOS);
}

/** Vuelve a {{FECHA}} / {{HORARIOS}} para guardar el modelo sin congelar fecha y horas. */
export function plantillaFromFilledMessage(
  filled: string,
  plantilla: string,
  opts: { fecha: string; horario1From: string; horario1To: string; horario2From: string; horario2To: string }
): string {
  let out = String(filled || "").replace(/\r\n/g, "\n");
  if (!messageHasScheduleSlots(plantilla)) return out.trim();
  const fecha = formatOpsFechaEs(opts.fecha);
  const horarios = formatOpsHorariosBlock(opts);
  if (plantilla.includes(OPS_COM_FECHA) && fecha) out = out.replaceAll(fecha, OPS_COM_FECHA);
  if (plantilla.includes(OPS_COM_HORARIOS) && horarios) out = out.replaceAll(horarios, OPS_COM_HORARIOS);
  return out.trim();
}
