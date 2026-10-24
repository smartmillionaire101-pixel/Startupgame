/**
 * Founder guidance (the engine's founderguide.ts), the founder's answer to
 * the banker's licence tracker:
 *
 * - The stage tracker at the top of the Company screen: Idea → First
 *   customers → Product fit → Seed → Growth → Series A, the current stage's
 *   checklist with a progress bar, the next step and the stages to come.
 * - Live checks on pricing, spend and payroll (good / warn / bad, with the
 *   figures), run as the founder types, like the bank business-plan checks.
 * - A scored pitch result (each answer, the best answer and why, and the real
 *   reason a fund passed with how to fix it), a demo breakdown and the best
 *   candidate to offer so far.
 * - A mentor at the Hub who explains the current stage.
 */
import './founderguide.css';
import {
  DEMO_WEIGHTS,
  bestCandidate,
  founderPlanChecks,
  type FounderCheck,
  type FounderPlanInput,
  type FounderStageId,
  type FounderTask,
  type PlayerView,
} from '@runway/engine';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company } from '../store';
import { Button, Card, Pill } from '../ui';
import { useJourneyGo } from '../city/journeyGo';

type Pitch = PlayerView['pitches'][number];
type Sales = Company['sales'];
type DemoParts = NonNullable<Sales['deals'][number]['demoParts']>;

// ---------------------------------------------------------------- copy

export const stageTitle = (id: FounderStageId) =>
  ({
    idea: t('Idea'),
    'first-customers': t('First customers'),
    'product-fit': t('Product fit'),
    seed: t('Seed'),
    growth: t('Growth'),
    'series-a': t('Series A'),
  })[id];

const stageIcon = (id: FounderStageId) =>
  ({
    idea: '💡',
    'first-customers': '🧺',
    'product-fit': '🎯',
    seed: '🌱',
    growth: '📈',
    'series-a': '🏙',
  })[id];

/** What finishing a stage gets you: the reason to do the checklist. */
const stageWhy = (id: FounderStageId) =>
  ({
    idea: t(
      'you know who has the problem and what they would pay, so every sale after this is easier.',
    ),
    'first-customers': t(
      'people pay and stay: proof the idea works, and investors start to listen.',
    ),
    'product-fit': t('customers come back and tell others, which is what Seed investors look for.'),
    seed: t('money in the bank, or a profit, buys you a year to grow without panic.'),
    growth: t('a business that grows and pays its way is ready for a Series A.'),
    'series-a': t('a company that leads its city and sells in another.'),
  })[id];

/** The mentor's talk about a stage: what it is about, and the rule to keep. */
const stageLesson = (id: FounderStageId) =>
  ({
    idea: t(
      'Before you build more, find out who has the problem and what they pay to fix it today. Talk to customers at the Market, set a price inside their budget, and get one real lead into your Sales pipeline.',
    ),
    'first-customers': t(
      'Now prove people pay. Five customers who pay and stay beat a hundred who try it once. Charge more than each customer costs you, or every new customer digs the hole deeper.',
    ),
    'product-fit': t(
      'Product fit is when customers come back and tell others. Watch three things: product fit above 60%, revenue that grows month after month, and a small team so you are not doing everything yourself.',
    ),
    seed: t(
      'Raise when you have numbers to show, not before. When a fund passes it tells you why: fix that and pitch again. Keep a year of money so you never raise in a panic.',
    ),
    growth: t(
      'Growth costs money: every hire and every marketing push must pay for itself. Compare what a customer costs to win with what they pay you each month.',
    ),
    'series-a': t(
      'Series A funds want a business that leads its city and travels. Open in a second city, keep revenue climbing, and give honest numbers in every pitch.',
    ),
  })[id];

const fmt = (x: FounderTask, cur: string, v?: number) =>
  x.money ? money(v ?? 0, cur) : String(v ?? 0);

