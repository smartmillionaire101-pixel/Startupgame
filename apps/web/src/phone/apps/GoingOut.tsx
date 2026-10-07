/**
 * Going out (Wave 10 §C): everything to do across the city's venues, by
 * lifestyle tier: street food and football up to yachts, polo, galas and a
 * private-jet weekend. What your lifestyle doesn't reach yet shows greyed,
 * with the tier it unlocks at. Go walks (or rides) you to the venue; Book
 * does it now: the big outings play as their own act, the jet asks where to.
 */
import { useState } from 'react';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { businessesOf, type BusinessView } from '../../city/contract';
import { venueItemsOf, type VenueItemView } from '../../city/life';
import { outingOf, startOuting } from '../../city/outings';
import { cityViewOf } from '../../city/travel';
import { lifestyleName, myLifestyleTier } from '../../city/wave10';
import { H, Nothing, type PhoneCtx } from '../shared';
import '../wave10.css';

interface Activity {
  b: BusinessView;
  it: VenueItemView;
}

const TIER_ICON = ['🥘', '🎬', '⛳', '🛥', '🛩'];

export function GoingOut({ ctx }: { ctx: PhoneCtx }) {
  const { view, send, busy } = useView();
  const city = cityViewOf(view);
  const cur = city.market.currency;
  const mine = myLifestyleTier(view);
  const [show, setShow] = useState<'all' | 'open'>('all');
  const pocket = view.accounts.local?.balance ?? 0;
  const all: Activity[] = [];
  for (const b of businessesOf(city)) {
    if (!b.open) continue;
    for (const it of venueItemsOf(city, b.id))
      if (it.activity || it.requiresTier > 1) all.push({ b, it });
  }
  if (!all.length)
    return <Nothing icon="events">{t('Nothing to do listed in this city yet.')}</Nothing>;
  const byTier = new Map<number, Activity[]>();
  for (const a of all) {
    if (show === 'open' && a.it.locked) continue;
    const list = byTier.get(a.it.requiresTier) ?? [];
    list.push(a);
    byTier.set(a.it.requiresTier, list);
  }
  const book = (a: Activity) => {
    if (outingOf(a.it)) {
      ctx.close();
      startOuting({
        businessId: a.b.id,
        venueName: a.b.name,
        item: { id: a.it.id, label: a.it.label, price: a.it.price, travel: a.it.travel },
      });
      return;
    }
    void send<{ message?: string }>(
      { type: 'venue.buy', businessId: a.b.id, itemId: a.it.id },
      (r) => (r?.message ? tx(r.message) : t('Done.')),
    );
  };
  return (
    <div className="phone-stack going-out">
      <section className="phone-card going-tier" aria-label={t('Your lifestyle')}>
        <div className="spread">
          <span>
            {t('Your lifestyle: tier {n} ({name})', { n: mine, name: lifestyleName(view, mine) })}
          </span>
          <span className="tier-dots" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= mine ? 'on' : ''} />
            ))}
          </span>
        </div>
        <span className="small muted">
          {t(
            'Higher tiers unlock as you live better: change it in Me, or move into a home you own.',
          )}
        </span>
      </section>
      <div className="chip-row" role="group" aria-label={t('Show')}>
        <button
          type="button"
          className={`chip-btn${show === 'all' ? ' on' : ''}`}
          aria-pressed={show === 'all'}
          onClick={() => setShow('all')}
        >
          {t('Everything')}
        </button>
        <button
          type="button"
          className={`chip-btn${show === 'open' ? ' on' : ''}`}
          aria-pressed={show === 'open'}
          onClick={() => setShow('open')}
        >
          {t('What I can do')}
        </button>
      </div>
      {[...byTier.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tier, list]) => (
          <section key={tier} aria-label={t('Tier {n}', { n: tier })} data-tier-group={tier}>
            <H>
              <span aria-hidden="true">{TIER_ICON[tier - 1] ?? '✨'}</span>{' '}
              {t('Tier {n} · {name}', { n: tier, name: lifestyleName(view, tier) })}
            </H>
            <ul className="phone-list">
              {list
                .sort((x, y) => x.it.price - y.it.price)
                .slice(0, tier === 1 ? 12 : 40)
                .map((a) => (
                  <li
                    key={`${a.b.id}:${a.it.id}`}
                    className={`going-row${a.it.locked ? ' is-locked' : ''}`}
                    data-activity={a.it.id}
                    data-locked={a.it.locked ? '' : undefined}
                  >
                    <span className="going-main">
                      <b>{tx(a.it.label)}</b>
                      <span className="small muted">
                        {a.b.name} · {money(a.it.price, cur)}
                        {a.it.travel ? ` · ${t('to another city')}` : ''}
                      </span>
                      {a.it.locked && (
                        <span className="small going-lock" data-lock>
                          🔒{' '}
                          {t('Unlocks at tier {n} ({name})', {
                            n: a.it.requiresTier,
                            name: lifestyleName(view, a.it.requiresTier),
                          })}
                        </span>
                      )}
                    </span>
                    {!a.it.locked && (
                      <span className="going-actions">
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          aria-label={t('Go to {place}', { place: a.b.name })}
                          onClick={() => ctx.goPlace(`biz:${a.b.id}`)}
                        >
                          {t('Go')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          aria-label={t('Book {thing} at {place}', {
                            thing: tx(a.it.label),
                            place: a.b.name,
                          })}
                          disabled={busy || pocket < a.it.price}
                          onClick={() => book(a)}
                        >
                          {t('Book')}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
