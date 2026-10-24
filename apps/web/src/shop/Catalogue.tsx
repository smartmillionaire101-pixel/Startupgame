/**
 * The catalogue (player feedback: "a catalogue so I can actually see the
 * items to make a decision: different options and pricing on each item"):
 * the Shop app's online store and every shop's "Browse the catalogue".
 *
 * A grid of pictures with prices, filtered by category and sorted by price;
 * tap one for its page: a bigger picture, its variants (a quality tier, a
 * size, a length) and options (a finish, a fabric, a warranty, a paint …),
 * each with its own price, worked out by the engine's own sum. In a shop you
 * buy it there and then (free, at once); online you go on to the checkout:
 * standard or express delivery, its fee and wait, and the total.
 */
import { useMemo, useState } from 'react';
import {
  GENDER_PARTS,
  TOP_COLOURS,
  WALLS,
  type CatalogCategory,
  type ChosenOptions,
  type DeliverySpeed,
} from '@runway/engine';
import { money, moneyExact } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { avatarLook, drawnGender } from '../city/art';
import { genderOf, looseCmd } from '../city/life';
import { slotLabel } from '../city/Showroom';
import { colourName } from '../city/mall/shops';
import {
  browse,
  buyCommand,
  categoriesOf,
  deliveryQuote,
  finishSwatch,
  priced,
  wallLengthLabel,
  type CatEntry,
  type CatVariant,
  type SortBy,
} from './catalog';
import { Thumb } from './Thumb';
import './shop.css';

/** An entry's name, translated (furniture by its slot). */
export const entryName = (e: CatEntry) => (e.slot ? slotLabel(e.slot) : tx(e.label));

/** A variant's name, translated. */
const variantName = (e: CatEntry, v: CatVariant) =>
  e.source === 'wall' ? t('{n} m', { n: v.ref }) : tx(v.label);

const tierName = (n: number) => [t('Basic'), t('Good'), t('Luxury')][n - 1] ?? '';

export interface CatalogueProps {
  /** Online: delivered home for a fee; store: bought here, free and at once. */
  mode: 'online' | 'store';
  entries: CatEntry[];
  /** The money prices are in. */
  currency: string;
  /** In a showroom: its id (its till takes the money). */
  businessId?: string;
  /** In the mall (furniture goes through the mall's own till). */
  inMall?: boolean;
  category?: CatalogCategory | null;
  /** After a purchase or an order. */
  onBought?: (e: CatEntry, r: Record<string, unknown>) => void;
  /** Online: where your orders are (the Shop app's Orders). */
  onOrders?: () => void;
}

/** Whether a look may wear it (no dress or gele for a man), as the mall does. */
function fitsMe(gender: 'female' | 'male', e: CatEntry) {
  const x = e.mall;
  if (!x) return true;
  const parts = GENDER_PARTS[gender];
  return (
    (!x.topStyle || (parts.topStyle as readonly string[]).includes(x.topStyle)) &&
    (!x.headwear || (parts.headwear as readonly string[]).includes(x.headwear)) &&
    (x.worn?.slot !== 'shoes' || (parts.shoes as readonly string[]).includes(x.worn.style))
  );
}

