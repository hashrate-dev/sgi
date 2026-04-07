import { t } from "../../lib/i18n.js";
import type { CatalogItem } from "../../lib/productUtils.js";

export function ProductRequestModal({
  product,
  lang,
  onClose,
}: {
  product: CatalogItem;
  lang: string;
  onClose: () => void;
}) {
  const subject = encodeURIComponent(`${t(lang, "mail.subject.request")}: ${product.name}`);
  const mail = `mailto:dl@hashrate.space?subject=${subject}`;

  return (
    <div className="marketplace-modal-overlay" role="dialog" aria-modal aria-labelledby="marketplace-modal-title">
      <div className="marketplace-modal">
        <div className="marketplace-modal__header">
          <h2 id="marketplace-modal-title" className="h5 mb-0">
            {t(lang, "modal.title")}
          </h2>
          <button type="button" className="btn btn-link text-muted" onClick={onClose} aria-label={t(lang, "modal.close")}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="marketplace-modal__body">
          <p className="fw-semibold mb-2">{product.name}</p>
          {product.description ? <p className="text-muted small mb-3">{String(product.description)}</p> : null}
          <p className="small mb-3">{t(lang, "modal.hint")}</p>
          <a className="btn btn-success w-100" href={mail}>
            <i className="bi bi-envelope me-2" />
            dl@hashrate.space
          </a>
        </div>
      </div>
    </div>
  );
}