/** A task's label (with its figures) and why it matters. */
export function taskCopy(x: FounderTask, cur: string): { label: string; why: string } {
  const have = fmt(x, cur, x.have);
  const need = fmt(x, cur, x.need);
  switch (x.id) {
    case 'idea.discovery':
      return {
        label: t('Talk to customers about their problem ({have}% of {need}% known)', {
          have,
          need,
        }),
        why: t(
          'Interviews at the Market show what customers need and would pay for, so you build the right thing.',
        ),
      };
    case 'idea.price':
      return {
        label: t('Set a price your customers can afford'),
        why: t('A price above their budget wins few customers and loses them fast.'),
      };
    case 'idea.lead':
      return {
        label: t('Find your first sales lead'),
        why: t('Your Sales pipeline turns a name into a paying customer, one step at a time.'),
      };
    case 'first.customer':
      return {
        label: t('Win your first paying customer'),
        why: t('One customer who pays proves someone wants this.'),
      };
    case 'first.customers':
    case 'fit.customers':
      return {
        label: t('Reach {need} paying customers ({have} now)', { have, need }),
        why:
          x.id === 'first.customers'
            ? t('A handful of customers shows it wasn’t luck.')
            : t('Fifty customers is a market, not a few friends.'),
      };
    case 'first.revenue':
    case 'growth.revenue':
    case 'a.revenue':
      return {
        label: t('Reach {need} revenue in a month · now {have}', { have, need }),
        why: t('Monthly revenue pays the bills, and it is the first number investors ask for.'),
      };
    case 'first.margin':
      return {
        label: t('Charge more than each customer costs you'),
        why: t('If customers cost more than they pay, more customers make it worse.'),
      };
    case 'first.retention':
      return {
        label: t('Keep {need}% of your customers each month ({have}% now)', { have, need }),
        why: t(
          'Customers who stay prove the product works. Poor reliability and high prices make them leave.',
        ),
      };
    case 'fit.product':
      return {
        label: t('Product fit of {need}% ({have}% now)', { have, need }),
        why: t('Build what customers ask for: the Roadmap and customer interviews raise fit.'),
      };
    case 'fit.growth':
      return {
        label: t('Grow revenue {need} months in a row ({have} so far)', { have, need }),
        why: t('Growth month after month shows the market wants more.'),
      };
    case 'fit.team':
    case 'growth.team':
      return {
        label: t('Build a team of {need} ({have} now)', { have, need }),
        why: t(
          'You can’t sell, build and support alone. Hire for the job that takes most of your time.',
        ),
      };
    case 'seed.pitch':
      return {
        label: t('Pitch an investor, an accelerator or a grant'),
        why: t('Investors decide on your numbers: pitch once you have customers to show.'),
      };
    case 'seed.raise':
      return {
        label: t('Raise money, or turn a profit'),
        why: t('Outside money buys time to grow; a profit means you don’t need it.'),
      };
    case 'seed.runway':
      return {
        label: t('Have {need} months of money ({have} now)', { have, need }),
        why: t('Raising takes months. A year of money means you never raise in a panic.'),
      };
    case 'growth.profit':
      return {
        label: t('Have a profitable month'),
        why: t('Earning more than you spend means you choose when to raise.'),
      };
    case 'a.city':
      return {
        label: t('Sell in a second city'),
        why: t('A second city proves the business travels: Series A investors pay for that.'),
      };
    case 'a.raise':
      return {
        label: t('Raise a Series A'),
        why: t('The big round: funds want growth, a team and a second city.'),
      };
    default:
      return { label: x.id, why: '' };
  }
}

/** What is left to close a task, in one short line. */
function taskGap(x: FounderTask, cur: string): string | null {
  if (x.have === undefined || x.need === undefined || x.have >= x.need) return null;
  const left = x.need - x.have;
  if (x.money) return t('{amount} more revenue a month closes this', { amount: money(left, cur) });
  if (x.id === 'fit.product' || x.id === 'first.retention' || x.id === 'idea.discovery')
    return t('{n} points to go', { n: left });
  return t('{n} more to go', { n: left });
}

