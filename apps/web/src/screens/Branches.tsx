/**
 * Branches you can run (round 4 player feedback, a London founder at Series
 * A: "I just opened my second branch but can't see anything on how to get
 * customers there or manage it in any way").
 *
 * Company → Branches: every branch with its city, when it opened, its staff
 * and manager, what it costs a month, its customers, its revenue and its
 * profit or loss; how to grow it; and, opened up, how to run it: a local
 * marketing budget, hiring and letting go of a sales rep or a manager, leads
 * from its city in Sales, pitching its businesses in person when you're
 * there, and closing it (behind a confirmation, with what that costs).
 * Before the branches note a branch only trades: the old Expansion card.
 */
import { useState } from 'react';
import { amountInput, gameMonth, money, parseAmount } from '../format';
import { t, tx } from '../i18n';
import { useNav } from '../phone/bus';
import { useView, type Company } from '../store';
import { Button, Card, Confirm, Empty, Field, Pill } from '../ui';
import { openCompanyTab } from './Company';
import { ExpansionCard } from './Expansion';
import { openSalesCity } from './salesCity';
import './branches.css';

type Expansion = NonNullable<Company['expansion']>;
type BranchV = Expansion['branches'][number];
type Run = NonNullable<BranchV['run']>;

const roleLabel = (r: 'rep' | 'manager') =>
  r === 'manager' ? t('Runs the branch') : t('Local sales rep');

/** Company → Branches. */
export function BranchesSection({ c }: { c: Company }) {
  const x = c.expansion;
  if (!x) return null;
  if (!x.run) return <ExpansionCard c={c} />;
  const open = x.branches.filter((b) => b.status === 'open' && b.run);
  return (
    <div className="branches" data-branches="">
      <BranchesSummary c={c} x={x} open={open} />
      {open.length === 0 ? (
        <Card title={t('Your branches')}>
          <Empty>
            {t(
              'No branches yet. Open one below: a branch in another city wins its own customers there, and counts toward “Sell in a second city”.',
            )}
          </Empty>
        </Card>
      ) : (
        open.map((b) => <BranchCard key={b.id} c={c} b={b} run={b.run!} />)
      )}
      <GrowGuide />
      <ExpansionCard c={c} openOnly />
    </div>
  );
}

/** How many branches, customers there, last month's result, and the second-city step. */
function BranchesSummary({ c, x, open }: { c: Company; x: Expansion; open: BranchV[] }) {
  const s = x.secondCity;
  const step = c.guide.stages
    .find((st) => st.id === 'series-a')
    ?.tasks.find((k) => k.id === 'a.city');
  return (
    <Card
      title={t('Your branches')}
      sub={t('{n} of {max} branches', { n: open.length, max: x.maxOpen })}
      className="branches-summary"
    >
      <div className="branch-kpis">
        <div>
          <span className="small muted">{t('Customers at branches')}</span>
          <strong data-kpi="branch-customers">{x.customers}</strong>
        </div>
        <div>
          <span className="small muted">{t('Branches open')}</span>
          <strong data-kpi="branches-open">{open.length}</strong>
        </div>
      </div>
      <div
        className={`branch-step${s.selling ? ' is-done' : ''}`}
        data-second-city={s.selling ? 'done' : 'todo'}
      >
        <span aria-hidden="true">{s.selling ? '✓' : '🏙'}</span>
        <span>
          <b>{t('Sell in a second city')}</b>
          <span className="small muted">
            {s.selling
              ? t('Done: {n} customers in other cities.', { n: s.customers })
              : s.branches === 0
                ? s.sameCity > 0
                  ? t(
                      'Your branch is in your home city. Open one in another city: that is what counts.',
                    )
                  : t('Open a branch in another city, then win customers there.')
                : t('Branch open. Customers there next: they come at the month end.')}
          </span>
        </span>
        {step && (
          <Pill tone={step.done ? 'good' : 'warn'}>{step.done ? t('done') : t('to do')}</Pill>
        )}
      </div>
    </Card>
  );
}

