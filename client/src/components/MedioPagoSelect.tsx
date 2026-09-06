import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  CONTABILIDAD_MEDIOS_PAGO,
  createContabilidadMedioPago,
  deleteContabilidadMedioPago,
  getContabilidadMediosPago,
  updateContabilidadMedioPago,
  uploadContabilidadMedioPagoLogo,
  type ContabilidadMedioPago,
  type ContabilidadMedioPagoCatalogItem,
  type ContabilidadMedioPagoClase,
} from "../lib/api";
import usdEfectivoUsaImg from "../assets/medio-pago/usd-efectivo-usa.svg?url";
import brouMarkImg from "../assets/medio-pago/brou-mark.png?url";
import itauMarkImg from "../assets/medio-pago/itau-mark.svg?url";
import bbvaMarkImg from "../assets/medio-pago/bbva-mark.svg?url";
import scotiabankMarkImg from "../assets/medio-pago/scotiabank-mark.svg?url";
import uenoMarkImg from "../assets/medio-pago/ueno-mark.svg?url";
import pesosUyImg from "../assets/medio-pago/pesos-uruguayos.svg?url";
import pesosArImg from "../assets/medio-pago/pesos-argentinos.svg?url";
import realesBrImg from "../assets/medio-pago/reales-brasil.svg?url";
import gsPyImg from "../assets/medio-pago/gs-paraguay.svg?url";

const ICON_BOX = "0 0 24 24";
const MEDIOS_PAGO_ADMIN_EMAIL = "jv@hashrate.space";

/** Cache de logos del catálogo (para iconos fuera del select). */
const medioPagoLogoCache = new Map<string, string>();

export function rememberMedioPagoLogos(items: ReadonlyArray<{ codigo: string; logoUrl?: string | null }>): void {
  for (const it of items) {
    const code = String(it.codigo ?? "").trim();
    const url = String(it.logoUrl ?? "").trim();
    if (!code) continue;
    if (url) medioPagoLogoCache.set(code, url);
    else medioPagoLogoCache.delete(code);
  }
}

function MedioPagoMarkImg({ src }: { src: string }) {
  return (
    <img
      src={src}
      width={22}
      height={22}
      alt=""
      draggable={false}
      className="contabilidad-medio-pago-ico-img flex-shrink-0"
    />
  );
}

type MedioPagoCountry = "UY" | "PY" | "BR" | "AR" | "US";

/** País del medio (para bandera a la derecha). INTERFISA → PY; también UY/PY en el código. */
function resolveMedioPagoCountry(code: string): MedioPagoCountry | null {
  const t = String(code ?? "")
    .trim()
    .toUpperCase();
  if (!t) return null;
  if (t.includes("INTERFISA")) return "PY";
  if (/\bPY\b/.test(t)) return "PY";
  if (/\bUY\b/.test(t)) return "UY";
  if (t.includes("URUGUAY")) return "UY";
  if (t.includes("BRASIL") || /\bREALES\b/.test(t)) return "BR";
  if (t.includes("ARGENTIN")) return "AR";
  if (t === "GS EFECTIVO" || t === "GS CONTADO" || t.startsWith("GS ")) return "PY";
  if (t === "USD EFECTIVO" || t === "USD CONTADO") return "US";
  return null;
}

const COUNTRY_FLAG_SRC: Record<MedioPagoCountry, string> = {
  UY: pesosUyImg,
  PY: gsPyImg,
  BR: realesBrImg,
  AR: pesosArImg,
  US: usdEfectivoUsaImg,
};

const COUNTRY_FLAG_LABEL: Record<MedioPagoCountry, string> = {
  UY: "Uruguay",
  PY: "Paraguay",
  BR: "Brasil",
  AR: "Argentina",
  US: "Estados Unidos",
};

function MedioPagoCountryFlag({ code }: { code: string }) {
  const country = resolveMedioPagoCountry(code);
  if (!country) return null;
  return (
    <img
      src={COUNTRY_FLAG_SRC[country]}
      width={20}
      height={20}
      alt=""
      title={COUNTRY_FLAG_LABEL[country]}
      draggable={false}
      className="contabilidad-medio-pago-country-flag flex-shrink-0"
      aria-hidden
    />
  );
}

type MedioPagoClase = ContabilidadMedioPagoClase;

