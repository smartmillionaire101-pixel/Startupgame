/**
 * A shop's "Browse the catalogue": the same catalogue as the Shop app, of
 * what this shop sells at its prices, bought here (free and at once). At
 * home, Buy mode's walls open it online (delivered).
 */
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_LABEL, type CatalogCategory } from '@runway/engine';
import { t, tx } from '../i18n';
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
  dock,
  onBack,
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
  /**
   * Round 7 (#21): at home, the catalogue opens in Buy mode's bottom panel
   * (docked to the bottom edge, the home above it), its title the category
   * you're looking at; ‹ Buy goes back to Buy mode.
   */
  dock?: boolean;
  onBack?: () => void;
}) {
  const [shown, setShown] = useState<CatalogCategory | null>(category ?? null);
  // Escape closes it (play-test: it didn't), and only it: not the shop around it.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div
      className={`cat-sheet-back${dock ? ' cat-dock' : ''}`}
      onClick={dock ? undefined : onClose}
    >
      <section
        className="cat-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('Catalogue')}
        data-catalogue-sheet=""
        onClick={(e) => e.stopPropagation()}
      >
        {dock ? (
          <>
            <div className="cat-grip" aria-hidden="true">
              <i />
            </div>
            <header>
              {onBack && (
                <button
                  type="button"
                  className="cat-back"
                  data-action="back-to-buy"
                  onClick={onBack}
                >
                  ‹ {t('Buy')}
                </button>
              )}
              <h3 data-cat-title={shown ?? 'all'}>
                📖 {shown ? tx(CATEGORY_LABEL[shown]) : title}
                <small>{t('Online shop · delivered to your door')}</small>
              </h3>
              <button type="button" className="cat-close" aria-label={t('Close')} onClick={onClose}>
                <span aria-hidden="true">✕</span> {t('Close')}
              </button>
            </header>
          </>
        ) : (
          <header>
            <h3>📖 {title}</h3>
            <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
              ✕
            </button>
          </header>
        )}
        <Catalogue
          mode={mode}
          entries={entries}
          currency={currency}
          {...(businessId ? { businessId } : {})}
          {...(inMall ? { inMall } : {})}
          {...(category !== undefined ? { category } : {})}
          onCategory={setShown}
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
