/**
 * Founder setup (player feedback: "I just started and it says I'm short of
 * pay day. Like the bank, when setting up I should be asked how much I want
 * to put in"). What the banker's licence gives a banker, for a new founder:
 * one step at a time, nothing hidden.
 *
 *   1. Idea & industry: the café's idea or the Start a company form
 *      (`company.found`), which only reserves the name now.
 *   2. Register: the company type and its registry fee, paid from savings.
 *   3. Fund: your own money (`company.contribute`), the city's schemes
 *      (`accelerator.apply`, `grant.apply`) and startup loans from city
 *      lenders and player-run banks (`company.loan`).
 *   4. Business plan & pitch, when asking for loans: the plan's fields with
 *      live checks (`setupPlanChecks`); a red check blocks sending. A city
 *      lender decides at once and deterministically (approved, approved with
 *      conditions, declined with reasons), like the licence decisions; a
 *      player bank's banker reads the plan on the deal card and decides.
 *   5. Office: work from home or lease one of several offices in different
 *      districts; the rent goes through the ledger every month.
 *
 * Until the office is chosen the company has no costs, so no payday or
 * runway warning shows before there is anything to pay.
 *
 * Replay safety: only companies founded with `company.found`/`company.start`
 * in feedback-note worlds carry `setup`; every rule here reads that field, so
 * older companies and worlds play exactly as before.
 */
import type { LenderProductSeed } from './data/capital.js';
import type { DECLINE_REASONS } from './commands.js';
import { CITY_DISTRICTS } from './data/businesses.js';
import { INDUSTRY_LABEL } from './data/industries.js';
import { companyQuote, founderQuote, productAmount, productRateBps } from './capital.js';
import { bankFigures } from './banks.js';
import { monthlyCosts } from './company.js';
import { creditProfile } from './credit.js';
import { monthlyPayment, openDeal } from './deals.js';
import { districtWeights, randomDistrict, stableDistrict } from './districts.js';
import { ensure, fail } from './errors.js';
import { col, getMarket, notify, spendHours, totalCustomers } from './helpers.js';
import { account, transfer } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { lifestyleCost } from './personal.js';
import { createRng, hashString } from './rng.js';
import { customerFacts } from './traction.js';
import { INCORPORATION } from './world.js';
import type {
  Company,
  DealCard,
  FounderSetup,
  Id,
  Incorporation,
  LoanTerms,
  MarketState,
  Player,
  SetupCheck,
  SetupCheckLevel,
  SetupDecision,
  SetupOffice,
  SetupPlan,
  SetupPlanFields,
  StartupApplication,
  World,
} from './types.js';

/** Every threshold in one place. */
export const SETUP = {
  hours: { register: 2, plan: 1, office: 1 },
  /** A city lender approves from this score, with conditions from `conditionsFrom`. */
  approveFrom: 70,
  conditionsFrom: 55,
  /** Approved with conditions: this share now, the rest after paying customers. */
  trancheNow: 0.6,
  trancheCustomersMax: 10,
  /** How well a lender wants you to know the customer (customer understanding). */
  understanding: 0.2,
  /** The runway a lender likes to see. */
  goalMonths: 12,
  /** The rate and term the plan's repayment check assumes before a lender is picked. */
  planSpreadBps: 600,
  planTermMonths: 24,
  /** A bank side check: the capital ratio after the loan, against the regulator's minimum. */
  minCapitalRatio: 0.1,
} as const;

/** What a banker's decline reason says (deal history; the client words it again). */
export const DECLINE_REASON_TEXT: Record<(typeof DECLINE_REASONS)[number], string> = {
  'no-customers': 'no customers yet',
  repayment: 'the repayment is too high for the costs',
  'thin-plan': 'the plan is thin',
  credit: 'the credit record',
  capital: 'the bank’s capital can’t carry it now',
};

/** Is this company still setting up (no costs yet)? */
export const inSetup = (c: Company): boolean => !!c.setup && c.setup.step !== 'done';

