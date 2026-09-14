import { useEffect, useMemo, useState } from "react";
import { getCryptoNoticiasLivePrices, type CryptoNewsLivePrice, type CryptoNewsSentimentReport } from "../lib/api";
import { buildDeskBriefing } from "../lib/cryptoNewsDeskBriefing";

export function CryptoNoticiasDeskBriefing({ report }: { report: CryptoNewsSentimentReport }) {
  const [prices, setPrices] = useState<CryptoNewsLivePrice[]>([]);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const r = await getCryptoNoticiasLivePrices();
        if (!dead) setPrices(r.items || []);
      } catch {
        if (!dead) setPrices([]);
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 12_000);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, []);

  const briefing = useMemo(() => buildDeskBriefing(report, prices), [report, prices]);
  if (!briefing) return null;

  return (
    <aside className="crypto-news-desk" aria-label="Lectura operativa del desk">
      <div className="crypto-news-desk__head">
        <div>
          <div className="crypto-news-desk__kicker">Desk · lectura para operar</div>
          <p className="crypto-news-desk__lead">
            Cruce de wire (48 h / 14 d / 45 d) con el tape de BTC y alts. No es consejo financiero: es cómo un
            operador leería el flujo ahora.
          </p>
        </div>
      </div>
      <div className="crypto-news-desk__grid">
        {briefing.notes.map((n) => (
          <article key={n.id} className={`crypto-news-desk__card is-${n.playTone} is-${n.id}`}>
            <div className="crypto-news-desk__card-top">
              <span className="crypto-news-desk__label">
                {n.label}
                <span> · {n.window}</span>
              </span>
              <span className={`crypto-news-desk__play is-${n.playTone}`}>{n.play}</span>
            </div>
            <p className="crypto-news-desk__text">{n.text}</p>
          </article>
        ))}
      </div>
      <p className="crypto-news-desk__foot">{briefing.invalidation}</p>
    </aside>
  );
}
