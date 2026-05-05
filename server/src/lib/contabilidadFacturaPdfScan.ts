/**
 * Heurísticas sobre texto plano extraído de un PDF (sin OCR).
 * Cubre e-facturas y comprobantes bancarios con texto (ej. transferencia BROU a otros bancos).
 * Resultados siempre revisables en el formulario.
 */

export type ProveedorLite = {
  id: number;
  supplierName: string;
  ruc: string;
};

export type ContabilidadFacturaScanDraft = {
  fecha: string | null;
  numeroFactura: string | null;
  descripcion: string | null;
  monto: number | null;
  moneda: "UYU" | "USD" | "PYG" | null;
  proveedorId: number | null;
  mesServicio: string | null;
  presupuestoMes: string | null;
  observaciones: string | null;
};

/** Para la UI: mismo campo `numero_factura`, distinta etiqueta (factura CFE vs comprobante BROU / transferencia). */
export type ContabilidadPdfDocumentKind = "factura" | "transferencia_brou";

export type ContabilidadFacturaScanResult = {
  draft: ContabilidadFacturaScanDraft;
  detected: string[];
  warnings: string[];
  textLength: number;
  documentKind: ContabilidadPdfDocumentKind;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeRutUyLoose(raw: string): string {
  return String(raw ?? "")
    .replace(/\./g, "")
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .toUpperCase();
}

function findRutsInText(text: string): string[] {
  const out = new Set<string>();
  const re1 = /\b(\d{1,2}\.\d{3}\.\d{3}[-\s]?[\dKk])\b/g;
  for (const m of text.matchAll(re1)) {
    const n = normalizeRutUyLoose(m[1] ?? "");
    if (n.length >= 8) out.add(n);
  }
  const re2 = /\b(\d{8}[-\s]?[\dKk])\b/g;
  for (const m of text.matchAll(re2)) {
    const n = normalizeRutUyLoose(m[1] ?? "");
    if (n.length >= 8) out.add(n);
  }
  return [...out];
}

function matchProveedorByRut(text: string, proveedores: ProveedorLite[]): { id: number; supplierName: string } | null {
  const rutsInDoc = new Set(findRutsInText(text).map((r) => normalizeRutUyLoose(r)));
  const flat = stripAccents(text).toUpperCase().replace(/\s/g, "");
  for (const p of proveedores) {
    const nr = normalizeStoredRut(p.ruc);
    if (nr.length < 7) continue;
    if (rutsInDoc.has(nr)) return { id: p.id, supplierName: p.supplierName };
    if (flat.includes(nr)) return { id: p.id, supplierName: p.supplierName };
    const rDots = p.ruc.replace(/\s/g, "");
    if (rDots.length >= 7 && text.includes(rDots)) return { id: p.id, supplierName: p.supplierName };
  }
  return null;
}

function normalizeStoredRut(ruc: string): string {
  return normalizeRutUyLoose(ruc);
}

function scoreSupplierName(text: string, supplierName: string): number {
  const t = stripAccents(text.toLowerCase());
  const name = stripAccents(supplierName.toLowerCase()).trim();
  if (!name) return 0;
  if (t.includes(name)) return name.length + 10;
  const words = name.split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  for (const w of words) {
    if (t.includes(w)) score += w.length;
  }
  return score;
}

/** Referencias / números de operación largos sin decimales (no son importes). */
function looksLikeBankReferenceToken(s: string): boolean {
  const t = s.replace(/\s/g, "").replace(/'/g, "");
  if (!/^\d+$/.test(t)) return false;
  return t.length >= 12;
}

function parseMoneyToken(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(/'/g, "");
  if (!t || !/\d/.test(t)) return null;
  if (looksLikeBankReferenceToken(t)) return null;
  let cleaned = t.replace(/[^\d.,\-]/g, "");
  if (cleaned.startsWith("-")) cleaned = cleaned.slice(1);
  if (!cleaned) return null;
  let numStr = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      numStr = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      numStr = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
      numStr = cleaned.replace(",", ".");
    } else {
      numStr = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
      numStr = cleaned;
    } else {
      numStr = cleaned.replace(/\./g, "");
    }
  }
  const n = Number.parseFloat(numStr);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function collectDates(raw: string): { iso: string; score: number }[] {
  const dateCandidates: { iso: string; score: number }[] = [];
  const reDMY = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g;
  for (const m of raw.matchAll(reDMY)) {
    const d = Number.parseInt(m[1]!, 10);
    const mo = Number.parseInt(m[2]!, 10);
    const y = Number.parseInt(m[3]!, 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) continue;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) continue;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const idx = typeof m.index === "number" ? m.index : 0;
    const ctx = raw.slice(Math.max(0, idx - 40), idx + 40).toLowerCase();
    let score = 1;
    if (/fecha|emis|venc|comprob/.test(ctx)) score += 5;
    if (/fecha\s*:|fecha\s+de\s+emis/.test(ctx)) score += 8;
    dateCandidates.push({ iso, score });
  }
  const reYMD = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
  for (const m of raw.matchAll(reYMD)) {
    const y = Number.parseInt(m[1]!, 10);
    const mo = Number.parseInt(m[2]!, 10);
    const d = Number.parseInt(m[3]!, 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) continue;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) continue;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const idxY = typeof m.index === "number" ? m.index : 0;
    const ctx = raw.slice(Math.max(0, idxY - 40), idxY + 40).toLowerCase();
    let score = 2;
    if (/fecha|emis|venc/.test(ctx)) score += 5;
    dateCandidates.push({ iso, score });
  }
  return dateCandidates;
}

