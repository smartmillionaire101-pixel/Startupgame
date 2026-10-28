/**
 * Buy mode at home: the catalogue as pictures (the feedback round, after
 * the reference players asked for). The home stays in view above a dark
 * panel you can drag taller: Downstairs / Upstairs in a house, a search,
 * New (the next step up in each slot) · Owned · All · Design, a price
 * filter, a room filter, and "Pick several" to fill a basket and buy it all
 * at once (one `home.order` each; each is then placed in turn). Every card
 * has the thing's picture (rendered ahead from its 3D model,
 * ../shop/thumbs.ts), its footprint, stars, price and what it does for you
 * (engine data/home-style.ts boosts). Design: floors and wall paint for
 * your rooms (`home.finish`: tap to try one on, buy to keep), and your walls
 * and dividers (shop note). Placement is kept on this device (./placement.ts).
 *
 * Player feedback: more than one of a thing (another speaker, more plants,
 * `home.extra.buy` from a card you own, each then placed on its own); a
 * Close button you can see at the top of the panel (Escape, a tap on the
 * home and dragging the handle down close it too).
 */
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import './i3d.css';
import './buy.css';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { looseCmd, shopOf } from '../city/life';
import { slotLabel } from '../city/Showroom';
import { MOVABLE, extraKey, type Placement } from './placement';
import { BOOST_LABEL, WALLS } from '@runway/engine';
import type { WallView } from '../home/dividers';
import { wallSwatch } from '../home/dividers';
import { planFor, type HomePlan, type RoomId } from '../home/layout';
import { blockOf } from '../home/grounds';
import { floorThumb, furnitureThumb } from '../shop/thumbs';
import {
  BUY_ROOMS,
  basketTotal,
  boostLines,
  maxInBasket,
  buyCards,
  footprint,
  isNew,
  ownedCount,
  toggleBasket,
  type BuyItem,
  type BuyTab,
  type PriceFilter,
} from './buy';
import { builtFloor, wallPalette, type HomeFinish } from './finishes';

/** A room's name in the Design tab. */
function roomName(id: RoomId): string {
  const names: Record<RoomId, string> = {
    living: t('Living room'),
    kitchen: t('Kitchen'),
    bedroom: t('Bedroom'),
    bathroom: t('Bathroom'),
    study: t('Study'),
    dining: t('Dining room'),
    guest: t('Guest room'),
    gym: t('Gym'),
    cinema: t('Cinema'),
    hall: t('Hall'),
    landing: t('Landing'),
    office: t('Office'),
    balcony: t('Balcony'),
    terrace: t('Roof terrace'),
  };
  return names[id];
}

/** Floors as built that aren't in the catalogue. */
const BUILT_FLOOR_NAME: Record<string, string> = { bath: 'Bathroom tiles' };

/** "+Social +2": a need and its points (a basic thing's +1 reads just "+Social"). */
const boostText = (k: keyof typeof BOOST_LABEL, n: number) =>
  n > 1
    ? t('+{need} +{n}', { need: t(BOOST_LABEL[k]), n })
    : t('+{need}', { need: t(BOOST_LABEL[k]) });

export interface BuyFloor {
  /** Index into the home's floors. */
  index: number;
  /** The slots that stand on it. */
  slots: string[];
}

/**
 * Panel heights (share of the screen above the bottom bar): the usual, two
 * rows of cards on a 390×844 phone, and dragged up.
 */
const LOW = 0.7;
const TALL = 0.88;
/** Trying a floor or paint on: low enough to see the walls above it. */
const TRYING = 0.46;
/** Dragged down below this, the panel closes. */
const CLOSE_AT = 0.5;

