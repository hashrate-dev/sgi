export const CORTE_PROGRAMADO_NOMBRE = "Corte Programado";

export const CORTE_PROGRAMADO_CUERPO = `Estimados clientes,

Debido a la alta demanda energética y a restricciones operativas
informadas por la empresa estatal proveedora de energía ANDE, les
comunicamos que hoy {{FECHA}} se realizará una reducción
temporal del suministro eléctrico en 23 kV, limitándose al 10% de la
potencia reservada, en los siguientes horarios:

{{HORARIOS}}

Esta medida es ajena a nuestra operación y responde a disposiciones del
proveedor eléctrico.
Agradecemos su comprensión y quedamos a disposición ante cualquier consulta.

Muchas gracias,
Equipo de Hashrate Space

--
Notificaciones
Hashrate Space - Clientes
https://www.hashrate.space`;

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

export function formatOpsHorarioLine(from: string, to: string): string {
  const a = String(from || "").trim();
  const b = String(to || "").trim();
  if (!a || !b) return "";
  return `•  ${a} hs a ${b} hs`;
}

export function fillOpsComunicacionMessage(
  plantilla: string,
  opts: { fecha: string; horario1From: string; horario1To: string; horario2From: string; horario2To: string }
): string {
  const fecha = formatOpsFechaEs(opts.fecha);
  const lines = [
    formatOpsHorarioLine(opts.horario1From, opts.horario1To),
    formatOpsHorarioLine(opts.horario2From, opts.horario2To),
  ].filter(Boolean);
  const horarios = lines.join("\n");
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
  const lines = [
    formatOpsHorarioLine(opts.horario1From, opts.horario1To),
    formatOpsHorarioLine(opts.horario2From, opts.horario2To),
  ].filter(Boolean);
  const horarios = lines.join("\n");
  if (plantilla.includes(OPS_COM_FECHA) && fecha) out = out.replaceAll(fecha, OPS_COM_FECHA);
  if (plantilla.includes(OPS_COM_HORARIOS) && horarios) out = out.replaceAll(horarios, OPS_COM_HORARIOS);
  return out.trim();
}