export function Catalogue(p: CatalogueProps) {
  const { view } = useView();
  const gender = drawnGender(view.me.background?.id, view.me.id, genderOf(view.me));
  const look = avatarLook(view.me.background?.id, view.me.id, gender);
  const all = useMemo(() => p.entries.filter((e) => fitsMe(gender, e)), [p.entries, gender]);
  const [category, setCategory] = useState<CatalogCategory | null>(p.category ?? null);
  const [sort, setSort] = useState<SortBy>('featured');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const cats = categoriesOf(all);
  const shown = browse(all, { category, sort, query, label: entryName });
  const entry = open ? all.find((e) => e.id === open) : undefined;

  if (entry)
    return (
      <ItemPage key={entry.id} {...p} entry={entry} look={look} onBack={() => setOpen(null)} />
    );

  return (
    <div className="cat" data-catalogue={p.mode}>
      <div className="cat-tools">
        <input
          className="phone-search cat-search"
          type="search"
          aria-label={t('Search the catalogue')}
          placeholder={t('Search the catalogue')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="cat-sort"
          aria-label={t('Sort')}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortBy)}
        >
          <option value="featured">{t('Featured')}</option>
          <option value="price-up">{t('Price: low to high')}</option>
          <option value="price-down">{t('Price: high to low')}</option>
        </select>
      </div>
      <div className="cat-chips" role="tablist" aria-label={t('Categories')}>
        <button
          type="button"
          role="tab"
          aria-selected={category === null}
          className={`cat-chip${category === null ? ' is-on' : ''}`}
          onClick={() => setCategory(null)}
        >
          {t('All')}
        </button>
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            data-category={c.id}
            className={`cat-chip${category === c.id ? ' is-on' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {tx(c.label)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="small muted cat-empty">{t('Nothing matches.')}</p>
      ) : (
        <ul className="cat-grid" aria-label={t('Catalogue')}>
          {shown.map((e) => {
            const cheapest = e.variants.reduce((a, b) => (b.price < a.price ? b : a));
            const choices = e.variants.length * e.groups.reduce((n, g) => n * g.options.length, 1);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className="cat-card"
                  data-cat-entry={e.id}
                  data-price={cheapest.price}
                  onClick={() => setOpen(e.id)}
                >
                  <Thumb entry={e} variant={cheapest} look={look} colour={TOP_COLOURS[6]} />
                  <span className="cat-card-name">{entryName(e)}</span>
                  <span className="cat-card-price">
                    {e.variants.length > 1 ||
                    e.groups.some((g) => g.options.some((o) => o.permille !== 1000))
                      ? t('from {price}', { price: money(cheapest.price, p.currency) })
                      : money(cheapest.price, p.currency)}
                  </span>
                  <span className="cat-card-opts">{t('{n} options', { n: choices })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ItemPage(
  p: CatalogueProps & { entry: CatEntry; look: ReturnType<typeof avatarLook>; onBack: () => void },
) {
  const { view, send, busy } = useView();
  const e = p.entry;
  const shop = view.me.shop;
  const pocket = view.accounts.local?.balance ?? 0;
  const [ref, setRef] = useState((e.variants.find((v) => !v.owned) ?? e.variants[0]!).ref);
  const [chosen, setChosen] = useState<ChosenOptions>(() =>
    Object.fromEntries(e.groups.map((g) => [g.id, g.options[0]!.id])),
  );
  const [colour, setColour] = useState<string>(TOP_COLOURS[6]);
  const [step, setStep] = useState<'item' | 'checkout' | 'placed'>('item');
  const [speed, setSpeed] = useState<DeliverySpeed>('standard');
  const [placed, setPlaced] = useState<{ seconds: number; message: string } | null>(null);
  const v = e.variants.find((x) => x.ref === ref) ?? e.variants[0]!;
  const price = priced(e, v, chosen);
  const swatch = finishSwatch(e, chosen);
  const wearsColour = !!e.mall?.topStyle;
  const online = p.mode === 'online';
  const quote = online && shop ? deliveryQuote(shop, e, price, speed) : null;
  const total = price + (quote?.fee ?? 0);
  // One furniture delivery per slot at a time; a phone or car you have.
  const coming = view.living.deliveries.some(
    (d) =>
      d.owner === view.me.id &&
      !d.complete &&
      ((e.slot && d.item?.slot === e.slot) ||
        (d.order?.car && d.order.car.modelId === v.ref) ||
        (d.order?.mall && d.order.mall.item === v.ref && e.id === 'mall:phone')),
  );
  const ownedNote = v.owned ? t('Yours ✓') : coming ? t('On its way') : null;
  const short = pocket < total;

  const buy = async () => {
    const cmd = buyCommand(e, v, chosen, {
      ...(online ? { delivery: speed } : {}),
      ...(p.businessId ? { businessId: p.businessId } : {}),
      ...(wearsColour ? { colour } : {}),
      ...(p.inMall ? { inMall: true } : {}),
    });
    const r = await send<Record<string, unknown>>(looseCmd(cmd), (x) =>
      online ? null : typeof x?.message === 'string' ? tx(x.message) : null,
    );
    if (!r) return;
    p.onBought?.(e, r);
    if (online) {
      setPlaced({
        seconds: quote?.seconds ?? 0,
        message: typeof r.message === 'string' ? r.message : '',
      });
      setStep('placed');
    } else p.onBack();
  };

  const picture = (
    <Thumb entry={e} variant={v} swatch={swatch} colour={colour} look={p.look} size="big" />
  );

  if (step === 'placed' && placed)
    return (
      <div className="cat cat-placed" data-order-placed={e.id} role="status">
        {picture}
        <h3>{t('Order placed')}</h3>
        <p>
          {t(
            '{item} is on its way to your home. It arrives in about {n} seconds: unpack it at home.',
            {
              item: entryName(e),
              n: placed.seconds,
            },
          )}
        </p>
        <div className="cat-actions">
          {p.onOrders && (
            <button
              type="button"
              className="btn btn-primary"
              data-action="track-order"
              onClick={p.onOrders}
            >
              {t('Track your order')}
            </button>
          )}
          <button type="button" className="btn btn-subtle" onClick={p.onBack}>
            {t('Keep shopping')}
          </button>
        </div>
      </div>
    );

  if (step === 'checkout' && shop && quote)
    return (
      <div className="cat cat-checkout" data-checkout={e.id}>
        <button type="button" className="btn btn-subtle cat-back" onClick={() => setStep('item')}>
          {t('← Back')}
        </button>
        <h3>{t('Checkout')}</h3>
        <div className="cat-line">
          <Thumb entry={e} variant={v} swatch={swatch} colour={colour} look={p.look} />
          <div className="cat-line-text">
            <b>{entryName(e)}</b>
            <span className="small muted">
              {[
                e.variants.length > 1 ? variantName(e, v) : null,
                ...e.groups.map((g) =>
                  tx(g.options.find((o) => o.id === chosen[g.id])?.label ?? ''),
                ),
                wearsColour ? colourName(colour) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <b className="cat-line-price">{moneyExact(price, p.currency)}</b>
        </div>
        <fieldset className="cat-group" data-group="delivery">
          <legend>{t('Delivery')}</legend>
          {(['standard', 'express'] as const).map((s) => {
            const q = deliveryQuote(shop, e, price, s);
            return (
              <label key={s} className={`cat-opt${speed === s ? ' is-on' : ''}`} data-speed={s}>
                <input
                  type="radio"
                  name="speed"
                  checked={speed === s}
                  onChange={() => setSpeed(s)}
                />
                <span className="cat-opt-name">
                  {s === 'standard' ? t('Standard delivery') : t('Express delivery')}
                  <small>{t('Arrives in about {n} seconds', { n: q.seconds })}</small>
                </span>
                <b>{moneyExact(q.fee, p.currency)}</b>
              </label>
            );
          })}
        </fieldset>
        <p className="small muted">
          {t('Delivered to your home in {city}. Unpack it there when it arrives.', {
            city: view.market.name,
          })}
        </p>
        <dl className="cat-sum">
          <dt>{t('Item')}</dt>
          <dd>{moneyExact(price, p.currency)}</dd>
          <dt>{t('Delivery')}</dt>
          <dd data-fee={quote.fee}>{moneyExact(quote.fee, p.currency)}</dd>
          <dt className="cat-total">{t('Total')}</dt>
          <dd className="cat-total" data-total={total}>
            {moneyExact(total, p.currency)}
          </dd>
        </dl>
        {short && <p className="small cat-short">{t('You don’t have enough in your pocket.')}</p>}
        <button
          type="button"
          className="btn btn-primary cat-go"
          data-action="place-order"
          disabled={busy || short}
          onClick={() => void buy()}
        >
          {t('Place order · {total}', { total: moneyExact(total, p.currency) })}
        </button>
      </div>
    );

  return (
    <div className="cat cat-item" data-cat-item={e.id} data-variant={v.ref}>
      <button type="button" className="btn btn-subtle cat-back" onClick={p.onBack}>
        {t('← Catalogue')}
      </button>
      {picture}
      <div className="cat-head">
        <h3>{entryName(e)}</h3>
        <b className="cat-price" data-price={price}>
          {moneyExact(price, p.currency)}
        </b>
      </div>
      {e.wall && <p className="small muted">{tx(wallBlurb(e))}</p>}
      {e.monthlyCost !== undefined && (
        <p className="small muted">
          {t('{cost}/mo to run', { cost: moneyExact(e.monthlyCost, p.currency) })}
        </p>
      )}
      {e.variants.length > 1 && (
        <fieldset className="cat-group" data-group="variant">
          <legend>
            {e.source === 'wall'
              ? t('Length')
              : e.variants.every((x) => x.tier)
                ? t('Quality')
                : t('Size')}
          </legend>
          {e.variants.map((x) => (
            <label
              key={x.ref}
              className={`cat-opt${x.ref === v.ref ? ' is-on' : ''}`}
              data-option={x.ref}
              data-price={priced(e, x, chosen)}
            >
              <input
                type="radio"
                name="variant"
                checked={x.ref === v.ref}
                onChange={() => setRef(x.ref)}
              />
              <span className="cat-opt-name">
                {e.source === 'furniture' && x.tier ? (
                  <>
                    {tierName(x.tier)} <span aria-hidden="true">{'★'.repeat(x.tier)}</span>
                    <small>{variantName(e, x)}</small>
                  </>
                ) : (
                  variantName(e, x)
                )}
                {x.owned && <small>{t('Yours ✓')}</small>}
              </span>
              <b>{moneyExact(priced(e, x, chosen), p.currency)}</b>
            </label>
          ))}
        </fieldset>
      )}
      {e.groups.map((g) => (
        <fieldset key={g.id} className="cat-group" data-group={g.id}>
          <legend>{tx(g.label)}</legend>
          {g.options.map((o) => {
            const on = chosen[g.id] === o.id;
            return (
              <label
                key={o.id}
                className={`cat-opt${on ? ' is-on' : ''}`}
                data-option={o.id}
                data-price={priced(e, v, { ...chosen, [g.id]: o.id })}
              >
                <input
                  type="radio"
                  name={g.id}
                  checked={on}
                  onChange={() => setChosen({ ...chosen, [g.id]: o.id })}
                />
                {o.swatch && <i className="cat-swatch" style={{ background: o.swatch }} />}
                <span className="cat-opt-name">{tx(o.label)}</span>
                <b>{moneyExact(priced(e, v, { ...chosen, [g.id]: o.id }), p.currency)}</b>
              </label>
            );
          })}
        </fieldset>
      ))}
      {wearsColour && (
        <fieldset className="cat-group" data-group="colour">
          <legend>
            {t('Colour')} · {colourName(colour)}
          </legend>
          <div className="cat-colours" role="radiogroup" aria-label={t('Colour')}>
            {TOP_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === colour}
                aria-label={colourName(c)}
                data-colour={c}
                className={`cat-colour${c === colour ? ' is-on' : ''}`}
                style={{ background: c }}
                onClick={() => setColour(c)}
              />
            ))}
          </div>
        </fieldset>
      )}
      {online ? (
        <p className="small muted">
          {e.mall && (e.mall.topStyle || e.mall.worn)
            ? t(
                'Online it’s delivered to your wardrobe: try it on in the shop instead, free and at once.',
              )
            : t('Delivered to your home for a fee. In the shop it’s free and at once.')}
        </p>
      ) : (
        <p className="small muted">{t('Bought here: free and at once.')}</p>
      )}
      <div className="cat-actions">
        {ownedNote ? (
          <span className="cat-owned">{ownedNote}</span>
        ) : online ? (
          <button
            type="button"
            className="btn btn-primary cat-go"
            data-action="checkout"
            disabled={!shop}
            onClick={() => setStep('checkout')}
          >
            {t('Checkout · {price}', { price: moneyExact(price, p.currency) })}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary cat-go"
            data-action="buy-here"
            disabled={busy || pocket < price}
            onClick={() => void buy()}
          >
            {t('Buy · {price}', { price: moneyExact(price, p.currency) })}
          </button>
        )}
      </div>
    </div>
  );
}

const wallBlurb = (e: CatEntry) => (e.wall ? WALLS[e.wall].blurb : '');

export { wallLengthLabel };
