/**
 * Round 7 sales pieces (player feedback: "a perfect 100/100 conversation can
 * still lose: make the reason clear"). Small, separate components so they
 * can be restyled on their own:
 *
 *   - HoldingBack: under the win meter, before you ask: how your talk has
 *     gone, what is holding the chance down, and the best chance today.
 *   - LossReason: after a loss, the one real reason in the customer's words
 *     and what to do next (luck only when it really was luck).
 *
 * The engine decides the reasons (sales.ts holdingBack, closeDeal); this only
 * shows them.
 */
import { pct } from '../format';
import { t, tx } from '../i18n';
import type { Company } from '../store';
import { Button } from '../ui';
import { useLine } from './Interview';

type DealV = NonNullable<Company['sales']>['deals'][number];
type Holding = NonNullable<NonNullable<DealV['talk']>['holding']>;
export type LossReason = NonNullable<DealV['lossReason']>;

/** What a lost deal was lost on, in a few words. */
export const lossLabel = (r: LossReason) =>
  ({
    price: t('Too expensive for them'),
    missing_feature: t('The product doesn’t do what they need yet'),
    timing: t('Not the right time'),
    trust: t('They don’t trust you enough yet'),
    competitor: t('They stayed with a competitor'),
    no_budget: t('No budget for it'),
    authority: t('They can’t sign alone'),
    luck: t('Bad luck: it was close'),
  })[r];

/** What to try after a loss. */
export const lossAdvice = (r: LossReason) =>
  ({
    price: t('Try again, then lower the price or offer a discount.'),
    missing_feature: t('Try again: improve the product and show a new demo.'),
    timing: t('Try again: they may be ready a little later.'),
    trust: t('Try again with a reference: trust grows.'),
    competitor: t('Try again: beat their current supplier on price or fit.'),
    no_budget: t('Try again: get in front of whoever holds the budget.'),
    authority: t('Try again, with the person who signs in the room.'),
    luck: t('Nothing big held it back. Try again.'),
  })[r];

/** Round 7: what to do next, per reason (budget and timing come back on their own). */
function nextStep(r: LossReason, revisitIn: number | null): string {
  switch (r) {
    case 'missing_feature':
      return t('Build what they need on the Roadmap, then show them a new demo.');
    case 'authority':
      return t('Meet the person who signs: try again and bring them in.');
    case 'no_budget':
    case 'timing':
      return revisitIn !== null && revisitIn > 0
        ? t(
            'Come back in {n} months: the lead stays on your board with a reminder. You can try sooner, at a lower chance.',
            { n: revisitIn },
          )
        : t('They’re ready to talk again: the lead is open on your board.');
    case 'trust':
      return t('Win a smaller customer like them first: a reference builds trust.');
    case 'competitor':
      return t('Beat what they use today on fit or price, then try again.');
    case 'luck':
      return t('It really was luck: nothing big held it back. Try again.');
    default:
      return lossAdvice(r);
  }
}

/** What holds the chance down, as a row title. */
const holdTitle = (r: string, d: DealV) =>
  ({
    missing_feature: t('Product fit: weak for {segment}', { segment: tx(d.segment) }),
    authority: t('Can’t fully sign alone'),
    no_budget: t('Above what they planned to spend'),
    timing: t('Not urgent for them'),
    competitor: d.known.currentName
      ? t('Tied in with {rival}', { rival: d.known.currentName })
      : t('Happy with what they use'),
    trust: t('Low trust: they don’t know you yet'),
  })[r] ?? r;

const HOLD_ICON: Record<string, string> = {
  missing_feature: '🧩',
  authority: '✍️',
  no_budget: '💷',
  timing: '⏳',
  competitor: '🔒',
  trust: '🤝',
  luck: '🎲',
  price: '🏷️',
};

const lvl = (v: number | null) =>
  v === null ? null : v >= 0.67 ? t('high') : v >= 0.34 ? t('medium') : t('low');

/** The line under a row: what you know that makes it so (a guess before discovery). */
function holdWhy(r: string, d: DealV): string {
  const k = d.known;
  switch (r) {
    case 'missing_feature':
      return t('Build what {segment} ask for on the Roadmap', { segment: tx(d.segment) });
    case 'authority':
      return lvl(k.authority)
        ? t('Can sign alone: {level}. Someone else has a say', { level: lvl(k.authority)! })
        : t('A guess until discovery: who signs?');
    case 'timing':
      return lvl(k.urgency)
        ? t('Urgency: {level}', { level: lvl(k.urgency)! })
        : t('A guess until discovery: how urgent is it?');
    case 'no_budget':
      return k.budgetMax === null
        ? t('A guess until discovery: what can they spend?')
        : t('Your price is high for what they planned');
    case 'competitor':
      return t('Switching costs them time and effort');
    case 'trust':
      return t('Stars, uptime and a reference build trust');
    default:
      return '';
  }
}

const talkLabel = (score: number) =>
  score >= 80 ? t('excellent') : score >= 60 ? t('good') : score >= 40 ? t('shaky') : t('weak');

/** Chance points, signed ("−14"). */
const pts = (cost: number) => `−${Math.round(cost * 100)}`;