/** One branch: the numbers, and (opened up) how to run it. */
function BranchCard({ c, b, run }: { c: Company; b: BranchV; run: Run }) {
  const [open, setOpen] = useState(false);
  const cur = b.currency;
  const last = run.last;
  const reps = run.staff.filter((s) => s.role === 'rep');
  const manager = run.staff.find((s) => s.role === 'manager');
  return (
    <section className="card branch-card" data-branch-card={b.id} aria-label={b.districtLabel}>
      <header className="branch-head">
        <span className="branch-pin" aria-hidden="true">
          📍
        </span>
        <span className="branch-title">
          <b>{t('{district}, {city}', { district: b.districtLabel, city: b.marketName })}</b>
          <span className="small muted">
            {t('Opened {month}', { month: gameMonth(b.openedMonth) })}
            {b.market !== c.market ? ` · ${t('another city')}` : ''}
          </span>
        </span>
        <Pill tone={last.settled ? (last.profit >= 0 ? 'good' : 'bad') : undefined}>
          {last.settled
            ? last.profit >= 0
              ? t('Profit {amount}', { amount: money(last.profit, cur) })
              : t('Loss {amount}', { amount: money(-last.profit, cur) })
            : t('First month')}
        </Pill>
      </header>
      <dl className="branch-facts">
        <div>
          <dt>{t('Customers')}</dt>
          <dd data-branch-customers={run.customers}>{run.customers}</dd>
          {last.won !== null && (
            <dd className="small muted">
              {t('+{won} / −{lost} last month', { won: last.won, lost: last.lost ?? 0 })}
            </dd>
          )}
        </div>
        <div>
          <dt>{t('Revenue')}</dt>
          <dd data-branch-revenue={last.revenue}>
            {t('{amount}/mo', { amount: money(last.revenue, cur) })}
          </dd>
          <dd className="small muted">{t('last month')}</dd>
        </div>
        <div>
          <dt>{t('Costs')}</dt>
          <dd>{t('{amount}/mo', { amount: money(run.monthlyCosts, cur) })}</dd>
          <dd className="small muted">{t('at today’s settings')}</dd>
        </div>
        <div>
          <dt>{t('Staff')}</dt>
          <dd>
            {manager ? manager.name : t('No manager')}
            {reps.length > 0 &&
              ` · ${reps.length === 1 ? t('1 sales rep') : t('{n} reps', { n: reps.length })}`}
          </dd>
          <dd className="small muted">{t('plus the shop team in running costs')}</dd>
        </div>
      </dl>
      {run.signed.count > 0 && (
        <p className="small" data-branch-signed={run.signed.count}>
          {t('{n} signed in Sales from {city}: {amount}/mo', {
            n: run.signed.count,
            city: b.marketName,
            amount: money(run.signed.monthly, run.signed.currency),
          })}
        </p>
      )}
      <NextMove b={b} run={run} />
      <Button
        variant={open ? 'ghost' : 'subtle'}
        size="sm"
        aria-expanded={open}
        data-manage-branch={b.id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t('Hide') : t('Manage this branch')}
      </Button>
      {open && <BranchManage c={c} b={b} run={run} />}
    </section>
  );
}

/** The one thing most likely to grow this branch now. */
function NextMove({ b, run }: { b: BranchV; run: Run }) {
  const tip =
    run.budget === 0
      ? t('Next: give it a local marketing budget. It brings customers in from the first month.')
      : run.reps === 0
        ? t(
            'Next: hire a local sales rep. More customers, and a lead from {city} in Sales every month.',
            {
              city: b.marketName,
            },
          )
        : !run.manager
          ? t('Next: a branch manager reaches further and keeps more customers.')
          : run.here
            ? t('You’re in {city}: pitch its businesses in person below.', { city: b.marketName })
            : t('Work its leads in Sales, and visit {city} to pitch businesses in person.', {
                city: b.marketName,
              });
  return (
    <p className="small branch-next" data-branch-next="">
      <span aria-hidden="true">💡</span> {tip}
    </p>
  );
}

