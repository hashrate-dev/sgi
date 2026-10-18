/** Centro aproximado de cada país (lat, lng). */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AE: [23.4, 53.8],
  AR: [-38.4, -63.6],
  AT: [47.5, 14.6],
  AU: [-25.3, 133.8],
  BE: [50.5, 4.5],
  BG: [42.7, 25.5],
  BO: [-16.3, -63.6],
  BR: [-14.2, -51.9],
  BY: [53.7, 27.9],
  CA: [56.1, -106.3],
  CH: [46.8, 8.3],
  CL: [-35.7, -71.5],
  CN: [35.9, 104.2],
  CO: [4.6, -74.1],
  CR: [9.7, -83.8],
  CZ: [49.8, 15.5],
  DE: [51.2, 10.4],
  DK: [56.3, 9.5],
  DO: [18.7, -70.2],
  EC: [-1.8, -78.2],
  EE: [58.6, 25.0],
  EG: [26.8, 30.8],
  ES: [40.4, -3.7],
  FI: [61.9, 25.7],
  FR: [46.2, 2.2],
  GB: [54.0, -2.5],
  GR: [39.1, 21.8],
  GT: [15.8, -90.2],
  HK: [22.3, 114.2],
  HN: [15.2, -86.2],
  HU: [47.2, 19.5],
  ID: [-0.8, 113.9],
  IE: [53.1, -8.0],
  IL: [31.0, 34.8],
  IN: [20.6, 78.9],
  IT: [41.9, 12.6],
  JP: [36.2, 138.3],
  KE: [0.2, 37.9],
  KH: [12.6, 105.0],
  KR: [35.9, 127.8],
  LT: [55.2, 23.9],
  LU: [49.8, 6.1],
  LV: [56.9, 24.6],
  MA: [31.8, -7.1],
  MX: [23.6, -102.5],
  MY: [4.2, 101.9],
  NG: [9.1, 8.7],
  NL: [52.1, 5.3],
  NO: [60.5, 8.5],
  NZ: [-40.9, 174.9],
  PA: [8.5, -80.8],
  PE: [-9.2, -75.0],
  PH: [12.9, 121.8],
  PL: [51.9, 19.1],
  PT: [39.4, -8.2],
  PY: [-23.4, -58.4],
  RO: [45.9, 24.9],
  RU: [61.5, 105.3],
  SA: [23.9, 45.1],
  SE: [60.1, 18.6],
  SG: [1.35, 103.8],
  TH: [15.9, 100.9],
  TR: [39.0, 35.2],
  TW: [23.7, 121.0],
  UA: [48.4, 31.2],
  US: [39.8, -98.6],
  UY: [-32.5, -55.8],
  VE: [6.4, -66.6],
  VN: [14.1, 108.3],
  ZA: [-30.6, 22.9],
};

/** Ciudades que ya aparecen en el historial. Clave: PAIS|ciudad sin acentos. */
const CITY_COORDS: Record<string, [number, number]> = {
  "US|ashburn": [39.04, -77.49],
  "US|council bluffs": [41.26, -95.86],
  "US|new york city": [40.71, -74.01],
  "US|phoenix": [33.45, -112.07],
  "US|moses lake": [47.13, -119.28],
  "CN|taiyuan": [37.87, 112.55],
  "UY|montevideo": [-34.9, -56.16],
  "DE|nuremberg": [49.45, 11.08],
  "DE|berlin": [52.52, 13.41],
  "PY|asuncion": [-25.26, -57.58],
  "AR|rosario": [-32.94, -60.65],
  "KR|seoul": [37.57, 126.98],
  "SG|singapore": [1.35, 103.82],
  "NL|amsterdam": [52.37, 4.9],
  "DK|copenhagen": [55.68, 12.57],
  "EC|guayaquil": [-2.19, -79.89],
  "BR|americana": [-22.74, -47.33],
  "IL|netanya": [32.32, 34.85],
  "IN|new delhi": [28.61, 77.21],
};