export function newSetup(month: number): FounderSetup {
  return { step: 'register', startedMonth: month, decisions: [] };
}

const setupOf = (c: Company): FounderSetup => {
  ensure(c.setup, 'setup.none', 'This company is already set up.');
  return c.setup;
};

/** The registry fee for a company type, in the company's currency. */
export const registryFee = (m: MarketState, inc: Incorporation): number =>
  scale(col(m), INCORPORATION[inc].costCol);

// ---------------------------------------------------------------- step 2: register

export function registerCompany(world: World, me: Player, c: Company, inc: Incorporation) {
  const s = setupOf(c);
  ensure(s.step === 'register', 'setup.step', `${c.name} is registered already.`);
  const m = getMarket(world, c.market);
  const fee = registryFee(m, inc);
  ensure(
    account(world, me.accounts.local).balance >= fee,
    'ledger.funds',
    `The registry fee is ${formatMoney(fee, m.data.currency)}; your savings don’t cover it.`,
  );
  spendHours(me, SETUP.hours.register, 'Registering the company');
  transfer(
    world,
    me.accounts.local,
    m.ext.suppliers,
    fee,
    `Registration: ${c.name} (${INCORPORATION[inc].label})`,
    m.month,
  );
  c.incorporation = inc;
  s.registered = { month: m.month, fee, incorporation: inc };
  s.step = 'fund';
  return {
    fee,
    message: `${c.name} is registered as a ${INCORPORATION[inc].label}. Next: fund it.`,
  };
}

// ---------------------------------------------------------------- step 4: the plan

/** What the plan checks stand on besides the fields typed. */
export interface SetupPlanBase {
  /** The segment's monthly budget per customer. */
  budget: number;
  /** Customer understanding, 0–1. */
  known: number;
  /** Money in the company today. */
  cash: number;
  /** Buyers a young company can hope to reach (a tenth of the segment). */
  reachable: number;
  rateBps: number;
  termMonths: number;
}

const band = (ok: boolean, warn: boolean): SetupCheckLevel => (ok ? 'good' : warn ? 'warn' : 'bad');

/**
 * The plan's checks, live as the founder types (the bank plan's pattern):
 * price against what the customers pay, margin, customers to break even,
 * how long the money really lasts, customer understanding and repayments.
 * -1 in `real` means the money never runs out.
 */
export function setupPlanChecks(f: SetupPlanFields, b: SetupPlanBase): SetupCheck[] {
  const margin = f.price - f.costToServe;
  const marginPct = f.price > 0 ? Math.round((margin / f.price) * 100) : 0;
  const need = margin > 0 ? Math.ceil(f.monthlyCosts / margin) : 0;
  const pay = f.ask > 0 ? monthlyPayment(f.ask, b.rateBps, b.termMonths) : 0;
  const out = f.monthlyCosts + pay;
  const money = Math.max(0, b.cash) + f.ask;
  const real = out > 0 ? Math.round((money / out) * 10) / 10 : -1;
  const askFor = Math.max(0, Math.round(f.months * out - Math.max(0, b.cash)));
  const payPct = f.monthlyCosts > 0 ? Math.round((pay / f.monthlyCosts) * 100) : 0;
  const knownPct = Math.round(b.known * 100);
  const pricePct = b.budget > 0 ? Math.round((f.price / b.budget) * 100) : 0;
  return [
    {
      id: 'price',
      level: b.budget <= 0 ? 'good' : band(f.price <= b.budget, f.price <= b.budget * 1.2),
      values: { price: f.price, budget: b.budget, pct: pricePct },
    },
    {
      id: 'margin',
      level: band(marginPct >= 50, marginPct > 20),
      values: { margin, pct: marginPct, price: f.price },
    },
    {
      id: 'breakEven',
      level:
        margin <= 0 ? 'bad' : band(f.customersMonth6 >= need, need <= Math.max(1, b.reachable)),
      values: { need, plan: f.customersMonth6, costs: f.monthlyCosts },
    },
    {
      id: 'runway',
      level: real < 0 ? 'good' : band(f.months <= real, f.months <= real * 1.1),
      values: { claimed: f.months, real, askFor, sayMonths: Math.max(0, Math.floor(real)) },
    },
    {
      id: 'understanding',
      level: b.known >= SETUP.understanding ? 'good' : 'warn',
      values: { have: knownPct, need: Math.round(SETUP.understanding * 100) },
    },
    {
      id: 'repayment',
      level: band(payPct <= 30, payPct <= 50),
      values: { pay, pct: payPct },
    },
  ];
}

