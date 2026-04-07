/**
 * Extrae deltas legibles para UI de auditoría (contable / operativa) desde `details_json`.
 */
export type AuditDeltaRow = { label: string; before: string; after: string };

export function parseAuditDetailsForUi(detailsJson: string | null | undefined): {
  deltas: AuditDeltaRow[];
  flags: string[];
} {
  if (!detailsJson?.trim()) return { deltas: [], flags: [] };
  try {
    const d = JSON.parse(detailsJson) as Record<string, unknown>;
    const deltas: AuditDeltaRow[] = [];
    const flags: string[] = [];

    const pushPair = (label: string, antes: unknown, despues: unknown) => {
      if (antes === undefined && despues === undefined) return;
      deltas.push({ label, before: String(antes ?? "—"), after: String(despues ?? "—") });
    };

    const obj = (x: unknown): Record<string, unknown> | null =>
      x != null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

    const pUsd = obj(d.precioUSD);
    if (pUsd && "antes" in pUsd && "despues" in pUsd) {
      pushPair("Precio listado (USD)", pUsd.antes, pUsd.despues);
    }

    const tv = obj(d.tiendaVisible);
    if (tv && "antes" in tv && "despues" in tv) {
      pushPair("Publicación en tienda", tv.antes === true ? "Sí" : tv.antes === false ? "No" : String(tv.antes), tv.despues === true ? "Sí" : tv.despues === false ? "No" : String(tv.despues));
    }

    for (const key of ["marca", "modelo", "procesador"] as const) {
      const v = obj(d[key]);
      if (v && "antes" in v && "despues" in v) {
        pushPair(key === "marca" ? "Marca" : key === "modelo" ? "Modelo" : "Procesador", v.antes, v.despues);
      }
    }

    if (d.marketplace && typeof d.marketplace === "object") {
      flags.push("Vitrina / ficha tienda (imagen, galería, textos o orden) modificada");
    }
    if (d.observaciones === true) {
      flags.push("Observaciones internas actualizadas");
    }
    if (d.sinCambiosRelevantes === true) {
      flags.push("Guardado sin cambios detectados en campos auditados");
    }

    if (typeof d.precioUSD === "number") {
      pushPair("Precio inicial (USD)", "—", d.precioUSD);
    }
    if (typeof d.marketplaceVisible === "boolean") {
      pushPair("Tienda al alta", "—", d.marketplaceVisible ? "Publicado" : "No publicado");
    }
    if (typeof d.filas === "number") {
      pushPair("Filas importadas", "—", d.filas);
    }
    if (typeof d.url === "string") {
      pushPair("Archivo / URL imagen", "—", d.url);
    }

    return { deltas, flags };
  } catch {
    return { deltas: [], flags: [] };
  }
}