/** Comprobante BROU / transferencia a otros bancos (no CFE). */
function detectBrouTransferContext(raw: string): boolean {
  const u = stripAccents(raw).toLowerCase();
  const brouish =
    /\bbrou\b/.test(u) ||
    /banco\s+republica/.test(u) ||
    /banco\s+rep[úu]blica/.test(u) ||
    /republica\s+oriental/.test(u) ||
    /rep[úu]blica\s+oriental/.test(u);
  const transferish =
    /transferencia/.test(u) ||
    /otros\s+bancos/.test(u) ||
    /comprobante\s+de\s+operaci/.test(u);
  const acreditar = /importe\s+a\s+acreditar/.test(u);
  return (brouish && transferish) || (acreditar && transferish) || (brouish && acreditar);
}

type LabeledAmountHit = { amount: number; forceUsd?: boolean; label: string };

function tryLabeledAmountPatterns(raw: string): LabeledAmountHit | null {
  const normalized = raw.replace(/\r/g, "\n");
  /**
   * BROU suele imprimir «Importe a acreditar : U$S 50,75» (coma decimal).
   * Prioridad sobre líneas genéricas «Total» que pueden ser comisiones o equivalentes en pesos.
   */
  const patterns: Array<{ label: string; re: RegExp; forceUsd?: boolean }> = [
    {
      label: "importe_a_acreditar",
      re: /(?:importe\s+a\s+acreditar|importe\s+acreditar)\s*[:.]?\s*(?:(?:U\$\s*S|U\$S|US\$)\s*)?([\d][\d.,']*)/i,
      forceUsd: true,
    },
    {
      label: "importe_a_acreditar_monto_antes_usd",
      re: /(?:importe\s+a\s+acreditar|importe\s+acreditar)\s*[:.]?\s*([\d][\d.,']*)\s*(?:U\$\s*S|U\$S|US\$)/i,
      forceUsd: true,
    },
    {
      label: "importe_a_acreditar_u$s_tras_etiqueta",
      re: /(?:importe\s+a\s+acreditar|importe\s+acreditar)\s*[:.]?[^\d\n]{0,40}?(?:U\$\s*S|U\$S|US\$)\s*([\d][\d.,']*)/i,
      forceUsd: true,
    },
    {
      label: "importe_operacion",
      re: /importe\s+(?:de\s+la\s+)?operaci[oó]n\s*[:.]?\s*(?:(?:U\$\s*S|U\$S|US\$|\$)\s*)?([\d][\d.,']*)/i,
    },
    {
      label: "importe_enviado_debitado",
      re: /importe\s+(?:enviado|transferido|a\s+debitar)\s*[:.]?\s*(?:(?:U\$\s*S|U\$S|US\$|\$)\s*)?([\d][\d.,']*)/i,
    },
  ];
  for (const { label, re, forceUsd } of patterns) {
    const m = normalized.match(re);
    if (!m?.[1]) continue;
    const amount = parseMoneyToken(m[1]);
    if (amount != null && amount > 0 && amount < 1e9) {
      return { amount, forceUsd, label };
    }
  }
  return null;
}

function extractComprobanteOperacionRef(raw: string): string | null {
  const patterns = [
    /(?:comprobante|n[°º]?\s*(?:de\s+)?operaci[oó]n|referencia\s+operaci[oó]n)\s*[:.#]?\s*([\d][\d\-\s]{6,40}\d)/i,
    /\boperaci[oó]n\s+n[°º]\s*[:.]?\s*([\d][\d\-\s]{6,40}\d)/i,
    /(?:n[°º]\s*operaci[oó]n|operaci[oó]n)\s*[:.#]?\s*(\d{10,24})\b/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const ref = m[1].replace(/\s+/g, "").replace(/-/g, "").slice(0, 120);
      if (ref.length >= 8 && ref.length <= 40) return ref;
    }
  }
  return null;
}

/**
 * Descripción para comprobantes de transferencia (sin maestro de proveedores).
 * Regla de negocio: transferencia BROU hacia NETUY → texto fijo del servicio en contabilidad.
 */
function buildTransferenciaDescripcion(raw: string): string | null {
  if (/\bNETUY\b/i.test(raw)) {
    return "Hosting Web";
  }

  const parts: string[] = [];
  if (/hosting\s+web/i.test(raw)) {
    parts.push("Hosting Web");
  } else {
    const concepto = raw.match(/concepto\s*[:.]?\s*([^\n]{2,100})/i);
    const c = concepto?.[1]?.trim();
    const soloImporteOReferencia =
      /^[\d\s.,$'/-]+$/i.test(c ?? "") || /^(?:U\$\s*S|U\$S|US\$|\$)\s*[\d.,']+$/i.test(c ?? "");
    if (c && !soloImporteOReferencia) parts.push(c.slice(0, 80));
  }
  const beneficiario = raw.match(
    /(?:beneficiario|acreditaci[oó]n\s+en|titular\s+cuenta\s+destino|nombre)\s*[:.]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .,&-]{3,80})/i
  );
  const ben = beneficiario?.[1]?.trim();
  if (ben && !parts.length && !/^[\d\s.,$'/-]+$/i.test(ben)) {
    parts.push(ben.slice(0, 80));
  }
  if (parts.length === 0) return null;
  return `${parts.join(" — ")} (transferencia / comprobante bancario, no factura CFE)`;
}

export function extractDraftFromFacturaText(text: string, proveedores: ProveedorLite[]): ContabilidadFacturaScanResult {
  const warnings: string[] = [];
  const detected: string[] = [];
  const raw = String(text ?? "").replace(/\r\n/g, "\n");
  const textLength = raw.length;

  if (textLength < 40) {
    warnings.push(
      "Poco texto en el PDF. Si es solo imagen (escaneo), hace falta OCR o cargar los datos a mano. Las e-facturas con texto suelen funcionar mejor."
    );
  }

  const isBrouTransfer = detectBrouTransferContext(raw);
  if (isBrouTransfer) {
    warnings.push(
      "Parece un comprobante de transferencia bancaria (BROU / otros bancos), no una factura electrónica. Los importes se tomaron de etiquetas tipo «Importe a acreditar» cuando fue posible."
    );
  }

  const labeledHit = tryLabeledAmountPatterns(raw);
  /** USD solo si la etiqueta de importe lo indica o «Importe a acreditar» va con U$S en la misma ventana de texto. */
  const importeAcreditarConDolares =
    /importe\s+a\s+acreditar\s*[:.]?[\s\S]{0,120}?(?:U\$\s*S|U\$S)/i.test(raw) || Boolean(labeledHit?.forceUsd);

  let moneda: "UYU" | "USD" | "PYG" | null = null;
  if (importeAcreditarConDolares) {
    moneda = "USD";
    detected.push("moneda");
  } else if (/\bU\$S\b|\bUSD\b|\bD[ÓO]LAR/i.test(raw)) {
    moneda = "USD";
    detected.push("moneda");
  } else if (/\bGS\b|\bPYG\b|\bGUARAN/i.test(raw.toUpperCase())) {
    moneda = "PYG";
    detected.push("moneda");
  } else {
    moneda = "UYU";
    detected.push("moneda");
  }

  const dateCandidates = collectDates(raw);
  dateCandidates.sort((a, b) => b.score - a.score);
  let fecha: string | null = null;
  if (dateCandidates.length > 0) {
    fecha = dateCandidates[0]!.iso;
    detected.push("fecha");
  }

  let numeroFactura: string | null = null;
  if (isBrouTransfer) {
    const cref = extractComprobanteOperacionRef(raw);
    if (cref) {
      numeroFactura = cref;
      detected.push("numeroFactura");
    }
  }
  if (!numeroFactura) {
    const numRe =
      /(?:factura|cfe|e-?\s*factura)\s*(?:n[°º]?|nro\.?|no\.?|#)?\s*[:\.]?\s*([A-Z]?\s*[\d]{0,3}[\-]?\d{3,}[\-/]?\d*)/i;
    const numM = raw.match(numRe);
    if (numM?.[1]) {
      numeroFactura = numM[1].replace(/\s+/g, " ").trim().slice(0, 120);
      if (numeroFactura) detected.push("numeroFactura");
    }
  }
  if (!numeroFactura) {
    const ser = raw.match(/\bserie\s*[:\s]+([A-Za-z0-9\-\/]{3,40})\b/i);
    if (ser?.[1]) {
      numeroFactura = ser[1].trim().slice(0, 120);
      detected.push("numeroFactura");
    }
  }

  let monto: number | null = null;
  if (labeledHit) {
    monto = labeledHit.amount;
    detected.push("monto");
  }

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const totalVals: number[] = [];
  if (monto == null) {
    for (const line of lines) {
      if (!/\d/.test(line)) continue;
      if (!/total|importe\s+total|total\s+a\s+pagar|monto\s+total|importe\s+final/i.test(line)) continue;
      const nums = [...line.matchAll(/([\d][\d.,']*[\d.,']*)/g)]
        .map((x) => parseMoneyToken(x[1]!))
        .filter((n): n is number => n != null && n >= 0.01);
      for (const val of nums) totalVals.push(val);
    }
  }

  if (monto == null && totalVals.length > 0) {
    monto = Math.max(...totalVals);
    detected.push("monto");
  }
  if (monto == null) {
    const allNums: number[] = [];
    for (const m of raw.matchAll(/(?:^|[^\d])(\d{1,3}(?:[.\']\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)(?:[^\d]|$)/g)) {
      const v = parseMoneyToken(m[1]!);
      if (v != null && v > 0.01 && v < 1e9) allNums.push(v);
    }
    if (allNums.length > 0) {
      monto = Math.max(...allNums);
      warnings.push(
        "No se encontró una línea clara «Total» ni «Importe a acreditar»; se tomó el mayor importe numérico razonable del texto. Verificá el monto y la moneda."
      );
      detected.push("monto");
    }
  }

  let proveedorId: number | null = null;
  let matchedName: string | null = null;
  const byRut = matchProveedorByRut(raw, proveedores);
  if (byRut) {
    proveedorId = byRut.id;
    matchedName = byRut.supplierName;
    detected.push("proveedorId");
  } else {
    let best: { id: number; score: number; name: string } | null = null;
    const head = raw.slice(0, 4500);
    for (const p of proveedores) {
      const sc = scoreSupplierName(head, p.supplierName);
      if (sc > 0 && (!best || sc > best.score)) best = { id: p.id, score: sc, name: p.supplierName };
    }
    if (best && best.score >= 6) {
      proveedorId = best.id;
      matchedName = best.name;
      detected.push("proveedorId");
    } else if (best && best.score >= 3) {
      warnings.push(`Posible proveedor «${best.name}» (coincidencia débil); elegí el proveedor manualmente si no coincide.`);
    }
  }

  const mesServicio = fecha ? fecha.slice(0, 7) : null;
  const presupuestoMes = fecha ? fecha.slice(0, 7) : null;
  if (mesServicio) {
    detected.push("mesServicio");
    detected.push("presupuestoMes");
  }

  let descripcion: string | null = null;
  const transferDescContext =
    isBrouTransfer ||
    (/transferencia/i.test(raw) && (/brou|rep[úu]blica\s+oriental|otros\s+bancos|importe\s+a\s+acreditar/i.test(stripAccents(raw).toLowerCase())));
  const documentKind: ContabilidadPdfDocumentKind = transferDescContext ? "transferencia_brou" : "factura";
  const transferDesc = transferDescContext ? buildTransferenciaDescripcion(raw) : null;
  if (transferDesc) {
    descripcion = transferDesc;
    detected.push("descripcion");
  } else if (matchedName && numeroFactura) {
    descripcion = `${matchedName} — Factura ${numeroFactura}`;
    detected.push("descripcion");
  } else if (matchedName) {
    descripcion = `${matchedName} — Gasto`;
    detected.push("descripcion");
  } else if (numeroFactura) {
    descripcion = `Factura ${numeroFactura}`;
    detected.push("descripcion");
  }

  const observaciones =
    "Autocompletado desde PDF; revisar importe, moneda, tipo de cambio y proveedor antes de guardar." +
    (isBrouTransfer ? " Comprobante de transferencia, no factura." : "");

  if (!fecha && !numeroFactura && monto == null) {
    warnings.push("No se pudieron inferir fecha, número ni monto. Completá el formulario manualmente.");
  }

  return {
    draft: {
      fecha,
      numeroFactura,
      descripcion,
      monto,
      moneda,
      proveedorId,
      mesServicio,
      presupuestoMes,
      observaciones,
    },
    detected,
    warnings,
    textLength,
    documentKind,
  };
}
