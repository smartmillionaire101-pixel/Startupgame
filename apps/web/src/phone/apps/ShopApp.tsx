/**
 * Shop (player feedback: "the option of shopping online rather than going to
 * the shop each time"): the catalogue of everything the shops sell, ordered
 * online for delivery to your home (a fee and a wait; in person stays free
 * and at once), and your orders on their way. A delivery that's arrived is
 * unpacked at home.
 */
import { useEffect, useMemo, useState } from 'react';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { openLiving } from '../../experiences/living-bus';
import { Catalogue } from '../../shop/Catalogue';
import { deliveryIcon, deliveryLabel, onlineCatalog } from '../../shop/catalog';
import { Nothing, type PhoneCtx } from '../shared';

export function ShopApp({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const shop = view.me.shop;
  const [tab, setTab] = useState<'shop' | 'orders'>('shop');
  const [gen, setGen] = useState(0);
  const entries = useMemo(() => onlineCatalog(view), [view]);
  const mine = view.living.deliveries.filter((d) => d.owner === view.me.id);
  const waiting = mine.filter((d) => !d.complete);
  if (!shop)
    return <Nothing icon="cart">{t('Shopping online isn’t open yet. Refresh to get it.')}</Nothing>;
  return (
    <div className="phone-stack shop-app" data-shop-app={tab}>
      <div className="shop-tabs" role="tablist" aria-label={t('Shop')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shop'}
          className={`cat-chip${tab === 'shop' ? ' is-on' : ''}`}
          onClick={() => {
            setTab('shop');
            setGen((n) => n + 1);
          }}
        >
          {t('Catalogue')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'orders'}
          data-tab="orders"
          className={`cat-chip${tab === 'orders' ? ' is-on' : ''}`}
          onClick={() => setTab('orders')}
        >
          {waiting.length ? t('Orders ({n})', { n: waiting.length }) : t('Orders')}
        </button>
      </div>
      {tab === 'shop' ? (
        <>
          {!shop.atHome && (
            <p className="small muted">
              {t(
                'You’re away: it’s delivered to your home in {city}, to unpack when you’re back.',
                {
                  city: view.market.name,
                },
              )}
            </p>
          )}
          <Catalogue
            key={gen}
            mode="online"
            entries={entries}
            currency={shop.currency}
            onOrders={() => setTab('orders')}
          />
        </>
      ) : (
        <Orders
          rows={[
            ...waiting,
            ...mine
              .filter((d) => d.complete)
              .slice(-6)
              .reverse(),
          ]}
          currency={shop.currency}
          onUnpack={() => {
            ctx.close();
            openLiving(view.me.id);
          }}
        />
      )}
    </div>
  );
}

function Orders({
  rows,
  currency,
  onUnpack,
}: {
  rows: ReturnType<typeof useView>['view']['living']['deliveries'];
  currency: string;
  onUnpack: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!rows.length) return <Nothing icon="cart">{t('No orders yet.')}</Nothing>;
  return (
    <ul className="shop-orders" aria-label={t('Orders')}>
      {rows.map((d) => {
        const left = Math.max(0, Math.ceil((d.arrivesAt - now) / 1000));
        const span = Math.max(1, d.arrivesAt - d.orderedAt);
        const done = Math.min(1, Math.max(0, (now - d.orderedAt) / span));
        const state = d.complete ? 'unpacked' : left > 0 ? 'coming' : 'arrived';
        return (
          <li key={d.id} className="phone-card shop-order" data-order={d.id} data-state={state}>
            <span className="shop-order-icon" aria-hidden="true">
              {deliveryIcon(d)}
            </span>
            <div className="shop-order-main">
              <b>{tx(deliveryLabel(d))}</b>
              <span className="small muted">
                {state === 'unpacked'
                  ? t('Delivered and unpacked')
                  : state === 'coming'
                    ? t('On its way · arrives in {n}s', { n: left })
                    : t('At your door')}
                {d.order
                  ? ` · ${t('{price} + {fee} delivery', {
                      price: money(d.order.price, currency),
                      fee: money(d.order.fee, currency),
                    })}`
                  : ''}
              </span>
              {!d.complete && (
                <span className="shop-track" aria-hidden="true">
                  <i style={{ width: `${Math.round(done * 100)}%` }} />
                </span>
              )}
            </div>
            {state === 'arrived' && (
              <button
                type="button"
                className="btn btn-primary"
                data-action="unpack"
                onClick={onUnpack}
              >
                {t('Unpack at home')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