export function BuySheet({
  owned,
  placed,
  onClose,
  onPlace,
  onPlaceAll,
  extras = [],
  onPlaceExtra,
  walls,
  floor,
  onPlaceWall,
  onShopWalls,
  onNameRooms,
  plan,
  floors,
  onFloor,
  onTurn,
  onPreview,
}: {
  /** Slot → the tier you own. */
  owned: Map<string, number>;
  placed: Record<string, Placement>;
  onClose: () => void;
  onPlace: (slot: string, label: string) => void;
  /** Bought: place these in turn (each as it's put down). */
  onPlaceAll?: (things: { slot: string; label: string; tier: number }[]) => void;
  /** More of the things you have (each placed on its own). */
  extras?: { id: string; slot: string; itemId: string }[];
  /** Bought another: place it (its key) once it's in the home. */
  onPlaceExtra?: (key: string, label: string) => void;
  /** Shop note: your walls and dividers (placed or in storage), and what to do with them. */
  walls?: WallView[];
  floor?: number;
  onPlaceWall?: (w: WallView) => void;
  onShopWalls?: () => void;
  onNameRooms?: () => void;
  /** The floor you're on (footprints, its rooms for the Design tab). */
  plan?: HomePlan;
  /** A house's floors that have things on them (Downstairs / Upstairs). */
  floors?: BuyFloor[];
  onFloor?: (index: number) => void;
  /** Turn the camera a quarter (±1). */
  onTurn?: (dir: number) => void;
  /** Try a floor or paint on (null: back to what you have). */
  onPreview?: (f: HomeFinish | null) => void;
}) {
  const { view, send, cur, busy } = useView();
  const style = view.me.homeStyle ?? null;
  const wallsOn = !!view.me.shop && !!onPlaceWall;
  const designOn = !!style || wallsOn;
  const [tab, setTab] = useState<BuyTab>('all');
  const [room, setRoom] = useState('living');
  const [price, setPrice] = useState<PriceFilter>('any');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  const [basket, setBasket] = useState<string[]>([]);
  // Round 7: how many of each (− 1 +), and one order for the lot: one van.
  const [qty, setQty] = useState<Record<string, number>>({});
  const basketOn = !!view.me.shop?.basket;
  const [armed, setArmed] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [height, setHeight] = useState(LOW);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const shop = shopOf(view);
  const items: BuyItem[] = shop.furniture;
  const pocket = view.accounts.local?.balance ?? 0;
  const here = floors?.find((f) => f.index === (floor ?? 0));
  const floorSlots = useMemo(
    () => (floors && floors.length > 1 && here ? new Set(here.slots) : undefined),
    [floors, here],
  );
  const rooms = BUY_ROOMS.filter((r) => !floorSlots || r.slots.some((s) => floorSlots.has(s)));
  const roomOn = rooms.some((r) => r.id === room) ? room : 'all';
  const pending = (slot: string) =>
    view.living.deliveries.some(
      (d) => d.owner === view.me.id && !d.complete && d.item?.slot === slot,
    );
  const cards =
    tab === 'design'
      ? []
      : buyCards(items, owned, {
          tab,
          room: roomOn,
          price,
          search,
          pocket,
          name: (f) => tx(f.label),
          ...(floorSlots ? { floorSlots } : {}),
        });
  const bag = basketTotal(basket, items, qty);
  // More than one: the kinds of thing a home can have more of, and how many.
  const extraSlots = new Set(style?.extraSlots ?? []);
  const perSlot = style?.extrasPerSlot ?? 0;
  const extrasOf = (slot: string) => extras.filter((x) => x.slot === slot).length;
  /** More of a kind on their way (in a van). */
  const comingExtras = (slot: string) =>
    view.living.deliveries.filter(
      (d) =>
        d.owner === view.me.id &&
        !d.complete &&
        (d.order as { extra?: { slot: string } } | undefined)?.extra?.slot === slot,
    ).length;
  /** How many more of a kind the home can still take, in a basket (0 before round 7). */
  const moreRoom = (slot: string) =>
    basketOn && extraSlots.has(slot)
      ? Math.max(0, perSlot - extrasOf(slot) - comingExtras(slot))
      : 0;
  const isMine = (f: BuyItem) => owned.get(f.slot) === f.tier;
  const lineMax = (f: BuyItem) => maxInBasket(isMine(f), moreRoom(f.slot));
  const setLine = (f: BuyItem, n: number) =>
    setQty((q) => ({ ...q, [f.id]: Math.max(1, Math.min(lineMax(f), n)) }));
  const buyAnother = async (f: BuyItem) => {
    setArmed(null);
    const res = await send(
      looseCmd({ type: 'home.extra.buy', itemId: f.id }),
      t('Another {item}: put it where you like.', { item: tx(f.label) }),
    );
    const id = (res as { extra?: { id: string } } | null)?.extra?.id;
    if (!id) return;
    onClose();
    onPlaceExtra?.(extraKey(f.slot, id), slotLabel(f.slot));
  };
  const spotOf = (slot: string) =>
    plan?.slots[slot] ?? planFor(5).slots[slot] ?? planFor(3).slots[slot];

  const buyOne = async (f: BuyItem) => {
    setArmed(null);
    const res = await send(
      looseCmd({ type: 'home.order', itemId: f.id }),
      (x: { message?: string } | null) =>
        x?.message ? tx(x.message) : t('{item} is on its way to your flat.', { item: tx(f.label) }),
    );
    if (res === null) return;
    onClose();
    if (MOVABLE.has(f.slot))
      onPlaceAll?.([{ slot: f.slot, label: slotLabel(f.slot), tier: f.tier }]);
  };
  /** Buy all: one order each, in the order you ticked them; stop at the first refusal. */
  const buyAll = async () => {
    setBuying(true);
    const done: BuyItem[] = [];
    if (basketOn) {
      // Round 7: the basket is one order, in one van; more of a thing comes in it too.
      const n = bag.count;
      const res = await send(
        looseCmd({
          type: 'shop.order',
          lines: bag.items.map((f) => ({
            kind: 'furniture',
            itemId: f.id,
            qty: Math.max(1, Math.min(lineMax(f), qty[f.id] ?? 1)),
          })),
        }),
        n === 1
          ? t('{item} is on its way to your flat.', { item: tx(bag.items[0]!.label) })
          : t('{n} things are on their way to your home, in one van.', { n }),
      ).finally(() => setBuying(false));
      if (res === null) return;
      setBasket([]);
      setQty({});
      onClose();
      // Place the new ones now (the spot is kept for the van); more of a thing when unpacked.
      onPlaceAll?.(
        bag.items
          .filter((f) => !isMine(f) && MOVABLE.has(f.slot))
          .map((f) => ({ slot: f.slot, label: slotLabel(f.slot), tier: f.tier })),
      );
      return;
    }
    try {
      for (const f of bag.items) {
        const last = done.length === bag.items.length - 1;
        const res = await send(
          looseCmd({ type: 'home.order', itemId: f.id }),
          (x: { message?: string } | null) =>
            last
              ? bag.items.length > 1
                ? t('{n} things are on their way to your home.', { n: bag.items.length })
                : x?.message
                  ? tx(x.message)
                  : null
              : null,
        );
        if (res === null) break;
        done.push(f);
      }
    } finally {
      setBuying(false);
    }
    if (!done.length) return;
    setBasket((b) => b.filter((id) => !done.some((f) => f.id === id)));
    onClose();
    onPlaceAll?.(
      done
        .filter((f) => MOVABLE.has(f.slot))
        .map((f) => ({ slot: f.slot, label: slotLabel(f.slot), tier: f.tier })),
    );
  };

  const onGrip = (e: ReactPointerEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, h: height, moved: false };
  };
  const onGripMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    const vh = window.innerHeight || 800;
    setHeight(Math.max(0.2, Math.min(0.9, d.h + dy / vh)));
  };
  const onGripUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // A tap toggles; a drag settles at the nearer height; dragged well down, it closes.
    if (!d.moved) setHeight(d.h > (LOW + TALL) / 2 ? LOW : TALL);
    else if (height < CLOSE_AT) onClose();
    else setHeight((h) => (h > (LOW + TALL) / 2 ? TALL : LOW));
  };
  const tall = height > (LOW + TALL) / 2;

  const tabBtn = (id: BuyTab, label: string, extra?: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      data-buy-tab={id}
      className={`buy-chip${tab === id ? ' is-on' : ''}`}
      onClick={() => {
        setTab(id);
        setArmed(null);
        if (id !== 'design') onPreview?.(null);
      }}
    >
      {label}
      {extra !== undefined && <span className="buy-count">{extra}</span>}
    </button>
  );

  return (
    <div className="buy-back" data-buy-mode="">
      <div className="buy-top">
        <span className="buy-pill">
          <span aria-hidden="true">🛒</span> {t('Buy mode')}
        </span>
        <span className="buy-pill buy-pocket" data-pocket={pocket}>
          {money(pocket, cur)}
        </span>
        <span className="buy-top-gap" />
        {onTurn && (
          <>
            <button
              type="button"
              className="buy-round"
              aria-label={t('Turn left')}
              onClick={() => onTurn(-1)}
            >
              ⟲
            </button>
            <button
              type="button"
              className="buy-round"
              aria-label={t('Turn right')}
              onClick={() => onTurn(1)}
            >
              ⟳
            </button>
          </>
        )}
      </div>
      <section
        className="buy-sheet"
        role="dialog"
        aria-label={t('Buy mode')}
        data-tall={tall ? '1' : '0'}
        style={{ height: `${Math.round(height * 100)}%` }}
      >
        <div className="buy-head">
          <button
            type="button"
            className="buy-grip"
            aria-label={tall ? t('Show more of your home') : t('Show more of the catalogue')}
            onPointerDown={onGrip}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={() => (drag.current = null)}
          >
            <i />
          </button>
          <button
            type="button"
            className="buy-close"
            data-action="close-buy"
            aria-label={t('Close Buy mode')}
            onClick={onClose}
          >
            <span aria-hidden="true">✕</span> {t('Close')}
          </button>
        </div>
        <div className="buy-row">
          {floors && floors.length > 1 && (
            <div className="buy-floors" role="group" aria-label={t('Floors')}>
              {floors.map((f) => (
                <button
                  key={f.index}
                  type="button"
                  data-buy-floor={f.index}
                  aria-pressed={f.index === (floor ?? 0)}
                  className={f.index === (floor ?? 0) ? 'is-on' : ''}
                  onClick={() => onFloor?.(f.index)}
                >
                  {f.index === 0 ? `↓ ${t('Downstairs')}` : `↑ ${t('Upstairs')}`}
                </button>
              ))}
            </div>
          )}
          <label className="buy-search">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              value={search}
              placeholder={t('Search')}
              aria-label={t('Search the catalogue')}
              onChange={(e) => {
                setSearch(e.target.value);
                if (tab === 'design') setTab('all');
              }}
            />
          </label>
        </div>
        <div className="buy-row buy-tabs" role="tablist" aria-label={t('Catalogue')}>
          {tabBtn('new', `✦ ${t('New')}`)}
          {tabBtn('owned', `📦 ${t('Owned')}`, String(ownedCount(items, owned)))}
          {tabBtn('all', `▦ ${t('All')}`)}
          {designOn && tabBtn('design', `🎨 ${t('Design')}`)}
        </div>
        {tab === 'design' ? (
          <DesignPanel
            plan={plan}
            floor={floor ?? 0}
            style={style}
            busy={busy}
            cur={cur}
            onPreview={onPreview}
            onTrying={(on) => setHeight(on ? TRYING : LOW)}
            onApply={(cmd, label) => send(looseCmd(cmd), label)}
            walls={
              wallsOn ? (
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
              ) : null
            }
          />
        ) : (
          <>
            <div className="buy-row">
              <label className="buy-chip buy-select">
                <span aria-hidden="true">▾</span>
                <select
                  value={price}
                  aria-label={t('Price')}
                  data-buy-price=""
                  onChange={(e) => setPrice(e.target.value as PriceFilter)}
                >
                  <option value="any">{t('Any price')}</option>
                  <option value="afford">{t('What I can afford')}</option>
                  <option value="low">{t('Cheapest first')}</option>
                  <option value="high">{t('Dearest first')}</option>
                </select>
              </label>
              <button
                type="button"
                className={`buy-chip${picking ? ' is-pick' : ''}`}
                data-action="pick-several"
                aria-pressed={picking}
                onClick={() => {
                  setPicking((p) => !p);
                  setArmed(null);
                }}
              >
                ☑ {picking ? t('Picking') : t('Pick several')}
              </button>
              <span className="buy-top-gap" />
              <label className="buy-room">
                <select
                  value={roomOn}
                  aria-label={t('Room')}
                  data-buy-room=""
                  onChange={(e) => setRoom(e.target.value)}
                >
                  <option value="all">{t('All rooms')}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t(r.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="buy-cards"
              role="list"
              aria-label={t('Catalogue')}
              data-cards={cards.length}
            >
              {cards.length === 0 && (
                <p className="buy-empty">
                  {tab === 'owned'
                    ? t('Nothing of yours here yet.')
                    : tab === 'new'
                      ? t('You have the best of everything here.')
                      : t('Nothing matches.')}
                </p>
              )}
              {cards.map((f) => {
                const mine = owned.get(f.slot) === f.tier;
                const wait = pending(f.slot);
                const picked = basket.includes(f.id);
                const isArmed = armed === f.id;
                const fresh = !mine && isNew(f, owned);
                const boosts = style ? boostLines(style.boosts[f.id]) : [];
                // Round 7: more of a thing you have can go in the basket too.
                const canPick = (!mine || moreRoom(f.slot) > 0) && !wait;
                // More than one: another of a thing you have (a speaker, plants, art).
                const more = mine && !picking && extraSlots.has(f.slot);
                const pickMine = picking && mine && canPick;
                const have = (mine ? 1 : 0) + extras.filter((x) => x.itemId === f.id).length;
                const moreArmed = armed === `more:${f.id}`;
                return (
                  <div key={f.id} role="listitem" className="buy-cell">
                    <button
                      type="button"
                      className={`buy-card tier-${f.tier}${mine ? ' is-mine' : ''}${isArmed ? ' is-armed' : ''}${picked ? ' is-picked' : ''}`}
                      data-buy-item={f.id}
                      data-buy-slot={f.slot}
                      data-owned={mine ? '1' : '0'}
                      data-new={fresh ? '1' : '0'}
                      data-picked={picked ? '1' : '0'}
                      aria-pressed={picking ? picked : undefined}
                      disabled={
                        busy ||
                        buying ||
                        (picking
                          ? !canPick
                          : wait || (!mine && pocket < f.price) || (mine && !MOVABLE.has(f.slot)))
                      }
                      onClick={() => {
                        if (picking)
                          return setBasket((b) =>
                            toggleBasket(b, f, items, owned, (x) => moreRoom(x.slot) > 0),
                          );
                        if (mine) return onPlace(f.slot, slotLabel(f.slot));
                        if (isArmed) return void buyOne(f);
                        setArmed(f.id);
                      }}
                    >
                      <span className="buy-pic">
                        <img src={furnitureThumb(f.id)} alt="" draggable={false} loading="lazy" />
                        <span className="buy-foot">{footprint(spotOf(f.slot))}</span>
                        <span className="buy-stars" aria-label={t('{n} stars', { n: f.tier })}>
                          {'★'.repeat(f.tier)}
                        </span>
                        {mine ? (
                          <span className="buy-tag is-owned">{t('OWNED')}</span>
                        ) : fresh ? (
                          <span className="buy-tag is-new">{t('NEW')}</span>
                        ) : null}
                        {picking && canPick && (
                          <span className="buy-tick" aria-hidden="true">
                            {picked ? '✓' : ''}
                          </span>
                        )}
                        {have > 1 && (
                          <span className="buy-have" data-have={have}>
                            ×{have}
                          </span>
                        )}
                      </span>
                      <span className="buy-name">{tx(f.label)}</span>
                      <span className={`buy-price${mine ? ' is-yours' : ''}`}>
                        {pickMine
                          ? t('+ Another · {price}', { price: money(f.price, cur) })
                          : mine
                            ? MOVABLE.has(f.slot)
                              ? placed[f.slot]
                                ? t('Yours · tap to move again')
                                : t('Yours · tap to move')
                              : t('Yours')
                            : wait
                              ? t('On its way')
                              : isArmed
                                ? t('Tap again to buy')
                                : money(f.price, cur)}
                      </span>
                      {boosts.length > 0 && (
                        <span className="buy-boost">
                          {boosts
                            .slice(0, 2)
                            .map(([k, n]) => boostText(k, n))
                            .join(' · ')}
                        </span>
                      )}
                    </button>
                    {more && (
                      <button
                        type="button"
                        className={`buy-more${moreArmed ? ' is-armed' : ''}`}
                        data-buy-another={f.id}
                        disabled={busy || buying || extrasOf(f.slot) >= perSlot || pocket < f.price}
                        onClick={() => (moreArmed ? void buyAnother(f) : setArmed(`more:${f.id}`))}
                      >
                        {extrasOf(f.slot) >= perSlot
                          ? t('That’s the most')
                          : moreArmed
                            ? t('Tap again · {price}', { price: money(f.price, cur) })
                            : t('+ Another · {price}', { price: money(f.price, cur) })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {picking && basketOn && bag.items.length > 0 && (
              <ul className="buy-basket-lines" aria-label={t('Basket')}>
                {bag.items.map((f) => {
                  const n = Math.max(1, Math.min(lineMax(f), qty[f.id] ?? 1));
                  return (
                    <li key={f.id} data-basket-line={f.id} data-qty={n}>
                      <img src={furnitureThumb(f.id)} alt="" />
                      <span className="buy-basket-name">
                        {isMine(f) ? t('Another {item}', { item: tx(f.label) }) : tx(f.label)}
                      </span>
                      <span className="buy-qty" role="group" aria-label={t('How many')}>
                        <button
                          type="button"
                          aria-label={t('One fewer')}
                          data-action="qty-down"
                          disabled={n <= 1}
                          onClick={() => setLine(f, n - 1)}
                        >
                          −
                        </button>
                        <b>{n}</b>
                        <button
                          type="button"
                          aria-label={t('One more')}
                          data-action="qty-up"
                          disabled={n >= lineMax(f)}
                          onClick={() => setLine(f, n + 1)}
                        >
                          +
                        </button>
                      </span>
                      <b className="buy-basket-price">{money(f.price * n, cur)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
            {picking && (
              <div
                className="buy-basket"
                data-basket={bag.items.length}
                data-count={bag.count}
                data-total={bag.total}
              >
                <span className="buy-basket-pics" aria-hidden="true">
                  {bag.items.slice(0, 4).map((f) => (
                    <img key={f.id} src={furnitureThumb(f.id)} alt="" />
                  ))}
                </span>
                <span className="buy-basket-text">
                  {bag.items.length === 0 ? (
                    <>
                      <b>{t('Basket empty')}</b> · {t('pick something to place')}
                    </>
                  ) : (
                    <>
                      <b>{t('{n} in basket', { n: bag.count })}</b> · {money(bag.total, cur)}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  className="buy-all"
                  data-action="buy-all"
                  disabled={bag.items.length === 0 || busy || buying || bag.total > pocket}
                  onClick={() => void buyAll()}
                >
                  {bag.total > pocket ? t('Not enough money') : t('Buy all · place')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

type HomeStyleView = NonNullable<ReturnType<typeof useView>['view']['me']['homeStyle']>;

/** Design: floors and paint for your rooms (try one on, then use or buy it), and your walls. */
function DesignPanel({
  plan,
  floor,
  style,
  busy,
  cur,
  onPreview,
  onTrying,
  onApply,
  walls,
}: {
  plan?: HomePlan;
  floor: number;
  style: HomeStyleView | null;
  busy: boolean;
  cur: string;
  onPreview?: (f: HomeFinish | null) => void;
  /** Trying a finish on (or not): the panel steps down so the home shows above it. */
  onTrying?: (on: boolean) => void;
  onApply: (cmd: Record<string, unknown> & { type: string }, done: string) => Promise<unknown>;
  walls: ReactNode;
}) {
  const level = plan?.level ?? floor;
  const ids = [...new Set((plan?.rooms ?? []).map((r) => r.id))];
  const [room, setRoom] = useState<RoomId | null>(
    ids.includes('living') ? 'living' : (ids[0] ?? null),
  );
  const [trying, setTrying] = useState<{ surface: 'floor' | 'wall'; id: string } | null>(null);
  if (!style)
    return (
      <div className="buy-design" data-buy-design="">
        {walls}
      </div>
    );
  const block = plan ? blockOf(plan) : null;
  const key = room ? `${level}:${room}` : '';
  const built = room && plan ? builtFloor(room, plan.tier, block)[0] : null;
  const floorNow = (room && style.chosen.floors[key]) || built;
  const builtWalls = wallPalette(block).outer;
  const wallNow = style.chosen.wall;
  const specOf = (surface: 'floor' | 'wall', id: string) =>
    (surface === 'floor' ? style.floors : style.walls).find((f) => f.id === id);
  const preview = (surface: 'floor' | 'wall', id: string) => {
    const floors = { ...style.chosen.floors };
    let wall = style.chosen.wall;
    if (surface === 'floor' && room) {
      if (id === built) delete floors[key];
      else floors[key] = id;
    } else if (surface === 'wall') wall = id === 'built' ? null : id;
    onPreview?.({ floors, wall });
  };
  const cancel = () => {
    setTrying(null);
    onPreview?.(null);
    onTrying?.(false);
  };
  /** Put a finish on for good: `home.finish` (buys it, if it isn't yours yet). */
  const apply = async (surface: 'floor' | 'wall', id: string) => {
    const spec = specOf(surface, id);
    const finish =
      surface === 'floor' ? (id === built ? 'default' : id) : id === 'built' ? 'default' : id;
    const name = spec ? tx(spec.label) : t('As built');
    const r = await onApply(
      {
        type: 'home.finish',
        surface,
        finish,
        floor: level,
        ...(surface === 'floor' && room ? { room } : {}),
      },
      spec && spec.price > 0 && !spec.owned
        ? t('{finish}: yours for any room now.', { finish: name })
        : t('{finish}: done.', { finish: name }),
    );
    if (r !== null) cancel();
    else if (!trying) onPreview?.(null);
  };
  /**
   * Play-test: tapping the owned Sage green, then Close, left the walls as
   * they were (it was only tried on). What's yours (or free) goes on at once;
   * what you'd buy is tried on, with the home shown above a lower panel.
   */
  const tryOn = (surface: 'floor' | 'wall', id: string) => {
    const on = surface === 'floor' ? id === floorNow : id === (wallNow ?? 'built');
    if (on) return cancel();
    const spec = specOf(surface, id);
    const yours =
      surface === 'floor' ? id === built || !!spec?.owned : id === 'built' || !!spec?.owned;
    preview(surface, id);
    if (yours || (spec?.price ?? 0) === 0) {
      setTrying(null);
      onTrying?.(false);
      void apply(surface, id);
      return;
    }
    setTrying({ surface, id });
    onTrying?.(true);
  };
  const spec = trying && specOf(trying.surface, trying.id);
  const isNow = trying
    ? trying.surface === 'floor'
      ? trying.id === floorNow
      : trying.id === (wallNow ?? 'built')
    : true;
  const state = (surface: 'floor' | 'wall', id: string, owned: boolean, price: number) => {
    const now = surface === 'floor' ? id === floorNow : id === (wallNow ?? 'built');
    return now
      ? { cls: 'is-now', text: t('On now') }
      : owned || price === 0
        ? { cls: 'is-yours', text: t('Yours · free') }
        : { cls: 'is-price', text: money(price, cur) };
  };
  const swatch = (
    surface: 'floor' | 'wall',
    id: string,
    label: string,
    pic: ReactNode,
    owned: boolean,
    price: number,
  ) => {
    const st = state(surface, id, owned, price);
    const sel = trying?.surface === surface && trying.id === id;
    return (
      <button
        key={id}
        type="button"
        className={`buy-swatch ${st.cls}${sel ? ' is-trying' : ''}`}
        data-finish={`${surface}:${id}`}
        data-state={st.cls.slice(3)}
        aria-pressed={sel}
        disabled={busy || (surface === 'floor' && !room)}
        onClick={(e) => {
          const el = e.currentTarget;
          tryOn(surface, id);
          // The panel steps down to show the home: keep the swatch you tapped in view.
          window.setTimeout(() => el.scrollIntoView?.({ block: 'nearest' }), 220);
        }}
      >
        <span className="buy-swatch-pic">{pic}</span>
        <b>{label}</b>
        <small>{st.text}</small>
      </button>
    );
  };
  const ownedWalls = style.walls.filter((w) => w.owned).length + 1;
  return (
    <div className="buy-design" data-buy-design="">
      {ids.length > 0 && (
        <div className="buy-row buy-rooms" role="group" aria-label={t('Rooms')}>
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              data-design-room={id}
              aria-pressed={id === room}
              className={`buy-chip${id === room ? ' is-on' : ''}`}
              onClick={() => {
                setRoom(id);
                if (trying?.surface === 'floor') cancel();
              }}
            >
              {roomName(id)}
            </button>
          ))}
        </div>
      )}
      <div className="buy-design-head">
        <b>{t('Floor')}</b>
        <small>{t('tap to try it on · buy to keep')}</small>
      </div>
      <div className="buy-swatches" data-swatches="floor">
        {built &&
          !style.floors.some((f) => f.id === built) &&
          swatch(
            'floor',
            built,
            t(BUILT_FLOOR_NAME[built] ?? 'As built'),
            <i className={`buy-floor-built is-${built}`} />,
            true,
            0,
          )}
        {style.floors.map((f) =>
          swatch(
            'floor',
            f.id,
            tx(f.label),
            <img src={floorThumb(f.id)} alt="" draggable={false} loading="lazy" />,
            f.owned || f.id === built,
            f.id === built ? 0 : f.price,
          ),
        )}
      </div>
      <div className="buy-design-head">
        <b>{t('Walls')}</b>
        <small>{t('{n} yours', { n: ownedWalls })}</small>
      </div>
      <div className="buy-swatches" data-swatches="wall">
        {swatch('wall', 'built', t('As built'), <i style={{ background: builtWalls }} />, true, 0)}
        {style.walls.map((w) =>
          swatch(
            'wall',
            w.id,
            tx(w.label),
            <i style={{ background: w.swatch }} />,
            w.owned,
            w.price,
          ),
        )}
      </div>
      {trying && !isNow && (
        <div className="buy-try" data-trying={`${trying.surface}:${trying.id}`}>
          <span>
            {trying.surface === 'floor' && room
              ? t('Trying it on: {room}', { room: roomName(room) })
              : t('Trying it on: every wall')}
          </span>
          <button type="button" className="buy-try-cancel" onClick={cancel}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="buy-all"
            data-action="apply-finish"
            disabled={busy}
            onClick={() => void apply(trying.surface, trying.id)}
          >
            {spec && spec.price > 0
              ? t('Buy · {price}', { price: money(spec.price, cur) })
              : t('Use it')}
          </button>
        </div>
      )}
      {walls && (
        <div className="buy-design-head">
          <b>{t('Walls & dividers')}</b>
        </div>
      )}
      {walls}
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

/**
 * While placing: turn it, nudge it, put it down (or back where it was). The
 * arrows are as you see the home (the scene turns them onto the floor
 * grid); a picture on a wall moves along it, to the next wall, and up or down.
 */
export function PlaceBar({
  label,
  ok,
  moved,
  onWall = false,
  coming = false,
  lift = 0,
  at,
  onRotate,
  onNudge,
  onLift,
  onDone,
  onReset,
  onCancel,
}: {
  label: string;
  ok: boolean;
  moved: boolean;
  /** It hangs on a wall. */
  onWall?: boolean;
  /**
   * Bought and still on its way (play-test: "Put it here" only kept the spot;
   * the thing came with the delivery): the spot is kept for when you unpack.
   */
  coming?: boolean;
  /** On a wall: a step lower (-1) or higher (1). */
  lift?: number;
  /** Where it is ('x,y,rot', for tests). */
  at?: string;
  onRotate: () => void;
  /** A step on screen: x right, y down. */
  onNudge: (dx: number, dy: number) => void;
  onLift?: (d: number) => void;
  onDone: () => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="place-bar"
      role="toolbar"
      aria-label={t('Place {thing}', { thing: label })}
      data-on-wall={onWall ? '1' : undefined}
      data-ok={ok ? '1' : '0'}
      data-at={at}
    >
      <p className="place-hint">
        {!ok
          ? onWall
            ? t('Hang it on a wall.')
            : t('It doesn’t fit there.')
          : onWall
            ? t('Tap by a wall or use the arrows to move it along. Then hang it here.')
            : t('Tap the floor or drag it to move it. Turn it, then put it here.')}
        {ok && coming && <> {t('It’s on its way: it goes here when you unpack the delivery.')}</>}
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
      {onLift && (
        <div className="place-row">
          <button type="button" disabled={lift <= -1} onClick={() => onLift(-1)}>
            ⤓ {t('Lower')}
          </button>
          <button type="button" disabled={lift >= 1} onClick={() => onLift(1)}>
            ⤒ {t('Higher')}
          </button>
        </div>
      )}
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
          {coming ? t('Keep this spot') : onWall ? t('Hang it here') : t('Put it here')}
        </button>
      </div>
    </div>
  );
}
