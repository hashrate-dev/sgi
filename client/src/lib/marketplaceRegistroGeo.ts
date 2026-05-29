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
};

/** Listado de países para registro (dirección + prefijo celular). "Otra ciudad" se agrega en UI. */
export const COUNTRIES_REGISTRO: CountryRegistro[] = [
  { id: "AF", name: "Afganistán", dial: "+93" },
  { id: "AL", name: "Albania", dial: "+355" },
  { id: "DE", name: "Alemania", dial: "+49" },
  { id: "AD", name: "Andorra", dial: "+376" },
  { id: "AO", name: "Angola", dial: "+244" },
  { id: "AG", name: "Antigua y Barbuda", dial: "+1" },
  { id: "SA", name: "Arabia Saudita", dial: "+966" },
  { id: "DZ", name: "Argelia", dial: "+213" },
  { id: "AR", name: "Argentina", dial: "+54" },
  { id: "AM", name: "Armenia", dial: "+374" },
  { id: "AU", name: "Australia", dial: "+61" },
  { id: "AT", name: "Austria", dial: "+43" },
  { id: "AZ", name: "Azerbaiyán", dial: "+994" },
  { id: "BS", name: "Bahamas", dial: "+1" },
  { id: "BD", name: "Bangladesh", dial: "+880" },
  { id: "BB", name: "Barbados", dial: "+1" },
  { id: "BH", name: "Baréin", dial: "+973" },
  { id: "BE", name: "Bélgica", dial: "+32" },
  { id: "BZ", name: "Belice", dial: "+501" },
  { id: "BJ", name: "Benín", dial: "+229" },
  { id: "BY", name: "Bielorrusia", dial: "+375" },
  { id: "BO", name: "Bolivia", dial: "+591" },
  { id: "BA", name: "Bosnia y Herzegovina", dial: "+387" },
  { id: "BW", name: "Botsuana", dial: "+267" },
  { id: "BR", name: "Brasil", dial: "+55" },
  { id: "BN", name: "Brunéi", dial: "+673" },
  { id: "BG", name: "Bulgaria", dial: "+359" },
  { id: "BF", name: "Burkina Faso", dial: "+226" },
  { id: "BI", name: "Burundi", dial: "+257" },
  { id: "BT", name: "Bután", dial: "+975" },
  { id: "CV", name: "Cabo Verde", dial: "+238" },
  { id: "KH", name: "Camboya", dial: "+855" },
  { id: "CM", name: "Camerún", dial: "+237" },
  { id: "CA", name: "Canadá", dial: "+1" },
  { id: "QA", name: "Catar", dial: "+974" },
  { id: "TD", name: "Chad", dial: "+235" },
  { id: "CL", name: "Chile", dial: "+56" },
  { id: "CN", name: "China", dial: "+86" },
  { id: "CY", name: "Chipre", dial: "+357" },
  { id: "VA", name: "Ciudad del Vaticano", dial: "+39" },
  { id: "CO", name: "Colombia", dial: "+57" },
  { id: "KM", name: "Comoras", dial: "+269" },
  { id: "KP", name: "Corea del Norte", dial: "+850" },
  { id: "KR", name: "Corea del Sur", dial: "+82" },
  { id: "CI", name: "Costa de Marfil", dial: "+225" },
  { id: "CR", name: "Costa Rica", dial: "+506" },
  { id: "HR", name: "Croacia", dial: "+385" },
  { id: "CU", name: "Cuba", dial: "+53" },
  { id: "DK", name: "Dinamarca", dial: "+45" },
  { id: "DM", name: "Dominica", dial: "+1" },
  { id: "EC", name: "Ecuador", dial: "+593" },
  { id: "EG", name: "Egipto", dial: "+20" },
  { id: "SV", name: "El Salvador", dial: "+503" },
  { id: "AE", name: "Emiratos Árabes Unidos", dial: "+971" },
  { id: "ER", name: "Eritrea", dial: "+291" },
  { id: "SK", name: "Eslovaquia", dial: "+421" },
  { id: "SI", name: "Eslovenia", dial: "+386" },
  { id: "ES", name: "España", dial: "+34" },
  { id: "US", name: "Estados Unidos", dial: "+1" },
  { id: "EE", name: "Estonia", dial: "+372" },
  { id: "ET", name: "Etiopía", dial: "+251" },
  { id: "PH", name: "Filipinas", dial: "+63" },
  { id: "FI", name: "Finlandia", dial: "+358" },
  { id: "FJ", name: "Fiyi", dial: "+679" },
  { id: "FR", name: "Francia", dial: "+33" },
  { id: "GA", name: "Gabón", dial: "+241" },
  { id: "GM", name: "Gambia", dial: "+220" },
  { id: "GE", name: "Georgia", dial: "+995" },
  { id: "GH", name: "Ghana", dial: "+233" },
  { id: "GD", name: "Granada", dial: "+1" },
  { id: "GR", name: "Grecia", dial: "+30" },
  { id: "GT", name: "Guatemala", dial: "+502" },
  { id: "GN", name: "Guinea", dial: "+224" },
  { id: "GQ", name: "Guinea Ecuatorial", dial: "+240" },
  { id: "GW", name: "Guinea-Bisáu", dial: "+245" },
  { id: "GY", name: "Guyana", dial: "+592" },
  { id: "HT", name: "Haití", dial: "+509" },
  { id: "HN", name: "Honduras", dial: "+504" },
  { id: "HU", name: "Hungría", dial: "+36" },
  { id: "IN", name: "India", dial: "+91" },
  { id: "ID", name: "Indonesia", dial: "+62" },
  { id: "IQ", name: "Irak", dial: "+964" },
  { id: "IR", name: "Irán", dial: "+98" },
  { id: "IE", name: "Irlanda", dial: "+353" },
  { id: "IS", name: "Islandia", dial: "+354" },
  { id: "IL", name: "Israel", dial: "+972" },
  { id: "IT", name: "Italia", dial: "+39" },
  { id: "JM", name: "Jamaica", dial: "+1" },
  { id: "JP", name: "Japón", dial: "+81" },
  { id: "JO", name: "Jordania", dial: "+962" },
  { id: "KZ", name: "Kazajistán", dial: "+7" },
  { id: "KE", name: "Kenia", dial: "+254" },
  { id: "KG", name: "Kirguistán", dial: "+996" },
  { id: "KI", name: "Kiribati", dial: "+686" },
  { id: "KW", name: "Kuwait", dial: "+965" },
  { id: "LA", name: "Laos", dial: "+856" },
  { id: "LS", name: "Lesoto", dial: "+266" },
  { id: "LV", name: "Letonia", dial: "+371" },
  { id: "LB", name: "Líbano", dial: "+961" },
  { id: "LR", name: "Liberia", dial: "+231" },
  { id: "LY", name: "Libia", dial: "+218" },
  { id: "LI", name: "Liechtenstein", dial: "+423" },
  { id: "LT", name: "Lituania", dial: "+370" },
  { id: "LU", name: "Luxemburgo", dial: "+352" },
  { id: "MK", name: "Macedonia del Norte", dial: "+389" },
  { id: "MG", name: "Madagascar", dial: "+261" },
  { id: "MY", name: "Malasia", dial: "+60" },
  { id: "MW", name: "Malaui", dial: "+265" },
  { id: "MV", name: "Maldivas", dial: "+960" },
  { id: "ML", name: "Malí", dial: "+223" },
  { id: "MT", name: "Malta", dial: "+356" },
  { id: "MA", name: "Marruecos", dial: "+212" },
  { id: "MH", name: "Islas Marshall", dial: "+692" },
  { id: "MU", name: "Mauricio", dial: "+230" },
  { id: "MR", name: "Mauritania", dial: "+222" },
  { id: "MX", name: "México", dial: "+52" },
  { id: "FM", name: "Micronesia", dial: "+691" },
  { id: "MD", name: "Moldavia", dial: "+373" },
  { id: "MC", name: "Mónaco", dial: "+377" },
  { id: "MN", name: "Mongolia", dial: "+976" },
  { id: "ME", name: "Montenegro", dial: "+382" },
  { id: "MZ", name: "Mozambique", dial: "+258" },
  { id: "MM", name: "Myanmar", dial: "+95" },
  { id: "NA", name: "Namibia", dial: "+264" },
  { id: "NR", name: "Nauru", dial: "+674" },
  { id: "NP", name: "Nepal", dial: "+977" },
  { id: "NI", name: "Nicaragua", dial: "+505" },
  { id: "NE", name: "Níger", dial: "+227" },
  { id: "NG", name: "Nigeria", dial: "+234" },
  { id: "NO", name: "Noruega", dial: "+47" },
  { id: "NZ", name: "Nueva Zelanda", dial: "+64" },
  { id: "OM", name: "Omán", dial: "+968" },
  { id: "NL", name: "Países Bajos", dial: "+31" },
  { id: "PK", name: "Pakistán", dial: "+92" },
  { id: "PW", name: "Palaos", dial: "+680" },
  { id: "PA", name: "Panamá", dial: "+507" },
  { id: "PG", name: "Papúa Nueva Guinea", dial: "+675" },
  { id: "PY", name: "Paraguay", dial: "+595" },
  { id: "PE", name: "Perú", dial: "+51" },
  { id: "PL", name: "Polonia", dial: "+48" },
  { id: "PT", name: "Portugal", dial: "+351" },
  { id: "GB", name: "Reino Unido", dial: "+44" },
  { id: "CF", name: "República Centroafricana", dial: "+236" },
  { id: "CZ", name: "República Checa", dial: "+420" },
  { id: "CD", name: "República Democrática del Congo", dial: "+243" },
  { id: "CG", name: "República del Congo", dial: "+242" },
  { id: "DO", name: "República Dominicana", dial: "+1" },
  { id: "RW", name: "Ruanda", dial: "+250" },
  { id: "RO", name: "Rumania", dial: "+40" },
  { id: "RU", name: "Rusia", dial: "+7" },
  { id: "WS", name: "Samoa", dial: "+685" },
  { id: "KN", name: "San Cristóbal y Nieves", dial: "+1" },
  { id: "SM", name: "San Marino", dial: "+378" },
  { id: "VC", name: "San Vicente y las Granadinas", dial: "+1" },
  { id: "LC", name: "Santa Lucía", dial: "+1" },
  { id: "ST", name: "Santo Tomé y Príncipe", dial: "+239" },
  { id: "SN", name: "Senegal", dial: "+221" },
  { id: "RS", name: "Serbia", dial: "+381" },
  { id: "SC", name: "Seychelles", dial: "+248" },
  { id: "SL", name: "Sierra Leona", dial: "+232" },
  { id: "SG", name: "Singapur", dial: "+65" },
  { id: "SY", name: "Siria", dial: "+963" },
  { id: "SO", name: "Somalia", dial: "+252" },
  { id: "LK", name: "Sri Lanka", dial: "+94" },
  { id: "SZ", name: "Suazilandia", dial: "+268" },
  { id: "ZA", name: "Sudáfrica", dial: "+27" },
  { id: "SD", name: "Sudán", dial: "+249" },
  { id: "SS", name: "Sudán del Sur", dial: "+211" },
  { id: "SE", name: "Suecia", dial: "+46" },
  { id: "CH", name: "Suiza", dial: "+41" },
  { id: "SR", name: "Surinam", dial: "+597" },
  { id: "TH", name: "Tailandia", dial: "+66" },
  { id: "TZ", name: "Tanzania", dial: "+255" },
  { id: "TJ", name: "Tayikistán", dial: "+992" },
  { id: "TL", name: "Timor Oriental", dial: "+670" },
  { id: "TG", name: "Togo", dial: "+228" },
  { id: "TO", name: "Tonga", dial: "+676" },
  { id: "TT", name: "Trinidad y Tobago", dial: "+1" },
  { id: "TN", name: "Túnez", dial: "+216" },
  { id: "TM", name: "Turkmenistán", dial: "+993" },
  { id: "TR", name: "Turquía", dial: "+90" },
  { id: "TV", name: "Tuvalu", dial: "+688" },
  { id: "UY", name: "Uruguay", dial: "+598" },
  { id: "UZ", name: "Uzbekistán", dial: "+998" },
  { id: "VU", name: "Vanuatu", dial: "+678" },
  { id: "VE", name: "Venezuela", dial: "+58" },
  { id: "VN", name: "Vietnam", dial: "+84" },
  { id: "YE", name: "Yemen", dial: "+967" },
  { id: "DJ", name: "Yibuti", dial: "+253" },
  { id: "ZM", name: "Zambia", dial: "+260" },
  { id: "ZW", name: "Zimbabue", dial: "+263" },
];