/** Grados de separación cuando varios usuarios caen en el mismo país. */
const COUNTRY_SPREAD: Record<string, number> = {
  US: 0.85,
  CA: 0.9,
  BR: 0.7,
  AR: 0.55,
  CN: 0.7,
  RU: 1.0,
  AU: 0.7,
  MX: 0.35,
  DE: 0.22,
  FR: 0.22,
  ES: 0.22,
  PY: 0.2,
  UY: 0.15,
  CL: 0.28,
  CO: 0.22,
  SG: 0.045,
  HK: 0.04,
  NL: 0.1,
  DK: 0.12,
  IL: 0.08,
  KR: 0.16,
  LV: 0.12,
};

function fold(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cityLookupKey(countryCode: string, city: string): string {
  return `${countryCode}|${fold(city)}`;
}

function spread(base: [number, number], index: number, cityKnown: boolean, countryCode: string): [number, number] {
  if (index <= 0) return base;
  const angle = index * 2.399963229728653;
  const step = cityKnown ? 0.028 : (COUNTRY_SPREAD[countryCode] ?? 0.28);
  const radius = step * Math.sqrt(index);
  const lat = Math.max(-80, Math.min(80, base[0] + radius * Math.sin(angle)));
  const cos = Math.max(0.25, Math.cos((base[0] * Math.PI) / 180));
  let lng = base[1] + (radius * Math.cos(angle)) / cos;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return [lat, lng];
}

export type PresenceMapRow = {
  visitorId: string;
  clientIp: string;
  countryCode: string;
  city: string;
};

/**
 * Separa apenas los puntos que caen en la misma coordenada para que cada IP se pueda ver.
 * El desplazamiento es de alrededor de 1 km, así siguen en la ciudad de la señal.
 */
export function nudgeSharedCoordinates<T extends { lat: number; lng: number; clientIp: string; visitorId: string }>(
  rows: T[]
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.lat.toFixed(3)}|${row.lng.toFixed(3)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: T[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (a.clientIp || a.visitorId).localeCompare(b.clientIp || b.visitorId));
    list.forEach((row, index) => {
      if (index === 0) {
        out.push(row);
        return;
      }
      const angle = index * 2.399963229728653;
      const radius = 0.012 * Math.sqrt(index);
      const lat = Math.max(-80, Math.min(80, row.lat + radius * Math.sin(angle)));
      const cos = Math.max(0.25, Math.cos((row.lat * Math.PI) / 180));
      let lng = row.lng + (radius * Math.cos(angle)) / cos;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      out.push({ ...row, lat, lng });
    });
  }
  return out;
}

/** Respaldo si una IP no tiene coordenadas de la señal. La ciudad manda; si no hay ciudad, el país. */
export function assignPresenceCoordinates<T extends PresenceMapRow>(rows: T[]): Array<T & { lat: number; lng: number }> {
  const groups = new Map<string, { base: [number, number]; cityKnown: boolean; countryCode: string; rows: T[] }>();
  for (const row of rows) {
    const cc = String(row.countryCode || "").trim().toUpperCase();
    const city = String(row.city || "").trim();
    const cityBase = city ? CITY_COORDS[cityLookupKey(cc, city)] : undefined;
    const key = cityBase ? `city:${cityLookupKey(cc, city)}` : `cc:${cc || "UN"}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        base: cityBase ?? COUNTRY_CENTROIDS[cc] ?? [20, 12],
        cityKnown: Boolean(cityBase),
        countryCode: cc,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  const out: Array<T & { lat: number; lng: number }> = [];
  for (const group of groups.values()) {
    group.rows.sort((a, b) => (a.clientIp || a.visitorId).localeCompare(b.clientIp || b.visitorId));
    group.rows.forEach((row, index) => {
      const [lat, lng] = spread(group.base, index, group.cityKnown, group.countryCode);
      out.push({ ...row, lat, lng });
    });
  }
  return out;
}
