/**
 * Convierte un monto numérico a texto en español para recibos (ej. "CERO DÓLARES CON 00/100").
 */

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DECENAS_ESPECIALES = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function parteMenor100(n: number): string {
  if (n === 0) return "";
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DECENAS_ESPECIALES[n - 10];
  if (n < 30) return n === 20 ? "VEINTE" : "VEINTI" + UNIDADES[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return DECENAS[d];
  return DECENAS[d] + " Y " + UNIDADES[u];
}

function parteMenor1000(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const rest = n % 100;
  const cent = c === 1 && rest === 0 ? "CIEN" : CENTENAS[c];
  const restoStr = parteMenor100(rest);
  return restoStr ? `${cent} ${restoStr}`.trim() : cent;
}

/** Convierte 0..999999 a palabras en mayúsculas (español). */
function intToWordsEs(n: number): string {
  if (n === 0) return "CERO";
  if (n >= 1_000_000) {
    const mill = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const millStr = mill === 1 ? "UN MILLÓN" : parteMenor1000(mill) + " MILLONES";
    return rest === 0 ? millStr : millStr + " " + intToWordsEs(rest);
  }
  if (n >= 1000) {
    const mill = Math.floor(n / 1000);
    const rest = n % 1000;
    const millStr = mill === 1 ? "MIL" : parteMenor1000(mill) + " MIL";
    return rest === 0 ? millStr : millStr + " " + parteMenor1000(rest);
  }
  return parteMenor1000(n);
}

/**
 * Convierte un monto (ej. 1234.56) a texto de recibo en español:
 * "MIL DOSCIENTOS TREINTA Y CUATRO DÓLARES CON 56/100"
 * Para 0: "CERO DÓLARES CON 00/100"
 */
export function amountToWordsReceipt(amount: number): string {
  const abs = Math.abs(amount);
  const entero = Math.floor(abs);
  const centavos = Math.round((abs - entero) * 100) % 100;
  const centStr = String(centavos).padStart(2, "0");
  const parteEntera = intToWordsEs(entero);
  return `${parteEntera} DÓLARES ESTADOUNIDENSES CON ${centStr}/100`;
}

/** Primera letra en mayúscula, resto en minúscula */
function toSentenceCase(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Texto para recibo en dos líneas, minúsculas con primera letra mayúscula:
 * Línea 1: "Recibimos la cantidad de [monto en letras]"
 * Línea 2: "Dólares estadounidenses con XX/100"
 */
export function recibimosMontoEnDosLineas(amount: number): { line1: string; line2: string } {
  const abs = Math.abs(amount);
  const entero = Math.floor(abs);
  const centavos = Math.round((abs - entero) * 100) % 100;
  const centStr = String(centavos).padStart(2, "0");
  const parteEntera = intToWordsEs(entero);
  return {
    line1: toSentenceCase(`RECIBIMOS LA CANTIDAD DE ${parteEntera}`),
    line2: toSentenceCase(`DÓLARES ESTADOUNIDENSES CON ${centStr}/100`) + "."
  };
}
