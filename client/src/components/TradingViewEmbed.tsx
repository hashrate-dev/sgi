import { useEffect, useRef } from "react";

type Props = {
  scriptSrc: string;
  config: Record<string, unknown>;
  className?: string;
};

export function TradingViewEmbed({ scriptSrc, config, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const configKey = JSON.stringify(config);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    host.appendChild(widget);
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.type = "text/javascript";
    script.text = configKey;
    host.appendChild(script);
    return () => {
      host.replaceChildren();
    };
  }, [scriptSrc, configKey]);

  return <div className={`tradingview-widget-container ${className ?? ""}`.trim()} ref={hostRef} />;
}