function inferMedioPagoClase(code: string): MedioPagoClase {
  const t = String(code ?? "")
    .trim()
    .toUpperCase();
  if (/\bUSDT\b|\bUSDC\b|\bBINANCE\b|\bCRIPTO\b|\bCRYPTO\b|\bBTC\b|\bETH\b/.test(t)) {
    return "CRIPTO";
  }
  return "FIAT";
}

function resolveMedioPagoClase(item: { codigo: string; clase?: string | null }): MedioPagoClase {
  const raw = String(item.clase ?? "")
    .trim()
    .toUpperCase();
  if (raw === "CRIPTO" || raw === "CRYPTO") return "CRIPTO";
  if (raw === "FIAT") return "FIAT";
  return inferMedioPagoClase(item.codigo);
}

function MedioPagoClaseLabel({
  item,
  canEdit,
  busy,
  onToggle,
}: {
  item: ContabilidadMedioPagoCatalogItem;
  canEdit?: boolean;
  busy?: boolean;
  onToggle?: () => void;
}) {
  const clase = resolveMedioPagoClase(item);
  if (canEdit && onToggle) {
    return (
      <button
        type="button"
        className="contabilidad-medio-pago-clase-label contabilidad-medio-pago-clase-label--btn"
        title="Cambiar FIAT / CRIPTO"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {clase}
      </button>
    );
  }
  return <span className="contabilidad-medio-pago-clase-label">{clase}</span>;
}

const SANTANDER_FLAME_PATH =
  "M 31.5,19.5 C 31.4,18 31,16.5 30.2,15.2 L 23.4,3.3 C 22.9,2.4 22.5,1.4 22.3,0.4 L 22,0.9 c -1.7,2.9 -1.7,6.6 0,9.5 l 5.5,9.5 c 1.7,2.9 1.7,6.6 0,9.5 l -0.3,0.5 c -0.2,-1 -0.6,-2 -1.1,-2.9 l -5,-8.7 -3.2,-5.6 C 17.4,11.8 17,10.8 16.8,9.8 l -0.3,0.5 c -1.7,2.9 -1.7,6.5 0,9.5 v 0 l 5.5,9.5 c 1.7,2.9 1.7,6.6 0,9.5 l -0.3,0.5 c -0.2,-1 -0.6,-2 -1.1,-2.9 L 13.7,24.5 C 12.8,22.9 12.4,21.1 12.4,19.3 5.1,21.2 0,25.3 0,30 0,36.6 9.8,41.9 21.9,41.9 34,41.9 43.8,36.6 43.8,30 43.9,25.5 38.9,21.4 31.5,19.5 Z";

function BinanceMarkIcon() {
  return (
    <svg
      viewBox="0 0 126.611 126.611"
      width={22}
      height={22}
      aria-hidden
      className="contabilidad-medio-pago-ico flex-shrink-0"
    >
      <polygon fill="#F3BA2F" points="38.171,53.203 62.759,28.616 87.36,53.216 101.667,38.909 62.759,0 23.864,38.896" />
      <rect
        x="3.644"
        y="53.188"
        width="20.233"
        height="20.234"
        fill="#F3BA2F"
        transform="matrix(0.7071 0.7071 -0.7071 0.7071 48.7933 8.8106)"
      />
      <polygon
        fill="#F3BA2F"
        points="38.171,73.408 62.759,97.995 87.359,73.396 101.674,87.695 101.667,87.703 62.759,126.611 23.863,87.716 23.843,87.696"
      />
      <rect
        x="101.64"
        y="53.189"
        width="20.234"
        height="20.233"
        fill="#F3BA2F"
        transform="matrix(-0.7071 0.7071 -0.7071 -0.7071 235.5457 29.0503)"
      />
      <polygon
        fill="#F3BA2F"
        points="77.271,63.298 77.277,63.298 62.759,48.78 52.03,59.509 52.029,59.509 50.797,60.742 48.254,63.285 48.254,63.285 48.234,63.305 48.254,63.326 62.759,77.831 77.277,63.313 77.284,63.305"
      />
    </svg>
  );
}

