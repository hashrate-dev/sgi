function newMonitorEquipoRowId(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Filas del monitor operativo (referencia interna; editable por desarrollo). */
export type MonitorEquipoAsicRow = {
  /** Identificador estable para historial en servidor (UUID). */
  equipoId: string;
  usuario: string;
  modelo: string;
  potencia: string;
  nombreAnt: string;
  nombreNuevo: string;
  serial: string;
  pool: string;
  online: boolean;
  /**
   * Si es `false`, «Actualizar desde Luxor» no cambia `online` (marcaste OFFLINE/ONLINE a mano).
   * Volvé a `true` con el ícono de sync junto al botón Online.
   */
  luxorOnlineSync?: boolean;
  /** Si es true, la fila no se puede editar hasta desbloquear (anticipa errores). */
  rowLocked?: boolean;
  /** Nota operativa (otro usuario, taller, etc.). */
  comentario?: string;
};

export const MONITOR_POOL_OPTIONS = ["Luxor", "Nicehash", "Kryptex"] as const;
export type MonitorPoolOption = (typeof MONITOR_POOL_OPTIONS)[number];

export function coerceMonitorPool(value: string): MonitorPoolOption {
  const t = value.trim().toLowerCase();
  const hit = MONITOR_POOL_OPTIONS.find((p) => p.toLowerCase() === t);
  return hit ?? "Luxor";
}

/** Opción en el desplegable de potencia (valor guardado en la fila). */
export type MonitorPotenciaChoice = { value: string; label: string };

/** Potencias típicas por modelo (TH/s → «ths», MH/s → «mhs» como en datos históricos). */
export const MONITOR_POTENCIA_BY_MODEL: Record<string, readonly MonitorPotenciaChoice[]> = {
  S21: [
    { value: "200 ths", label: "200" },
    { value: "235 ths", label: "235" },
    { value: "270 ths", label: "270" },
  ],
  L7: [
    { value: "8800 mhs", label: "8 800" },
    { value: "9050 mhs", label: "9 050" },
    { value: "9500 mhs", label: "9 500" },
  ],
  L9: [
    { value: "16000 mhs", label: "16 000" },
    { value: "17000 mhs", label: "17 000" },
  ],
};

/** Lista para `<select>`; si el valor guardado no coincide, se agrega como primera opción. */
export function potenciaChoicesWithCurrent(modelo: string, current: string): MonitorPotenciaChoice[] | null {
  const m = modelo.trim().toUpperCase();
  const preset = MONITOR_POTENCIA_BY_MODEL[m];
  if (!preset) return null;
  const list = [...preset];
  const t = current.trim();
  if (t && !list.some((c) => c.value === t)) {
    list.unshift({ value: t, label: t });
  }
  return list;
}

/** Fila nueva en el monitor (formulario vacío). */
export function emptyMonitorEquipoAsicRow(): MonitorEquipoAsicRow {
  return {
    equipoId: newMonitorEquipoRowId(),
    usuario: "",
    modelo: "",
    potencia: "",
    nombreAnt: "",
    nombreNuevo: "",
    serial: "",
    pool: "Luxor",
    online: true,
    luxorOnlineSync: true,
    rowLocked: false,
    comentario: "",
  };
}

/** Una línea por equipo; campos separados por | en la fuente. */
const PIPE_ROWS = `
Valkyria|S21|270 ths|HAYESB236|HashR2L5P3||Luxor|TRUE
Bemlocal|S21|270 ths|HAYESB252|HashR2L6P4||Luxor|TRUE
Polenta|S21|270 ths|HAYESB229|HashR2L5P4||Luxor|TRUE
Luma|S21|270 ths|HAYESB251|HashR2L5P5||Luxor|TRUE
Alecan|S21|235 ths|HAYESB228|HashR2L6P1||Luxor|TRUE
Mirlo|S21|235 ths|HAYESB230|HashR2L5P2||Luxor|TRUE
Luisgn|S21|235 ths|HAYESB234|HashR2L5P6||Luxor|TRUE
Ramgar|S21|235 ths|HAYESB227|HashR2L6P2||Luxor|TRUE
Cabeza|S21|235 ths|HAYESB235|HashR2L6P5||Luxor|TRUE
Cabeza|S21|235 ths|HAYESB244|HashR2L6P3||Luxor|TRUE
Smarinovic|S21|235 ths|HAYESB233|HashR2L5P7||Luxor|TRUE
Mcrosta|S21|200 ths|HAYESB158|HashR2L4P6||Luxor|TRUE
Sancha|S21|200 ths|HAYESB155|HashR2L4P5||Luxor|TRUE
Sancha|S21|200 ths|HAYESB164|HashR2L5P1||Luxor|TRUE
Mariri|S21|200 ths|HAYESB162|HashR2L4P4||Kryptex|TRUE
Mariri|S21|200 ths|HAYESB157|HashR2L6P8||Kryptex|TRUE
Mariri|S21|200 ths|HAYESB156|HashR2L4P3||Kryptex|TRUE
Pegriloso|S21|200 ths|HAYESB163|HashR2L6P7||Luxor|TRUE
Pegriloso|S21|200 ths|HAYESB165|HashR2L6P6||Luxor|TRUE
Smarinovic|L7|9050 mhs|HAYESB243|HashR1L8P1||Luxor|TRUE
Mstore|L7|9050 mhs|HAYESB238|HashR2L11P3||Luxor|TRUE
Mstore|L7|9050 mhs|HAYESB231|HashR2L2P8||Luxor|TRUE
Nroca|L7|9050 mhs|HAYESB242|HashR2L1P4||Luxor|TRUE
Nroca|L7|9050 mhs|HAYESB248|HashR2L2P7||Luxor|TRUE
Annaklein|L7|9050 mhs|HAYESB246|HashR2L1P5||Luxor|TRUE
Annaklein|L7|9050 mhs|HAYESB241|HashR2L9P5||Luxor|TRUE
Sergiosanz|L7|9050 mhs|HAYESB245|HashR2L1P7||Luxor|TRUE
Gondiaz|L7|9050 mhs|HAYESB247|HashR2L2P5||Luxor|TRUE
Mperezr|L7|9050 mhs|HAYESB249|HashR2L2P6||Luxor|TRUE
Gonzalol7|L7|9050 mhs|HAYESB167|HashR2L9P1||Luxor|TRUE
Damasco|L7||HAYESB131|HashR2L11P8||Luxor|TRUE
Damasco|L7||HAYESB144|HashR2L10P5||Luxor|TRUE
Lulaps|L7||HAYESB127|HashR2L11P4||Luxor|TRUE
Lulaps|L7||HAYESB147|HashR2L11P6||Luxor|TRUE
Valkyria|L7|9050 mhs|HAYESB236|HashR1L1P2||Kryptex|TRUE
Pegriloso|L7||HAYESB168|HashR2L9P6||Kryptex|TRUE
Pegriloso|L7||HAYESB135|HashR2L10P4||Kryptex|TRUE
Pegrilosisimo|L7||HAYESB128|HashR2L9P2||Kryptex|TRUE
Pegrilosisimo|L7||HAYESB138|HashR2L10P6||Kryptex|TRUE
Pegrilosisimo|L7||HAYESB143|HashR1L1P7||Kryptex|TRUE
Pegrilosisimo|L7||HAYESB152|HashR2L10P7||Kryptex|TRUE
Kabra|L7||HAYESB151|HashR2L1P6||Nicehash|TRUE
Kabra|L7||HAYESB136|HashR2L10P8||Nicehash|TRUE
Jlsoler1|L7|9500 mhs|HAYESB130|HashR2L1P2||Kryptex|TRUE
Jlsoler2|L7|9050 mhs|HAYESB132|HashR2L9P8||Kryptex|TRUE
Jlsoler3|L7|9050 mhs|HAYESB240|HashR2L1P8||Kryptex|TRUE
L7hash|L7|8800 mhs|HAYESB146|HashR2L9P3||Kryptex|TRUE
Negrova|L7|9050 mhs|HAYESB141|HashR2L1P3||Kryptex|TRUE
Negrova|L7|9050 mhs|HAYESB161|HashR2L11P7||Kryptex|TRUE
Nukan13|L7|9050 mhs|HAYESB145|HashR2L1P1|YNAHDCBBCJDJC03M5|Kryptex|TRUE
Bala1|L7|9050 mhs|HAYESB250|HashR2L10P3||Kryptex|TRUE
Chivilcoy|L7|9050 mhs|HAYESB148|HashR2L11P2||Kryptex|TRUE
Cryptobros|L7||HAYESB134|HashR1L1P4||Kryptex|TRUE
Mham|L7||HAYESB139|HashR1L1P8||Nicehash|TRUE
Jano|L7|9050 mhs|HAYESB153|HashR2L9P7||Nicehash|TRUE
Mcrosta|L7||HAYESB154|HashR2L10P1||Nicehash|TRUE
Mcrosta|L7||HAYESB142|HashR1L1P6||Nicehash|TRUE
Mcrosta|L7||HAYESB239|HashR1L1P3||Nicehash|TRUE
Mcrosta|L7||HAYESB133|HashR1L1P5||Nicehash|TRUE
Mariri|L7||HAYESB129|HashR2L1P1||Kryptex|TRUE
Mariri|L7||HAYESB166|HashR2l2p4||Kryptex|TRUE
Mariri|L7||HAYESB149|HashR2L9P4||Kryptex|TRUE
Mariri|L7||HAYESB137|HashR2L10P2||Kryptex|TRUE
Richilu|L7|9050 mhs|HAYESB140|HashR1L1P1||Nicehash|TRUE
Cabeza|L7|9050 mhs|HAYESB150|HashR2L11P1||Nicehash|TRUE
Luma|L9|16000 mhs|HAYESB160|HashR2L4P7||Luxor|TRUE
Polenta|L9|17000 mhs|HAYESB237|HashR2L4P8||Luxor|TRUE
`.trim();

function parsePipeRows(raw: string): MonitorEquipoAsicRow[] {
  const out: MonitorEquipoAsicRow[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const p = t.split("|").map((s) => s.trim());
    if (p.length < 8) continue;
    const [usuario, modelo, potencia, nombreAnt, nombreNuevo, serial, pool, on] = p;
    if (!usuario && !modelo && !nombreAnt) continue;
    const online = /^true$/i.test(on ?? "") || on === "1";
    out.push({
      equipoId: newMonitorEquipoRowId(),
      usuario: usuario ?? "",
      modelo: modelo ?? "",
      potencia: potencia ?? "",
      nombreAnt: nombreAnt ?? "",
      nombreNuevo: nombreNuevo ?? "",
      serial: serial ?? "",
      pool: coerceMonitorPool(pool ?? ""),
      online,
    });
  }
  return out;
}

export const MONITOR_EQUIPOS_ASIC_ROWS: readonly MonitorEquipoAsicRow[] = parsePipeRows(PIPE_ROWS);