/** 0–100: seven tenths the plan's checks, three tenths the founder's credit. */
export function planScore(checks: SetupCheck[], creditScore: number): number {
  const points = checks.reduce(
    (a, x) => a + (x.level === 'good' ? 1 : x.level === 'warn' ? 0.5 : 0),
    0,
  );
  return Math.round((70 * points) / Math.max(1, checks.length) + (30 * creditScore) / 100);
}

/** The base for a segment, at a rate and term (the plan's indicative ones unless given). */
export function planBase(
  world: World,
  c: Company,
  segment: string,
  loan?: { rateBps: number; termMonths: number },
): SetupPlanBase {
  const m = getMarket(world, c.market);
  const seg = m.segments[segment];
  const facts = customerFacts(world, c);
  return {
    budget: seg?.budget ?? 0,
    known: Math.max(facts.known, c.product.discovery[segment] ?? 0),
    cash: account(world, c.account).balance,
    reachable: Math.round((seg?.buyers ?? 0) * 0.1),
    rateBps: loan?.rateBps ?? m.data.baseRateBps + SETUP.planSpreadBps,
    termMonths: loan?.termMonths ?? SETUP.planTermMonths,
  };
}

export function filePlan(world: World, me: Player, c: Company, fields: SetupPlanFields) {
  const s = setupOf(c);
  ensure(
    s.step === 'fund' || s.step === 'plan',
    'setup.step',
    s.step === 'register' ? 'Register the company first.' : 'The setup is past the plan.',
  );
  const m = getMarket(world, c.market);
  ensure(m.segments[fields.segment], 'setup.segment', 'Pick who the plan is for.');
  ensure(fields.price > 0, 'setup.price', 'Set a price.');
  const checks = setupPlanChecks(fields, planBase(world, c, fields.segment));
  const red = checks.filter((x) => x.level === 'bad');
  ensure(!red.length, 'setup.plan.red', 'Fix the red checks before you send the plan.');
  if (!s.plan) spendHours(me, SETUP.hours.plan, 'Writing the business plan');
  const plan: SetupPlan = {
    ...fields,
    sell: fields.sell.trim(),
    month: m.month,
    checks,
    score: planScore(checks, creditProfile(world, me).score),
  };
  s.plan = plan;
  s.step = 'plan';
  return { score: plan.score, message: 'Plan ready: lenders and banks read it when you ask.' };
}

// ---------------------------------------------------------------- startup loans

function productOf(m: MarketState, lenderId: Id, productId: string) {
  const lender = m.lenders?.[lenderId];
  const product = lender?.products.find((p) => p.id === productId);
  if (!lender || !product) fail('loan.lender', 'That lender doesn’t offer that loan here.');
  return { lender, product };
}

/** Startup loans in setup are the lenders' founder products, lent to the company. */
export const isStartupProduct = (p: LenderProductSeed): boolean => p.borrower === 'founder';

const termFor = (p: LenderProductSeed, n: number) =>
  clamp(Math.round(n), Math.max(3, p.termMonths[0]), Math.min(60, p.termMonths[1]));

/**
 * A city lender decides a startup loan from the plan, at once and always the
 * same way for the same plan: eligible (credit), then the score: approved,
 * approved with conditions (part now, the rest after paying customers), or
 * declined with the checks to fix.
 */
