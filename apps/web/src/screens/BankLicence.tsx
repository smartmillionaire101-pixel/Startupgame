/**
 * Bankers (the engine's bankers.ts): founding a bank is work, not a wait.
 *
 * - Negotiate: the investor groups' offers side by side, the levers (your
 *   capital, a smaller bank, voting shares, performance shares, co-founders)
 *   and what you'd own and control if you signed now.
 * - The licence: a tracker ("Review: day N of 30") and a checklist (the
 *   Central Bank interview, a business plan with live checks, key hires, a
 *   core banking system and a branch), then pre-opening clients after
 *   approval in principle, and the regulator's decision with its reasons.
 * - The banker's first session, and the interview itself (at the Central Bank).
 */
import './bankers.css';
import { useState } from 'react';
import {
  bankPlanChecks,
  type BankPlanInput,
  type PlanCheck,
  type PlayerView,
} from '@runway/engine';
import { amountInput, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useNav } from '../phone/bus';
import { useView } from '../store';
import { Button, Card, Field, Pill, Stat } from '../ui';

export type BankerView = NonNullable<PlayerView['banker']>;
type BankerBank = NonNullable<BankerView['bank']>;
type Forming = NonNullable<BankerBank['forming']>;
type Licence = NonNullable<BankerBank['licence']>;
type Offer = Forming['offers'][number];
type Plan = NonNullable<Licence['plan']>;

/** The banker view, or null (other servers, old worlds). */
export const bankerOf = (view: PlayerView): BankerView | null =>
  (view as { banker?: BankerView | null }).banker ?? null;

const bps = (x: number) => pct(x / 10_000, 1);

// ---------------------------------------------------------------- copy

const typeLabel = (id: string) =>
  ({
    commercial: t('Commercial bank'),
    investment: t('Investment bank'),
    'venture-debt': t('Venture debt lender'),
    microfinance: t('Microfinance bank'),
  })[id] ?? id;

const styleLabel = (s: Offer['style']) =>
  ({
    capital: t('More capital'),
    control: t('More control for you'),
    strategic: t('A board seat and help'),
  })[s];

const askLabel = (a: string) =>
  ({
    price: t('Ask for a better price'),
    seat: t('Ask for one board seat fewer'),
    voting: t('Ask them to take non-voting shares'),
  })[a] ?? a;

type Ask = 'price' | 'seat' | 'voting';

/** An ask in the counter menu, with whether that group would likely agree today. */
const askOption = (f: Forming, id: string, ask: Ask) =>
  f.counterOdds[id]?.[ask]
    ? t('{ask} (likely yes)', { ask: askLabel(ask) })
    : t('{ask} (likely no)', { ask: askLabel(ask) });

/** Your standing in plain words: what you're strong enough to ask for, and what not yet. */
function counterSummary(f: Forming): string {
  const odds = Object.values(f.counterOdds);
  const any = (ask: Ask) => odds.some((o) => o[ask]);
  const name = (ask: Ask) =>
    ({ price: t('a better price'), seat: t('a seat fewer'), voting: t('non-voting shares') })[ask];
  const yes = (['price', 'seat', 'voting'] as const).filter(any).map(name);
  const no = (['price', 'seat', 'voting'] as const).filter((a) => !any(a)).map(name);
  const list = (xs: string[]) =>
    xs.length > 1
      ? t('{some} and {last}', { some: xs.slice(0, -1).join(', '), last: xs.at(-1)! })
      : xs.join('');
  if (!yes.length)
    return t('Not strong enough yet to ask for {asks}: put in more of your own money first.', {
      asks: list(no),
    });
  if (!no.length) return t('Strong enough to ask for {asks}.', { asks: list(yes) });
  return t('Strong enough to ask for {yes}; not yet for {no}.', { yes: list(yes), no: list(no) });
}

const roleLabel = (r: string) =>
  ({
    ceo: t('Chief executive'),
    cro: t('Chief Risk Officer'),
    compliance: t('Compliance officer'),
    aml: t('Anti-money-laundering officer'),
  })[r] ?? r;

export const missingLabel = (id: string) =>
  id.startsWith('hire.')
    ? t('Hire: {role}', { role: roleLabel(id.slice(5)) })
    : ({
        interview: t('Fit-and-proper interview at the Central Bank'),
        plan: t('Business plan'),
        system: t('Core banking system'),
        branch: t('A first branch'),
      }[id] ?? id);

const segmentLabel = (id: string) =>
  ({
    households: t('Households'),
    'small-business': t('Small businesses'),
    corporates: t('Large companies'),
    startups: t('Startups'),
    unbanked: t('People without a bank'),
  })[id] ?? id;

