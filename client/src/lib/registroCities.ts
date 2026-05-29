/** Ciudades por país (ISO2) vía country-state-city, con carga lazy y caché en memoria. */

type CityModule = typeof import("country-state-city");

let loadPromise: Promise<CityModule> | null = null;
const cache = new Map<string, string[]>();

function loadCityModule(): Promise<CityModule> {
  loadPromise ??= import("country-state-city");
  return loadPromise;
}

function normalizeCountryId(countryId: string): string {
  return countryId.trim().toUpperCase();
}

/** Todas las ciudades del país, ordenadas alfabéticamente (locale es). */
export async function getCitiesForCountry(countryId: string): Promise<string[]> {
  const id = normalizeCountryId(countryId);
  if (!id) return [];

  const cached = cache.get(id);
  if (cached) return cached;

  const mod = await loadCityModule();
  const rows = mod.City.getCitiesOfCountry(id) ?? [];
  const names = [
    ...new Set(rows.map((c) => c.name.trim()).filter((name) => name.length > 0)),
  ].sort((a, b) => a.localeCompare(b, "es"));

  cache.set(id, names);
  return names;
}
