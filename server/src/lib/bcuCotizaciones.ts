/**
 * Cotizaciones públicas del Banco Central del Uruguay (SOAP).
 * https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones
 */

const BCU_URL = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";
const BCU_ULTIMO_CIERRE_URL = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsultimocierre";

/** Códigos BCU (billete / local) usados en contabilidad. */
export const BCU_MONEDA_CODIGO = {
  USD: 2225,
  EUR: 1111,
  BRL: 1001,
  ARS: 501, // Peso arg. billete
} as const;

export type BcuCotizacionDato = {
  fecha: string;
  moneda: number;
  nombre: string;
  codigoIso: string;
  tcc: number;
  tcv: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseIsoDateUtc(iso: string): Date | null {
  const t = String(iso ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function xmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

function xmlTagAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) != null) {
    if (m[1] != null) out.push(m[1].trim());
  }
  return out;
}

function parseNum(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function postSoap(url: string, body: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`BCU HTTP ${res.status}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function bcuUltimoCierre(): Promise<string> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:wsultimocierre.Execute/>
  </soapenv:Body>
</soapenv:Envelope>`;
  const text = await postSoap(BCU_ULTIMO_CIERRE_URL, xml);
  const fecha = xmlTag(text, "Fecha") ?? xmlTag(text, "fecha");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    throw new Error("BCU_ULTIMO_CIERRE");
  }
  return fecha.slice(0, 10);
}

