/**
 * What the server says happened, for the tutorial's steps (Founder Journey 6).
 * Each step finishes on a real game fact, never on a click alone (except
 * step 1, opening the Bank app, which is a phone habit, not game state).
 * The steps line up with Chapter 1 of the journey: founding the company is
 * "Start your company", the first sale's discovery meeting is "Talk to
 * customers" and the signed deal is "Win your first paying customer".
 */
import type { PlayerView } from '@runway/engine';
import type { TutorialState, TutorialStep } from './state';

type View = Pick<PlayerView, 'companies'>;
type CompanyV = PlayerView['companies'][number];

export interface TutorialFacts {
  company: CompanyV | null;
  founded: boolean;
  /** A customer signed through the sales pipeline. */
  sold: boolean;
  /** Their first payment landed in the business account (café-idea companies). */
  paid: boolean;
  /** A small business expense was paid from the company account. */
  expensed: boolean;
}

export function tutorialFacts(view: View): TutorialFacts {
  const company = view.companies.find((c) => c.status === 'active') ?? null;
  const x = company as
    | (CompanyV & {
        starterIdea?: { paid: unknown } | null;
        expenses?: unknown[];
      })
    | null;
  return {
    company,
    founded: !!company,
    // A customer won anywhere counts (traction.ts), not only one signed in Sales.
    sold: (company?.sales?.accounts.length ?? 0) > 0 || (company?.traction?.earned ?? 0) > 0,
    paid: !!x?.starterIdea?.paid,
    expensed: (x?.expenses?.length ?? 0) > 0,
  };
}

/** The step the founder should be on now, given what they've done. */
export function stepFor(s: Pick<TutorialState, 'step' | 'seen' | 'noSale'>, f: TutorialFacts) {
  let step: TutorialStep = s.step;
  if (step === 'phone' && (s.seen?.includes('bank') || f.founded)) step = 'idea';
  if (step === 'idea' && f.founded) step = 'sale';
  if (step === 'sale' && (f.sold || s.noSale)) step = 'payment';
  if (step === 'payment' && f.expensed) step = 'end';
  return step;
}
