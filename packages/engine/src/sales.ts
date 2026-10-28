/**
 * The sales pipeline (Founder Journey 2a; blueprint §3 "Customer interaction",
 * §6.2, FR-005).
 *
 * Alongside the aggregate segment funnel (customers.ts), a founder can work
 * individual B2B deals: prospect leads (local businesses that buy the
 * company's kind of product, or buyers from its segments), then move each one
 * lead → contacted → discovery → demo → proposal → negotiation → won / lost.
 *
 *   - Every customer has hidden attributes (need, budget range, authority,
 *     urgency, current solution, trust). Discovery reveals them.
 *   - The demo uses product fit, quality and reliability.
 *   - The proposal's price is weighed against their willingness to pay;
 *     a discount trades margin for a better chance.
 *   - Closing rolls bounded randomness and a lost deal names its reason.
 *     One recovery attempt follows a loss (blueprint §3.1).
 *   - A won deal is a paying account, billed every settlement on B2B terms
 *     through the company's receivables (company.ts settleFinances), so
 *     revenue, receivables and the ledger stay one system. The first one
 *     earns the "First customer" milestone.
 *
 * Replay safety: all of this lives in optional company fields that only the
 * new `sales.*` commands create. Deal ids come from a per-company counter;
 * randomness from `deriveRng(seed, 'sales', …)`. Old worlds never see it.
 */
import { CITY_NAME_PARTS } from './data/business-names.js';
import { buyerSegment } from './data/buyers.js';
import { LOSS_WORDS, MONTHS_WORDS } from './data/sales-reasons.js';
import { reliability, segmentFit } from './customers.js';
import { businessesOf, isOpen, sectorBudget, specOf } from './economy.js';
import { ensure, fail } from './errors.js';
import { achieve, col, getMarket, hoursLeft, notify, ownCompany, spendHours } from './helpers.js';
import { account, transfer } from './ledger.js';
import { clamp, clamp01, logistic } from './math.js';
import { scale } from './money.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import { outputOf } from './staff.js';
import { barEdgeIn } from './lifebars.js';
import { rivalPressure } from './rivals.js';
import { firstPayment, starterIdeaEdge } from './firstsession.js';
import { feedbackOn, gameplayOn } from './releases.js';
import type {
  Company,
  Id,
  LocalBusiness,
  MarketState,
  Player,
  SalesAction,
  SalesChurnReason,
  SalesCustomer,
  SalesDeal,
  SalesLossReason,
  SalesNeed,
  SalesStage,
  SegmentState,
  World,
} from './types.js';

// ---------------------------------------------------------------- Tuning

/** What a demo is scored on: fit for their segment, quality, reliability, and discovery first. */
export const DEMO_WEIGHTS = {
  fit: 0.45,
  quality: 0.35,
  reliability: 0.2,
  discovery: 0.08,
} as const;

const round2 = (x: number) => Math.round(x * 100) / 100;

export const SALES = {
  /** Founder hours per action. */
  hours: {
    prospect: 4,
    contact: 1,
    discover: 3,
    demo: 4,
    propose: 2,
    negotiate: 1,
    close: 1,
    recover: 2,
  } as Record<SalesAction | 'prospect', number>,
  /** Cash per action, as a share of the city's monthly cost of living (coffee, travel, a demo kit). */
  costCol: { discover: 0.02, demo: 0.05 } as Partial<Record<SalesAction, number>>,
  /** Prospecting rounds a month: this many, plus one per unit of sales staff output. */
  prospectsPerMonth: 3,
  /** Open deals you can juggle: this many, plus three per unit of sales staff output. */
  openDeals: 6,
  leadsPerProspect: [1, 3] as [number, number],
  /** Months to close from when the lead appears. */
  deadline: [2, 4] as [number, number],
  maxDiscountPct: 40,
  maxNegotiations: 3,
  /** Closed deals kept on the board. */
  keepClosed: 12,
  /** Pipeline customers who stopped buying, kept for the recap (feedback note). */
  keepChurned: 12,
  /** Bounds on the win chance: never certain, never hopeless. */
  chance: [0.05, 0.95] as [number, number],
} as const;

const OPEN: readonly SalesStage[] = [
  'lead',
  'contacted',
  'discovery',
  'demo',
  'proposal',
  'negotiation',
];
export const isOpenDeal = (d: SalesDeal) => OPEN.includes(d.stage);

/** Which stages each action can be taken from. */
export const ACTION_FROM: Record<SalesAction, readonly SalesStage[]> = {
  contact: ['lead'],
  discover: ['contacted'],
  demo: ['contacted', 'discovery'],
  propose: ['discovery', 'demo'],
  negotiate: ['proposal', 'negotiation'],
  close: ['proposal', 'negotiation'],
  recover: ['lost'],
};

const NEXT: Partial<Record<SalesAction, SalesStage>> = {
  contact: 'contacted',
  discover: 'discovery',
  demo: 'demo',
  propose: 'proposal',
  negotiate: 'negotiation',
};

// ---------------------------------------------------------------- Helpers

const salesOutput = (c: Company) => outputOf(c, ['sales']);
const prospectLimit = (c: Company) => SALES.prospectsPerMonth + Math.floor(salesOutput(c));
const openDealLimit = (c: Company) => SALES.openDeals + Math.floor(salesOutput(c) * 3);
const prospectsUsed = (c: Company, month: number) =>
  c.salesProspects?.month === month ? c.salesProspects.count : 0;

const actionCost = (m: MarketState, action: SalesAction): number =>
  scale(col(m), SALES.costCol[action] ?? 0);

/** The price the customer would pay after any discount. */
export const dealPrice = (c: Company, d: SalesDeal): number =>
  Math.max(1, Math.round((d.price ?? c.price) * (1 - (d.discountPct ?? 0) / 100)));