// ---------------------------------------------------------------- the stage tracker

/** "Your stage": the stepper, the checklist and its bar, the next step and the stages to come. */
export function StageTracker({ c }: { c: Company }) {
  const g = c.guide;
  const goTo = useJourneyGo();
  const cur = c.currency;
  const current = g.stages[g.index]!;
  const done = current.tasks.filter((x) => x.done).length;
  const total = current.tasks.length;
  const next = g.stages[g.index + 1];
  const upcoming = g.stages.filter((s) => s.status === 'upcoming');
  return (
    <>
      <Card
        className="fg-tracker"
        title={
          <>
            <span aria-hidden="true">🚩</span> {t('Your stage')}
          </>
        }
        action={
          <Pill tone="good">
            {t('Stage {n} of {total}', { n: g.index + 1, total: g.stages.length })}
          </Pill>
        }
      >
        <div data-founder-stage={g.stage}>
          <ol className="fg-steps" aria-label={t('Founder stages')}>
            {g.stages.map((s) => (
              <li
                key={s.id}
                className={`fg-step fg-${s.status}`}
                aria-current={s.status === 'current' ? 'step' : undefined}
              >
                <span className="fg-dot" aria-hidden="true">
                  {s.status === 'done' ? '✓' : ''}
                </span>
                <span className="fg-step-name">{stageTitle(s.id)}</span>
              </li>
            ))}
          </ol>
          <h3 className="fg-count">
            {g.complete
              ? t('Every stage done')
              : t('{stage}: {done} of {total} done', {
                  stage: stageTitle(current.id),
                  done,
                  total,
                })}
          </h3>
          <div
            className="fg-bar"
            role="progressbar"
            aria-label={t('Stage progress')}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <span style={{ width: `${Math.round((done / Math.max(1, total)) * 100)}%` }} />
          </div>
          <ul className="fg-tasks">
            {current.tasks.map((x, i) => {
              const copy = taskCopy(x, cur);
              const isNext = g.next?.id === x.id;
              return (
                <li
                  key={x.id}
                  className={`fg-task${x.done ? ' fg-task-done' : ''}${isNext ? ' fg-task-next' : ''}`}
                  data-task={x.id}
                  data-done={x.done ? '' : undefined}
                >
                  <span className="fg-task-mark" aria-hidden="true">
                    {x.done ? '✓' : i + 1}
                  </span>
                  <span>
                    {copy.label}
                    {isNext && <span className="fg-task-why small muted">{copy.why}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {next && !g.complete && (
            <p className="small fg-unlock">
              {t('Finish all {n} to move to {stage}: {why}', {
                n: total,
                stage: stageTitle(next.id),
                why: stageWhy(current.id),
              })}
            </p>
          )}
          <p className="small muted">
            {t('Your mentor at the Hub explains this stage and what to do first.')}
          </p>
        </div>
      </Card>
      {g.next && (
        <Card title={t('Next step')} className="fg-next">
          <button
            type="button"
            className="fg-next-btn"
            data-next-task={g.next.id}
            onClick={() => g.next?.go && goTo(g.next.go)}
            disabled={!g.next.go}
          >
            <span className="fg-next-icon" aria-hidden="true">
              {stageIcon(g.stage)}
            </span>
            <span className="fg-next-text">
              <b>{taskCopy(g.next, cur).label}</b>
              <span className="small muted">
                {taskGap(g.next, cur) ?? taskCopy(g.next, cur).why}
              </span>
            </span>
            {g.next.go && (
              <span className="fg-next-go" aria-hidden="true">
                ›
              </span>
            )}
          </button>
        </Card>
      )}
      {upcoming.length > 0 && (
        <Card title={t('Coming stages')} className="fg-coming">
          <ul className="fg-coming-list">
            {upcoming.map((s, i) => (
              <li key={s.id} className={i === 0 ? '' : 'fg-later'} data-coming={s.id}>
                <span className="fg-coming-icon" aria-hidden="true">
                  {stageIcon(s.id)}
                </span>
                <span>
                  <b>{stageTitle(s.id)}</b>
                  <span className="small muted">
                    {s.tasks.map((x) => taskCopy(x, cur).label).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- live checks

const checkTitle = (id: FounderCheck['id']) =>
  ({
    budget: t('Customers can pay it'),
    margin: t('Covers your costs'),
    runway: t('Money lasts'),
    payroll: t('Salaries'),
    marketing: t('Marketing pays back'),
  })[id];

const monthsText = (m: number) =>
  m < 0 ? t('never runs out') : t('{n} months', { n: m.toFixed(m < 10 ? 1 : 0) });

/** One check in words, with its figures. */
export function checkText(ch: FounderCheck, cur: string): string {
  const v = ch.values;
  const m = (k: string) => money(v[k] ?? 0, cur);
  switch (ch.id) {
    case 'budget':
      return ch.level === 'good'
        ? t('Your price {price} is inside their budget of {min}–{max} a month.', {
            price: m('price'),
            min: m('budgetMin'),
            max: m('budgetMax'),
          })
        : (v.price ?? 0) < (v.budgetMin ?? 0)
          ? t(
              '{price} is far below their budget of {min}–{max}: you leave money on the table. Try about {suggested}.',
              {
                price: m('price'),
                min: m('budgetMin'),
                max: m('budgetMax'),
                suggested: m('suggested'),
              },
            )
          : t(
              '{price} is above their budget of {min}–{max}: few will buy and more will leave. Try about {suggested}.',
              {
                price: m('price'),
                min: m('budgetMin'),
                max: m('budgetMax'),
                suggested: m('suggested'),
              },
            );
    case 'margin':
      return (v.margin ?? 0) <= 0
        ? t('Each customer costs {cost} to serve and pays {price}: every sale loses {loss}.', {
            cost: m('cost'),
            price: m('price'),
            loss: money(-(v.margin ?? 0), cur),
          })
        : t(
            'Each customer leaves {margin} after the {cost} it costs to serve them. {n} customers cover your {fixed} of monthly costs (you have {have}).',
            {
              margin: m('margin'),
              cost: m('cost'),
              n: v.breakEven ?? 0,
              fixed: m('fixed'),
              have: v.customers ?? 0,
            },
          );
    case 'runway':
      return (v.months ?? 0) < 0
        ? t('You earn more than you spend: the money never runs out.')
        : t('You spend {burn} a month more than you earn: {cash} lasts {months}.', {
            burn: m('burn'),
            cash: m('cash'),
            months: monthsText(v.months ?? 0),
          });
    case 'payroll':
      return (v.months ?? 0) < 0
        ? t('Revenue covers the {pay} of salaries each month.', { pay: m('pay') })
        : t('Salaries of {pay} a month alone use up your money in {months}.', {
            pay: m('pay'),
            months: monthsText(v.months ?? 0),
          });
    case 'marketing':
      if (!v.marketing)
        return t('No marketing budget: only your own outreach and word of mouth bring customers.');
      if (v.cac)
        return t('Last month each customer from marketing cost {cac}: it pays back in {months}.', {
          cac: m('cac'),
          months: monthsText(v.payback ?? 0),
        });
      if (v.spent)
        return t(
          'Last month {spent} of marketing won no customers yet. Check your price and fit.',
          {
            spent: m('spent'),
          },
        );
      return t('{marketing} a month, {share}% of what you spend.', {
        marketing: m('marketing'),
        share: v.share ?? 0,
      });
  }
}

const levelIcon = (l: string) => (l === 'good' ? '✓' : l === 'warn' ? '!' : '✕');

/** The checks as a list (the bank plan checks' look), worst first when asked. */
export function PlanChecks({
  checks,
  cur,
  only,
}: {
  checks: FounderCheck[];
  cur: string;
  /** Show just these checks. */
  only?: FounderCheck['id'][];
}) {
  const shown = only ? checks.filter((c) => only.includes(c.id)) : checks;
  return (
    <ul className="fg-checks" aria-label={t('Checks')}>
      {shown.map((c) => (
        <li
          key={c.id}
          className={`fg-check fg-check-${c.level}`}
          data-founder-check={c.id}
          data-level={c.level}
        >
          <span className="fg-check-icon" aria-hidden="true">
            {levelIcon(c.level)}
          </span>
          <span>
            <b>{checkTitle(c.id)}</b> <span className="small">{checkText(c, cur)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The live checks for what's typed in Pricing and spend (and an offer on the table). */
export function livePlanChecks(
  c: Company,
  typed: { price?: number; marketing?: number; founderSalary?: number; extraPayroll?: number },
): FounderCheck[] {
  const input: FounderPlanInput = {
    ...c.planBase,
    price: typed.price ?? c.price,
    marketing: typed.marketing ?? c.marketingBudget,
    founderSalary: typed.founderSalary ?? c.founderSalary,
    ...(typed.extraPayroll ? { extraPayroll: typed.extraPayroll } : {}),
  };
  return founderPlanChecks(input);
}

/** The worst check's headline, for the top of the card (none when all are good). */
export function CheckHeadline({ checks, cur }: { checks: FounderCheck[]; cur: string }) {
  const worst = checks.find((c) => c.level === 'bad') ?? checks.find((c) => c.level === 'warn');
  if (!worst) return null;
  const head =
    worst.id === 'margin' && (worst.values.margin ?? 0) <= 0
      ? t('Your price is below cost')
      : worst.id === 'budget'
        ? (worst.values.price ?? 0) < (worst.values.budgetMin ?? 0)
          ? t('Your price is very low')
          : t('Your price is above what customers pay')
        : worst.id === 'runway' || worst.id === 'payroll'
          ? t('Your money runs out soon')
          : worst.id === 'margin'
            ? t('Not enough customers to cover costs')
            : t('Check your marketing');
  return (
    <div className={`fg-headline fg-headline-${worst.level}`} role="status" data-check-headline="">
      <b>
        {levelIcon(worst.level)} {head}
      </b>
      <span className="small">{checkText(worst, cur)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- the mentor

const MENTORS: Record<string, string> = {
  lagos: 'Funmi Adeyemi',
  nairobi: 'Wanjiru Kamau',
  london: 'Helen Marsh',
  accra: 'Kofi Mensah',
  johannesburg: 'Thandi Nkosi',
  cairo: 'Nadia Farouk',
  kigali: 'Jean-Paul Habimana',
  dubai: 'Layla Haddad',
  'san-francisco': 'Dana Whitfield',
  freetown: 'Fatmata Kamara',
};

/** At the Hub: an accelerator mentor explains your stage, what to do next and what to watch. */
export function FounderMentor({ c }: { c: Company }) {
  const { view } = useView();
  const goTo = useJourneyGo();
  const g = c.guide;
  const cur = c.currency;
  const checks = livePlanChecks(c, {});
  const watch = checks.find((x) => x.level === 'bad') ?? checks.find((x) => x.level === 'warn');
  const next = g.next ? taskCopy(g.next, cur) : null;
  return (
    <Card title={t('Your mentor')} sub={t('Accelerator mentor')} className="fg-mentor">
      <div data-founder-mentor={g.stage}>
        <p>
          <strong>{MENTORS[view.market.id] ?? 'Sam Okafor'}</strong>{' '}
          <span className="muted small">· {t('founded two companies and sold one')}</span>
        </p>
        <p className="small fg-quote">
          “
          {t('{company} is at {stage}, stage {n} of 6.', {
            company: c.name,
            stage: stageTitle(g.stage),
            n: g.index + 1,
          })}{' '}
          {stageLesson(g.stage)}”
        </p>
        {next && g.next && (
          <p className="small">
            <b>{t('What I’d do next:')}</b> {next.label}. {next.why}
          </p>
        )}
        {watch && (
          <p className="small">
            <b>{t('Watch out:')}</b> {checkTitle(watch.id)}. {checkText(watch, cur)}
          </p>
        )}
        <p className="small muted">
          {t(
            'Each stage has a checklist on your Company screen. Tick it off and the next stage opens: guidance, not gates.',
          )}
        </p>
        {g.next?.go && (
          <Button size="sm" variant="subtle" onClick={() => g.next?.go && goTo(g.next.go)}>
            {t('Do the next step')}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the pitch result

const toneLine = (tone: string) =>
  ({
    honest: t('Honest answer: it matches what diligence finds'),
    modest: t('True but modest: you undersold yourself'),
    spin: t('Spin: not caught this time (it is, three times in four)'),
    vague: t('Dodged the question: no number'),
    caught: t('Caught in diligence: the number didn’t match'),
  })[tone] ?? tone;

const bestWhy = (qid: string) =>
  ({
    traction: t(
      'Funds count your customers in diligence. The true number, and where it is heading, beats a bigger one they will catch.',
    ),
    revenue: t(
      'Revenue is the first figure they check. Say it plainly: a strong pipeline means nothing without it.',
    ),
    runway: t(
      'They need to know how long you last without them. An honest number shows you know your costs.',
    ),
    team: t(
      'Owning what happened and saying how you fix it builds trust; brushing it off doesn’t.',
    ),
  })[qid] ?? '';

function factorLine(f: { id: string; values?: Record<string, number> }, cur: string): string {
  const v = f.values ?? {};
  switch (f.id) {
    case 'traction':
      return t('{have} customers vs the {need} they look for', {
        have: v.have ?? 0,
        need: v.need ?? 0,
      });
    case 'revenue':
      return t('{have} revenue vs the {need} they look for', {
        have: money(v.have ?? 0, cur),
        need: money(v.need ?? 0, cur),
      });
    case 'runway':
      return t('{have} months of money vs the {need} they like', {
        have: Math.round(v.have ?? 0),
        need: v.need ?? 0,
      });
    case 'team':
      return t('Said what happened and the fix');
    default:
      return toneLine(f.id);
  }
}

const verdict = (s: number) =>
  s >= 80
    ? { tone: 'good' as const, label: t('Strong') }
    : s >= 50
      ? { tone: 'warn' as const, label: t('Okay') }
      : { tone: 'bad' as const, label: t('Weak') };

/** Why a fund passed, and how to fix it (feedback note). */
export function passWhyCopy(
  w: NonNullable<Pitch['passWhy']>,
  cur: string,
): { why: string; fix: string } {
  const v = w.values;
  switch (w.id) {
    case 'traction':
      return {
        why: t('You have {have} paying customers; at this round funds look for {need}.', {
          have: v.customers ?? 0,
          need: v.need ?? 0,
        }),
        fix: t('Win more customers: your Sales pipeline and the Market.'),
      };
    case 'revenue':
      return {
        why: t('Revenue is {have} a month; funds look for {need} at this round.', {
          have: money(v.revenue ?? 0, cur),
          need: money(v.need ?? 0, cur),
        }),
        fix: t('Grow revenue first: more customers, or a better price.'),
      };
    case 'product':
      return {
        why: t('Product fit is {have}%; they want at least {need}%.', {
          have: v.fit ?? 0,
          need: v.need ?? 0,
        }),
        fix: t('Talk to customers and build what they ask for on the Roadmap.'),
      };
    case 'runway':
      return {
        why: t('Your money lasts {n} months: too short to reach the next milestone.', {
          n: v.months ?? 0,
        }),
        fix: t('Cut costs, or raise a smaller amount first.'),
      };
    case 'growth':
      return {
        why: t('Revenue grows {have}% a month; they look for {need}%.', {
          have: v.growth ?? 0,
          need: v.need ?? 0,
        }),
        fix: t('Show a few months of steady growth.'),
      };
    case 'team':
      return {
        why: t('The team looks thin: {seniors} senior people and {founders} founders.', {
          seniors: v.seniors ?? 0,
          founders: v.founders ?? 0,
        }),
        fix: t('Hire a senior person or bring in a co-founder.'),
      };
    case 'answers':
      return {
        why: t('You dodged {n} of their questions.', { n: v.vague ?? 0 }),
        fix: t('Give the real numbers: honest answers score best.'),
      };
    case 'deck':
      return {
        why: t('Your deck showed a weak slide: {slide}.', { slide: w.slide ?? '' }),
        fix: t('Lead with what is strong and leave weak slides out.'),
      };
    case 'compliance':
      return {
        why: t('You have {n} open compliance items.', { n: v.gaps ?? 0 }),
        fix: t('Fix them on the Rules tab before you raise.'),
      };
    case 'timing':
      return {
        why: t('Funds are careful right now, and your numbers were close.'),
        fix: t('Try again in a few months, or pitch a hungrier fund.'),
      };
  }
}

/** The latest scored pitch: each answer, the best answer and why, and the outcome. */
export function PitchResult({ p, cur }: { p: Pitch; cur: string }) {
  const scores = p.scores ?? [];
  if (!scores.length) return null;
  const avg = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
  const why = p.passWhy ? passWhyCopy(p.passWhy, cur) : null;
  return (
    <Card
      title={t('Pitch result: {fund}', { fund: p.fundName ?? '' })}
      action={<Pill tone={verdict(avg).tone}>{t('{n} / 100', { n: avg })}</Pill>}
      className="fg-pitch"
    >
      <div data-pitch-result={p.id}>
        {scores.map((s, i) => {
          const q = p.questions.find((x) => x.id === s.questionId);
          if (!q) return null;
          const best = q.options.find((o) => o.id === s.best);
          const pickedId = p.answers[q.id];
          const typed = p.figures?.[q.id];
          const said =
            typed !== undefined
              ? q.figure === 'money'
                ? money(typed, cur)
                : String(typed)
              : tx(q.options.find((o) => o.id === pickedId)?.label ?? '');
          const v = verdict(s.score);
          return (
            <section key={s.questionId} className="fg-answer" data-answer-score={s.score}>
              <div className="spread">
                <b className="small">
                  {t('Q{n}', { n: i + 1 })} · {tx(q.text)}
                </b>
                <Pill tone={v.tone}>{v.label}</Pill>
              </div>
              <div className="fg-score">
                <span
                  className={`fg-ring fg-ring-${v.tone}`}
                  style={{ ['--score' as string]: `${s.score}` }}
                  aria-label={t('{n} out of 100', { n: s.score })}
                >
                  {s.score}
                </span>
                <div className="fg-said">
                  <span className="fg-label small">{t('You said')}</span>
                  <span>“{said}”</span>
                </div>
              </div>
              {pickedId === s.best && typed === undefined ? (
                <p className="small good">{t('That was the best answer.')}</p>
              ) : (
                best && (
                  <div className="fg-best">
                    <span className="fg-label small">{t('Best answer')}</span>
                    <span>“{tx(best.label)}”</span>
                  </div>
                )
              )}
              <p className="small">
                <b>{t('Because:')}</b> {bestWhy(q.id)}
              </p>
              <ul className="fg-factors">
                {s.factors.map((f) => (
                  <li key={f.id} className={f.points >= 40 ? 'good' : f.points >= 20 ? '' : 'bad'}>
                    <span>{factorLine(f, cur)}</span>
                    <b>+{f.points}</b>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <p className="spread small">
          <span className="muted">{t('Pitch score')}</span>
          <b>
            {scores.map((s, i) => t('Q{n} {score}', { n: i + 1, score: s.score })).join(' · ')} ·{' '}
            {t('avg {n}', { n: avg })}
          </b>
        </p>
        {p.status === 'passed' && why && (
          <div className="fg-headline fg-headline-bad" data-pass-why={p.passWhy?.id}>
            <b>{t('Why they passed')}</b>
            <span className="small">{why.why}</span>
            <span className="small">
              <b>{t('How to fix it:')}</b> {why.fix}
            </span>
          </div>
        )}
        {p.status !== 'passed' && p.reason && <p className="small">{tx(p.reason)}</p>}
        {p.status === 'passed' && !why && <p className="small muted">{tx(p.reason)}</p>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the demo

/** What a demo score was made of, and what to work on (feedback note). */
export function DemoBreakdown({ parts, score }: { parts: DemoParts; score: number }) {
  const rows = [
    { id: 'fit', label: t('Fit for their needs'), raw: parts.fit, w: DEMO_WEIGHTS.fit },
    { id: 'quality', label: t('Product quality'), raw: parts.quality, w: DEMO_WEIGHTS.quality },
    {
      id: 'reliability',
      label: t('Reliability'),
      raw: parts.reliability,
      w: DEMO_WEIGHTS.reliability,
    },
  ];
  const weakest = rows.reduce((a, b) => (b.raw < a.raw ? b : a));
  const tip =
    weakest.id === 'fit'
      ? t('Fit was weakest: interview customers in this segment and build what they ask for.')
      : weakest.id === 'quality'
        ? t('Quality was weakest: build in Quality mode or pay down tech debt.')
        : t('Reliability was weakest: hire support or engineers, and pay down tech debt.');
  return (
    <div className="fg-demo" data-demo-breakdown="">
      <p className="small">
        <b>{t('Demo went {score}', { score: pct(score) })}</b>
      </p>
      <ul className="fg-factors">
        {rows.map((r) => (
          <li key={r.id} className={r.raw >= 0.6 ? 'good' : r.raw >= 0.4 ? '' : 'bad'}>
            <span>
              {r.label} · {pct(r.raw)}
            </span>
            <b>+{Math.round(r.raw * r.w * 100)}</b>
          </li>
        ))}
        <li className={parts.discovery ? 'good' : 'bad'}>
          <span>
            {parts.discovery
              ? t('Discovery before the demo')
              : t('No discovery first: you missed {n} points', {
                  n: Math.round(DEMO_WEIGHTS.discovery * 100),
                })}
          </span>
          <b>+{parts.discovery ? Math.round(DEMO_WEIGHTS.discovery * 100) : 0}</b>
        </li>
        <li>
          <span>{t('The day’s luck')}</span>
          <b>
            {parts.luck >= 0 ? '+' : '−'}
            {Math.abs(Math.round(parts.luck * 100))}
          </b>
        </li>
      </ul>
      <p className="small muted">{tip}</p>
    </div>
  );
}

// ---------------------------------------------------------------- hiring

type Candidate = Company['hiring']['candidates'][number];

/** The best candidate to offer so far for one role, and why. */
export function HirePick({ cands }: { cands: Candidate[] }) {
  const pick = bestCandidate(cands);
  if (!pick) return null;
  const who = cands.find((x) => x.id === pick.id)!;
  const why = {
    interview: t('Nobody is interviewed yet, and CVs flatter: interview before you choose.'),
    checked: t('Their skill is checked in an interview; the others’ is only claimed on a CV.'),
    fit: t('Strong skill for the pay, and a great fit with your team.'),
    value: t('The most skill for the salary they ask.'),
  }[pick.why];
  return (
    <p className="small fg-pick" data-hire-pick={pick.id}>
      <b>{t('Best pick so far: {name}.', { name: who.name })}</b> {why}
    </p>
  );
}
