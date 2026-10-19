/**
 * Walking the mall in 3D (player feedback: "people should go to the malls
 * to shop"): the HUD over ../../interiors3d/Mall3D.tsx. Tap the floor to
 * walk, a shop's sign to walk there and go in; Turn, Look around (through
 * your own eyes, a compass along the top), Photo and a Directory of the
 * shops. In a shop, its stock is tagged with the city's prices: tap one for
 * its card (colours to try on, Add to basket, Buy now). Paying is the
 * engine's `mall.buy`, once per item (a basket pays them one after another)
 * and a receipt lists what you got.
 */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MallShopId } from '@runway/engine';
import { TOP_COLOURS } from '@runway/engine';
import { money, moneyExact } from '../../format';
import { t, tx } from '../../i18n';
import { PhotoSheet, addPhoto } from '../../home/HomePhotos';
import type { Mall3DApi, Mall3DHit } from '../../interiors3d/Mall3D';
import type { AvatarLook } from '../art';
import { looseCmd } from '../life';
import type { MallItemView, MallView } from '../leisure';
import {
  COUNTERS,
  backOut,
  bearing,
  compassPoint,
  displays,
  goal,
  landmarks,
  regionOf,
  shopToWorld,
  type RoomShop,
  type Where,
} from './layout';
import {
  SHOP_COLOUR,
  SHOP_ICON,
  SHOP_ORDER,
  colourName,
  isWearable,
  itemIcon,
  shopBlurb,
  wearing,
} from './shops';

const Mall3D = lazy(() => import('../../interiors3d/Mall3D'));

interface Line {
  item: MallItemView;
  colour?: string;
}
interface Receipt {
  lines: (Line & { price: number; note: string })[];
  total: number;
  shop: MallShopId | null;
}

export interface MallWalkProps {
  me: AvatarLook;
  shoppers: AvatarLook[];
  names: Record<MallShopId, string>;
  mallName: string;
  city: string;
  mall: MallView | null;
  /** What the fashion shop shows you (clothes for who you are). */
  items: MallItemView[];
  pocket: number;
  currency: string;
  busy: boolean;
  send: <R>(cmd: never) => Promise<R | null>;
  reduced: boolean;
  where: Where;
  onWhere: (w: Where) => void;
  onLooking: (on: boolean) => void;
  onFail: () => void;
  /** Shown until the first full frame (the 2D mall). */
  placeholder: ReactNode;
}

const shopOfItem = (items: MallItemView[], id: string) => items.find((i) => i.id === id);