export const CITY_OTHER_VALUE = "__otra__";

/** URL de bandera PNG (visible en Windows; los emoji de bandera suelen no renderizar en `<select>`). */
export function countryFlagImgUrl(iso2: string, width = 40): string {
  const code = iso2.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return "";
  return `https://flagcdn.com/w${width}/${code}.png`;
}

/** Bandera emoji (ISO 3166-1 alpha-2, ej. PY → 🇵🇾). */
export function countryFlagEmoji(iso2: string): string {
  const code = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(...([...code].map((ch) => base + ch.charCodeAt(0) - 65)));
}

/** Etiqueta para selects: nombre + prefijo; con `withEmoji` antepone bandera emoji (prefijo telefónico nativo). */
export function formatRegistroCountryDialLabel(
  country: CountryRegistro,
  opts?: { withEmoji?: boolean }
): string {
  const base = `${country.name} (${country.dial})`;
  if (opts?.withEmoji === false) return base;
  const flag = countryFlagEmoji(country.id);
  return flag ? `${flag} ${base}` : base;
}

export function sortCountriesRegistroByName(
  countries: readonly CountryRegistro[],
  locale = "es"
): CountryRegistro[] {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name, locale));
}

function normalizeCountrySearchText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Filtra por nombre, código ISO o prefijo (ej. "urug", "598", "+595"). */
export function filterCountriesRegistro(
  countries: readonly CountryRegistro[],
  query: string
): CountryRegistro[] {
  const q = normalizeCountrySearchText(query);
  if (!q) return [...countries];
  const qDigits = digitsOnly(query);
  return countries.filter((c) => {
    const name = normalizeCountrySearchText(c.name);
    const dial = c.dial.toLowerCase();
    const id = c.id.toLowerCase();
    if (name.includes(q) || dial.includes(q) || id.includes(q)) return true;
    if (qDigits && digitsOnly(c.dial).includes(qDigits)) return true;
    return false;
  });
}

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