function BuiltInMedioPagoIcon({ code }: { code: string }) {
  switch (code) {
    case "USD BANCO SANTANDER UY":
      return (
        <svg
          viewBox="-0.5 -0.5 44.5 43"
          width={22}
          height={22}
          aria-hidden
          className="contabilidad-medio-pago-ico flex-shrink-0"
        >
          <path fill="#EA1D25" d={SANTANDER_FLAME_PATH} />
        </svg>
      );
    case "USD BANCO INTERFISA":
      return (
        <svg
          viewBox="0 0 104 65"
          width={22}
          height={22}
          aria-hidden
          className="contabilidad-medio-pago-ico flex-shrink-0"
        >
          <path
            fill="#e95a29"
            d="M39.1638 1.55801C17.4929 4.60001 2.13989 15.485 0.337891 28.942H39.1638V21.885H24.6969C27.2739 17.143 31.9779 13.185 39.1638 11.082V1.55801Z"
          />
          <path
            fill="#e95a29"
            d="M64.0488 63.398C85.7279 60.355 101.081 49.475 102.874 36.018H64.0488V43.073H78.5159C75.9388 47.821 71.2429 51.775 64.0488 53.861V63.398Z"
          />
          <path
            fill="#e95a29"
            d="M103.031 32.478L103.033 32.476C103.788 14.862 81.7379 0.708008 51.6039 0.708008C49.1788 0.708008 46.8109 0.804008 44.4958 0.969009V54.989C28.6929 52.681 22.6119 42.56 22.2839 32.478H0.173828C0.827881 50.386 20.4459 64.252 51.6039 64.252C54.0538 64.252 56.4259 64.156 58.7169 64.003V9.96301C74.2568 12.165 80.9409 21.685 80.9409 31.599C80.9409 32.233 80.9369 32.478 80.9369 32.478H103.031Z"
          />
        </svg>
      );
    case "USD BANCO BROU UY":
      return <MedioPagoMarkImg src={brouMarkImg} />;
    case "USD ITAU UY":
    case "USD BANCO ITAU UY":
    case "USD BANCO ITAU PY":
      return <MedioPagoMarkImg src={itauMarkImg} />;
    case "USD BBVA UY":
      return <MedioPagoMarkImg src={bbvaMarkImg} />;
    case "USD SCOTIABANK UY":
    case "PESOS URUGUAYOS SCOTIABANK UY":
      return <MedioPagoMarkImg src={scotiabankMarkImg} />;
    case "USD UENO BANK PY":
    case "GS UENO BANK PY":
      return <MedioPagoMarkImg src={uenoMarkImg} />;
    case "USDT BINANCE":
    case "USDC BINANCE":
      return <BinanceMarkIcon />;
    case "USD EFECTIVO":
    case "USD CONTADO":
      return <MedioPagoMarkImg src={usdEfectivoUsaImg} />;
    case "PESOS URUGUAYOS EFECTIVO":
    case "PESOS URUGUAYOS CONTADO":
      return <MedioPagoMarkImg src={pesosUyImg} />;
    case "PESOS ARGENTINOS EFECTIVO":
    case "PESOS ARGENTINOS CONTADO":
      return <MedioPagoMarkImg src={pesosArImg} />;
    case "REALES BRASIL EFECTIVO":
    case "REALES BRASIL CONTADO":
      return <MedioPagoMarkImg src={realesBrImg} />;
    case "GS EFECTIVO":
    case "GS CONTADO":
      return <MedioPagoMarkImg src={gsPyImg} />;
    default:
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0 opacity-45">
          <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".35" />
        </svg>
      );
  }
}

export function MedioPagoIcon({ code, logoUrl }: { code: string; logoUrl?: string | null }) {
  const custom = String(logoUrl ?? medioPagoLogoCache.get(String(code ?? "").trim()) ?? "").trim();
  if (custom) return <MedioPagoMarkImg src={custom} />;
  return <BuiltInMedioPagoIcon code={code} />;
}

