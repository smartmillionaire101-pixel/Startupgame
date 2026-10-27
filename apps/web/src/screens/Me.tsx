import { useEffect, useState } from 'react';
import { useNav } from '../phone/bus';
import { LifeBarsPanel } from '../LifeBars';
import type { Industry, RevenueModel, Stage } from '@runway/engine';
import { api } from '../api';
import { LANGS, setLang, t, tx, useLang } from '../i18n';
import { amountInput, money, parseAmount, stars } from '../format';
import { useView } from '../store';
import { Bar, Button, Card, Confirm, Empty, Field, Pill, Sparkline, Stat } from '../ui';
import { Chats } from './Chat';
import { visitPlace } from '../city/goto';
import { contactsOf, type ContactView } from '../city/people';
import { flightsOf } from '../city/travel';
import { BankPicker } from './common';
import { WealthCard } from './Capital';
import { MyLook } from '../avatar/EditLook';
import { PurchasesButton } from '../avatar/Wardrobe';
import { AccountStatus, SignOutButton, UnsavedBanner } from './Account';
import { ProfileDetails } from './ProfileDetails';
import { industryFromIdea } from './industryGuess';
import { LifestyleCard } from './Lifestyle';
import { FoundBank } from './Bank';
import { BankInvitations } from './BankLicence';
import { setSetting, useSimple, useSimpleAvailable } from '../phone/settings';
import { openLiving } from '../experiences/living-bus';

type Tab = 'profile' | 'money' | 'people' | 'settings';

// A tab asked for from elsewhere (the money pill's "All your money" opens Money).
let askedTab: Tab | null = null;
const tabAsks = new Set<(t: Tab) => void>();
/** Open Me on this tab next (or now, if Me is showing). */
export function askMeTab(tab: Tab) {
  if (tabAsks.size) for (const f of tabAsks) f(tab);
  else askedTab = tab;
}

export function MeScreen() {
  const [tab, setTab] = useState<Tab>(() => {
    const asked = askedTab;
    askedTab = null;
    return asked ?? 'profile';
  });
  useEffect(() => {
    tabAsks.add(setTab);
    return () => void tabAsks.delete(setTab);
  }, []);
  return (
    <>
      <UnsavedBanner />
      <div className="tabs" role="tablist">
        {(['profile', 'money', 'people', 'settings'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {tabLabel(k)}
          </button>
        ))}
      </div>
      {tab === 'profile' && <Profile />}
      {tab === 'money' && <PersonalMoney />}
      {tab === 'people' && <People />}
      {tab === 'settings' && <Settings />}
    </>
  );
}

const tabLabel = (k: Tab) =>
  ({ profile: t('Profile'), money: t('Money'), people: t('People'), settings: t('Settings') })[k];

const roleLabel = (r: string) =>
  ({ founder: t('Founder'), investor: t('Investor'), banker: t('Banker') })[r] ?? r;

const skillLabel = (k: string) =>
  ({
    product: t('Product'),
    sales: t('Sales'),
    fundraising: t('Fundraising'),
    finance: t('Finance'),
    hiring: t('Hiring'),
    leadership: t('Leadership'),
    negotiation: t('Negotiation'),
    publicSpeaking: t('Public speaking'),
    investing: t('Investing'),
    risk: t('Risk'),
  })[k] ?? k;

const modelLabel = (m: string) =>
  ({
    subscription: t('Subscription'),
    transaction: t('Transaction'),
    usage: t('Usage'),
    marketplace: t('Marketplace'),
    'one-off': t('One Off'),
    services: t('Services'),
  })[m] ?? m;

const bandLabel = (b: string) =>
  ({
    excellent: t('excellent'),
    good: t('good'),
    fair: t('fair'),
    poor: t('poor'),
    'very poor': t('very poor'),
  })[b] ?? b;