const productLabel = (id: string) =>
  ({
    'current-accounts': t('Current accounts'),
    savings: t('Savings accounts'),
    'personal-loans': t('Personal loans'),
    mortgages: t('Mortgages'),
    'sme-loans': t('Small business loans'),
    'micro-loans': t('Micro-loans'),
    'venture-loans': t('Venture loans'),
    'trade-finance': t('Trade finance'),
    advisory: t('Deal advisory'),
  })[id] ?? id;

const systemLabel = (id: string) =>
  ({ basic: t('Basic'), standard: t('Standard'), premium: t('Premium') })[id] ?? id;

/** Why the regulator refused or attached conditions, and what fixes it. */
const reasonText = (id: string) =>
  ({
    capital: t('Capital is below the minimum: add capital.'),
    credit: t('Your credit record is weak: clear defaults and debts.'),
    interview: t('The fit-and-proper interview was weak: book another and answer again.'),
    plan: t('The business plan has weak spots: revise it.'),
    people: t('The key people are not strong enough: hire stronger candidates.'),
    systems: t('The core banking system is not reliable enough: choose a better one.'),
    lapsed: t('The checklist wasn’t finished in time: finish it and the review runs again.'),
  })[id] ?? id;

/** One plan check in words, with its figures. */
function checkText(c: PlanCheck, cur: string): string {
  const v = c.values;
  switch (c.id) {
    case 'fit':
      return v.misfits
        ? t('{n} of your choices don’t fit this licence.', { n: v.misfits ?? 0 })
        : t('Customers and products fit your licence.');
    case 'capital':
      return t('Year 3 lending {lending} vs {capacity} your capital can carry at the 10% rule.', {
        lending: money(v.lending ?? 0, cur),
        capacity: money(v.capacity ?? 0, cur),
      });
    case 'growth':
      return t('Steady growth: year 1 at most {cap} (you plan {y1}).', {
        cap: money(v.firstYearCap ?? 0, cur),
        y1: money(v.y1 ?? 0, cur),
      });
    case 'funding':
      return t('Deposits and capital fund {funding}; you plan to lend {lending}.', {
        funding: money(v.funding ?? 0, cur),
        lending: money(v.lending ?? 0, cur),
      });
    case 'opex':
      return t('Year 3 costs {costs} vs income {income}.', {
        costs: money(v.costs ?? 0, cur),
        income: money(v.income ?? 0, cur),
      });
    case 'branches':
      return t('{n} branches for your customers.', { n: v.branches ?? 0 });
  }
}

const checkTitle = (id: PlanCheck['id']) =>
  ({
    fit: t('Fit with the licence'),
    capital: t('Capital vs lending'),
    growth: t('Lending growth'),
    funding: t('Deposits fund the loans'),
    opex: t('Running costs'),
    branches: t('Branches'),
  })[id];

const levelTone = (l: string) => (l === 'good' ? 'good' : l === 'warn' ? 'warn' : 'bad');
const levelIcon = (l: string) => (l === 'good' ? '✓' : l === 'warn' ? '!' : '✕');

// ---------------------------------------------------------------- first session

const tutorialStepLabel = (id: string) =>
  ({
    name: t('Name your bank and pick a licence'),
    negotiate: t('Negotiate with the shareholders'),
    sign: t('Sign and file for your licence'),
    book: t('Book the Central Bank interview'),
    interview: t('Attend the interview'),
  })[id] ?? id;

const tutorialHint = (id: string) =>
  ({
    name: t('Below: a name, the kind of bank, and how much of your own money you put in.'),
    negotiate: t(
      'Compare the offers side by side: more capital, more control, or a board seat and help. Take the ones you want, counter once each, or pull a lever.',
    ),
    sign: t(
      'When you raise at least the regulator’s minimum, sign: the money moves and your licence application is filed.',
    ),
    book: t('Go to the Central Bank in the city and request an appointment.'),
    interview: t(
      'Go back at your appointment time and answer four questions on capital, risk, money laundering and governance.',
    ),
  })[id] ?? '';

/** The banker's first session: one step at a time, each finished by doing it. */
export function BankerFirstSession() {
  const { view, send } = useView();
  const nav = useNav();
  const b = bankerOf(view);
  const tut = b?.tutorial;
  if (!b || !tut || tut.done || !tut.step) return null;
  const n = tut.steps.findIndex((s) => s.id === tut.step) + 1;
  return (
    <Card
      title={t('First session · step {n} of {total}', { n, total: tut.steps.length })}
      sub={tutorialStepLabel(tut.step)}
      className="career-tutorial banker-tutorial"
      action={
        <Button
          variant="ghost"
          onClick={() =>
            void send(
              { type: 'banker.tutorial', action: 'skip' },
              t('Skipped. You can carry on alone.'),
            )
          }
        >
          {t('Skip')}
        </Button>
      }
    >
      <ol className="career-steps" aria-label={t('Steps')}>
        {tut.steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : s.id === tut.step ? 'now' : ''}>
            {tutorialStepLabel(s.id)}
          </li>
        ))}
      </ol>
      <p className="small" data-banker-step={tut.step}>
        {tutorialHint(tut.step)}
      </p>
      {(tut.step === 'book' || tut.step === 'interview') && (
        <Button
          variant="secondary"
          onClick={() => nav?.go({ kind: 'place', place: `civic:${b.centralBank}` })}
        >
          {t('Go to the Central Bank')}
        </Button>
      )}
    </Card>
  );
}

