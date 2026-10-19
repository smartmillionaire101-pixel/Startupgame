/**
 * The city exchange (investor blueprint §5.3 "Exchange", §7.2, Phase 2):
 * the index and its fund, listed companies with price, change, market cap,
 * sales multiple and news, market and limit orders inside the month's depth
 * cap, your holdings against the index, and open orders.
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Pill, Segmented, Sparkline, Stat } from '../ui';
import './investor.css';

type ExchangeView = NonNullable<PlayerView['exchange']>;
type City = ExchangeView['markets'][number];
type Listing = City['listings'][number];

export const exchangeOf = (view: PlayerView): ExchangeView | null =>
  (view as { exchange?: ExchangeView | null }).exchange ?? null;

/** Share prices can be fractions of a minor unit. */
const priceText = (minor: number, cur: string) =>
  minor >= 100 ? money(Math.round(minor), cur) : `${(minor / 100).toFixed(2)} ${cur}`;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;

function IndexFund({ c }: { c: City }) {
  const { send } = useView();
  const [amount, setAmount] = useState('');
  const f = c.indexFund;
  const spend = parseAmount(amount) ?? 0;
  return (
    <div className="inv-form" data-index-fund={c.market}>
      <p className="small muted">
        {t(
          'One buy spreads your money over every listed company by size: the safe, liquid baseline. Fee {fee} a year.',
          { fee: pct(f.feeYear, 1) },
        )}
      </p>
      <div className="inv-grid">
        <Stat label={t('Unit price')} value={money(f.unitPrice, c.currency)} />
        <Stat label={t('Your units')} value={f.yourUnits.toLocaleString()} />
        <Stat
          label={t('Your value')}
          value={money(f.yourValue, c.currency)}
          hint={t('Cost {amount}', { amount: money(f.yourCost, c.currency) })}
        />
      </div>
      <div className="row">
        <input
          aria-label={t('Amount for the index fund')}
          inputMode="decimal"
          placeholder={t('Amount')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          size="sm"
          disabled={spend <= 0}
          onClick={() =>
            void send(
              { type: 'index.buy', market: c.market as never, amount: spend },
              (r: { cost: number } | null) =>
                t('Bought {amount} of the index fund.', {
                  amount: money(r?.cost ?? 0, c.currency),
                }),
            ).then(() => setAmount(''))
          }
        >
          {t('Buy the index')}
        </Button>
        {f.yourUnits > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void send(
                { type: 'index.sell', market: c.market as never, pctBps: 10_000 },
                (r: { net: number; tax: number } | null) =>
                  t('Sold: {net} to your account after {tax} tax.', {
                    net: money(r?.net ?? 0, c.currency),
                    tax: money(r?.tax ?? 0, c.currency),
                  }),
              )
            }
          >
            {t('Sell all units')}
          </Button>
        )}
      </div>
    </div>
  );
}