export function decideStartupLoan(
  world: World,
  me: Player,
  c: Company,
  req: {
    lenderId: Id;
    productId: string;
    amount: number;
    months: number;
    personalGuarantee: boolean;
  },
) {
  const s = setupOf(c);
  ensure(s.plan, 'setup.plan', 'Write the business plan first: lenders read it.');
  const m = getMarket(world, c.market);
  const { lender, product } = productOf(m, req.lenderId, req.productId);
  ensure(req.amount > 0, 'loan.amount', 'Ask for an amount.');
  const prior = s.decisions.find(
    (x) =>
      x.lenderId === lender.id &&
      x.productId === product.id &&
      (x.outcome !== 'declined'
        ? !!x.dealId && ['open', 'accepted'].includes(world.deals[x.dealId]?.status ?? '')
        : x.month === m.month),
  );
  ensure(
    !prior,
    'loan.open',
    prior?.outcome === 'declined'
      ? `${lender.name} answered this month. Fix the plan and ask again next month.`
      : world.deals[prior?.dealId ?? '']?.status === 'accepted'
        ? `You already have ${lender.name}’s ${product.label.toLowerCase()}.`
        : `${lender.name} already said yes: accept or decline that offer.`,
  );
  const quote = founderQuote(world, m, lender, product, me);
  const rateBps = productRateBps(m, product);
  const months = termFor(product, req.months);
  const [min] = productAmount(world, m, product);
  const amount = quote.eligible ? clamp(req.amount, min, quote.maxMinor) : req.amount;
  const checks = setupPlanChecks(
    { ...s.plan, ask: amount },
    planBase(world, c, s.plan.segment, { rateBps, termMonths: months }),
  );
  const credit = creditProfile(world, me).score;
  const score = planScore(checks, credit);
  const weak = checks.filter((x) => x.level !== 'good');
  const conditional =
    score < SETUP.approveFrom ||
    checks.some((x) => (x.id === 'breakEven' || x.id === 'understanding') && x.level !== 'good');
  const outcome: SetupDecision['outcome'] = !quote.eligible
    ? 'declined'
    : score < SETUP.conditionsFrom
      ? 'declined'
      : conditional
        ? 'conditions'
        : 'approved';
  const now =
    outcome === 'approved'
      ? amount
      : outcome === 'conditions'
        ? Math.max(min, Math.round(amount * SETUP.trancheNow))
        : 0;
  const breakEven = checks.find((x) => x.id === 'breakEven')!.values.need ?? 0;
  const decision: SetupDecision = {
    lenderId: lender.id,
    productId: product.id,
    month: m.month,
    outcome,
    score,
    amount: outcome === 'declined' ? 0 : amount,
    now,
    rest: outcome === 'conditions' ? Math.max(0, amount - now) : 0,
    restAfterCustomers:
      outcome === 'conditions'
        ? clamp(breakEven || SETUP.trancheCustomersMax, 1, SETUP.trancheCustomersMax)
        : 0,
    rateBps,
    months,
    reasons: weak,
    lenderReason: quote.eligible ? null : quote.reason,
    dealId: null,
  };
  if (outcome !== 'declined') {
    const terms: LoanTerms = {
      kind: 'loan',
      amount: now,
      rateBps,
      months,
      personalGuarantee:
        product.guarantee === 'required'
          ? true
          : product.guarantee === 'none'
            ? false
            : req.personalGuarantee,
      productId: product.id,
    };
    const deal = openDeal(world, {
      companyId: c.id,
      proposer: { kind: 'bank', id: m.id, lenderId: lender.id },
      counterparty: { kind: 'company', id: c.id },
      terms,
      by: lender.id,
      aiLimit: { maxAmount: now, minRateBps: rateBps, needsGuarantee: terms.personalGuarantee },
    });
    decision.dealId = deal.id;
  }
  s.decisions = s.decisions.filter(
    (x) => !(x.lenderId === lender.id && x.productId === product.id),
  );
  s.decisions.push(decision);
  const cur = m.data.currency;
  const message =
    outcome === 'approved'
      ? `${lender.name} approved ${formatMoney(amount, cur)}. Accept it on the offer card.`
      : outcome === 'conditions'
        ? `${lender.name} approved ${formatMoney(amount, cur)} with conditions: ${formatMoney(now, cur)} now, the rest after ${decision.restAfterCustomers} paying customers.`
        : `${lender.name} declined${quote.reason ? `: “${quote.reason}”` : ` (score ${score}/100).`}`;
  return { decision, dealId: decision.dealId, message };
}

