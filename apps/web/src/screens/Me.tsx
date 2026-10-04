import { useState } from 'react';
import type { Industry, RevenueModel, Stage } from '@runway/engine';
import { api } from '../api';
import { amountInput, money, parseAmount, stars, titleCase } from '../format';
import { useView } from '../store';
import { Bar, Button, Card, Confirm, Empty, Field, Pill, Sparkline, Stat } from '../ui';
import { Chats } from './Chat';

type Tab = 'profile' | 'money' | 'people' | 'settings';

export function MeScreen() {
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <>
      <div className="tabs" role="tablist">
        {(['profile', 'money', 'people', 'settings'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {titleCase(t)}
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

const MILESTONE_LABELS: Record<string, string> = {
  'founder.first-customer': 'First customer',
  'founder.first-hire': 'First hire',
  'founder.first-raise': 'First raise',
  'founder.revenue-100m': '₦100m revenue',
  'founder.profitable': 'Profitable',
  'founder.series-a': 'Series A',
  'founder.unicorn': 'Unicorn',
  'founder.exit': 'Exit',
  'investor.first-check': 'First cheque',
  'investor.first-follow-on': 'First follow-on',
  'investor.first-board-seat': 'First board seat',
  'investor.fund-1': 'Fund I',
  'investor.first-exit': 'First exit',
  'investor.fund-1x': 'Fund 1x',
  'investor.fund-3x': 'Fund 3x',
  'investor.fund-10x': 'Fund 10x',
  'any.comeback': 'First comeback',
  'any.role-switch': 'First role switch',
};

function Profile() {
  const { view } = useView();
  const me = view.me;
  const skills = Object.entries(me.skills).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <Card title={`${me.name} · @${me.handle}`} action={<Pill>{titleCase(me.role)}</Pill>}>
        <div className="spread">
          <div>
            <div className="stat-value">{stars(me.stars)}</div>
            {me.publicWarning && <Pill tone="bad">Public warning</Pill>}
          </div>
          <Sparkline values={me.starHistory} label="Stars over time" />
        </div>
        <p className="small muted">
          {me.background?.name} · {view.market.name} · network {me.network}
        </p>
        <Bar
          label="Energy"
          value={me.energy / 100}
          tone={me.burnout ? 'bad' : me.energy < 40 ? 'warn' : 'good'}
        />
        <p className="small muted">
          {me.hours.left} of {me.hours.available} hours left this month
          {me.burnout ? ' · burnout cuts your hours' : ''}
        </p>
      </Card>
      <Card title="Skills">
        {skills.map(([k, v]) => (
          <Bar
            key={k}
            label={titleCase(k.replace(/([A-Z])/g, ' $1').toLowerCase())}
            value={v / 100}
          />
        ))}
      </Card>
      <Card title="Milestones">
        {Object.keys(me.milestones).length === 0 ? (
          <Empty>None yet. Your first customer is close.</Empty>
        ) : (
          <div className="chips">
            {Object.entries(me.milestones).map(([k, m]) => (
              <Pill key={k} tone="good">
                {MILESTONE_LABELS[k] ?? k} · m{m}
              </Pill>
            ))}
          </div>
        )}
      </Card>
      <Card title={`${view.market.name} leaderboards`}>
        <h3>Highest stars</h3>
        <ol className="small">
          {view.leaderboards.highestStars.slice(0, 5).map((r) => (
            <li key={r.id}>
              {r.name}
              {r.ai ? '' : ' (player)'} · {r.value.toFixed(1)}★
            </li>
          ))}
        </ol>
        <h3>Fastest growing</h3>
        {view.leaderboards.fastestGrowing.length ? (
          <ol className="small">
            {view.leaderboards.fastestGrowing.slice(0, 5).map((r) => (
              <li key={r.id}>
                {r.name} · {r.value}%/mo
              </li>
            ))}
          </ol>
        ) : (
          <Empty>Needs three months of revenue.</Empty>
        )}
      </Card>
    </>
  );
}

function PersonalMoney() {
  const { view, send, cur } = useView();
  const local = view.accounts.local!;
  const usd = view.accounts.usd;
  const [amount, setAmount] = useState('');
  return (
    <>
      <div className="kpis">
        <Stat
          label="Savings"
          value={money(local.balance, cur)}
          hint={`${Math.floor(local.balance / Math.max(1, view.me.lifestyle.monthlyCost))} months of living`}
        />
        <Stat
          label="Dollar account"
          value={usd ? money(usd.balance, 'USD') : '—'}
          hint={usd ? `${cur}/USD ${view.market.unitsPerUsd}` : 'Not opened'}
        />
      </div>
      <Card title="Lifestyle">
        <p className="small muted">
          Costs money every month; changes your energy, hours and how investors and tabloids see
          you. Fixed costs are hard to cut later.
        </p>
        <div className="choice-grid">
          {view.lifestyleTiers.map((t) => (
            <button
              key={t.tier}
              className="choice"
              aria-pressed={view.me.lifestyle.tier === t.tier}
              onClick={() =>
                void send({ type: 'player.lifestyle', tier: t.tier }, `Lifestyle: ${t.name}.`)
              }
            >
              <div className="spread">
                <span className="item-title">{t.name}</span>
                <span>{money(t.monthlyCost, cur)}/mo</span>
              </div>
              <div className="small muted">
                {t.housing} · {t.transport} · {t.hours >= 0 ? '+' : ''}
                {t.hours}h
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Dollar account">
        {!usd ? (
          <Button
            variant="subtle"
            onClick={() => void send({ type: 'player.usdOpen' }, 'Dollar account open.')}
          >
            Open a dollar account
          </Button>
        ) : (
          <>
            <Field
              label="Amount"
              hint={`Official rate plus a ${view.market.fxFeeBps / 100}% bank fee.`}
            >
              {(id) => (
                <input
                  id={id}
                  value={amount}
                  placeholder="e.g. 500k"
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
                    (r: { received: number }) => `Received ${money(r.received, 'USD')}.`,
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
                    (r: { received: number }) => `Received ${money(r.received, cur)}.`,
                  )
                }
              >
                USD → {cur}
              </Button>
            </div>
          </>
        )}
      </Card>
      <Card title="Freelance gig">
        <p className="small muted">
          Slow, but nobody is ever locked out. {money(view.market.floorGig.pay, cur)} for{' '}
          {view.market.floorGig.hours}h. {view.me.gigsThisMonth}/2 this month.
        </p>
        <Button
          variant="subtle"
          onClick={() => void send({ type: 'player.gig' }, (r: { text: string }) => r.text)}
        >
          Take a gig
        </Button>
      </Card>
      <Card title="Recent transactions">
        <ul className="list small">
          {local.recent.slice(0, 12).map((t, i) => (
            <li key={i} className="spread">
              <span>{t.memo}</span>
              <span className={t.amount >= 0 ? 'good' : ''}>{money(t.amount, cur)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Credit />
      <Travel />
      <CareerMoves />
    </>
  );
}

/** Travel and relocation (§14). */
function Travel() {
  const { view, send, cur } = useView();
  const [moveTo, setMoveTo] = useState('');
  const [handle, setHandle] = useState('');
  const dests = view.me.destinations;
  return (
    <Card title="Travel">
      <p className="small muted">
        A trip costs money and {40} hours. You must visit a market before investing or acquiring
        there, and you can pitch its investors during the trip month.
      </p>
      <ul className="list">
        {dests.map((d) => (
          <li key={d.id} className="spread">
            <span>
              {d.name} <span className="small muted">· {money(d.tripCost, cur)}</span>
              {d.visitingNow ? (
                <Pill tone="good">This month</Pill>
              ) : view.me.visited[d.id as keyof typeof view.me.visited] !== undefined ? (
                <Pill>Visited</Pill>
              ) : null}
            </span>
            <Button
              variant="ghost"
              disabled={d.visitingNow}
              onClick={() =>
                void send(
                  { type: 'player.travel', market: d.id as never },
                  (r: { text: string }) => r.text,
                )
              }
            >
              Go
            </Button>
          </li>
        ))}
      </ul>
      <details style={{ marginTop: '0.6rem' }}>
        <summary className="small">Relocate permanently</summary>
        <p className="small bad">
          You lose half of everything: cash, shares and stakes. The lost half goes to the central
          bank here. Co-founders or an AI CEO run what you leave; your shares pay dividends only
          while profitable.
        </p>
        <div className="grid2">
          <Field label="Move to">
            {(id) => (
              <select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Choose…</option>
                {dests.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Handle there (optional)">
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
          label="Relocate"
          confirmLabel="Yes, give up half and move"
          onConfirm={() =>
            void send(
              { type: 'player.relocate', market: moveTo as never, ...(handle ? { handle } : {}) },
              'You’ve relocated. A fresh start.',
            )
          }
        />
      </details>
    </Card>
  );
}

/** Credit profile and personal loans (§8). */
function Credit() {
  const { view, send, cur } = useView();
  const credit = view.me.credit;
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState(12);
  const [collateral, setCollateral] = useState('');
  const pledgeable = view.companies.filter(
    (c) =>
      c.status === 'active' &&
      c.capTable.lastPostMoney > 0 &&
      c.capTable.rows.some((r) => r.holderId === view.me.id),
  );
  return (
    <Card
      title="Credit and loans"
      action={
        <Pill tone={credit.score >= 65 ? 'good' : credit.score < 35 ? 'bad' : 'warn'}>
          {credit.score} · {credit.band}
        </Pill>
      }
    >
      <p className="small muted">
        {credit.onTimePayments} on-time payments · {credit.missedPayments} missed ·{' '}
        {credit.defaults} defaults · debt {money(credit.debt, cur)}
      </p>
      {view.me.loans.length > 0 && (
        <ul className="list small">
          {view.me.loans.map((l) => (
            <li key={l.id} className="spread">
              <span>
                {l.lender}: {money(l.outstanding, cur)} left · {money(l.monthlyPayment, cur)}/mo ·{' '}
                {l.monthsLeft} months
                {l.collateral ? ` · ${l.collateral.label} pledged` : ''}
                {l.missed > 0 && <span className="bad"> · payment missed</span>}
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  void send(
                    { type: 'player.repay', loanId: l.id, amount: l.outstanding },
                    'Loan repaid.',
                  )
                }
              >
                Repay
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">
        Unsecured limit today: {money(credit.unsecuredLimit, cur)}. Pledging shares raises it and
        lowers the rate.
      </p>
      <div className="grid2">
        <Field label={`Amount (${cur})`}>
          {(id) => (
            <input
              id={id}
              value={amount}
              placeholder="e.g. 2m"
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Months">
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
        <Field label="Collateral">
          {(id) => (
            <select id={id} value={collateral} onChange={(e) => setCollateral(e.target.value)}>
              <option value="">None (unsecured)</option>
              {pledgeable.map((c) => (
                <option key={c.id} value={c.id}>
                  My {c.name} shares
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
            },
            (r: { summary: string }) => `Offer ready on your deal cards: ${r.summary}`,
          )
        }
      >
        Ask {view.market.bankName}
      </Button>
    </Card>
  );
}

function CareerMoves() {
  const { view, send, meta } = useView();
  const [sectors, setSectors] = useState<Industry[]>(['fintech']);
  const [check, setCheck] = useState(amountInput(Math.round(view.market.costOfLiving * 2)));
  if (view.me.role !== 'founder' && view.companies.some((c) => c.status === 'active')) return null;
  return (
    <Card title="Career moves">
      {view.me.role === 'founder' ? (
        <>
          <p className="small muted">
            Founder → investor: needs a year of living costs in savings.
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
                {i.label}
              </button>
            ))}
          </div>
          <Field label="Typical cheque">
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
                (r: { message: string }) => r.message,
              )
            }
          >
            Become an angel
          </Button>
        </>
      ) : (
        <>
          <p className="small muted">Investor → founder: start a company any time.</p>
          <FoundCompany />
        </>
      )}
    </Card>
  );
}

export function FoundCompany() {
  const { view, send, meta } = useView();
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
  const [industry, setIndustry] = useState<Industry>('saas');
  const [model, setModel] = useState<RevenueModel>('subscription');
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
        label="Company name"
        hint={check && !check.ok ? <span className="bad">{check.reason}</span> : undefined}
      >
        {(id) => (
          <input id={id} value={name} maxLength={32} onChange={(e) => verify(e.target.value)} />
        )}
      </Field>
      <Field label="Idea in one line">
        {(id) => (
          <input id={id} value={idea} maxLength={120} onChange={(e) => setIdea(e.target.value)} />
        )}
      </Field>
      <div className="grid2">
        <Field label="Industry">
          {(id) => (
            <select
              id={id}
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
            >
              {meta?.industries.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Model">
          {(id) => (
            <select
              id={id}
              value={model}
              onChange={(e) => setModel(e.target.value as RevenueModel)}
            >
              {meta?.revenueModels.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Button
        disabled={!check?.ok || idea.trim().length < 5}
        onClick={() =>
          void send(
            {
              type: 'company.found',
              company: { name, idea, industry, revenueModel: model, incorporation: 'local' },
            },
            `${name} is open for business.`,
          )
        }
      >
        Start the company
      </Button>
    </div>
  );
}

function People() {
  const { view } = useView();
  return (
    <>
      <Chats />
      <Card title={`Players in ${view.market.name}`}>
        {view.players.length === 0 ? (
          <Empty>You’re early. More players arrive as markets open.</Empty>
        ) : (
          <ul className="list">
            {view.players.map((p) => (
              <li key={p.id}>
                <span className="item-title">{p.name}</span>{' '}
                <span className="small muted">
                  @{p.handle} · {p.role} · {p.stars.toFixed(1)}★
                  {p.trust !== 0 ? ` · trust ${p.trust > 0 ? '+' : ''}${p.trust}` : ''}
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

function Settings() {
  const { view, lite, setLite, refresh, toast, meta } = useView();
  return (
    <>
      <Card title="Data saver">
        <label className="row">
          <input type="checkbox" checked={lite} onChange={(e) => setLite(e.target.checked)} /> Lite
          mode: no charts, no live connection (refreshes every minute)
        </label>
      </Card>
      <Card title="Where the numbers come from">
        <p className="small muted">
          Real data sets the conditions; the simulation decides outcomes.
        </p>
        <ul className="list small">
          {view.market.sources.map((s) => (
            <li key={s.input}>
              {s.input}: {s.source} <span className="muted">({s.refresh})</span>
            </li>
          ))}
        </ul>
        <p className="small muted">
          Tax: corporate {Math.round(view.market.tax.corporate * 100)}%, income{' '}
          {Math.round(view.market.tax.personalIncome * 100)}%, capital gains{' '}
          {Math.round(view.market.tax.capitalGains * 100)}% (simplified). Deposit insurance{' '}
          {money(view.market.depositInsurance, view.market.currency)}.
        </p>
      </Card>
      <Card title="Account">
        <div className="stack">
          <Button variant="ghost" onClick={() => void api.logout().then(refresh)}>
            Sign out
          </Button>
          <Confirm
            label="Delete my account"
            confirmLabel="Delete forever"
            onConfirm={() =>
              void api.deleteAccount().then(() => {
                toast('Account deleted.', 'ok');
                return refresh();
              })
            }
          />
          <p className="small muted">
            We keep the minimum: a hashed phone number, your handle and your market. Deleting
            removes your personal data and chats; your past deals stay in the world anonymously.
          </p>
        </div>
      </Card>
      <p className="disclaimer">{meta?.disclaimer}</p>
    </>
  );
}