/** Invitations to co-found someone else's bank. */
export function BankInvitations() {
  const { view, send } = useView();
  const b = bankerOf(view);
  if (!b?.invitations.length) return null;
  return (
    <Card title={t('Co-found a bank')}>
      <ul className="list small">
        {b.invitations.map((i) => (
          <li key={i.bankId} className="spread">
            <span>
              {t('{from} invites you to co-found {bank} with {amount}.', {
                from: i.from,
                bank: i.bankName,
                amount: money(i.amount, b.currency),
              })}
            </span>
            <span className="row">
              <Button
                size="sm"
                onClick={() =>
                  void send(
                    { type: 'bank.join', bankId: i.bankId, accept: true },
                    t('You’re a co-founder.'),
                  )
                }
              >
                {t('Join')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void send({ type: 'bank.join', bankId: i.bankId, accept: false }, t('Declined.'))
                }
              >
                {t('Decline')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- 1. negotiate

/** Before you sign: offers, levers and who would own and control the bank. */
export function Negotiate({ bank }: { bank: BankerBank }) {
  const { view, send } = useView();
  const cur = view.market.currency;
  const f = bank.forming!;
  const pv = f.preview;
  const [contribution, setContribution] = useState(amountInput(f.contribution));
  const chosen = new Set(f.offers.filter((o) => o.chosen).map((o) => o.id));
  const take = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    void send({ type: 'bank.terms', bankId: bank.id, chosen: [...next] });
  };
  return (
    <div className="stack banker-negotiate" data-banker="negotiate">
      <Card
        title={bank.name}
        sub={typeLabel(bank.type)}
        action={<Pill tone="info">{t('Negotiating')}</Pill>}
      >
        <p className="small">
          {t(
            'The regulator wants at least {min} of capital for this licence, and likes a buffer above it ({target}). Your own money rarely covers it: investor groups put in the rest, for shares.',
            { min: money(pv.minCapital, cur), target: money(pv.target, cur) },
          )}
        </p>
        <div className="kpis" data-preview="">
          <Stat
            label={t('Capital raised')}
            value={money(pv.capital, cur)}
            hint={
              pv.short > 0
                ? t('{amount} short of the minimum', { amount: money(pv.short, cur) })
                : t('Minimum {amount}: covered', { amount: money(pv.minCapital, cur) })
            }
            tone={pv.short > 0 ? 'bad' : 'good'}
          />
          <Stat
            label={t('You would own')}
            value={<span data-ownership="">{bps(pv.ownershipBps)}</span>}
            hint={t('Your share of dividends and value')}
          />
          <Stat
            label={t('Voting control')}
            value={<span data-control="">{bps(pv.controlBps)}</span>}
            hint={t('You and your co-founders')}
            tone={pv.controlBps > 5000 ? 'good' : undefined}
          />
          <Stat
            label={t('Board seats')}
            value={t('{mine} of {total}', { mine: pv.board.founderSide, total: pv.board.total })}
            hint={t('With an independent chair')}
            tone={pv.boardMajority ? 'good' : undefined}
          />
        </div>
        <p className="small" data-policy-rights={pv.policyRights ? 'yes' : 'no'}>
          {pv.policyRights
            ? t('You would set policy: you hold voting control or a board majority.')
            : t(
                'The AI board could veto risky policy (a very thin loan spread, deposit rates above base, a large salary): you’d hold neither voting control nor a board majority.',
              )}
        </p>
      </Card>

      <Card title={t('The offers')} sub={t('Side by side: take one or more')}>
        <div className="offer-table-wrap">
          <table className="offer-table">
            <thead>
              <tr>
                <th />
                {f.offers.map((o) => (
                  <th key={o.id} scope="col" data-offer={o.id}>
                    <span className="offer-name">{o.name}</span>
                    <span className="offer-style">{styleLabel(o.style)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t('Puts in')}</th>
                {f.offers.map((o) => (
                  <td key={o.id}>{money(o.capital, cur)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('Price per share')}</th>
                {f.offers.map((o) => (
                  <td key={o.id}>{t('{pct} of yours', { pct: pct(o.priceBps / 10_000) })}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('Shares')}</th>
                {f.offers.map((o) => (
                  <td key={o.id}>{o.voting ? t('Voting') : t('Non-voting')}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('Board')}</th>
                {f.offers.map((o) => (
                  <td key={o.id}>
                    {o.boardSeats === 0
                      ? t('No seat')
                      : o.boardSeats === 1
                        ? t('1 seat')
                        : t('{n} seats', { n: o.boardSeats })}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('Also')}</th>
                {f.offers.map((o) => (
                  <td key={o.id} className="small">
                    {o.strategic
                      ? t('Standing with the regulator, and first clients')
                      : o.style === 'control'
                        ? t('Patient money, no say')
                        : t('Money first')}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('Take')}</th>
                {f.offers.map((o) => (
                  <td key={o.id}>
                    <label className="offer-take">
                      <input
                        type="checkbox"
                        data-take={o.id}
                        checked={o.chosen}
                        onChange={(e) => take(o.id, e.target.checked)}
                      />
                      <span>{o.chosen ? t('Taken') : t('Take')}</span>
                    </label>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <h3 className="small">{t('Counter-offer (once per group)')}</h3>
        <p className="small muted" data-counter-odds="">
          {counterSummary(f)}
        </p>
        <ul className="list small">
          {f.offers.map((o) => (
            <li key={o.id} className="spread" data-counter={o.id}>
              <span>{o.name}</span>
              {o.counter ? (
                <Pill tone={o.counter.accepted ? 'good' : 'warn'}>
                  {o.counter.accepted ? t('Counter accepted') : t('They held firm')}
                </Pill>
              ) : (
                <select
                  aria-label={t('Counter {name}', { name: o.name })}
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    void send(
                      {
                        type: 'bank.counter',
                        bankId: bank.id,
                        groupId: o.id,
                        ask: e.target.value as 'price',
                      },
                      (r: { accepted: boolean }) =>
                        r.accepted ? t('They agreed.') : t('They held firm on their terms.'),
                    )
                  }
                >
                  <option value="">{t('Counter…')}</option>
                  {o.priceBps < 10_000 && (
                    <option value="price">{askOption(f, o.id, 'price')}</option>
                  )}
                  {o.boardSeats > 0 && <option value="seat">{askOption(f, o.id, 'seat')}</option>}
                  {o.voting && <option value="voting">{askOption(f, o.id, 'voting')}</option>}
                </select>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('Your levers')}>
        <Field
          label={t('Your own capital ({cur})', { cur })}
          hint={t('In your account: {amount}', { amount: money(f.balance, cur) })}
        >
          {(id) => (
            <div className="row">
              <input
                id={id}
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
              />
              <Button
                variant="subtle"
                disabled={!parseAmount(contribution)}
                onClick={() =>
                  void send(
                    {
                      type: 'bank.terms',
                      bankId: bank.id,
                      contribution: parseAmount(contribution) ?? 0,
                    },
                    t('Your capital is updated.'),
                  )
                }
              >
                {t('Update')}
              </Button>
            </div>
          )}
        </Field>
        <Field label={t('Kind of bank')} hint={t('A smaller bank needs less capital.')}>
          {(id) => (
            <select
              id={id}
              value={bank.type}
              onChange={(e) =>
                void send({
                  type: 'bank.terms',
                  bankId: bank.id,
                  bankType: e.target.value as 'microfinance',
                })
              }
            >
              {f.types.map((x) => (
                <option key={x.id} value={x.id}>
                  {typeLabel(x.id)} · {t('min {amount}', { amount: money(x.minCapital, cur) })}
                </option>
              ))}
            </select>
          )}
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            data-dual-class=""
            checked={f.dualClass}
            onChange={(e) =>
              void send({ type: 'bank.terms', bankId: bank.id, dualClass: e.target.checked })
            }
          />
          <span>
            {t('Voting shares: your shares carry three votes each')}
            <span className="small muted"> {t('Voting investors want a lower price for it.')}</span>
          </span>
        </label>
        <Field
          label={t('Performance shares for management')}
          hint={t(
            'They vest when you get the licence, a profitable month and 1,000 customers. Investors price them in.',
          )}
        >
          {(id) => (
            <select
              id={id}
              value={f.performanceBps}
              onChange={(e) =>
                void send({
                  type: 'bank.terms',
                  bankId: bank.id,
                  performanceBps: Number(e.target.value),
                })
              }
            >
              {[0, 500, 1000, f.maxPerformanceBps].map((x) => (
                <option key={x} value={x}>
                  {x ? t('{pct} of the bank', { pct: bps(x) }) : t('None')}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Cofounders bank={bank} />
      </Card>

      <Card title={t('Who would own the bank')}>
        <ul className="list small">
          {pv.shareholders.map((s) => (
            <li key={s.id} className="spread">
              <span>
                {s.kind === 'founder' ? t('You') : s.name}
                {s.kind === 'cofounder' && <span className="muted"> · {t('co-founder')}</span>}
              </span>
              <span>
                {money(s.capital, cur)} · {t('{n} seats', { n: s.boardSeats })}
              </span>
            </li>
          ))}
        </ul>
        <Button
          block
          data-sign=""
          disabled={pv.short > 0}
          onClick={() =>
            void send(
              { type: 'bank.sign', bankId: bank.id },
              t('Signed. Your licence application is filed.'),
            )
          }
        >
          {t('Sign and file for the licence')}
        </Button>
        {pv.short > 0 && (
          <p className="small muted">
            {t(
              'Raise {amount} more to sign: take an offer, put in more, or choose a smaller bank.',
              {
                amount: money(pv.short, cur),
              },
            )}
          </p>
        )}
        <Button
          variant="ghost"
          onClick={() => void send({ type: 'bank.withdraw', bankId: bank.id }, t('Withdrawn.'))}
        >
          {t('Give up this bank')}
        </Button>
      </Card>
    </div>
  );
}

function Cofounders({ bank }: { bank: BankerBank }) {
  const { view, send } = useView();
  const cur = view.market.currency;
  const f = bank.forming!;
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState('');
  const people = [
    ...f.friends.map((x) => ({ id: x.playerId, label: x.name })),
    ...f.angels.map((x) => ({
      id: x.playerId,
      label: t('{name} (AI angel, up to {amount})', {
        name: x.name,
        amount: money(x.maxCheque, cur),
      }),
    })),
  ];
  return (
    <div className="stack">
      <h3 className="small">{t('Co-founders')}</h3>
      <p className="small muted">
        {t(
          'Players you know, or AI angels you’ve met, can put in capital beside you. They vote with you and share one board seat.',
        )}
      </p>
      {f.invites.length > 0 && (
        <ul className="list small">
          {f.invites.map((i) => (
            <li key={i.playerId} className="spread">
              <span>{i.name}</span>
              <span>
                {money(i.amount, cur)} ·{' '}
                {i.status === 'accepted'
                  ? t('Joined')
                  : i.status === 'declined'
                    ? t('Declined')
                    : t('Waiting')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {people.length === 0 ? (
        <p className="small muted">{t('Nobody to ask yet: meet people in the city first.')}</p>
      ) : (
        <div className="grid2">
          <select aria-label={t('Who')} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t('Who…')}</option>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <input
            aria-label={t('Amount ({cur})', { cur })}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            variant="subtle"
            disabled={!who || !parseAmount(amount)}
            onClick={() =>
              void send(
                {
                  type: 'bank.invite',
                  bankId: bank.id,
                  playerId: who,
                  amount: parseAmount(amount) ?? 0,
                },
                (r: { accepted: boolean | null }) =>
                  r.accepted === null
                    ? t('Invitation sent.')
                    : r.accepted
                      ? t('They’re in.')
                      : t('They said no.'),
              )
            }
          >
            {t('Invite')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 2. the licence

/** The licence tracker and checklist. */
export function LicenceTracker({ bank }: { bank: BankerBank }) {
  const { view } = useView();
  const nav = useNav();
  const lic = bank.licence!;
  const banker = bankerOf(view)!;
  const steps: { id: string; done: boolean }[] = [
    { id: 'interview', done: !lic.missing.includes('interview') },
    { id: 'plan', done: !lic.missing.includes('plan') },
    ...['ceo', 'cro', 'compliance', 'aml'].map((r) => ({
      id: `hire.${r}`,
      done: !lic.missing.includes(`hire.${r}`),
    })),
    { id: 'system', done: !lic.missing.includes('system') },
    { id: 'branch', done: !lic.missing.includes('branch') },
  ];
  const d = lic.decision;
  return (
    <div className="stack banker-licence" data-banker="licence">
      <Card
        title={t('Your licence application')}
        sub={lic.attempt > 1 ? t('Attempt {n}', { n: lic.attempt }) : undefined}
        action={
          lic.aip !== null ? (
            <Pill tone="good">{t('Approved in principle')}</Pill>
          ) : (
            <Pill tone="info">{t('Under review')}</Pill>
          )
        }
      >
        <p className="licence-day" data-review-day={lic.day}>
          {t('Review: day {day} of {total}', { day: lic.day, total: lic.reviewDays })}
        </p>
        <div className="licence-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((100 * lic.day) / lic.reviewDays)}%` }} />
        </div>
        <p className="small muted">
          {lic.missing.length
            ? t(
                'The regulator decides once the checklist is complete and the review time has passed (month {month} at the earliest). Still missing: {n}.',
                {
                  month: lic.decisionMonth,
                  n: lic.missing.length,
                },
              )
            : t('Checklist complete. The regulator decides at the end of month {month}.', {
                month: lic.decisionMonth,
              })}
        </p>
        <ul className="licence-checklist" aria-label={t('Checklist')}>
          {steps.map((s) => (
            <li key={s.id} className={s.done ? 'done' : ''} data-check={s.id}>
              <span aria-hidden="true">{s.done ? '✓' : '○'}</span> {missingLabel(s.id)}
            </li>
          ))}
        </ul>
        <p className="small">
          {t(
            'Application score: {score}/100. Licence from {approve}; with conditions from {conditions}.',
            {
              score: lic.score,
              approve: lic.approveAt,
              conditions: lic.conditionsAt,
            },
          )}
        </p>
      </Card>

      {d && (
        <Card
          tone={d.outcome === 'refused' ? 'bad' : d.outcome === 'conditions' ? 'warn' : 'good'}
          title={
            d.outcome === 'refused'
              ? t('Licence refused (score {score})', { score: d.score })
              : d.outcome === 'conditions'
                ? t('Licence granted with conditions')
                : t('Licence granted')
          }
        >
          <ul className="list small" data-decision={d.outcome}>
            {d.reasons.map((r) => (
              <li key={r}>{reasonText(r)}</li>
            ))}
          </ul>
          {d.outcome === 'refused' && (
            <p className="small">
              {t('Fix these and the regulator reviews the application again.')}
            </p>
          )}
        </Card>
      )}

      <Card
        title={t('1 · Fit-and-proper interview')}
        action={
          lic.interview ? (
            <Pill tone={lic.interview.score >= lic.interviewPass ? 'good' : 'bad'}>
              {t('{score}/100', { score: lic.interview.score })}
            </Pill>
          ) : null
        }
      >
        <p className="small">
          {lic.interview && lic.interview.score >= lic.interviewPass
            ? t('Passed. The regulator is satisfied you are fit and proper to run a bank.')
            : t(
                'At the Central Bank, by appointment: four questions on capital, risk, money laundering and governance. They pass from {pass}.',
                {
                  pass: lic.interviewPass,
                },
              )}
        </p>
        {!(lic.interview && lic.interview.score >= lic.interviewPass) && (
          <Button
            variant="secondary"
            data-go-central-bank=""
            onClick={() => nav?.go({ kind: 'place', place: `civic:${banker.centralBank}` })}
          >
            {t('Go to the Central Bank')}
          </Button>
        )}
      </Card>

      <PlanEditor bank={bank} />
      <KeyPeople bank={bank} />
      <SystemsAndBranch bank={bank} />
      <PreOpening bank={bank} />
      <AddCapital bank={bank} />
    </div>
  );
}

function PlanEditor({ bank }: { bank: BankerBank }) {
  const { view, send } = useView();
  const cur = view.market.currency;
  const lic = bank.licence!;
  const start: Plan = lic.plan ?? lic.suggestedPlan;
  const [plan, setPlan] = useState<Plan>(start);
  const [lend, setLend] = useState(start.lending.map((x) => amountInput(x)));
  const lending = lend.map((x) => parseAmount(x) ?? 0) as [number, number, number];
  const live: Plan = { ...plan, lending };
  const input: BankPlanInput = { ...(lic.planBase as Omit<BankPlanInput, 'plan'>), plan: live };
  const checks = bankPlanChecks(input);
  const bad = checks.some((c) => c.level === 'bad');
  const toggle = (key: 'segments' | 'products', id: string) =>
    setPlan((p) => ({
      ...p,
      [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id],
    }));
  return (
    <Card
      title={t('2 · Business plan')}
      action={lic.plan ? <Pill tone="good">{t('Filed')}</Pill> : null}
    >
      <p className="small muted">
        {t(
          'Who you serve, what you offer, where, and how fast you lend. The checks update as you write.',
        )}
      </p>
      <fieldset className="plan-pick">
        <legend className="small">{t('Customers')}</legend>
        {lic.segments.map((s) => (
          <label key={s} className={lic.fit.segments.includes(s) ? '' : 'misfit'}>
            <input
              type="checkbox"
              checked={plan.segments.includes(s)}
              onChange={() => toggle('segments', s)}
            />
            {segmentLabel(s)}
          </label>
        ))}
      </fieldset>
      <fieldset className="plan-pick">
        <legend className="small">{t('Products')}</legend>
        {lic.products.map((s) => (
          <label key={s} className={lic.fit.products.includes(s) ? '' : 'misfit'}>
            <input
              type="checkbox"
              checked={plan.products.includes(s)}
              onChange={() => toggle('products', s)}
            />
            {productLabel(s)}
          </label>
        ))}
      </fieldset>
      <div className="grid2">
        <Field label={t('Branches')}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              max={50}
              value={plan.branches}
              onChange={(e) =>
                setPlan((p) => ({ ...p, branches: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          )}
        </Field>
        {[0, 1, 2].map((i) => (
          <Field key={i} label={t('Loans, end of year {n} ({cur})', { n: i + 1, cur })}>
            {(id) => (
              <input
                id={id}
                data-lending={i + 1}
                value={lend[i]}
                onChange={(e) => setLend((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              />
            )}
          </Field>
        ))}
      </div>
      <ul className="plan-checks" aria-label={t('Plan checks')}>
        {checks.map((c) => (
          <li
            key={c.id}
            className={`plan-check plan-${levelTone(c.level)}`}
            data-plan-check={c.id}
            data-level={c.level}
          >
            <span className="plan-check-icon" aria-hidden="true">
              {levelIcon(c.level)}
            </span>
            <span>
              <b>{checkTitle(c.id)}</b> <span className="small">{checkText(c, cur)}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button
        data-file-plan=""
        disabled={bad}
        onClick={() =>
          void send(
            { type: 'bank.plan', bankId: bank.id, ...live },
            t('Business plan filed with the regulator.'),
          )
        }
      >
        {lic.plan ? t('File the revised plan') : t('File the plan')}
      </Button>
      {bad && <p className="small muted">{t('Fix the red checks to file.')}</p>}
    </Card>
  );
}

function KeyPeople({ bank }: { bank: BankerBank }) {
  const { view, send } = useView();
  const cur = view.market.currency;
  const lic = bank.licence!;
  return (
    <Card title={t('3 · Key people')}>
      <p className="small muted">
        {t(
          'The regulator wants strong people in four jobs. Salaries come out of the bank’s account each month.',
        )}
      </p>
      {(['ceo', 'cro', 'compliance', 'aml'] as const).map((role) => {
        const hired = lic.hires[role];
        return (
          <div key={role} className="hire-role" data-role={role}>
            <h3 className="small">
              {roleLabel(role)}
              {hired && (
                <span className="muted">
                  {' '}
                  · {hired.id === 'self' ? t('You') : hired.name} ({hired.quality})
                </span>
              )}
            </h3>
            <ul className="list small">
              {lic.candidates[role].map((c) => (
                <li key={c.id} className="spread">
                  <span>
                    {c.id === 'self' ? t('You') : c.name} · {t('strength {q}', { q: c.quality })} ·{' '}
                    {c.salary
                      ? t('{amount}/mo', { amount: money(c.salary, cur) })
                      : t('no extra salary')}
                  </span>
                  <Button
                    size="sm"
                    variant={hired?.id === c.id ? 'ghost' : 'subtle'}
                    disabled={hired?.id === c.id}
                    data-hire={`${role}:${c.id}`}
                    onClick={() =>
                      void send(
                        { type: 'bank.hire', bankId: bank.id, role, candidateId: c.id },
                        t('Hired.'),
                      )
                    }
                  >
                    {hired?.id === c.id ? t('Hired') : t('Hire')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

function SystemsAndBranch({ bank }: { bank: BankerBank }) {
  const { view, send } = useView();
  const cur = view.market.currency;
  const lic = bank.licence!;
  const [district, setDistrict] = useState(lic.branch?.district ?? lic.districts[0]?.id ?? '');
  const rent = lic.districts.find((d) => d.id === district)?.rent ?? 0;
  return (
    <Card title={t('4 · Systems and a first branch')}>
      <p className="small muted">
        {t('A reliable core banking system impresses the regulator, and costs more.')}
      </p>
      <ul className="list small">
        {lic.systems.map((s) => (
          <li key={s.id} className="spread">
            <span>
              {systemLabel(s.id)} · {t('reliability {pct}', { pct: pct(s.reliability) })} ·{' '}
              {money(s.cost, cur)}
            </span>
            <Button
              size="sm"
              variant={lic.system === s.id ? 'ghost' : 'subtle'}
              disabled={lic.system === s.id}
              data-system={s.id}
              onClick={() =>
                void send(
                  { type: 'bank.setup', bankId: bank.id, system: s.id },
                  t('System installed.'),
                )
              }
            >
              {lic.system === s.id ? t('Installed') : t('Install')}
            </Button>
          </li>
        ))}
      </ul>
      <Field
        label={t('Branch district')}
        hint={
          lic.branch
            ? t('Your branch: {district}, {rent}/mo.', {
                district: lic.branch.label,
                rent: money(lic.branch.rent, cur),
              })
            : t('Rent {rent}/mo, fit-out {fit} once.', {
                rent: money(rent, cur),
                fit: money(rent * 2, cur),
              })
        }
      >
        {(id) => (
          <div className="row">
            <select id={id} value={district} onChange={(e) => setDistrict(e.target.value)}>
              {lic.districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} · {money(d.rent, cur)}
                </option>
              ))}
            </select>
            <Button
              variant="subtle"
              data-lease=""
              disabled={!district || lic.branch?.district === district}
              onClick={() =>
                void send({ type: 'bank.setup', bankId: bank.id, district }, t('Branch leased.'))
              }
            >
              {t('Lease')}
            </Button>
          </div>
        )}
      </Field>
    </Card>
  );
}

function PreOpening({ bank }: { bank: BankerBank }) {
  const { send } = useView();
  const lic = bank.licence!;
  if (lic.aip === null)
    return (
      <Card title={t('5 · First clients')}>
        <p className="small muted">
          {t(
            'After approval in principle (the interview and the plan), sign up the city’s businesses so you open with customers.',
          )}
        </p>
      </Card>
    );
  return (
    <Card title={t('5 · First clients')} sub={t('Before you open')}>
      <ul className="list small">
        {lic.prospects.map((c) => (
          <li key={c.id} className="spread">
            <span>{c.name}</span>
            {c.signed ? (
              <Pill tone="good">{t('Signed up')}</Pill>
            ) : (
              <Button
                size="sm"
                variant="subtle"
                data-client={c.id}
                onClick={() =>
                  void send(
                    { type: 'bank.client', bankId: bank.id, companyId: c.id },
                    t('They’ll bank with you when you open.'),
                  )
                }
              >
                {t('Sign up (1h)')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AddCapital({ bank }: { bank: BankerBank }) {
  const { view, send } = useView();
  const cur = view.market.currency;
  const [amount, setAmount] = useState('');
  return (
    <Card title={t('Add capital')}>
      <p className="small muted">
        {t(
          'Costs come out of capital. Keep it above the minimum ({min}): put more of your own money in for new shares.',
          {
            min: money(bank.minCapital, cur),
          },
        )}
      </p>
      <div className="row">
        <input
          aria-label={t('Amount ({cur})', { cur })}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          variant="subtle"
          disabled={!parseAmount(amount)}
          onClick={() =>
            void send(
              { type: 'bank.capital', bankId: bank.id, amount: parseAmount(amount) ?? 0 },
              t('Capital added.'),
            )
          }
        >
          {t('Add')}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the interview

/** Does your licence application still need the interview? */
export function needsBankInterview(view: PlayerView): boolean {
  const b = bankerOf(view)?.bank;
  const lic = b?.licence;
  if (!b || !lic || b.status !== 'applying') return false;
  return !(lic.interview && lic.interview.score >= lic.interviewPass);
}

/** At the Central Bank: the fit-and-proper interview (when your application needs it). */
export function BankInterviewCard() {
  const { view, send, busy } = useView();
  const b = bankerOf(view)?.bank;
  const lic = b?.licence;
  const [answers, setAnswers] = useState<(number | null)[]>(() => [null, null, null, null]);
  if (!b || !lic || b.status !== 'applying') return null;
  if (lic.interview && lic.interview.score >= lic.interviewPass) return null;
  const ready = answers.length === lic.questions.length && answers.every((a) => a !== null);
  return (
    <Card title={t('Fit-and-proper interview')} sub={b.name} className="bank-interview">
      <p className="small muted">
        {t(
          'The supervisors want to know you can run a bank safely. Answer each question; it takes three hours.',
        )}
      </p>
      {lic.questions.map((q, i) => (
        <fieldset key={q.id} className="interview-q" data-question={q.id}>
          <legend>{tx(q.text)}</legend>
          {q.options.map((o, j) => (
            <label key={j}>
              <input
                type="radio"
                name={`bank-q-${q.id}`}
                checked={answers[i] === j}
                onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))}
              />
              {tx(o)}
            </label>
          ))}
        </fieldset>
      ))}
      <Button
        data-answer-interview=""
        disabled={busy || !ready}
        onClick={() =>
          void send(
            { type: 'bank.interview', bankId: b.id, answers: answers.map((a) => a ?? 0) },
            (r: { passed: boolean; score: number }) =>
              r.passed
                ? t('Interview passed: {score}/100.', { score: r.score })
                : t('Not convinced: {score}/100. Book another appointment to try again.', {
                    score: r.score,
                  }),
          )
        }
      >
        {t('Give my answers')}
      </Button>
    </Card>
  );
}