const segmentsOf = (m: MarketState, c: Company): SegmentState[] => {
  const all = Object.values(m.segments).filter((s) => s.industry === c.industry);
  const targeted = all.filter((s) => c.targetSegments.includes(s.key));
  const pool = targeted.length ? targeted : all;
  const b2b = pool.filter((s) => s.kind === 'b2b');
  return b2b.length ? b2b : pool;
};

/** The segments a company prospects in: the ones it targets in its industry (all of them if none). */
const prospectSegments = (m: MarketState, c: Company): string[] => {
  const all = Object.values(m.segments).filter((s) => s.industry === c.industry);
  const targeted = all.filter((s) => c.targetSegments.includes(s.key));
  return (targeted.length ? targeted : all).map((s) => s.key);
};

/**
 * Gameplay note: the segment a local business buys as (data/buyers.ts), one
 * the company targets first; null when it is no customer of this industry (a
 * spa or a co-working space for a healthtech company).
 */
export function businessSegment(m: MarketState, c: Company, b: LocalBusiness): string | null {
  const key =
    buyerSegment(c.industry, b.kind, prospectSegments(m, c)) ?? buyerSegment(c.industry, b.kind);
  return key && m.segments[key] ? key : null;
}

/** Does this business buy what the company sells (gameplay note: by kind; before it, by spending)? */
export const buysFrom = (world: World, c: Company, b: LocalBusiness): boolean =>
  gameplayOn(world)
    ? businessSegment(getMarket(world, c.market), c, b) !== null
    : (specOf(b).buys[c.industry] ?? 0) > 0;

/** What a founder would assume about a customer before discovery. */
export function assumed(m: MarketState, d: SalesDeal): SalesCustomer {
  const seg = m.segments[d.customer.segmentKey];
  const mid = (d.customer.budgetMin + d.customer.budgetMax) / 2;
  // You guess roughly right on budget (what such buyers usually spend), and average on the rest.
  const guess = seg ? (seg.budget + mid) / 2 : mid;
  return {
    ...d.customer,
    need: 'fit',
    budgetMin: Math.round(guess * 0.8),
    budgetMax: Math.round(guess * 1.2),
    authority: 0.6,
    urgency: 0.55,
    current: 'incumbent',
  };
}

interface Factors {
  price: number;
  fit: number;
  trust: number;
  authority: number;
  urgency: number;
  competition: number;
}

function factors(c: Company, d: SalesDeal, who: SalesCustomer, price: number): Factors {
  const mid = Math.max(1, (who.budgetMin + who.budgetMax) / 2);
  const fit = c.product.fit > 0 ? segmentFit(c, who.segmentKey) : 0;
  const demo = d.demoScore ?? 0.35;
  const productFit = clamp01(0.5 * fit + 0.5 * demo);
  const compete =
    who.current === 'rival'
      ? 0.45
      : who.current === 'incumbent'
        ? 0.3
        : who.current === 'spreadsheet'
          ? 0.12
          : 0;
  return {
    price: logistic(-5 * (price / mid - 1)),
    fit: productFit,
    trust: clamp01(who.trust),
    authority: clamp01(who.authority),
    urgency: clamp01(who.urgency),
    competition: clamp01(1 - compete * (1.2 - productFit)),
  };
}

/** How much each factor weighs in the chance, for a customer whose need is `need`. */
function chanceWeights(need: SalesNeed) {
  const w = {
    price: 0.25,
    fit: 0.25,
    trust: 0.2,
    rel: 0.1,
    stars: 0.05,
    authority: 0.075,
    urgency: 0.075,
  };
  // What they care about most counts double.
  if (need === 'price') w.price += 0.15;
  else if (need === 'fit') w.fit += 0.15;
  else if (need === 'reliability') w.rel += 0.15;
  else w.stars += 0.15;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  return { w, total };
}

function chanceFrom(c: Company, f: Factors, need: SalesNeed, founderSales: number): number {
  const rel = reliability(c);
  const stars = c.stars.value / 5;
  const { w, total } = chanceWeights(need);
  const base =
    (w.price * f.price +
      w.fit * f.fit +
      w.trust * f.trust +
      w.rel * rel +
      w.stars * stars +
      w.authority * f.authority +
      w.urgency * f.urgency) /
    total;
  const s = base * (0.75 + 0.25 * f.competition) + (founderSales / 100) * 0.05;
  return clamp(s, SALES.chance[0], SALES.chance[1]);
}

/**
 * The chance this deal closes if you ask now, 0.05–0.95. Before discovery,
 * computed on what you'd assume (an estimate); after it, on what you know.
 */
export function winChance(
  world: World,
  c: Company,
  d: SalesDeal,
  opts: { price?: number; known?: boolean; founder?: Player } = {},
): number {
  const m = getMarket(world, c.market);
  const who = (opts.known ?? d.revealed) ? d.customer : assumed(m, d);
  const f = factors(c, d, who, opts.price ?? dealPrice(c, d));
  const founder = opts.founder ?? world.players[c.founderIds[0]!];
  const base = chanceFrom(c, f, who.need, founder?.skills.sales ?? 0);
  // Journey 4a: a rival's price cut or better product weighs a little (zero
  // before the journey-events release note, so old logs replay unchanged).
  const pressure = rivalPressure(world, c);
  // Founder Journey 6: the starting idea's demand, competition and founder fit
  // (zero for companies founded without an idea, so they are unchanged).
  // Phase 3: how the founder feels (life bars; zero before that release note).
  const edge = starterIdeaEdge(c) + barEdgeIn(world, founder);
  return pressure > 0 || edge !== 0
    ? clamp(base - pressure + edge, SALES.chance[0], SALES.chance[1])
    : base;
}

/** A bigger-than-usual lead for a decision event (decisions.ts); null when nobody here buys. */
export function eventLead(
  world: World,
  c: Company,
  rng: Rng,
  budgetX: number,
): SalesCustomer | null {
  const m = getMarket(world, c.market);
  const who = makeLead(world, c, m, rng, undefined);
  if (!who) return null;
  who.budgetMin = Math.max(1, Math.round(who.budgetMin * budgetX));
  who.budgetMax = Math.max(2, Math.round(who.budgetMax * budgetX));
  return who;
}

