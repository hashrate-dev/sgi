/**
 * Antes: franja blanca con título + “Volver…”.
 * Ahora: sin UI (navegación global en `SgiProtectedTopBar`). Se mantiene el export
 * para no tocar decenas de páginas; el título de cada vista debe vivir en el cuerpo.
 */
export interface PageHeaderProps {
  title: string;
  showBackButton?: boolean;
  backTo?: string;
  backText?: string;
  rightContent?: React.ReactNode;
  logoSrc?: string;
  logoHref?: string;
  logoLinkAriaLabel?: string;
}

export function PageHeader(_props: PageHeaderProps) {
  return null;
}