export function MallWalk(p: MallWalkProps) {
  const api = useRef<Mall3DApi | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [walking, setWalking] = useState<{ to: MallShopId | null; left: number | null } | null>(
    null,
  );
  const [looking, setLooking] = useState(false);
  const [facing, setFacing] = useState<{ h: number; x: number; z: number } | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [colour, setColour] = useState<string>(TOP_COLOURS[5]);
  const [basket, setBasket] = useState<Line[]>([]);
  const [sheet, setSheet] = useState<'basket' | 'directory' | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paid, setPaid] = useState<{ total: number; key: number } | null>(null);
  const [photo, setPhoto] = useState<{ src: string | null } | null>(null);
  const [flash, setFlash] = useState(0);
  const [paying, setPaying] = useState(false);
  /** Where you were when the Directory opened (its distances). */
  const [dirFrom, setDirFrom] = useState<{ x: number; z: number } | null>(null);
  // The open sheet's height: the 3D picture moves up so what's behind it shows.
  const [lift, setLift] = useState(0);
  const sheetObs = useRef<ResizeObserver | null>(null);
  const sheetRef = useCallback((el: HTMLElement | null) => {
    sheetObs.current?.disconnect();
    sheetObs.current = null;
    if (!el) return setLift(0);
    const measure = () => setLift(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'function') {
      sheetObs.current = new ResizeObserver(measure);
      sheetObs.current.observe(el);
    }
  }, []);
  const { where, items, currency: cur } = p;
  const fmt = (v: number) => money(v, cur);
  const ds = useMemo(() => displays(items), [items]);
  const stock = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        shop: i.shop,
        ...(i.topStyle ? { topStyle: i.topStyle } : {}),
      })),
    [items],
  );
  const cardItem = card ? shopOfItem(items, card) : undefined;
  // What you're trying on shows on you.
  const shown = cardItem && isWearable(cardItem) ? wearing(p.me, cardItem, colour) : p.me;
  const live = useRef(p);
  useEffect(() => {
    live.current = p;
  });

  const go = useCallback(
    (shop: MallShopId) => {
      setSheet(null);
      setCard(null);
      const a = api.current;
      if (!a) return;
      if (looking) {
        a.look(false);
        setLooking(false);
        live.current.onLooking(false);
      }
      const left = a.walkTo(goal(shop), `enter:${shop}`);
      if (left !== null && left >= 0.5 && !live.current.reduced)
        setWalking({ to: shop, left: Math.ceil(left) });
    },
    [looking],
  );

  const walkTo = (x: number, z: number) => {
    const a = api.current;
    if (!a) return;
    setCard(null);
    const r = regionOf(x, z);
    const to = r === 'concourse' || r === where ? null : r;
    const left = a.walkTo({ x, z });
    if (left !== null && left >= 0.5 && !p.reduced) setWalking({ to, left: Math.ceil(left) });
  };

  const onTap = (hit: Mall3DHit, double: boolean) => {
    if (looking) {
      // Looking around: a double tap walks you there.
      if (!double || !hit.floor) return;
      api.current?.look(false);
      setLooking(false);
      p.onLooking(false);
      walkTo(hit.floor.x, hit.floor.z);
      return;
    }
    if (hit.item) return openItem(hit.item);
    if (hit.shop) return go(hit.shop);
    if (hit.floor) walkTo(hit.floor.x, hit.floor.z);
  };

  const openItem = (id: string) => {
    const it = shopOfItem(items, id);
    if (!it) return;
    // Something in another shop: go there first.
    if (it.shop !== where) return go(it.shop);
    setSheet(null);
    setReceipt(null);
    setCard(id);
    const d = ds.find((x) => x.id === id);
    if (d) api.current?.face(d.x, d.z);
  };

  const toggleLook = () => {
    const on = !looking;
    api.current?.look(on);
    setLooking(on);
    p.onLooking(on);
    setCard(null);
    setSheet(null);
  };
  const takePhoto = () => {
    const src = api.current?.snapshot() ?? null;
    if (src) {
      addPhoto(src);
      if (!p.reduced) setFlash((n) => n + 1);
    }
    setPhoto({ src });
  };

  // Paying: one mall.buy per item, one after another; one receipt.
  const pay = async (lines: Line[]) => {
    if (paying) return;
    setPaying(true);
    const done: Receipt['lines'] = [];
    try {
      for (const l of lines) {
        const r = await p.send<{ price?: number; message?: string }>(
          looseCmd({
            type: 'mall.buy',
            itemId: l.item.id,
            ...(l.colour ? { colour: l.colour } : {}),
          }) as never,
        );
        if (!r) break;
        done.push({ ...l, price: r.price ?? l.item.price, note: '' });
      }
    } finally {
      setPaying(false);
    }
    if (!done.length) return;
    // What you're wearing now: the last top you paid for (and every accessory).
    const lastTop = [...done].reverse().find((l) => l.item.topStyle);
    for (const l of done)
      l.note = l.item.topStyle
        ? l === lastTop
          ? t('{colour} · wearing it now', { colour: colourName(l.colour ?? '') })
          : t('{colour} · bought', { colour: colourName(l.colour ?? '') })
        : isWearable(l.item)
          ? t('Wearing it now')
          : l.item.furniture
            ? t('It’s in your home now.')
            : l.item.phone
              ? t('Your new phone is in your pocket.')
              : l.item.hours
                ? t('{n} hours', { n: l.item.hours })
                : l.item.hunger
                  ? t('Fills you up')
                  : '';
    const paidIds = new Set(done.map((l) => l.item.id));
    setBasket((b) => b.filter((x) => !paidIds.has(x.item.id)));
    const shops = new Set(done.map((l) => l.item.shop));
    const total = done.reduce((s, l) => s + l.price, 0);
    setCard(null);
    setSheet(null);
    setReceipt({ lines: done, total, shop: shops.size === 1 ? done[0]!.item.shop : null });
    setPaid({ total, key: Date.now() });
  };

  useEffect(() => {
    if (!paid) return;
    const id = window.setTimeout(() => setPaid(null), 6000);
    return () => clearTimeout(id);
  }, [paid]);
  // Escape closes what's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || photo) return;
      if (card || sheet || receipt) {
        e.stopPropagation();
        setCard(null);
        setSheet(null);
        setReceipt(null);
      } else if (looking) toggleLook();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const inBasket = (id: string) => basket.some((b) => b.item.id === id);
  const basketTotal = basket.reduce((s, b) => s + b.item.price, 0);
  const canBuy = (it: MallItemView) =>
    !p.busy &&
    !paying &&
    !it.owned &&
    p.pocket >= it.price &&
    !(it.furniture && p.mall && !p.mall.delivers);
  const retail = (it: MallItemView) => it.shop !== 'foodcourt' && it.shop !== 'cinema';

  // Compass (Look around): what's ahead, to the left and right.
  const marks = useMemo(() => landmarks(), []);
  const compass = useMemo(() => {
    if (!facing) return null;
    const at = { x: facing.x, z: facing.z };
    const all = marks
      .map((m) => ({ ...m, a: bearing(at, facing.h, m), d: Math.hypot(m.x - at.x, m.z - at.z) }))
      .filter((m) => m.d > 2.5);
    const ahead = all.filter((m) => Math.abs(m.a) < 0.45).sort((a, b) => a.d - b.d)[0];
    const right = all.filter((m) => m.a >= 0.45 && m.a < 2).sort((a, b) => a.a - b.a)[0];
    const left = all.filter((m) => m.a <= -0.45 && m.a > -2).sort((a, b) => b.a - a.a)[0];
    const near = ahead ?? [right, left].filter(Boolean).sort((a, b) => a!.d - b!.d)[0];
    return { point: compassPoint(facing.h), ahead, right, left, near };
  }, [facing, marks]);
  const markName = (id: MallShopId | 'exit') => (id === 'exit' ? t('Way out') : tx(p.names[id]));

  const tags = useMemo(() => {
    if (!ready) return [];
    // In a shop (or at the food court): its stock, priced. In the hall: the shops' signs.
    const local =
      where === 'concourse'
        ? looking
          ? ds.filter((d) => d.shop === 'foodcourt')
          : []
        : ds.filter((d) => d.shop === where);
    return local;
  }, [ready, where, ds, looking]);

  const label = (it: MallItemView) => tx(it.label);
  const subtitle = (it: MallItemView) =>
    isWearable(it)
      ? t('You’re trying it on')
      : it.furniture
        ? p.mall && !p.mall.delivers
          ? t('Furniture is delivered to your home: buy it in your home city.')
          : t('For your home')
        : it.phone
          ? p.mall?.phone
            ? t('Your phone: {name}', { name: tx(p.mall.phone.name) })
            : ''
          : it.hours
            ? t('{n} hours', { n: it.hours })
            : it.hunger
              ? t('Fills you up')
              : '';

  const sheetOpen = !!(card || sheet || receipt);
  const inShop = where !== 'concourse';

  return (
    <>
      {!ready && p.placeholder}
      {!ready && (
        <span className="mall-loading" role="status">
          {t('Opening the mall…')}
        </span>
      )}
      <Suspense fallback={null}>
        <Mall3D
          me={shown}
          shoppers={p.shoppers}
          names={p.names}
          mallName={p.mallName}
          stock={stock}
          reduced={p.reduced}
          lift={lift}
          api={api}
          overlay={overlay}
          onReady={() => setReady(true)}
          onFail={p.onFail}
          onTap={onTap}
          onArrive={(at) => {
            setWalking(null);
            const r = regionOf(at.x, at.z);
            if (r !== live.current.where) live.current.onWhere(r);
          }}
          onWalk={(left) => setWalking((w) => (left === null ? null : { to: w?.to ?? null, left }))}
          onHeading={(h, at) => setFacing({ h, ...at })}
        />
      </Suspense>
      <div
        ref={overlay}
        className={`mall-hud${ready ? '' : ' is-hidden'}`}
        data-mall-walk={ready ? 'ready' : 'loading'}
        data-looking={looking ? '1' : '0'}
      >
        {/* Shops' signs: tap to walk there and go in. */}
        {!looking &&
          !inShop &&
          SHOP_ORDER.map((s) => {
            const at =
              s === 'foodcourt'
                ? { x: 0, y: 3.4, z: -43 }
                : { ...shopToWorld(s as RoomShop, -0.2, 0), y: 4.45 };
            const target = walking?.to === s;
            return (
              <button
                key={s}
                type="button"
                className={`mall-sign${target ? ' is-target' : ''}`}
                data-at={`${at.x} ${at.y} ${at.z}`}
                data-far="44"
                data-shop-sign={s}
                onClick={() => go(s)}
              >
                <i aria-hidden="true" style={{ background: `${SHOP_COLOUR[s]}22` }}>
                  {SHOP_ICON[s]}
                </i>
                {tx(p.names[s])}
                {target && <em>{t('Go in ›')}</em>}
              </button>
            );
          })}
        {/* What's on sale here. */}
        {tags.map((d) => {
          const it = shopOfItem(items, d.id);
          if (!it) return null;
          const counter = COUNTERS.find((c) => c.item === d.id);
          return (
            <button
              key={d.id}
              type="button"
              className={`mall-tag${card === d.id ? ' is-on' : ''}${inBasket(d.id) ? ' is-in' : ''}`}
              data-at={`${d.x} ${d.tagY} ${d.z}`}
              data-far="22"
              data-item-tag={d.id}
              aria-label={`${label(it)} ${fmt(it.price)}`}
              onClick={() => (looking ? undefined : openItem(d.id))}
            >
              <b aria-hidden="true">{counter ? counter.icon : inBasket(d.id) ? '✓' : '+'}</b>
              {label(it)} {fmt(it.price)}
            </button>
          );
        })}
        {walking && walking.left !== null && walking.to && (
          <span className="mall-walkto" data-at="me" data-walking={walking.to}>
            {t('Walking to {place} · {n} m', { place: tx(p.names[walking.to]), n: walking.left })}
          </span>
        )}
      </div>
      {ready && (
        <div className="mall-ui">
          {looking && compass && (
            <div
              className="mall-compass"
              data-keepout=""
              aria-live="polite"
              data-compass={compass.point}
            >
              {compass.left ? (
                <span>◂ {markName(compass.left.id)}</span>
              ) : (
                <span>{compass.point}</span>
              )}
              <span className="is-on">
                ▲ {compass.ahead ? markName(compass.ahead.id) : compass.point}
              </span>
              {compass.right && <span>{markName(compass.right.id)} ▸</span>}
            </div>
          )}
          {inShop && !looking && (
            <button
              type="button"
              className="mall-pill is-light mall-back3d"
              data-keepout=""
              data-action="mall-concourse"
              onClick={() => {
                setCard(null);
                const a = api.current;
                const out = backOut(where);
                const left = a?.walkTo(out);
                if (typeof left === 'number' && left >= 0.5 && !p.reduced)
                  setWalking({ to: null, left: Math.ceil(left) });
              }}
            >
              {t('← Concourse')}
            </button>
          )}
          <div
            className="mall-side"
            data-keepout=""
            role="group"
            aria-label={t('Look and take photos')}
          >
            {looking && (
              <button
                type="button"
                className="mall-pill is-on"
                data-action="look-around"
                aria-pressed="true"
                onClick={toggleLook}
              >
                <span aria-hidden="true">👀</span>
                {t('Looking')}
              </button>
            )}
            <button
              type="button"
              className="mall-pill"
              data-action="turn"
              onClick={() => api.current?.turn(1)}
            >
              <span aria-hidden="true">↻</span>
              {t('Turn')}
            </button>
            {!looking && (
              <button
                type="button"
                className="mall-pill"
                data-action="look-around"
                aria-pressed="false"
                onClick={toggleLook}
              >
                <span aria-hidden="true">👀</span>
                {t('Look around')}
              </button>
            )}
            <button type="button" className="mall-pill" data-action="photo" onClick={takePhoto}>
              <span aria-hidden="true">📷</span>
              {t('Photo')}
            </button>
            {!looking && (
              <button
                type="button"
                className="mall-pill"
                data-action="directory"
                aria-expanded={sheet === 'directory'}
                onClick={() => {
                  setCard(null);
                  setReceipt(null);
                  setDirFrom(api.current?.where() ?? null);
                  setSheet(sheet === 'directory' ? null : 'directory');
                }}
              >
                <span aria-hidden="true">🗺️</span>
                {t('Directory')}
              </button>
            )}
          </div>
          {looking ? (
            <>
              <button
                type="button"
                data-keepout=""
                className="mall-pill is-light mall-backme"
                data-action="back-to-me"
                onClick={toggleLook}
              >
                {t('↶ Back to me')}
              </button>
              {compass?.near && compass.near.id !== 'exit' && (
                <div className="mall-ahead" data-keepout="" data-ahead={compass.near.id}>
                  <span className="small muted">{markName(compass.near.id)}</span>
                  <b>
                    {SHOP_ICON[compass.near.id]} {shopBlurb(compass.near.id)}
                  </b>
                  <span className="small muted">
                    {compass.near === compass.ahead
                      ? t('ahead of you')
                      : compass.near === compass.right
                        ? t('on your right')
                        : t('on your left')}
                  </span>
                </div>
              )}
              <span className="mall-hint is-light" data-keepout="">
                {t('Drag to look · double-tap to walk there')}
              </span>
            </>
          ) : (
            !sheetOpen && (
              <>
                <button
                  type="button"
                  className="mall-pill is-light mall-basket"
                  data-keepout=""
                  data-action="basket"
                  aria-label={t('Basket: {n} items', { n: basket.length })}
                  onClick={() => {
                    setCard(null);
                    setSheet('basket');
                  }}
                >
                  <span aria-hidden="true">🛍️</span>
                  {t('Basket')}
                  <span className="mall-count" data-basket-count={basket.length}>
                    {basket.length}
                  </span>
                </button>
                <span className="mall-hint" data-keepout="">
                  {inShop
                    ? where === 'foodcourt'
                      ? t('Tap a counter to order')
                      : t('Tap a tag to see it · ← Concourse to go out')
                    : t('Tap the floor to walk · tap a shop to go in')}
                </span>
              </>
            )
          )}
          {paid && (
            <div className="mall-paid" data-keepout="" role="status" data-paid-toast={paid.total}>
              <span className="mall-paid-tick" aria-hidden="true">
                ✓
              </span>
              <div>
                <b>{t('Paid {amount}', { amount: moneyExact(paid.total, cur) })}</b>
                <span className="small">
                  {t('From your personal account · balance {amount}', { amount: fmt(p.pocket) })}
                </span>
              </div>
            </div>
          )}
          {cardItem && (
            <section
              ref={sheetRef}
              data-keepout=""
              className="mall-sheet mall-card"
              aria-label={label(cardItem)}
              data-item-card={cardItem.id}
              data-price={cardItem.price}
            >
              <div className="mall-row">
                <span className="mall-thumb" aria-hidden="true">
                  {itemIcon(cardItem)}
                </span>
                <div className="mall-grow">
                  <b className="mall-name">{label(cardItem)}</b>
                  <span className="small muted">{subtitle(cardItem)}</span>
                </div>
                <b className="mall-big">{fmt(cardItem.price)}</b>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('Close')}
                  onClick={() => setCard(null)}
                >
                  ✕
                </button>
              </div>
              {cardItem.topStyle && (
                <div className="mall-colours" role="radiogroup" aria-label={t('Colour')}>
                  {TOP_COLOURS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={c === colour}
                      aria-label={colourName(c)}
                      data-colour={c}
                      className={`mall-swatch${c === colour ? ' is-on' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColour(c)}
                    />
                  ))}
                </div>
              )}
              <div className="mall-row mall-actions">
                {retail(cardItem) && (
                  <button
                    type="button"
                    className="btn btn-subtle"
                    data-action="add-basket"
                    disabled={
                      cardItem.owned ||
                      inBasket(cardItem.id) ||
                      !!(cardItem.furniture && p.mall && !p.mall.delivers)
                    }
                    onClick={() => {
                      setBasket((b) => [
                        ...b,
                        { item: cardItem, ...(cardItem.topStyle ? { colour } : {}) },
                      ]);
                      setCard(null);
                    }}
                  >
                    {inBasket(cardItem.id) ? t('In your basket') : t('＋ Add to basket')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  data-action="buy-now"
                  disabled={!canBuy(cardItem)}
                  onClick={() =>
                    void pay([{ item: cardItem, ...(cardItem.topStyle ? { colour } : {}) }])
                  }
                >
                  {cardItem.owned
                    ? t('Yours')
                    : p.pocket < cardItem.price
                      ? t('Not enough money')
                      : t('Buy now {price}', { price: fmt(cardItem.price) })}
                </button>
              </div>
            </section>
          )}
          {sheet === 'basket' && (
            <section
              ref={sheetRef}
              data-keepout=""
              className="mall-sheet"
              aria-label={t('Basket')}
              data-mall-basket=""
            >
              <div className="mall-row">
                <b className="mall-name mall-grow">🛍️ {t('Basket')}</b>
                <span className="chip">{t('{n} items', { n: basket.length })}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('Close')}
                  onClick={() => setSheet(null)}
                >
                  ✕
                </button>
              </div>
              {basket.length === 0 ? (
                <p className="small muted">
                  {t('Your basket is empty: tap a tag in a shop to add things.')}
                </p>
              ) : (
                <ul className="mall-lines">
                  {basket.map((b) => (
                    <li key={b.item.id}>
                      <span className="mall-thumb" aria-hidden="true">
                        {itemIcon(b.item)}
                      </span>
                      <span className="mall-grow">
                        <b>{label(b.item)}</b>
                        <span className="small muted">
                          {b.colour ? `${colourName(b.colour)} · ` : ''}
                          {tx(p.names[b.item.shop])}
                        </span>
                      </span>
                      <b className="num">{fmt(b.item.price)}</b>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t('Remove {item}', { item: label(b.item) })}
                        onClick={() => setBasket((x) => x.filter((y) => y.item.id !== b.item.id))}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mall-row mall-total">
                <span className="muted mall-grow">{t('Total')}</span>
                <b className="mall-big">{fmt(basketTotal)}</b>
              </div>
              <button
                type="button"
                className="btn btn-primary mall-wide"
                data-action="checkout"
                disabled={!basket.length || paying || p.busy || p.pocket < basketTotal}
                onClick={() => void pay(basket)}
              >
                {p.pocket < basketTotal
                  ? t('Not enough money')
                  : t('Pay {amount}', { amount: fmt(basketTotal) })}
              </button>
            </section>
          )}
          {sheet === 'directory' && (
            <section
              ref={sheetRef}
              data-keepout=""
              className="mall-sheet"
              aria-label={t('Directory')}
              data-mall-directory=""
            >
              <div className="mall-row">
                <b className="mall-name mall-grow">🗺️ {t('Directory')}</b>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('Close')}
                  onClick={() => setSheet(null)}
                >
                  ✕
                </button>
              </div>
              <ul className="mall-lines">
                {SHOP_ORDER.map((s) => {
                  const w = dirFrom;
                  const g = goal(s);
                  const d = w ? Math.round(Math.hypot(g.x - w.x, g.z - w.z)) : 0;
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        className="mall-dir"
                        data-dir-shop={s}
                        onClick={() => go(s)}
                      >
                        <span
                          className="mall-thumb"
                          aria-hidden="true"
                          style={{ background: `${SHOP_COLOUR[s]}22` }}
                        >
                          {SHOP_ICON[s]}
                        </span>
                        <span className="mall-grow">
                          <b>{tx(p.names[s])}</b>
                          <span className="small muted">
                            {shopBlurb(s)}
                            {where === s
                              ? ` · ${t('You’re here')}`
                              : d
                                ? ` · ${t('{n} m', { n: d })}`
                                : ''}
                          </span>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {receipt && (
            <section
              ref={sheetRef}
              data-keepout=""
              className="mall-sheet"
              aria-label={t('Receipt')}
              data-mall-receipt={receipt.lines.length}
              data-total={receipt.total}
            >
              <div className="mall-row">
                <b className="mall-name mall-grow">
                  🧾{' '}
                  {receipt.shop
                    ? t('Receipt · {shop}', { shop: tx(p.names[receipt.shop]) })
                    : t('Receipt')}
                </b>
                <span className="chip">{t('{n} items', { n: receipt.lines.length })}</span>
              </div>
              <ul className="mall-lines">
                {receipt.lines.map((l) => (
                  <li key={l.item.id} data-receipt-item={l.item.id}>
                    <span className="mall-thumb" aria-hidden="true">
                      {itemIcon(l.item)}
                    </span>
                    <span className="mall-grow">
                      <b>{label(l.item)}</b>
                      {l.note && <span className="small muted">{l.note}</span>}
                    </span>
                    <b className="num">{moneyExact(l.price, cur)}</b>
                  </li>
                ))}
              </ul>
              <div className="mall-row mall-total">
                <span className="muted mall-grow">{t('Total')}</span>
                <b className="mall-big">{moneyExact(receipt.total, cur)}</b>
              </div>
              <div className="mall-row mall-actions">
                <button
                  type="button"
                  className="btn btn-subtle"
                  data-action="keep-shopping"
                  onClick={() => setReceipt(null)}
                >
                  {t('Keep shopping')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-action="receipt-concourse"
                  onClick={() => {
                    setReceipt(null);
                    if (where === 'concourse') return;
                    const left = api.current?.walkTo(backOut(where));
                    if (typeof left === 'number' && left >= 0.5 && !p.reduced)
                      setWalking({ to: null, left: Math.ceil(left) });
                  }}
                >
                  {t('Back to concourse')}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      {flash > 0 && <div key={flash} className="home-flash" aria-hidden="true" />}
      {photo && <PhotoSheet first={photo.src} city={p.city} onClose={() => setPhoto(null)} />}
    </>
  );
}