function ListingRow({ x, c, brokerBps }: { x: Listing; c: City; brokerBps: number }) {
  const { send } = useView();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'market' | 'limit'>('market');
  const [amount, setAmount] = useState('');
  const [limit, setLimit] = useState('');
  const [bps, setBps] = useState(2500);
  // Phase 6: trade for yourself or for a crossover fund you run.
  const [forId, setForId] = useState('me');
  const fund = x.fundShares.find((f) => f.fundId === forId);
  const held = fund ? fund.shares : x.yourShares;
  const fundArg = fund ? { fundId: fund.fundId } : {};
  const cur = c.currency;
  const spend = parseAmount(amount) ?? 0;
  const lim = parseAmount(limit) ?? 0;
  const perShare = x.price * (1 + brokerBps / 10_000);
  const est = perShare > 0 ? Math.min(Math.floor(spend / perShare), x.maxBuyShares) : 0;
  return (
    <div className="inv-row" data-listing={x.companyId}>
      <div className="grow">
        <strong>{x.name}</strong> {x.ai && <span className="small muted">{t('AI-run')}</span>}{' '}
        {x.insider && <Pill tone="warn">{t('Insider')}</Pill>}
        <div className="small muted">
          {t('Value {cap} · sales ×{ps} · {weight} of the index', {
            cap: money(x.marketCap, cur),
            ps: x.ps === null ? '—' : x.ps.toFixed(1),
            weight: pct(x.weightPct / 100, 1),
          })}
        </div>
        {x.news[0] && <div className="small">📰 {tx(x.news[0])}</div>}
        {x.yourShares > 0 && (
          <div className="small" data-holding>
            {t('You hold {n} shares, cost {cost}.', {
              n: x.yourShares.toLocaleString(),
              cost: money(x.yourCost, cur),
            })}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <strong data-price>{priceText(x.price, cur)}</strong>{' '}
        <Pill tone={x.changePct >= 0 ? 'good' : 'bad'}>{signed(x.changePct)}</Pill>
        <div>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? t('Close') : t('Trade')}
          </Button>
        </div>
      </div>
      {open && (
        <div className="inv-form" style={{ flexBasis: '100%' }}>
          <Sparkline values={x.history} label={t('Share price')} />
          {x.blackout && <p className="warn small">{tx(x.blackout)}</p>}
          {x.fundShares.length > 0 && (
            <label className="row small">
              {t('Trade for')}{' '}
              <select value={forId} onChange={(e) => setForId(e.target.value)}>
                <option value="me">{t('Yourself')}</option>
                {x.fundShares.map((f) => (
                  <option key={f.fundId} value={f.fundId}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Segmented
            label={t('Order type')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'market', label: t('At today’s price') },
              { value: 'limit', label: t('Limit order') },
            ]}
          />
          {!x.isFounder && (
            <div className="row">
              <input
                aria-label={t('Amount to invest')}
                inputMode="decimal"
                placeholder={t('Amount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {mode === 'limit' && (
                <input
                  aria-label={t('Limit price per share')}
                  inputMode="decimal"
                  placeholder={t('Limit price')}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              )}
              <Button
                size="sm"
                disabled={spend <= 0 || (mode === 'limit' ? lim <= 0 : est <= 0)}
                onClick={() =>
                  void send(
                    mode === 'market' || fund
                      ? { type: 'shares.buy', companyId: x.companyId, amount: spend, ...fundArg }
                      : {
                          type: 'shares.order',
                          companyId: x.companyId,
                          side: 'buy',
                          amount: spend,
                          limit: lim,
                        },
                    (r: { shares?: number; message?: string } | null) =>
                      r?.message
                        ? tx(r.message)
                        : t('Bought {n} shares.', { n: (r?.shares ?? 0).toLocaleString() }),
                  )
                }
              >
                {mode === 'market'
                  ? t('Buy about {n} shares', { n: est.toLocaleString() })
                  : t('Place buy order')}
              </Button>
            </div>
          )}
          <p className="inv-note">
            {t('Most you can buy this month: {n} shares (a tenth of the shares for sale).', {
              n: x.maxBuyShares.toLocaleString(),
            })}
          </p>
          {held > 0 && (fund || x.lockedUntil === null) && (
            <div className="row">
              <Segmented
                label={t('How much to sell')}
                value={String(bps)}
                onChange={(v) => setBps(Number(v))}
                options={[2500, 5000, 10_000].map((b) => ({
                  value: String(b),
                  label: pct(b / 10_000, 0),
                }))}
              />
              {mode === 'limit' && (
                <input
                  aria-label={t('Limit price per share')}
                  inputMode="decimal"
                  placeholder={t('Limit price')}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={mode === 'limit' && lim <= 0}
                onClick={() =>
                  void send(
                    mode === 'market' || fund
                      ? { type: 'shares.sell', companyId: x.companyId, pctBps: bps, ...fundArg }
                      : {
                          type: 'shares.order',
                          companyId: x.companyId,
                          side: 'sell',
                          amount: bps,
                          limit: lim,
                        },
                    (r: { net?: number; tax?: number; message?: string } | null) =>
                      r?.message
                        ? tx(r.message)
                        : t('Sold: {net} to your account after {tax} tax.', {
                            net: money(r?.net ?? 0, cur),
                            tax: money(r?.tax ?? 0, cur),
                          }),
                  )
                }
              >
                {mode === 'market'
                  ? t('Sell {pct}', { pct: pct(bps / 10_000, 0) })
                  : t('Place sell order')}
              </Button>
            </div>
          )}
          {x.lockedUntil !== null && (
            <p className="small muted">{t('Locked until month {n}.', { n: x.lockedUntil })}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CityExchange({ c, brokerBps }: { c: City; brokerBps: number }) {
  const h = c.holdings;
  return (
    <Card
      title={t('{city} exchange', { city: c.city })}
      sub={t('Index {level} · {change} this month', {
        level: c.level.toFixed(1),
        change: signed(c.changePct),
      })}
      className="exchange-card"
    >
      <Sparkline values={c.history} label={t('City index')} />
      <h3 className="cap-h">{t('City index fund')}</h3>
      <IndexFund c={c} />
      {h.cost > 0 && (
        <>
          <h3 className="cap-h">{t('Your shares vs the index')}</h3>
          <div className="inv-grid" data-vs-index>
            <Stat label={t('Value')} value={money(h.value, c.currency)} />
            <Stat
              label={t('Your return')}
              value={signed(h.yourPct)}
              tone={h.yourPct >= h.indexPct ? 'good' : 'bad'}
              hint={t('Index {pct} on the same money', { pct: signed(h.indexPct) })}
            />
            <Stat
              label={t('Realised and dividends')}
              value={money(h.realised + h.dividends, c.currency)}
            />
          </div>
        </>
      )}
      <h3 className="cap-h">{t('Listed companies')}</h3>
      {c.listings.length === 0 ? (
        <Empty>{t('Nothing is listed here yet.')}</Empty>
      ) : (
        c.listings.map((x) => <ListingRow key={x.companyId} x={x} c={c} brokerBps={brokerBps} />)
      )}
    </Card>
  );
}

function Orders({ ex }: { ex: ExchangeView }) {
  const { send } = useView();
  if (ex.orders.length === 0) return null;
  const status = (s: string) =>
    s === 'open'
      ? t('open')
      : s === 'filled'
        ? t('filled')
        : s === 'expired'
          ? t('expired')
          : t('cancelled');
  return (
    <Card title={t('Your orders')} sub={t('Limit orders fill at a month end')}>
      {ex.orders.map((o) => (
        <div key={o.id} className="inv-row" data-order={o.status}>
          <div className="grow">
            {o.side === 'buy'
              ? t('Buy {name}', { name: o.companyName })
              : t('Sell {name}', { name: o.companyName })}{' '}
            <span className="small muted">
              {t('limit {price}', { price: priceText(o.limit, o.currency) })}
            </span>
            {o.reason && <div className="small muted">{tx(o.reason)}</div>}
          </div>
          <Pill tone={o.status === 'filled' ? 'good' : o.status === 'open' ? 'info' : undefined}>
            {status(o.status)}
          </Pill>
          {o.status === 'open' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void send({ type: 'shares.cancel', orderId: o.id }, t('Order cancelled.'))
              }
            >
              {t('Cancel')}
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}

/** Every city's exchange you can see, your city first. */
export function Exchange() {
  const { view } = useView();
  const ex = exchangeOf(view);
  const [city, setCity] = useState<string>(view.me.location?.market ?? view.me.market);
  if (!ex) return null;
  const c = ex.markets.find((m) => m.market === city) ?? ex.markets[0];
  return (
    <div className="stack">
      {ex.markets.length > 1 && (
        <label className="row small">
          {t('Exchange')}{' '}
          <select value={c?.market ?? ''} onChange={(e) => setCity(e.target.value)}>
            {ex.markets.map((m) => (
              <option key={m.market} value={m.market}>
                {m.city}
              </option>
            ))}
          </select>
        </label>
      )}
      {c ? (
        <CityExchange c={c} brokerBps={ex.rules.brokerBps} />
      ) : (
        <Empty>{t('Nothing is listed here yet.')}</Empty>
      )}
      <Orders ex={ex} />
      <p className="inv-note">
        {t(
          'Prices follow company results and the market’s mood; big orders move them. Insiders can’t trade while a vote or an offer is open, or in the week before results. A game, not financial advice.',
        )}
      </p>
    </div>
  );
}
