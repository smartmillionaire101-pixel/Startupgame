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
import { WALLS } from '@runway/engine';
import type { WallView } from '../home/dividers';
import { wallSwatch } from '../home/dividers';

const BUY_ROOMS: { id: string; label: string; slots: string[] }[] = [
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
  walls,
  floor,
  onPlaceWall,
  onShopWalls,
  onNameRooms,
}: {
  /** Slot → the tier you own. */
  owned: Map<string, number>;
  placed: Record<string, Placement>;
  onClose: () => void;
  onPlace: (slot: string, label: string) => void;
  /** Shop note: your walls and dividers (placed or in storage), and what to do with them. */
  walls?: WallView[];
  floor?: number;
  onPlaceWall?: (w: WallView) => void;
  onShopWalls?: () => void;
  onNameRooms?: () => void;
}) {
  const { view, send, cur, busy } = useView();
  const [room, setRoom] = useState(BUY_ROOMS[0]!.id);
  const wallsOn = !!view.me.shop && !!onPlaceWall;
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
          {wallsOn && (
            <button
              type="button"
              role="tab"
              aria-selected={room === 'walls'}
              data-buy-tab="walls"
              className={`buy-tab${room === 'walls' ? ' is-on' : ''}`}
              onClick={() => setRoom('walls')}
            >
              {t('Walls & rooms')}
            </button>
          )}
        </div>
        {room === 'walls' && wallsOn ? (
          <WallsPanel
            walls={walls ?? []}
            floor={floor ?? 0}
            busy={busy}
            onPlace={onPlaceWall!}
            onShop={onShopWalls}
            onName={onNameRooms}
            onRemove={(w, sell) =>
              void send(
                { type: 'home.wall.remove', wallId: w.id, sell },
                (x: { message?: string } | null) => (x?.message ? tx(x.message) : null),
              )
            }
          />
        ) : (
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
        )}
      </section>
    </div>
  );
}

/** Shop note: your walls and dividers: put one up, move it, take it down or sell it; name rooms. */
function WallsPanel({
  walls,
  floor,
  busy,
  onPlace,
  onShop,
  onName,
  onRemove,
}: {
  walls: WallView[];
  floor: number;
  busy: boolean;
  onPlace: (w: WallView) => void;
  onShop?: () => void;
  onName?: () => void;
  onRemove: (w: WallView, sell: boolean) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <div className="buy-walls" data-buy-walls={walls.length}>
      <p className="small muted">
        {t(
          'Split an open plan into rooms: put up walls and dividers along the floor grid, then name the rooms.',
        )}
      </p>
      <div className="buy-walls-actions">
        {onShop && (
          <button
            type="button"
            className="btn btn-primary"
            data-action="shop-walls"
            onClick={onShop}
          >
            🧱 {t('Shop walls & dividers')}
          </button>
        )}
        {onName && (
          <button
            type="button"
            className="btn btn-subtle"
            data-action="name-rooms"
            onClick={onName}
          >
            🏷 {t('Name rooms')}
          </button>
        )}
      </div>
      {walls.length === 0 ? (
        <p className="small muted">
          {t('You have no walls yet. Shop for one, or buy one at a furniture store.')}
        </p>
      ) : (
        <ul className="buy-wall-list">
          {walls.map((w) => {
            const up = w.x !== undefined;
            const elsewhere = up && (w.floor ?? 0) !== floor;
            return (
              <li key={w.id} data-wall={w.id} data-placed={up ? '1' : '0'}>
                <i
                  className="buy-wall-swatch"
                  style={{ background: wallSwatch(w.kind, w.finish) }}
                />
                <span className="buy-wall-name">
                  <b>{tx(WALLS[w.kind].label)}</b>
                  <small>
                    {t('{n} m', { n: w.len })} ·{' '}
                    {up
                      ? elsewhere
                        ? t('In place on another floor')
                        : t('In place')
                      : t('In storage')}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn btn-subtle"
                  data-action="place-wall"
                  disabled={busy}
                  onClick={() => onPlace(w)}
                >
                  {up ? t('Move') : t('Put up')}
                </button>
                {up ? (
                  <button
                    type="button"
                    className="btn btn-subtle"
                    data-action="take-down"
                    disabled={busy}
                    onClick={() => onRemove(w, false)}
                  >
                    {t('Take down')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`btn ${armed === w.id ? 'btn-primary' : 'btn-subtle'}`}
                    data-action="sell-wall"
                    disabled={busy}
                    onClick={() => {
                      if (armed !== w.id) return setArmed(w.id);
                      setArmed(null);
                      onRemove(w, true);
                    }}
                  >
                    {armed === w.id ? t('Tap again to sell') : t('Sell')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