const milestoneLabels = (): Record<string, string> => ({
  'founder.first-customer': t('First customer'),
  'founder.first-hire': t('First hire'),
  'founder.first-raise': t('First raise'),
  'founder.revenue-100m': t('₦100m revenue'),
  'founder.profitable': t('Profitable'),
  'founder.series-a': t('Series A'),
  'founder.unicorn': t('Unicorn'),
  'founder.exit': t('Exit'),
  'investor.first-check': t('First cheque'),
  'investor.first-follow-on': t('First follow-on'),
  'investor.first-board-seat': t('First board seat'),
  'investor.fund-1': t('Fund I'),
  'investor.first-exit': t('First exit'),
  'investor.fund-1x': t('Fund 1x'),
  'investor.fund-3x': t('Fund 3x'),
  'investor.fund-10x': t('Fund 10x'),
  'any.comeback': t('First comeback'),
  'any.role-switch': t('First role switch'),
  'banker.licence': t('Banking licence'),
  'banker.first-loan': t('First loan made'),
  'banker.1000-customers': t('1,000 customers'),
  'banker.five-star': t('Five-star bank'),
});

function Profile() {
  const { view } = useView();
  const nav = useNav();
  const me = view.me;
  const skills = Object.entries(me.skills).sort((a, b) => b[1] - a[1]);
  return (
    // A wide screen: columns (one after the other on a phone).
    <div className="screen-cols">
      <div className="screen-col">
        <section className="card profile-card">
          <header className="profile-head">
            {/* Phase 6a: your portrait, and the character creator under it. */}
            <MyLook />
            <span className="profile-who">
              <h2>{me.name}</h2>
              <span className="small muted">@{me.handle}</span>
              <span className="row profile-tags">
                <Pill tone="info">{roleLabel(me.role)}</Pill>
                {me.background?.name && <Pill>{tx(me.background.name)}</Pill>}
              </span>
            </span>
          </header>
          <div className="profile-stats">
            <div>
              <span className="stat-label">{t('Stars')}</span>
              {/* Day one: no track record yet, so no rating (and no warning) to show. */}
              {me.starHistory.length < 2 ? (
                <>
                  <b className="profile-stat">{t('New')}</b>
                  <span className="small muted">{t('After month 1')}</span>
                </>
              ) : (
                <>
                  <b className="profile-stat">{stars(me.stars)}</b>
                  {me.publicWarning && <Pill tone="bad">{t('Public warning')}</Pill>}
                  <Sparkline values={me.starHistory} label={t('Stars over time')} />
                </>
              )}
            </div>
            <div>
              <span className="stat-label">{t('Network')}</span>
              <b className="profile-stat">{me.network}</b>
              <span className="small muted">{view.market.name}</span>
            </div>
          </div>
          {me.bars ? (
            <LifeBarsPanel me={me} />
          ) : (
            <Bar
              label={t('Energy')}
              value={me.energy / 100}
              tone={me.burnout ? 'bad' : me.energy < 40 ? 'warn' : 'good'}
            />
          )}
          <p className="small muted">
            {t('{left}/{total} h left this month', {
              // Tenths at most (play-test: "194.87/200 h").
              left: Math.round(me.hours.left * 10) / 10,
              total: Math.round(me.hours.available * 10) / 10,
            })}
            {me.burnout ? ` · ${t('burnout cuts your hours')}` : ''}
          </p>
        </section>
        <ProfileDetails key={me.id + me.role} />
        {/* What you bought at the mall: your wardrobe (wear it) and the things you keep. */}
        <PurchasesButton />
        <Button block data-open-living="" onClick={() => openLiving(me.id)}>
          {t('🏠 Home & friends')}
          {view.living.dates.some((d) => d.status === 'invited' && d.guest === me.id)
            ? ` · ${t('Invitation')}`
            : ''}
        </Button>
        {me.role === 'founder' && !view.companies.some((c) => c.status === 'active') && (
          <Card title={t('Set up your business')}>
            <p className="small muted">{t('Your company is set up on the Company tab.')}</p>
            <Button
              variant="primary"
              block
              data-go-company=""
              onClick={() => nav?.go({ kind: 'tab', tab: 'company' })}
            >
              {t('Set up my company')}
            </Button>
          </Card>
        )}
        {me.role === 'banker' &&
          (!view.bank || ['failed', 'rejected'].includes(view.bank.status)) && <FoundBank />}
        {/* Bankers note: someone invited you to co-found their bank. */}
        {me.role !== 'banker' && <BankInvitations />}
      </div>
      <div className="screen-col">
        <details className="card">
          <summary>{t('City and career')}</summary>
          <Travel trips={false} />
          <CareerMoves />
        </details>
        <Card title={t('Skills')}>
          <div className="skills-grid">
            {skills.map(([k, v]) => (
              <Bar key={k} label={skillLabel(k)} value={v / 100} />
            ))}
          </div>
        </Card>
      </div>
      <div className="screen-col">
        <Card title={t('Milestones')}>
          {Object.keys(me.milestones).length === 0 ? (
            <Empty>{t('None yet. Your first customer is close.')}</Empty>
          ) : (
            <div className="chips">
              {Object.entries(me.milestones).map(([k, m]) => (
                <Pill key={k} tone="good">
                  {milestoneLabels()[k] ?? k} · {t('m{n}', { n: m })}
                </Pill>
              ))}
            </div>
          )}
        </Card>
        <Card title={t('{market} leaderboards', { market: view.market.name })}>
          <h3 className="section-h">{t('Highest stars')}</h3>
          <ol className="board">
            {view.leaderboards.highestStars.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className="board-name">
                  {r.name}
                  {r.ai ? '' : ` ${t('(player)')}`}
                </span>
                <b>{r.value.toFixed(1)}★</b>
              </li>
            ))}
          </ol>
          <h3 className="section-h">{t('Fastest growing')}</h3>
          {view.leaderboards.fastestGrowing.length ? (
            <ol className="board">
              {view.leaderboards.fastestGrowing.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <span className="board-name">{r.name}</span>
                  <b>{t('{n}%/mo', { n: r.value })}</b>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{t('Needs three months of revenue.')}</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

export function PersonalMoney({ travel = true }: { travel?: boolean } = {}) {
  const { view, send, cur } = useView();
  const local = view.accounts.local!;
  const usd = view.accounts.usd;
  const [amount, setAmount] = useState('');
  return (
    <>
      <WealthCard />
      <div className="kpis">
        <Stat
          label={t('Savings')}
          value={money(local.balance, cur)}
          hint={t('{n} months of living', {
            n: Math.floor(local.balance / Math.max(1, view.me.lifestyle.monthlyCost)),
          })}
        />
        <Stat
          label={t('Dollar account')}
          value={usd ? money(usd.balance, 'USD') : '—'}
          hint={usd ? `${cur}/USD ${view.market.unitsPerUsd}` : t('Not opened')}
        />
      </div>
      <LifestyleCard />
      <Card title={t('Dollar account')}>
        {!usd ? (
          <Button
            variant="subtle"
            onClick={() => void send({ type: 'player.usdOpen' }, t('Dollar account open.'))}
          >
            {t('Open a dollar account')}
          </Button>
        ) : (
          <>
            <Field
              label={t('Amount')}
              hint={t('Official rate plus a {pct}% bank fee.', { pct: view.market.fxFeeBps / 100 })}
            >
              {(id) => (
                <input
                  id={id}
                  value={amount}
                  placeholder={t('e.g. 500k')}
                  onChange={(e) => setAmount(e.target.value)}
                />
              )}
            </Field>
            <div className="row">
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    {
                      type: 'player.convert',
                      direction: 'toUsd',
                      amount: parseAmount(amount) ?? 0,
                    },
                    (r: { received: number }) =>
                      t('Received {amount}.', { amount: money(r.received, 'USD') }),
                  )
                }
              >
                {cur} → USD
              </Button>
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    {
                      type: 'player.convert',
                      direction: 'toLocal',
                      amount: parseAmount(amount) ?? 0,
                    },
                    (r: { received: number }) =>
                      t('Received {amount}.', { amount: money(r.received, cur) }),
                  )
                }
              >
                USD → {cur}
              </Button>
            </div>
          </>
        )}
      </Card>
      <Card title={t('Freelance gig')}>
        <p className="small muted">
          {t('Slow, but nobody is ever locked out. {pay} for {hours}h. {n}/2 this month.', {
            pay: money(view.market.floorGig.pay, cur),
            hours: view.market.floorGig.hours,
            n: view.me.gigsThisMonth,
          })}
        </p>
        <Button
          variant="subtle"
          onClick={() => void send({ type: 'player.gig' }, (r: { text: string }) => tx(r.text))}
        >
          {t('Take a gig')}
        </Button>
      </Card>
      <Card title={t('Recent transactions')}>
        <ul className="list small">
          {local.recent.slice(0, 12).map((tr, i) => (
            <li key={i} className="spread">
              <span>{tx(tr.memo)}</span>
              <span className={tr.amount >= 0 ? 'good' : ''}>{money(tr.amount, cur)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Credit />
      <WhereYouBank />
      {travel && <Travel />}
      <CareerMoves />
    </>
  );
}

/**
 * Travel and relocation (§14). Trips leave from the airport (Wave 4: you fly
 * there and walk its streets); `trips={false}` keeps just relocation, for
 * the airport, which lists its own departures.
 */
export function Travel({ trips = true }: { trips?: boolean } = {}) {
  const { view, send, cur } = useView();
  const [moveTo, setMoveTo] = useState('');
  const [handle, setHandle] = useState('');
  const dests = view.me.destinations;
  const flights = flightsOf(view);
  return (
    <Card title={trips ? t('Travel') : t('Moving for good')}>
      {trips && (
        <>
          <p className="small muted">
            {flights && flights.hours === 0
              ? t(
                  'Flights leave from the airport: one way, paid with money only, and you can go any time. While you’re there you can meet its investors and invest.',
                )
              : flights
                ? t(
                    'Flights leave from the airport: one way, {hours} hours, and you can go any time. While you’re there you can meet its investors and invest.',
                    { hours: flights.hours },
                  )
                : t(
                    'A trip costs money and {hours} hours. You must visit a market before investing or acquiring there, and you can pitch its investors during the trip month.',
                    { hours: 40 },
                  )}
          </p>
          <ul className="list">
            {dests.map((d) => (
              <li key={d.id} className="spread">
                <span>
                  {d.name}{' '}
                  <span className="small muted">
                    · {money(flights?.fareTo[d.id] ?? d.tripCost, cur)}
                  </span>
                  {d.visitingNow ? (
                    <Pill tone="good">{t('This month')}</Pill>
                  ) : view.me.visited[d.id as keyof typeof view.me.visited] !== undefined ? (
                    <Pill>{t('Visited')}</Pill>
                  ) : null}
                </span>
                <Button
                  variant="ghost"
                  disabled={!flights && d.visitingNow}
                  onClick={() =>
                    flights
                      ? visitPlace('airport')
                      : void send(
                          { type: 'player.travel', market: d.id as never },
                          (r: { text: string }) => tx(r.text),
                        )
                  }
                >
                  {flights ? t('To the airport') : t('Go')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <details style={{ marginTop: '0.6rem' }}>
        <summary className="small">{t('Relocate permanently')}</summary>
        <p className="small bad">
          {t(
            'You lose half of everything: cash, shares and stakes. The lost half goes to the central bank here. Co-founders or an AI CEO run what you leave; your shares pay dividends only while profitable.',
          )}
        </p>
        <div className="grid2">
          <Field label={t('Move to')}>
            {(id) => (
              <select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">{t('Choose…')}</option>
                {dests.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('Handle there (optional)')}>
            {(id) => (
              <input
                id={id}
                value={handle}
                placeholder={view.me.handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Confirm
          label={t('Relocate')}
          confirmLabel={t('Yes, give up half and move')}
          onConfirm={() =>
            void send(
              { type: 'player.relocate', market: moveTo as never, ...(handle ? { handle } : {}) },
              t('You’ve relocated. A fresh start.'),
            )
          }
        />
      </details>
    </Card>
  );
}

/** Credit profile and personal loans (§8). */
export function Credit() {
  const { view, send, cur } = useView();
  const credit = view.me.credit;
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState(12);
  const [collateral, setCollateral] = useState('');
  const [bankId, setBankId] = useState('');
  const pledgeable = view.companies.filter(
    (c) =>
      c.status === 'active' &&
      c.capTable.lastPostMoney > 0 &&
      c.capTable.rows.some((r) => r.holderId === view.me.id),
  );
  return (
    <Card
      title={t('Credit and loans')}
      action={
        <Pill tone={credit.score >= 65 ? 'good' : credit.score < 35 ? 'bad' : 'warn'}>
          {credit.score} · {bandLabel(credit.band)}
        </Pill>
      }
    >
      <p className="small muted">
        {t('{onTime} on-time payments · {missed} missed · {defaults} defaults · debt {debt}', {
          onTime: credit.onTimePayments,
          missed: credit.missedPayments,
          defaults: credit.defaults,
          debt: money(credit.debt, cur),
        })}
      </p>
      <p className="small muted">
        {t(
          'Everyone starts at 60. Loans repaid on time raise it slowly; missed loan payments and defaults lower it. Living costs don’t count.',
        )}
      </p>
      {view.me.loans.length > 0 && (
        <ul className="list small">
          {view.me.loans.map((l) => (
            <li key={l.id} className="spread">
              <span>
                {t('{lender}: {amount} left · {payment}/mo · {n} months', {
                  lender: l.lender,
                  amount: money(l.outstanding, cur),
                  payment: money(l.monthlyPayment, cur),
                  n: l.monthsLeft,
                })}
                {l.collateral
                  ? ` · ${t('{label} pledged', { label: tx(l.collateral.label) })}`
                  : ''}
                {l.missed > 0 && <span className="bad"> · {t('payment missed')}</span>}
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  void send(
                    { type: 'player.repay', loanId: l.id, amount: l.outstanding },
                    t('Loan repaid.'),
                  )
                }
              >
                {t('Repay')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">
        {t('Unsecured limit today: {limit}. Pledging shares raises it and lowers the rate.', {
          limit: money(credit.unsecuredLimit, cur),
        })}
      </p>
      <BankPicker value={bankId} onChange={setBankId} product="people" />
      <div className="grid2">
        <Field label={t('Amount ({cur})', { cur })}>
          {(id) => (
            <input
              id={id}
              value={amount}
              placeholder={t('e.g. 2m')}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Months')}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={3}
              max={60}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
          )}
        </Field>
      </div>
      {pledgeable.length > 0 && (
        <Field label={t('Collateral')}>
          {(id) => (
            <select id={id} value={collateral} onChange={(e) => setCollateral(e.target.value)}>
              <option value="">{t('None (unsecured)')}</option>
              {pledgeable.map((c) => (
                <option key={c.id} value={c.id}>
                  {t('My {name} shares', { name: c.name })}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Button
        variant="subtle"
        disabled={!parseAmount(amount)}
        onClick={() =>
          void send(
            {
              type: 'player.loan',
              amount: parseAmount(amount) ?? 0,
              months,
              ...(collateral ? { collateralCompanyId: collateral } : {}),
              ...(bankId ? { bankId } : {}),
            },
            (r: { summary: string }) =>
              t('Offer ready on your deal cards: {summary}', { summary: tx(r.summary) }),
          )
        }
      >
        {t('Ask {bank}', {
          bank: view.market.banks.find((b) => b.id === bankId)?.name ?? view.market.bankName,
        })}
      </Button>
    </Card>
  );
}

/** Move accounts to a player bank, or back to the market's AI bank (§8). */
function WhereYouBank() {
  const { view, send } = useView();
  const [rating, setRating] = useState(4);
  const banks = view.market.banks;
  if (banks.length === 0) return null;
  const rows: {
    key: string;
    label: string;
    account: 'personal' | 'usd' | string;
    bankId: string | null;
  }[] = [
    {
      key: 'personal',
      label: t('Savings'),
      account: 'personal',
      bankId: view.accounts.local?.bankId ?? null,
    },
    ...(view.accounts.usd
      ? [
          {
            key: 'usd',
            label: t('Dollar account'),
            account: 'usd',
            bankId: view.accounts.usd.bankId,
          },
        ]
      : []),
    ...view.companies
      .filter((c) => c.status === 'active' && c.market === view.market.id)
      .map((c) => ({ key: c.id, label: c.name, account: c.id, bankId: c.bankId ?? null })),
  ];
  const used = [...new Set(rows.map((r) => r.bankId).filter((x): x is string => !!x))];
  return (
    <Card title={t('Where you bank')}>
      <p className="small muted">
        {t(
          'Player banks pay interest and charge fees. Deposits are insured only up to {amount} if a bank fails.',
          { amount: money(view.market.depositInsurance, view.market.currency) },
        )}
      </p>
      <ul className="list small">
        {rows.map((r) => (
          <li key={r.key} className="spread">
            <span>{r.label}</span>
            <select
              aria-label={t('Bank for {name}', { name: r.label })}
              value={r.bankId ?? ''}
              onChange={(e) =>
                void send(
                  { type: 'account.move', account: r.account, bankId: e.target.value || null },
                  (x: { message: string }) => tx(x.message),
                )
              }
            >
              <option value="">{view.market.bankName}</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {(b.depositRateBps / 100).toFixed(1)}% · {b.stars.toFixed(1)}★
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {used.map((id) => {
        const b = banks.find((x) => x.id === id);
        if (!b) return null;
        return (
          <div key={id} className="row small">
            {t('Rate {name}:', { name: b.name })}
            <select
              aria-label={t('Rate {name}', { name: b.name })}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}★
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              onClick={() =>
                void send({ type: 'bank.review', bankId: id, rating }, t('Thanks for the review.'))
              }
            >
              {t('Review')}
            </Button>
          </div>
        );
      })}
    </Card>
  );
}

function CareerMoves() {
  const { view, send, meta } = useView();
  const [sectors, setSectors] = useState<Industry[]>(['fintech']);
  const [check, setCheck] = useState(amountInput(Math.round(view.market.costOfLiving * 2)));
  if (view.me.role !== 'founder' && view.companies.some((c) => c.status === 'active')) return null;
  return (
    <Card title={t('Career moves')}>
      {view.me.role === 'founder' ? (
        <>
          <p className="small muted">
            {t('Founder → investor: needs a year of living costs in savings.')}
          </p>
          <div className="chips">
            {meta?.industries.map((i) => (
              <button
                key={i.id}
                className="chip"
                aria-pressed={sectors.includes(i.id as Industry)}
                onClick={() =>
                  setSectors((s) =>
                    s.includes(i.id as Industry)
                      ? s.filter((x) => x !== i.id)
                      : [...s, i.id as Industry],
                  )
                }
              >
                {tx(i.label)}
              </button>
            ))}
          </div>
          <Field label={t('Typical cheque')}>
            {(id) => <input id={id} value={check} onChange={(e) => setCheck(e.target.value)} />}
          </Field>
          <Button
            variant="subtle"
            onClick={() =>
              void send(
                {
                  type: 'player.becomeInvestor',
                  investor: {
                    sectors,
                    stages: ['pre-seed', 'seed'] as Stage[],
                    checkSize: parseAmount(check) ?? 0,
                  },
                },
                (r: { message: string }) => tx(r.message),
              )
            }
          >
            {t('Become an angel')}
          </Button>
        </>
      ) : (
        <>
          <p className="small muted">{t('Investor → founder: start a company any time.')}</p>
          <FoundCompany />
        </>
      )}
    </Card>
  );
}

/** `serial`: start again as a serial founder (`company.start`: skills and contacts carry). */
/** `setup`: the founder setup's step 1 (the company type and its fee come at registration). */
export function FoundCompany({ serial, setup }: { serial?: boolean; setup?: boolean } = {}) {
  const { view, send, meta } = useView();
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
  // No industry until you pick one, or your idea suggests one (it used to
  // start on Business software, which a health-care idea then kept).
  const [industry, setIndustry] = useState<Industry | ''>('');
  const [picked, setPicked] = useState(false);
  const [model, setModel] = useState<RevenueModel>('subscription');
  const [incorporation, setIncorporation] = useState<'local' | 'uk' | 'us'>('local');
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const verify = (v: string) => {
    setName(v);
    if (v.trim().length >= 3)
      void api
        .checkName(v, view.market.id, 'company')
        .then(setCheck)
        .catch(() => setCheck(null));
  };
  return (
    <div className="stack">
      <Field
        label={t('Company name')}
        hint={
          check && !check.ok ? <span className="bad">{tx(check.reason ?? '')}</span> : undefined
        }
      >
        {(id) => (
          <input id={id} value={name} maxLength={32} onChange={(e) => verify(e.target.value)} />
        )}
      </Field>
      <Field label={t('Idea in one line')}>
        {(id) => (
          <input
            id={id}
            value={idea}
            maxLength={120}
            onChange={(e) => {
              setIdea(e.target.value);
              if (!picked) setIndustry(industryFromIdea(e.target.value) ?? '');
            }}
          />
        )}
      </Field>
      <div className="grid2">
        <Field
          label={t('Industry')}
          hint={
            industry && !picked
              ? t('Suggested from your idea: change it if it isn’t right.')
              : !industry
                ? t('Your customers, interviews and sales follow it.')
                : undefined
          }
        >
          {(id) => (
            <select
              id={id}
              value={industry}
              data-industry-pick={industry}
              onChange={(e) => {
                setIndustry(e.target.value as Industry | '');
                setPicked(!!e.target.value);
              }}
            >
              <option value="" disabled>
                {t('Choose your industry')}
              </option>
              {meta?.industries.map((i) => (
                <option key={i.id} value={i.id}>
                  {tx(i.label)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('Model')}>
          {(id) => (
            <select
              id={id}
              value={model}
              onChange={(e) => setModel(e.target.value as RevenueModel)}
            >
              {meta?.revenueModels.map((r) => (
                <option key={r} value={r}>
                  {modelLabel(r)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {!setup && (
        <Field
          label={t('Incorporation')}
          hint={t('Foreign holding companies cost more but some investors prefer them.')}
        >
          {(id) => (
            <select
              id={id}
              value={incorporation}
              onChange={(e) => setIncorporation(e.target.value as typeof incorporation)}
            >
              {Object.entries(meta?.incorporation ?? {}).map(([key, value]) => (
                <option key={key} value={key}>
                  {tx(value.label)} (
                  {money(
                    Math.round(view.market.costOfLiving * value.costCol),
                    view.market.currency,
                  )}
                  )
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Button
        disabled={!check?.ok || idea.trim().length < 5 || !industry}
        onClick={() =>
          industry &&
          void send(
            {
              type: serial ? 'company.start' : 'company.found',
              company: { name, idea, industry, revenueModel: model, incorporation },
            },
            setup
              ? t('{name}: the name is yours. Next, register it.', { name })
              : t('{name} is open for business.', { name }),
          )
        }
      >
        {setup ? t('Reserve the name and continue') : t('Start the company')}
      </Button>
    </div>
  );
}

const contactKindLabel = (k: ContactView['kind']) =>
  ({
    fund: t('Investor'),
    founder: t('Founder'),
    talent: t('Talent'),
    customer: t('Customers'),
    player: t('Player'),
    local: t('In town'),
  })[k];

/** People you've met at events, warmest first within each month (Wave 2). */
function Contacts() {
  const { view } = useView();
  const contacts = contactsOf(view);
  const funds = new Set(view.market.funds.map((f) => f.id));
  return (
    <Card title={t('Contacts')} action={<Pill>{contacts.length}</Pill>}>
      {contacts.length === 0 ? (
        <Empty>
          {t('No contacts yet. Host or attend an event at the Event Hall to meet people.')}
        </Empty>
      ) : (
        <ul className="list" aria-label={t('Contacts')}>
          {contacts.map((c) => (
            <li key={c.id}>
              <div className="spread">
                <div>
                  <div className="item-title">{c.name}</div>
                  <div className="small muted">{contactKindLabel(c.kind)}</div>
                </div>
                {c.kind === 'fund' && funds.has(c.refId) && (
                  <Button variant="ghost" onClick={() => visitPlace(`fund:${c.refId}`)}>
                    {t('Visit office')}
                  </Button>
                )}
              </div>
              <Bar
                value={c.warmth}
                label={t('Warmth')}
                tone={c.warmth >= 0.6 ? 'good' : c.warmth < 0.25 ? 'warn' : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function People() {
  const { view } = useView();
  const humans = view.players.filter((p) => !p.ai);
  return (
    <>
      <Contacts />
      <Chats />
      <Card title={t('Players in {market}', { market: view.market.name })}>
        {humans.length === 0 ? (
          <Empty>{t('You’re early. More players arrive as markets open.')}</Empty>
        ) : (
          <ul className="list">
            {humans.map((p) => (
              <li key={p.id}>
                <span className="item-title">{p.name}</span>{' '}
                <span className="small muted">
                  @{p.handle} · {roleLabel(p.role)} · {p.stars.toFixed(1)}★
                  {p.trust !== 0
                    ? ` · ${t('trust {n}', { n: `${p.trust > 0 ? '+' : ''}${p.trust}` })}`
                    : ''}
                  {p.companies.length ? ` · ${p.companies.join(', ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Wave 2: whether other players see you on the city map. */
function MapVisibility() {
  const { toast } = useView();
  const [visible, setVisible] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    api.presenceSetting().then(
      (r) => live && setVisible(r.visible !== false),
      () => live && setUnavailable(true),
    );
    return () => {
      live = false;
    };
  }, []);
  const change = (v: boolean) => {
    setVisible(v);
    api.setPresenceSetting(v).catch((e: Error) => {
      setVisible(!v);
      toast(tx(e.message), 'error');
    });
  };
  return (
    <Card title={t('Privacy')}>
      <label className="row">
        <input
          type="checkbox"
          checked={unavailable ? true : (visible ?? true)}
          disabled={unavailable || visible === null}
          onChange={(e) => change(e.target.checked)}
        />{' '}
        {t('Show me on the map')}
      </label>
      <p className="small muted">
        {unavailable
          ? t('Other players on the map arrive soon.')
          : t(
              'Other players in your market see your avatar walking the city. Turn this off to walk unseen.',
            )}
      </p>
    </Card>
  );
}

/** Simple mode (Phase 2): the same switch as the phone's Settings app. */
function SimpleModeCard() {
  const simple = useSimple();
  // Founders only: investors and bankers always play the full game.
  if (!useSimpleAvailable()) return null;
  return (
    <Card title={t('Simple mode')}>
      <label className="row simple-toggle" data-setting="simple">
        <input
          type="checkbox"
          role="switch"
          checked={simple}
          onChange={(e) => setSetting('simple', e.target.checked)}
        />{' '}
        {t('Bigger text, words on every button, four tabs and one clear next step.')}
      </label>
    </Card>
  );
}

function Settings() {
  const { view, lite, setLite, refresh, toast, meta } = useView();
  const lang = useLang();
  return (
    <>
      <Card title={t('Language')}>
        <div className="chips">
          {LANGS.map((l) => (
            <button
              key={l.id}
              className="chip"
              lang={l.id}
              aria-pressed={lang === l.id}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Card>
      <SimpleModeCard />
      <Card title={t('Data saver')}>
        <label className="row">
          <input type="checkbox" checked={lite} onChange={(e) => setLite(e.target.checked)} />{' '}
          {t('Lite mode: no charts, no live connection (refreshes every minute)')}
        </label>
      </Card>
      <MapVisibility />
      <Card title={t('Where the numbers come from')}>
        <p className="small muted">
          {t('Real data sets the conditions; the simulation decides outcomes.')}
        </p>
        <ul className="list small">
          {view.market.sources.map((s) => (
            <li key={s.input}>
              {tx(s.input)}: {tx(s.source)} <span className="muted">({tx(s.refresh)})</span>
            </li>
          ))}
        </ul>
        <p className="small muted">
          {t(
            'Tax: corporate {corporate}%, income {income}%, capital gains {gains}% (simplified). Deposit insurance {insurance}.',
            {
              corporate: Math.round(view.market.tax.corporate * 100),
              income: Math.round(view.market.tax.personalIncome * 100),
              gains: Math.round(view.market.tax.capitalGains * 100),
              insurance: money(view.market.depositInsurance, view.market.currency),
            },
          )}
        </p>
      </Card>
      <Card title={t('Account')}>
        <div className="stack">
          <AccountStatus />
          <SignOutButton />
          <Confirm
            label={t('Delete my account')}
            confirmLabel={t('Delete forever')}
            onConfirm={() =>
              void api.deleteAccount().then(() => {
                toast(t('Account deleted.'), 'ok');
                return refresh();
              })
            }
          />
          <p className="small muted">
            {t(
              'We keep the minimum: your email if you saved one, your handle and your market. Deleting removes your personal data and chats; your past deals stay in the world anonymously.',
            )}
          </p>
        </div>
      </Card>
      <p className="disclaimer">{meta?.disclaimer ? tx(meta.disclaimer) : null}</p>
    </>
  );
}
