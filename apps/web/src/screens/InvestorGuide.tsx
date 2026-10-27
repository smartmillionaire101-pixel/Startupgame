/**
 * The investor guide (the engine's investorguide.ts): what the banker
 * licence tracker does for bankers. One stage at a time from angel to family
 * office with its checklist and next step, a senior partner who explains the
 * stage's rules, live checks on a cheque as you type, and every scored
 * decision with the best call and why. `view.investorGuide`; null hides it.
 */
import { GUIDE, investChecks, type InvestCheck, type PlayerView } from '@runway/engine';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Pill } from '../ui';
import { useJourneyGo } from '../city/journeyGo';
import { objectivesFor, type JourneyGo } from '../city/journey';
import {
  guideOf,
  itemText,
  stageGoal,
  stageName,
  stageRules,
  type Decision,
} from './investorGuideCopy';
import './investorguide.css';

/** The stage tracker: where you are, what this stage takes, and a senior partner's rules. */
export function InvestorStageCard({ onGo }: { onGo?: (g: JourneyGo) => void } = {}) {
  const { view } = useView();
  const g = guideOf(view);
  const fallback = useJourneyGo();
  const go = onGo ?? fallback;
  if (!g) return null;
  const next = g.next;
  const total = g.items.length;
  return (
    <Card
      title={
        <>
          <span aria-hidden="true">🚩</span> {t('Your stage')}
        </>
      }
      action={<Pill tone="good">{stageName(g.stage)}</Pill>}
      className="ig-stage"
    >
      <div data-investor-stage={g.stage}>
        <ol className="ig-track" aria-label={t('Investor stages')}>
          {g.stages.map((s) => (
            <li
              key={s.id}
              className={`ig-${s.status}`}
              aria-current={s.status === 'now' ? 'step' : undefined}
            >
              <span className="ig-dot" aria-hidden="true">
                {s.status === 'done' ? '✓' : ''}
              </span>
              <span className="ig-name">{stageName(s.id)}</span>
            </li>
          ))}
        </ol>
        <p className="ig-goal">
          {t('{goal}: {n} of {total} done', { goal: stageGoal(g.stage), n: g.done, total })}
        </p>
        <div className="ig-progress" aria-hidden="true">
          <span style={{ width: `${(g.done / Math.max(1, total)) * 100}%` }} />
        </div>
        <ol className="ig-items" aria-label={t('Checklist')}>
          {g.items.map((x, i) => (
            <li
              key={x.id}
              className={x.done ? 'done' : x === next ? 'now' : ''}
              data-guide-item={x.id}
            >
              <span className="ig-mark" aria-hidden="true">
                {x.done ? '✓' : i + 1}
              </span>
              <span>{itemText(g.stage, x)}</span>
            </li>
          ))}
        </ol>
        {next?.go && (
          <Button size="sm" onClick={() => go(next.go!)}>
            {t('Next: do it')}
          </Button>
        )}
        <div className="ig-mentor" data-mentor="">
          <span className="ig-mentor-face" aria-hidden="true">
            🧑‍💼
          </span>
          <div>
            <b>
              {g.mentor
                ? t('{name}, senior partner at {org}', { name: g.mentor.name, org: g.mentor.org })
                : t('A senior partner')}
            </b>
            <p className="small">“{stageRules(g.stage)}”</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * "What to do now", one list for investors: the stage's next step (the same
 * main objective the Today card and the map's 💡 show), then an opportunity
 * and something personal.
 */
export function InvestorNextSteps() {
  const { view } = useView();
  const go = useJourneyGo();
  if (!guideOf(view)) return null;
  const o = objectivesFor(view);
  const list = [
    { kind: t('Main'), x: o.main },
    { kind: t('Opportunity'), x: o.opportunity },
    { kind: t('Personal'), x: o.personal },
  ].filter((r) => r.x);
  if (!list.length) return null;
  return (
    <Card title={t('What to do now')} className="career-prompts">
      <ul className="list">
        {list.map(({ kind, x }) => (
          <li key={x!.id} className="row">
            <span className="small muted">{kind}</span>{' '}
            <span>
              <span aria-hidden="true">{x!.icon}</span> {x!.label}
            </span>
            {x!.go && (
              <Button variant="ghost" onClick={() => go(x!.go!)}>
                {t('Go')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- live cheque checks

const CHECK_TITLE: Record<InvestCheck['id'], () => string> = {
  size: () => t('Size'),
  diligence: () => t('Diligence'),
  spread: () => t('Spread'),
  reserves: () => t('Reserves'),
  price: () => t('Price'),
};

const ICON = { good: '✓', warn: '!', bad: '✕' } as const;

function checkText(c: InvestCheck, cur: string, sector: string): string {
  const v = c.values;
  switch (c.id) {
    case 'size':
      return t('{amount} is {pct} (guide: ≤ {guide})', {
        amount: money(v.amount!, cur),
        pct: pct(v.share!, 0),
        guide: money(v.guide!, cur),
      });
    case 'diligence':
      return c.level === 'good' ? t('first call done') : t('no first call yet: you’d invest blind');
    case 'spread':
      if (v.companies! < 3) return t('early days: spread comes as you back more companies');
      return t('{same} of your {n} companies are {sector}', {
        same: v.same!,
        n: v.companies!,
        sector,
      });
    case 'reserves':
      return t('{left} left for follow-ons (keep about {need})', {
        left: money(v.left!, cur),
        need: money(v.need!, cur),
      });
    default:
      return t('{ratio}× their model value (fair: {lo} to {hi})', {
        ratio: v.ratio!.toFixed(2),
        lo: money(v.lo!, cur),
        hi: money(v.hi!, cur),
      });
  }
}

/** Your money in the cheque's currency for the checks, or 0 when it isn't comparable. */
function liquidFor(view: PlayerView, currency: string, personal: boolean): number {
  const g = guideOf(view);
  return g && personal && g.money.currency === currency ? g.money.liquid : 0;
}

/** A personal cheque over a tenth of your money (the check offers a smaller one). */
export function isChequeTooBig(
  view: PlayerView,
  amount: number,
  currency: string,
  personal: boolean,
): boolean {
  const liquid = liquidFor(view, currency, personal);
  return liquid > 0 && amount / liquid > GUIDE.chequeShare;
}

/**
 * The live checks on a term sheet: the cheque against your money, the price
 * against their value, sector spread and reserves. When the cheque is too
 * big it offers one under the guide, or to invest anyway.
 */
export function ChequeCheck({
  amount,
  valuation,
  currency,
  industry,
  sector,
  diligence,
  model,
  personal,
  onInvest,
}: {
  amount: number;
  valuation: number;
  currency: string;
  industry: string;
  sector: string;
  diligence: number;
  model: number;
  /** Paid from your own money (not a fund's). */
  personal: boolean;
  /** Send the term sheet with this amount. */
  onInvest: (amount: number) => void;
}) {
  const { view } = useView();
  const g = guideOf(view);
  if (!g || amount <= 0) return null;
  const checks = investChecks({
    amount,
    liquid: liquidFor(view, currency, personal),
    industry,
    holdings: g.money.holdings,
    diligence,
    model,
    valuation,
  });
  const size = checks.find((c) => c.id === 'size');
  const big = size && size.level !== 'good' ? size : null;
  return (
    <div
      className={`ig-check${big ? ` ig-check-${big.level}` : ''}`}
      data-cheque-check={big ? big.level : 'good'}
    >
      {big && (
        <>
          <h3>
            <span aria-hidden="true">{ICON[big.level]}</span>{' '}
            {big.level === 'bad' ? t('Too big a cheque') : t('A big cheque')}
          </h3>
          <p className="ig-check-lead">
            {t('This cheque is {pct} of your money: keep under 10%.', {
              pct: pct(big.values.share!, 0),
            })}
          </p>
          <div className="ig-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, big.values.share! * 100)}%` }} />
            <i style={{ left: '10%' }} />
          </div>
          <div className="ig-bar-scale small muted" aria-hidden="true">
            <span>0%</span>
            <span>{t('10% guide')}</span>
            <span>100%</span>
          </div>
          <p className="small">
            {t(
              'Most early companies fail. Angels spread money over 15 to 20 companies so one big win pays for the rest. At {pct}, one failure wipes out that much of your money.',
              { pct: pct(big.values.share!, 0) },
            )}
          </p>
        </>
      )}
      <ul className="ig-checks" aria-label={t('Cheque checks')}>
        {checks.map((c) => (
          <li key={c.id} className={`ig-check-line ig-${c.level}`} data-check={c.id}>
            <span className="ig-check-icon" aria-hidden="true">
              {ICON[c.level]}
            </span>
            <span>
              <b>{CHECK_TITLE[c.id]()}</b> ·{' '}
              <span className="small">{checkText(c, currency, sector)}</span>
            </span>
          </li>
        ))}
      </ul>
      {big && (
        <div className="row ig-check-actions">
          <Button onClick={() => onInvest(big.values.suggested!)}>
            {t('Invest {amount} ({pct})', {
              amount: money(big.values.suggested!, currency),
              pct: pct(big.values.suggested! / Math.max(1, big.values.liquid!), 0),
            })}
          </Button>
          <Button variant="secondary" onClick={() => onInvest(amount)}>
            {t('Invest anyway')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- scored decisions

export const FIRST_CALL_QUESTIONS = ['growth', 'burn', 'customers', 'team'] as const;

function askText(ask: string): string {
  switch (ask) {
    case 'growth':
      return t('How fast are you growing?');
    case 'burn':
      return t('How long does your money last?');
    case 'customers':
      return t('Do customers stay?');
    default:
      return t('Who’s on the team?');
  }
}

function choiceText(step: string, choice: string): string {
  if (step === 'first-call') return askText(choice);
  if (step === 'screen')
    switch (choice) {
      case 'call':
        return t('Take a first call');
      case 'team':
        return t('Pass: the team');
      case 'market':
        return t('Pass: the market');
      case 'traction':
        return t('Pass: traction');
      case 'price':
        return t('Pass: the price');
      case 'fit':
        return t('Pass: outside your thesis');
      default:
        return t('Pass: the timing');
    }
  if (step === 'valuation')
    return choice === 'fair'
      ? t('A fair price')
      : choice === 'low'
        ? t('Below their value')
        : t('Above their value');
  return choice === 'small'
    ? t('Under 10% of your money')
    : choice === 'large'
      ? t('10% to 20% of your money')
      : t('Over 20% of your money');
}

function stepTitle(step: string): string {
  switch (step) {
    case 'screen':
      return t('Screening');
    case 'first-call':
      return t('First call');
    case 'valuation':
      return t('Price');
    default:
      return t('Cheque');
  }
}

/** Why the best call is best, in the company's own numbers. */
function whyText(d: Decision): string {
  const v = d.values;
  const cur = d.currency;
  switch (`${d.step}.${d.best}`) {
    case 'screen.call':
      return t(
        'It fits your thesis and nothing rules it out ({growth}% growth a month, a team of {team}): a 4-hour call is how you find out more.',
        { growth: v.growth!, team: v.team! },
      );
    case 'screen.fit':
      return t(
        'It’s outside your thesis: passing with that reason is honest and saves you both time.',
      );
    case 'screen.price':
      return t(
        'They ask {ratio}× what their numbers support: pass on price, or come back when they grow into it.',
        { ratio: v.ratio!.toFixed(1) },
      );
    case 'screen.traction':
      return t(
        'No revenue, no growth and a team of {team}: there’s nothing to check yet. Pass on traction and stay in touch.',
        { team: v.team! },
      );
    case 'first-call.burn':
      return t(
        'They have {runway} months of money left. Ask how they reach the next round before anything else.',
        { runway: v.runway! },
      );
    case 'first-call.customers':
      return t(
        '{churn}% of customers leave each month. Growth that leaks out isn’t worth paying for.',
        { churn: v.churn! },
      );
    case 'first-call.team':
      return v.team === 1
        ? t('A solo founder. Ask who builds, who sells and who they hire next.')
        : t('Only {team} people. Ask who builds, who sells and who they hire next.', {
            team: v.team!,
          });
    case 'first-call.growth':
      return v.growth! < 3
        ? t(
            'Growth is only {growth}% a month. Ask what will make it faster: it decides the price.',
            {
              growth: v.growth!,
            },
          )
        : v.runway! >= 60
          ? // Play-test: "511 months of money" read as praise for a company that barely spends.
            t(
              'Money, customers and team look healthy (money for years at this spending, {churn}% churn). Growth ({growth}% a month) is what sets the price.',
              { churn: v.churn!, growth: v.growth! },
            )
          : t(
              'Money, customers and team look healthy ({runway} months of money, {churn}% churn). Growth ({growth}% a month) is what sets the price.',
              { runway: v.runway!, churn: v.churn!, growth: v.growth! },
            );
    case 'valuation.fair':
      return t(
        'Its numbers put it at about {model}. A fair price is {lo} to {hi}: below it founders walk away, above it you overpay and own less.',
        { model: money(v.model!, cur), lo: money(v.lo!, cur), hi: money(v.hi!, cur) },
      );
    default:
      return t(
        'Most early companies fail. Keep each cheque under a tenth of your money (about {amount}) so one failure can’t sink you.',
        { amount: money(v.suggested!, cur) },
      );
  }
}

const scoreLabel = (s: number) => (s >= 1 ? t('Best call') : s > 0 ? t('Defensible') : t('Missed'));
const scoreTone = (s: number) =>
  (s >= 1 ? 'good' : s > 0 ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';

/** Scored decisions: your call, the best call and why. */
export function DecisionList({ decisions, names }: { decisions: Decision[]; names?: boolean }) {
  if (!decisions.length) return null;
  return (
    <ul className="ig-decisions">
      {decisions.map((d) => (
        <li key={`${d.companyId}.${d.step}`} data-decision={d.step} data-score={d.score}>
          <div className="spread">
            <b>
              {stepTitle(d.step)}
              {names ? ` · ${d.name}` : ''}
            </b>
            <Pill tone={scoreTone(d.score)}>{scoreLabel(d.score)}</Pill>
          </div>
          <p className="small">
            {t('Your call: {choice}', { choice: choiceText(d.step, d.choice) })}
            {d.choice !== d.best &&
              ` · ${t('Best call: {best}', { best: choiceText(d.step, d.best) })}`}
          </p>
          <p className="small muted">💡 {whyText(d)}</p>
        </li>
      ))}
    </ul>
  );
}

/** One company's scored decisions (a company sheet, the first session). */
export function CompanyDecisions({ companyId }: { companyId: string }) {
  const { view } = useView();
  const g = guideOf(view);
  const mine = (g?.decisions ?? []).filter((d) => d.companyId === companyId);
  if (!mine.length) return null;
  return (
    <Card title={t('Your calls, scored')} className="ig-scored">
      <DecisionList decisions={mine} />
    </Card>
  );
}

/** Recent scored decisions across companies (the investor's main screen). */
export function RecentDecisions() {
  const { view } = useView();
  const g = guideOf(view);
  if (!g?.decisions.length) return null;
  return (
    <Card title={t('Your recent calls')} sub={t('Each one against the best call')}>
      <DecisionList decisions={g.decisions.slice(0, 4)} names />
    </Card>
  );
}

/**
 * The first call as a decision (feedback round): what you ask first. Null
 * when calls aren't scored, so the caller shows its plain first-call button.
 */
export function FirstCallQuestions({ companyId }: { companyId: string }) {
  const { view, send } = useView();
  const g = guideOf(view);
  if (!g?.scoring) return null;
  return (
    <div className="ig-ask" data-first-call-ask="">
      <p className="ig-question">{t('What do you ask first?')}</p>
      <p className="small muted">
        {t('A first call costs 4 hours. Ask about what matters most for this company.')}
      </p>
      <div className="ig-options">
        {FIRST_CALL_QUESTIONS.map((ask) => (
          <button
            key={ask}
            type="button"
            className="ig-option"
            onClick={() =>
              void send(
                { type: 'invest.diligence', companyId, depth: 1, ask },
                (r: { message: string; call?: { score: number } }) =>
                  r.call ? `${scoreLabel(r.call.score)}. ${tx(r.message)}` : tx(r.message),
              )
            }
          >
            {askText(ask)}
          </button>
        ))}
      </div>
    </div>
  );
}