/** Room for one more open deal? */
export const hasDealRoom = (c: Company): boolean =>
  (c.deals ?? []).filter(isOpenDeal).length < openDealLimit(c);

/** Put a decision event's customer on the pipeline at a given stage (ids from the per-company counter). */
export function addEventDeal(
  c: Company,
  customer: SalesCustomer,
  opts: { stage: SalesStage; discountPct: number; trust: number; month: number; months: number },
): SalesDeal {
  c.salesSeq = (c.salesSeq ?? 0) + 1;
  const d: SalesDeal = {
    id: `${c.id}-d${c.salesSeq}`,
    customer: {
      ...customer,
      trust: Math.round(clamp01(customer.trust + opts.trust) * 100) / 100,
    },
    stage: opts.stage,
    createdMonth: opts.month,
    deadline: opts.month + opts.months,
    // They told you what they want: past the lead stage, you know them.
    revealed: opts.stage !== 'lead',
    ...(opts.stage === 'demo' ? { demoScore: 0.6 } : {}),
    ...(opts.discountPct > 0 ? { discountPct: opts.discountPct } : {}),
    ...(opts.stage === 'proposal' ? { price: c.price } : {}),
  };
  (c.deals ??= []).push(d);
  return d;
}

/** What can hold a deal's chance down (round 7): every loss reason but price and luck. */
export type HoldReason = Exclude<SalesLossReason, 'price' | 'luck'>;

/** Below this many chance points, a factor isn't holding the deal back. */
const HOLD_MIN = 0.03;
/** Lost with at least this chance, or with nothing holding it back: it was luck. */
export const LUCK_CHANCE = 0.65;

/**
 * Round 7: what is holding a deal's chance down, biggest first: each factor's
 * cost in chance points against a customer who'd be perfect on it (a fair
 * price, the middle of their band, costs nothing). Product fit is the fit for
 * their segment and the demo; trust is their trust, your stars and your
 * reliability; "can't sign alone", urgency and a rival they're locked in with
 * are theirs. Before discovery it reads what you'd assume.
 */
export function holdingBack(
  world: World,
  c: Company,
  d: SalesDeal,
  opts: { price?: number; known?: boolean } = {},
): { reason: HoldReason; cost: number }[] {
  const m = getMarket(world, c.market);
  const who = (opts.known ?? d.revealed) ? d.customer : assumed(m, d);
  const f = factors(c, d, who, opts.price ?? dealPrice(c, d));
  const { w, total } = chanceWeights(who.need);
  const rel = reliability(c);
  const stars = c.stars.value / 5;
  const base =
    (w.price * f.price +
      w.fit * f.fit +
      w.trust * f.trust +
      w.rel * rel +
      w.stars * stars +
      w.authority * f.authority +
      w.urgency * f.urgency) /
    total;
  const costs: [HoldReason, number][] = [
    ['missing_feature', (w.fit * (1 - f.fit)) / total],
    ['trust', (w.trust * (1 - f.trust) + w.rel * (1 - rel) + w.stars * (1 - stars)) / total],
    ['authority', (w.authority * (1 - f.authority)) / total],
    ['timing', (w.urgency * (1 - f.urgency)) / total],
    ['no_budget', (w.price * Math.max(0, 0.5 - f.price)) / total],
    ['competitor', base * 0.25 * (1 - f.competition)],
  ];
  return costs
    .map(([reason, cost]) => ({ reason, cost: round2(cost) }))
    .filter((x) => x.cost >= HOLD_MIN)
    .sort((a, b) => b.cost - a.cost);
}

/**
 * Round 7: the one real reason a deal was lost: what held it back most, or
 * luck when the chance was good and nothing big held it back.
 */
function realLossReason(world: World, c: Company, d: SalesDeal, chance: number): SalesLossReason {
  if (dealPrice(c, d) > d.customer.budgetMax * 1.6) return 'no_budget';
  const top = holdingBack(world, c, d, { known: true })[0];
  if (!top || chance >= LUCK_CHANCE || top.cost < 0.05) return 'luck';
  return top.reason;
}

/** Round 7: months until a customer lost on budget or timing wants to talk again. */
export function revisitMonths(d: SalesDeal, reason: SalesLossReason): number {
  if (reason === 'no_budget') return 3;
  return clamp(1 + Math.round((1 - d.customer.urgency) * 3), 1, 4);
}

/** Why a lost deal was lost: the weakest factor on their side. */
function lossReasonOf(c: Company, d: SalesDeal): SalesLossReason {
  const f = factors(c, d, d.customer, dealPrice(c, d));
  const ranked: [SalesLossReason, number][] = [
    ['price', f.price],
    ['missing_feature', f.fit],
    ['trust', f.trust],
    ['timing', f.urgency],
    ['no_budget', f.authority],
    ['competitor', f.competition],
  ];
  // A price far above what they can spend is a budget problem, not a haggle.
  if (dealPrice(c, d) > d.customer.budgetMax * 1.6) return 'no_budget';
  ranked.sort((a, b) => a[1] - b[1]);
  return ranked[0]![0];
}

function findDeal(world: World, me: Player, dealId: Id, companyId?: Id) {
  const ids = companyId ? [companyId] : me.companyIds;
  for (const id of ids) {
    const c = world.companies[id];
    const d = c?.deals?.find((x) => x.id === dealId);
    if (c && d) return { c: ownCompany(world, me.id, c.id), d };
  }
  return fail('sales.deal', 'That deal isn’t in your pipeline.');
}

function myCompany(world: World, me: Player, companyId?: Id): Company {
  if (companyId) return ownCompany(world, me.id, companyId);
  const c = me.companyIds
    .map((id) => world.companies[id])
    .find((x) => x && x.status === 'active' && x.founderIds.includes(me.id));
  ensure(c, 'sales.company', 'Start a company first: you need something to sell.');
  return c!;
}