/** A player bank's startup loan application carries the plan (`company.loan` with a bank). */
export function attachApplication(world: World, me: Player, c: Company, deal: DealCard) {
  const s = setupOf(c);
  ensure(s.plan, 'setup.plan', 'Write the business plan first: the banker reads it.');
  const m = getMarket(world, c.market);
  const profile = creditProfile(world, me);
  const app: StartupApplication = {
    plan: s.plan,
    ownMoney: (c.founderEquity?.[me.id] ?? 0) + (c.founderLoans?.[me.id] ?? 0),
    creditScore: profile.score,
    defaults: me.credit.defaults,
    alsoApproved: s.decisions
      .filter((x) => x.outcome !== 'declined')
      .map((x) => m.lenders?.[x.lenderId]?.name ?? x.lenderId),
  };
  deal.application = app;
}

/** Month end: a condition met (paying customers) releases the rest of a loan. */
export function settleSetup(world: World, c: Company, month: number) {
  const s = c.setup;
  if (!s) return;
  const m = getMarket(world, c.market);
  const earned = customerFacts(world, c).earned;
  for (const d of s.decisions) {
    if (d.rest <= 0 || d.restDealId || !d.dealId) continue;
    if (world.deals[d.dealId]?.status !== 'accepted' || earned < d.restAfterCustomers) continue;
    const first = world.deals[d.dealId]!.terms as LoanTerms;
    const deal = openDeal(world, {
      companyId: c.id,
      proposer: { kind: 'bank', id: m.id, lenderId: d.lenderId },
      counterparty: { kind: 'company', id: c.id },
      terms: { ...first, amount: d.rest },
      by: d.lenderId,
      aiLimit: {
        maxAmount: d.rest,
        minRateBps: d.rateBps,
        needsGuarantee: first.personalGuarantee,
      },
    });
    d.restDealId = deal.id;
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'deal',
        text: `${m.lenders?.[d.lenderId]?.name ?? 'Your lender'}: ${d.restAfterCustomers} paying customers, condition met. The second ${formatMoney(d.rest, m.data.currency)} is ready on the offer card.`,
        ref: { kind: 'deal', id: deal.id },
      });
  }
}

// ---------------------------------------------------------------- step 5: the office

type OfficeKind = SetupOffice['id'];
const OFFICE_KINDS: Record<
  OfficeKind,
  { desks: number; seatMult: number; leaseMonths: number; size: number; tags: string[] }
> = {
  home: { desks: 1, seatMult: 0, leaseMonths: 0, size: 0, tags: ['no-room'] },
  cowork: { desks: 2, seatMult: 1, leaseMonths: 1, size: 0, tags: ['engineers'] },
  small: { desks: 4, seatMult: 0.9, leaseMonths: 12, size: 38, tags: ['customers'] },
  shop: { desks: 3, seatMult: 0.85, leaseMonths: 6, size: 20, tags: ['customers', 'noisy'] },
  serviced: { desks: 4, seatMult: 1.6, leaseMonths: 12, size: 30, tags: ['investors'] },
};
export const OFFICE_IDS = Object.keys(OFFICE_KINDS) as OfficeKind[];

/** A district's pull against the city average (0.6–1.5): busy districts cost more. */
function districtPull(market: Company['market'], district: string): number {
  const all = districtWeights(market);
  const avg = all.reduce((a, d) => a + d.w, 0) / Math.max(1, all.length);
  const w = all.find((d) => d.district === district)?.w ?? avg;
  return clamp(w / avg, 0.6, 1.5);
}

