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

/** Listado de países para registro (dirección + prefijo celular). "Otra ciudad" se agrega en UI. */
export const COUNTRIES_REGISTRO: CountryRegistro[] = [
  { id: "AF", name: "Afganistán", dial: "+93", cities: [] },
  { id: "AL", name: "Albania", dial: "+355", cities: [] },
  { id: "DE", name: "Alemania", dial: "+49", cities: [] },
  { id: "AD", name: "Andorra", dial: "+376", cities: [] },
  { id: "AO", name: "Angola", dial: "+244", cities: [] },
  { id: "AG", name: "Antigua y Barbuda", dial: "+1", cities: [] },
  { id: "SA", name: "Arabia Saudita", dial: "+966", cities: [] },
  { id: "DZ", name: "Argelia", dial: "+213", cities: [] },
  { id: "AR", name: "Argentina", dial: "+54", cities: ["Buenos Aires", "Córdoba", "Rosario"] },
  { id: "AM", name: "Armenia", dial: "+374", cities: [] },
  { id: "AU", name: "Australia", dial: "+61", cities: [] },
  { id: "AT", name: "Austria", dial: "+43", cities: [] },
  { id: "AZ", name: "Azerbaiyán", dial: "+994", cities: [] },
  { id: "BS", name: "Bahamas", dial: "+1", cities: [] },
  { id: "BD", name: "Bangladesh", dial: "+880", cities: [] },
  { id: "BB", name: "Barbados", dial: "+1", cities: [] },
  { id: "BH", name: "Baréin", dial: "+973", cities: [] },
  { id: "BE", name: "Bélgica", dial: "+32", cities: [] },
  { id: "BZ", name: "Belice", dial: "+501", cities: [] },
  { id: "BJ", name: "Benín", dial: "+229", cities: [] },
  { id: "BY", name: "Bielorrusia", dial: "+375", cities: [] },
  { id: "BO", name: "Bolivia", dial: "+591", cities: ["La Paz", "Santa Cruz de la Sierra", "Cochabamba"] },
  { id: "BA", name: "Bosnia y Herzegovina", dial: "+387", cities: [] },
  { id: "BW", name: "Botsuana", dial: "+267", cities: [] },
  { id: "BR", name: "Brasil", dial: "+55", cities: ["São Paulo", "Rio de Janeiro", "Brasília"] },
  { id: "BN", name: "Brunéi", dial: "+673", cities: [] },
  { id: "BG", name: "Bulgaria", dial: "+359", cities: [] },
  { id: "BF", name: "Burkina Faso", dial: "+226", cities: [] },
  { id: "BI", name: "Burundi", dial: "+257", cities: [] },
  { id: "BT", name: "Bután", dial: "+975", cities: [] },
  { id: "CV", name: "Cabo Verde", dial: "+238", cities: [] },
  { id: "KH", name: "Camboya", dial: "+855", cities: [] },
  { id: "CM", name: "Camerún", dial: "+237", cities: [] },
  { id: "CA", name: "Canadá", dial: "+1", cities: [] },
  { id: "QA", name: "Catar", dial: "+974", cities: [] },
  { id: "TD", name: "Chad", dial: "+235", cities: [] },
  { id: "CL", name: "Chile", dial: "+56", cities: ["Santiago", "Valparaíso", "Concepción"] },
  { id: "CN", name: "China", dial: "+86", cities: [] },
  { id: "CY", name: "Chipre", dial: "+357", cities: [] },
  { id: "VA", name: "Ciudad del Vaticano", dial: "+39", cities: [] },
  { id: "CO", name: "Colombia", dial: "+57", cities: ["Bogotá", "Medellín", "Cali"] },
  { id: "KM", name: "Comoras", dial: "+269", cities: [] },
  { id: "KP", name: "Corea del Norte", dial: "+850", cities: [] },
  { id: "KR", name: "Corea del Sur", dial: "+82", cities: [] },
  { id: "CI", name: "Costa de Marfil", dial: "+225", cities: [] },
  { id: "CR", name: "Costa Rica", dial: "+506", cities: [] },
  { id: "HR", name: "Croacia", dial: "+385", cities: [] },
  { id: "CU", name: "Cuba", dial: "+53", cities: [] },
  { id: "DK", name: "Dinamarca", dial: "+45", cities: [] },
  { id: "DM", name: "Dominica", dial: "+1", cities: [] },
  { id: "EC", name: "Ecuador", dial: "+593", cities: ["Quito", "Guayaquil", "Cuenca"] },
  { id: "EG", name: "Egipto", dial: "+20", cities: [] },
  { id: "SV", name: "El Salvador", dial: "+503", cities: [] },
  { id: "AE", name: "Emiratos Árabes Unidos", dial: "+971", cities: [] },
  { id: "ER", name: "Eritrea", dial: "+291", cities: [] },
  { id: "SK", name: "Eslovaquia", dial: "+421", cities: [] },
  { id: "SI", name: "Eslovenia", dial: "+386", cities: [] },
  { id: "ES", name: "España", dial: "+34", cities: ["Madrid", "Barcelona", "Valencia"] },
  { id: "US", name: "Estados Unidos", dial: "+1", cities: ["Nueva York", "Los Ángeles", "Miami"] },
  { id: "EE", name: "Estonia", dial: "+372", cities: [] },
  { id: "ET", name: "Etiopía", dial: "+251", cities: [] },
  { id: "PH", name: "Filipinas", dial: "+63", cities: [] },
  { id: "FI", name: "Finlandia", dial: "+358", cities: [] },
  { id: "FJ", name: "Fiyi", dial: "+679", cities: [] },
  { id: "FR", name: "Francia", dial: "+33", cities: [] },
  { id: "GA", name: "Gabón", dial: "+241", cities: [] },
  { id: "GM", name: "Gambia", dial: "+220", cities: [] },
  { id: "GE", name: "Georgia", dial: "+995", cities: [] },
  { id: "GH", name: "Ghana", dial: "+233", cities: [] },
  { id: "GD", name: "Granada", dial: "+1", cities: [] },
  { id: "GR", name: "Grecia", dial: "+30", cities: [] },
  { id: "GT", name: "Guatemala", dial: "+502", cities: [] },
  { id: "GN", name: "Guinea", dial: "+224", cities: [] },
  { id: "GQ", name: "Guinea Ecuatorial", dial: "+240", cities: [] },
  { id: "GW", name: "Guinea-Bisáu", dial: "+245", cities: [] },
  { id: "GY", name: "Guyana", dial: "+592", cities: [] },
  { id: "HT", name: "Haití", dial: "+509", cities: [] },
  { id: "HN", name: "Honduras", dial: "+504", cities: [] },
  { id: "HU", name: "Hungría", dial: "+36", cities: [] },
  { id: "IN", name: "India", dial: "+91", cities: [] },
  { id: "ID", name: "Indonesia", dial: "+62", cities: [] },
  { id: "IQ", name: "Irak", dial: "+964", cities: [] },
  { id: "IR", name: "Irán", dial: "+98", cities: [] },
  { id: "IE", name: "Irlanda", dial: "+353", cities: [] },
  { id: "IS", name: "Islandia", dial: "+354", cities: [] },
  { id: "IL", name: "Israel", dial: "+972", cities: [] },
  { id: "IT", name: "Italia", dial: "+39", cities: [] },
  { id: "JM", name: "Jamaica", dial: "+1", cities: [] },
  { id: "JP", name: "Japón", dial: "+81", cities: [] },
  { id: "JO", name: "Jordania", dial: "+962", cities: [] },
  { id: "KZ", name: "Kazajistán", dial: "+7", cities: [] },
  { id: "KE", name: "Kenia", dial: "+254", cities: [] },
  { id: "KG", name: "Kirguistán", dial: "+996", cities: [] },
  { id: "KI", name: "Kiribati", dial: "+686", cities: [] },
  { id: "KW", name: "Kuwait", dial: "+965", cities: [] },
  { id: "LA", name: "Laos", dial: "+856", cities: [] },
  { id: "LS", name: "Lesoto", dial: "+266", cities: [] },
  { id: "LV", name: "Letonia", dial: "+371", cities: [] },
  { id: "LB", name: "Líbano", dial: "+961", cities: [] },
  { id: "LR", name: "Liberia", dial: "+231", cities: [] },
  { id: "LY", name: "Libia", dial: "+218", cities: [] },
  { id: "LI", name: "Liechtenstein", dial: "+423", cities: [] },
  { id: "LT", name: "Lituania", dial: "+370", cities: [] },
  { id: "LU", name: "Luxemburgo", dial: "+352", cities: [] },
  { id: "MK", name: "Macedonia del Norte", dial: "+389", cities: [] },
  { id: "MG", name: "Madagascar", dial: "+261", cities: [] },
  { id: "MY", name: "Malasia", dial: "+60", cities: [] },
  { id: "MW", name: "Malaui", dial: "+265", cities: [] },
  { id: "MV", name: "Maldivas", dial: "+960", cities: [] },
  { id: "ML", name: "Malí", dial: "+223", cities: [] },
  { id: "MT", name: "Malta", dial: "+356", cities: [] },
  { id: "MA", name: "Marruecos", dial: "+212", cities: [] },
  { id: "MH", name: "Islas Marshall", dial: "+692", cities: [] },
  { id: "MU", name: "Mauricio", dial: "+230", cities: [] },
  { id: "MR", name: "Mauritania", dial: "+222", cities: [] },
  { id: "MX", name: "México", dial: "+52", cities: ["Ciudad de México", "Monterrey", "Guadalajara"] },
  { id: "FM", name: "Micronesia", dial: "+691", cities: [] },
  { id: "MD", name: "Moldavia", dial: "+373", cities: [] },
  { id: "MC", name: "Mónaco", dial: "+377", cities: [] },
  { id: "MN", name: "Mongolia", dial: "+976", cities: [] },
  { id: "ME", name: "Montenegro", dial: "+382", cities: [] },
  { id: "MZ", name: "Mozambique", dial: "+258", cities: [] },
  { id: "MM", name: "Myanmar", dial: "+95", cities: [] },
  { id: "NA", name: "Namibia", dial: "+264", cities: [] },
  { id: "NR", name: "Nauru", dial: "+674", cities: [] },
  { id: "NP", name: "Nepal", dial: "+977", cities: [] },
  { id: "NI", name: "Nicaragua", dial: "+505", cities: [] },
  { id: "NE", name: "Níger", dial: "+227", cities: [] },
  { id: "NG", name: "Nigeria", dial: "+234", cities: [] },
  { id: "NO", name: "Noruega", dial: "+47", cities: [] },
  { id: "NZ", name: "Nueva Zelanda", dial: "+64", cities: [] },
  { id: "OM", name: "Omán", dial: "+968", cities: [] },
  { id: "NL", name: "Países Bajos", dial: "+31", cities: [] },
  { id: "PK", name: "Pakistán", dial: "+92", cities: [] },
  { id: "PW", name: "Palaos", dial: "+680", cities: [] },
  { id: "PA", name: "Panamá", dial: "+507", cities: [] },
  { id: "PG", name: "Papúa Nueva Guinea", dial: "+675", cities: [] },
  {
    id: "PY",
    name: "Paraguay",
    dial: "+595",
    cities: ["Asunción", "Ciudad del Este", "Encarnación", "San Lorenzo", "Luque", "Capiatá"],
  },
  { id: "PE", name: "Perú", dial: "+51", cities: ["Lima", "Arequipa", "Trujillo"] },
  { id: "PL", name: "Polonia", dial: "+48", cities: [] },
  { id: "PT", name: "Portugal", dial: "+351", cities: [] },
  { id: "GB", name: "Reino Unido", dial: "+44", cities: [] },
  { id: "CF", name: "República Centroafricana", dial: "+236", cities: [] },
  { id: "CZ", name: "República Checa", dial: "+420", cities: [] },
  { id: "CD", name: "República Democrática del Congo", dial: "+243", cities: [] },
  { id: "CG", name: "República del Congo", dial: "+242", cities: [] },
  { id: "DO", name: "República Dominicana", dial: "+1", cities: [] },
  { id: "RW", name: "Ruanda", dial: "+250", cities: [] },
  { id: "RO", name: "Rumania", dial: "+40", cities: [] },
  { id: "RU", name: "Rusia", dial: "+7", cities: [] },
  { id: "WS", name: "Samoa", dial: "+685", cities: [] },
  { id: "KN", name: "San Cristóbal y Nieves", dial: "+1", cities: [] },
  { id: "SM", name: "San Marino", dial: "+378", cities: [] },
  { id: "VC", name: "San Vicente y las Granadinas", dial: "+1", cities: [] },
  { id: "LC", name: "Santa Lucía", dial: "+1", cities: [] },
  { id: "ST", name: "Santo Tomé y Príncipe", dial: "+239", cities: [] },
  { id: "SN", name: "Senegal", dial: "+221", cities: [] },
  { id: "RS", name: "Serbia", dial: "+381", cities: [] },
  { id: "SC", name: "Seychelles", dial: "+248", cities: [] },
  { id: "SL", name: "Sierra Leona", dial: "+232", cities: [] },
  { id: "SG", name: "Singapur", dial: "+65", cities: [] },
  { id: "SY", name: "Siria", dial: "+963", cities: [] },
  { id: "SO", name: "Somalia", dial: "+252", cities: [] },
  { id: "LK", name: "Sri Lanka", dial: "+94", cities: [] },
  { id: "SZ", name: "Suazilandia", dial: "+268", cities: [] },
  { id: "ZA", name: "Sudáfrica", dial: "+27", cities: [] },
  { id: "SD", name: "Sudán", dial: "+249", cities: [] },
  { id: "SS", name: "Sudán del Sur", dial: "+211", cities: [] },
  { id: "SE", name: "Suecia", dial: "+46", cities: [] },
  { id: "CH", name: "Suiza", dial: "+41", cities: [] },
  { id: "SR", name: "Surinam", dial: "+597", cities: [] },
  { id: "TH", name: "Tailandia", dial: "+66", cities: [] },
  { id: "TZ", name: "Tanzania", dial: "+255", cities: [] },
  { id: "TJ", name: "Tayikistán", dial: "+992", cities: [] },
  { id: "TL", name: "Timor Oriental", dial: "+670", cities: [] },
  { id: "TG", name: "Togo", dial: "+228", cities: [] },
  { id: "TO", name: "Tonga", dial: "+676", cities: [] },
  { id: "TT", name: "Trinidad y Tobago", dial: "+1", cities: [] },
  { id: "TN", name: "Túnez", dial: "+216", cities: [] },
  { id: "TM", name: "Turkmenistán", dial: "+993", cities: [] },
  { id: "TR", name: "Turquía", dial: "+90", cities: [] },
  { id: "TV", name: "Tuvalu", dial: "+688", cities: [] },
  {
    id: "UY",
    name: "Uruguay",
    dial: "+598",
    cities: ["Montevideo", "Salto", "Paysandú", "Las Piedras", "Rivera", "Maldonado", "Punta del Este"],
  },
  { id: "UZ", name: "Uzbekistán", dial: "+998", cities: [] },
  { id: "VU", name: "Vanuatu", dial: "+678", cities: [] },
  { id: "VE", name: "Venezuela", dial: "+58", cities: [] },
  { id: "VN", name: "Vietnam", dial: "+84", cities: [] },
  { id: "YE", name: "Yemen", dial: "+967", cities: [] },
  { id: "DJ", name: "Yibuti", dial: "+253", cities: [] },
  { id: "ZM", name: "Zambia", dial: "+260", cities: [] },
  { id: "ZW", name: "Zimbabue", dial: "+263", cities: [] },
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