/** Before you ask: your talk so far, what's holding the chance down, and the best chance today. */
export function HoldingBack({ d, holding }: { d: DealV; holding: Holding }) {
  const items = holding.items.slice(0, 3);
  const turns = d.talk ? [d.talk.lead, d.talk.price, d.talk.terms].filter(Boolean).length : 0;
  return (
    <div className="sales-holding" data-holding={items.map((i) => i.reason).join(' ')}>
      {holding.talk !== null && (
        <div className={`hold-row${holding.talk >= 60 ? ' ok' : ''}`} data-hold-talk>
          <span className="hold-ic" aria-hidden="true">
            💬
          </span>
          <span>
            <b>{t('Your talk: {grade}', { grade: talkLabel(holding.talk) })}</b>
            <span className="hold-why">{t('{n} of 3 turns so far', { n: turns })}</span>
          </span>
          <span className="hold-pts">{t('{n}/100', { n: holding.talk })}</span>
        </div>
      )}
      <h4>{t('Holding you back')}</h4>
      {items.length ? (
        items.map((i) => (
          <div key={i.reason} className="hold-row" data-hold={i.reason}>
            <span className="hold-ic" aria-hidden="true">
              {HOLD_ICON[i.reason] ?? '•'}
            </span>
            <span>
              <b>{holdTitle(i.reason, d)}</b>
              <span className="hold-why">{holdWhy(i.reason, d)}</span>
            </span>
            <span
              className="hold-pts"
              aria-label={t('{n} points of chance', { n: Math.round(i.cost * 100) })}
            >
              {pts(i.cost)}
            </span>
          </div>
        ))
      ) : (
        <p className="hold-none">{t('Nothing big: what’s left is luck.')}</p>
      )}
      <div className="hold-best" data-best-chance={Math.round(holding.best * 100)}>
        {t('Best chance today:')} <b>{pct(holding.best)}</b>.{' '}
        {items.length
          ? items.length === 1
            ? t('A better talk can’t move it higher; the one above can.')
            : t('A better talk can’t move it higher; the {n} above can.', { n: items.length })
          : t('A good talk gets you there.')}
      </div>
    </div>
  );
}

/** What a lost deal was lost on, as a chip. */
export function LossChip({ reason }: { reason: LossReason }) {
  return (
    <span className="loss-chip" data-loss-chip={reason}>
      <span aria-hidden="true">{HOLD_ICON[reason] ?? '•'}</span> {lossLabel(reason)}
    </span>
  );
}

/**
 * After a loss: the one real reason in their words, and what to do next
 * (with the buttons that do it), then a plain line about luck. `chance`: the
 * chance when you asked (the conversation's result), for the luck line.
 */
export function LossReason({
  d,
  heading = true,
  chance,
  onRetry,
  onFindLeads,
  onRoadmap,
}: {
  d: DealV;
  heading?: boolean;
  chance?: number;
  onRetry?: () => void;
  onFindLeads?: () => void;
  onRoadmap?: () => void;
}) {
  const ln = useLine();
  if (!d.loss) return null;
  const r = d.loss.reason;
  const later = (r === 'no_budget' || r === 'timing') && (d.loss.revisitIn ?? 0) > 0;
  return (
    <div className="sales-loss-reason" data-loss-reason={r} role="status">
      {heading && <LossChip reason={r} />}
      <blockquote className="loss-quote">
        {ln(d.loss.words)}
        <cite>
          {d.contact}, {d.name}
        </cite>
      </blockquote>
      <div className="loss-next" data-loss-next>
        <h4>{t('What to do next')}</h4>
        <p>{nextStep(r, d.loss.revisitIn)}</p>
        {(later || onRetry || onFindLeads || onRoadmap) && (
          <div className="loss-btns">
            {later && (
              <span className="loss-date" data-revisit={d.loss.revisitIn}>
                📅 {t('Back on your board in {n} months', { n: d.loss.revisitIn! })}
              </span>
            )}
            {r === 'missing_feature' && onRoadmap && (
              <Button size="sm" onClick={onRoadmap}>
                {t('Open the Roadmap')}
              </Button>
            )}
            {onRetry && d.canRecover && r !== 'trust' && (
              <Button
                size="sm"
                variant={r === 'missing_feature' || later ? 'subtle' : 'primary'}
                onClick={onRetry}
                data-action="recover"
              >
                {later
                  ? t('Try now (a lower chance)')
                  : r === 'authority'
                    ? t('Try again with who signs')
                    : t('Try again')}
              </Button>
            )}
            {onFindLeads && (r === 'trust' || r === 'competitor' || later) && (
              <Button size="sm" variant="subtle" onClick={onFindLeads}>
                {later ? t('Find new leads') : t('Find a smaller customer like them')}
              </Button>
            )}
          </div>
        )}
      </div>
      {chance !== undefined && (
        <p className="loss-luck" data-luck={d.loss.luck ? 'yes' : 'no'}>
          {d.loss.luck
            ? t('It really was luck: {p} was a good chance, and it went the other way.', {
                p: pct(chance),
              })
            : t(
                'Luck had nothing to do with it: {p} was the real chance, and the reason above decided it.',
                { p: pct(chance) },
              )}
        </p>
      )}
    </div>
  );
}