const homeDistrictOf = (c: Company, founderId: Id) =>
  stableDistrict(c.market, 'home', founderId) ?? CITY_DISTRICTS[c.market]?.[0] ?? 'centre';

/** Minutes each way between two districts (by their order on the city plan). */
function commute(c: Company, from: string, to: string): number {
  if (from === to) return 15;
  const list = CITY_DISTRICTS[c.market] ?? [];
  const a = list.indexOf(from);
  const b = list.indexOf(to);
  return a < 0 || b < 0 ? 30 : 15 + 10 * Math.abs(a - b);
}

export interface OfficeOption {
  id: OfficeKind;
  district: string;
  desks: number;
  rent: number;
  leaseMonths: number;
  size: number;
  commute: number;
  tags: string[];
}

/** Work from home, or one of four offices in different districts (stable per company). */
export function officeOptions(world: World, c: Company, founderId: Id): OfficeOption[] {
  const m = getMarket(world, c.market);
  const seat = Math.round(m.data.officeSeat * 100);
  const home = homeDistrictOf(c, founderId);
  const weights = districtWeights(c.market);
  const busiest = weights.reduce(
    (a, d) => (d.w > a.w ? d : a),
    weights[0] ?? { district: home, w: 0 },
  ).district;
  const rng = createRng(hashString(`office:${c.market}:${c.id}`));
  const used = [busiest];
  const pick = () => {
    const d = randomDistrict(c.market, rng, used) ?? busiest;
    used.push(d);
    return d;
  };
  const districts: Record<OfficeKind, string> = {
    home,
    cowork: pick(),
    small: pick(),
    shop: pick(),
    serviced: busiest,
  };
  return OFFICE_IDS.map((id) => {
    const k = OFFICE_KINDS[id];
    const district = districts[id];
    return {
      id,
      district,
      desks: k.desks,
      rent:
        id === 'home'
          ? 0
          : Math.round(seat * k.desks * k.seatMult * districtPull(c.market, district)),
      leaseMonths: k.leaseMonths,
      size: k.size,
      commute: id === 'home' ? 0 : commute(c, home, district),
      tags: k.tags,
    };
  });
}

export function leaseOffice(world: World, me: Player, c: Company, officeId: OfficeKind) {
  const s = setupOf(c);
  ensure(s.step === 'office', 'setup.step', 'Fund the company first, then choose an office.');
  const o = officeOptions(world, c, me.id).find((x) => x.id === officeId);
  ensure(o, 'setup.office', 'Pick one of the offices on offer.');
  const m = getMarket(world, c.market);
  if (o.id !== 'home') spendHours(me, SETUP.hours.office, 'Signing the lease');
  s.office = {
    id: o.id,
    district: o.district,
    desks: o.desks,
    rent: o.rent,
    leaseMonths: o.leaseMonths,
    month: m.month,
  };
  s.step = 'done';
  s.doneMonth = m.month;
  return {
    rent: o.rent,
    message:
      o.id === 'home'
        ? `${c.name} works from home for now. Setup done: next, your first customers.`
        : `Lease signed: ${o.desks} desks for ${formatMoney(o.rent, m.data.currency)} a month. Setup done: next, your first customers.`,
  };
}

/** Move on to the office (needs money in the company), or back to funding. */
export function setupNext(world: World, c: Company, to: 'office' | 'fund') {
  const s = setupOf(c);
  ensure(s.step !== 'register', 'setup.step', 'Register the company first.');
  if (to === 'fund') {
    ensure(s.step === 'plan' || s.step === 'office', 'setup.step', 'You’re on funding already.');
    s.step = 'fund';
    return { step: s.step };
  }
  ensure(s.step === 'fund' || s.step === 'plan', 'setup.step', 'Choose the office now.');
  ensure(
    account(world, c.account).balance > 0,
    'setup.money',
    'Put money into the company first: your own, a scheme or a loan.',
  );
  s.step = 'office';
  return { step: s.step };
}

