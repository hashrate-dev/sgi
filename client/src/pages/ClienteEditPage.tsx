import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { deleteClient, getClients, updateClient, wakeUpBackend } from "../lib/api";
import type { Client } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes } from "../lib/auth";
import "../styles/facturacion.css";
import "../styles/marketplace-hashrate.css";
import "../styles/cliente-tienda-edit.css";
import {
  CITY_OTHER_VALUE,
  COUNTRIES_REGISTRO,
  DEFAULT_PHONE_DIAL_COUNTRY_ID,
  DOCUMENTO_TIPO_OPTIONS,
  countriesForPhoneSelect,
  countryById,
  findCountryIdByName,
  normalizeLocalPhoneInput,
  parseDocumentoIdentidadStored,
  parseStoredPhoneToDialLocal,
} from "../lib/marketplaceRegistroGeo";

/** Cliente creado desde /marketplace/registro (código A90001… o histórico WEB-). */
function isClienteTiendaOnline(code: string | undefined): boolean {
  const c = (code ?? "").trim().toUpperCase();
  return c.startsWith("WEB-") || /^A9\d+$/.test(c);
}

const lockedClienteInputStyle: CSSProperties = {
  background: "#f3f4f6",
  cursor: "not-allowed",
  color: "#374151",
};

const emptyForm = {
  code: "",
  name: "",
  name2: "",
  phone: "",
  phone2: "",
  email: "",
  email2: "",
  address: "",
  address2: "",
  city: "",
  city2: "",
  usuario: "",
  documento_identidad: "",
  country: ""
};

