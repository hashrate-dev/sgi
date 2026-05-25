import "../styles/corp-logo-home.css";

type Props = {
  src: string;
  alt?: string;
  /** Opacidad como en la home pública (0.56). En admin usamos 1 para leer mejor el panel. */
  matchHomeOpacity?: boolean;
};

/** Vista previa del logo tal como se ve en /marketplace/home (gris corporativo). */
export function CorpLogoHomePreview({ src, alt = "", matchHomeOpacity = false }: Props) {
  if (!src.trim()) return null;
  return (
    <span
      className="corp-logo-home-style__frame corp-logo-home-style__frame--fill"
      style={matchHomeOpacity ? { opacity: 0.56 } : undefined}
    >
      <img className="corp-logo-home-style__img" src={src} alt={alt} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