export async function bcuCotizacionesRango(opts: {
  monedaCodigo: number;
  desde: string;
  hasta: string;
}): Promise<BcuCotizacionDato[]> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>
        <cot:Moneda><cot:item>${opts.monedaCodigo}</cot:item></cot:Moneda>
        <cot:FechaDesde>${opts.desde}</cot:FechaDesde>
        <cot:FechaHasta>${opts.hasta}</cot:FechaHasta>
        <cot:Grupo>0</cot:Grupo>
      </cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
  const text = await postSoap(BCU_URL, xml);
  const codigoError = xmlTag(text, "codigoerror");
  if (codigoError && codigoError !== "0") {
    if (codigoError === "100") return [];
    throw new Error(`BCU_ERROR_${codigoError}`);
  }

  const blocks =
    text.match(/<(?:\w+:)?datoscotizaciones\.dato\b[^>]*>[\s\S]*?<\/(?:\w+:)?datoscotizaciones\.dato>/gi) ?? [];
  const out: BcuCotizacionDato[] = [];
  for (const block of blocks) {
    const fecha = (xmlTag(block, "Fecha") ?? "").slice(0, 10);
    const moneda = parseNum(xmlTag(block, "Moneda"));
    const tcc = parseNum(xmlTag(block, "TCC"));
    const tcv = parseNum(xmlTag(block, "TCV"));
    if (!fecha || moneda == null || tcc == null || tcv == null) continue;
    out.push({
      fecha,
      moneda,
      nombre: xmlTag(block, "Nombre") ?? "",
      codigoIso: xmlTag(block, "CodigoISO") ?? "",
      tcc,
      tcv,
    });
  }
  /* Fallback si el match de bloques falló: listas paralelas (menos robusto). */
  if (out.length === 0) {
    const fechas = xmlTagAll(text, "Fecha");
    const tccs = xmlTagAll(text, "TCC");
    const tcvs = xmlTagAll(text, "TCV");
    for (let i = 0; i < fechas.length; i++) {
      const tcc = parseNum(tccs[i]);
      const tcv = parseNum(tcvs[i]);
      if (tcc == null || tcv == null) continue;
      out.push({
        fecha: fechas[i]!.slice(0, 10),
        moneda: opts.monedaCodigo,
        nombre: "",
        codigoIso: "",
        tcc,
        tcv,
      });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Última cotización BCU en o antes de `fechaIso` (fin de semana / feriado → día hábil previo).
 * Mira hasta ~21 días atrás; si la fecha es futura, usa último cierre.
 */
export async function bcuCotizacionHastaFecha(
  monedaCodigo: number,
  fechaIso: string
): Promise<BcuCotizacionDato | null> {
  let hasta = fechaIso;
  const target = parseIsoDateUtc(fechaIso);
  if (!target) throw new Error("FECHA_INVALIDA");

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (target.getTime() > todayUtc) {
    hasta = await bcuUltimoCierre();
  }

  const hastaDt = parseIsoDateUtc(hasta);
  if (!hastaDt) throw new Error("FECHA_INVALIDA");
  const desdeDt = addDaysUtc(hastaDt, -21);
  const rows = await bcuCotizacionesRango({
    monedaCodigo,
    desde: toIsoDate(desdeDt),
    hasta,
  });
  const eligible = rows.filter((r) => r.fecha <= hasta);
  if (eligible.length === 0) return null;
  return eligible[eligible.length - 1]!;
}

export type ContabilidadTipoCambioResult = {
  moneda: string;
  fechaSolicitada: string;
  fechaCotizacion: string;
  /** Unidades de la moneda de operación por 1 USD (para dividir monto → USD). */
  tipoCambio: number;
  fuente: "BCU" | "YAHOO_USDPYG" | "DOLARPY_BCP";
  detalle: string;
};

/**
 * Tipo de cambio para el formulario de gastos: moneda local por 1 USD.
 * UYU: cotización directa del dólar billete BCU.
 * EUR/BRL/ARS: (UYU/USD) / (UYU/moneda) vía BCU.
 * PYG: par USD/PYG de mercado (mismo cruce que Investing.com) + fallback BCP.
 */
export async function resolveContabilidadTipoCambio(
  moneda: string,
  fechaIso: string
): Promise<ContabilidadTipoCambioResult> {
  const m = String(moneda ?? "")
    .trim()
    .toUpperCase();
  if (m === "USD") {
    throw new Error("USD_SIN_TC");
  }
  if (m === "PYG") {
    const { resolvePygTipoCambio } = await import("./pygTipoCambio.js");
    return resolvePygTipoCambio(fechaIso);
  }

  const usd = await bcuCotizacionHastaFecha(BCU_MONEDA_CODIGO.USD, fechaIso);
  if (!usd || !(usd.tcv > 0)) {
    throw new Error("BCU_SIN_DATO");
  }
  const usdRate = usd.tcv; // UYU por USD

  if (m === "UYU") {
    return {
      moneda: "UYU",
      fechaSolicitada: fechaIso,
      fechaCotizacion: usd.fecha,
      tipoCambio: usdRate,
      fuente: "BCU",
      detalle: `Dólar USA billete BCU (${usd.fecha}): ${usdRate} UYU/USD`,
    };
  }

  const code =
    m === "EUR"
      ? BCU_MONEDA_CODIGO.EUR
      : m === "BRL"
        ? BCU_MONEDA_CODIGO.BRL
        : m === "ARS"
          ? BCU_MONEDA_CODIGO.ARS
          : null;
  if (code == null) throw new Error("MONEDA_NO_SOPORTADA");

  const fx = await bcuCotizacionHastaFecha(code, fechaIso);
  if (!fx || !(fx.tcv > 0)) {
    throw new Error("BCU_SIN_DATO");
  }
  // UYU por unidad de moneda extranjera → unidades de esa moneda por USD
  const perUsd = usdRate / fx.tcv;
  if (!(perUsd > 0) || !Number.isFinite(perUsd)) {
    throw new Error("BCU_SIN_DATO");
  }
  return {
    moneda: m,
    fechaSolicitada: fechaIso,
    fechaCotizacion: fx.fecha,
    tipoCambio: Math.round(perUsd * 1e6) / 1e6,
    fuente: "BCU",
    detalle: `BCU ${fx.nombre || m} (${fx.fecha}): ${perUsd.toFixed(6)} ${m}/USD`,
  };
}