/**
 * The rent a set-up company pays: the lease, plus a desk at the city's seat
 * price for everyone beyond its desks. Null for companies without a lease
 * (founded the old way), which pay per seat as before.
 */
export function leaseRent(m: MarketState, c: Company): number | null {
  const o = c.setup?.office;
  if (!o) return null;
  const seats = c.staff.length + c.founderIds.length;
  return o.rent + Math.max(0, seats - o.desks) * Math.round(m.data.officeSeat * 100);
}

// ---------------------------------------------------------------- the view

/**
 * Costs a month once the company is open, with `rent` for the office: what
 * runs today (loans, pay) plus the base cloud bill and the rent. A company
 * still setting up has neither yet; an open one already pays both.
 */
function monthlyOnceOpen(world: World, c: Company, rent: number): number {
  const m = getMarket(world, c.market);
  const running = monthlyCosts(world, c);
  return inSetup(c) ? running + scale(col(m), 0.05) + rent : running;
}

/** What the setup tracker shows: the steps, the money, the plan and its answers, the offices. */
export function setupView(world: World, c: Company, viewer: Player) {
  const s = c.setup;
  if (!s) return null;
  const m = getMarket(world, c.market);
  const cash = account(world, c.account).balance;
  const offices = officeOptions(world, c, viewer.id);
  const cheapestLease = offices.filter((o) => o.id !== 'home').sort((a, b) => a.rent - b.rent)[0];
  const rent = s.office ? s.office.rent : (cheapestLease?.rent ?? 0);
  const baseline = monthlyOnceOpen(world, c, rent);
  const monthly = Math.max(s.plan?.monthlyCosts ?? 0, baseline);
  const order = ['register', 'fund', 'plan', 'office', 'done'] as const;
  const at = order.indexOf(s.step);
  const status = (i: number, skipped = false) =>
    at > i ? (skipped ? 'skipped' : 'done') : at === i ? 'current' : 'upcoming';
  const ownEquity = c.founderEquity?.[viewer.id] ?? 0;
  const ownLoan = c.founderLoans?.[viewer.id] ?? 0;
  const segments = c.targetSegments
    .concat(Object.keys(m.segments).filter((k) => !c.targetSegments.includes(k)))
    .map((k) => m.segments[k]!)
    .filter((seg) => !!seg)
    .slice(0, 6)
    .map((seg) => ({ key: seg.key, name: seg.name, base: planBase(world, c, seg.key) }));
  return {
    step: s.step,
    startedMonth: s.startedMonth,
    steps: [
      { id: 'idea' as const, status: 'done' as const },
      { id: 'register' as const, status: status(0) },
      { id: 'fund' as const, status: status(1) },
      { id: 'plan' as const, status: status(2, !s.plan) },
      { id: 'office' as const, status: status(3) },
    ],
    done: s.step === 'done' ? 5 : 1 + at,
    registered: s.registered ?? null,
    types: (Object.keys(INCORPORATION) as Incorporation[]).map((id) => ({
      id,
      label: INCORPORATION[id].label,
      fee: registryFee(m, id),
      investorAppeal: INCORPORATION[id].investorAppeal,
    })),
    hours: SETUP.hours,
    savings: account(world, viewer.accounts.local).balance,
    livingCost: lifestyleCost(world, viewer),
    own: { equity: ownEquity, loan: ownLoan },
    credit: creditProfile(world, viewer).score,
    defaults: viewer.credit.defaults,
    runway: {
      cash,
      monthly,
      baseline,
      months: monthly > 0 ? Math.round((cash / monthly) * 10) / 10 : -1,
      goal: SETUP.goalMonths,
    },
    plan: s.plan ?? null,
    segments,
    decisions: s.decisions.map((d) => ({
      ...d,
      lenderName: m.lenders?.[d.lenderId]?.name ?? d.lenderId,
      productLabel:
        m.lenders?.[d.lenderId]?.products.find((p) => p.id === d.productId)?.label ?? d.productId,
      dealStatus: d.dealId ? (world.deals[d.dealId]?.status ?? null) : null,
      monthly: d.now > 0 ? monthlyPayment(d.now, d.rateBps, d.months) : 0,
    })),
    /** City lenders' startup loans (founder products, lent to the company) and why not. */
    loans: Object.values(m.lenders ?? {}).flatMap((l) =>
      l.products.map((p) => {
        const q = isStartupProduct(p)
          ? founderQuote(world, m, l, p, viewer)
          : companyQuote(world, m, l, p, c);
        return {
          lenderId: l.id,
          lenderName: l.name,
          kind: l.kind,
          productId: p.id,
          label: p.label,
          startup: isStartupProduct(p),
          rateBps: productRateBps(m, p),
          amount: productAmount(world, m, p),
          termMonths: p.termMonths,
          guarantee: p.guarantee,
          eligible: isStartupProduct(p) && q.eligible,
          reason: q.reason,
          maxMinor: q.maxMinor,
        };
      }),
    ),
    offices: offices.map((o) => ({
      ...o,
      runwayMonths:
        monthlyOnceOpen(world, c, o.rent) > 0
          ? Math.round(
              (cash / Math.max(s.plan?.monthlyCosts ?? 0, monthlyOnceOpen(world, c, o.rent))) * 10,
            ) / 10
          : -1,
    })),
    office: s.office ?? null,
    doneMonth: s.doneMonth ?? null,
    customers: totalCustomers(c),
  };
}

