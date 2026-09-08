import { useEffect, useMemo, useRef, useState } from "react";
import { getCryptoNoticiasLivePrices, type CryptoNewsLivePrice } from "../lib/api";

function formatUsd(n: number, symbol: string): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (symbol === "BTC") {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  if (n >= 100) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
  if (n >= 1) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 3 });
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 5 });
}

function sparkPath(values: number[], w: number, h: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function LiveSpark({ values, up }: { values: number[]; up: boolean }) {
  const d = useMemo(() => sparkPath(values, 120, 36), [values]);
  if (!d) return <div className="crypto-news-live__spark crypto-news-live__spark--empty" />;
  const stroke = up ? "#6ee7b7" : "#fca5a5";
  const fill = up ? "rgba(110, 231, 183, 0.18)" : "rgba(252, 165, 165, 0.14)";
  return (
    <svg className="crypto-news-live__spark" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L120,36 L0,36 Z`} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function CryptoNoticiasLivePrices() {
  const [items, setItems] = useState<CryptoNewsLivePrice[]>([]);
  const [err, setErr] = useState("");
  const [pulse, setPulse] = useState(false);
  const histRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    let dead = false;

    const pull = async () => {
      try {
        const r = await getCryptoNoticiasLivePrices();
        if (dead) return;
        const next = (r.items || []).map((c) => {
          const prev = histRef.current[c.id] || c.spark || [];
          const merged = [...prev];
          if (Number.isFinite(c.priceUsd) && c.priceUsd > 0) {
            const last = merged[merged.length - 1];
            if (last == null || Math.abs(last - c.priceUsd) > 1e-12) merged.push(c.priceUsd);
          }
          // Mantener ventana corta para sensación “en vivo”
          histRef.current[c.id] = merged.slice(-48);
          return { ...c, spark: histRef.current[c.id].length >= 2 ? histRef.current[c.id] : c.spark };
        });
        setItems(next);
        setErr("");
        setPulse((p) => !p);
      } catch (e) {
        if (!dead) setErr(e instanceof Error ? e.message : "No se pudieron cargar precios.");
      }
    };

    void pull();
    const id = window.setInterval(() => void pull(), 4_000);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="crypto-news-live" aria-label="Precios en vivo">
      <div className="crypto-news-live__head">
        <span className="crypto-news-live__kicker">
          <span className={`crypto-news-live__dot${pulse ? " is-on" : ""}`} aria-hidden />
          Precios en vivo
        </span>
      </div>
      {err && items.length === 0 ? <p className="crypto-news-live__err">{err}</p> : null}
      <div className="crypto-news-live__list">
        {(items.length
          ? items
          : ([
              { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
              { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
              { id: "litecoin", symbol: "LTC", name: "Litecoin" },
              { id: "zcash", symbol: "ZEC", name: "Zcash" },
            ] as const).map((c) => ({
              ...c,
              priceUsd: 0,
              changePct24h: 0,
              spark: [] as number[],
              updatedAt: "",
            }))
        ).map((c) => {
          const up = c.changePct24h >= 0;
          return (
            <article key={c.id} className={`crypto-news-live__card${up ? " is-up" : " is-down"}`}>
              <div className="crypto-news-live__row">
                <div>
                  <div className="crypto-news-live__sym">{c.symbol}</div>
                  <div className="crypto-news-live__name">{c.name}</div>
                </div>
                <div className="crypto-news-live__px">
                  <div className="crypto-news-live__price">{formatUsd(c.priceUsd, c.symbol)}</div>
                  <div className={`crypto-news-live__chg${up ? " is-up" : " is-down"}`}>
                    {Number.isFinite(c.changePct24h)
                      ? `${up ? "+" : ""}${c.changePct24h.toFixed(2)}%`
                      : "—"}
                  </div>
                </div>
              </div>
              <LiveSpark values={c.spark} up={up} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
