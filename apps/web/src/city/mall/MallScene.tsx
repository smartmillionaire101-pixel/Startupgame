/**
 * The mall (player feedback: "people should go to the malls to shop", then
 * "more stores and more items to buy … and that you can invite someone and
 * take them shopping"). The concourse, busy with shoppers; a directory of
 * its shops; inside each, what it sells at the city's prices. Buying is
 * `mall.buy`: clothes go on your figure at once (and everyone sees them), a
 * phone is yours, furniture and electronics go into your home, food fills
 * you up, a film is fun, and the bigger mall's things go in your bag.
 *
 * My purchases (../../avatar/Wardrobe.tsx), from the header: your wardrobe
 * to wear again free (`wardrobe.wear`) and the things you keep. Something
 * you own already (a top: in that colour) is worn free, never bought again.
 *
 * Shop with a friend: invite a player or an AI friend (`mall.invite`); while
 * you're together they walk with you and any card or list can buy them a
 * gift (`mall.gift`: you pay, it's theirs).
 *
 * The Suit Shop (the feedback round): suits in their own cloths (an item's
 * `colours`), shirts and blouses, ties, formal shoes, watches and bags, with
 * aisles to pick from (./SuitAisles.tsx).
 *
 * Drawn in 3D (../../interiors3d/Mall3D.tsx) or, in Lite, in SVG (./Mall2D.tsx).
 */
import { useMemo, useState } from 'react';
import type { MallShopId } from '@runway/engine';
import { GENDER_PARTS, TOP_COLOURS } from '@runway/engine';
import './mall.css';
import { use3d } from '../../three-kit/quality';
import { money } from '../../format';
import { pocketOf, pocketText } from '../pocket';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { AvatarFigure, avatarLook, drawnGender } from '../art';
import { genderOf, looseCmd } from '../life';
import { mallOf, type MallItemView } from '../leisure';
import type { SceneProps } from '../PlaceScene';
import { isUnit, type UnitShop } from './layout';
import { Mall2D } from './Mall2D';
import { PurchasesSheet } from '../../avatar/Wardrobe';
import { MallInviteSheet, personLook } from './MallInvite';
import { MallWalk } from './MallWalk';
import { SuitAisles } from './SuitAisles';
import { CatalogueSheet } from '../../shop/CatalogueSheet';
import { mallCatalog } from '../../shop/catalog';
import {
  SHOP_COLOUR,
  SHOP_ICON,
  SHOP_ORDER,
  aisleOf,
  colourFor,
  coloursOf,
  isWearable,
  itemIcon,
  itemNote,
  ownsIt,
  shopBlurb,
  shopName,
  shopsOf,
  colourName,
  wearing,
  type SuitAisle,
} from './shops';

