/**
 * A shop's "Browse the catalogue": the same catalogue as the Shop app, of
 * what this shop sells at its prices, bought here (free and at once). At
 * home, Buy mode's walls open it online (delivered).
 */
import type { CatalogCategory } from '@runway/engine';
import { t } from '../i18n';
import { Catalogue } from './Catalogue';
import type { CatEntry } from './catalog';
import './shop.css';

export function CatalogueSheet({
  mode = 'store',
  title,
  entries,
  currency,
  businessId,
  inMall,
  category,
  onClose,
}: {
  title: string;
  entries: CatEntry[];
  currency: string;
  businessId?: string;
  inMall?: boolean;
  category?: CatalogCategory | null;
  onClose: () => void;
  /** Store (bought here) or online (from home, delivered). */
  mode?: 'store' | 'online';
}) {
  return (
    <div className="cat-sheet-back" onClick={onClose}>
      <section
        className="cat-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('Catalogue')}
        data-catalogue-sheet=""
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>📖 {title}</h3>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <Catalogue
          mode={mode}
          entries={entries}
          currency={currency}
          {...(businessId ? { businessId } : {})}
          {...(inMall ? { inMall } : {})}
          {...(category !== undefined ? { category } : {})}
        />
      </section>
    </div>
  );
}

/** The button a shop shows for its catalogue. */
export function CatalogueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-subtle cat-open"
      data-action="open-catalogue"
      onClick={onClick}
    >
      📖 {t('Browse the catalogue')}
    </button>
  );
}
