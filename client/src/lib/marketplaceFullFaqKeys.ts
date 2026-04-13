/** Filas del FAQ completo (contenido WordPress), claves i18n `corp.faq.wp.N.{q,a}`. */
export type CorpFaqSpotlightRow = { q: string; a: string };

export const MARKETPLACE_WP_FAQ_ROWS: CorpFaqSpotlightRow[] = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return { q: `corp.faq.wp.${n}.q`, a: `corp.faq.wp.${n}.a` };
});