/** The bank side of a startup loan application: what the banker checks before deciding. */
export function applicationView(world: World, d: DealCard) {
  const a = d.application;
  if (!a || d.terms.kind !== 'loan') return null;
  const t = d.terms;
  const c = d.companyId ? world.companies[d.companyId] : undefined;
  const lenderSide = d.counterparty.kind === 'playerbank' ? d.counterparty : d.proposer;
  const bank = lenderSide.kind === 'playerbank' ? world.banks[lenderSide.id] : undefined;
  const pay = monthlyPayment(t.amount, t.rateBps, t.months);
  const payPct = a.plan.monthlyCosts > 0 ? Math.round((pay / a.plan.monthlyCosts) * 100) : 0;
  const paying = c ? customerFacts(world, c).earned : 0;
  const breakEven = a.plan.checks.find((x) => x.id === 'breakEven')?.values.need ?? 0;
  let ratioAfter = 0;
  let single = 0;
  if (bank) {
    const f = bankFigures(world, bank);
    ratioAfter =
      f.loans + t.amount > 0 ? Math.round((f.equity / (f.loans + t.amount)) * 1000) / 10 : 100;
    single = f.equity > 0 ? Math.round((t.amount / f.equity) * 1000) / 10 : 100;
  }
  const min = SETUP.minCapitalRatio * 100;
  const checks: { id: string; level: SetupCheckLevel; values: Record<string, number> }[] = [
    {
      id: 'repayment',
      level: band(payPct <= 30, payPct <= 50),
      values: { pay, costs: a.plan.monthlyCosts, pct: payPct },
    },
    {
      id: 'customers',
      level: band(paying >= breakEven && breakEven > 0, true),
      values: { paying, breakEven },
    },
    {
      id: 'credit',
      level: band(a.creditScore >= 55 && a.defaults === 0, a.creditScore >= 40),
      values: { score: a.creditScore, defaults: a.defaults },
    },
    {
      id: 'capital',
      level: band(ratioAfter >= min * 1.1, ratioAfter >= min),
      values: { after: ratioAfter, min },
    },
    { id: 'single', level: band(single <= 10, single <= 25), values: { pct: single } },
  ];
  const founder = c ? world.players[c.founderIds[0] ?? ''] : undefined;
  return {
    ...a,
    founder: founder ? { id: founder.id, name: founder.name, ai: founder.ai } : null,
    industryLabel: c ? INDUSTRY_LABEL[c.industry] : null,
    checks,
    monthly: pay,
    interest: Math.max(0, pay * t.months - t.amount),
  };
}
