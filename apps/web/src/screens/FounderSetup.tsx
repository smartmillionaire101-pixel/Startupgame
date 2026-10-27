/**
 * Founder setup (player feedback: "like the bank, when setting up I should
 * be asked how much I want to put in"). The banker's licence journey, for a
 * new founder: one step at a time, nothing hidden.
 *
 *   1 Idea & industry → 2 Register → 3 Fund → 4 Plan & pitch → 5 Office
 *
 * The engine holds each step (`company.setup`, setup.ts); funding reuses the
 * game's own commands: `company.contribute` for your own money,
 * `accelerator.apply` / `grant.apply` for the city's schemes and
 * `company.loan` for startup loans from city lenders and player banks. The
 * plan's checks run here as you type with the engine's own rules
 * (`setupPlanChecks`). A banker player reads a startup loan application on
 * their desk (`StartupApplications`) and approves, counters or declines.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { setupPlanChecks } from '@runway/engine';
import type { Command, SetupCheck, SetupPlanFields } from '@runway/engine';
import { amountInput, money, parseAmount } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company, type Deal } from '../store';
import { Button, Card, Field, Pill, Segmented } from '../ui';
import { districtName, monthlyPayment } from '../city/wave10';
import './founderguide.css';
import './setup.css';

type Setup = NonNullable<Company['setup']>;
type Level = 'good' | 'warn' | 'bad';
type StepId = Setup['steps'][number]['id'];

/** A loan the founder means to ask for, sent with the plan. */
export type LoanPick =
  | { kind: 'lender'; lenderId: string; productId: string; amount: number; months: number }
  | { kind: 'bank'; bankId: string; amount: number; months: number };

const stepName = (id: StepId) =>
  ({
    idea: t('Idea & industry'),
    register: t('Register'),
    fund: t('Fund it'),
    plan: t('Plan & pitch'),
    office: t('Office'),
  })[id];

const levelIcon = (l: Level) => (l === 'good' ? '✓' : l === 'warn' ? '!' : '✕');
const months1 = (n: number) => (n < 0 ? '∞' : String(Math.round(n * 10) / 10));

/** One check row in the plan's style: icon, title, the figures, the number on the right. */
function CheckRow({
  level,
  title,
  text,
  figure,
  id,
}: {
  level: Level;
  title: string;
  text: string;
  figure?: string;
  id: string;
}) {
  return (
    <li className={`fg-check fg-check-${level} fsu-check`} data-setup-check={id} data-level={level}>
      <span className="fg-check-icon" aria-hidden="true">
        {levelIcon(level)}
      </span>
      <span className="fsu-check-main">
        <b>{title}</b> <span className="small">{text}</span>
      </span>
      {figure && <span className={`fsu-check-fig fsu-${level}`}>{figure}</span>}
    </li>
  );
}

// ---------------------------------------------------------------- the plan's checks, in words

const checkTitle = (id: SetupCheck['id']) =>
  ({
    price: t('Price vs what they pay'),
    margin: t('Margin'),
    breakEven: t('Break-even'),
    runway: t('Runway'),
    understanding: t('Customer understanding'),
    repayment: t('Repayment'),
  })[id];

export function setupCheckText(c: SetupCheck, cur: string): string {
  const v = c.values;
  const m = (k: string) => money(v[k] ?? 0, cur);
  switch (c.id) {
    case 'price':
      return c.level === 'bad'
        ? t('Customers spend up to {budget} a month on tools like this; {price} is well over it.', {
            budget: m('budget'),
            price: m('price'),
          })
        : t('Customers spend up to {budget} a month on tools like this; you ask {price}.', {
            budget: m('budget'),
            price: m('price'),
          });
    case 'margin':
      return t('You keep {margin} of every {price}.', { margin: m('margin'), price: m('price') });
    case 'breakEven':
      return (v.need ?? 0) <= 0
        ? t('Each customer costs more to serve than they pay.')
        : t(
            'You need {need} paying customers to cover {costs} a month; the plan has {plan} by month 6.',
            {
              need: v.need ?? 0,
              costs: m('costs'),
              plan: v.plan ?? 0,
            },
          );
    case 'runway':
      return (v.real ?? 0) < 0
        ? t('At these costs the money doesn’t run out.')
        : c.level === 'good'
          ? t('Your money plus the ask lasts {real} months; you say {claimed}.', {
              real: months1(v.real ?? 0),
              claimed: v.claimed ?? 0,
            })
          : t(
              'Your money plus the ask lasts {real} months, not {claimed}. Say {say}, or ask {ask}.',
              {
                real: months1(v.real ?? 0),
                claimed: v.claimed ?? 0,
                say: v.sayMonths ?? 0,
                ask: m('askFor'),
              },
            );
    case 'understanding':
      return c.level === 'good'
        ? t('You know what your customers need ({have} points).', { have: v.have ?? 0 })
        : t(
            'You have spoken to few customers. Lenders like {need} points or more before lending.',
            {
              need: v.need ?? 0,
            },
          );
    case 'repayment':
      return (v.pay ?? 0) <= 0
        ? t('No loan repayments.')
        : t('Loan repayments are {pay} a month: {pct}% of monthly costs.', {
            pay: m('pay'),
            pct: v.pct ?? 0,
          });
  }
}

const checkFigure = (c: SetupCheck): string => {
  const v = c.values;
  switch (c.id) {
    case 'price':
    case 'margin':
    case 'repayment':
      return `${v.pct ?? 0}%`;
    case 'breakEven':
      return `${v.plan ?? 0}/${v.need ?? 0}`;
    case 'runway':
      return t('{n} mo', { n: months1(v.real ?? 0) });
    case 'understanding':
      return t('{have} of {need} points', { have: v.have ?? 0, need: v.need ?? 0 });
  }
};

/** What to do about a weak check (on a lender's decision). */
export function setupFix(c: SetupCheck, cur: string, restAfter = 0): string {
  const v = c.values;
  switch (c.id) {
    case 'price':
      return t('Fix: price nearer what customers pay ({budget}).', {
        budget: money(v.budget ?? 0, cur),
      });
    case 'margin':
      return t('Fix: cut the cost to serve or raise the price.');
    case 'breakEven':
      return restAfter > 0
        ? t('Fix: the rest comes at {n} paying customers.', { n: restAfter })
        : t('Fix: plan more customers or lower the monthly costs.');
    case 'runway':
      return t('Fix: say {say} months, or ask for {ask}.', {
        say: v.sayMonths ?? 0,
        ask: money(v.askFor ?? 0, cur),
      });
    case 'understanding':
      return t('Fix: interview customers (Company → Sales, discovery meetings).');
    case 'repayment':
      return t('Fix: borrow less, or over a longer term.');
  }
}

