/**
 * Wave 9 §C: Buy mode at home. A catalogue sheet of everything for your home
 * (by room, with prices, comfort and what you own); buying sends `home.order`
 * (the nearest showroom delivers) and then you place it: tap the floor to
 * move it, turn it, and put it down. Placement is kept on this device
 * (./placement.ts).
 */
import { useState } from 'react';
import './i3d.css';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { looseCmd, shopOf } from '../city/life';
import { slotLabel } from '../city/Showroom';
import { MOVABLE, type Placement } from './placement';

export const BUY_ROOMS: { id: string; label: string; slots: string[] }[] = [
  {
    id: 'living',
    label: 'Living room',
    slots: ['sofa', 'tv', 'sound', 'gaming', 'rug', 'lights', 'plants', 'art', 'books'],
  },
  { id: 'bedroom', label: 'Bedroom', slots: ['bed', 'wardrobe', 'desk', 'laptop'] },
  { id: 'kitchen', label: 'Kitchen', slots: ['kitchen', 'fridge', 'coffee', 'dining'] },
  { id: 'utility', label: 'Utility', slots: ['washer', 'cooling', 'power', 'wifi'] },
];

const SLOT_ICON: Record<string, string> = {
  sofa: '🛋',
  tv: '📺',
  sound: '🔊',
  gaming: '🎮',
  rug: '🟫',
  lights: '💡',
  plants: '🪴',
  art: '🖼',
  books: '📚',
  bed: '🛏',
  wardrobe: '🚪',
  desk: '🪑',
  laptop: '💻',
  kitchen: '🍳',
  fridge: '🧊',
  coffee: '☕',
  dining: '🍽',
  washer: '🧺',
  cooling: '❄',
  power: '🔋',
  wifi: '📶',
};

export function BuySheet({
  owned,
  placed,
  onClose,
  onPlace,
}: {
  /** Slot → the tier you own. */
  owned: Map<string, number>;
  placed: Record<string, Placement>;
  onClose: () => void;
  onPlace: (slot: string, label: string) => void;
}) {
  const { view, send, cur, busy } = useView();
  const [room, setRoom] = useState(BUY_ROOMS[0]!.id);
  const [armed, setArmed] = useState<string | null>(null);
  const shop = shopOf(view);
  const pocket = view.accounts.local?.balance ?? 0;
  const r = BUY_ROOMS.find((x) => x.id === room)!;
  const buy = async (id: string, _slot: string, label: string) => {
    setArmed(null);
    const res = await send(
      looseCmd({ type: 'home.order', itemId: id }),
      (x: { message?: string } | null) =>
        x?.message ? tx(x.message) : t('{item} is on its way to your flat.', { item: tx(label) }),
    );
    if (res === null) return;
    onClose();
  };
  return (
    <div className="home-sheet-back buy-back" onClick={onClose}>
      <section
        className="home-sheet buy-sheet"
        role="dialog"
        aria-label={t('Buy mode')}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>{t('Buy mode')}</h3>
          <span className="small muted buy-pocket" data-pocket={pocket}>
            {money(pocket, cur)}
          </span>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="buy-tabs" role="tablist" aria-label={t('Catalogue')}>
          {BUY_ROOMS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === room}
              className={`buy-tab${x.id === room ? ' is-on' : ''}`}
              onClick={() => setRoom(x.id)}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        <div className="buy-grid" role="list" aria-label={t('Catalogue')}>
          {r.slots.map((slot) => {
            const items = shop.furniture
              .filter((f) => f.slot === slot)
              .sort((a, b) => a.tier - b.tier);
            const have = owned.get(slot);
            return (
              <div key={slot} className="buy-slot" role="listitem" data-buy-slot={slot}>
                <div className="buy-slot-head">
                  <span aria-hidden="true">{SLOT_ICON[slot] ?? '📦'}</span>
                  <b>{slotLabel(slot)}</b>
                  {have && MOVABLE.has(slot) && (
                    <button
                      type="button"
                      className="buy-move"
                      onClick={() => onPlace(slot, slotLabel(slot))}
                    >
                      {placed[slot] ? t('Move again') : t('Move')}
                    </button>
                  )}
                </div>
                <div className="buy-items">
                  {items.map((f) => {
                    const mine = have === f.tier;
                    const pending = view.living.deliveries.some(
                      (d) => d.owner === view.me.id && !d.complete && d.item?.slot === slot,
                    );
                    const isArmed = armed === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`buy-item tier-${f.tier}${mine ? ' is-mine' : ''}${isArmed ? ' is-armed' : ''}`}
                        data-buy-item={f.id}
                        data-owned={mine ? '1' : '0'}
                        disabled={mine || pending || busy || pocket < f.price}
                        onClick={() => (isArmed ? void buy(f.id, slot, f.label) : setArmed(f.id))}
                      >
                        <span className="buy-stars" aria-hidden="true">
                          {'★'.repeat(f.tier)}
                        </span>
                        <span className="buy-name">{tx(f.label)}</span>
                        <span className="buy-price">
                          {mine
                            ? t('Yours ✓')
                            : pending
                              ? 'On its way'
                              : isArmed
                                ? t('Tap again to buy')
                                : money(f.price, cur)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** While placing: turn it, nudge it, put it down (or back where it was). */
export function PlaceBar({
  label,
  ok,
  moved,
  onRotate,
  onNudge,
  onDone,
  onReset,
  onCancel,
}: {
  label: string;
  ok: boolean;
  moved: boolean;
  onRotate: () => void;
  onNudge: (dx: number, dy: number) => void;
  onDone: () => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="place-bar" role="toolbar" aria-label={t('Place {thing}', { thing: label })}>
      <p className="place-hint">
        {ok
          ? t('Tap the floor to move it. Turn it, then put it here.')
          : t('It doesn’t fit there.')}
      </p>
      <div className="place-row">
        <button type="button" aria-label={t('Left')} onClick={() => onNudge(-1, 0)}>
          ←
        </button>
        <button type="button" aria-label={t('Up')} onClick={() => onNudge(0, -1)}>
          ↑
        </button>
        <button type="button" aria-label={t('Down')} onClick={() => onNudge(0, 1)}>
          ↓
        </button>
        <button type="button" aria-label={t('Right')} onClick={() => onNudge(1, 0)}>
          →
        </button>
        <button type="button" onClick={onRotate}>
          ⟳ {t('Turn')}
        </button>
      </div>
      <div className="place-row">
        <button type="button" className="place-cancel" onClick={onCancel}>
          {t('Cancel')}
        </button>
        {moved && (
          <button type="button" onClick={onReset}>
            {t('Put it back')}
          </button>
        )}
        <button type="button" className="place-done" disabled={!ok} onClick={onDone}>
          {t('Put it here')}
        </button>
      </div>
    </div>
  );
}