export function ClienteEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Campos alineados con `/marketplace/registro` (solo edición cliente tienda). */
  const [teCountryId, setTeCountryId] = useState("");
  const [teCity, setTeCity] = useState("");
  const [teCityOther, setTeCityOther] = useState("");
  const [teDocTipo, setTeDocTipo] = useState<string>(DOCUMENTO_TIPO_OPTIONS[0].value);
  const [teDocNumero, setTeDocNumero] = useState("");
  const [teCelDialId, setTeCelDialId] = useState<string>(DEFAULT_PHONE_DIAL_COUNTRY_ID);
  const [teCelLocal, setTeCelLocal] = useState("");
  const teCountryPrevRef = useRef<string | null>(null);
  const countriesPhoneSel = useMemo(() => countriesForPhoneSelect(), []);

  if (user && !canEdit) return <Navigate to="/clientes" replace />;

  useEffect(() => {
    if (!id) {
      setError("ID de cliente no válido");
      setLoading(false);
      return;
    }
    // Precalentar backend (Vercel cold start) para que el guardado sea más rápido
    wakeUpBackend();

    getClients()
      .then((r) => {
        const idDecoded = decodeURIComponent(id);
        const found = r.clients.find(
          (c) => String(c.id) === idDecoded || (c.code && c.code === idDecoded)
        ) as Client | undefined;
        if (!found) {
          setError("Cliente no encontrado");
          setLoading(false);
          return;
        }
        setClient(found);
        setForm({
          code: found.code ?? "",
          name: found.name ?? "",
          name2: found.name2 ?? "",
          phone: found.phone ?? "",
          phone2: found.phone2 ?? "",
          email: found.email ?? "",
          email2: found.email2 ?? "",
          address: found.address ?? "",
          address2: found.address2 ?? "",
          city: found.city ?? "",
          city2: found.city2 ?? "",
          usuario: found.usuario ?? "",
          documento_identidad: found.documento_identidad ?? "",
          country: found.country ?? ""
        });
        setLoading(false);
        // Si la URL tiene id numérico (279), reemplazar por código (C17) para que la barra muestre el código
        if (found.code && /^\d+$/.test(idDecoded)) {
          navigate(`/clientes/${encodeURIComponent(found.code)}/edit`, { replace: true });
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar cliente");
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!client || !isClienteTiendaOnline(client.code)) return;
    const cid = findCountryIdByName(client.country ?? "");
    setTeCountryId(cid || "");
    const pais = countryById(cid);
    const cname = (client.city ?? "").trim();
    if (pais && cname && pais.cities.includes(cname)) {
      setTeCity(cname);
      setTeCityOther("");
    } else if (cname) {
      setTeCity(CITY_OTHER_VALUE);
      setTeCityOther(cname);
    } else {
      setTeCity("");
      setTeCityOther("");
    }
    const doc = parseDocumentoIdentidadStored(client.documento_identidad ?? "");
    setTeDocTipo(doc.tipo);
    setTeDocNumero(doc.numero);
    const ph = parseStoredPhoneToDialLocal(client.phone ?? "");
    setTeCelDialId(ph.dialId || DEFAULT_PHONE_DIAL_COUNTRY_ID);
    setTeCelLocal(ph.local);
    teCountryPrevRef.current = cid || null;
  }, [client]);

  useEffect(() => {
    if (!client || !isClienteTiendaOnline(client.code)) return;
    if (!teCountryId) return;
    const prev = teCountryPrevRef.current;
    teCountryPrevRef.current = teCountryId;
    if (prev === null || prev === teCountryId) return;
    setTeCity("");
    setTeCityOther("");
    setTeCelDialId(teCountryId);
  }, [teCountryId, client]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setMessage(null);
    const nameTrim = form.name.trim();
    if (!nameTrim) {
      setMessage({ type: "err", text: "Nombre es obligatorio." });
      return;
    }
    const isTienda = isClienteTiendaOnline(client.code);

    let phoneOut: string | undefined;
    let countryOut: string | undefined;
    let cityOut: string | undefined;
    let documentoOut: string | undefined;

    if (isTienda) {
      if (!form.email?.trim()) {
        setMessage({ type: "err", text: "El correo electrónico es obligatorio." });
        return;
      }
      if (!teCountryId) {
        setMessage({ type: "err", text: "Seleccioná el país." });
        return;
      }
      const paisDir = countryById(teCountryId);
      if (!paisDir) {
        setMessage({ type: "err", text: "País no válido." });
        return;
      }
      if (!teCity) {
        setMessage({ type: "err", text: "Seleccioná la ciudad." });
        return;
      }
      if (teCity === CITY_OTHER_VALUE && teCityOther.trim().length < 2) {
        setMessage({ type: "err", text: "Escribí el nombre de la ciudad." });
        return;
      }
      const cityFinal = teCity === CITY_OTHER_VALUE ? teCityOther.trim() : teCity.trim();
      if (!form.address.trim() || form.address.trim().length < 3) {
        setMessage({ type: "err", text: "La dirección debe tener al menos 3 caracteres." });
        return;
      }
      if (teDocNumero.trim().length < 3) {
        setMessage({ type: "err", text: "Completá el número de documento." });
        return;
      }
      const paisCel = countryById(teCelDialId);
      if (!paisCel) {
        setMessage({ type: "err", text: "Código de país del celular no válido." });
        return;
      }
      const dialCel = paisCel.dial;
      const celDigits = normalizeLocalPhoneInput(teCelLocal, dialCel);
      if (celDigits.length < 6) {
        setMessage({ type: "err", text: "Ingresá un número de celular válido." });
        return;
      }
      phoneOut = `${dialCel.replace(/\s/g, "")}${celDigits}`;
      countryOut = paisDir.name;
      cityOut = cityFinal;
      documentoOut = `${teDocTipo} ${teDocNumero.trim()}`.trim();
    }

    const payload: Record<string, string | undefined> = {
      name: nameTrim,
      name2: form.name2.trim() || undefined,
      phone: isTienda ? phoneOut : form.phone.trim() || undefined,
      phone2: form.phone2.trim() || undefined,
      email: form.email.trim() || undefined,
      email2: form.email2.trim() || undefined,
      address: form.address.trim() || undefined,
      address2: form.address2.trim() || undefined,
      city: isTienda ? cityOut : form.city.trim() || undefined,
      city2: form.city2.trim() || undefined,
      usuario: form.usuario.trim() || undefined,
      documento_identidad: isTienda ? documentoOut : form.documento_identidad.trim() || undefined,
      country: isTienda ? countryOut : form.country.trim() || undefined,
    };
    if (!payload.name) return;

    setSaving(true);
    // En Vercel+Supabase el cold start puede tardar 60-90s; precalentamos y damos tiempo suficiente
    const timeoutMs = 120000; // 2 min para cold start + Supabase
    const clientId = String(client.id);
    const doSave = () =>
      wakeUpBackend().then(() => updateClient(clientId, payload));
    const withTimeout = Promise.race([
      doSave(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("La solicitud tardó demasiado. Probá de nuevo en unos segundos.")), timeoutMs)
      )
    ]);
    withTimeout
      .then(() => {
        setMessage({ type: "ok", text: "Cliente actualizado correctamente." });
        setTimeout(
          () => navigate(isClienteTiendaOnline(client.code) ? "/clientes-tienda-online" : "/clientes"),
          1500
        );
      })
      .catch((err) => {
        setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al actualizar" });
      })
      .finally(() => setSaving(false));
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true);
  }

  function handleDeleteConfirm() {
    if (!client?.id) return;
    setShowDeleteConfirm(false);
    setDeleting(true);
    setMessage(null);
    deleteClient(client.id)
      .then(() => {
        setMessage({ type: "ok", text: "Cliente eliminado." });
        setTimeout(() => {
          navigate(isClienteTiendaOnline(client.code) ? "/clientes-tienda-online" : "/clientes");
        }, 1500);
      })
      .catch((err) => {
        setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al eliminar" });
        setDeleting(false);
      });
  }

  if (loading) {
    return (
      <div className="fact-page">
        <div className="container">
          <div className="fact-card">
            <div className="fact-card-body">
              <p className="text-muted">₿</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="fact-page">
        <div className="container">
          <PageHeader title="Editar Cliente" />
          <div className="fact-card">
            <div className="fact-card-body">
              <div className="mb-3 p-3 rounded" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                {error || "Cliente no encontrado"}
              </div>
              <Link to="/" className="fact-btn fact-btn-primary">
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tiendaOnline = isClienteTiendaOnline(client.code);
  const paisTe = countryById(teCountryId);

  return (
    <div className={`fact-page${tiendaOnline ? " fact-page--cte-tienda-edit" : ""}`}>
      {tiendaOnline ? (
        <div className="container cte-edit-tienda-page-inner">
          <PageHeader title="Cliente · Tienda online" logoHref="/" />
          <main className="cte-edit-market-main page-main page-main--market page-main--market--asic cliente-tienda-edit--admin">
            <section className="market-registro-section pt-0">
              <div className="py-2 py-lg-2 cte-edit-tienda-container">
              <div className="market-registro-card cte-edit-market__card cte-edit-market__card--full">
                <header className="market-registro-card__head cte-edit-tienda-card-head">
                  <p className="market-registro-card__kicker">Cliente tienda online</p>
                  <h2 className="market-registro-card__title cte-edit-market__title-row">
                    <span>Formulario de edición</span>
                    <span className="badge bg-success rounded-pill cte-edit-market__code-badge">{client.code}</span>
                  </h2>
                </header>

                <form onSubmit={handleSubmit} noValidate className="cte-edit-market-form--admin">
                  <div
                    className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-2"
                    role="group"
                    aria-labelledby="cte-legend-cuenta"
                  >
                    <div id="cte-legend-cuenta" className="market-registro-fieldset__legend">
                      <i className="bi bi-person-badge" aria-hidden />
                      Tu cuenta
                    </div>
                    <div className="row g-2">
                      <div className="col-md-4">
                        <label className="form-label market-registro-label" htmlFor="cte-tienda-code">
                          Nº de cliente <span className="text-danger">*</span>
                        </label>
                        <input
                          id="cte-tienda-code"
                          type="text"
                          className="form-control cte-edit-market__input--locked"
                          value={form.code}
                          readOnly
                          disabled
                          aria-readonly="true"
                          title="Asignado al registrarse en la tienda."
                        />
                      </div>
                      <div className="col-md-8">
                        <label className="form-label market-registro-label" htmlFor="cte-tienda-email">
                          Correo electrónico <span className="text-danger">*</span>
                        </label>
                        <input
                          id="cte-tienda-email"
                          type="email"
                          className="form-control cte-edit-market__input--locked"
                          value={form.email}
                          readOnly
                          disabled
                          autoComplete="email"
                          aria-readonly="true"
                          title="El correo de la cuenta de tienda no se edita aquí. Cambios de acceso: módulo Usuarios."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grilla 2×2 en desktop: fila 1 identidad + domicilio, fila 2 documento + contacto */}
                  <div className="row g-3 align-items-stretch cte-edit-tienda-main-grid">
                    <div className="col-12 col-lg-6 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="cte-legend-personal"
                      >
                        <div id="cte-legend-personal" className="market-registro-fieldset__legend">
                          <i className="bi bi-person-vcard" aria-hidden />
                          Datos personales
                        </div>
                        <div className="row g-2">
                          <div className="col-12">
                            <label className="form-label market-registro-label" htmlFor="cte-tienda-nombre">
                              Nombre <span className="text-danger">*</span>
                            </label>
                            <input
                              id="cte-tienda-nombre"
                              type="text"
                              className="form-control"
                              value={form.name}
                              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                              autoComplete="given-name"
                              placeholder="Nombre completo"
                              required
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label market-registro-label" htmlFor="cte-tienda-apellidos">
                              Apellidos
                            </label>
                            <input
                              id="cte-tienda-apellidos"
                              type="text"
                              className="form-control"
                              value={form.name2}
                              onChange={(e) => setForm((f) => ({ ...f, name2: e.target.value }))}
                              autoComplete="family-name"
                              placeholder="Apellidos"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-12 col-lg-6 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="cte-legend-ubicacion"
                      >
                        <div id="cte-legend-ubicacion" className="market-registro-fieldset__legend">
                          <i className="bi bi-geo-alt" aria-hidden />
                          Ubicación de envío
                        </div>
                        <div className="row g-2 mb-1">
                          <div className="col-12">
                            <label className="form-label market-registro-label" htmlFor="cte-tienda-pais">
                              País
                            </label>
                            <select
                              id="cte-tienda-pais"
                              className="form-select"
                              value={teCountryId}
                              onChange={(e) => setTeCountryId(e.target.value)}
                              autoComplete="country"
                              aria-label="País"
                              required
                            >
                              <option value="">Seleccioná tu país…</option>
                              {COUNTRIES_REGISTRO.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.dial})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-12">
                            <label className="form-label market-registro-label" htmlFor="cte-tienda-ciudad">
                              Ciudad
                            </label>
                            <select
                              id="cte-tienda-ciudad"
                              className="form-select"
                              value={teCity}
                              onChange={(e) => setTeCity(e.target.value)}
                              autoComplete="address-level2"
                              aria-label="Ciudad"
                              disabled={!paisTe}
                              required
                            >
                              <option value="">{paisTe ? "Seleccioná tu ciudad…" : "Elegí primero el país"}</option>
                              {paisTe?.cities.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                              {paisTe ? <option value={CITY_OTHER_VALUE}>Otra ciudad…</option> : null}
                            </select>
                            {paisTe && teCity === CITY_OTHER_VALUE ? (
                              <input
                                type="text"
                                className="form-control mt-1"
                                value={teCityOther}
                                onChange={(e) => setTeCityOther(e.target.value)}
                                placeholder="Nombre de la ciudad"
                                autoComplete="address-level2"
                                aria-label="Nombre de la ciudad"
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="mb-0">
                          <label className="form-label market-registro-label" htmlFor="cte-tienda-direccion">
                            Dirección
                          </label>
                          <input
                            id="cte-tienda-direccion"
                            type="text"
                            className="form-control"
                            value={form.address}
                            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                            autoComplete="street-address"
                            placeholder="Calle, número, barrio"
                            required
                            minLength={3}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-12 col-lg-6 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="cte-legend-doc"
                      >
                        <div id="cte-legend-doc" className="market-registro-fieldset__legend">
                          <i className="bi bi-card-text" aria-hidden />
                          Documento de identidad
                        </div>
                        <div className="market-registro-doc-grid">
                          <select
                            id="cte-tienda-doc-tipo"
                            className="form-select market-registro-doc-select"
                            value={teDocTipo}
                            onChange={(e) => setTeDocTipo(e.target.value)}
                            aria-label="Tipo de documento"
                            required
                          >
                            {DOCUMENTO_TIPO_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <input
                            id="cte-tienda-doc-numero"
                            type="text"
                            className="form-control"
                            value={teDocNumero}
                            onChange={(e) => setTeDocNumero(e.target.value)}
                            autoComplete="off"
                            placeholder="Número"
                            aria-label="Número de documento"
                            required
                            minLength={3}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-12 col-lg-6 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="cte-legend-celular"
                      >
                        <div id="cte-legend-celular" className="market-registro-fieldset__legend">
                          <i className="bi bi-phone" aria-hidden />
                          Contacto
                        </div>
                        <div className="mb-0 market-registro-phone-block">
                          <label className="form-label market-registro-label" htmlFor="cte-tienda-cel-num">
                            Celular
                          </label>
                          <div className="input-group flex-nowrap hrs-reg-phone-input-group">
                            <select
                              className="form-select flex-shrink-0 hrs-reg-phone-dial market-registro-phone-dial"
                              value={teCelDialId}
                              onChange={(e) => setTeCelDialId(e.target.value)}
                              aria-label="Código internacional"
                              required
                            >
                              {countriesPhoneSel.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.dial} · {c.name}
                                </option>
                              ))}
                            </select>
                            <input
                              id="cte-tienda-cel-num"
                              type="tel"
                              className="form-control flex-grow-1 min-w-0"
                              value={teCelLocal}
                              onChange={(e) => setTeCelLocal(e.target.value)}
                              autoComplete="tel-national"
                              placeholder="Ej. 981 123456"
                              inputMode="numeric"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {message ? (
                    <div
                      className={`cte-edit-market__alert alert mt-2 mb-0 py-2 ${
                        message.type === "ok" ? "alert-success" : "alert-danger"
                      }`}
                      role="alert"
                    >
                      {message.text}
                    </div>
                  ) : null}

                  <div className="market-registro-submit-row d-flex flex-wrap gap-2 justify-content-end align-items-center cte-edit-tienda-actions">
                    <Link to="/clientes-tienda-online" className="btn btn-outline-secondary order-3 order-md-1">
                      Cancelar
                    </Link>
                    {canDelete ? (
                      <button type="button" className="btn btn-danger order-2" onClick={handleDeleteClick}>
                        Eliminar cliente
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      className="btn btn-success market-registro-submit order-1 order-md-3"
                      disabled={saving}
                    >
                      {saving ? "Guardando…" : "Guardar cambios"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            </section>
          </main>
        </div>
      ) : (
        <>
          <div className="container">
            <PageHeader title="Editar Cliente" logoHref="/" />
          </div>
      <div className="container">
        <div className="fact-layout" style={{ gridTemplateColumns: "1fr", maxWidth: "100%" }}>
          <div className="fact-card">
              <div className="fact-card-header d-flex flex-wrap align-items-center gap-2">Editar cliente: {client.code}</div>
            <div className="fact-card-body">
              <form onSubmit={handleSubmit}>
                <div className="client-form-grid-4">
                  {/* Columna 1: Información Básica */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Información Básica</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Código *</label>
                      <input
                          type="text"
                        className="fact-input"
                        value={form.code}
                          readOnly
                        disabled
                          aria-readonly="true"
                          title="El código de cliente no se puede modificar (A90001, WEB-…, C01, etc.)."
                          placeholder="—"
                          style={lockedClienteInputStyle}
                      />
                      <small className="text-muted">El código no se puede cambiar.</small>
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Nombre o Razón Social 1 *</label>
                      <input
                        className="fact-input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Nombre o razón social"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Nombre o Razón Social 2</label>
                        <input
                          className="fact-input"
                          value={form.name2}
                          onChange={(e) => setForm((f) => ({ ...f, name2: e.target.value }))}
                          placeholder="Nombre (opcional)"
                        />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Usuario</label>
                      <input
                        className="fact-input"
                        value={form.usuario}
                        onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))}
                        placeholder="Usuario"
                      />
                    </div>
                      <div className="fact-field">
                        <label className="fact-label">Documento de identidad</label>
                        <input
                          className="fact-input"
                          value={form.documento_identidad}
                          onChange={(e) => setForm((f) => ({ ...f, documento_identidad: e.target.value }))}
                          placeholder="CI / DNI / Pasaporte / RUC"
                        />
                      </div>
                  </div>

                  {/* Columna 2: Teléfonos */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Teléfonos</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Teléfono 1</label>
                      <input
                        className="fact-input"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="Teléfono"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Teléfono 2</label>
                        <input
                          className="fact-input"
                          type="tel"
                          value={form.phone2}
                          onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
                          placeholder="Teléfono"
                        />
                      </div>
                  </div>

                  {/* Columna 3: Contacto */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Contacto</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Email 1</label>
                      <input
                        className="fact-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Email 2</label>
                      <input
                        className="fact-input"
                        type="email"
                        value={form.email2}
                        onChange={(e) => setForm((f) => ({ ...f, email2: e.target.value }))}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                  </div>

                  {/* Columna 4: Ubicación */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Ubicación</h3>
                      <div className="fact-field">
                        <label className="fact-label">País</label>
                        <input
                          className="fact-input"
                          value={form.country}
                          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                          placeholder="País"
                        />
                      </div>
                    <div className="fact-field">
                      <label className="fact-label">Dirección 1</label>
                      <input
                        className="fact-input"
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="Dirección"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Dirección 2</label>
                        <input
                          className="fact-input"
                          value={form.address2}
                          onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
                          placeholder="Dirección"
                        />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Ciudad / País 1</label>
                      <input
                        className="fact-input"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Ciudad, País"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Ciudad / País 2</label>
                        <input
                          className="fact-input"
                          value={form.city2}
                          onChange={(e) => setForm((f) => ({ ...f, city2: e.target.value }))}
                          placeholder="Ciudad, País"
                        />
                      </div>
                  </div>
                </div>

                {message && (
                  <div
                    className="fact-field"
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: 8,
                      background: message.type === "ok" ? "#f0fdf4" : "#fef2f2",
                      color: message.type === "ok" ? "#166534" : "#b91c1c",
                      fontSize: "0.875rem",
                      gridColumn: "1 / -1",
                      marginTop: "1rem"
                    }}
                  >
                    {message.text}
                  </div>
                )}
                <div className="d-flex gap-2 mt-3 flex-wrap" style={{ gridColumn: "1 / -1", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                  <Link to="/clientes" className="fact-btn fact-btn-secondary">
                    Cancelar
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      className="fact-btn"
                      style={{ background: "#dc2626", color: "#fff" }}
                      onClick={handleDeleteClick}
                    >
                      Eliminar cliente
                    </button>
                  )}
                  <button type="submit" className="fact-btn fact-btn-primary" disabled={saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Modal Confirmación - Eliminar Cliente */}
      {showDeleteConfirm && client && (
        <div className="modal d-block professional-modal-overlay" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content professional-modal professional-modal-delete">
              <div className="modal-header professional-modal-header">
                <div className="professional-modal-icon-wrapper">
                  <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h5 className="modal-title professional-modal-title">
                  Eliminar Cliente
                </h5>
                <button type="button" className="professional-modal-close" onClick={() => setShowDeleteConfirm(false)} aria-label="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="modal-body professional-modal-body">
                <p style={{ fontSize: "1rem", color: "#374151", marginBottom: "1rem" }}>
                  ¿Eliminar al cliente <strong>{client.name}</strong>?
                </p>
                <div className="professional-modal-warning-box">
                  Esta acción no se puede deshacer.
                </div>
              </div>
              <div className="modal-footer professional-modal-footer">
                <button type="button" className="professional-btn professional-btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  Cancelar
                </button>
                <button type="button" className="professional-btn professional-btn-primary" onClick={handleDeleteConfirm} disabled={deleting}>
                  {deleting ? (
                    <>
                      <span className="professional-btn-spinner"></span>
                      Eliminando...
                    </>
                  ) : (
                    "Eliminar"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
