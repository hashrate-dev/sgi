export type CatalogItem = {
  name: string;
  description?: string;
  algo?: string | null;
  image?: string | null;
  priceUsd?: number;
  [key: string]: unknown;
};

/** Normaliza rutas de medios relativas para la vitrina. */
export function mapCatalogMediaPaths<T extends CatalogItem>(item: T): T {
  const img = item.image;
  if (img == null || String(img).trim() === "") return item;
  const s = String(img);
  if (/^https?:\/\//i.test(s)) return item;
  const path = s.startsWith("/") ? s : `/${s}`;
  return { ...item, image: path };
}
