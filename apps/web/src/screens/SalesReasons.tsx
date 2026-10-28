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
        ? t('Come back in {n} months: the lead stays on your board and opens again then.', {
            n: revisitIn,
          })
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

const holdLabel = (r: string, d: DealV) =>
  ({
    missing_feature: t('product fit (weak for {segment})', { segment: tx(d.segment) }),
    authority: t('they can’t sign alone'),
    no_budget: t('the price is above what they planned'),
    timing: t('it isn’t urgent for them'),
    competitor: d.known.currentName
      ? t('they’re tied in with {rival}', { rival: d.known.currentName })
      : t('they’re happy with what they use'),
    trust: t('low trust: they don’t know you yet'),
  })[r] ?? r;

const talkLabel = (score: number) =>
  score >= 80 ? t('excellent') : score >= 60 ? t('good') : score >= 40 ? t('shaky') : t('weak');

/** Before you ask: your talk so far, what's holding the chance down, and the best chance today. */
export function HoldingBack({ d, holding }: { d: DealV; holding: Holding }) {
  const items = holding.items.slice(0, 3);
  return (
    <div className="sales-holding small" data-holding={items.map((i) => i.reason).join(' ')}>
      {holding.talk !== null && (
        <p>
          <b>{t('Your talk:')}</b> {talkLabel(holding.talk)}
        </p>
      )}
      <p>
        <b>{t('Holding you back:')}</b>{' '}
        {items.length
          ? items.map((i) => holdLabel(i.reason, d)).join(', ')
          : t('nothing big: what’s left is luck')}
      </p>
      <p data-best-chance={Math.round(holding.best * 100)}>
        <b>{t('Best chance today:')}</b> {pct(holding.best)}
      </p>
    </div>
  );
}

/** After a loss: the one real reason in their words, and what to do next. */
export function LossReason({ d, heading = true }: { d: DealV; heading?: boolean }) {
  const ln = useLine();
  if (!d.loss) return null;
  const first = d.contact.split(' ')[0]!;
  return (
    <div className="sales-loss-reason" data-loss-reason={d.loss.reason} role="status">
      {heading && (
        <div className="small muted">
          {d.loss.luck
            ? t('It was luck')
            : t('Why they said no: {reason}', { reason: lossLabel(d.loss.reason) })}
        </div>
      )}
      <p className="bubble them">
        {first}: {ln(d.loss.words)}
      </p>
      <p className="small">
        <b>{t('Next:')}</b> {nextStep(d.loss.reason, d.loss.revisitIn)}
      </p>
    </div>
  );
}
