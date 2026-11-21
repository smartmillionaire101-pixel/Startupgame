/**
 * Where a founder stage step's "Do it now" leads (round 4 player feedback:
 * at Series A, "Do it now" for "Reach £22.9k revenue in a month" did
 * nothing). The engine points most steps at the Company tab, the very screen
 * the stage card sits on, so a tap only scrolled to the top. Each such step
 * now opens its own Company section, scrolled into view, with what the step
 * asks of you at the top of it (StepHint): revenue on Customers (what pays
 * you) with the ways to grow it, the price on Pricing and spend, a second
 * city on the expansion card, the team on Team, fit on the Roadmap.
 *
 * Steps that lead elsewhere (the Market, investors, the Hub, the Sales app,
 * Money) keep their target: they already leave the Company screen.
 */
import type { FounderTask } from '@runway/engine';
import type { JourneyGo } from '../city/journey';
import type { CompanySection } from '../phone/navigate';

export interface StepPlace {
  section: CompanySection;
  /** A part of the section to scroll to (`[data-company-focus]`); none: the section's top. */
  anchor?: string;
}

/** Every founder step whose target is the Company screen: its section there. */
export const STEP_PLACES: Record<string, StepPlace> = {
  'idea.price': { section: 'customers', anchor: 'pricing' },
  'first.revenue': { section: 'customers' },
  'first.margin': { section: 'customers', anchor: 'pricing' },
  'first.retention': { section: 'customers' },
  'fit.product': { section: 'roadmap' },
  'fit.growth': { section: 'customers' },
  'fit.team': { section: 'team' },
  'growth.revenue': { section: 'customers' },
  'growth.team': { section: 'team' },
  'growth.profit': { section: 'customers', anchor: 'pricing' },
  'a.revenue': { section: 'customers' },
  'a.city': { section: 'product', anchor: 'expansion' },
};

/** A step without its own entry still opens somewhere useful: what pays you. */
const FALLBACK: StepPlace = { section: 'customers' };

/** Is this the Company screen (any section of it)? */
const toCompany = (g: JourneyGo) => g.kind === 'tab' && g.tab === 'company';

/**
 * A step's Go, with the Company screen made specific: its section, scrolled
 * into view, the step's hint on top. Other targets are returned as they are.
 */
export function stageGo(x: Pick<FounderTask, 'id' | 'go'>): JourneyGo | null {
  const g = x.go as JourneyGo | null;
  if (!g || !toCompany(g)) return g;
  const place = STEP_PLACES[x.id] ?? FALLBACK;
  return {
    kind: 'company',
    section: place.section,
    focus: { step: x.id, ...(place.anchor ? { anchor: place.anchor } : {}) },
  };
}
