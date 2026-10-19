/**
 * The mall (player feedback: "people should go to the malls to shop"). The
 * concourse, busy with shoppers; a directory of its shops; inside each, what
 * it sells at the city's prices. Buying is `mall.buy`: clothes go on your
 * figure at once (and everyone sees them), a phone is yours, furniture and
 * electronics go into your home, food fills you up, a film is fun.
 *
 * Drawn in 3D (../../interiors3d/Mall3D.tsx) or, in Lite, in SVG (./Mall2D.tsx).
 */
import { Suspense, lazy, useMemo, useState } from 'react';
import type { MallShopId } from '@runway/engine';
import { GENDER_PARTS, TOP_COLOURS } from '@runway/engine';
import './mall.css';
import { use3d } from '../../three-kit/quality';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { AvatarFigure, avatarLook, drawnGender, type AvatarLook } from '../art';
import { genderOf, looseCmd } from '../life';
import { mallOf, type MallItemView } from '../leisure';
import type { SceneProps } from '../PlaceScene';
import { Mall2D } from './Mall2D';
import { SHOP_COLOUR, SHOP_ICON, SHOP_ORDER, shopBlurb, shopName } from './shops';

const Mall3D = lazy(() =>
  import('../../interiors3d/Mall3D').catch(() => ({ default: () => null })),
);

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
}

/** What wearing an item looks like (for trying it on). */
function wearing(look: AvatarLook, it: MallItemView, colour: string): AvatarLook {
  return {
    ...look,
    ...(it.topStyle ? { topStyle: it.topStyle as AvatarLook['topStyle'], top: colour } : {}),
    ...(it.headwear ? { headwear: it.headwear as AvatarLook['headwear'] } : {}),
    ...(it.glasses ? { glasses: it.glasses as AvatarLook['glasses'] } : {}),
  };
}

export function MallScene(props: SceneProps) {
  const { view, send, busy } = useView();
  const want3d = use3d();
  const market = view.market.id;
  const mall = mallOf(view);
  const cur = mall?.currency ?? view.market.currency;
  const pocket = view.accounts.local?.balance ?? 0;
  const gender = drawnGender(view.me.background?.id, view.me.id, genderOf(view.me));
  const me = avatarLook(view.me.background?.id, view.me.id, gender);
  const [focus, setFocus] = useState<MallShopId | null>(null);
  const [colour, setColour] = useState<string>(TOP_COLOURS[6]);
  const [trying, setTrying] = useState<string | null>(null);
  const [bought, setBought] = useState<Bought | null>(null);
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
  // Clothes for who you are: the fashion shop shows a man no dress or gele.
  const parts = GENDER_PARTS[gender];
  const items = (mall?.items ?? []).filter(
    (i) =>
      i.shop === focus &&
      (!i.topStyle || (parts.topStyle as readonly string[]).includes(i.topStyle)) &&
      (!i.headwear || (parts.headwear as readonly string[]).includes(i.headwear)),
  );
  const tryItem = items.find((i) => i.id === trying);
  const shown = focus === 'fashion' && tryItem ? wearing(me, tryItem, colour) : me;

  const buy = async (it: MallItemView) => {
    const r = await send<{ price?: number; message?: string }>(
      looseCmd({
        type: 'mall.buy',
        itemId: it.id,
        ...(it.topStyle ? { colour } : {}),
      }),
    );
    if (!r) return;
    setTrying(null);
    setBought({ item: it, price: r.price ?? it.price, message: tx(r.message ?? '') });
  };

  return (
    <div
      className="place-scene mall-scene"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      data-room="mall"
      data-mall-shop={focus ?? 'concourse'}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{focus ? tx(names[focus]) : props.title}</h2>
          <span className="small muted">
            {focus ? shopBlurb(focus) : t('{n} shops, a food court and a cinema', { n: 6 })}
          </span>
        </div>
        <span className="golf-pocket" data-pocket={pocket}>
          {money(pocket, view.market.currency)}
        </span>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={props.onClose}>
          ✕
        </button>
      </header>
      <div className="mall-view">
        {want3d ? (
          <Suspense
            fallback={
              <Mall2D
                me={shown}
                shoppers={shoppers}
                focus={focus}
                names={names}
                mallName={props.title}
              />
            }
          >
            <Mall3D
              me={shown}
              shoppers={shoppers}
              focus={focus}
              names={names}
              mallName={props.title}
            />
          </Suspense>
        ) : (
          <Mall2D
            me={shown}
            shoppers={shoppers}
            focus={focus}
            names={names}
            mallName={props.title}
          />
        )}
        {bought && (
          <div className="mall-bought" role="status" data-mall-bought={bought.item.id}>
            <div className="mall-bought-fig" aria-hidden="true">
              <svg viewBox="-24 -48 48 52" width="64" height="70">
                <AvatarFigure look={me} />
              </svg>
            </div>
            <div className="mall-bought-text">
              <b>{t('Bought: {item}', { item: tx(bought.item.label) })}</b>
              <span>{money(bought.price, cur)}</span>
              <span className="small">
                {bought.item.topStyle || bought.item.headwear || bought.item.glasses
                  ? t('You’re wearing it.')
                  : bought.item.furniture
                    ? t('It’s in your home now.')
                    : bought.item.phone
                      ? t('Your new phone is in your pocket.')
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
      </div>
      <div className="mall-tray">
        {!focus ? (
          <div className="mall-shops" role="group" aria-label={t('Shops')}>
            {SHOP_ORDER.map((s) => (
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
            {focus === 'fashion' && (
              <div className="mall-colours" role="radiogroup" aria-label={t('Colour')}>
                {TOP_COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={c === colour}
                    aria-label={c}
                    data-colour={c}
                    className={`mall-swatch${c === colour ? ' is-on' : ''}`}
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
                    disabled={focus !== 'fashion'}
                  >
                    <b>{tx(it.label)}</b>
                    <span className="small muted">
                      {focus === 'fashion'
                        ? trying === it.id
                          ? t('Trying it on')
                          : t('Tap to try it on')
                        : it.hours
                          ? t('{n} hours', { n: it.hours })
                          : it.hunger
                            ? t('Fills you up')
                            : it.slot
                              ? t('For your home')
                              : ''}
                    </span>
                  </button>
                  <span className="mall-price">{money(it.price, cur)}</span>
                  <button
                    type="button"
                    className="btn mall-buy"
                    data-buy={it.id}
                    disabled={busy || it.owned || pocket < it.price}
                    onClick={() => void buy(it)}
                  >
                    {it.owned ? t('Yours') : t('Buy')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