/** Running a branch: budget, staff, leads, pitching in person and closing. */
function BranchManage({ c, b, run }: { c: Company; b: BranchV; run: Run }) {
  const { send, busy, view } = useView();
  const nav = useNav();
  const cur = b.currency;
  const [budget, setBudget] = useState(amountInput(run.budget));
  const parsed = parseAmount(budget);
  const bad = parsed === null || parsed < 0 || parsed > run.maxBudget;
  const hours = view.me.hours.left;
  const last = run.last;
  const away = b.market !== c.market;
  const reps = run.staff.filter((s) => s.role === 'rep').length;
  return (
    <div className="branch-manage" data-branch-manage={b.id}>
      <h3>{t('Last month')}</h3>
      <ul className="list branch-pnl">
        <li className="spread">
          <span>{t('Takings')}</span>
          <span>{money(last.revenue, cur)}</span>
        </li>
        <li className="spread">
          <span>{t('Rent and shop team')}</span>
          <span>−{money(last.opex, cur)}</span>
        </li>
        <li className="spread">
          <span>{t('Local marketing')}</span>
          <span>−{money(last.marketing, cur)}</span>
        </li>
        <li className="spread">
          <span>{t('Branch staff')}</span>
          <span>−{money(last.staff, cur)}</span>
        </li>
        <li className="spread branch-pnl-total">
          <b>{last.profit >= 0 ? t('Profit') : t('Loss')}</b>
          <b data-branch-profit={last.profit}>{money(Math.abs(last.profit), cur)}</b>
        </li>
      </ul>
      <p className="small muted">
        {t(
          'It can reach about {n} customers next month at today’s budget and staff. Each one spends about {amount} a month.',
          { n: run.reach, amount: money(run.ticket, cur) },
        )}
      </p>

      <h3>{t('Local marketing')}</h3>
      <div className="branch-budget">
        <Field label={t('Budget a month ({currency})', { currency: cur })}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={budget}
              data-branch-budget-input=""
              onChange={(e) => setBudget(e.target.value)}
            />
          )}
        </Field>
        <Button
          size="sm"
          disabled={busy || bad || parsed === run.budget}
          data-branch-budget-save=""
          onClick={() =>
            void send<{ message?: string }>(
              { type: 'company.branch.budget', branchId: b.id, amount: parsed ?? 0 },
              (r) => (r?.message ? tx(r.message) : t('Saved.')),
            )
          }
        >
          {t('Set budget')}
        </Button>
      </div>
      <p className="small muted">
        {t(
          'Up to {max} a month, paid at each month end. More budget brings more customers, though each extra bit brings fewer.',
          { max: money(run.maxBudget, cur) },
        )}
      </p>

      <h3>{t('Staff')}</h3>
      {run.staff.length === 0 ? (
        <p className="small muted">{t('Only the shop team in its running costs so far.')}</p>
      ) : (
        <ul className="list" aria-label={t('Branch staff')}>
          {run.staff.map((s) => (
            <li key={s.id} className="branch-staff" data-branch-staff={s.role}>
              <span>
                <b>{s.name}</b>
                <span className="small muted">
                  {' · '}
                  {roleLabel(s.role)} · {t('{amount}/mo', { amount: money(s.salary, cur) })}
                </span>
              </span>
              <Confirm
                label={t('Let go')}
                confirmLabel={t('Let go ({amount})', { amount: money(s.salary, cur) })}
                onConfirm={() =>
                  void send<{ message?: string }>(
                    { type: 'company.branch.fire', branchId: b.id, staffId: s.id },
                    (r) => (r?.message ? tx(r.message) : t('Done.')),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="branch-hire">
        <Button
          size="sm"
          variant="subtle"
          data-branch-hire="rep"
          disabled={busy || reps >= run.hire.rep.max || hours < run.hire.hours || c.hibernating}
          onClick={() =>
            void send<{ message?: string }>(
              { type: 'company.branch.hire', branchId: b.id, role: 'rep' },
              (r) => (r?.message ? tx(r.message) : t('Hired.')),
            )
          }
        >
          {t('Hire a local sales rep ({amount}/mo)', { amount: money(run.hire.rep.salary, cur) })}
        </Button>
        {!run.manager && (
          <Button
            size="sm"
            variant="subtle"
            data-branch-hire="manager"
            disabled={busy || hours < run.hire.hours || c.hibernating}
            onClick={() =>
              void send<{ message?: string }>(
                { type: 'company.branch.hire', branchId: b.id, role: 'manager' },
                (r) => (r?.message ? tx(r.message) : t('Hired.')),
              )
            }
          >
            {t('Hire a manager ({amount}/mo)', { amount: money(run.hire.manager.salary, cur) })}
          </Button>
        )}
      </div>
      <p className="small muted">
        {t(
          'A rep reaches about {n} more people and brings a lead from {city} into Sales every month. A manager reaches a quarter more and halves the customers you lose. Hiring takes {h}h; letting someone go costs a month of their pay.',
          { n: run.hire.rep.reach, city: b.marketName, h: run.hire.hours },
        )}
      </p>

      {away && (
        <>
          <h3>{t('Leads in {city}', { city: b.marketName })}</h3>
          <p className="small">
            {run.openDeals === 1
              ? t('1 open deal from {city} in Sales.', { city: b.marketName })
              : run.openDeals > 1
                ? t('{n} open deals from {city} in Sales.', {
                    n: run.openDeals,
                    city: b.marketName,
                  })
                : t('No open deals from {city} yet.', { city: b.marketName })}
          </p>
          <div className="row">
            <Button
              size="sm"
              data-branch-prospect={b.market}
              disabled={busy || hours < 4}
              onClick={() =>
                void send<{ message?: string }>(
                  { type: 'sales.prospect', companyId: c.id, market: b.market },
                  (r) => (r?.message ? tx(r.message) : t('New leads.')),
                )
              }
            >
              {t('Find leads in {city} (4h)', { city: b.marketName })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-branch-sales={b.market}
              onClick={() => openSalesCity(b.market)}
            >
              {t('See {city} in Sales', { city: b.marketName })}
            </Button>
          </div>
        </>
      )}

      <h3>{t('Pitch in person')}</h3>
      {run.here ? (
        run.pitch.businesses.length === 0 ? (
          <p className="small muted">{t('No businesses here left to pitch for now.')}</p>
        ) : (
          <>
            <p className="small muted">
              {t(
                'You’re in {city}. A pitch takes {h}h and puts them in Sales as a warm lead ({n} pitches left this month).',
                {
                  city: b.marketName,
                  h: run.pitch.hours,
                  n: run.pitch.left,
                },
              )}
            </p>
            <ul className="list" aria-label={t('Businesses to pitch')}>
              {run.pitch.businesses.map((x) => (
                <li key={x.id} className="spread" data-branch-pitch-target={x.id}>
                  <span>
                    <b>{x.name}</b>
                    <span className="small muted">
                      {' · '}
                      {tx(x.kind)} · {x.district}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={busy || run.pitch.left <= 0 || hours < run.pitch.hours}
                    onClick={() =>
                      void send<{ message?: string }>(
                        { type: 'company.branch.pitch', branchId: b.id, businessId: x.id },
                        (r) => (r?.message ? tx(r.message) : t('Pitched.')),
                      )
                    }
                  >
                    {t('Pitch')}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        <div className="row">
          <p className="small muted">
            {t('Visit {city} to pitch its businesses in person: they start as warm leads.', {
              city: b.marketName,
            })}
          </p>
          {away && (
            <Button
              size="sm"
              variant="ghost"
              data-branch-travel=""
              onClick={() => nav?.go({ kind: 'phone', open: { app: 'travel' } })}
            >
              {t('Book a flight')}
            </Button>
          )}
        </div>
      )}

      <h3>{t('Close the branch')}</h3>
      <p className="small muted">
        {t(
          'Closing costs {amount}: a month’s rent breaks the lease, and each person on the staff gets a month’s pay. Its customers stop buying.',
          {
            amount: money(run.closeCost, cur),
          },
        )}
      </p>
      <Confirm
        label={t('Close this branch')}
        confirmLabel={t('Close it ({amount})', { amount: money(run.closeCost, cur) })}
        onConfirm={() =>
          void send<{ message?: string }>({ type: 'company.branch.close', branchId: b.id }, (r) =>
            r?.message ? tx(r.message) : t('Branch closed.'),
          )
        }
      />
    </div>
  );
}

/** How a branch grows, in a few lines. */
function GrowGuide() {
  return (
    <Card title={t('How to grow a branch')} className="branch-guide">
      <ol className="small how-list">
        <li>
          {t(
            'Walk-ins find a new branch over its first four months. A better product, reliability and stars bring more of them.',
          )}
        </li>
        <li>{t('A local marketing budget brings customers from the first month.')}</li>
        <li>
          {t(
            'A local sales rep brings more customers and a lead from that city into Sales every month. Work those leads like any other deal.',
          )}
        </li>
        <li>{t('A manager reaches further and keeps more of the customers you win.')}</li>
        <li>
          {t(
            'In Sales, “Find leads” in a branch city finds businesses there. When you visit the city, pitch its businesses in person from here.',
          )}
        </li>
        <li>
          {t(
            'Every branch customer counts in your customer total and shows in Customers with its city. A branch in another city with customers completes “Sell in a second city”.',
          )}
        </li>
      </ol>
    </Card>
  );
}

/** Opens Company → Branches from anywhere. */
export function useOpenBranches() {
  const nav = useNav();
  return () => {
    openCompanyTab('branches');
    nav?.go({ kind: 'tab', tab: 'company', section: 'branches' });
    setTimeout(() => {
      document
        .querySelector('[data-branches]')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 80);
  };
}
