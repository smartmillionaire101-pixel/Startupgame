/**
 * The sales pipeline (Founder Journey 2a; blueprint §3 "Customer interaction",
 * §6.2): find leads, then work each deal from first call to signature.
 * A row of stage chips (round 7) filters the board; the deal cards are grouped
 * by stage below it, side by side on a wide screen. Each card shows
 * what you know about the customer ('?' until discovery), the chance to win,
 * and the next step with its time and cost before you confirm.
 */
import { useState } from 'react';
import type { Command } from '@runway/engine';
import { amountInput, gameMonth, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Button, Card, Confirm, Empty, Field } from '../ui';
import { activeStep, setTutorial, useTutorial } from '../tutorial/state';
import { useSpotlight } from '../tutorial/spotlight';
import { DemoBreakdown } from './FounderGuide';
import { SalesTalkSheet } from './SalesTalk';
import { DealOwner } from './SalesTeam';
import { openCompanyTab } from './Company';
import { LossReason, lossAdvice, lossLabel, type LossReason as LossReasonId } from './SalesReasons';
import './sales.css';

type Sales = NonNullable<Company['sales']>;
type DealV = Sales['deals'][number];
type Action = DealV['actions'][number]['action'];
type Stage = DealV['stage'];

export const stageLabel = (s: Stage | string) =>
  ({
    lead: t('Lead'),
    contacted: t('Contacted'),
    discovery: t('Discovery'),
    demo: t('Demo'),
    proposal: t('Proposal'),
    negotiation: t('Negotiation'),
    won: t('Won'),
    lost: t('Lost'),
  })[s] ?? s;

const actionLabel = (a: Action) =>
  ({
    contact: t('Call them'),
    discover: t('Discovery meeting'),
    demo: t('Show a demo'),
    propose: t('Send a proposal'),
    negotiate: t('Negotiate'),
    close: t('Ask for the deal'),
    recover: t('Try again'),
  })[a];

const actionWhy = (a: Action) =>
  ({
    contact: t('Introduce yourself. They start to trust you.'),
    discover: t('Ask about their problem: you learn their budget, needs and who decides.'),
    demo: t('Show the product. A good fit and quality win them over.'),
    propose: t('Name your monthly price. Within their budget is safer.'),
    negotiate: t('Offer a discount: less money each month, a better chance to sign.'),
    close: t('Ask them to sign. It can still go either way.'),
    recover: t('One more try: answer their objection and get back to the table.'),
  })[a];

/** Why a won customer stopped buying (sales.ts CHURN_WHY). */
export const churnLabel = (r: 'reliability' | 'hibernation' | 'switched') =>
  ({
    reliability: t('outages and slow support drove them away'),
    hibernation: t('you paused the company'),
    switched: t('they moved to another supplier'),
  })[r];

const needLabel = (n: string | null) =>
  n === null
    ? '?'
    : ({
        fit: t('A product that fits how they work'),
        price: t('A low price'),
        stars: t('A brand they trust'),
        reliability: t('Something that never breaks'),
      }[n] ?? n);

const level = (v: number | null) =>
  v === null ? '?' : v >= 0.67 ? t('High') : v >= 0.34 ? t('Medium') : t('Low');

const currentLabel = (k: DealV['known']) =>
  k.current === null
    ? '?'
    : k.current === 'nothing'
      ? t('Nothing yet')
      : k.current === 'spreadsheet'
        ? t('Spreadsheets and paper')
        : (k.currentName ?? (k.current === 'rival' ? t('A rival') : t('The big incumbent')));

