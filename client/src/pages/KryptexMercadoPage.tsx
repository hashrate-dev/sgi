import "../styles/kryptex-mercado.css";

/** Mesa de trading (dashboard estático). Los precios se actualizan solos dentro del documento. */
export function KryptexMercadoPage() {
  return (
    <div className="tv-markets-page kryptex-mercado">
      <iframe
        className="kryptex-mercado-frame"
        title="Mesa de trading cripto"
        src="/mercado/dashboard.html"
      />
    </div>
  );
}
