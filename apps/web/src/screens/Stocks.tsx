/**
 * Stock analysis (game feedback: "I am London based but stocks are from
 * other countries. Should be able to analyse the stocks and company before
 * investing."): the pieces both stock market screens share (Capital →
 * Markets and Investor → Markets).
 *
 *  - City chips, your own city's exchange first.
 *  - A company row: what it is, a sparkline, the price and today's move.
 *  - The company analysis, opened from any row before buying: a price
 *    chart with ranges and news marks, what it does, revenue, profit,
 *    growth and value, the price against the city (P/E, P/S, dividend), a
 *    risk meter with reasons, recent news, and a Buy box (presets, shares,
 *    how much of your money it is against a 10% guide, the fee, the month's
 *    limit, and a limit price where limit orders exist).
 */
import type { RiskReason, StockAnalysis } from '@runway/engine';
import { CURRENCY_SYMBOL, type Currency } from '@runway/engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { amountInput, money, moneyExact, parseAmount, pct } from '../format';
import { locale, t, tx } from '../i18n';
import { useGame, useView } from '../store';
import { Button, Card, ListRow, Pill, Segmented, Sparkline, Stat } from '../ui';
import './stocks.css';

/** What every listing carries, on either screen. */
export interface StockListing {
  companyId: string;
  name: string;
  industry: string;
  city: string;
  currency: string;
  price: number;
  changePct: number;
  history: number[];
  isFounder: boolean;
  yourShares: number;
  lockedUntil: number | null;
  blackout?: string | null;
  analysis: StockAnalysis;
}

/** A city's exchange, as the chips and the "other exchanges" list need it. */
export interface StockExchange {
  market: string;
  city: string;
  country: string;
  currency: string;
  home: boolean;
  companies: number;
  index: { level: number; changePct: number; history: number[] } | null;
  fx: number | null;
}

/** One guide for one company: no more than this share of your money. */
const GUIDE = 0.1;

const FLAGS: Record<string, string> = {
  Nigeria: '🇳🇬',
  Kenya: '🇰🇪',
  'United Kingdom': '🇬🇧',
  'United States': '🇺🇸',
  Ghana: '🇬🇭',
  'Sierra Leone': '🇸🇱',
  Rwanda: '🇷🇼',
  'South Africa': '🇿🇦',
  Egypt: '🇪🇬',
  'United Arab Emirates': '🇦🇪',
};
export const flagOf = (country: string) => FLAGS[country] ?? '🏳️';

export const exchangeName = (city: string) => t('{city} Stock Exchange', { city });

const symbolOf = (cur: string) => CURRENCY_SYMBOL[cur as Currency] ?? cur;

/** A share price: every unit shown (£4.82, ₦574.65). */
export const sharePrice = (minor: number, cur: string) => moneyExact(Math.round(minor), cur);

const num = (x: number, digits = 1) =>
  x.toLocaleString(locale(), { maximumFractionDigits: digits });

/** +2.1% or -1.3% (the number is already a percentage). */
export const signedPct = (n: number, digits = 1) =>
  `${n >= 0 ? '+' : '-'}${pct(Math.abs(n) / 100, Number.isInteger(n) ? 0 : digits)}`;

const industryLabel = (i: string) =>
  ({
    fintech: t('Fintech'),
    ecommerce: t('E-commerce'),
    logistics: t('Logistics'),
    healthtech: t('Health'),
    edtech: t('Education'),
    saas: t('Business software'),
    agritech: t('Agriculture'),
  })[i] ?? i;

/** How the company earns, as a sentence. */
const modelText = (m: string) =>
  ({
    subscription: t('Customers pay a subscription.'),
    transaction: t('It takes a fee on each sale.'),
    usage: t('Customers pay for what they use.'),
    marketplace: t('It takes a cut of marketplace sales.'),
    'one-off': t('Customers pay once per purchase.'),
    services: t('It sells services.'),
  })[m] ?? '';