function payFor(world: World, c: Company, m: MarketState, action: SalesAction, memo: string) {
  const cost = actionCost(m, action);
  if (cost <= 0) return 0;
  ensure(
    account(world, c.account).balance >= cost,
    'sales.cash',
    'Your company doesn’t have the cash for this right now.',
  );
  transfer(world, c.account, m.ext.suppliers, cost, memo, m.month);
  return cost;
}

const trustUp = (d: SalesDeal, by: number) => {
  d.customer.trust = Math.round(clamp01(d.customer.trust + by) * 100) / 100;
};

// ---------------------------------------------------------------- Leads

const B2B_SUFFIX = ['Traders', 'Logistics', 'Group', 'Supplies', 'Ventures', 'Partners', 'Stores'];
/**
 * Feedback note: a made-up lead's name fits its segment ("Ikoyi Distributors"
 * for a distributor, not "Ikoyi Logistics"). Households take the contact's surname.
 */
const SEGMENT_SUFFIX: Record<string, string[]> = {
  'fintech.traders': ['Traders', 'Provisions', 'Market Stall', 'Stores'],
  'fintech.online-sellers': ['Online Store', 'Shop', 'Ventures', 'Enterprises'],
  'fintech.distributors': ['Distributors', 'Wholesale', 'Supplies', 'Group'],
  'ecommerce.urban': ['household', 'family'],
  'ecommerce.retailers': ['Mini Mart', 'Stores', 'Provisions', 'Shop'],
  'ecommerce.brands': ['Brands', 'Foods', 'Beverages', 'Cosmetics'],
  'logistics.sellers': ['Online Store', 'Shop', 'Ventures', 'Enterprises'],
  'logistics.retailers': ['Mini Mart', 'Stores', 'Provisions', 'Shop'],
  'logistics.shippers': ['Distributors', 'Wholesale', 'Freight', 'Supplies'],
  'healthtech.families': ['family', 'household'],
  'healthtech.clinics': ['Clinic', 'Medical Centre', 'Pharmacy', 'Health Centre'],
  'healthtech.employers': ['Group', 'Industries', 'Holdings', 'Manufacturing'],
  'edtech.parents': ['family', 'household'],
  'edtech.schools': ['Academy', 'College', 'School', 'Learning Centre'],
  'edtech.corporate': ['Group', 'Holdings', 'Industries', 'Bank'],
  'saas.solo': ['Studio', 'Consulting', 'Designs', 'Services'],
  'saas.smes': ['Ventures', 'Enterprises', 'Services', 'Agency'],
  'saas.midmarket': ['Group', 'Holdings', 'Industries', 'Partners'],
  'agritech.farmers': ['Farms', 'Growers', 'Farm', 'Agro'],
  'agritech.food-retail': ['Foods', 'Mini Mart', 'Grocers', 'Kitchen'],
  'agritech.processors': ['Mills', 'Processing', 'Agro-Allied', 'Foods'],
};

function leadName(world: World, seg: SegmentState, place: string, person: string, rng: Rng) {
  const own = feedbackOn(world) ? SEGMENT_SUFFIX[seg.key] : undefined;
  if (!own) return `${place} ${rng.pick(B2B_SUFFIX)}`;
  const suffix = rng.pick(own);
  // A household is the contact's: "the Okafor household".
  if (suffix === suffix.toLowerCase()) return `The ${person.split(' ').at(-1)} ${suffix}`;
  return `${place} ${suffix}`;
}
const NEEDS: SalesNeed[] = ['fit', 'price', 'stars', 'reliability'];

function strongestNeed(seg: SegmentState | undefined, rng: Rng): SalesNeed {
  if (!seg || rng.chance(0.3)) return rng.pick(NEEDS);
  return NEEDS.slice().sort((a, b) => seg.needs[b] - seg.needs[a])[0]!;
}

export function makeLead(
  world: World,
  c: Company,
  m: MarketState,
  rng: Rng,
  b: LocalBusiness | undefined,
): SalesCustomer | null {
  let seg: SegmentState | undefined;
  if (b && gameplayOn(world)) {
    // Gameplay note: a business buys as the segment its kind belongs to, or not at all.
    const key = businessSegment(m, c, b);
    seg = key ? m.segments[key] : undefined;
  } else {
    const segs = segmentsOf(m, c);
    seg = segs.length ? rng.pick(segs) : undefined;
  }
  if (!seg) return null;
  const parts = CITY_NAME_PARTS[m.id];
  const person = `${rng.pick(rng.chance(0.5) ? parts.female : parts.male)} ${rng.pick(parts.last)}`;
  const base = b
    ? Math.max(sectorBudget(b, c.industry), Math.round(seg.budget * 0.6))
    : seg.kind === 'b2b'
      ? seg.budget
      : Math.round(seg.budget * rng.range(3, 8));
  const centre = Math.max(1, Math.round(base * rng.range(0.8, 1.3)));
  const supplier = b?.suppliers.find((s) => s.sector === c.industry);
  const rival = supplier ? world.companies[supplier.companyId] : undefined;
  const roll = rng.next();
  const current = rival
    ? 'rival'
    : roll < 0.45
      ? 'incumbent'
      : roll < 0.8
        ? 'spreadsheet'
        : 'nothing';
  return {
    name: b ? b.name : leadName(world, seg, rng.pick(parts.places), person, rng),
    contact: b ? b.owner.name : person,
    ...(b ? { businessId: b.id } : {}),
    segmentKey: seg.key,
    need: strongestNeed(seg, rng),
    budgetMin: Math.max(1, Math.round(centre * 0.75)),
    budgetMax: Math.max(2, Math.round(centre * 1.25)),
    authority: Math.round(rng.range(0.2, 1) * 100) / 100,
    urgency: Math.round(rng.range(0.1, 1) * 100) / 100,
    current,
    ...(current === 'rival' && rival
      ? { currentName: rival.name }
      : current === 'incumbent'
        ? { currentName: seg.incumbentName }
        : {}),
    trust:
      Math.round(
        clamp01(
          rng.range(0.15, 0.4) +
            (b ? Math.max(0, ...c.founderIds.map((f) => b.rapport[f] ?? 0)) * 0.3 : 0),
        ) * 100,
      ) / 100,
  };
}

