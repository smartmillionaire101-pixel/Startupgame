/**
 * How many real customers a founder's company has, and how well the founder
 * knows them (player feedback, round two: "I had 3 real customers but the
 * stage tracker kept me at Idea"). One answer for every piece of guidance:
 * the stage tracker (founderguide.ts), the journey (journey.ts), the
 * tutorial and the client's "What to do now".
 *
 * Real paying customers are:
 *  - people: the paying customers of the segment funnel (customers.ts);
 *  - accounts: deals won in the Sales pipeline (sales.ts);
 *  - businesses: local businesses that buy from the company after a pitch
 *    (economy.ts `suppliers`), not already counted as a Sales account;
 *  - buyers: companies with an active supply contract (marketplace.ts).
 *
 * Every company a player founds starts with one welcome customer (world.ts
 * welcomeNewPlayer). It counts as a customer, but it is a gift, not
 * something learned: `earned` leaves it out, and only earned customers teach
 * the founder about their customers or move them past the Idea stage.
 *
 * Knowing the customer (0–1) is the best Market interview score for a
 * segment, plus a share for every earned customer (one is enough to leave
 * the Idea stage) and every Sales discovery meeting: each one is a real
 * conversation about their problem.
 *
 * Replay safety: pure derivation. In worlds without the feedback note the
 * answer is exactly what the guidance used before (the funnel plus Sales
 * accounts, and Market interviews only), so the journey's chapter
 * milestones are recorded as before.
 */
import { totalCustomers } from './helpers.js';
import { feedbackOn } from './releases.js';
import type { Company, World } from './types.js';

export const TRACTION = {
  /** What one paying customer, and one Sales discovery meeting, teaches you (0–1). */
  perCustomer: 0.2,
  perMeeting: 0.1,
  /** Known well enough to leave the Idea stage. */
  knowNeed: 0.2,
} as const;

export interface CustomerFacts {
  /** Every real paying customer. */
  total: number;
  /** Customers won, leaving out the one a new company is given (0 or 1). */
  earned: number;
  welcome: number;
  people: number;
  accounts: number;
  businesses: number;
  buyers: number;
  /** Best Market interview score for one segment (0–1). */
  interviews: number;
  /** Sales deals where the discovery meeting is done (won deals count as accounts). */
  meetings: number;
  /** How well the founder knows the customer (0–1). */
  known: number;
  /** Known well enough: the Idea stage's "learn what customers need" is done. */
  knows: boolean;
}

const bestInterview = (c: Company) =>
  Math.max(
    0,
    ...c.targetSegments.map((k) => c.product.discovery[k] ?? 0),
    ...Object.values(c.product.discovery),
  );

/** Local businesses buying from this company, outside its Sales accounts. */
function localBusinesses(world: World, c: Company): number {
  const m = world.markets[c.market];
  const all = m?.businesses;
  if (!all) return 0;
  const viaSales = new Set((c.salesAccounts ?? []).map((a) => a.businessId).filter(Boolean));
  let n = 0;
  for (const b of Object.values(all)) {
    if (b.closedMonth !== undefined || viaSales.has(b.id)) continue;
    if (b.suppliers.some((s) => s.companyId === c.id)) n++;
  }
  return n;
}

/** Companies with an active supply contract buying from this company. */
function contractBuyers(world: World, c: Company): number {
  const buyers = new Set<string>();
  for (const k of Object.values(world.contracts ?? {}))
    if (k.sellerId === c.id && k.status === 'active' && k.buyerId !== c.id) buyers.add(k.buyerId);
  return buyers.size;
}

/** The one count of a company's real customers, and how well its founder knows them. */
export function customerFacts(world: World, c: Company): CustomerFacts {
  const interviews = bestInterview(c);
  const accounts = c.salesAccounts?.length ?? 0;
  const people = totalCustomers(c) - accounts;
  if (!feedbackOn(world)) {
    return {
      total: people + accounts,
      earned: people + accounts,
      welcome: 0,
      people,
      accounts,
      businesses: 0,
      buyers: 0,
      interviews,
      meetings: 0,
      known: interviews,
      knows: interviews >= TRACTION.knowNeed,
    };
  }
  const businesses = localBusinesses(world, c);
  const buyers = contractBuyers(world, c);
  const total = people + accounts + businesses + buyers;
  // A player's company (not one bought or spun out) starts with a welcome customer.
  const welcome = !c.ai && !c.parentId && people > 0 ? 1 : 0;
  const earned = total - welcome;
  const meetings = (c.deals ?? []).filter((d) => d.revealed && d.stage !== 'won').length;
  const known = Math.min(
    1,
    interviews + earned * TRACTION.perCustomer + meetings * TRACTION.perMeeting,
  );
  return {
    total,
    earned,
    welcome,
    people,
    accounts,
    businesses,
    buyers,
    interviews,
    meetings,
    known,
    // Rounded like the tracker shows it, so "20 of 20 points" is always done.
    knows: Math.round(known * 100) >= Math.round(TRACTION.knowNeed * 100),
  };
}
