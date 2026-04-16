/** Datos para registro tienda: tipo doc., país → ciudades, prefijo celular */

export const DOCUMENTO_TIPO_OPTIONS = [
  /** Etiqueta en el desplegable (texto breve); el `value` enviado sigue siendo CI, DNI, etc. */
  { value: "CI", label: "CI — Cédula identidad" },
  { value: "DNI", label: "DNI — Documento nacional" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "RUC", label: "RUC — Contribuyente" },
] as const;

export type DocumentoTipo = (typeof DOCUMENTO_TIPO_OPTIONS)[number]["value"];

export type CountryRegistro = {
  id: string;
  name: string;
  /** ITU-T E.164 sin espacios, ej. "+598" */
  dial: string;
  cities: string[];
};

/** Listado principal (CONOSUR + uso frecuente). Siempre incluir "Otra ciudad" al final en UI. */
export const COUNTRIES_REGISTRO: CountryRegistro[] = [
  {
    id: "PY",
    name: "Paraguay",
    dial: "+595",
    cities: [
      "Asunción",
      "Ciudad del Este",
      "Encarnación",
      "San Lorenzo",
      "Luque",
      "Capiatá",
      "Lambaré",
      "Fernando de la Mora",
      "Pedro Juan Caballero",
      "Coronel Oviedo",
    ],
  },
  {
    id: "UY",
    name: "Uruguay",
    dial: "+598",
    cities: [
      "Montevideo",
      "Salto",
      "Paysandú",
      "Las Piedras",
      "Rivera",
      "Maldonado",
      "Rocha",
      "Punta del Este",
      "Colonia del Sacramento",
      "Melo",
      "Mercedes",
      "Tacuarembó",
      "Barra de Carrasco",
    ],
  },
  {
    id: "AR",
    name: "Argentina",
    dial: "+54",
    cities: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata", "Mar del Plata", "Tucumán", "Salta"],
  },
  {
    id: "BR",
    name: "Brasil",
    dial: "+55",
    cities: ["São Paulo", "Rio de Janeiro", "Brasília", "Curitiba", "Porto Alegre", "Foz do Iguaçu", "Florianópolis"],
  },
  {
    id: "CL",
    name: "Chile",
    dial: "+56",
    cities: ["Santiago", "Valparaíso", "Viña del Mar", "Concepción", "Antofagasta", "La Serena", "Temuco"],
  },
  {
    id: "BO",
    name: "Bolivia",
    dial: "+591",
    cities: ["La Paz", "Santa Cruz de la Sierra", "Cochabamba", "Sucre", "Oruro", "Tarija"],
  },
  {
    id: "PE",
    name: "Perú",
    dial: "+51",
    cities: ["Lima", "Arequipa", "Trujillo", "Cusco", "Chiclayo", "Piura", "Iquitos"],
  },
  {
    id: "CO",
    name: "Colombia",
    dial: "+57",
    cities: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Cúcuta"],
  },
  {
    id: "EC",
    name: "Ecuador",
    dial: "+593",
    cities: ["Quito", "Guayaquil", "Cuenca", "Manta", "Ambato"],
  },
  {
    id: "MX",
    name: "México",
    dial: "+52",
    cities: ["Ciudad de México", "Monterrey", "Guadalajara", "Puebla", "Tijuana", "Mérida"],
  },
  {
    id: "ES",
    name: "España",
    dial: "+34",
    cities: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Zaragoza"],
  },
  {
    id: "US",
    name: "Estados Unidos",
    dial: "+1",
    cities: ["Nueva York", "Los Ángeles", "Miami", "Houston", "Chicago"],
  },
];

export const CITY_OTHER_VALUE = "__otra__";

/** Solo dígitos para armar número internacional */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Quita prefijo duplicado si el usuario pegó número completo */
export function normalizeLocalPhoneInput(local: string, dialDigits: string): string {
  let d = digitsOnly(local);
  const dd = dialDigits.replace(/^\+/, "");
  if (d.startsWith(dd)) d = d.slice(dd.length);
  return d;
}

export function dialToDigits(dial: string): string {
  return digitsOnly(dial);
}

export function countryById(id: string | undefined): CountryRegistro | undefined {
  if (!id) return undefined;
  return COUNTRIES_REGISTRO.find((c) => c.id === id);
}

/** País por nombre guardado en `clients.country` (p. ej. "Uruguay"). */
export function findCountryIdByName(countryName: string): string {
  const n = countryName.trim().toLowerCase();
  if (!n) return "";
  return COUNTRIES_REGISTRO.find((c) => c.name.toLowerCase() === n)?.id ?? "";
}

/**
 * Separa tipo y número desde `documento_identidad` (formato "CI 40157477" como en registro tienda).
 */
export function parseDocumentoIdentidadStored(raw: string): { tipo: string; numero: string } {
  const t = raw.trim();
  if (!t) return { tipo: DOCUMENTO_TIPO_OPTIONS[0].value, numero: "" };
  const byLen = [...DOCUMENTO_TIPO_OPTIONS].sort((a, b) => b.value.length - a.value.length);
  for (const o of byLen) {
    const prefix = o.value.toUpperCase();
    const up = t.toUpperCase();
    if (up === prefix) return { tipo: o.value, numero: "" };
    if (up.startsWith(prefix + " ") || up.startsWith(prefix + "\t")) {
      return { tipo: o.value, numero: t.slice(o.value.length).trim() };
    }
  }
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    const head = parts[0].toUpperCase();
    const opt = DOCUMENTO_TIPO_OPTIONS.find((o) => o.value.toUpperCase() === head);
    if (opt) return { tipo: opt.value, numero: parts.slice(1).join(" ").trim() };
  }
  return { tipo: DOCUMENTO_TIPO_OPTIONS[0].value, numero: t };
}

/**
 * Descompone un celular guardado (E.164 o dígitos) en país del prefijo + parte local.
 */
export function parseStoredPhoneToDialLocal(phone: string): { dialId: string; local: string } {
  const p = digitsOnly(phone);
  if (!p) return { dialId: "PY", local: "" };
  const ordered = [...COUNTRIES_REGISTRO]
    .map((c) => ({ id: c.id, dialDigits: digitsOnly(c.dial) }))
    .filter((x) => x.dialDigits.length > 0)
    .sort((a, b) => b.dialDigits.length - a.dialDigits.length);
  for (const { id, dialDigits } of ordered) {
    if (p.startsWith(dialDigits)) {
      return { dialId: id, local: p.slice(dialDigits.length) };
    }
  }
  return { dialId: "PY", local: p };
}

/** Mismo orden que el select de celular en `/marketplace/signup` (legacy: `/marketplace/registro`). */
export const DEFAULT_PHONE_DIAL_COUNTRY_ID = "PY" as const;

export function countriesForPhoneSelect(): CountryRegistro[] {
  return [...COUNTRIES_REGISTRO].sort((a, b) => {
    if (a.id === DEFAULT_PHONE_DIAL_COUNTRY_ID) return -1;
    if (b.id === DEFAULT_PHONE_DIAL_COUNTRY_ID) return 1;
    return a.name.localeCompare(b.name, "es");
  });
}