export function SalesPipeline({ c, compact }: { c: Company; compact?: boolean }) {
  const { send, view } = useView();
  // The conversation sheet lives here: a deal changes column (and remounts) when it closes.
  const [talkDeal, setTalkDeal] = useState<string | null>(null);
  // Round 7: the stage chips filter the board ("all": every open stage, then won and lost).
  const [filter, setFilter] = useState<BoardFilter>('all');
  // …and, with salespeople, whose deals: yours ("me") or one person's.
  const [owner, setOwner] = useState<string | null>(null);
  const sales = c.sales;
  if (!sales) return <Empty>{t('The sales pipeline isn’t available yet.')}</Empty>;
  const cur = c.currency;
  const hoursLeft = view.me.hours.left;
  const salesStaff = c.staff.filter((s) => s.role === 'sales');
  const mine = (d: DealV) => owner === null || (owner === 'me' ? !d.owner : d.owner?.id === owner);
  const shown = sales.deals.filter(mine);
  const groups = boardGroups(sales.stages, shown, filter);
  const prospect = () =>
    send<{ leads: { id: string; name: string }[] }>(
      { type: 'sales.prospect', companyId: c.id },
      (r) =>
        r.leads.length === 1
          ? t('New lead: {name}.', { name: r.leads[0]!.name })
          : t('{n} new leads.', { n: r.leads.length }),
    );
  const blocker =
    sales.prospect.blocker === 'limit'
      ? t('You’ve done all your prospecting this month ({n}). Sales staff let you do more.', {
          n: sales.prospect.limit,
        })
      : sales.prospect.blocker === 'full'
        ? t('Your pipeline is full. Close or drop a deal first.')
        : hoursLeft < sales.prospect.hours
          ? t('Not enough hours left this month.')
          : null;
  return (
    <div className={`sales${compact ? ' sales-compact' : ''}`} data-sales>
      <SalesCoach sales={sales} blocked={!!blocker} />
      {talkDeal && (
        <SalesTalkSheet companyId={c.id} dealId={talkDeal} onClose={() => setTalkDeal(null)} />
      )}
      <Card
        title={t('Sales pipeline')}
        sub={t('Win customers one deal at a time')}
        className="sales-summary"
      >
        <div className="sales-kpis">
          <div>
            <span className="small muted">{t('Open deals')}</span>
            <strong data-kpi="open">{sales.stats.open}</strong>
          </div>
          <div>
            <span className="small muted">{t('Win rate')}</span>
            <strong data-kpi="winrate">
              {sales.stats.winRate === null ? '—' : pct(sales.stats.winRate)}
            </strong>
          </div>
          <div>
            <span className="small muted">{t('Pipeline value')}</span>
            <strong>{t('{amount}/mo', { amount: money(sales.stats.pipelineValue, cur) })}</strong>
          </div>
          <div>
            <span className="small muted">{t('Won customers pay')}</span>
            <strong data-kpi="monthly">
              {t('{amount}/mo', { amount: money(sales.stats.monthly, cur) })}
            </strong>
          </div>
        </div>
        <div className="sales-prospect">
          <Button onClick={() => void prospect()} disabled={!!blocker}>
            {t('Find new leads')}
          </Button>
          <span className="small muted">
            {blocker ??
              t('Takes {h}h. Finds 1–3 businesses that might buy ({used}/{limit} this month).', {
                h: sales.prospect.hours,
                used: sales.prospect.used,
                limit: sales.prospect.limit,
              })}
          </span>
        </div>
      </Card>

      {sales.deals.length === 0 ? (
        <Empty>
          {t('No deals yet. Find leads: local businesses and buyers who might pay for {name}.', {
            name: c.name,
          })}
        </Empty>
      ) : (
        <>
          <StageChips
            sales={sales}
            filter={filter}
            setFilter={setFilter}
            owner={owner}
            setOwner={setOwner}
            salesStaff={salesStaff}
          />
          <div className="sales-board" aria-label={t('Deals by stage')} data-filter={filter}>
            {groups.map(({ id, deals }) => (
              <section key={id} className="sales-col" data-stage={id} aria-label={stageLabel(id)}>
                <h3 className="sales-col-head">
                  {stageLabel(id)} <span className="muted">· {deals.length}</span>
                </h3>
                {deals.map((d) => (
                  <DealCard
                    key={d.id}
                    d={d}
                    cur={cur}
                    c={c}
                    hoursLeft={hoursLeft}
                    onTalk={setTalkDeal}
                    onFindLeads={blocker ? undefined : () => void prospect()}
                  />
                ))}
              </section>
            ))}
            {groups.length === 0 && (
              <p className="small muted sales-none" data-sales-none>
                {filter === 'all'
                  ? t('No deals to show.')
                  : t('No deals at this stage: tap “All open” to see the rest.')}
              </p>
            )}
          </div>
        </>
      )}

      {sales.accounts.length > 0 && (
        <Card title={t('Customers from your pipeline')}>
          <ul className="list" aria-label={t('Customers from your pipeline')}>
            {sales.accounts.map((a) => (
              <li key={a.dealId} className="spread" data-account={a.dealId}>
                <span>
                  {a.name}
                  {a.committedUntil !== undefined && (
                    <span className="small muted">
                      {' · '}
                      {t('committed to {month}', { month: gameMonth(a.committedUntil) })}
                    </span>
                  )}
                </span>
                <span>{t('{amount}/month', { amount: money(a.monthly, cur) })}</span>
              </li>
            ))}
          </ul>
          <p className="small muted">
            {t('They’re invoiced every month and pay on 30–90 day terms.')}
          </p>
        </Card>
      )}
    </div>
  );
}

