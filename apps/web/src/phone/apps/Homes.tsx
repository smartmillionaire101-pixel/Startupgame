/**
 * Homes (Wave 10 §C): the property market of the city you're in, by
 * neighbourhood (`here.properties`), each listing with its tier, bedrooms,
 * price, running costs, rent and a mortgage quote; a listing opens with a
 * 3D tour (the interiors kit, scaled to the home) and Buy, in cash or with a
 * mortgage you shape (down payment, term). Portfolio: the homes you own in
 * every city (`me.properties`), with Rent out, Sell and Move in, and your
 * net worth (`me.netWorth`).
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { money, pct } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button, Segmented } from '../../ui';
import { use3d } from '../../three-kit/quality';
import { hereOf } from '../../city/travel';
import {
  PROPERTY_TIER_ORDER,
  cityName,
  estateOf,
  lifestyleName,
  monthlyPayment,
  myProperties,
  planTierOf,
  propertiesHere,
  tierName,
  type Listing,
  type MyProperty,
} from '../../city/wave10';
import { PropertyArt } from '../PropertyArt';
import { H, Line, Nothing, type PhoneCtx } from '../shared';
import '../wave10.css';

const PropertyTour3D = lazy(() =>
  import('../../interiors3d/PropertyTour3D').catch(() => ({ default: () => null })),
);

type Tab = 'listings' | 'portfolio';

export function Homes({ ctx }: { ctx: PhoneCtx }) {
  // A tap on one of your homes on the map opens the portfolio.
  const [tab, setTab] = useState<Tab>(ctx.property ? 'portfolio' : 'listings');
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <ListingDetail id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="phone-stack homes">
      <Segmented<Tab>
        label={t('Homes')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'listings', label: t('For sale') },
          { value: 'portfolio', label: t('Portfolio') },
        ]}
      />
      {tab === 'listings' ? <Listings onOpen={setOpen} /> : <Portfolio />}
    </div>
  );
}

// ---------------------------------------------------------------- Listings

function Listings({ onOpen }: { onOpen: (id: string) => void }) {
  const { view } = useView();
  const market = propertiesHere(view);
  const here = hereOf(view);
  const [tier, setTier] = useState<string>('all');
  if (!market) return <Nothing icon="house">{t('No property market in this city yet.')}</Nothing>;
  const forSale = market.listings.filter((l) => l.forSale);
  const tiers = PROPERTY_TIER_ORDER.filter((x) => forSale.some((l) => l.tier === x));
  const shown = forSale.filter((l) => tier === 'all' || l.tier === tier);
  const byHood = new Map<string, Listing[]>();
  for (const l of shown.slice().sort((a, b) => a.price - b.price)) {
    const list = byHood.get(l.neighbourhood) ?? [];
    list.push(l);
    byHood.set(l.neighbourhood, list);
  }
  const hoods = [...byHood.entries()].sort((a, b) => b[1][0]!.price - a[1][0]!.price);
  const up = market.changePct >= 0;
  return (
    <>
      <section className="phone-card homes-market" aria-label={t('The market')}>
        <div className="spread">
          <b>{t('Homes in {city}', { city: here.name })}</b>
          <span className={up ? 'good small' : 'bad small'}>
            {up ? '▲' : '▼'} {pct(Math.abs(market.changePct) / 100, 1)}
          </span>
        </div>
        <div className="small muted">
          {t('Mortgages from {rate} a year · rents yield about {yield}', {
            rate: pct(market.mortgageRateBps / 10_000, 1),
            yield: pct(market.rentYieldPct / 100, 1),
          })}
        </div>
      </section>
      <div className="chip-row" role="group" aria-label={t('Filter by tier')}>
        {['all', ...tiers].map((x) => (
          <button
            key={x}
            type="button"
            className={`chip-btn${tier === x ? ' on' : ''}`}
            aria-pressed={tier === x}
            onClick={() => setTier(x)}
          >
            {x === 'all' ? t('All') : tierName(x)}
          </button>
        ))}
      </div>
      {hoods.length === 0 && <Nothing icon="house">{t('Nothing for sale right now.')}</Nothing>}
      {hoods.map(([hood, list]) => (
        <section key={hood} aria-label={hood} data-neighbourhood={hood}>
          <H>{hood}</H>
          <ul className="phone-list">
            {list.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="listing"
                  data-listing={l.id}
                  data-tier={l.tier}
                  onClick={() => onOpen(l.id)}
                  aria-label={t('{tier} on {street}, {price}', {
                    tier: tierName(l.tier),
                    street: l.street,
                    price: money(l.price, here.currency),
                  })}
                >
                  <PropertyArt tier={l.tier} seed={l.id} />
                  <span className="listing-main">
                    <span className="spread">
                      <b>{tierName(l.tier)}</b>
                      <b className="listing-price">{money(l.price, here.currency)}</b>
                    </span>
                    <span className="small muted">
                      {l.street} ·{' '}
                      {l.bedrooms ? t('{n} bedrooms', { n: l.bedrooms }) : t('Open plan')} ·{' '}
                      {t('Tier {n}', { n: l.lifestyleTier })}
                    </span>
                    <span className="small">
                      {t('Upkeep {upkeep}/mo · lets for {rent}/mo', {
                        upkeep: money(l.upkeep, here.currency),
                        rent: money(l.rent, here.currency),
                      })}
                    </span>
                    <span className="small muted">
                      {t('Mortgage: {monthly}/mo with {down}% down', {
                        monthly: money(l.mortgageQuote.monthly, here.currency),
                        down: l.mortgageQuote.downPct,
                      })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- A listing

const DOWNS = [20, 25, 35, 50];
const YEARS = [10, 15, 25, 30];

function ListingDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { view, send, busy } = useView();
  const market = propertiesHere(view);
  const here = hereOf(view);
  const l = market?.listings.find((x) => x.id === id) ?? null;
  const [down, setDown] = useState(25);
  const [years, setYears] = useState(25);
  const want3d = use3d();
  const [ready, setReady] = useState(false);
  // Open at the top of the listing (the list may have been scrolled far down).
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => top.current?.scrollIntoView({ block: 'start' }), [id]);
  const night = false;
  if (!l || !market)
    return (
      <div className="phone-stack">
        <Nothing icon="house">{t('That home isn’t listed any more.')}</Nothing>
        <Button variant="subtle" onClick={onBack}>
          {t('Back to the listings')}
        </Button>
      </div>
    );
  const cur = here.currency;
  const deposit = Math.round((l.price * down) / 100);
  const loan = l.price - deposit;
  const monthly = monthlyPayment(loan, market.mortgageRateBps, years * 12);
  const isDefault = down === l.mortgageQuote.downPct && years * 12 === l.mortgageQuote.months;
  // Reasons that don't depend on the terms (sold, or you're in another city).
  const hardReason = l.reason && !/don’t have it|you need/i.test(l.reason) ? l.reason : null;
  const mortgageReason = isDefault ? l.mortgageReason : hardReason;
  const mine = l.owner?.you;
  const buy = (mortgage?: { downPct: number; months: number }) =>
    void send<{ message?: string }>(
      { type: 'property.buy', propertyId: l.id, ...(mortgage ? { mortgage } : {}) },
      (r) => (r?.message ? tx(r.message) : t('It’s yours.')),
    );
  return (
    <div className="phone-stack listing-detail" data-listing-detail={l.id} ref={top}>
      <button type="button" className="phone-link" onClick={onBack}>
        ‹ {t('Back to the listings')}
      </button>
      <div className={`tour${want3d && ready ? ' is-3d' : ''}`} data-tour={l.tier}>
        {want3d && (
          <Suspense fallback={null}>
            <PropertyTour3D
              planTier={planTierOf(l.tier)}
              finish={l.lifestyleTier >= 4 ? 3 : l.lifestyleTier >= 3 ? 2 : 1}
              estate={estateOf(l.tier)}
              night={night}
              onReady={() => setReady(true)}
            />
          </Suspense>
        )}
        <PropertyArt tier={l.tier} seed={l.id} className="tour-art" />
        {want3d && ready && <span className="tour-hint small">{t('Drag to look round')}</span>}
      </div>
      <section className="phone-card">
        <div className="spread">
          <b className="item-title">
            {tierName(l.tier)} · {l.neighbourhood}
          </b>
          <b>{money(l.price, cur)}</b>
        </div>
        <div className="small muted">
          {l.street} · {l.bedrooms ? t('{n} bedrooms', { n: l.bedrooms }) : t('Open plan')}
        </div>
        <Line
          label={t('Living here')}
          value={t('Lifestyle tier {n} ({name})', {
            n: l.lifestyleTier,
            name: lifestyleName(view, l.lifestyleTier),
          })}
        />
        <Line label={t('Upkeep')} value={t('{amount}/mo', { amount: money(l.upkeep, cur) })} />
        <Line
          label={t('Rent if you let it')}
          value={t('{amount}/mo', { amount: money(l.rent, cur) })}
        />
        <Line label={t('Stamp duty and fees')} value={money(l.closingCosts, cur)} />
        {l.owner && !mine && (
          <p className="small muted">{t('Owned by {name}.', { name: l.owner.name })}</p>
        )}
      </section>
      {mine ? (
        <p className="phone-note" data-owned>
          {t('You own this home. Manage it in Portfolio.')}
        </p>
      ) : (
        <>
          <section className="phone-card" aria-label={t('Buy outright')}>
            <H>{t('Buy outright')}</H>
            <Line label={t('Cash now')} value={money(l.price + l.closingCosts, cur)} />
            <Button disabled={busy || !l.canBuy} onClick={() => buy()}>
              {t('Buy for {price}', { price: money(l.price, cur) })}
            </Button>
            {l.reason && (
              <p className="small bad" data-reason>
                {tx(l.reason)}
              </p>
            )}
          </section>
          <section className="phone-card" aria-label={t('Buy with a mortgage')}>
            <H>{t('Buy with a mortgage')}</H>
            <span className="small muted">{t('Down payment')}</span>
            <Segmented
              label={t('Down payment')}
              value={String(down)}
              onChange={(v) => setDown(Number(v))}
              options={DOWNS.map((d) => ({ value: String(d), label: `${d}%` }))}
            />
            <span className="small muted">{t('Term')}</span>
            <Segmented
              label={t('Term')}
              value={String(years)}
              onChange={(v) => setYears(Number(v))}
              options={YEARS.map((y) => ({ value: String(y), label: t('{n} yrs', { n: y }) }))}
            />
            <Line label={t('Deposit')} value={money(deposit, cur)} />
            <Line
              label={t('Loan at {rate}', { rate: pct(market.mortgageRateBps / 10_000, 1) })}
              value={money(loan, cur)}
            />
            <Line
              label={t('Monthly payment')}
              value={<b data-monthly={monthly}>{money(monthly, cur)}</b>}
            />
            {!mortgageReason && (
              <p className="small muted">
                {t('You need {now} now and {reserve} in reserve (six payments).', {
                  now: money(deposit + l.closingCosts, cur),
                  reserve: money(monthly * 6, cur),
                })}
              </p>
            )}
            <Button
              variant="secondary"
              disabled={busy || !!mortgageReason}
              onClick={() => buy({ downPct: down, months: years * 12 })}
            >
              {t('Buy with a mortgage ({monthly}/mo)', { monthly: money(monthly, cur) })}
            </Button>
            {mortgageReason && (
              <p className="small bad" data-mortgage-reason>
                {tx(mortgageReason)}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Portfolio

function Portfolio() {
  const { view } = useView();
  const mine = myProperties(view);
  const nw = view.me.netWorth;
  return (
    <>
      {nw && (
        <section className="phone-card phone-hero homes-worth" aria-label={t('Net worth')}>
          <span className="small">{t('Net worth')}</span>
          <strong className="homes-worth-total" data-net-worth={nw.total}>
            {money(nw.total, nw.currency)}
          </strong>
          <div className="small">
            {t('Cash {cash} · property equity {equity} · loans {loans}', {
              cash: money(nw.cash, nw.currency),
              equity: money(nw.propertyEquity, nw.currency),
              loans: money(nw.loans, nw.currency),
            })}
          </div>
        </section>
      )}
      {mine.length === 0 ? (
        <Nothing icon="house">
          {t(
            'You don’t own a home yet. Buy one in the city you’re in, in cash or with a mortgage.',
          )}
        </Nothing>
      ) : (
        <ul className="phone-list" aria-label={t('Your homes')}>
          {mine.map((p) => (
            <OwnedHome key={p.id} p={p} />
          ))}
        </ul>
      )}
    </>
  );
}

function OwnedHome({ p }: { p: MyProperty }) {
  const { view, send, busy } = useView();
  const [armed, setArmed] = useState<'sell' | 'move' | null>(null);
  const cur = p.currency;
  const away = p.market !== view.market.id;
  const act = (command: Parameters<typeof send>[0], ok: string) =>
    void send<{ message?: string }>(command, (r) => (r?.message ? tx(r.message) : ok)).then(() =>
      setArmed(null),
    );
  const net = p.netMonthly;
  const summary = useMemo(
    () =>
      p.rentedOut
        ? t('Let: {rent}/mo after tax', { rent: money(p.monthlyRent, cur) })
        : p.residence
          ? t('You live here')
          : t('Empty'),
    [p.rentedOut, p.residence, p.monthlyRent, cur],
  );
  return (
    <li
      className="phone-card owned-home"
      data-owned-home={p.id}
      data-residence={p.residence ? '' : undefined}
    >
      <div className="owned-top">
        <PropertyArt tier={p.tier} seed={p.id} className="prop-art small" />
        <div className="owned-main">
          <b className="item-title">
            {tierName(p.tier)} · {p.neighbourhood}
          </b>
          <span className="small muted">
            {p.street}, {p.marketName}
          </span>
          <span className={`pill${p.residence ? ' pill-good' : ''}`}>{summary}</span>
        </div>
      </div>
      <Line label={t('Value')} value={money(p.value, cur)} />
      <Line
        label={t('Equity')}
        value={money(p.equity, cur)}
        tone={p.equity >= 0 ? 'good' : 'bad'}
      />
      {p.gain !== 0 && (
        <Line
          label={t('Since you bought')}
          value={`${p.gain > 0 ? '+' : ''}${money(p.gain, cur)}`}
          tone={p.gain > 0 ? 'good' : 'bad'}
        />
      )}
      {p.mortgage && (
        <Line
          label={t('Mortgage ({lender})', { lender: p.mortgage.lender })}
          value={t('{owed} owed · {monthly}/mo · {n} months left', {
            owed: money(p.mortgage.outstanding, cur),
            monthly: money(p.mortgage.monthly, cur),
            n: p.mortgage.monthsLeft,
          })}
        />
      )}
      <Line
        label={t('Net a month')}
        value={`${net > 0 ? '+' : ''}${money(net, cur)}`}
        tone={net >= 0 ? 'good' : 'bad'}
      />
      <div className="row wrap">
        {p.rentedOut ? (
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() =>
              act({ type: 'property.unrent', propertyId: p.id }, t('The tenants move out.'))
            }
          >
            {t('Stop renting')}
          </Button>
        ) : (
          !p.residence && (
            <Button
              variant="subtle"
              disabled={busy}
              onClick={() => act({ type: 'property.rent', propertyId: p.id }, t('Listed to let.'))}
            >
              {t('Rent out')}
            </Button>
          )
        )}
        {!p.residence && !p.rentedOut && (
          <Button
            variant={armed === 'move' ? 'primary' : 'subtle'}
            disabled={busy}
            onClick={() =>
              away && armed !== 'move'
                ? setArmed('move')
                : act({ type: 'property.moveIn', propertyId: p.id }, t('Welcome home.'))
            }
          >
            {armed === 'move' ? t('Move to {city}', { city: p.marketName }) : t('Move in')}
          </Button>
        )}
        <Button
          variant={armed === 'sell' ? 'danger' : 'ghost'}
          disabled={busy}
          onClick={() =>
            armed === 'sell'
              ? act({ type: 'property.sell', propertyId: p.id }, t('Sold.'))
              : setArmed('sell')
          }
        >
          {armed === 'sell' ? t('Sell for {price}', { price: money(p.value, cur) }) : t('Sell')}
        </Button>
      </div>
      {armed === 'move' && (
        <p className="small warn-text" role="alert" data-relocate-warning>
          {t(
            'This home is in {city}. Moving in relocates you there: {city} becomes your home city, and as with any move, half your cash goes to {home}’s central bank. Tap again to move.',
            { city: p.marketName, home: cityName(view, view.market.id) },
          )}
        </p>
      )}
      {armed === 'sell' && (
        <p className="small muted" role="alert">
          {p.mortgage
            ? t('The bank is repaid first, then a 2% agent’s fee. Tap again to sell.')
            : t('A 2% agent’s fee comes off. Tap again to sell.')}
        </p>
      )}
    </li>
  );
}
