/**
 * Founder Journey 5 (blueprint §2.1 chapters 6–7, §6.7, §7.4, §9.5):
 * the Exit (acquisition offers, a secondary sale, the IPO checklist), the
 * stock market, your wealth split into what you can spend and what is only
 * on paper, and the Capital Allocator paths after liquidity.
 */
import { useState, type ReactNode } from 'react';
import type { Command, PlayerView } from '@runway/engine';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Bar, Button, Card, Empty, Field, ListRow, Pill, Segmented, Sparkline, Stat } from '../ui';
import { FoundCompany } from './Me';
import { ReviewInvestors } from './Pipeline';
import './capital.css';

type Capital = NonNullable<PlayerView['capital']>;
type ExitOpt = Capital['exits'][number];
type Listed = Capital['market'][number];
type Alloc = Capital['allocator'];
type Wealth = PlayerView['me']['wealth'];

/** Money with fractional minor units (share prices). */
const priceText = (minor: number, cur: string) =>
  minor >= 100 ? money(Math.round(minor), cur) : `${(minor / 100).toFixed(2)} ${cur}`;

const bpsText = (bps: number) => pct(bps / 10_000, bps % 100 ? 2 : 0);

// ---------------------------------------------------------------- wealth (§7.4)

/** What you can spend today, what is only on paper, and what you owe. */
export function WealthCard({ compact }: { compact?: boolean }) {
  const { view, cur } = useView();
  const w: Wealth = view.me.wealth;
  const c = w.currency || cur;
  return (
    <Card
      title={t('Your wealth')}
      sub={t('Spendable cash vs value on paper')}
      className="wealth-card"
    >
      <div className="kpis" data-wealth="card">
        <Stat
          label={t('Cash you can spend')}
          value={<span data-wealth="liquid">{money(w.liquid, c)}</span>}
          tone="money"
          hint={t('Your personal accounts')}
        />
        <Stat
          label={t('Shares (not cash)')}
          value={<span data-wealth="shares">{money(w.shares.total, c)}</span>}
          hint={t('At their last price')}
        />
        {!compact && (
          <Stat
            label={t('Home equity')}
            value={money(w.property.equity, c)}
            hint={t('What your homes are worth, less the mortgage')}
          />
        )}
        <Stat
          label={t('Net worth')}
          value={money(w.netWorth, c)}
          hint={t('Everything you own, less what you owe')}
        />
      </div>
      <p className="small muted">
        {t(
          'Only cash is money you can spend. Shares are valued at the last round or the market price; they turn into cash only when you sell them, and the price can fall before you do.',
        )}
      </p>
      {w.shares.items.length > 0 && (
        <ul className="wealth-lines">
          {w.shares.items.map((x) => (
            <li key={x.companyId}>
              <span>
                {x.name}{' '}
                <Pill tone={x.kind === 'sellable' ? 'good' : x.kind === 'locked' ? 'warn' : 'info'}>
                  {x.kind === 'sellable'
                    ? t('You can sell')
                    : x.kind === 'locked'
                      ? t('Locked until month {n}', { n: x.lockedUntil ?? 0 })
                      : t('Private: no buyer yet')}
                </Pill>
              </span>
              <strong>{money(x.value, c)}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="wealth-realised" data-wealth="realised">
        <strong>{t('Realised so far')}</strong>
        <span>
          {t('{cash} received from selling shares; {gain} of it gain, {tax} paid in tax.', {
            cash: money(w.realised.proceeds, c),
            gain: money(w.realised.gains, c),
            tax: money(w.realised.tax, c),
          })}
        </span>
        {w.liabilities.total > 0 && (
          <span className="muted">
            {t('You owe {n} (loans and mortgages).', { n: money(w.liabilities.total, c) })}
          </span>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- exit options

const checkLabel = (id: string) =>
  ({
    revenue: t('Monthly revenue'),
    growth: t('Growing 3% a month, or profitable'),
    board: t('An investor on your board'),
    audited: t('Months of audited accounts'),
    health: t('Not in distress or hibernating'),
  })[id] ?? id;

function IpoChecklist({ e }: { e: ExitOpt }) {
  const { send } = useView();
  const ipo = e.ipo;
  const cur = e.currency;
  return (
    <div className="stack" data-ipo={ipo.status ?? 'private'}>
      <h3 className="cap-h">{t('Stock market (IPO)')}</h3>
      <p className="small muted">
        {t(
          'Listing sells {float} of the company to the public for new money. Bankers take {months} months and a fee. Your shares are then priced every month, and you can sell after a {lock}-month lock-up.',
          {
            float: bpsText(ipo.floatBps),
            months: ipo.prepMonths,
            lock: ipo.lockupMonths,
          },
        )}
      </p>
      <ul className="ipo-checks">
        {ipo.checks.map((c) => (
          <li key={c.id} className={c.ok ? 'ok' : ''} data-check={c.id} data-ok={c.ok}>
            <span aria-hidden="true">{c.ok ? '✓' : '○'}</span>
            <span className="grow">{checkLabel(c.id)}</span>
            {c.id === 'revenue' && (
              <span className="small">
                {money(c.have, cur)} / {money(c.need, cur)}
              </span>
            )}
            {c.id === 'audited' && (
              <span className="small">
                {c.have} / {c.need}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Bar
        value={ipo.checks.filter((c) => c.ok).length / ipo.checks.length}
        label={t('Ready to list')}
        tone={ipo.ready ? 'good' : undefined}
      />
      {ipo.status === null || ipo.status === 'delisted' ? (
        <Button
          variant="secondary"
          disabled={!ipo.ready}
          onClick={() =>
            void send({ type: 'ipo.prepare', companyId: e.companyId }, t('The bankers are on it.'))
          }
        >
          {t('Hire the bankers ({fee} from the company)', { fee: money(ipo.bankerFee, cur) })}
        </Button>
      ) : ipo.status === 'preparing' ? (
        ipo.month >= (ipo.readyMonth ?? 0) ? (
          <Button
            onClick={() =>
              void send(
                { type: 'ipo.list', companyId: e.companyId },
                t('{name} is on the stock market.', { name: e.name }),
              )
            }
          >
            {t('List at about {p} a share', { p: priceText(ipo.bankersPrice, cur) })}
          </Button>
        ) : (
          <p className="small">
            {t('The bankers are preparing the listing until month {n}.', {
              n: ipo.readyMonth ?? 0,
            })}
          </p>
        )
      ) : (
        <p className="small">
          {t('Listed. Sell your shares on the Markets tab after the lock-up.')}
        </p>
      )}
    </div>
  );
}

function SecondarySale({ e }: { e: ExitOpt }) {
  const { view, send } = useView();
  const s = e.secondary;
  const cur = e.currency;
  const [bps, setBps] = useState(500);
  const [buyer, setBuyer] = useState<'outside' | 'investor' | 'player'>('outside');
  const [fundId, setFundId] = useState(s.investors[0]?.id ?? '');
  const players = view.players.filter((p) => !p.ai);
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const price =
    buyer === 'outside'
      ? s.prices.outside
      : buyer === 'player' || s.investors.find((f) => f.id === fundId)?.playerRun
        ? s.prices.player
        : s.prices.investor;
  const shares = Math.floor((e.yourShares * bps) / 10_000);
  const gross = Math.round(shares * price);
  const tax = Math.round(gross * s.capitalGainsRate);
  const cmd: Command =
    buyer === 'player'
      ? {
          type: 'exit.secondary',
          companyId: e.companyId,
          pctBps: bps,
          buyerKind: 'player',
          buyerId: playerId,
        }
      : buyer === 'investor'
        ? {
            type: 'exit.secondary',
            companyId: e.companyId,
            pctBps: bps,
            buyerKind: 'fund',
            buyerId: fundId,
          }
        : { type: 'exit.secondary', companyId: e.companyId, pctBps: bps, buyerKind: 'fund' };
  return (
    <div className="stack" data-secondary={e.companyId}>
      <h3 className="cap-h">{t('Secondary sale')}</h3>
      <p className="small muted">
        {t(
          'Sell part of your own shares and keep running the company. No new shares: nobody is diluted and the company gets no money. Buyers pay below the last round price. Up to {max} of your shares a year.',
          { max: bpsText(s.maxBpsPerYear) },
        )}
      </p>
      {s.blocked ? (
        <p className="small bad">{tx(s.blocked)}</p>
      ) : (
        <>
          <Segmented
            label={t('How much to sell')}
            value={String(bps)}
            onChange={(v) => setBps(Number(v))}
            options={[250, 500, 1000, 2500].map((b) => ({
              value: String(b),
              label: bpsText(b),
              disabled: b > s.leftBps,
            }))}
          />
          <Segmented
            label={t('Who buys')}
            value={buyer}
            onChange={setBuyer}
            options={[
              { value: 'outside', label: t('Secondary fund') },
              { value: 'investor', label: t('Your investor'), disabled: !s.investors.length },
              { value: 'player', label: t('A player'), disabled: !players.length },
            ]}
          />
          {buyer === 'investor' && (
            <Field label={t('Investor')}>
              {(id) => (
                <select id={id} value={fundId} onChange={(ev) => setFundId(ev.target.value)}>
                  {s.investors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {buyer === 'player' && (
            <Field label={t('Player')} hint={t('They get an offer to accept or decline.')}>
              {(id) => (
                <select id={id} value={playerId} onChange={(ev) => setPlayerId(ev.target.value)}>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <dl className="cap-terms">
            <dt>{t('Shares')}</dt>
            <dd>{shares.toLocaleString()}</dd>
            <dt>{t('Price')}</dt>
            <dd>{money(gross, cur)}</dd>
            <dt>{t('Capital gains tax')}</dt>
            <dd>
              {money(tax, cur)} ({pct(s.capitalGainsRate)})
            </dd>
            <dt>{t('Into your personal account')}</dt>
            <dd>
              <strong>{money(gross - tax, cur)}</strong>
            </dd>
          </dl>
          {s.boardConsentNeeded && (
            <p className="small muted">
              {t('Your board has agreed: the company is in good shape.')}
            </p>
          )}
          <Button
            disabled={shares <= 0 || (buyer === 'player' && !playerId)}
            onClick={() =>
              void send(cmd, (r: { waiting?: boolean } | null) =>
                r?.waiting ? t('Offer sent.') : t('Sold. The money is in your account.'),
              )
            }
          >
            {buyer === 'player'
              ? t('Offer {pct} of your shares', { pct: bpsText(bps) })
              : t('Sell {pct} of your shares', { pct: bpsText(bps) })}
          </Button>
        </>
      )}
      {s.pending.map((o) => (
        <ListRow
          key={o.id}
          title={t('Waiting for {name}', { name: o.buyerName })}
          sub={t('{pct} for {price}', { pct: bpsText(o.bps), price: money(o.price, cur) })}
          end={
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void send({ type: 'exit.secondary.decline', offerId: o.id }, t('Offer withdrawn.'))
              }
            >
              {t('Withdraw')}
            </Button>
          }
        />
      ))}
    </div>
  );
}

export function ExitOptions() {
  const { view } = useView();
  const exits = view.capital?.exits ?? [];
  if (!exits.length)
    return (
      <Card title={t('Exit options')}>
        <Empty>{t('Exit options appear for companies you founded and still run.')}</Empty>
      </Card>
    );
  return (
    <>
      {exits.map((e) => (
        <Card
          key={e.companyId}
          title={t('Exit options: {name}', { name: e.name })}
          sub={t('You own {pct}, worth {value} on paper', {
            pct: pct(e.yourPct / 100, 1),
            value: money(e.paperValue, e.currency),
          })}
        >
          <div className="stack">
            <h3 className="cap-h">{t('Acquisition offers')}</h3>
            {e.acquisitionOffers.length ? (
              e.acquisitionOffers.map((o) => (
                <ListRow
                  key={o.dealId}
                  title={o.buyer}
                  sub={t('Offers {price}. Answer on the Money tab’s Deals.', {
                    price: money(o.price, e.currency),
                  })}
                />
              ))
            ) : (
              <p className="small muted">
                {t('No offers right now. Buyers notice companies that grow.')}
              </p>
            )}
            <SecondarySale e={e} />
            <IpoChecklist e={e} />
          </div>
        </Card>
      ))}
    </>
  );
}

/** Secondary offers other founders sent you. */
function OffersForYou() {
  const { view, send } = useView();
  const offers = view.capital?.offers ?? [];
  if (!offers.length) return null;
  return (
    <Card title={t('Shares offered to you')} tone="good">
      {offers.map((o) => (
        <div key={o.id} className="stack" data-offer={o.id}>
          <p>
            {t('{seller} offers you {pct} of their {company} shares for {price}.', {
              seller: o.sellerName,
              pct: bpsText(o.bps),
              company: o.companyName,
              price: money(o.price, o.currency),
            })}
          </p>
          <p className="small muted">
            {t(
              'Private shares: you can’t sell them until the company is sold or lists. You could lose it all.',
            )}
          </p>
          <div className="row">
            <Button
              onClick={() =>
                void send(
                  { type: 'exit.secondary.accept', offerId: o.id },
                  t('You bought the shares.'),
                )
              }
            >
              {t('Buy the shares')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void send({ type: 'exit.secondary.decline', offerId: o.id }, t('Declined.'))
              }
            >
              {t('Decline')}
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------- the stock market

function ListedRow({ x }: { x: Listed }) {
  const { send } = useView();
  const [amount, setAmount] = useState('');
  const [bps, setBps] = useState(2500);
  const cur = x.currency;
  const spend = parseAmount(amount) ?? 0;
  const perShare = x.price * (1 + x.brokerBps / 10_000);
  const estShares = perShare > 0 ? Math.floor(spend / perShare) : 0;
  return (
    <div className="listed" data-listed={x.companyId}>
      <div className="row listed-head">
        <div className="grow">
          <strong>{x.name}</strong>
          <span className="small muted"> · {x.city}</span>
        </div>
        <strong data-price>{priceText(x.price, cur)}</strong>
        <Pill tone={x.changePct >= 0 ? 'good' : 'bad'}>
          {x.changePct >= 0 ? '+' : ''}
          {x.changePct}%
        </Pill>
      </div>
      <Sparkline values={x.history} label={t('Share price')} />
      <p className="small muted">
        {t('Company value {cap} · {n} shares for sale', {
          cap: money(x.marketCap, cur),
          n: x.floatShares.toLocaleString(),
        })}
      </p>
      {x.yourShares > 0 && (
        <p className="small" data-holding>
          {t('You hold {n} shares, worth {v}.', {
            n: x.yourShares.toLocaleString(),
            v: money(x.yourValue, cur),
          })}{' '}
          {x.lockedUntil !== null && t('Locked until month {n}.', { n: x.lockedUntil })}
        </p>
      )}
      {!x.isFounder && (
        <div className="row">
          <input
            aria-label={t('Amount to invest')}
            inputMode="decimal"
            placeholder={t('Amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            size="sm"
            disabled={estShares <= 0}
            onClick={() =>
              void send(
                { type: 'shares.buy', companyId: x.companyId, amount: spend },
                (r: { shares: number } | null) =>
                  t('Bought {n} shares.', { n: (r?.shares ?? 0).toLocaleString() }),
              )
            }
          >
            {t('Buy about {n} shares', { n: estShares.toLocaleString() })}
          </Button>
        </div>
      )}
      {x.yourShares > 0 && x.lockedUntil === null && (
        <div className="row">
          <Segmented
            label={t('How much to sell')}
            value={String(bps)}
            onChange={(v) => setBps(Number(v))}
            options={[1000, 2500, 5000, 10_000].map((b) => ({
              value: String(b),
              label: bpsText(b),
            }))}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void send(
                { type: 'shares.sell', companyId: x.companyId, pctBps: bps },
                (r: { net: number; tax: number } | null) =>
                  t('Sold: {net} to your account after {tax} tax.', {
                    net: money(r?.net ?? 0, cur),
                    tax: money(r?.tax ?? 0, cur),
                  }),
              )
            }
          >
            {t('Sell {pct}', { pct: bpsText(bps) })}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PublicMarkets() {
  const { view } = useView();
  const list = view.capital?.market ?? [];
  return (
    <Card title={t('Stock market')} sub={t('Listed companies, priced every month')}>
      <p className="small muted">
        {t(
          'Prices follow each company’s results, plus the market’s mood. Every trade pays a {fee} broker’s fee; a gain when you sell is taxed.',
          { fee: pct((list[0]?.brokerBps ?? 100) / 10_000) },
        )}
      </p>
      {list.length === 0 ? (
        <Empty>{t('No company is listed yet. The first to list will show here.')}</Empty>
      ) : (
        list.map((x) => <ListedRow key={x.companyId} x={x} />)
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- the capital allocator

const causeText = (id: string) =>
  ({
    schools: {
      name: t('School fees for girls'),
      unit: t('girls kept in school for a year'),
      tradeoff: t('Slow to show, but it changes a whole life.'),
    },
    clinics: {
      name: t('Community health clinics'),
      unit: t('health checks'),
      tradeoff: t('Many people helped at once; each gift is small.'),
    },
    water: {
      name: t('Clean water points'),
      unit: t('families with clean water'),
      tradeoff: t('A clear result you can see, in one place.'),
    },
    founders: {
      name: t('First-time founders'),
      unit: t('first-time founders trained'),
      tradeoff: t('Few people, but they go on to hire others.'),
    },
  })[id] ?? { name: id, unit: '', tradeoff: '' };

const decisionText = (id: string) =>
  ({
    'dfi-grant': t('A young agritech asks for a grant. Strong team, no revenue yet.'),
    'dfi-women': t('Your board wants a fund for women-led companies. It needs a champion.'),
    'bank-sme': t('Small businesses want loans without collateral. Risky, but they create jobs.'),
    'bank-fees': t('Fees are up. You could cut them for the poorest customers.'),
  })[id] ?? id;

const choiceText = (decision: string, choice: 'impact' | 'safe') =>
  ({
    'dfi-grant': { impact: t('Back them'), safe: t('Wait for traction') },
    'dfi-women': { impact: t('Champion it'), safe: t('Stick to the plan') },
    'bank-sme': { impact: t('Lend to them'), safe: t('Ask for collateral') },
    'bank-fees': { impact: t('Cut the fees'), safe: t('Keep the fees') },
  })[decision]?.[choice] ?? choice;

const titleText = (s: string) =>
  ({
    'Investment Director': t('Investment Director'),
    'Head of SME Banking': t('Head of SME Banking'),
  })[s] ?? s;

function Give({ a }: { a: Alloc }) {
  const { view, send } = useView();
  const [cause, setCause] = useState(a.causes[0]?.id ?? 'clinics');
  const [amount, setAmount] = useState('');
  const c = a.causes.find((x) => x.id === cause);
  const value = parseAmount(amount) ?? 0;
  const usd = value / 100 / Math.max(1e-9, view.market.unitsPerUsd);
  const outcome = c ? Math.floor(usd / c.unitUsd) : 0;
  const ct = causeText(cause);
  return (
    <div className="stack" data-path="give">
      <Field label={t('Cause')} hint={ct.tradeoff}>
        {(id) => (
          <select id={id} value={cause} onChange={(e) => setCause(e.target.value)}>
            {a.causes.map((x) => (
              <option key={x.id} value={x.id}>
                {causeText(x.id).name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label={t('Amount')}
        hint={t('From your personal account. At least {n}.', { n: money(a.minGift, a.currency) })}
      >
        {(id) => (
          <input
            id={id}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
      </Field>
      {value > 0 && (
        <p className="small">
          {t('About {n} {unit}.', { n: outcome.toLocaleString(), unit: ct.unit })}
        </p>
      )}
      <Button
        disabled={value < a.minGift}
        onClick={() =>
          void send(
            { type: 'give.pledge', cause, amount: value },
            t('Thank you. Your gift is on its way.'),
          )
        }
      >
        {t('Give {n}', { n: money(value, a.currency) })}
      </Button>
      {a.causes.some((x) => x.outcome > 0) && (
        <ul className="wealth-lines">
          {a.causes
            .filter((x) => x.outcome > 0)
            .map((x) => (
              <li key={x.id}>
                <span>
                  {causeText(x.id).name}: {x.outcome.toLocaleString()} {causeText(x.id).unit}
                </span>
                <strong>{money(x.given, a.currency)}</strong>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Mentor({ a }: { a: Alloc }) {
  const { send } = useView();
  const [grant, setGrant] = useState<number>(a.mentor.defaultGrantBps);
  const mine = a.mentor.mine.filter((x) => x.status === 'active' || x.status === 'offered');
  return (
    <div className="stack" data-path="mentor">
      {a.mentor.offers.map((o) => (
        <div key={o.id} className="stack" data-mentor-offer={o.id}>
          <p className="small">
            {t('{name} offers to mentor {company} for {pct} advisor shares.', {
              name: o.mentorName,
              company: o.companyName,
              pct: bpsText(o.grantBps),
            })}
          </p>
          <div className="row">
            <Button
              size="sm"
              onClick={() =>
                void send(
                  { type: 'mentor.answer', mentorshipId: o.id, accept: true },
                  t('Your new mentor starts next month.'),
                )
              }
            >
              {t('Accept')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void send(
                  { type: 'mentor.answer', mentorshipId: o.id, accept: false },
                  t('Declined.'),
                )
              }
            >
              {t('Decline')}
            </Button>
          </div>
        </div>
      ))}
      {mine.map((x) => (
        <ListRow
          key={x.id}
          title={x.companyName}
          sub={
            x.status === 'offered'
              ? t('Waiting for the founder’s answer')
              : t('{n} of {m} months of advice · {pct} advisor shares', {
                  n: x.months,
                  m: a.mentor.months,
                  pct: bpsText(x.grantBps),
                })
          }
        />
      ))}
      <Segmented
        label={t('Advisor shares to ask for')}
        value={String(grant)}
        onChange={(v) => setGrant(Number(v))}
        options={[25, 50, 100].map((b) => ({ value: String(b), label: bpsText(b) }))}
      />
      {a.mentor.candidates.slice(0, 6).map((c) => (
        <ListRow
          key={c.companyId}
          title={c.name}
          sub={t('Product fit {fit} · quality {q}', { fit: c.fit, q: c.quality })}
          end={
            <Button
              size="sm"
              variant="secondary"
              disabled={mine.some((x) => x.companyId === c.companyId)}
              onClick={() =>
                void send(
                  { type: 'mentor.offer', companyId: c.companyId, grantBps: grant },
                  (r: { status: string } | null) =>
                    r?.status === 'active'
                      ? t('They said yes. Your advice starts next month.')
                      : r?.status === 'declined'
                        ? t('They want a mentor with a track record.')
                        : t('Offer sent to the founder.'),
                )
              }
            >
              {t('Mentor')}
            </Button>
          }
        />
      ))}
    </div>
  );
}

function CareerPath({ a }: { a: Alloc }) {
  const { send } = useView();
  const k = a.career;
  if (k.role)
    return (
      <div className="stack" data-path="career">
        <p>
          {t('{title} at {org}: {pay} a month before tax.', {
            title: titleText(k.role.title),
            org: k.role.orgName,
            pay: money(k.role.salary, a.currency),
          })}
        </p>
        {k.decision ? (
          <div className="stack" data-career-decision={k.decision.id}>
            <p className="small">{decisionText(k.decision.id)}</p>
            <div className="row">
              {k.decision.choices.map((ch) => (
                <Button
                  key={ch.id}
                  size="sm"
                  variant={ch.id === 'impact' ? 'primary' : 'secondary'}
                  onClick={() =>
                    void send({ type: 'career.decide', choiceId: ch.id }, t('Decision made.'))
                  }
                >
                  {choiceText(k.decision!.id, ch.id)}
                </Button>
              ))}
            </div>
            <p className="small muted">
              {t('Backing people builds your name and contacts; playing safe earns a bonus.')}
            </p>
          </div>
        ) : (
          <p className="small muted">{t('This month’s big call is made. More next month.')}</p>
        )}
        <Button
          variant="ghost"
          onClick={() => void send({ type: 'career.leave' }, t('You left the job.'))}
        >
          {t('Leave the job')}
        </Button>
      </div>
    );
  return (
    <div className="stack" data-path="career">
      {k.blocker && <p className="small bad">{tx(k.blocker)}</p>}
      {k.orgs.map((o) => (
        <ListRow
          key={o.orgId}
          title={o.name}
          sub={t('{title} · {pay} a month · {h}h of your month', {
            title: titleText(o.title),
            pay: money(o.salary, a.currency),
            h: k.hours,
          })}
          end={
            <Button
              size="sm"
              variant="secondary"
              disabled={!!k.blocker}
              onClick={() =>
                void send(
                  { type: 'career.join', orgKind: o.orgKind, orgId: o.orgId },
                  t('Welcome aboard.'),
                )
              }
            >
              {t('Join')}
            </Button>
          }
        />
      ))}
    </div>
  );
}

function PathCard({
  id,
  title,
  tradeoff,
  children,
}: {
  id: string;
  title: string;
  tradeoff: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} className="path-card">
      <p className="small muted" data-tradeoff={id}>
        {tradeoff}
      </p>
      {children}
    </Card>
  );
}

export function AllocatorHub({ open }: { open?: (app: 'invest') => void }) {
  const { view } = useView();
  const a = view.capital?.allocator;
  if (!a) return null;
  return (
    <>
      <Card title={t('The Capital Allocator')} sub={t('Chapter 7')}>
        <p className="small">
          {a.liquidity
            ? t(
                'You have turned shares into cash. Now choose what your money and experience do next.',
              )
            : t('These paths open fully after an exit, but you can start some now.')}
        </p>
      </Card>
      <PathCard
        id="angel"
        title={t('Angel investor')}
        tradeoff={t(
          'Back founders with your own money. Most startups fail; a few winners pay for the rest. Your money is locked up for years.',
        )}
      >
        {open && (
          <Button variant="secondary" onClick={() => open('invest')}>
            {t('Open the Invest app')}
          </Button>
        )}
      </PathCard>
      <PathCard
        id="fund"
        title={t('Start a fund')}
        tradeoff={t(
          'Invest other people’s money: fees and a share of the profits, but your investors expect returns.',
        )}
      >
        {open && (
          <Button variant="secondary" onClick={() => open('invest')}>
            {t('Raise a fund')}
          </Button>
        )}
      </PathCard>
      <PathCard
        id="mentor"
        title={t('Mentor a startup')}
        tradeoff={t(
          'Monthly advice ({h}h) that lifts their product a little, for 0.25–1% advisor shares. Paper value only, unless they do well.',
          { h: a.mentor.hours },
        )}
      >
        <Mentor a={a} />
      </PathCard>
      <PathCard
        id="give"
        title={t('Philanthropy')}
        tradeoff={t(
          'Give money away for results you can measure. It improves your name; the money doesn’t come back.',
        )}
      >
        <Give a={a} />
      </PathCard>
      <PathCard
        id="career"
        title={t('A senior role at a DFI or a bank')}
        tradeoff={t(
          'A steady salary (taxed at {rate}) and big decisions every month, but it takes {h}h of your month.',
          {
            rate: pct(a.career.taxRate),
            h: a.career.hours,
          },
        )}
      >
        <CareerPath a={a} />
      </PathCard>
      <PathCard
        id="serial"
        title={t('Serial founder')}
        tradeoff={t(
          'Start again with what you learned: a little more skill, your reputation and your contacts. The risk is all yours again.',
        )}
      >
        {a.serial.startedMonth !== null ? (
          <p className="small">
            {t('You started again in month {n}.', { n: a.serial.startedMonth })}
          </p>
        ) : a.serial.eligible && a.serial.canStart ? (
          <FoundCompany serial />
        ) : (
          <p className="small muted">
            {a.serial.eligible
              ? t('Two ventures at once is the limit.')
              : t('Open after an exit or a closed company.')}
          </p>
        )}
      </PathCard>
    </>
  );
}

// ---------------------------------------------------------------- the hub

export type CapitalTab = 'exit' | 'markets' | 'allocate';

export function CapitalHub({ open }: { open?: (app: 'invest') => void }) {
  const { view } = useView();
  const founder = (view.capital?.exits.length ?? 0) > 0;
  const [tab, setTab] = useState<CapitalTab>(founder ? 'exit' : 'markets');
  return (
    <div className="stack capital-hub">
      <OffersForYou />
      <ReviewInvestors />
      <WealthCard compact />
      <Segmented
        label={t('Capital')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'exit', label: t('Exit') },
          { value: 'markets', label: t('Markets') },
          { value: 'allocate', label: t('Allocate') },
        ]}
      />
      {tab === 'exit' && <ExitOptions />}
      {tab === 'markets' && <PublicMarkets />}
      {tab === 'allocate' && <AllocatorHub open={open} />}
    </div>
  );
}