/** Reduced motion (the system's, or the game's own setting): walking jumps. */
const reduceMotion = () =>
  (typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
  (typeof document !== 'undefined' &&
    document.documentElement.dataset.reduceMotion !== undefined &&
    !['false', '0'].includes(document.documentElement.dataset.reduceMotion));

const SHOPPER_BG = [
  'f-engineer',
  'f-dropout',
  'i-first',
  'b-commercial',
  'f-corporate',
  'i-operator',
  'b-fintech',
  'f-consultant',
  'b-wealthy',
  'i-exited',
];

interface Bought {
  item: MallItemView;
  price: number;
  message: string;
  /** A gift: who it's for. */
  for?: string;
}

/** Whether a look may wear an item (no dress or gele for a man). */
const fits = (gender: 'female' | 'male', i: MallItemView) => {
  const parts = GENDER_PARTS[gender];
  return (
    (!i.topStyle || (parts.topStyle as readonly string[]).includes(i.topStyle)) &&
    (!i.headwear || (parts.headwear as readonly string[]).includes(i.headwear)) &&
    (i.worn?.slot !== 'shoes' || (parts.shoes as readonly string[]).includes(i.worn.style))
  );
};

export function MallScene(props: SceneProps) {
  const { view, send, busy } = useView();
  const want3d = use3d();
  const market = view.market.id;
  const mall = mallOf(view);
  const cur = mall?.currency ?? view.market.currency;
  // Abroad, your balance at this city's prices (as paying here converts it).
  const purse = pocketOf(view, cur);
  const pocket = purse.balance;
  const gender = drawnGender(view.me.background?.id, view.me.id, genderOf(view.me));
  const me = avatarLook(view.me.background?.id, view.me.id, gender);
  const [focus, setFocus] = useState<MallShopId | null>(null);
  const [colour, setColour] = useState<string>(TOP_COLOURS[6]);
  const [trying, setTrying] = useState<string | null>(null);
  const [aisle, setAisle] = useState<SuitAisle>('all');
  const [bought, setBought] = useState<Bought | null>(null);
  const [inviting, setInviting] = useState(false);
  const [purchases, setPurchases] = useState(false);
  // Shop note: this shop's catalogue (pictures, options and their prices).
  const [browsing, setBrowsing] = useState(false);
  // 3D: walking the mall (the 2D directory if WebGL gives out).
  const [failed, setFailed] = useState(false);
  const [looking, setLooking] = useState(false);
  const walk3d = want3d && !failed;
  const shops = shopsOf(mall);
  const names = useMemo(
    () =>
      Object.fromEntries(SHOP_ORDER.map((s) => [s, shopName(s, market)])) as Record<
        MallShopId,
        string
      >,
    [market],
  );
  const shoppers = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) =>
        avatarLook(SHOPPER_BG[i % SHOPPER_BG.length], `mall:${market}:${i}`),
      ),
    [market],
  );
  // Shopping together: who's with you (walking with you once they're here).
  const trip = mall?.trip ?? null;
  const together = trip?.status === 'together' ? trip : null;
  const friendKey = together ? JSON.stringify(together.friend) : '';
  const friendLook = useMemo(
    () => (together ? personLook(together.friend) : null),
    // The look only changes with the friend (or what they were bought).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [friendKey],
  );
  const friendGender = together
    ? drawnGender(together.friend.backgroundId, together.friend.id, together.friend.gender)
    : null;
  const friendName = together?.friend.name.split(' ')[0] ?? '';
  // Clothes for who you are (no dress or gele for a man); with a friend, theirs too (as gifts).
  const forMe = (i: MallItemView) => fits(gender, i);
  const shown0 = (mall?.items ?? []).filter(
    (i) => forMe(i) || (!!friendGender && !!i.gift && fits(friendGender, i)),
  );
  const inShop = shown0.filter((i) => i.shop === focus);
  // The Suit Shop's aisles (suits, shirts and blouses, ties …).
  const items =
    focus === 'suits' && aisle !== 'all' ? inShop.filter((i) => aisleOf(i) === aisle) : inShop;
  const tryItem = items.find((i) => i.id === trying);
  // The colours on offer: what you're trying on comes in (a suit: its cloths), else the shop's tops'.
  const palette = coloursOf(
    (tryItem?.topStyle ? tryItem : null) ?? items.find((i) => i.topStyle) ?? {},
  );
  const picked = colourFor({ colours: [...palette] }, colour);
  const shown =
    tryItem && isWearable(tryItem) && forMe(tryItem)
      ? wearing(me, tryItem, colourFor(tryItem, colour))
      : me;
  const units = shops.filter((s): s is UnitShop => isUnit(s));
  const catalogue = focus && view.me.shop ? mallCatalog(view, focus) : [];
  const wears = items.some((i) => i.topStyle);

  const buy = async (it: MallItemView) => {
    const r = await send<{ price?: number; message?: string }>(
      looseCmd({
        type: 'mall.buy',
        itemId: it.id,
        ...(it.topStyle ? { colour: colourFor(it, colour) } : {}),
      }),
    );
    if (!r) return;
    setTrying(null);
    setBought({ item: it, price: r.price ?? it.price, message: tx(r.message ?? '') });
  };
  // Yours already: on, free (from your wardrobe).
  const wearOwned = async (it: MallItemView) => {
    const r = await send(
      looseCmd({
        type: 'wardrobe.wear',
        itemId: it.id,
        ...(it.topStyle ? { colour: colourFor(it, colour) } : {}),
      }),
      t('You put on: {item}.', { item: tx(it.label) }),
    );
    if (r) setTrying(null);
  };
  const gift = async (it: MallItemView) => {
    if (!together) return;
    const r = await send<{ price?: number; message?: string }>(
      looseCmd({
        type: 'mall.gift',
        tripId: together.id,
        itemId: it.id,
        ...(it.topStyle ? { colour: colourFor(it, colour) } : {}),
      }),
    );
    if (!r) return;
    setTrying(null);
    setBought({
      item: it,
      price: r.price ?? it.price,
      message: tx(r.message ?? ''),
      for: together.friend.name,
    });
  };
  const leave = async () => {
    if (trip) await send(looseCmd({ type: 'mall.leave', tripId: trip.id }));
  };

  return (
    <div
      className="place-scene mall-scene"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      data-room="mall"
      data-mall-shop={focus ?? 'concourse'}
      data-mall-mode={walk3d ? '3d' : '2d'}
      data-mall-with={together?.friend.id ?? ''}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{focus ? tx(names[focus]) : props.title}</h2>
          <span className="small muted">
            {walk3d && looking
              ? t('Looking around · drag to turn your head')
              : focus
                ? shopBlurb(focus)
                : shops.length > 6
                  ? t('{n} shops, a food court, a cinema and an arcade', { n: shops.length - 1 })
                  : t('{n} shops, a food court and a cinema', { n: 6 })}
          </span>
        </div>
        {mall?.wardrobe && (
          <button
            type="button"
            className="btn btn-subtle mall-purchases"
            data-action="mall-purchases"
            aria-label={t('My purchases')}
            title={t('My purchases')}
            onClick={() => setPurchases(true)}
          >
            👜 <span className="mall-purchases-label">{t('My purchases')}</span>
          </button>
        )}
        {catalogue.length > 0 && (
          <button
            type="button"
            className="btn btn-subtle mall-purchases"
            data-action="open-catalogue"
            aria-label={t('Catalogue')}
            title={t('Catalogue')}
            onClick={() => setBrowsing(true)}
          >
            📖 <span className="mall-purchases-label">{t('Catalogue')}</span>
          </button>
        )}
        <span
          className="golf-pocket"
          data-pocket={purse.home}
          data-pocket-here={purse.converted ? pocket : undefined}
        >
          {pocketText(purse)}
        </span>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={props.onClose}>
          ✕
        </button>
      </header>
      {mall?.friends && (
        <div className="mall-trip" data-mall-trip={trip?.status ?? 'none'}>
          {together ? (
            <>
              <span className="mall-trip-who">
                <svg viewBox="-24 -48 48 52" width="26" height="28" aria-hidden="true">
                  {friendLook && <AvatarFigure look={friendLook} />}
                </svg>
                <span>
                  <b>{t('Shopping with {name}', { name: friendName })}</b>
                  <small>
                    {together.gifts.length
                      ? t('Gifts so far: {n} · 🎁 buys one', { n: together.gifts.length })
                      : t('🎁 on anything buys it for them')}
                  </small>
                </span>
              </span>
              <button
                type="button"
                className="btn btn-subtle"
                data-action="mall-trip-leave"
                disabled={busy}
                onClick={() => void leave()}
              >
                {t('Say goodbye')}
              </button>
            </>
          ) : trip ? (
            <>
              <span className="mall-trip-who">
                <span>
                  <b>{t('Waiting for {name}…', { name: trip.friend.name })}</b>
                  <small>{t('They’ll join you here when they accept.')}</small>
                </span>
              </span>
              <button
                type="button"
                className="btn btn-subtle"
                data-action="mall-trip-leave"
                disabled={busy}
                onClick={() => void leave()}
              >
                {t('Call it off')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-subtle mall-trip-ask"
              data-action="mall-invite"
              onClick={() => setInviting(true)}
            >
              👥 {t('Shop with a friend')}
            </button>
          )}
        </div>
      )}
      <div className="mall-view">
        {walk3d ? (
          <MallWalk
            me={me}
            friend={friendLook}
            trip={together}
            shops={shops}
            units={units}
            forMe={forMe}
            shoppers={shoppers}
            names={names}
            mallName={props.title}
            city={view.here?.name ?? view.market.name}
            mall={mall}
            items={shown0}
            pocket={pocket}
            pocketLabel={pocketText(purse)}
            currency={cur}
            busy={busy}
            send={send}
            reduced={reduceMotion()}
            where={focus ?? 'concourse'}
            onWhere={(w) => setFocus(w === 'concourse' ? null : w)}
            onLooking={setLooking}
            onFail={() => setFailed(true)}
            placeholder={
              <Mall2D
                me={me}
                friend={friendLook}
                shoppers={shoppers}
                focus={null}
                shops={shops}
                names={names}
                mallName={props.title}
              />
            }
          />
        ) : (
          <Mall2D
            me={shown}
            friend={friendLook}
            shoppers={shoppers}
            focus={focus}
            shops={shops}
            names={names}
            mallName={props.title}
          />
        )}
        {bought && bought.item.shop === 'cinema' && !bought.for && (
          // A film is an evening out, not a purchase (play-test: "Bought: Watch a film ·
          // Keep shopping"): the lights go down on a screen, then back to the mall.
          <div className="mall-bought mall-film" role="status" data-mall-bought={bought.item.id}>
            <div className="mall-film-screen" aria-hidden="true">
              <svg viewBox="0 0 120 70" width="120" height="70">
                <rect width="120" height="70" rx="6" fill="#0b1020" />
                <rect className="mall-film-picture" x="12" y="8" width="96" height="40" rx="2" />
                {[20, 40, 60, 80, 100].map((x) => (
                  <circle key={x} cx={x} cy="60" r="5" fill="#1f2a44" />
                ))}
              </svg>
            </div>
            <div className="mall-bought-text">
              <b>{t('Lights down: {item}', { item: tx(bought.item.label) })}</b>
              <span>{money(bought.price, cur)}</span>
              <span className="small">
                {t('A couple of hours at the cinema: more fun, less stress.')}
              </span>
              <button
                type="button"
                className="btn btn-subtle"
                data-action="mall-ok"
                onClick={() => setBought(null)}
              >
                {t('Back to the mall')}
              </button>
            </div>
          </div>
        )}
        {bought && !(bought.item.shop === 'cinema' && !bought.for) && (
          <div className="mall-bought" role="status" data-mall-bought={bought.item.id}>
            <div className="mall-bought-fig" aria-hidden="true">
              <svg viewBox="-24 -48 48 52" width="64" height="70">
                <AvatarFigure look={bought.for && friendLook ? friendLook : me} />
              </svg>
            </div>
            <div className="mall-bought-text">
              <b>
                {bought.for
                  ? t('A gift for {name}: {item}', {
                      name: bought.for,
                      item: tx(bought.item.label),
                    })
                  : t('Bought: {item}', { item: tx(bought.item.label) })}
              </b>
              <span>{money(bought.price, cur)}</span>
              <span className="small">
                {bought.for
                  ? isWearable(bought.item)
                    ? t('{name} is wearing it.', { name: bought.for.split(' ')[0] ?? '' })
                    : t('It’s theirs now. You’re both a little happier.')
                  : isWearable(bought.item)
                    ? t('You’re wearing it.')
                    : bought.item.furniture
                      ? t('It’s in your home now.')
                      : bought.item.phone
                        ? t('Your new phone is in your pocket.')
                        : bought.item.keep
                          ? t('It’s in your bag.')
                          : bought.message}
              </span>
              <button
                type="button"
                className="btn btn-subtle"
                data-action="mall-ok"
                onClick={() => setBought(null)}
              >
                {t('Keep shopping')}
              </button>
            </div>
          </div>
        )}
        {purchases && <PurchasesSheet onClose={() => setPurchases(false)} />}
        {browsing && focus && (
          <CatalogueSheet
            title={tx(names[focus])}
            entries={catalogue}
            currency={cur}
            inMall
            onClose={() => setBrowsing(false)}
          />
        )}
        {inviting && mall && (
          <MallInviteSheet
            mall={mall}
            onClose={() => setInviting(false)}
            onInvited={() => setInviting(false)}
          />
        )}
      </div>
      {!walk3d && (
        <div className="mall-tray">
          {!focus ? (
            <div className="mall-shops" role="group" aria-label={t('Shops')}>
              {shops.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="tray-card mall-shop"
                  data-shop={s}
                  style={{ borderColor: SHOP_COLOUR[s] }}
                  onClick={() => {
                    setFocus(s);
                    setTrying(null);
                    setBought(null);
                    setAisle('all');
                  }}
                >
                  <span className="tray-icon" aria-hidden="true">
                    {SHOP_ICON[s]}
                  </span>
                  <span className="tray-text">
                    <span className="tray-label">{tx(names[s])}</span>
                    <span className="tray-sub">{shopBlurb(s)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mall-shop-panel" role="group" aria-label={tx(names[focus])}>
              <button
                type="button"
                className="btn btn-subtle mall-back"
                data-action="mall-back"
                onClick={() => {
                  setFocus(null);
                  setTrying(null);
                }}
              >
                {t('← Back to the concourse')}
              </button>
              {focus === 'suits' && (
                <SuitAisles
                  items={inShop}
                  aisle={aisle}
                  onAisle={(a) => {
                    setAisle(a);
                    setTrying(null);
                  }}
                />
              )}
              {wears && (
                <div className="mall-colours" role="radiogroup" aria-label={t('Colour')}>
                  {palette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={c === picked}
                      aria-label={colourName(c)}
                      data-colour={c}
                      className={`mall-swatch${c === picked ? ' is-on' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColour(c)}
                    />
                  ))}
                </div>
              )}
              {focus === 'home' && mall && !mall.delivers && (
                <p className="small muted">
                  {t('Furniture is delivered to your home: buy it in your home city.')}
                </p>
              )}
              {focus === 'phones' && mall?.phone && (
                <p className="small muted">
                  {t('Your phone: {name}', { name: tx(mall.phone.name) })}
                </p>
              )}
              <ul className="mall-items">
                {items.map((it) => (
                  <li key={it.id} className={trying === it.id ? 'is-trying' : ''}>
                    <button
                      type="button"
                      className="mall-item-name"
                      onClick={() => setTrying(trying === it.id ? null : it.id)}
                      disabled={!isWearable(it) || !forMe(it)}
                    >
                      <b>
                        <span aria-hidden="true">{itemIcon(it)} </span>
                        {tx(it.label)}
                      </b>
                      <span className="small muted">
                        {isWearable(it) && forMe(it)
                          ? trying === it.id
                            ? t('Trying it on')
                            : t('Tap to try it on')
                          : itemNote(it)}
                      </span>
                    </button>
                    <span className="mall-price">{money(it.price, cur)}</span>
                    {forMe(it) &&
                      (ownsIt(it, colourFor(it, colour)) ? (
                        <button
                          type="button"
                          className="btn btn-subtle mall-buy"
                          data-wear-owned={it.id}
                          disabled={busy}
                          onClick={() => void wearOwned(it)}
                        >
                          {t('Yours · wear')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn mall-buy"
                          data-buy={it.id}
                          disabled={busy || it.owned || !purse.canPay(it.price)}
                          onClick={() => void buy(it)}
                        >
                          {it.owned ? t('Yours') : t('Buy')}
                        </button>
                      ))}
                    {together && it.gift && (
                      <button
                        type="button"
                        className="btn mall-buy mall-gift"
                        data-gift={it.id}
                        aria-label={t('Buy it for {name}', { name: friendName })}
                        disabled={busy || !purse.canPay(it.price)}
                        onClick={() => void gift(it)}
                      >
                        🎁
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