/** Find new leads: 1–3 prospects from the city's businesses and your segments. */
export function prospect(world: World, me: Player, companyId?: Id) {
  const c = myCompany(world, me, companyId);
  const m = getMarket(world, c.market);
  const month = m.month;
  const used = prospectsUsed(c, month);
  ensure(
    used < prospectLimit(c),
    'sales.prospect.limit',
    'You’ve done all your prospecting this month. Hire sales staff to do more, or wait for next month.',
  );
  const deals = (c.deals ??= []);
  const open = deals.filter(isOpenDeal).length;
  ensure(
    open < openDealLimit(c),
    'sales.prospect.full',
    'Your pipeline is full. Close or drop a deal first.',
  );
  ensure(segmentsOf(m, c).length > 0, 'sales.prospect.market', 'No buyers for this product here.');
  spendHours(me, SALES.hours.prospect, 'Prospecting');
  c.salesProspects = { month, count: used + 1 };
  c.lastDecisionMonth = month;
  const rng = deriveRng(world.seed, 'sales', 'prospect', c.id, month, used);
  // Never a business already in the pipeline, already won, or already a customer by pitch
  // (business.pitch records it in the business's `suppliers`, filtered below).
  const taken = new Set([
    ...deals
      .filter((d) => isOpenDeal(d) || d.stage === 'won')
      .map((d) => d.customer.businessId)
      .filter(Boolean),
    ...(c.salesAccounts ?? []).map((a) => a.businessId).filter(Boolean),
  ]);
  // Gameplay note: only the kinds of business the segments you target are
  // (data/buyers.ts), not every business that spends something on the industry.
  const on = gameplayOn(world);
  const targets = prospectSegments(m, c);
  const businesses = Object.values(businessesOf(m))
    .filter(
      (b) =>
        isOpen(b) &&
        (on
          ? buyerSegment(c.industry, b.kind, targets) !== null
          : (specOf(b).buys[c.industry] ?? 0) > 0) &&
        !taken.has(b.id) &&
        !b.suppliers.some((s) => s.companyId === c.id),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = Math.min(
    rng.int(SALES.leadsPerProspect[0], SALES.leadsPerProspect[1]),
    openDealLimit(c) - open,
  );
  const added: SalesDeal[] = [];
  for (let i = 0; i < n; i++) {
    let b: LocalBusiness | undefined;
    if (businesses.length && rng.chance(0.6)) {
      b = businesses.splice(rng.int(0, businesses.length - 1), 1)[0];
    }
    const customer = makeLead(world, c, m, rng, b);
    if (!customer) break;
    c.salesSeq = (c.salesSeq ?? 0) + 1;
    const fast = customer.urgency > 0.7 ? 0 : 1;
    const d: SalesDeal = {
      id: `${c.id}-d${c.salesSeq}`,
      customer,
      stage: 'lead',
      createdMonth: month,
      deadline: month + clamp(rng.int(SALES.deadline[0], SALES.deadline[1]) - 1 + fast, 1, 6),
      revealed: false,
    };
    deals.push(d);
    added.push(d);
  }
  return {
    leads: added.map((d) => ({ id: d.id, name: d.customer.name })),
    message:
      added.length === 1
        ? `New lead: ${added[0]!.customer.name}.`
        : `${added.length} new leads: ${added.map((d) => d.customer.name).join(', ')}.`,
  };
}

// ---------------------------------------------------------------- Moving a deal

export interface SalesAdvanceInput {
  companyId?: Id;
  dealId: Id;
  action: SalesAction;
  price?: number;
  discountPct?: number;
}

export function advanceDeal(world: World, me: Player, cmd: SalesAdvanceInput) {
  const { c, d } = findDeal(world, me, cmd.dealId, cmd.companyId);
  const m = getMarket(world, c.market);
  const month = m.month;
  const a = cmd.action;
  ensure(
    ACTION_FROM[a].includes(d.stage),
    'sales.stage',
    'That step isn’t possible at this stage of the deal.',
  );
  if (a === 'recover') {
    ensure(!d.recovered, 'sales.recover.used', 'You’ve already tried to win this one back.');
    ensure(!d.expired, 'sales.recover.expired', 'This deal ran out of time.');
    const wait = Math.max(1, (d.revisit ?? month) - month);
    ensure(
      d.revisit === undefined,
      'sales.recover.later',
      `They asked you to come back ${wait === 1 ? 'next month' : `in ${wait} months`}: the lead opens again then.`,
    );
  } else {
    ensure(month <= d.deadline, 'sales.deadline', 'This deal has run out of time.');
  }
  const hours = SALES.hours[a];
  ensure(
    hoursLeft(me) >= hours,
    'hours.short',
    'You don’t have enough hours left this month for that.',
  );
  c.lastDecisionMonth = month;
  const name = d.customer.name;
  const skill = me.skills.sales / 100;
  const label = `${a[0]!.toUpperCase()}${a.slice(1)}: ${name}`;
  let cost = 0;
  switch (a) {
    case 'contact':
      spendHours(me, hours, label);
      trustUp(d, 0.06 + 0.06 * skill);
      break;
    case 'discover': {
      cost = payFor(world, c, m, a, `Discovery meeting: ${name}`);
      spendHours(me, hours, label);
      d.revealed = true;
      trustUp(d, 0.07);
      // Talking to a real customer teaches you about the whole segment.
      const k = d.customer.segmentKey;
      const before = c.product.discovery[k] ?? 0;
      c.product.discovery[k] = Math.round(clamp01(before + 0.1 * (1 - before)) * 1000) / 1000;
      me.skills.sales = Math.min(100, me.skills.sales + 1);
      break;
    }
    case 'demo': {
      cost = payFor(world, c, m, a, `Demo: ${name}`);
      spendHours(me, hours, label);
      const rng = deriveRng(world.seed, 'sales', 'demo', d.id, d.recovered ? 2 : 1);
      const fit = segmentFit(c, d.customer.segmentKey);
      const rel = reliability(c);
      const luck = rng.normal(0, 0.06);
      const score =
        DEMO_WEIGHTS.fit * fit +
        DEMO_WEIGHTS.quality * c.product.quality +
        DEMO_WEIGHTS.reliability * rel +
        (d.revealed ? DEMO_WEIGHTS.discovery : 0) +
        luck;
      d.demoScore = Math.round(clamp01(score) * 100) / 100;
      // Feedback note: keep what the score was made of, to explain it.
      if (feedbackOn(world))
        d.demoParts = {
          fit: round2(fit),
          quality: round2(c.product.quality),
          reliability: round2(rel),
          discovery: d.revealed,
          luck: round2(luck),
        };
      trustUp(d, (d.demoScore - 0.4) * 0.3);
      break;
    }
    case 'propose': {
      const price = cmd.price ?? d.price ?? c.price;
      ensure(price > 0, 'sales.price', 'Name a price above zero.');
      ensure(
        price <= Math.max(c.price, d.customer.budgetMax) * 20,
        'sales.price',
        'That price isn’t serious.',
      );
      spendHours(me, hours, label);
      d.price = price;
      d.discountPct = 0;
      break;
    }
    case 'negotiate': {
      const pct = cmd.discountPct ?? 0;
      ensure(
        Number.isInteger(pct) && pct >= 0 && pct <= SALES.maxDiscountPct,
        'sales.discount',
        'A discount can be at most 40%.',
      );
      ensure(
        (d.negotiations ?? 0) < SALES.maxNegotiations,
        'sales.negotiate.limit',
        'They’re tired of haggling. Close the deal or walk away.',
      );
      spendHours(me, hours, label);
      d.negotiations = (d.negotiations ?? 0) + 1;
      d.discountPct = pct;
      if (cmd.price !== undefined) {
        ensure(cmd.price > 0, 'sales.price', 'Name a price above zero.');
        d.price = cmd.price;
      }
      // Meeting them halfway builds a little goodwill.
      if (pct > 0) trustUp(d, 0.02);
      break;
    }
    case 'close':
      spendHours(me, hours, label);
      return closeDeal(world, me, c, d, month);
    case 'recover':
      spendHours(me, hours, label);
      return recoverDeal(d, month);
  }
  const next = NEXT[a];
  if (next) d.stage = next;
  return {
    dealId: d.id,
    stage: d.stage,
    cost,
    probability: winChance(world, c, d, { founder: me }),
    ...(a === 'discover' ? { revealed: true } : {}),
    ...(a === 'demo' ? { demoScore: d.demoScore } : {}),
  };
}

/**
 * Ask for the deal. A sales conversation (salestalk.ts) passes the chance its
 * turns earned and its own RNG label; the pipeline's close uses the plain one.
 */
export function closeDeal(
  world: World,
  me: Player,
  c: Company,
  d: SalesDeal,
  month: number,
  opts: { chance?: number; label?: string } = {},
) {
  const chance = opts.chance ?? winChance(world, c, d, { known: true, founder: me });
  const attempt = d.recovered ? 2 : 1;
  const rng = deriveRng(world.seed, 'sales', opts.label ?? 'close', d.id, attempt);
  const won = rng.next() < chance;
  d.closedMonth = month;
  if (won) {
    d.stage = 'won';
    delete d.lossReason;
    const monthly = dealPrice(c, d);
    (c.salesAccounts ??= []).push({
      dealId: d.id,
      name: d.customer.name,
      segmentKey: d.customer.segmentKey,
      ...(d.customer.businessId ? { businessId: d.customer.businessId } : {}),
      monthly,
      since: month,
    });
    for (const fid of c.founderIds) {
      const f = world.players[fid];
      if (!f || f.ai) continue;
      achieve(world, f, 'founder.first-customer', 'First customer', month);
    }
    me.skills.sales = Math.min(100, me.skills.sales + 2);
    // Founder Journey 6: the first customer pays its first month now (idea companies only).
    const paidNow = firstPayment(world, c, d.customer.name, monthly);
    return {
      dealId: d.id,
      stage: d.stage,
      won: true,
      monthly,
      chance,
      ...(paidNow > 0 ? { paidNow } : {}),
    };
  }
  d.stage = 'lost';
  if (gameplayOn(world)) {
    // Round 7: the one real reason, and a date to come back on budget or timing.
    d.lossReason = realLossReason(world, c, d, chance);
    if (d.lossReason === 'no_budget' || d.lossReason === 'timing')
      d.revisit = month + revisitMonths(d, d.lossReason);
  } else d.lossReason = lossReasonOf(c, d);
  me.skills.sales = Math.min(100, me.skills.sales + 1);
  return {
    dealId: d.id,
    stage: d.stage,
    won: false,
    lossReason: d.lossReason,
    canRecover: !d.recovered && d.revisit === undefined,
    ...(d.revisit !== undefined ? { revisit: d.revisit } : {}),
    chance,
  };
}

/** One more try after a loss: you address their objection and get back to the table. */
function recoverDeal(d: SalesDeal, month: number) {
  const reason = d.lossReason ?? 'price';
  d.recovered = true;
  // A new conversation once you're back at the table (only feedback-note deals
  // have one): the last one's turns are over, and sitting down again draws new
  // openings (salestalk.ts keeps only the count).
  if (d.talk) d.talk = { n: d.talk.n, month: d.talk.month, leadOptions: [] };
  delete d.closedMonth;
  d.deadline = Math.max(d.deadline, month + 1);
  d.negotiations = Math.min(d.negotiations ?? 0, SALES.maxNegotiations - 1);
  switch (reason) {
    case 'missing_feature':
      // Show them again once the product has moved on.
      d.stage = 'discovery';
      break;
    case 'trust':
      trustUp(d, 0.2);
      d.stage = 'negotiation';
      break;
    case 'timing':
      d.customer.urgency = Math.round(clamp01(d.customer.urgency + 0.25) * 100) / 100;
      d.deadline += 1;
      d.stage = 'negotiation';
      break;
    case 'no_budget':
    case 'authority':
      // You get in front of whoever holds the budget (and signs).
      d.customer.authority = Math.round(clamp01(d.customer.authority + 0.3) * 100) / 100;
      d.stage = 'negotiation';
      break;
    case 'competitor':
      trustUp(d, 0.1);
      d.stage = 'negotiation';
      break;
    default:
      d.stage = 'negotiation';
  }
  d.revealed = true;
  return { dealId: d.id, stage: d.stage, recovering: reason };
}

/**
 * Round 7: a deal lost on budget or timing opens again when they asked: back
 * to "contacted", what you learned kept, the budget renewed or the need now
 * pressing, a fresh deadline and one more recovery attempt.
 */
function reopenDeal(d: SalesDeal, month: number) {
  const reason = d.lossReason;
  delete d.revisit;
  delete d.lossReason;
  delete d.closedMonth;
  delete d.recovered;
  if (reason === 'no_budget') {
    d.customer.budgetMin = Math.round(d.customer.budgetMin * 1.15);
    d.customer.budgetMax = Math.round(d.customer.budgetMax * 1.15);
  } else d.customer.urgency = Math.round(clamp01(d.customer.urgency + 0.3) * 100) / 100;
  if (d.talk) d.talk = { n: d.talk.n, month: d.talk.month, leadOptions: [] };
  d.stage = 'contacted';
  d.createdMonth = month;
  d.deadline = month + 2;
  d.negotiations = 0;
}

export function dropDeal(world: World, me: Player, dealId: Id, companyId?: Id) {
  const { c, d } = findDeal(world, me, dealId, companyId);
  ensure(d.stage !== 'won', 'sales.drop.won', 'This is a customer now, not a deal.');
  c.deals = c.deals!.filter((x) => x.id !== d.id);
  return { dropped: d.id };
}

// ---------------------------------------------------------------- Settlement

/**
 * Monthly, for companies with a pipeline: deals past their deadline are lost
 * on timing, and won accounts may churn on poor service. Billing happens in
 * settleFinances (B2B invoices → receivables).
 */
export function settleSales(world: World, c: Company, month: number) {
  if (!c.deals?.length && !c.salesAccounts?.length) return;
  for (const d of c.deals ?? []) {
    if (!isOpenDeal(d) || month <= d.deadline) continue;
    d.stage = 'lost';
    d.lossReason = 'timing';
    d.expired = true;
    d.closedMonth = month;
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'warning',
        text: `${d.customer.name} went cold: the deal ran out of time.`,
      });
  }
  // Round 7: a customer who said "come back in N months" is ready to talk again.
  for (const d of c.deals ?? []) {
    if (d.stage !== 'lost' || d.revisit === undefined || month < d.revisit) continue;
    reopenDeal(d, month);
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'lead',
        text: `${d.customer.name} asked you to come back about now: they’re ready to talk again.`,
      });
  }
  if (c.salesAccounts?.length) {
    const rng = deriveRng(world.seed, 'sales', 'churn', c.id, month);
    const rel = reliability(c);
    const p = clamp(0.015 * (1.7 - rel) + (c.hibernation ? 0.1 : 0), 0.005, 0.3);
    // Feedback note: a customer committed to a pilot then a year (or a year up
    // front) stays until it ends, and one who leaves is recorded with why.
    const on = feedbackOn(world);
    const kept = [];
    for (const a of c.salesAccounts) {
      const committed = on && a.committedUntil !== undefined && month <= a.committedUntil;
      if (a.since < month && !committed && rng.chance(p)) {
        const reason: SalesChurnReason = !on
          ? 'switched'
          : c.hibernation
            ? 'hibernation'
            : rel < CHURN_RELIABLE
              ? 'reliability'
              : 'switched';
        for (const fid of c.founderIds)
          notify(world, fid, {
            month,
            kind: 'warning',
            text: on
              ? `${a.name} stopped buying from ${c.name}: ${CHURN_WHY[reason]}.`
              : `${a.name} stopped buying from ${c.name}.`,
          });
        if (on) {
          const d = c.deals?.find((x) => x.id === a.dealId);
          if (d) d.churned = { month, reason };
          const list = (c.salesChurn ??= []);
          list.push({ dealId: a.dealId, name: a.name, monthly: a.monthly, month, reason });
          if (list.length > SALES.keepChurned) list.splice(0, list.length - SALES.keepChurned);
        }
        continue;
      }
      kept.push(a);
    }
    c.salesAccounts = kept;
  }
  if (c.deals) {
    // A lead waiting to come back stays on the board until it does.
    const closed = c.deals.filter((d) => !isOpenDeal(d) && d.revisit === undefined);
    if (closed.length > SALES.keepClosed) {
      const drop = new Set(
        closed
          .slice()
          .sort((a, b) => (a.closedMonth ?? 0) - (b.closedMonth ?? 0))
          .slice(0, closed.length - SALES.keepClosed)
          .map((d) => d.id),
      );
      c.deals = c.deals.filter((d) => !drop.has(d.id));
    }
  }
}

