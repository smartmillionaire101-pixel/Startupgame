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
import type {
  Company,
  Id,
  LocalBusiness,
  MarketState,
  Player,
  SalesAction,
  SalesCustomer,
  SalesDeal,
  SalesLossReason,
  SalesNeed,
  SalesStage,
  SegmentState,
  World,
} from './types.js';

// ---------------------------------------------------------------- Tuning

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
export const prospectLimit = (c: Company) => SALES.prospectsPerMonth + Math.floor(salesOutput(c));
export const openDealLimit = (c: Company) => SALES.openDeals + Math.floor(salesOutput(c) * 3);
export const prospectsUsed = (c: Company, month: number) =>
  c.salesProspects?.month === month ? c.salesProspects.count : 0;

export const actionCost = (m: MarketState, action: SalesAction): number =>
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

/** What a founder would assume about a customer before discovery. */
function assumed(m: MarketState, d: SalesDeal): SalesCustomer {
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

function chanceFrom(c: Company, f: Factors, need: SalesNeed, founderSales: number): number {
  const rel = reliability(c);
  const stars = c.stars.value / 5;
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
  return chanceFrom(c, f, who.need, founder?.skills.sales ?? 0);
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
const NEEDS: SalesNeed[] = ['fit', 'price', 'stars', 'reliability'];

function strongestNeed(seg: SegmentState | undefined, rng: Rng): SalesNeed {
  if (!seg || rng.chance(0.3)) return rng.pick(NEEDS);
  return NEEDS.slice().sort((a, b) => seg.needs[b] - seg.needs[a])[0]!;
}

function makeLead(
  world: World,
  c: Company,
  m: MarketState,
  rng: Rng,
  b: LocalBusiness | undefined,
): SalesCustomer | null {
  const segs = segmentsOf(m, c);
  const seg = segs.length ? rng.pick(segs) : undefined;
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
    name: b ? b.name : `${rng.pick(parts.places)} ${rng.pick(B2B_SUFFIX)}`,
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
  const taken = new Set(
    deals
      .filter((d) => isOpenDeal(d) || d.stage === 'won')
      .map((d) => d.customer.businessId)
      .filter(Boolean),
  );
  const businesses = Object.values(businessesOf(m))
    .filter(
      (b) =>
        isOpen(b) &&
        (specOf(b).buys[c.industry] ?? 0) > 0 &&
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
      const score =
        0.45 * fit +
        0.35 * c.product.quality +
        0.2 * reliability(c) +
        (d.revealed ? 0.08 : 0) +
        rng.normal(0, 0.06);
      d.demoScore = Math.round(clamp01(score) * 100) / 100;
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

function closeDeal(world: World, me: Player, c: Company, d: SalesDeal, month: number) {
  const chance = winChance(world, c, d, { known: true, founder: me });
  const attempt = d.recovered ? 2 : 1;
  const rng = deriveRng(world.seed, 'sales', 'close', d.id, attempt);
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
      monthly,
      since: month,
    });
    for (const fid of c.founderIds) {
      const f = world.players[fid];
      if (!f || f.ai) continue;
      achieve(world, f, 'founder.first-customer', 'First customer', month);
    }
    me.skills.sales = Math.min(100, me.skills.sales + 2);
    return { dealId: d.id, stage: d.stage, won: true, monthly, chance };
  }
  d.stage = 'lost';
  d.lossReason = lossReasonOf(c, d);
  me.skills.sales = Math.min(100, me.skills.sales + 1);
  return {
    dealId: d.id,
    stage: d.stage,
    won: false,
    lossReason: d.lossReason,
    canRecover: !d.recovered,
    chance,
  };
}

/** One more try after a loss: you address their objection and get back to the table. */
function recoverDeal(d: SalesDeal, month: number) {
  const reason = d.lossReason ?? 'price';
  d.recovered = true;
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
      // You get in front of whoever holds the budget.
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
  if (c.salesAccounts?.length) {
    const rng = deriveRng(world.seed, 'sales', 'churn', c.id, month);
    const rel = reliability(c);
    const p = clamp(0.015 * (1.7 - rel) + (c.hibernation ? 0.1 : 0), 0.005, 0.3);
    const kept = [];
    for (const a of c.salesAccounts) {
      if (a.since < month && rng.chance(p)) {
        for (const fid of c.founderIds)
          notify(world, fid, {
            month,
            kind: 'warning',
            text: `${a.name} stopped buying from ${c.name}.`,
          });
        continue;
      }
      kept.push(a);
    }
    c.salesAccounts = kept;
  }
  if (c.deals) {
    const closed = c.deals.filter((d) => !isOpenDeal(d));
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

/** Monthly invoices from pipeline customers (settleFinances adds them to B2B billing). */
export const salesBilling = (c: Company): number =>
  (c.salesAccounts ?? []).reduce((a, x) => a + x.monthly, 0);

// ---------------------------------------------------------------- View

export interface SalesNextAction {
  action: SalesAction;
  hours: number;
  cost: number;
}

export function salesView(world: World, c: Company, viewer?: Player) {
  const m = getMarket(world, c.market);
  const month = m.month;
  const deals = c.deals ?? [];
  const founder = viewer ?? world.players[c.founderIds[0]!];
  const view = deals.map((d) => {
    const known = d.revealed;
    const seg = m.segments[d.customer.segmentKey];
    const actions: SalesNextAction[] = (Object.keys(ACTION_FROM) as SalesAction[])
      .filter((a) => ACTION_FROM[a].includes(d.stage))
      .filter((a) => (a === 'recover' ? !d.recovered && !d.expired : month <= d.deadline))
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
      negotiationsLeft: SALES.maxNegotiations - (d.negotiations ?? 0),
      actions,
      next: actions.find((x) => x.action === 'close') ?? actions[0] ?? null,
      lossReason: d.lossReason ?? null,
      canRecover: d.stage === 'lost' && !d.recovered && !d.expired,
      expired: !!d.expired,
    };
  });
  const won = deals.filter((d) => d.stage === 'won').length;
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