function canManageMediosPagoCatalog(user: { email?: string | null; username?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = String(user.email ?? "").trim().toLowerCase();
  const username = String(user.username ?? "").trim().toLowerCase();
  const target = MEDIOS_PAGO_ADMIN_EMAIL.toLowerCase();
  return email === target || username === target;
}

type Props = {
  value: ContabilidadMedioPago;
  onChange: (v: ContabilidadMedioPago) => void;
  disabled?: boolean;
  buttonId?: string;
};

export function MedioPagoSelect({ value, onChange, disabled, buttonId }: Props) {
  const { user } = useAuth();
  const canManage = canManageMediosPagoCatalog(user);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ContabilidadMedioPagoCatalogItem[]>(() =>
    CONTABILIDAD_MEDIOS_PAGO.map((codigo, i) => ({
      id: -(i + 1),
      codigo,
      logoUrl: "",
      clase: inferMedioPagoClase(codigo),
      sortOrder: i,
      activo: true,
    }))
  );
  const [canManageServer, setCanManageServer] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCodigo, setNewCodigo] = useState("");
  const [adminErr, setAdminErr] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const logoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const manage = canManage && canManageServer;

  const logoByCodigo = useCallback(
    (codigo: string) => items.find((x) => x.codigo === codigo)?.logoUrl ?? "",
    [items]
  );

  const reload = useCallback(async () => {
    try {
      const res = await getContabilidadMediosPago();
      if (Array.isArray(res.items) && res.items.length > 0) {
        setItems(res.items);
        rememberMedioPagoLogos(res.items);
      }
      setCanManageServer(Boolean(res.canManage));
    } catch {
      setCanManageServer(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const onDocMouse = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setOpen(false);
        setEditingId(null);
        setAdding(false);
      }
    };
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const startEdit = (item: ContabilidadMedioPagoCatalogItem) => {
    setAdminErr("");
    setAdding(false);
    setEditingId(item.id);
    setEditDraft(item.codigo);
  };

  const saveEdit = async (item: ContabilidadMedioPagoCatalogItem) => {
    const next = editDraft.trim().toUpperCase();
    if (!next || next === item.codigo) {
      setEditingId(null);
      return;
    }
    setBusyId(item.id);
    setAdminErr("");
    try {
      const res = await updateContabilidadMedioPago(item.id, { codigo: next });
      setItems((prev) => prev.map((x) => (x.id === item.id ? res.item : x)));
      rememberMedioPagoLogos([res.item]);
      if (value === item.codigo) onChange(res.item.codigo);
      setEditingId(null);
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : "No se pudo guardar el nombre.");
    } finally {
      setBusyId(null);
    }
  };

  const saveNew = async () => {
    const code = newCodigo.trim().toUpperCase();
    if (!code) return;
    setBusyId(-1);
    setAdminErr("");
    try {
      const res = await createContabilidadMedioPago(code);
      setItems((prev) => [...prev, res.item]);
      rememberMedioPagoLogos([res.item]);
      setNewCodigo("");
      setAdding(false);
      onChange(res.item.codigo);
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : "No se pudo crear el medio de pago.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleClase = async (item: ContabilidadMedioPagoCatalogItem) => {
    if (!manage || item.id <= 0) return;
    const current = resolveMedioPagoClase(item);
    const next: ContabilidadMedioPagoClase = current === "FIAT" ? "CRIPTO" : "FIAT";
    setBusyId(item.id);
    setAdminErr("");
    try {
      const res = await updateContabilidadMedioPago(item.id, { clase: next });
      setItems((prev) => prev.map((x) => (x.id === item.id ? res.item : x)));
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : "No se pudo cambiar FIAT/CRIPTO.");
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (item: ContabilidadMedioPagoCatalogItem) => {
    if (!manage || item.id <= 0) return;
    const ok = window.confirm(`¿Eliminar el medio de pago «${item.codigo}» del catálogo?`);
    if (!ok) return;
    setBusyId(item.id);
    setAdminErr("");
    try {
      await deleteContabilidadMedioPago(item.id);
      setItems((prev) => {
        const next = prev.filter((x) => x.id !== item.id);
        if (value === item.codigo) {
          onChange(next[0]?.codigo || CONTABILIDAD_MEDIOS_PAGO[0] || "");
        }
        return next;
      });
      setEditingId(null);
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : "No se pudo eliminar el medio de pago.");
    } finally {
      setBusyId(null);
    }
  };

  const onLogoPicked = async (item: ContabilidadMedioPagoCatalogItem, file: File | undefined) => {
    if (!file) return;
    setBusyId(item.id);
    setAdminErr("");
    try {
      const res = await uploadContabilidadMedioPagoLogo(item.id, file);
      setItems((prev) => prev.map((x) => (x.id === item.id ? res.item : x)));
      rememberMedioPagoLogos([res.item]);
    } catch (e) {
      setAdminErr(e instanceof Error ? e.message : "No se pudo subir el logo.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className={`position-relative w-100 min-w-0 contabilidad-medio-pago-dd${disabled ? " contabilidad-medio-pago-dd--disabled" : ""}`}
      ref={wrapRef}
    >
      <button
        id={buttonId}
        type="button"
        disabled={disabled}
        className="form-select w-100 min-w-0 d-flex align-items-center gap-2 text-start contabilidad-medio-pago-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Medio de pago"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <MedioPagoIcon code={value} logoUrl={logoByCodigo(value)} />
        <span className="flex-grow-1 min-w-0 text-truncate">{value}</span>
        <MedioPagoCountryFlag code={value} />
      </button>
      {open ? (
        <ul
          className="contabilidad-medio-pago-dd-menu shadow border rounded-3 bg-white list-unstyled mb-0 mt-1 py-1"
          role="listbox"
          aria-activedescendant={value}
          style={{
            position: "absolute",
            zIndex: 1080,
            left: 0,
            right: 0,
            maxHeight: "min(380px, 75vh)",
            overflowY: "auto",
          }}
        >
          {items.map((item) => {
            const v = item.codigo;
            const isEditing = manage && editingId === item.id;
            return (
              <li key={item.id} role="none" className="contabilidad-medio-pago-dd-row">
                {isEditing ? (
                  <div className="d-flex align-items-center gap-1 px-2 py-1">
                    <MedioPagoIcon code={v} logoUrl={item.logoUrl} />
                    <input
                      className="form-control form-control-sm flex-grow-1"
                      value={editDraft}
                      disabled={busyId === item.id}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveEdit(item);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={busyId === item.id}
                      title="Guardar"
                      onClick={(e) => {
                        e.stopPropagation();
                        void saveEdit(item);
                      }}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={busyId === item.id}
                      title="Cancelar"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    className={`contabilidad-medio-pago-dd-row-inner${
                      manage && item.id > 0 ? " contabilidad-medio-pago-dd-row-inner--admin" : ""
                    }${v === value ? " contabilidad-medio-pago-dd-row-inner--active" : ""}`}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={v === value}
                      className={`btn btn-light border-0 text-start d-flex align-items-center gap-2 py-2 px-3 rounded-0 text-body contabilidad-medio-pago-dd-item${
                        v === value ? " active fw-semibold" : ""
                      }`}
                      onClick={() => {
                        onChange(v);
                        setOpen(false);
                      }}
                    >
                      <MedioPagoIcon code={v} logoUrl={item.logoUrl} />
                      <span className="flex-grow-1 min-w-0 text-truncate">{v}</span>
                    </button>
                    {manage && item.id > 0 ? (
                      <div className="contabilidad-medio-pago-dd-admin">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-0 px-1"
                          title="Editar nombre"
                          disabled={busyId === item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(item);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-0 px-1"
                          title="Subir logo"
                          disabled={busyId === item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            logoInputRefs.current[item.id]?.click();
                          }}
                        >
                          🖼
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-0 px-1"
                          title="Eliminar"
                          disabled={busyId === item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeItem(item);
                          }}
                        >
                          🗑
                        </button>
                        <input
                          ref={(el) => {
                            logoInputRefs.current[item.id] = el;
                          }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="d-none"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            void onLogoPicked(item, f);
                          }}
                        />
                      </div>
                    ) : null}
                    <MedioPagoClaseLabel
                      item={item}
                      canEdit={manage && item.id > 0}
                      busy={busyId === item.id}
                      onToggle={() => void toggleClase(item)}
                    />
                    <span className="contabilidad-medio-pago-dd-flag-slot">
                      <MedioPagoCountryFlag code={v} />
                    </span>
                  </div>
                )}
              </li>
            );
          })}

          {manage ? (
            <li role="none" className="border-top mt-1 pt-1 px-2 pb-2">
              {adminErr ? <div className="small text-danger mb-1">{adminErr}</div> : null}
              {adding ? (
                <div className="d-flex align-items-center gap-1">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Ej. USD BANCO NUEVO UY"
                    value={newCodigo}
                    disabled={busyId === -1}
                    autoFocus
                    onChange={(e) => setNewCodigo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveNew();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-sm btn-success" disabled={busyId === -1} onClick={() => void saveNew()}>
                    Agregar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busyId === -1}
                    onClick={() => {
                      setAdding(false);
                      setNewCodigo("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary w-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                    setAdminErr("");
                    setAdding(true);
                  }}
                >
                  + Agregar medio de pago
                </button>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