/** Below this reliability, a customer who leaves blames outages and slow support. */
const CHURN_RELIABLE = 0.6;

/** Why a pipeline customer left, in a few words (inbox, recap). */
export const CHURN_WHY: Record<SalesChurnReason, string> = {
  reliability: 'outages and slow support',
  hibernation: 'you paused the company',
  switched: 'they moved to another supplier',
};

/** Monthly invoices from pipeline customers (settleFinances adds them to B2B billing). */
export const salesBilling = (c: Company): number =>
  (c.salesAccounts ?? []).reduce((a, x) => a + x.monthly, 0);

// ---------------------------------------------------------------- View

interface SalesNextAction {
  action: SalesAction;
  hours: number;
  cost: number;
}

/** Round 7: why a lost deal was lost, in the customer's words, and when to come back. */
function lossView(d: SalesDeal, month: number) {
  const reason = d.lossReason!;
  const wait = d.revisit !== undefined ? Math.max(0, d.revisit - month) : null;
  const months = MONTHS_WORDS(
    d.revisit !== undefined ? Math.max(1, d.revisit - (d.closedMonth ?? month)) : 1,
  );
  const rival = d.customer.currentName;
  const words = LOSS_WORDS[reason];
  const fill = (s: string, lang: 'en' | 'fr') =>
    s
      .replace(/\{months\}/g, months[lang])
      .replace(
        /\{rival\}/g,
        rival ?? (lang === 'en' ? 'their current supplier' : 'leur fournisseur actuel'),
      );
  return {
    reason,
    words: { en: fill(words.en, 'en'), fr: fill(words.fr, 'fr') },
    luck: reason === 'luck',
    /** Months until the lead opens again (lost on budget or timing); null otherwise. */
    revisitIn: wait,
  };
}