/** What the board shows: every open stage, a stage, or the won or lost deals. */
type BoardFilter = 'all' | Stage;

/** The groups of deal cards for a filter: empty stages are left out (their chip says 0). */
function boardGroups(stages: readonly Stage[], deals: DealV[], filter: BoardFilter) {
  const ids: Stage[] = filter === 'all' ? [...stages, 'won', 'lost'] : [filter];
  return ids
    .map((id) => ({
      id,
      deals: deals
        .filter((d) =>
          id === 'won' || id === 'lost'
            ? d.stage === id && d.monthsLeft === null
            : d.stage === id && d.monthsLeft !== null,
        )
        .sort((a, b) => (id === 'won' || id === 'lost' ? b.createdMonth - a.createdMonth : 0)),
    }))
    .filter((g) => g.deals.length > 0);
}

/**
 * The stage chips (round 7, player feedback: empty stages showed as thin
 * strips with turned labels): All open, each stage with its count (empty
 * ones dimmed), Won and Lost. A tap filters the board to that stage. With
 * salespeople, owner chips too: yours, or one person's. Scrolls sideways on
 * a phone.
 */
function StageChips({
  sales,
  filter,
  setFilter,
  owner,
  setOwner,
  salesStaff,
}: {
  sales: Sales;
  filter: BoardFilter;
  setFilter: (f: BoardFilter) => void;
  owner: string | null;
  setOwner: (o: string | null) => void;
  salesStaff: { id: string; name: string }[];
}) {
  const count = (st: Stage) =>
    sales.deals.filter((d) =>
      st === 'won' || st === 'lost'
        ? d.stage === st && d.monthsLeft === null
        : d.stage === st && d.monthsLeft !== null,
    ).length;
  const open = sales.deals.filter((d) => d.monthsLeft !== null).length;
  const chip = (id: BoardFilter, label: string, n: number, extra = '') => (
    <button
      key={id}
      type="button"
      className={`sales-stage${n ? '' : ' is-empty'}${filter === id ? ' is-on' : ''}${extra}`}
      aria-pressed={filter === id}
      aria-label={t('{stage}: {n} deals', { stage: label, n })}
      data-chip={id}
      onClick={() => setFilter(id)}
    >
      {label}
      <span className="n" aria-hidden="true">
        {n}
      </span>
    </button>
  );
  const owners = salesStaff.length > 0 && sales.deals.some((d) => d.owner);
  return (
    <nav className="sales-stages" aria-label={t('Stages')} data-sales-stages>
      {chip('all', t('All open'), open)}
      <span className="sales-stage-sep" aria-hidden="true" />
      {sales.stages.map((st) => chip(st, stageLabel(st), count(st)))}
      <span className="sales-stage-sep" aria-hidden="true" />
      {chip('won', stageLabel('won'), count('won'), ' won')}
      {chip('lost', stageLabel('lost'), count('lost'), ' lost')}
      {owners && (
        <>
          <span className="sales-stage-sep" aria-hidden="true" />
          {salesStaff.map((s) => {
            const n = sales.deals.filter((d) => d.owner?.id === s.id).length;
            return (
              <button
                key={s.id}
                type="button"
                className={`sales-stage owner${owner === s.id ? ' is-on' : ''}${n ? '' : ' is-empty'}`}
                aria-pressed={owner === s.id}
                data-chip-owner={s.id}
                onClick={() => setOwner(owner === s.id ? null : s.id)}
              >
                {t('{name}’s', { name: s.name.split(' ')[0]! })}
                <span className="n">{n}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`sales-stage owner${owner === 'me' ? ' is-on' : ''}`}
            aria-pressed={owner === 'me'}
            data-chip-owner="me"
            onClick={() => setOwner(owner === 'me' ? null : 'me')}
          >
            {t('Mine')}
            <span className="n">{sales.deals.filter((d) => !d.owner).length}</span>
          </button>
        </>
      )}
    </nav>
  );
}

function DealCard({
  d,
  cur,
  c,
  hoursLeft,
  onTalk,
  onFindLeads,
}: {
  d: DealV;
  cur: string;
  c: Company;
  hoursLeft: number;
  onTalk: (dealId: string) => void;
  onFindLeads?: () => void;
}) {
  const { send, busy } = useView();
  const companyId = c.id;
  const salesStaff = c.staff
    .filter((s) => s.role === 'sales')
    .map((s) => ({ id: s.id, name: s.name, skill: s.skill }));
  const [pending, setPending] = useState<Action | null>(null);
  const [price, setPrice] = useState(amountInput(d.price ?? d.listPrice));
  const [discount, setDiscount] = useState(Math.max(d.discountPct, 10));
  const k = d.known;
  const p = Math.round(d.probability * 100);
  const tone = p >= 60 ? 'good' : p >= 35 ? 'warn' : 'bad';
  // Feedback note: the price, the discount and the close happen in a sales conversation.
  const talk = d.talk;
  // Round 7: a lost deal's "Try again" sits with what to do next (SalesReasons.tsx).
  const retryInLoss = !!d.loss && d.canRecover && d.loss.reason !== 'trust';
  const actions = (
    talk ? d.actions.filter((a) => !TALK_STEPS.includes(a.action)) : d.actions
  ).filter((a) => !(retryInLoss && a.action === 'recover'));
  const talkFirst = !!talk?.canStart && (TALK_FIRST.includes(d.stage) || !!talk.step);
  const primary = talkFirst
    ? null
    : d.next && actions.some((a) => a.action === d.next!.action)
      ? d.next
      : (actions[0] ?? null);
  const others = actions.filter((a) => a.action !== primary?.action);
  const run = (a: Action) => {
    const cmd: Command = {
      type: 'sales.advance',
      companyId,
      dealId: d.id,
      action: a,
      ...(a === 'propose' ? { price: parseAmount(price) ?? d.listPrice } : {}),
      ...(a === 'negotiate' ? { discountPct: discount } : {}),
    };
    setPending(null);
    void send<{ won?: boolean; monthly?: number; lossReason?: LossReasonId }>(cmd, (r) =>
      a === 'close'
        ? r.won
          ? t('{name} signed! {amount}/mo from next month.', {
              name: d.name,
              amount: money(r.monthly ?? 0, cur),
            })
          : t('{name} said no: {reason}.', {
              name: d.name,
              reason: r.lossReason ? lossLabel(r.lossReason).toLowerCase() : '',
            })
        : a === 'discover'
          ? t('You learned what {name} needs.', { name: d.name })
          : null,
    );
  };
  const step = pending ? d.actions.find((x) => x.action === pending) : undefined;
  return (
    <article
      className={`sales-deal sales-${d.stage}`}
      data-deal={d.id}
      data-deal-stage={d.stage}
      aria-label={d.name}
    >
      <header className="sales-deal-head">
        <strong>{d.name}</strong>
        <span className="small muted">
          {d.contact} · {tx(d.businessKind ?? d.segment)}
        </span>
      </header>
      <div className="sales-deal-line small">
        <span>
          {d.valueGuess
            ? t('about {amount}/mo', { amount: money(d.value, cur) })
            : t('{amount}/mo', { amount: money(d.value, cur) })}
        </span>
        {d.monthsLeft !== null && (
          <span className={d.monthsLeft === 0 ? 'bad' : 'muted'}>
            {d.monthsLeft === 0
              ? t('Last month to close')
              : t('{n} months to close', { n: d.monthsLeft })}
          </span>
        )}
      </div>
      {(d.owner || (d.monthsLeft !== null && salesStaff.length > 0)) && (
        <DealOwner
          d={d}
          staff={salesStaff}
          brings={c.teamBrings}
          busy={busy}
          onAssign={(staffId) =>
            void send(
              {
                type: 'sales.assign',
                companyId,
                dealId: d.id,
                ...(staffId ? { staffId } : {}),
              },
              staffId
                ? t('{name} is handling it now.', {
                    name: salesStaff.find((s) => s.id === staffId)?.name.split(' ')[0] ?? '',
                  })
                : t('You’re handling it now.'),
            )
          }
          onDelegate={(staffId) =>
            void send({
              type: 'sales.talk',
              companyId,
              dealId: d.id,
              action: 'delegate',
              staffId,
            }).then((r) => r && onTalk(d.id))
          }
        />
      )}
      <KnownFacts k={k} cur={cur} />
      {d.stage !== 'won' && d.stage !== 'lost' && (
        <div
          className={`sales-meter tone-${tone}`}
          role="meter"
          aria-label={t('Chance to win')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={p}
        >
          <span className="small">
            {d.estimate ? t('Chance to win (a guess until discovery)') : t('Chance to win')}
          </span>
          <span className="sales-meter-track">
            <span className="sales-meter-fill" style={{ width: `${p}%` }} />
          </span>
          <span className="sales-meter-n">{p}%</span>
        </div>
      )}
      {d.demoScore !== null &&
        (d.demoParts ? (
          <DemoBreakdown parts={d.demoParts} score={d.demoScore} />
        ) : (
          <p className="small muted">{t('Demo went {score}', { score: pct(d.demoScore) })}</p>
        ))}
      {d.stage === 'won' &&
        (d.churned ? (
          <p className="bad small" data-deal-churned={d.churned.reason}>
            <strong>{t('Stopped buying')}</strong>
            {' · '}
            {churnLabel(d.churned.reason)}
          </p>
        ) : (
          <p className="good small">{t('Signed: a paying customer.')}</p>
        ))}
      {d.stage === 'lost' && d.lossReason && (
        <div className="sales-loss" role="status">
          <strong className="bad small">
            {d.expired
              ? t('Ran out of time')
              : t('Lost: {reason}', { reason: lossLabel(d.lossReason) })}
          </strong>
          {d.loss ? (
            <LossReason
              d={d}
              heading={false}
              onRetry={
                d.actions.some((a) => a.action === 'recover')
                  ? () => setPending('recover')
                  : undefined
              }
              onFindLeads={onFindLeads}
              onRoadmap={() => openCompanyTab('roadmap')}
            />
          ) : d.canRecover ? (
            <span className="small">{lossAdvice(d.lossReason)}</span>
          ) : (
            <span className="small muted">{t('This one is gone. Find new leads.')}</span>
          )}
        </div>
      )}

      {step ? (
        <div className="sales-confirm" data-confirm={step.action}>
          <strong className="small">{actionLabel(step.action)}</strong>
          <span className="small muted">{actionWhy(step.action)}</span>
          {step.action === 'propose' && (
            <Field
              label={t('Monthly price')}
              hint={
                k.budgetMax !== null && k.budgetMin !== null
                  ? t('Their budget: {min}–{max}/mo', {
                      min: money(k.budgetMin, cur),
                      max: money(k.budgetMax, cur),
                    })
                  : t('Your list price is {amount}/mo', { amount: money(d.listPrice, cur) })
              }
            >
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              )}
            </Field>
          )}
          {step.action === 'negotiate' && (
            <label className="sales-discount small">
              {t('Discount: {n}%', { n: discount })}
              <input
                type="range"
                min={0}
                max={40}
                step={5}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                aria-label={t('Discount')}
              />
              <span className="muted">
                {t('They’d pay {amount}/mo', {
                  amount: money(Math.round((d.price ?? d.listPrice) * (1 - discount / 100)), cur),
                })}
              </span>
            </label>
          )}
          <span className="small" data-cost>
            {step.cost > 0
              ? t('Takes {h}h and costs {amount}.', {
                  h: step.hours,
                  amount: money(step.cost, cur),
                })
              : t('Takes {h}h.', { h: step.hours })}
          </span>
          <div className="row">
            <Button size="sm" onClick={() => run(step.action)} disabled={hoursLeft < step.hours}>
              {t('Confirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              {t('Cancel')}
            </Button>
          </div>
          {hoursLeft < step.hours && (
            <span className="small bad">{t('Not enough hours left this month.')}</span>
          )}
        </div>
      ) : (
        (actions.length > 0 || talk?.canStart || talk?.result) && (
          <div className="sales-actions">
            {talk?.canStart && (
              <Button
                size="sm"
                variant={talkFirst ? 'primary' : 'subtle'}
                data-action="talk"
                onClick={() => onTalk(d.id)}
              >
                {talk.step ? t('Continue the conversation') : t('Sales conversation')}
              </Button>
            )}
            {talk?.result && (
              <Button
                size="sm"
                variant="subtle"
                data-action="talk-result"
                onClick={() => onTalk(d.id)}
              >
                {t('How the conversation went ({n}/100)', { n: talk.result.score })}
              </Button>
            )}
            {primary && (
              <Button
                size="sm"
                data-action={primary.action}
                onClick={() => setPending(primary.action)}
              >
                {actionLabel(primary.action)}
              </Button>
            )}
            {others.map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant="subtle"
                data-action={a.action}
                onClick={() => setPending(a.action)}
              >
                {actionLabel(a.action)}
              </Button>
            ))}
          </div>
        )
      )}
      {d.stage !== 'won' && !step && (
        <div className="sales-drop">
          <Confirm
            label={t('Drop')}
            confirmLabel={t('Drop this deal')}
            onConfirm={() =>
              void send({ type: 'sales.drop', companyId, dealId: d.id }, t('Deal dropped.'))
            }
          />
        </div>
      )}
    </article>
  );
}

/**
 * What you know about a customer. Before discovery most of it is '?': those
 * rows fold into one line, "N things to find out" (they stay in the page,
 * hidden, so the card reads the same to a screen reader once known).
 */
function KnownFacts({ k, cur }: { k: DealV['known']; cur: string }) {
  const rows: { id: string; label: string; value: string }[] = [
    { id: 'need', label: t('Needs'), value: needLabel(k.need) },
    {
      id: 'budget',
      label: t('Budget'),
      value:
        k.budgetMin === null || k.budgetMax === null
          ? '?'
          : t('{min}–{max}/mo', { min: money(k.budgetMin, cur), max: money(k.budgetMax, cur) }),
    },
    { id: 'authority', label: t('Can sign alone'), value: level(k.authority) },
    { id: 'urgency', label: t('Urgency'), value: level(k.urgency) },
    { id: 'current', label: t('Uses today'), value: currentLabel(k) },
    { id: 'trust', label: t('Trust'), value: level(k.trust) },
  ];
  const unknown = rows.filter((r) => r.value === '?').length;
  return (
    <>
      <dl className="sales-known" aria-label={t('What you know')}>
        {rows.map((r) => (
          <div key={r.id} className={r.value === '?' ? 'is-unknown' : undefined}>
            <dt>{r.label}</dt>
            <dd data-known={r.id}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {unknown > 0 && (
        <p className="sales-tofind" data-tofind={unknown}>
          {unknown === 1
            ? t('1 thing to find out: a discovery meeting tells you.')
            : t(
                '{n} things to find out: needs, budget, who signs… (a discovery meeting tells you)',
                {
                  n: unknown,
                },
              )}
        </p>
      )}
    </>
  );
}

/** Feedback note: steps a sales conversation replaces, and stages where it is the next step. */
const TALK_STEPS: Action[] = ['propose', 'negotiate', 'close'];
const TALK_FIRST: Stage[] = ['demo', 'proposal', 'negotiation'];

const STAGE_ORDER: Stage[] = ['lead', 'contacted', 'discovery', 'demo', 'proposal', 'negotiation'];
/** The step the tutorial suggests at each stage (contact → discover → demo → propose → close). */
const COACH_ACTION: Partial<Record<Stage, Action>> = {
  lead: 'contact',
  contacted: 'discover',
  discovery: 'demo',
  demo: 'propose',
  proposal: 'close',
  negotiation: 'close',
};
const coachText = (a: Action, name: string) =>
  ({
    contact: t('Call {name} first: a friendly call builds trust.', { name }),
    discover: t(
      'Book a discovery meeting: you learn their budget, what they need and who decides.',
    ),
    demo: t('Show a demo. A product that fits how they work wins them over.'),
    propose: t('Send a proposal. A price inside their budget is safer.'),
    negotiate: t('Offer a small discount if the price is the problem.'),
    close: t('Ask for the deal. It can still go either way: that’s sales.'),
    recover: t('One more try.'),
  })[a];

/**
 * Founder Journey 6: coaching for the first sale (only while the tutorial
 * runs). One tip at a time, with a ring on the button to press. After a
 * loss: the objection, and the one recovery attempt.
 */
function SalesCoach({ sales, blocked }: { sales: Sales; blocked: boolean }) {
  const { view } = useView();
  const id = view.me.id;
  useTutorial(id);
  const on = activeStep(id) === 'sale';
  let text: string | null = null;
  let target: string | null = null;
  let giveUp = false;
  if (on) {
    const open = sales.deals
      .filter((d) => d.monthsLeft !== null)
      .sort((a, b) => STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage));
    const lost = sales.deals.filter((d) => d.stage === 'lost');
    const retry = lost.find((d) => d.canRecover);
    // Feedback note: from the demo on, the next step is the sales conversation.
    const talkNext = (d: DealV) => !!d.talk?.canStart && TALK_FIRST.includes(d.stage);
    const best = open.find((d) => {
      if (talkNext(d)) return true;
      const a = COACH_ACTION[d.stage];
      return a && d.actions.some((x) => x.action === a);
    });
    if (sales.accounts.length > 0) {
      text = t('Signed! Close the phone: your first payment is waiting.');
    } else if (retry) {
      text = t('{name} said no: {reason}. {advice}', {
        name: retry.name,
        reason: retry.lossReason ? lossLabel(retry.lossReason).toLowerCase() : '',
        advice: retry.lossReason ? lossAdvice(retry.lossReason) : '',
      });
      const base = `[data-deal="${retry.id}"]`;
      target = `${base} [data-confirm] button, ${base} button[data-action="recover"]`;
    } else if (best && talkNext(best)) {
      text = t(
        'Sit down with {name}: lead with what they need, name a price in their budget, and ask for the deal.',
        {
          name: best.name,
        },
      );
      target = `[data-deal="${best.id}"] button[data-action="talk"]`;
    } else if (best) {
      const a = COACH_ACTION[best.stage]!;
      text = coachText(a, best.name);
      const base = `[data-deal="${best.id}"]`;
      target = `${base} [data-confirm] button, ${base} button[data-action="${a}"]`;
    } else if (!blocked) {
      text =
        lost.length > 0
          ? t('That one is gone. Find new leads and try again.')
          : t('Tap “Find new leads”: local businesses that might buy from you.');
      target = '[data-sales] .sales-prospect button';
      giveUp = lost.length > 0;
    } else {
      text = t('No more prospecting this month.');
      giveUp = true;
    }
  }
  useSpotlight(target);
  if (!on || !text) return null;
  return (
    <div className="coach-tip sales-coach" role="note" data-coach-tip="sales">
      <span>
        <span aria-hidden="true">💡 </span>
        {text}
      </span>
      {giveUp && (
        <Button size="sm" variant="ghost" onClick={() => setTutorial(id, { noSale: true })}>
          {t('Go on without a sale')}
        </Button>
      )}
    </div>
  );
}