const monthsAgo = (n: number) =>
  n <= 0 ? t('this month') : n === 1 ? t('last month') : t('{n} months ago', { n });

// ---------------------------------------------------------------- the list

/** City chips: your city first (the views already sort it so). */
export function ExchangeChips({
  exchanges,
  value,
  onChange,
}: {
  exchanges: Pick<StockExchange, 'market' | 'city' | 'country'>[];
  value: string;
  onChange: (market: string) => void;
}) {
  if (exchanges.length < 2) return null;
  return (
    <div className="chips stock-chips" role="radiogroup" aria-label={t('Stock exchanges')}>
      {exchanges.map((x) => (
        <button
          key={x.market}
          type="button"
          role="radio"
          className="chip"
          aria-checked={x.market === value}
          data-exchange-chip={x.market}
          onClick={() => onChange(x.market)}
        >
          <span aria-hidden="true">{flagOf(x.country)}</span> {x.city}
        </button>
      ))}
    </div>
  );
}

/** The exchange you're looking at: its name, your-city tag, size and index. */
export function ExchangeHead({ x }: { x: StockExchange }) {
  return (
    <div className="stock-exchange-head" data-exchange={x.market}>
      <div className="spread">
        <strong>{exchangeName(x.city)}</strong>
        {x.home && <Pill tone="warn">{t('Your city')}</Pill>}
      </div>
      <div className="small muted">
        {t('{n} companies · prices in {sym}', { n: x.companies, sym: symbolOf(x.currency) })}
      </div>
      {x.index && (
        <>
          <div className="row stock-index">
            <span className="stock-index-level">{num(x.index.level)}</span>
            <Pill tone={x.index.changePct >= 0 ? 'good' : 'bad'}>
              {signedPct(x.index.changePct)}
            </Pill>
            <span className="small muted">{t('city index this month')}</span>
          </div>
          <Sparkline values={x.index.history} label={t('City index')} />
        </>
      )}
    </div>
  );
}

/** A company in the list: tap to analyse it before buying. */
export function StockRow({ x, onOpen }: { x: StockListing; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="stock-row"
      data-stock={x.companyId}
      onClick={onOpen}
      aria-label={t('Analyse {name}', { name: x.name })}
    >
      <span className="stock-main">
        <strong className="stock-name">{x.name}</strong>
        <span className="small muted">
          {industryLabel(x.industry)}
          {x.yourShares > 0 && ` · ${t('you hold {n}', { n: x.yourShares.toLocaleString() })}`}
        </span>
      </span>
      <span className={`stock-spark ${x.changePct >= 0 ? 'good' : 'bad'}`}>
        <Sparkline values={x.history.slice(-12)} label={t('Share price')} />
      </span>
      <span className="stock-end">
        <strong data-price>{sharePrice(x.price, x.currency)}</strong>
        <Pill tone={x.changePct >= 0 ? 'good' : 'bad'}>{signedPct(x.changePct)}</Pill>
      </span>
    </button>
  );
}