export function salesView(world: World, c: Company, viewer?: Player) {
  const m = getMarket(world, c.market);
  const month = m.month;
  const deals = c.deals ?? [];
  const founder = viewer ?? world.players[c.founderIds[0]!];
  const view = deals.map((d) => {
    const known = d.revealed;
    const seg = m.segments[d.customer.segmentKey];
    const biz = d.customer.businessId ? businessesOf(m)[d.customer.businessId] : undefined;
    const actions: SalesNextAction[] = (Object.keys(ACTION_FROM) as SalesAction[])
      .filter((a) => ACTION_FROM[a].includes(d.stage))
      .filter((a) =>
        a === 'recover'
          ? !d.recovered && !d.expired && d.revisit === undefined
          : month <= d.deadline,
      )
      .filter((a) => a !== 'negotiate' || (d.negotiations ?? 0) < SALES.maxNegotiations)
      .map((a) => ({ action: a, hours: SALES.hours[a], cost: actionCost(m, a) }));
    const open = isOpenDeal(d);
    return {
      id: d.id,
      stage: d.stage,
      name: d.customer.name,
      contact: d.customer.contact,
      businessId: d.customer.businessId ?? null,
      segment: seg?.name ?? '',
      /** Why this kind of customer buys (the segment's needs: "Records, billing, data protection"). */
      segmentNeeds: seg?.needsLabel ?? '',
      /** What kind of business a local business is ("Spa"); null for a made-up lead. */
      businessKind: biz ? specOf(biz).label : null,
      createdMonth: d.createdMonth,
      deadline: d.deadline,
      monthsLeft: open ? Math.max(0, d.deadline - month) : null,
      revealed: known,
      /** What you know: null until discovery. */
      known: {
        need: known ? d.customer.need : null,
        budgetMin: known ? d.customer.budgetMin : null,
        budgetMax: known ? d.customer.budgetMax : null,
        authority: known ? d.customer.authority : null,
        urgency: known ? d.customer.urgency : null,
        current: known ? d.customer.current : null,
        currentName: known ? (d.customer.currentName ?? null) : null,
        trust: known ? d.customer.trust : null,
      },
      listPrice: c.price,
      price: d.price ?? null,
      discountPct: d.discountPct ?? 0,
      value: dealPrice(c, d),
      probability: open ? winChance(world, c, d, { founder }) : d.stage === 'won' ? 1 : 0,
      estimate: open && !known,
      demoScore: d.demoScore ?? null,
      /** Feedback note: what the demo score was made of (null before it). */
      demoParts: d.demoParts ?? null,
      negotiationsLeft: SALES.maxNegotiations - (d.negotiations ?? 0),
      actions,
      next: actions.find((x) => x.action === 'close') ?? actions[0] ?? null,
      lossReason: d.lossReason ?? null,
      /** Round 7: the one real reason in their words, and when they'll talk again. */
      loss: d.stage === 'lost' && d.lossReason && gameplayOn(world) ? lossView(d, month) : null,
      canRecover: d.stage === 'lost' && !d.recovered && !d.expired && d.revisit === undefined,
      expired: !!d.expired,
      /** Won, then they stopped buying (feedback note): when and why. */
      churned: d.churned ?? null,
    };
  });
  const won = deals.filter((d) => d.stage === 'won').length;
  const churned = deals.filter((d) => d.stage === 'won' && d.churned).length;
  const lost = deals.filter((d) => d.stage === 'lost' && (d.recovered || d.expired)).length;
  const openDeals = view.filter((d) => d.monthsLeft !== null);
  const used = prospectsUsed(c, month);
  const limit = prospectLimit(c);
  const full = deals.filter(isOpenDeal).length >= openDealLimit(c);
  return {
    stages: OPEN,
    deals: view,
    accounts: (c.salesAccounts ?? []).map((a) => ({ ...a })),
    stats: {
      open: openDeals.length,
      won,
      lost,
      winRate: won + lost > 0 ? won / (won + lost) : null,
      /** Won deals whose customer has since stopped buying. */
      churned,
      /** Monthly value of open deals, weighted by their chance. */
      pipelineValue: Math.round(openDeals.reduce((a, d) => a + d.value * d.probability, 0)),
      /** Monthly billing from pipeline customers. */
      monthly: salesBilling(c),
    },
    prospect: {
      used,
      limit,
      hours: SALES.hours.prospect,
      openLimit: openDealLimit(c),
      blocker: used >= limit ? ('limit' as const) : full ? ('full' as const) : null,
    },
  };
}

export type SalesView = ReturnType<typeof salesView>;
