/**
 * The investor guide's words (stage names, goals, a senior partner's rules,
 * checklist lines) and its next step as the investor's main objective. Kept
 * apart from the screens so the journey's objectives can use it too.
 */
import type { PlayerView } from '@runway/engine';
import { money } from '../format';
import { t } from '../i18n';

export type Guide = NonNullable<PlayerView['investorGuide']>;
export type GuideItem = Guide['items'][number];
export type Decision = Guide['decisions'][number];

/** The guide, or null (other roles, worlds before the investor career, an older server). */
export const guideOf = (view: PlayerView): Guide | null =>
  (view as { investorGuide?: Guide | null }).investorGuide ?? null;

export function stageName(id: string): string {
  switch (id) {
    case 'angel':
      return t('Angel');
    case 'syndicate':
      return t('Syndicate lead');
    case 'first-exit':
      return t('First exit');
    case 'fund-1':
      return t('Fund I');
    case 'fund-2':
      return t('Fund II');
    default:
      return t('Family office');
  }
}

export function stageGoal(id: string): string {
  switch (id) {
    case 'angel':
      return t('To make your first investment');
    case 'syndicate':
      return t('To lead a syndicate');
    case 'first-exit':
      return t('To raise Fund I');
    case 'fund-1':
      return t('To close Fund I');
    case 'fund-2':
      return t('To raise Fund II');
    default:
      return t('To run a family office');
  }
}

/** The senior partner's rules for each stage. */
export function stageRules(id: string): string {
  switch (id) {
    case 'angel':
      return t(
        'Most early companies fail, so start small. Meet founders, do a first call to see their real numbers, then send a small SAFE: under a tenth of your money.',
      );
    case 'syndicate':
      return t(
        'Back a few companies, not one. Do a first call on each before you invest and spread your money: no company over 10%, no sector over half. Stars come from founders who like working with you.',
      );
    case 'first-exit':
      return t(
        'LPs back a track record. A company that raises again at a higher price is a markup; cash back from a sale or a secondary is what they trust most.',
      );
    case 'fund-1':
      return t(
        'A fund is a promise to LPs, and its numbers must add up: enough companies, money kept back for follow-ons, a 2% fee and 20% carry. Learn from other investors, then pitch a plan with no red checks.',
      );
    case 'fund-2':
      return t(
        'Invest Fund I steadily and lead rounds: founders and co-investors follow a lead. LPs re-up into Fund II when cash comes back (DPI), not on paper marks.',
      );
    default:
      return t(
        'At this size, protect what you built: spread it across funds, shares and property, and give some back. The family office opens with enough liquid wealth or a fund that returned 1×.',
      );
  }
}

function num(v: number | undefined, currency?: string): string {
  if (v === undefined) return '';
  if (currency) return money(v, currency);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function itemText(stage: string, x: GuideItem): string {
  const have = num(x.have, x.currency);
  const need = num(x.need, x.currency);
  switch (x.id) {
    case 'meet':
      return t('Meet founders: at an event, the café or in Deal offers');
    case 'first-call':
      return t('Do a first call before you invest');
    case 'first-cheque':
      return t('Back one company with under 10% of your money');
    case 'deals':
      return stage === 'syndicate'
        ? t('Back {need} companies ({have} now)', { need, have })
        : t('Do {need} deals, syndicates count ({have} now)', { need, have });
    case 'diligence':
      return t('Do diligence on each before you invest');
    case 'stars':
      return t('Reach {need}★ as an investor ({have} now)', { need, have });
    case 'spread':
      return t('Spread: no company over 10% of your money');
    case 'markup':
      return t('One company raises again at a higher price');
    case 'exit':
      return t('Get cash back from a stake: a sale, a secondary or an exit');
    case 'lp-score':
      return t('An LP panel score of {need} ({have} now)', { need, have });
    case 'lessons':
      return t('Talk strategy with {need} investors ({have} now)', { need, have });
    case 'strategy':
      return t('Pitch LPs a fund plan with no red checks');
    case 'fund':
      return t('Close Fund I');
    case 'fund-deal':
      return t('Invest from your fund');
    case 'lead':
      return t('Lead a round: run a syndicate');
    case 'dpi':
      return t('Return cash to LPs: DPI {need}× ({have}× now)', { need, have });
    case 'reups':
      return t('{need} LPs who would re-up ({have} now)', { need, have });
    case 'liquid':
      return t('Liquid wealth of {need} ({have} now)', { need, have });
    default:
      return t('A senior role at a DFI or bank');
  }
}

/** The guide's next step as a journey objective (the investor's main "what to do now"). */
export function guideObjective(view: PlayerView) {
  const g = guideOf(view);
  if (!g?.next) return null;
  return {
    kind: 'main' as const,
    id: `guide.${g.stage}.${g.next.id}`,
    icon: '🚩',
    label: itemText(g.stage, g.next),
    why: t('{goal}: {n} of {total} done', {
      goal: stageGoal(g.stage),
      n: g.done,
      total: g.items.length,
    }),
    go: g.next.go,
  };
}
