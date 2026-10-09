/**
 * Showrooms (docs/WAVE6-ALIVE-CITY.md §A3, §C2): a furniture store, an
 * appliance or electronics shop, or a car dealer lists what it sells, with
 * the price, the comfort it adds and an "owned" mark. Buying sends
 * `home.order` / `car.buy` with this `businessId`, so the money lands in this
 * business's till.
 */
import { useState } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Card, Empty, Pill } from '../ui';
import type { BusinessView } from './contract';
import { HOME_SLOTS, carOf, homeOf, looseCmd, sellsOf, shopOf, type HomeItemView } from './life';

/** A slot's name, translated; a slot the client doesn't know shows as written. */
export function slotLabel(slot: string): string {
  const known: Record<string, string> = {
    sofa: t('Sofa'),
    bed: t('Bed'),
    desk: t('Desk'),
    tv: t('TV'),
    plants: t('Plants'),
    art: t('Art'),
    kitchen: t('Kitchen'),
    sound: t('Sound system'),
    gaming: t('Gaming'),
    fridge: t('Fridge'),
    washer: t('Washing machine'),
    cooling: t('Fan or air conditioning'),
    power: t('Power (generator or solar)'),
    lights: t('Lights'),
    rug: t('Rug'),
    dining: t('Dining table'),
    wardrobe: t('Wardrobe'),
    books: t('Bookshelf'),
    coffee: t('Coffee machine'),
    wifi: t('Home wifi'),
    laptop: t('Laptop'),
  };
  return known[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1).replace(/-/g, ' ');
}

/** How many of the flat's slots you've filled, of all the slots there are. */
export function slotsOwned(items: HomeItemView[]): { owned: number; total: number } {
  const slots = new Set(items.map((i) => i.slot));
  const total = new Set<string>([...HOME_SLOTS, ...slots]).size;
  return { owned: slots.size, total };
}

/** Buy, with a second tap to confirm (these are big purchases). */
function BuyButton({
  label,
  disabled,
  onBuy,
}: {
  label: string;
  disabled: boolean;
  onBuy: () => void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${armed ? 'btn-primary' : 'btn-subtle'} shop-buy`}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onBuy();
      }}
    >
      {armed ? t('Tap again to buy') : label}
    </button>
  );
}

export function Showroom({ business: b }: { business: BusinessView }) {
  const { view, send, cur, busy } = useView();
  const sells = sellsOf(view, b);
  const shop = shopOf(view);
  const pocket = view.accounts.local?.balance ?? 0;
  const pocketLine = (
    <p className="small muted" data-pocket={pocket}>
      {t('In your pocket: {amount}', { amount: money(pocket, cur) })}
    </p>
  );

  if (!sells) return <Empty>{t('Nothing for your home on sale here.')}</Empty>;

  if ('cars' in sells) {
    const mine = carOf(view);
    return (
      <Card title={t('Cars on the floor')}>
        {pocketLine}
        {shop.cars.length === 0 ? (
          <Empty>{t('Nothing on the floor right now.')}</Empty>
        ) : (
          <ul className="shop-list" aria-label={t('Cars on the floor')}>
            {shop.cars.map((c) => {
              const owned =
                mine?.modelId === c.id || view.me.garage.some((car) => car.modelId === c.id);
              return (
                <li key={c.id} data-shop-item={c.id} data-owned={owned ? '1' : '0'}>
                  <span className="shop-main">
                    <span className="item-title">{tx(c.label)}</span>
                    <span className="small muted">
                      {t('{cost}/mo to run', { cost: money(c.monthlyCost, cur) })}
                    </span>
                  </span>
                  <b className="shop-price">{money(c.price, cur)}</b>
                  {owned ? (
                    <Pill tone="good">{t('Yours ✓')}</Pill>
                  ) : (
                    <BuyButton
                      label={t('Buy')}
                      disabled={busy || pocket < c.price}
                      onBuy={() =>
                        void send(
                          looseCmd({
                            type: 'car.buy',
                            modelId: c.id,
                            businessId: b.id,
                            keepCurrent: true,
                          }),
                          (r: { message?: string } | null) =>
                            r?.message
                              ? tx(r.message)
                              : t('The {car} is yours.', { car: tx(c.label) }),
                        )
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  }

  const owned = new Set((homeOf(view)?.items ?? []).map((i) => i.itemId));
  const order = (s: string) => {
    const k = (HOME_SLOTS as readonly string[]).indexOf(s);
    return k < 0 ? 99 : k;
  };
  const slots = [...new Set(sells.slots)].sort((x, y) => order(x) - order(y));
  const groups = slots
    .map((slot) => ({
      slot,
      items: shop.furniture.filter((f) => f.slot === slot).sort((x, y) => x.tier - y.tier),
    }))
    .filter((g) => g.items.length);
  return (
    <Card title={t('In the showroom')}>
      {pocketLine}
      <p className="small muted">{t('One of each for your flat. Comfort helps you rest.')}</p>
      {groups.length === 0 ? (
        <Empty>{t('Nothing on the floor right now.')}</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.slot} className="shop-group" data-slot={g.slot}>
            <h3 className="shop-h">{slotLabel(g.slot)}</h3>
            <ul className="shop-list">
              {g.items.map((f) => {
                const mine = owned.has(f.id);
                const pending = view.living.deliveries.some(
                  (d) => d.owner === view.me.id && !d.complete && d.item?.slot === f.slot,
                );
                return (
                  <li key={f.id} data-shop-item={f.id} data-owned={mine ? '1' : '0'}>
                    <span className="shop-main">
                      <span className="item-title">{tx(f.label)}</span>
                      {f.comfort > 0 && (
                        <span className="small muted">{t('+{n} comfort', { n: f.comfort })}</span>
                      )}
                    </span>
                    <b className="shop-price">{money(f.price, cur)}</b>
                    {mine ? (
                      <Pill tone="good">{t('Yours ✓')}</Pill>
                    ) : pending ? (
                      <Pill>Delivery on the way</Pill>
                    ) : (
                      <BuyButton
                        label={t('Buy')}
                        disabled={busy || pocket < f.price}
                        onBuy={() =>
                          void send(
                            looseCmd({ type: 'home.order', itemId: f.id, businessId: b.id }),
                            (r: { message?: string } | null) =>
                              r?.message
                                ? tx(r.message)
                                : t('{item} is on its way to your flat.', { item: tx(f.label) }),
                          )
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </Card>
  );
}