export function SetupChecks({ checks, cur }: { checks: SetupCheck[]; cur: string }) {
  return (
    <ul className="fg-checks" aria-label={t('Checks')}>
      {checks.map((c) => (
        <CheckRow
          key={c.id}
          id={c.id}
          level={c.level}
          title={checkTitle(c.id)}
          text={setupCheckText(c, cur)}
          figure={checkFigure(c)}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the tracker

const nextLine = (s: Setup, cur: string, at: Setup['step'] = s.step) => {
  const fee = s.types.find((x) => x.id === 'local')?.fee ?? 0;
  switch (at) {
    case 'register':
      return t('Next: pick the company type and pay the registry fee ({fee}). Takes {h}h.', {
        fee: money(fee, cur),
        h: s.hours.register,
      });
    case 'fund':
      return t('Next: put money in. Your own, a scheme or a startup loan.');
    case 'plan':
      return t('Next: lenders read your plan. Then choose an office.');
    case 'office':
      return t('Next: where will you work? Rent starts when you choose.');
    default:
      return '';
  }
};

export function SetupTracker({
  c,
  setup,
  idea,
  planning,
}: {
  c?: Company;
  setup?: Setup;
  /** No company yet: step 1 is current. */
  idea?: boolean;
  /** Writing the plan for a loan from the funding step: "Plan & pitch" is where you are. */
  planning?: boolean;
}) {
  const { view } = useView();
  const steps: { id: StepId; status: string }[] = (
    setup?.steps ?? [
      { id: 'idea', status: 'current' },
      { id: 'register', status: 'upcoming' },
      { id: 'fund', status: 'upcoming' },
      { id: 'plan', status: 'upcoming' },
      { id: 'office', status: 'upcoming' },
    ]
  ).map((x) =>
    !planning || x.status === 'done' || x.status === 'skipped'
      ? x
      : x.id === 'plan'
        ? { ...x, status: 'current' }
        : x.status === 'current'
          ? { ...x, status: 'upcoming' }
          : x,
  );
  const done =
    setup?.step === 'done'
      ? 5
      : steps.filter((x) => x.status !== 'current' && x.status !== 'upcoming').length;
  const current = steps.findIndex((x) => x.status === 'current');
  return (
    <Card
      className="fsu-tracker"
      title={
        <>
          <span aria-hidden="true">🚀</span> {t('Start your company')}
        </>
      }
      sub={
        c
          ? t('{company} · {industry} · {city}', {
              company: c.name,
              industry: tx(c.industryLabel),
              city: view.market.name,
            })
          : view.market.name
      }
      action={
        current >= 0 && (
          <Pill tone="info">{t('Step {n} of {total}', { n: current + 1, total: 5 })}</Pill>
        )
      }
    >
      <div data-setup-step={setup?.step ?? 'idea'}>
        <ol className="fsu-chips" aria-label={t('Setup steps')}>
          {steps.map((x) => (
            <li
              key={x.id}
              className={`fsu-chip fsu-chip-${x.status}`}
              data-step={x.id}
              data-status={x.status}
              aria-current={x.status === 'current' ? 'step' : undefined}
            >
              {x.status === 'done' || x.status === 'skipped' ? '✓ ' : ''}
              {stepName(x.id)}
            </li>
          ))}
        </ol>
        <h3 className="fg-count">{t('Setup: {n} of 5 done', { n: done })}</h3>
        <div
          className="fg-bar"
          role="progressbar"
          aria-label={t('Setup progress')}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={done}
        >
          <span style={{ width: `${done * 20}%` }} />
        </div>
        <p className="small muted">
          {idea
            ? t('Next: pick an idea at the café, or name your company below.')
            : setup &&
              nextLine(setup, c?.currency ?? view.market.currency, planning ? 'plan' : setup.step)}
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 2: register

function RegisterStep({ c, s }: { c: Company; s: Setup }) {
  const { send, view } = useView();
  const cur = c.currency;
  const [type, setType] = useState<'local' | 'uk' | 'us'>('local');
  const pick = s.types.find((x) => x.id === type)!;
  const share = s.savings > 0 ? Math.round((pick.fee / s.savings) * 100) : 100;
  const label = (id: string) =>
    ({ local: t('Local entity'), uk: t('UK Ltd'), us: t('US-style holding company') })[id] ?? id;
  const blurb = (id: string) =>
    ({
      local: t('Cheapest and fastest. Fine for grants, local loans and local angels.'),
      uk: t('Easier for foreign investors.'),
      us: t('What US funds expect at Series A.'),
    })[id] ?? '';
  return (
    <Card title={t('2 · Register the company')} action={<Pill>{t('Not filed')}</Pill>}>
      <div className="stack" data-setup-register="">
        <div className="fsu-label">{t('Company name')}</div>
        <div className="fsu-name">
          <b>{c.name}</b>
          <span className="good small">
            ✓ {t('Reserved in {city}', { city: view.market.name })}
          </span>
        </div>
        <div className="fsu-label">{t('Company type')}</div>
        <div className="fsu-options" role="radiogroup" aria-label={t('Company type')}>
          {s.types.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={type === x.id}
              className={`fsu-option${type === x.id ? ' is-on' : ''}`}
              data-type={x.id}
              onClick={() => setType(x.id as typeof type)}
            >
              <span className="fsu-option-main">
                <b>{label(x.id)}</b>
                <span className="small muted">{blurb(x.id)}</span>
                {x.investorAppeal > 0 && (
                  <span className="small good">
                    {t('+{n}% investor appeal', { n: Math.round(x.investorAppeal * 100) })}
                  </span>
                )}
              </span>
              <span className="fsu-option-side">
                <b>{money(x.fee, cur)}</b>
                <span className="small muted">{t('one-off')}</span>
              </span>
            </button>
          ))}
        </div>
        <ul className="fg-checks">
          <CheckRow
            id="fee"
            level={share <= 10 ? 'good' : share <= 30 ? 'warn' : 'bad'}
            title={t('Fee vs savings')}
            text={t('The fee is {pct}% of your savings ({savings}).', {
              pct: share,
              savings: money(s.savings, cur),
            })}
            figure={`${share}%`}
          />
          {type !== 'us' && (
            <CheckRow
              id="investors"
              level="warn"
              title={t('Investors later')}
              text={t(
                'A US holding adds appeal at Series A; you can re-register later for the difference.',
              )}
            />
          )}
        </ul>
        <p className="spread small">
          <span className="muted">{t('From your savings')}</span>
          <b>
            {money(pick.fee, cur)} · {t('{n}h', { n: s.hours.register })}
          </b>
        </p>
        <Button
          block
          disabled={s.savings < pick.fee}
          onClick={() =>
            void send(
              { type: 'company.setup', companyId: c.id, action: 'register', incorporation: type },
              (r: { message?: string } | null) => (r?.message ? tx(r.message) : null),
            )
          }
        >
          {t('Register {company} ({fee})', { company: c.name, fee: money(pick.fee, cur) })}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 3: fund

function OwnMoney({
  c,
  s,
  amount,
  setAmount,
}: {
  c: Company;
  s: Setup;
  amount: number;
  setAmount: (n: number) => void;
}) {
  const { send } = useView();
  const cur = c.currency;
  const [as, setAs] = useState<'equity' | 'loan'>('equity');
  const max = Math.max(0, s.savings);
  const step = Math.max(1, Math.round(max / 200));
  const keep = max - amount;
  const living = keep > 0 && s.livingCost > 0 ? Math.round((keep / s.livingCost) * 10) / 10 : 0;
  const inCompany = s.own.equity + s.own.loan;
  return (
    <Card title={t('3a · Your own money')} action={<Pill tone="good">{t('Founder capital')}</Pill>}>
      <div className="stack" data-setup-own="">
        <div className="spread">
          <b className="fsu-big" data-own-amount={amount}>
            {money(amount, cur)}
          </b>
          <span className="small muted">
            {t('of {savings} savings · {pct}%', {
              savings: money(max, cur),
              pct: max > 0 ? Math.round((amount / max) * 100) : 0,
            })}
          </span>
        </div>
        <input
          type="range"
          aria-label={t('Your own money')}
          min={0}
          max={max}
          step={step}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <div className="fsu-scale small muted">
          <span>{money(0, cur)}</span>
          <span className="warn">{t('½ of savings')}</span>
          <span>{money(max, cur)}</span>
        </div>
        <Segmented
          label={t('How you put it in')}
          value={as}
          onChange={setAs}
          options={[
            { value: 'equity', label: t('As shares (equity)') },
            { value: 'loan', label: t('As a loan to the company') },
          ]}
        />
        <ul className="fg-checks">
          <CheckRow
            id="living"
            level={living >= 6 ? 'good' : living >= 3 ? 'warn' : 'bad'}
            title={t('Living costs')}
            text={t('You keep {keep}: {n} months of living costs ({cost} a month).', {
              keep: money(keep, cur),
              n: living,
              cost: money(s.livingCost, cur),
            })}
            figure={t('{n} mo', { n: living })}
          />
        </ul>
        {inCompany > 0 && (
          <p className="small" data-own-in="">
            {t('In the company so far: {equity} as shares, {loan} as a loan.', {
              equity: money(s.own.equity, cur),
              loan: money(s.own.loan, cur),
            })}
          </p>
        )}
        <Button
          variant="secondary"
          block
          disabled={amount <= 0}
          onClick={async () => {
            const r = await send(
              { type: 'company.contribute', companyId: c.id, amount, as },
              t('{amount} is in {company}.', { amount: money(amount, cur), company: c.name }),
            );
            if (r) setAmount(0);
          }}
        >
          {t('Put {amount} into {company}', { amount: money(amount, cur), company: c.name })}
        </Button>
      </div>
    </Card>
  );
}

function Schemes({ c }: { c: Company }) {
  const { view, send } = useView();
  const cur = c.currency;
  const accelerators = view.market.accelerators ?? [];
  const grants = (view.market.devPartners ?? []).flatMap((p) =>
    p.programs.map((g) => ({ partner: p, g })),
  );
  const apply = (cmd: Command) =>
    void send(cmd, (r: { message?: string } | null) =>
      r?.message ? tx(r.message) : t('Applied.'),
    );
  if (!accelerators.length && !grants.length) return null;
  return (
    <Card
      title={t('3b · Startup schemes')}
      sub={t('{city} · decided at month end', { city: view.market.name })}
    >
      <ul className="fsu-list" data-setup-schemes="">
        {accelerators.map((a) => {
          const you = a.you.find((y) => y.companyId === c.id);
          const status = you?.status ?? 'ineligible';
          return (
            <li
              key={a.id}
              className={`fsu-row${status === 'ineligible' ? ' is-off' : ''}`}
              data-scheme={a.id}
            >
              <span className="fsu-row-main">
                <b>{a.name}</b>
                <span className="small muted">
                  {t('Accelerator · {seats} seats', { seats: a.cohort.seats })}
                </span>
                {status === 'ineligible' || status === 'rejected' ? (
                  <span className="small bad">✕ {tx(you?.reason ?? '')}</span>
                ) : status === 'applied' ? (
                  <span className="small">{t('Applied: the answer comes at month end.')}</span>
                ) : status === 'accepted' || status === 'alumni' ? (
                  <span className="small good">✓ {t('You’re in.')}</span>
                ) : (
                  <span className="small good">✓ {t('You can apply now.')}</span>
                )}
              </span>
              <span className="fsu-row-side">
                <b>{money(a.check, cur)}</b>
                <span className="small muted">
                  {t('for {pct}% (SAFE)', { pct: a.equityBps / 100 })}
                </span>
                {status === 'eligible' && (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() =>
                      apply({ type: 'accelerator.apply', acceleratorId: a.id, companyId: c.id })
                    }
                  >
                    {t('Apply')}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
        {grants.map(({ partner, g }) => {
          const you = g.you.find((y) => y.companyId === c.id);
          const status = you?.status ?? 'ineligible';
          return (
            <li
              key={`${partner.id}:${g.id}`}
              className={`fsu-row${status === 'ineligible' ? ' is-off' : ''}`}
              data-scheme={g.id}
            >
              <span className="fsu-row-main">
                <b>{tx(g.label)}</b>
                <span className="small muted">
                  {t('{partner} · no equity', { partner: partner.name })}
                </span>
                {status === 'ineligible' || status === 'rejected' ? (
                  <span className="small bad">✕ {tx(you?.reason ?? '')}</span>
                ) : status === 'applied' ? (
                  <span className="small">{t('Applied: the answer comes at month end.')}</span>
                ) : status === 'awarded' ? (
                  <span className="small good">✓ {t('Awarded.')}</span>
                ) : (
                  <span className="small good">✓ {t('You can apply now.')}</span>
                )}
              </span>
              <span className="fsu-row-side">
                <b>
                  {money(g.amount[0], cur)}–{money(g.amount[1], cur)}
                </b>
                <span className="small muted">{t('grant')}</span>
                {status === 'eligible' && (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() =>
                      apply({
                        type: 'grant.apply',
                        partnerId: partner.id,
                        programId: g.id,
                        companyId: c.id,
                      })
                    }
                  >
                    {t('Apply')}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** The rate and term a picked loan costs. */
function loanCost(view: ReturnType<typeof useView>['view'], s: Setup, p: LoanPick | null) {
  if (!p) return { rateBps: 0, monthly: 0 };
  if (p.kind === 'lender') {
    const l = s.loans.find((x) => x.lenderId === p.lenderId && x.productId === p.productId);
    const rateBps = l?.rateBps ?? 0;
    return { rateBps, monthly: monthlyPayment(p.amount, rateBps, p.months) };
  }
  const b = view.market.banks.find((x) => x.id === p.bankId);
  const rateBps = view.market.baseRateBps + Math.round((b?.loanSpreadPp ?? 0) * 100);
  return { rateBps, monthly: monthlyPayment(p.amount, rateBps, p.months) };
}

function StartupLoans({
  c,
  s,
  pick,
  setPick,
}: {
  c: Company;
  s: Setup;
  pick: LoanPick | null;
  setPick: (p: LoanPick | null) => void;
}) {
  const { view } = useView();
  const cur = c.currency;
  const banks = view.market.banks.filter((b) => b.lends.companies);
  const [amount, setAmount] = useState(pick ? amountInput(pick.amount) : '');
  const [months, setMonths] = useState(String(pick?.months ?? 24));
  const choose = (p: LoanPick) => {
    setAmount(amountInput(p.amount));
    setMonths(String(p.months));
    setPick(p);
  };
  const update = (a: string, m: string) => {
    setAmount(a);
    setMonths(m);
    const v = parseAmount(a);
    const n = Number(m);
    if (pick && v && v > 0 && n >= 3 && n <= 60) setPick({ ...pick, amount: v, months: n });
  };
  const cost = loanCost(view, s, pick);
  const share = s.runway.monthly > 0 ? Math.round((cost.monthly / s.runway.monthly) * 100) : 0;
  const isPick = (p: LoanPick) =>
    !!pick &&
    pick.kind === p.kind &&
    (p.kind === 'lender'
      ? pick.kind === 'lender' && pick.lenderId === p.lenderId && pick.productId === p.productId
      : pick.kind === 'bank' && pick.bankId === p.bankId);
  const lenders = s.loans.filter((l) => l.startup || l.reason);
  return (
    <Card
      title={t('3c · Startup loans')}
      sub={t('Your credit score: {score} · {defaults} defaults', {
        score: s.credit,
        defaults: s.defaults,
      })}
    >
      <div className="stack" data-setup-loans="">
        <h3 className="fsu-h">{t('City banks')}</h3>
        <ul className="fsu-list">
          {lenders.map((l) => {
            const p: LoanPick = {
              kind: 'lender',
              lenderId: l.lenderId,
              productId: l.productId,
              amount: Math.min(
                l.maxMinor || l.amount[1],
                Math.max(l.amount[0], pick?.amount ?? l.amount[0]),
              ),
              months: Math.min(l.termMonths[1], Math.max(l.termMonths[0], 24)),
            };
            return (
              <li
                key={`${l.lenderId}:${l.productId}`}
                className={`fsu-row${l.eligible ? '' : ' is-off'}${isPick(p) ? ' is-on' : ''}`}
                data-loan={`${l.lenderId}:${l.productId}`}
              >
                <span className="fsu-row-main">
                  <b>{tx(l.label)}</b>
                  <span className="small muted">{l.lenderName}</span>
                  {l.eligible ? (
                    <span className="small good">✓ {t('You qualify. Decided on your plan.')}</span>
                  ) : (
                    <span className="small bad">✕ “{tx(l.reason ?? '')}”</span>
                  )}
                </span>
                <span className="fsu-row-side">
                  <b>{(l.rateBps / 100).toFixed(1).replace(/\.0$/, '')}%</b>
                  <span className="small muted">
                    {t('up to {amount}', { amount: money(l.maxMinor || l.amount[1], cur) })}
                  </span>
                  {l.eligible && (
                    <Button
                      size="sm"
                      variant={isPick(p) ? 'primary' : 'subtle'}
                      aria-pressed={isPick(p)}
                      onClick={() => (isPick(p) ? setPick(null) : choose(p))}
                    >
                      {isPick(p) ? t('Picked') : t('Pick')}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {banks.length > 0 && (
          <>
            <h3 className="fsu-h">{t('Banks run by players')}</h3>
            <ul className="fsu-list">
              {banks.map((b) => {
                const p: LoanPick = {
                  kind: 'bank',
                  bankId: b.id,
                  amount: pick?.amount ?? Math.round(view.market.costOfLiving * 4),
                  months: 18,
                };
                return (
                  <li key={b.id} className={`fsu-row${isPick(p) ? ' is-on' : ''}`} data-bank={b.id}>
                    <span className="fsu-row-main">
                      <b>{t('Startup loan')}</b>
                      <span className="small">
                        <Pill tone="info">{t('Player bank')}</Pill>
                      </span>
                      <span className="small muted">
                        {t('{bank} · run by {owner}', { bank: b.name, owner: b.owner })}
                      </span>
                      <span className="small">
                        {t('{owner} reads your plan and decides. They can counter.', {
                          owner: b.owner,
                        })}
                      </span>
                    </span>
                    <span className="fsu-row-side">
                      <b>{Math.round(view.market.baseRateBps / 100 + b.loanSpreadPp)}%</b>
                      <Button
                        size="sm"
                        variant={isPick(p) ? 'primary' : 'subtle'}
                        aria-pressed={isPick(p)}
                        onClick={() => (isPick(p) ? setPick(null) : choose(p))}
                      >
                        {isPick(p) ? t('Picked') : t('Pick')}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {pick && (
          <>
            <div className="grid2">
              <Field label={t('Amount')}>
                {(id) => (
                  <input
                    id={id}
                    value={amount}
                    inputMode="decimal"
                    onChange={(e) => update(e.target.value, months)}
                  />
                )}
              </Field>
              <Field label={t('Term (months)')}>
                {(id) => (
                  <input
                    id={id}
                    value={months}
                    inputMode="numeric"
                    onChange={(e) => update(amount, e.target.value)}
                  />
                )}
              </Field>
            </div>
            <p className="spread small">
              <span className="muted">{t('Repayment')}</span>
              <b>{t('{amount} a month', { amount: money(cost.monthly, cur) })}</b>
            </p>
            <ul className="fg-checks">
              <CheckRow
                id="repay"
                level={share <= 30 ? 'good' : share <= 50 ? 'warn' : 'bad'}
                title={t('Repayment vs costs')}
                text={t('Repayments are {pct}% of what you spend each month.', { pct: share })}
                figure={`${share}%`}
              />
              {s.customers <= 1 && (
                <CheckRow
                  id="before"
                  level="warn"
                  title={t('Borrowing before customers')}
                  text={t(
                    'Lenders will ask how you pay this back with no customers yet: the plan in step 4.',
                  )}
                />
              )}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function RunwayEstimate({
  c,
  s,
  extra,
  pick,
}: {
  c: Company;
  s: Setup;
  extra: number;
  pick: LoanPick | null;
}) {
  const { view } = useView();
  const cur = c.currency;
  const cost = loanCost(view, s, pick);
  const moneyIn = s.runway.cash + extra + (pick?.amount ?? 0);
  const monthly = s.runway.monthly + cost.monthly;
  const months = monthly > 0 ? Math.round((moneyIn / monthly) * 10) / 10 : -1;
  const goal = s.runway.goal;
  const level: Level = months < 0 || months >= goal ? 'good' : months >= 6 ? 'warn' : 'bad';
  const width = months < 0 ? 100 : Math.min(100, (months / 18) * 100);
  return (
    <Card
      title={t('Runway estimate')}
      action={
        <Pill tone={level === 'good' ? 'good' : level === 'warn' ? 'warn' : 'bad'}>
          {months < 0 ? t('No monthly costs yet') : t('{n} months', { n: months1(months) })}
        </Pill>
      }
    >
      <div className="stack" data-setup-runway={months}>
        <div className="fsu-runway">
          <span className={`fsu-runway-fill fsu-${level}`} style={{ width: `${width}%` }} />
          <span className="fsu-runway-goal" style={{ left: `${(goal / 18) * 100}%` }}>
            <span className="small">{t('{n} mo goal', { n: goal })}</span>
          </span>
        </div>
        <div className="fsu-scale small muted">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>{t('{n} months', { n: 18 })}</span>
        </div>
        <p className="spread small">
          <span className="muted">{t('Money in')}</span>
          <b>{money(moneyIn, cur)}</b>
        </p>
        <p className="spread small">
          <span className="muted">{t('Going out each month')}</span>
          <b>{money(monthly, cur)}</b>
        </p>
        <p className="small">
          {months >= 0 && months < goal
            ? t('{short} months short of {goal}: put more in, add a loan or spend less.', {
                short: months1(goal - months),
                goal,
              })
            : t('Enough for the first year at these costs.')}
        </p>
        <p className="small muted">
          {t(
            'Costs: the cheapest office, the cloud bill and loan repayments (or your plan’s monthly costs, if higher). Nothing is paid until you choose an office.',
          )}
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 4: the plan and the answers

function PlanEditor({
  c,
  s,
  pick,
  onSent,
}: {
  c: Company;
  s: Setup;
  pick: LoanPick | null;
  onSent: () => void;
}) {
  const { view, send } = useView();
  const cur = c.currency;
  const prev = s.plan;
  const [sell, setSell] = useState(prev?.sell ?? c.idea);
  const [segment, setSegment] = useState(
    prev?.segment ?? c.targetSegments[0] ?? s.segments[0]?.key ?? '',
  );
  const [price, setPrice] = useState(amountInput(prev?.price ?? c.price));
  const [cost, setCost] = useState(amountInput(prev?.costToServe ?? Math.round(c.price * 0.12)));
  const [costs, setCosts] = useState(amountInput(prev?.monthlyCosts ?? s.runway.monthly));
  const [customers, setCustomers] = useState(String(prev?.customersMonth6 ?? 20));
  const [ask, setAsk] = useState(amountInput(prev?.ask ?? pick?.amount ?? 0));
  const [months, setMonths] = useState(String(prev?.months ?? 12));
  const loan = loanCost(view, s, pick);
  const seg = s.segments.find((x) => x.key === segment) ?? s.segments[0];
  const fields: SetupPlanFields = {
    sell,
    segment,
    price: parseAmount(price) ?? 0,
    costToServe: parseAmount(cost) ?? 0,
    monthlyCosts: parseAmount(costs) ?? 0,
    customersMonth6: Math.max(0, Math.round(Number(customers) || 0)),
    ask: parseAmount(ask) ?? 0,
    months: Math.max(1, Math.min(60, Math.round(Number(months) || 1))),
  };
  const checks = useMemo(
    () =>
      seg
        ? setupPlanChecks(fields, {
            ...seg.base,
            cash: c.cash,
            ...(pick ? { rateBps: loan.rateBps, termMonths: pick.months } : {}),
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the typed fields are the inputs
    [sell, segment, price, cost, costs, customers, ask, months, c.cash, pick, loan.rateBps, seg],
  );
  const red = checks.some((x) => x.level === 'bad');
  const target = !pick
    ? null
    : pick.kind === 'lender'
      ? s.loans.find((l) => l.lenderId === pick.lenderId && l.productId === pick.productId)
          ?.lenderName
      : view.market.banks.find((b) => b.id === pick.bankId)?.name;
  const submit = async () => {
    const r = await send<{ message?: string }>(
      { type: 'company.setup', companyId: c.id, action: 'plan', plan: fields },
      (x) => (x?.message ? tx(x.message) : null),
    );
    if (!r) return;
    if (pick) {
      const cmd: Command =
        pick.kind === 'lender'
          ? {
              type: 'company.loan',
              companyId: c.id,
              lenderId: pick.lenderId,
              productId: pick.productId,
              amount: pick.amount,
              months: pick.months,
              personalGuarantee: false,
            }
          : {
              type: 'company.loan',
              companyId: c.id,
              bankId: pick.bankId,
              amount: pick.amount,
              months: pick.months,
              personalGuarantee: false,
            };
      await send<{ message?: string }>(cmd, (x) => (x?.message ? tx(x.message) : t('Sent.')));
    }
    onSent();
  };
  const num = (label: string, value: string, set: (v: string) => void, warn?: Level) => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          value={value}
          inputMode="decimal"
          className={warn && warn !== 'good' ? `fsu-input-${warn}` : undefined}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </Field>
  );
  const lvl = (id: SetupCheck['id']) => checks.find((x) => x.id === id)?.level;
  return (
    <Card
      title={t('4 · Business plan')}
      sub={target ? t('For: {lender}', { lender: target }) : undefined}
    >
      <div className="stack" data-setup-plan="">
        <p className="small muted">
          {t('Lenders and banks read the same plan. The checks update as you type.')}
        </p>
        <Field label={t('What you sell')}>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              maxLength={160}
              value={sell}
              onChange={(e) => setSell(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('To whom')}>
          {(id) => (
            <select id={id} value={segment} onChange={(e) => setSegment(e.target.value)}>
              {s.segments.map((x) => (
                <option key={x.key} value={x.key}>
                  {tx(x.name)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid2">
          {num(t('Price / month'), price, setPrice, lvl('price'))}
          {num(t('Cost to serve'), cost, setCost, lvl('margin'))}
          {num(t('Monthly costs'), costs, setCosts)}
          {num(t('Customers, month 6'), customers, setCustomers, lvl('breakEven'))}
          {num(t('The ask'), ask, setAsk, lvl('repayment'))}
          {num(t('Months it lasts'), months, setMonths, lvl('runway'))}
        </div>
        <SetupChecks checks={checks} cur={cur} />
        <Button
          block
          disabled={red || sell.trim().length < 3 || fields.price <= 0}
          onClick={() => void submit()}
        >
          {prev ? t('Send the updated plan') : t('Send the plan')}
        </Button>
        {red && <p className="small muted">{t('Fix the red check to send.')}</p>}
      </div>
    </Card>
  );
}

const outcomeTitle = (o: string) =>
  ({
    approved: t('Approved'),
    conditions: t('Approved with conditions'),
    declined: t('Declined'),
  })[o] ?? o;

const declineReasonText = (r: string) =>
  ({
    'no-customers': t('No customers yet'),
    repayment: t('Repayment too high'),
    'thin-plan': t('Thin plan'),
    credit: t('Credit record'),
    capital: t('Bank capital'),
  })[r] ?? r;

/** The answers: city lenders' decisions and player banks' applications. */
function Decisions({ c, s }: { c: Company; s: Setup }) {
  const { view, send } = useView();
  const cur = c.currency;
  const apps = view.deals.filter((d) => d.application && d.companyId === c.id);
  if (!s.decisions.length && !apps.length) return null;
  const act = (dealId: string, action: 'accept' | 'decline' | 'withdraw') =>
    void send(
      { type: 'deal.act', dealId, action },
      action === 'accept'
        ? t('Accepted: the money is in.')
        : action === 'decline'
          ? t('Declined.')
          : t('Withdrawn.'),
    );
  return (
    <section className="stack" data-setup-decisions="">
      <h2>{t('The answers')}</h2>
      {s.decisions.map((d) => (
        <Card
          key={`${d.lenderId}:${d.productId}`}
          className={`fsu-decision fsu-decision-${d.outcome}`}
          title={outcomeTitle(d.outcome)}
          sub={t('{lender} · {product}', { lender: d.lenderName, product: tx(d.productLabel) })}
          action={
            <Pill
              tone={d.outcome === 'declined' ? 'bad' : d.outcome === 'conditions' ? 'warn' : 'good'}
            >
              {t('{n}/100', { n: d.score })}
            </Pill>
          }
        >
          <div className="stack" data-decision={d.outcome} data-lender={d.lenderId}>
            {d.outcome !== 'declined' && (
              <div className="fsu-tiles">
                <div className="fsu-tile">
                  <span className="fsu-label">{t('Approved')}</span>
                  <b className="fsu-big">{money(d.amount, cur)}</b>
                  <span className="small muted">
                    {t('{rate}% · {n} months', { rate: d.rateBps / 100, n: d.months })}
                  </span>
                </div>
                {d.rest > 0 && (
                  <div className="fsu-tile">
                    <span className="fsu-label">{t('Now')}</span>
                    <b className="fsu-big">{money(d.now, cur)}</b>
                    <span className="small muted">
                      {t('{rest} after {n} customers', {
                        rest: money(d.rest, cur),
                        n: d.restAfterCustomers,
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
            {d.lenderReason && <p className="small bad">✕ “{tx(d.lenderReason)}”</p>}
            {d.reasons.length > 0 && (
              <ul className="fsu-reasons">
                {d.reasons.map((r) => (
                  <li key={r.id} className={`fsu-${r.level}`}>
                    <span>
                      {levelIcon(r.level)} {setupCheckText(r, cur)}
                    </span>
                    <b className="small">
                      {setupFix(r, cur, r.id === 'breakEven' ? d.restAfterCustomers : 0)}
                    </b>
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted">
              {t('Score {n}/100. Approve from 70; with conditions from 55.', { n: d.score })}
            </p>
            {d.dealId && d.dealStatus === 'open' && (
              <div className="row">
                <Button onClick={() => act(d.dealId!, 'accept')}>
                  {t('Accept {amount}', { amount: money(d.now, cur) })}
                </Button>
                <Button variant="ghost" onClick={() => act(d.dealId!, 'decline')}>
                  {t('Decline')}
                </Button>
              </div>
            )}
            {d.dealStatus === 'accepted' && (
              <p className="small good">
                ✓ {t('Taken: {amount} is in the company.', { amount: money(d.now, cur) })}
              </p>
            )}
            {d.outcome === 'declined' && (
              <p className="small">{t('Fix the plan and ask again next month.')}</p>
            )}
          </div>
        </Card>
      ))}
      {apps.map((d) => (
        <BankAnswer key={d.id} d={d} onAct={act} />
      ))}
    </section>
  );
}

function BankAnswer({
  d,
  onAct,
}: {
  d: Deal;
  onAct: (id: string, a: 'accept' | 'decline' | 'withdraw') => void;
}) {
  const cur = d.currency;
  const terms = d.terms.kind === 'loan' ? d.terms : null;
  const countered = d.history.some((h) => h.action === 'counter');
  const tone = d.status === 'accepted' ? 'good' : d.status === 'open' ? 'info' : 'bad';
  return (
    <Card
      className="fsu-decision"
      title={
        d.status === 'accepted'
          ? t('Approved')
          : d.status === 'declined'
            ? t('Declined')
            : d.status === 'open' && d.yourTurn
              ? t('Counter-offer')
              : d.status === 'open'
                ? t('Waiting for the banker')
                : t('Closed')
      }
      sub={t('{bank} · startup loan', { bank: d.counterpartyName })}
      action={<Pill tone={tone}>{terms ? money(terms.amount, cur) : ''}</Pill>}
    >
      <div className="stack" data-bank-answer={d.status} data-deal={d.id}>
        {terms && (
          <p className="small">
            {t('{amount} over {n} months at {rate}%{guarantee}.', {
              amount: money(terms.amount, cur),
              n: terms.months,
              rate: terms.rateBps / 100,
              guarantee: terms.personalGuarantee ? t(', with your personal guarantee') : '',
            })}
          </p>
        )}
        {d.status === 'open' && !d.yourTurn && (
          <p className="small muted">
            {t(
              'The banker reads your plan. No answer by month {n} and it lapses; you can withdraw it any time.',
              {
                n: d.expiresMonth,
              },
            )}
          </p>
        )}
        {d.application?.declineReason && (
          <p className="small bad">✕ {declineReasonText(d.application.declineReason)}</p>
        )}
        {d.status === 'open' && d.yourTurn && (
          <div className="row">
            <Button onClick={() => onAct(d.id, 'accept')}>
              {countered ? t('Accept the counter') : t('Accept')}
            </Button>
            <Button variant="ghost" onClick={() => onAct(d.id, 'decline')}>
              {t('Decline')}
            </Button>
          </div>
        )}
        {d.status === 'open' && !d.yourTurn && (
          <Button variant="ghost" size="sm" onClick={() => onAct(d.id, 'withdraw')}>
            {t('Withdraw')}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 5: the office

const officeName = (id: string) =>
  ({
    home: t('Work from home'),
    cowork: t('Co-working desks'),
    small: t('Small office'),
    shop: t('Shop-front'),
    serviced: t('Serviced office'),
  })[id] ?? id;
const officeIcon = (id: string) =>
  ({ home: '🏠', cowork: '🧑‍💻', small: '🏢', shop: '🏪', serviced: '🏙️' })[id] ?? '🏢';
const tagText = (tag: string) =>
  ({
    'no-room': t('No room to hire'),
    engineers: t('Engineers nearby'),
    customers: t('Customers nearby'),
    noisy: t('Noisy'),
    investors: t('Funds & banks nearby'),
  })[tag] ?? tag;
const leaseText = (n: number) =>
  n <= 0 ? t('no lease') : n === 1 ? t('month-to-month') : t('{n}-month lease', { n });

function OfficeStep({ c, s }: { c: Company; s: Setup }) {
  const { send } = useView();
  const cur = c.currency;
  const [id, setId] = useState<string>(s.offices[1]?.id ?? 'home');
  const o = s.offices.find((x) => x.id === id) ?? s.offices[0]!;
  const now = s.runway.months;
  const costs =
    s.runway.monthly -
    (s.offices.filter((x) => x.id !== 'home').sort((a, b) => a.rent - b.rent)[0]?.rent ?? 0) +
    o.rent;
  const rentPct = costs > 0 ? Math.round((o.rent / costs) * 100) : 0;
  const road = Math.round((o.commute * 2 * 22) / 60);
  return (
    <Card title={t('5 · Where will you work?')}>
      <div className="stack" data-setup-office="">
        <ul className="fsu-offices" role="radiogroup" aria-label={t('Offices')}>
          {s.offices.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                role="radio"
                aria-checked={x.id === id}
                className={`fsu-office${x.id === id ? ' is-on' : ''}`}
                data-office={x.id}
                onClick={() => setId(x.id)}
              >
                <span className="fsu-office-art" aria-hidden="true">
                  {officeIcon(x.id)}
                </span>
                <span className="fsu-office-main">
                  <span className="spread">
                    <b>{officeName(x.id)}</b>
                    <b>{money(x.rent, cur)}</b>
                  </span>
                  <span className="small muted">
                    {x.size > 0
                      ? t('{desks} desks · {size} m² · {lease}', {
                          desks: x.desks,
                          size: x.size,
                          lease: leaseText(x.leaseMonths),
                        })
                      : t('{desks} desks · {lease}', {
                          desks: x.desks,
                          lease: leaseText(x.leaseMonths),
                        })}
                  </span>
                  <span className="small">{districtName(x.district)}</span>
                  <span className="fsu-tags">
                    <span className="fsu-tag">{t('{n} min', { n: x.commute })}</span>
                    {x.tags.map((tag) => (
                      <span key={tag} className="fsu-tag">
                        {tagText(tag)}
                      </span>
                    ))}
                  </span>
                  <span className="small">
                    {t('Runway {from} → {to} months', {
                      from: months1(now),
                      to: months1(x.runwayMonths),
                    })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <ul className="fg-checks">
          <CheckRow
            id="rent"
            level={rentPct <= 30 ? 'good' : rentPct <= 50 ? 'warn' : 'bad'}
            title={t('Rent vs costs')}
            text={t('{office} is {pct}% of your monthly costs.', {
              office: officeName(o.id),
              pct: rentPct,
            })}
            figure={`${rentPct}%`}
          />
          <CheckRow
            id="commute"
            level={road <= 25 ? 'good' : road <= 45 ? 'warn' : 'bad'}
            title={t('Commute')}
            text={
              o.commute > 0
                ? t('{n} min each way: about {h}h a month on the road.', { n: o.commute, h: road })
                : t('No commute.')
            }
            figure={t('{n}h', { n: road })}
          />
        </ul>
        <Button
          block
          onClick={() =>
            void send(
              { type: 'company.setup', companyId: c.id, action: 'office', officeId: o.id as never },
              (r: { message?: string } | null) => (r?.message ? tx(r.message) : null),
            )
          }
        >
          {o.id === 'home'
            ? t('Work from home for now')
            : t('Lease {desks} desks in {district} ({rent}/month)', {
                desks: o.desks,
                district: districtName(o.district),
                rent: money(o.rent, cur),
              })}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void send({ type: 'company.setup', companyId: c.id, action: 'back' })}
        >
          {t('Back to funding')}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- done

function SetupDone({ c, s }: { c: Company; s: Setup }) {
  const { view } = useView();
  const cur = c.currency;
  const loans =
    s.decisions.filter((d) => d.dealStatus === 'accepted').reduce((a, d) => a + d.now, 0) +
    view.deals
      .filter(
        (d) =>
          d.application &&
          d.companyId === c.id &&
          d.status === 'accepted' &&
          d.terms.kind === 'loan',
      )
      .reduce((a, d) => a + ('amount' in d.terms ? d.terms.amount : 0), 0);
  const own = s.own.equity + s.own.loan;
  const typeLabel = (id: string) =>
    ({ local: t('local'), uk: t('UK Ltd'), us: t('US holding') })[id] ?? id;
  const rows: { label: string; value: string }[] = [
    { label: t('Idea'), value: tx(c.industryLabel) },
    ...(s.registered
      ? [
          {
            label: t('Registered · {type}', { type: typeLabel(s.registered.incorporation) }),
            value: money(s.registered.fee, cur),
          },
        ]
      : []),
    {
      label:
        loans > 0
          ? t('Funded · {own} yours + {loans} loans', {
              own: money(own, cur),
              loans: money(loans, cur),
            })
          : t('Funded · {own} yours', { own: money(own, cur) }),
      value: money(c.cash, cur),
    },
    ...(s.plan ? [{ label: t('Plan sent'), value: t('{n}/100', { n: s.plan.score }) }] : []),
    ...(s.office
      ? [
          {
            label:
              s.office.id === 'home'
                ? t('From home')
                : t('{desks} desks, {district}', {
                    desks: s.office.desks,
                    district: districtName(s.office.district),
                  }),
            value: t('{rent}/mo', { rent: money(s.office.rent, cur) }),
          },
        ]
      : []),
  ];
  return (
    <Card
      className="fsu-done"
      title={<>🎉 {t('{company} is open', { company: c.name })}</>}
      sub={t('All 5 steps done')}
    >
      <div className="stack" data-setup-done="">
        <ol className="fsu-chips">
          {s.steps.map((x) => (
            <li key={x.id} className="fsu-chip fsu-chip-done">
              ✓ {stepName(x.id)}
            </li>
          ))}
        </ol>
        <ul className="fsu-summary">
          {rows.map((r) => (
            <li key={r.label}>
              <span>✓ {r.label}</span>
              <b>{r.value}</b>
            </li>
          ))}
        </ul>
        <p className="spread">
          <span className="muted">{t('Runway')}</span>
          <b>
            {s.runway.months < 0
              ? t('No costs yet')
              : t('{n} mo · goal {goal}', { n: months1(s.runway.months), goal: s.runway.goal })}
          </b>
        </p>
        <p className="small muted">{t('Next: interviews, first sales, hiring. See Your stage.')}</p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the whole journey

/** Has the company finished setting up (or never needed to)? */
export const setupOpen = (c: Company) => !!c.setup && c.setup.step !== 'done';
/** The done card shows in the month the setup finished and the next. */
export const setupJustDone = (c: Company, month: number) =>
  !!c.setup &&
  c.setup.step === 'done' &&
  c.setup.doneMonth !== null &&
  month - c.setup.doneMonth <= 1;

export function FounderSetup({ c }: { c: Company }) {
  const { view, send } = useView();
  const s = c.setup!;
  const [own, setOwn] = useState(0);
  const [pick, setPick] = useState<LoanPick | null>(null);
  const [writing, setWriting] = useState(false);
  if (s.step === 'done')
    return setupJustDone(c, view.market.month) ? <SetupDone c={c} s={s} /> : null;
  const next = (to: 'next' | 'back') =>
    void send({ type: 'company.setup', companyId: c.id, action: to });
  const canOffice = c.cash > 0;
  let body: ReactNode = null;
  if (s.step === 'register') body = <RegisterStep c={c} s={s} />;
  else if (s.step === 'fund' && !writing)
    body = (
      <>
        <OwnMoney c={c} s={s} amount={own} setAmount={setOwn} />
        <Schemes c={c} />
        <StartupLoans c={c} s={s} pick={pick} setPick={setPick} />
        <RunwayEstimate c={c} s={s} extra={own} pick={pick} />
        <div className="stack">
          <Button block variant={pick ? 'primary' : 'secondary'} onClick={() => setWriting(true)}>
            {pick ? t('Next: write the plan for the loan') : t('Write a business plan (for loans)')}
          </Button>
          <Button
            block
            variant={pick ? 'secondary' : 'primary'}
            disabled={!canOffice}
            onClick={() => next('next')}
          >
            {t('Next: choose an office')}
          </Button>
          {!canOffice && <p className="small muted">{t('Put money into the company first.')}</p>}
        </div>
      </>
    );
  else if (s.step === 'fund' || s.step === 'plan')
    body = (
      <>
        {s.step === 'plan' && <Decisions c={c} s={s} />}
        {(writing || s.step === 'fund') && (
          <PlanEditor
            c={c}
            s={s}
            pick={pick}
            onSent={() => {
              setWriting(false);
              setPick(null);
            }}
          />
        )}
        {s.step === 'plan' && !writing && (
          <>
            <StartupLoans c={c} s={s} pick={pick} setPick={setPick} />
            {pick && (
              <Button block variant="secondary" onClick={() => setWriting(true)}>
                {t('Send the plan to this lender too')}
              </Button>
            )}
            <RunwayEstimate c={c} s={s} extra={0} pick={null} />
          </>
        )}
        <div className="stack">
          <Button block disabled={!canOffice} onClick={() => next('next')}>
            {t('Next: choose an office')}
          </Button>
          {!canOffice && <p className="small muted">{t('Put money into the company first.')}</p>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (writing && s.step === 'fund' ? setWriting(false) : next('back'))}
          >
            {t('Back to funding')}
          </Button>
        </div>
      </>
    );
  else if (s.step === 'office') body = <OfficeStep c={c} s={s} />;
  return (
    <>
      <SetupTracker c={c} setup={s} planning={writing && s.step === 'fund'} />
      {body}
    </>
  );
}

// ---------------------------------------------------------------- the banker's desk

const bankCheckTitle = (id: string) =>
  ({
    repayment: t('Repayment vs their costs'),
    customers: t('Customers'),
    credit: t('Founder credit'),
    capital: t('Your capital ratio after'),
    single: t('Single borrower'),
  })[id] ?? id;

function bankCheckText(id: string, v: Record<string, number>, cur: string): string {
  switch (id) {
    case 'repayment':
      return t('{pay} on top of {costs}: {pct}% of what they spend.', {
        pay: money(v.pay ?? 0, cur),
        costs: money(v.costs ?? 0, cur),
        pct: v.pct ?? 0,
      });
    case 'customers':
      return t('{paying} paying today; break-even at {need}.', {
        paying: v.paying ?? 0,
        need: v.breakEven ?? 0,
      });
    case 'credit':
      return t('Score {score}, {defaults} defaults; own money at risk.', {
        score: v.score ?? 0,
        defaults: v.defaults ?? 0,
      });
    case 'capital':
      return t('{after}% with this loan (minimum {min}%).', {
        after: v.after ?? 0,
        min: v.min ?? 0,
      });
    case 'single':
      return t('{pct}% of your capital.', { pct: v.pct ?? 0 });
    default:
      return '';
  }
}
const bankCheckFigure = (id: string, v: Record<string, number>) =>
  id === 'customers'
    ? `${v.paying ?? 0}/${v.breakEven ?? 0}`
    : id === 'credit'
      ? String(v.score ?? 0)
      : `${v.pct ?? v.after ?? 0}%`;

const DECLINE_REASONS = ['no-customers', 'repayment', 'thin-plan', 'credit', 'capital'] as const;

function ApplicationCard({ d }: { d: Deal }) {
  const { send } = useView();
  const a = d.application!;
  const cur = d.currency;
  const terms = d.terms.kind === 'loan' ? d.terms : null;
  const [amount, setAmount] = useState(amountInput(terms?.amount ?? 0));
  const [months, setMonths] = useState(String(terms?.months ?? 12));
  const [rate, setRate] = useState(String((terms?.rateBps ?? 0) / 100));
  const [guarantee, setGuarantee] = useState(terms?.personalGuarantee ? 'personal' : 'none');
  const [reason, setReason] = useState<(typeof DECLINE_REASONS)[number] | null>(null);
  if (!terms) return null;
  const p = a.plan;
  const cAmount = parseAmount(amount) ?? terms.amount;
  const cMonths = Math.max(3, Math.min(60, Math.round(Number(months) || terms.months)));
  const cRate = Math.round((Number(rate.replace(',', '.')) || terms.rateBps / 100) * 100);
  const cPay = monthlyPayment(cAmount, cRate, cMonths);
  const cPct = p.monthlyCosts > 0 ? Math.round((cPay / p.monthlyCosts) * 100) : 0;
  const changed =
    cAmount !== terms.amount ||
    cMonths !== terms.months ||
    cRate !== terms.rateBps ||
    (guarantee === 'personal') !== terms.personalGuarantee;
  const act = (action: 'accept' | 'decline' | 'counter') =>
    void send(
      action === 'counter'
        ? {
            type: 'deal.act',
            dealId: d.id,
            action,
            terms: {
              amount: cAmount,
              months: cMonths,
              rateBps: cRate,
              personalGuarantee: guarantee === 'personal',
            },
          }
        : action === 'decline'
          ? { type: 'deal.act', dealId: d.id, action, ...(reason ? { reason } : {}) }
          : { type: 'deal.act', dealId: d.id, action },
      action === 'accept'
        ? t('Approved: the loan is paid out.')
        : action === 'counter'
          ? t('Counter sent.')
          : t('Declined.'),
    );
  return (
    <Card
      className="fsu-application"
      title={d.companyName}
      sub={t('Startup loan · arrived month {n} · answer by month {due}', {
        n: d.createdMonth,
        due: d.expiresMonth,
      })}
      action={<Pill tone="info">{d.yourTurn ? t('New') : t('Countered')}</Pill>}
    >
      <div className="stack" data-application={d.id}>
        {a.founder && (
          <p className="small">
            <b>{a.founder.name}</b> {!a.founder.ai && <Pill tone="info">{t('Player')}</Pill>}{' '}
            <span className="muted">
              {t('Founder · {industry} · credit score {score}, {defaults} defaults', {
                industry: tx(a.industryLabel ?? ''),
                score: a.creditScore,
                defaults: a.defaults,
              })}
            </span>
          </p>
        )}
        <div className="fsu-facts small">
          <span className="muted">{t('Asks')}</span>
          <b>{money(terms.amount, cur)}</b>
          <span className="muted">{t('Term')}</span>
          <b>{t('{n} months', { n: terms.months })}</b>
          <span className="muted">{t('Your rate')}</span>
          <b>{terms.rateBps / 100}%</b>
          <span className="muted">{t('Repayment')}</span>
          <b>{t('{amount} a month', { amount: money(a.monthly, cur) })}</b>
        </div>
        <div>
          <b>{t('Their plan')}</b>
          <p className="small" data-plan-text="">
            {p.sell}.{' '}
            {t(
              '{price}/month, {cost} to serve. Costs {costs}/month. {n} customers by month 6. Own money in: {own}.',
              {
                price: money(p.price, cur),
                cost: money(p.costToServe, cur),
                costs: money(p.monthlyCosts, cur),
                n: p.customersMonth6,
                own: money(a.ownMoney, cur),
              },
            )}
            {a.alsoApproved.length > 0 &&
              ` ${t('Also approved: {lenders}.', { lenders: a.alsoApproved.join(', ') })}`}
          </p>
        </div>
        <ul className="fg-checks">
          {a.checks.map((x) => (
            <CheckRow
              key={x.id}
              id={x.id}
              level={x.level}
              title={bankCheckTitle(x.id)}
              text={bankCheckText(x.id, x.values, cur)}
              figure={bankCheckFigure(x.id, x.values)}
            />
          ))}
        </ul>
        <p className="spread small">
          <span className="muted">{t('Interest you’d earn')}</span>
          <b>
            {t('{amount} over {n} months', { amount: money(a.interest, cur), n: terms.months })}
          </b>
        </p>
        {d.yourTurn ? (
          <>
            <h3 className="fsu-h">{t('Your counter')}</h3>
            <div className="grid2">
              <Field label={t('Amount')}>
                {(id) => (
                  <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />
                )}
              </Field>
              <Field label={t('Term (months)')}>
                {(id) => (
                  <input
                    id={id}
                    value={months}
                    inputMode="numeric"
                    onChange={(e) => setMonths(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('Rate (%)')}>
                {(id) => (
                  <input
                    id={id}
                    value={rate}
                    inputMode="decimal"
                    onChange={(e) => setRate(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('Guarantee')}>
                {(id) => (
                  <select id={id} value={guarantee} onChange={(e) => setGuarantee(e.target.value)}>
                    <option value="none">{t('None')}</option>
                    <option value="personal">{t('Personal')}</option>
                  </select>
                )}
              </Field>
            </div>
            <ul className="fg-checks">
              <CheckRow
                id="counter-repay"
                level={cPct <= 30 ? 'good' : cPct <= 50 ? 'warn' : 'bad'}
                title={t('Repayment')}
                text={t('{pay} a month: {pct}% of their costs.', {
                  pay: money(cPay, cur),
                  pct: cPct,
                })}
                figure={`${cPct}%`}
              />
            </ul>
            <p className="small muted">{t('Decline reasons, if you decline:')}</p>
            <div className="fsu-tags" role="group" aria-label={t('Decline reason')}>
              {DECLINE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`fsu-tag fsu-tag-btn${reason === r ? ' is-on' : ''}`}
                  aria-pressed={reason === r}
                  data-reason={r}
                  onClick={() => setReason(reason === r ? null : r)}
                >
                  {declineReasonText(r)}
                </button>
              ))}
            </div>
            <div className="row">
              <Button variant="subtle" onClick={() => act('accept')}>
                {t('Approve {amount}', { amount: money(terms.amount, cur) })}
              </Button>
              <Button disabled={!changed} onClick={() => act('counter')}>
                {t('Send counter')}
              </Button>
              <Button variant="ghost" onClick={() => act('decline')}>
                {t('Decline')}
              </Button>
            </div>
          </>
        ) : (
          <p className="small muted">{t('Waiting for the founder to answer your counter.')}</p>
        )}
      </div>
    </Card>
  );
}

/** Startup loan applications at your bank, on the banker's desk. */
export function StartupApplications({ bankId }: { bankId: string }) {
  const { view } = useView();
  const apps = view.deals.filter(
    (d) =>
      d.application &&
      d.status === 'open' &&
      ((d.counterparty.kind === 'playerbank' && d.counterparty.id === bankId) ||
        (d.proposer.kind === 'playerbank' && d.proposer.id === bankId)),
  );
  if (!apps.length) return null;
  return (
    <section className="stack" data-startup-applications="">
      <h2>{t('Startup loan applications')}</h2>
      {apps.map((d) => (
        <ApplicationCard key={d.id} d={d} />
      ))}
    </section>
  );
}

/** Deals the application cards already show (kept out of the plain deal list). */
export const isOpenApplication = (d: Deal) => !!d.application && d.status === 'open';