/** The other cities' exchanges, one tap away. */
export function OtherExchanges({
  exchanges,
  home,
  onPick,
}: {
  exchanges: StockExchange[];
  home: string;
  onPick: (market: string) => void;
}) {
  if (!exchanges.length) return null;
  return (
    <Card title={t('Other exchanges')}>
      <ul className="lrows">
        {exchanges.map((x) => (
          <li key={x.market}>
            <ListRow
              lead={flagOf(x.country)}
              title={t('{city} · {n} companies', { city: x.city, n: x.companies })}
              sub={
                x.fx
                  ? t('Prices in {sym} · your money is changed at 1 {home} = {rate}', {
                      sym: symbolOf(x.currency),
                      home: symbolOf(home),
                      rate: `${symbolOf(x.currency)}${num(x.fx, x.fx >= 10 ? 0 : 2)}`,
                    })
                  : t('Prices in {sym}', { sym: symbolOf(x.currency) })
              }
              end={
                x.index ? (
                  <Pill tone={x.index.changePct >= 0 ? 'good' : 'bad'}>
                    {signedPct(x.index.changePct)}
                  </Pill>
                ) : undefined
              }
              onClick={() => onPick(x.market)}
              label={exchangeName(x.city)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- the analysis

type Range = '3' | '6' | '12' | 'all';

/** The share price over time, with marks where the company was in the news. */
function PriceChart({ x }: { x: StockListing }) {
  const { lite } = useGame();
  const a = x.analysis;
  const all = x.history;
  const ranges = (
    [
      { value: '3', label: t('3M') },
      { value: '6', label: t('6M') },
      { value: '12', label: t('1Y') },
      { value: 'all', label: t('All') },
    ] as { value: Range; label: string }[]
  ).filter((r) => r.value === 'all' || all.length > Number(r.value));
  const [range, setRange] = useState<Range>('all');
  const n = range === 'all' ? all.length : Math.min(all.length, Number(range) + 1);
  const values = all.slice(-n);
  const first = values[0] ?? x.price;
  const last = values[values.length - 1] ?? x.price;
  const months = values.length - 1;
  const summary =
    months > 0
      ? t('From {from} to {to} over {n} months ({change}).', {
          from: sharePrice(first, x.currency),
          to: sharePrice(last, x.currency),
          n: months,
          change: signedPct(first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0),
        })
      : t('Listed this month: the price history starts now.');
  if (lite || values.length < 2)
    return (
      <Card className="stock-chart-card">
        <p className="small muted" data-chart-summary>
          {summary}
        </p>
      </Card>
    );
  const W = 340;
  const H = 130;
  const L = 44;
  const top = 10;
  const bottom = 108;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || max * 0.1 || 1;
  const xAt = (i: number) => L + (i / (values.length - 1)) * (W - L - 4);
  const yAt = (v: number) => bottom - ((v - min) / span) * (bottom - top);
  const pts = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  const up = last >= first;
  const ticks = [max, min + span * 0.5, min];
  // News within the range, at the month it ran.
  const startMonth = a.historyEndMonth - (values.length - 1);
  const marks = a.news
    .filter((nw) => nw.month >= startMonth && nw.month <= a.historyEndMonth)
    .map((nw) => ({ ...nw, i: nw.month - startMonth }));
  return (
    <Card className="stock-chart-card">
      {ranges.length > 1 && (
        <Segmented label={t('Price range')} value={range} onChange={setRange} options={ranges} />
      )}
      <svg
        className={`stock-chart ${up ? 'good' : 'bad'}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        data-chart
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W} y1={yAt(v)} y2={yAt(v)} className="stock-grid" />
            <text x={0} y={yAt(v) + 3} className="stock-axis">
              {sharePrice(v, x.currency)}
            </text>
          </g>
        ))}
        <polygon points={`${L},${bottom} ${pts} ${xAt(values.length - 1)},${bottom}`} />
        <polyline points={pts} />
        {marks.map((m) => (
          <circle key={m.id} cx={xAt(m.i)} cy={yAt(values[m.i]!)} r={4} className="stock-mark" />
        ))}
        <text x={L} y={H - 4} className="stock-axis">
          {monthsAgo(values.length - 1)}
        </text>
        <text x={W} y={H - 4} className="stock-axis" textAnchor="end">
          {t('Now')}
        </text>
      </svg>
      <p className="small muted" data-chart-summary>
        {summary}
      </p>
      {marks.length > 0 && (
        <p className="small muted">
          {marks.map((m) => (
            <span key={m.id} className="stock-mark-note">
              <span aria-hidden="true">●</span> {monthsAgo(a.historyEndMonth - m.month)}:{' '}
              {tx(m.headline)}
            </span>
          ))}
        </p>
      )}
    </Card>
  );
}

const riskText = (r: RiskReason): string => {
  switch (r.kind) {
    case 'profitable':
      return r.n === 1
        ? t('Made a profit last month')
        : t('Profitable for {n} months in a row', { n: r.n });
    case 'loss':
      return r.n === 1
        ? t('Lost money last month')
        : t('Losing money for {n} months in a row', { n: r.n });
    case 'runway':
      return t('Cash for about {n} months at this loss', { n: r.n });
    case 'calm':
      return t('Price moves only about {n} a month', { n: pct(r.n / 100, 1) });
    case 'swings':
      return t('Price swings about {n} a month', { n: pct(r.n / 100) });
    case 'growing':
      return t('Sales growing {n} a month', { n: pct(r.n / 100, 1) });
    case 'shrinking':
      return t('Sales shrinking {n} a month', { n: pct(r.n / 100, 1) });
    case 'pricey':
      return t('Priced at {n}× its yearly profit, well above the city', { n: num(r.n) });
    case 'noSales':
      return t('No sales yet: you are betting on a plan');
    case 'new':
      return r.n <= 1
        ? t('Just listed: no price history yet')
        : t('New on the market: only {n} months of prices', { n: r.n - 1 });
  }
};

function Risk({ a }: { a: StockAnalysis }) {
  const r = a.risk;
  const level = r.level === 'low' ? t('Low') : r.level === 'medium' ? t('Medium') : t('High');
  const colours = ['#16a34a', '#65a30d', '#d97706', '#ea580c', '#b42318'];
  return (
    <Card
      title={t('Risk')}
      action={
        <Pill tone={r.level === 'low' ? 'good' : r.level === 'medium' ? 'warn' : 'bad'}>
          {t('{level} · {n} of 5', { level, n: r.score })}
        </Pill>
      }
    >
      <div
        className="stock-meter"
        role="meter"
        aria-label={t('Risk')}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={r.score}
        data-risk={r.score}
      >
        {colours.map((c, i) => (
          <span key={c} style={{ background: i < r.score ? c : undefined }} />
        ))}
      </div>
      <div className="stock-meter-scale small muted">
        <span>{t('Low')}</span>
        <span>{t('Medium')}</span>
        <span>{t('High')}</span>
      </div>
      <ul className="stock-reasons">
        {r.reasons.map((x) => (
          <li key={x.kind} className={`stock-reason is-${x.tone}`}>
            <span className="stock-reason-icon" aria-hidden="true">
              {x.tone === 'good' ? '✓' : '!'}
            </span>
            <span className="small">{riskText(x)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Fairness({ x }: { x: StockListing }) {
  const a = x.analysis;
  const cur = x.currency;
  const verdict =
    a.fairness === 'cheap'
      ? { tone: 'good' as const, text: t('Looks cheap') }
      : a.fairness === 'fair'
        ? { tone: 'info' as const, text: t('About fair') }
        : a.fairness === 'expensive'
          ? { tone: 'warn' as const, text: t('A bit expensive') }
          : null;
  return (
    <Card
      title={t('Is the price fair?')}
      action={verdict && <Pill tone={verdict.tone}>{verdict.text}</Pill>}
    >
      <dl className="stock-kv">
        <dt>{t('Price ÷ yearly profit (P/E)')}</dt>
        <dd data-pe>{a.pe === null ? t('No profit yet') : `${num(a.pe)}×`}</dd>
        <dt>{t('{city} average P/E', { city: x.city })}</dt>
        <dd>{a.cityPe === null ? '—' : `${num(a.cityPe)}×`}</dd>
        <dt>{t('Price ÷ yearly sales (P/S)')}</dt>
        <dd>{a.ps === null ? t('No sales yet') : `${num(a.ps)}×`}</dd>
        {a.pe === null && a.cityPs !== null && (
          <>
            <dt>{t('{city} average P/S', { city: x.city })}</dt>
            <dd>{num(a.cityPs)}×</dd>
          </>
        )}
        <dt>{t('Dividend')}</dt>
        <dd>
          {a.dividendPct === null
            ? t('None')
            : t('{pct} a year', { pct: pct(a.dividendPct / 100, 1) })}
        </dd>
      </dl>
      <p className="small muted">
        {a.pe !== null
          ? t(
              'You pay {price} for every {one} it earns in a year. Fast growth can justify a high price; if growth slows, the price usually falls.',
              { price: money(Math.round(a.pe * 100), cur), one: money(100, cur) },
            )
          : t(
              'It doesn’t make a profit yet, so there is no P/E: you are paying for profits it may make later. Compare its price to its sales instead.',
            )}
      </p>
    </Card>
  );
}

function Numbers({ x }: { x: StockListing }) {
  const a = x.analysis;
  const cur = x.currency;
  const growthYear =
    a.growthYearPct > 1000
      ? t('more than 10× in a year at this pace')
      : t('≈ {pct} a year', { pct: signedPct(a.growthYearPct, 0) });
  return (
    <div className="kpis stock-kpis">
      <Stat
        label={t('Revenue')}
        value={t('{amount}/mo', { amount: money(a.revenueMonth, cur) })}
        hint={t('{amount} a year', { amount: money(a.revenueYear, cur) })}
      />
      <Stat
        label={t('Profit')}
        value={t('{amount}/mo', { amount: money(a.profitMonth, cur) })}
        tone={a.profitMonth > 0 ? 'good' : a.profitMonth < 0 ? 'bad' : undefined}
        hint={
          a.marginPct !== null && a.profitMonth > 0
            ? t('{amount} a year · {pct} of sales', {
                amount: money(a.profitYear, cur),
                pct: pct(a.marginPct / 100),
              })
            : t('{amount} a year', { amount: money(a.profitYear, cur) })
        }
      />
      <Stat
        label={t('Growth')}
        value={t('{pct}/mo', { pct: signedPct(a.growthMonthPct) })}
        tone={a.growthMonthPct < 0 ? 'bad' : undefined}
        hint={growthYear}
      />
      <Stat
        label={t('Company value')}
        value={money(a.marketCap, cur)}
        hint={t('{n} shares × {price}', {
          n: a.shares >= 1e6 ? t('{n}m', { n: num(a.shares / 1e6) }) : num(a.shares, 0),
          price: sharePrice(x.price, cur),
        })}
      />
    </div>
  );
}

function News({ a }: { a: StockAnalysis }) {
  return (
    <Card title={t('Recent news')}>
      {a.news.length === 0 ? (
        <p className="small muted">{t('No news about this company lately.')}</p>
      ) : (
        <ul className="lrows" data-stock-news>
          {a.news.map((n) => (
            <li key={n.id}>
              <ListRow
                lead="📰"
                title={tx(n.headline)}
                sub={`${tx(n.outlet)} · ${monthsAgo(a.historyEndMonth - n.month)}`}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Round a preset to two significant figures (£16,910 → £17,000). */
const roundNice = (minor: number) => {
  if (minor <= 0) return 0;
  const major = minor / 100;
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(major)) - 1));
  return Math.max(100, Math.floor(major / step) * step * 100);
};

function BuyBox({ x }: { x: StockListing }) {
  const { send } = useView();
  const a = x.analysis;
  const cur = x.currency;
  const perShare = x.price * (1 + a.brokerBps / 10_000);
  const most = Math.min(a.yourCash, Math.floor(a.maxBuyShares * perShare));
  const presets = [0.05, 0.1]
    .map((f) => roundNice(a.yourCash * f))
    .filter((v, i, xs) => v > 0 && v < most && xs.indexOf(v) === i);
  const [amount, setAmount] = useState(() => amountInput(presets[0] ?? most));
  const [limitOpen, setLimitOpen] = useState(false);
  const [limit, setLimit] = useState('');
  const spend = parseAmount(amount) ?? 0;
  const shares = perShare > 0 ? Math.min(a.maxBuyShares, Math.floor(spend / perShare)) : 0;
  const fee = Math.round((shares * x.price * a.brokerBps) / 10_000);
  const share = a.yourCash > 0 ? spend / a.yourCash : 1;
  const lim = parseAmount(limit) ?? 0;
  const guide =
    share <= GUIDE * 0.5
      ? t('Well inside the 10% guide for one company.')
      : share <= GUIDE
        ? t('Inside the 10% guide for one company.')
        : share <= GUIDE * 1.5
          ? t('Just over the 10% guide for one company.')
          : t('Well over the 10% guide for one company: one bad year could hurt.');
  const tone = share <= GUIDE ? 'good' : share <= GUIDE * 1.5 ? 'warn' : 'bad';
  if (x.isFounder)
    return (
      <Card title={t('Buy {name}', { name: x.name })}>
        <p className="small muted">
          {t('Founders can’t trade their own company’s shares this way.')}
        </p>
      </Card>
    );
  return (
    <Card
      title={t('Buy {name}', { name: x.name })}
      action={
        <span className="small muted">
          {t('You have {amount}', { amount: money(a.yourCash, cur) })}
        </span>
      }
      className="stock-buy"
    >
      {x.blackout && <p className="warn small">{tx(x.blackout)}</p>}
      <div className="stock-buy-input">
        <input
          aria-label={t('Amount to invest')}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span className="small muted" data-est-shares>
          {t('≈ {n} shares', { n: shares.toLocaleString() })}
        </span>
      </div>
      {(presets.length > 0 || most > 0) && (
        <div className="chips">
          {presets.map((v) => (
            <button
              key={v}
              type="button"
              className="chip"
              aria-pressed={spend === v}
              onClick={() => setAmount(amountInput(v))}
            >
              {money(v, cur)}
            </button>
          ))}
          {most > 0 && (
            <button
              type="button"
              className="chip"
              aria-pressed={spend === most}
              onClick={() => setAmount(amountInput(most))}
            >
              {t('Max {amount}', { amount: money(most, cur) })}
            </button>
          )}
        </div>
      )}
      <div className="spread small">
        <b>{t('How much of your money is this?')}</b>
        <b className={tone} data-money-share>
          {pct(Math.min(share, 9.99), share < 0.1 && share > 0 ? 1 : 0)}
        </b>
      </div>
      <div
        className={`stock-share-bar is-${tone}`}
        role="meter"
        aria-label={t('How much of your money is this?')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, share) * 100)}
      >
        <div className="fill" style={{ width: `${Math.min(1, share) * 100}%` }} />
        <div className="guide" style={{ left: `${GUIDE * 100}%` }} />
      </div>
      <div className="stock-share-scale small muted">
        <span>0%</span>
        <span className="guide-label">{t('10% guide')}</span>
        <span>100%</span>
      </div>
      {spend > 0 && (
        <p className="small">
          {guide}{' '}
          {t('If {name} halves, you lose {loss} ({pct} of your money).', {
            name: x.name,
            loss: money(Math.round(spend / 2), cur),
            pct: pct(Math.min(1, share / 2), share / 2 < 0.1 ? 1 : 0),
          })}
        </p>
      )}
      <dl className="stock-kv">
        <dt>{t('Broker’s fee ({pct})', { pct: pct(a.brokerBps / 10_000) })}</dt>
        <dd>{money(fee, cur)}</dd>
        <dt>{t('Most you can buy this month')}</dt>
        <dd data-max-shares>{t('{n} shares', { n: a.maxBuyShares.toLocaleString() })}</dd>
      </dl>
      {cur !== a.yourCurrency && (
        <p className="small muted">
          {t('Paid from your {home} account, changed into {cur} at today’s rate.', {
            home: symbolOf(a.yourCurrency),
            cur: symbolOf(cur),
          })}
        </p>
      )}
      <div className="row stock-buy-actions">
        <Button
          className="btn btn-primary stock-buy-go"
          disabled={shares <= 0 || spend > a.yourCash}
          onClick={() =>
            void send(
              { type: 'shares.buy', companyId: x.companyId, amount: spend },
              (r: { shares?: number } | null) =>
                t('Bought {n} shares.', { n: (r?.shares ?? 0).toLocaleString() }),
            )
          }
        >
          {t('Buy at {price}', { price: sharePrice(x.price, cur) })}
        </Button>
        {a.limitOrders && (
          <Button variant="subtle" onClick={() => setLimitOpen((o) => !o)}>
            {t('Set a limit price')}
          </Button>
        )}
      </div>
      {a.limitOrders && limitOpen && (
        <div className="row">
          <input
            aria-label={t('Limit price per share')}
            inputMode="decimal"
            placeholder={t('Limit price')}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={spend <= 0 || lim <= 0}
            onClick={() =>
              void send(
                {
                  type: 'shares.order',
                  companyId: x.companyId,
                  side: 'buy',
                  amount: spend,
                  limit: lim,
                },
                (r: { message?: string } | null) =>
                  r?.message ? tx(r.message) : t('Order placed.'),
              )
            }
          >
            {t('Place buy order')}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Everything about a listed company before you buy, and the Buy box. */
export function CompanyAnalysis({
  x,
  onBack,
  children,
}: {
  x: StockListing;
  onBack: () => void;
  /** More for this company under the Buy box (your holding and selling). */
  children?: ReactNode;
}) {
  const a = x.analysis;
  const cur = x.currency;
  const top = useRef<HTMLDivElement>(null);
  // Opened from a long list: start at the top of the analysis.
  useEffect(() => top.current?.scrollIntoView?.({ block: 'start' }), [x.companyId]);
  return (
    <div className="stack stock-analysis" data-analysis={x.companyId} ref={top}>
      <button type="button" className="small stock-back" onClick={onBack}>
        ‹ {exchangeName(x.city)}
      </button>
      <div className="spread stock-title">
        <div>
          <h2>{x.name}</h2>
          <div className="small muted">
            {industryLabel(x.industry)} · {x.city}
          </div>
        </div>
        <div className="stock-title-price">
          <strong data-price>{sharePrice(x.price, cur)}</strong>
          <Pill tone={x.changePct >= 0 ? 'good' : 'bad'}>{signedPct(x.changePct)}</Pill>
        </div>
      </div>
      <PriceChart x={x} />
      <Card title={t('What it does')}>
        <p>{tx(a.idea)}</p>
        <p className="small muted">
          {modelText(a.revenueModel)}{' '}
          {a.customers > 0
            ? t('{n} customers, about {price} a month each.', {
                n: a.customers.toLocaleString(),
                price: money(a.pricePerCustomer, cur),
              })
            : t('No paying customers yet.')}{' '}
          {a.staff > 0 && t('{n} people work there.', { n: a.staff })}
        </p>
        {a.yearIsEstimate && (
          <p className="small muted">
            {t('Less than a year of accounts: yearly figures are last month × 12.')}
          </p>
        )}
      </Card>
      <Numbers x={x} />
      <Fairness x={x} />
      <Risk a={a} />
      <News a={a} />
      <BuyBox x={x} />
      {x.yourShares > 0 && (
        <p className="small" data-holding>
          {t('You hold {n} shares, worth {v}.', {
            n: x.yourShares.toLocaleString(),
            v: money(Math.round(x.yourShares * x.price), cur),
          })}{' '}
          {x.lockedUntil !== null && t('Locked until month {n}.', { n: x.lockedUntil })}
        </p>
      )}
      {children}
      <p className="inv-note">
        {t('Prices follow company results and the market’s mood. A game, not financial advice.')}
      </p>
    </div>
  );
}
