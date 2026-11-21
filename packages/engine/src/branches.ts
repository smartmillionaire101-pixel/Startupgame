/**
 * Business expansion (Wave 10): a company opens branches in other
 * neighbourhoods of its city, or in other cities. Each branch has a set-up
 * cost, monthly running costs and its own demand (the district, the city and
 * how good the product is). AI companies, and healthy local businesses, open
 * a branch now and then too (sparingly), so the city keeps changing.
 *
 * Money: set-up and running costs go from the company to the branch city's
 * suppliers (`ext.suppliers`, converted when the currencies differ); branch
 * takings come from that city's households (`ext.customers`). They are booked
 * into the company's P&L at its next settlement. A local business's branch
 * is funded from its parent's till. Every amount is a ledger transfer.
 *
 * Branches you can run (BRANCHES_NOTE, round 4 feedback): a branch keeps its
 * own local customers. Each month it wins some of the customers it can reach
 * (walk-ins as it ramps up, its local marketing budget, its sales reps; a
 * manager reaches further and keeps more) and loses a few, and takes what
 * they spend. The founders set its budget, hire and let go of branch staff,
 * work leads from its city in Sales (`sales.prospect` with a `market`, and
 * the reps bring one a month each) and pitch the city's businesses in person
 * when they are there (`company.branch.pitch`). Budgets go to the branch
 * city's suppliers, salaries to its payroll; customers pay from its
 * households. Branch customers count in the one customer total (traction.ts).
 */
import { CITY_NAME_PARTS } from './data/business-names.js';
import { CITY_DISTRICTS } from './data/businesses.js';
import type { MarketId } from './data/markets.js';
import { reliability } from './customers.js';
import { districtWeights, randomDistrict, stableDistrict } from './districts.js';
import { ECONOMY, businessesOf, districtLabel, isOpen, openBusiness, specOf } from './economy.js';
import { ensure } from './errors.js';
import {
  col,
  getMarket,
  hoursLeft,
  isEstablished,
  locationOf,
  notify,
  ownCompany,
  spendHours,
} from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, pay, payExact, valueIn } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { deriveRng, type Rng } from './rng.js';
import { branchCustomerCount, secondCityProgress } from './branchfacts.js';
import { branchesOn } from './releases.js';
import {
  SALES,
  addEventDeal,
  businessSegment,
  hasDealRoom,
  isOpenDeal,
  makeLead,
  prospect,
  prospectLimit,
  prospectsUsed,
} from './sales.js';
import type {
  Branch,
  BranchStaff,
  Company,
  Id,
  LocalBusiness,
  MarketState,
  Player,
  SalesCustomer,
  World,
} from './types.js';

export const BRANCH = {
  /** Fit-out, deposit and hiring, in the branch city's cost-of-living units. */
  setupCol: 8,
  /** Another city costs more to set up (lawyers, travel, a local manager). */
  abroadSetup: 1.5,
  /** Rent and staff a month. */
  opexCol: 3,
  /** Demand a branch can reach at full ramp, before quality (COL units a month). */
  demandCol: 6,
  /** Months to reach full demand. */
  rampMonths: 4,
  maxOpen: 6,
  hours: 10,
  /** AI companies: monthly chance to expand when they can afford it. */
  aiChance: 0.03,
  aiMaxOpen: 2,
  /** Local businesses: monthly chance a thriving one opens a second site, and the city cap. */
  localChance: 0.012,
  localCap: 12,
} as const;

/**
 * Branches note: how a branch wins its own customers (COL = the branch city's
 * monthly cost of living). At full ramp a branch with no budget and no staff
 * reaches `baseCustomers` before quality, district and climate, and they
 * spend `ticketCol` each: the same takings a branch made before the note.
 */
export const BRANCH_GROW = {
  baseCustomers: 40,
  ticketCol: BRANCH.demandCol / 40,
  /** Local marketing: customers reached per square root of COL units spent a month. */
  marketingReach: 20,
  maxBudgetCol: 8,
  /** Share of the customers it can reach but doesn't have yet that it wins in a month. */
  winShare: 0.4,
  /** Monthly churn, before poor reliability or hibernation. */
  churn: 0.05,
  rep: { salaryCol: 1.4, reach: 20, leads: 1, max: 3 },
  manager: { salaryCol: 2, reachX: 1.25, churnX: 0.5, max: 1 },
  hireHours: 4,
  /** Letting someone go (or closing with staff) costs a month of their salary. */
  severanceMonths: 1,
  pitchHours: 2,
  /** Trust a lead starts with when you met them in person, or prospected while in the city. */
  pitchTrust: 0.15,
  hereTrust: 0.08,
  /** Local businesses listed to pitch when you're in the branch's city. */
  pitchList: 8,
} as const;

export { branchCustomerCount, secondCityProgress } from './branchfacts.js';

const branchesOf = (world: World): Record<Id, Branch> => world.branches ?? {};

export const companyBranches = (world: World, companyId: Id): Branch[] =>
  Object.values(branchesOf(world)).filter((b) => b.companyId === companyId);

const openBranches = (world: World, companyId: Id) =>
  companyBranches(world, companyId).filter((b) => b.status === 'open');

/** Where a company's head office is: stored, or a stable district from its id (scattered). */
export function companyDistrict(c: Company): string {
  // Founder setup: a leased office is the head office.
  const office = c.setup?.office;
  if (office && office.id !== 'home') return office.district;
  return stableDistrict(c.market, 'company', c.id) ?? CITY_DISTRICTS[c.market]?.[0] ?? 'centre';
}

/** A district's pull relative to the city average (about 0.6–1.5). */
function districtPull(market: MarketId, district: string): number {
  const all = districtWeights(market);
  const avg = all.reduce((a, d) => a + d.w, 0) / Math.max(1, all.length);
  const w = all.find((d) => d.district === district)?.w ?? avg;
  return clamp(w / avg, 0.6, 1.5);
}

function branchCosts(world: World, c: Company, market: MarketId) {
  const m = getMarket(world, market);
  return {
    setup: scale(col(m), BRANCH.setupCol * (market === c.market ? 1 : BRANCH.abroadSetup)),
    opex: scale(col(m), BRANCH.opexCol),
  };
}

/** Why this company can't open a branch there (null when it can). */
function branchBlocker(
  world: World,
  c: Company,
  market: MarketId,
  district: string,
): string | null {
  const m = world.markets[market];
  if (!m) return 'That city isn’t open yet.';
  if (!(CITY_DISTRICTS[market] ?? []).includes(district)) return 'Pick a neighbourhood on the map.';
  if (c.status !== 'active') return `${c.name} isn’t operating.`;
  if (c.hibernation) return 'You can’t expand while the company hibernates.';
  if (market === c.market && district === companyDistrict(c))
    return `Your head office is already in ${districtLabel(district)}.`;
  const open = openBranches(world, c.id);
  if (open.some((b) => b.market === market && b.district === district))
    return `You already have a branch in ${districtLabel(district)}.`;
  if (open.length >= BRANCH.maxOpen) return `${BRANCH.maxOpen} branches is the most you can run.`;
  const { setup } = branchCosts(world, c, market);
  const cash = account(world, c.account);
  if (cash.balance < costIn(world, setup, m.data.currency, cash.currency))
    return `Opening there costs ${formatMoney(setup, m.data.currency)}; ${c.name} doesn’t have it.`;
  return null;
}

function openBranchFor(world: World, c: Company, market: MarketId, district: string): Branch {
  const m = getMarket(world, market);
  const { setup, opex } = branchCosts(world, c, market);
  payExact(
    world,
    c.account,
    m.ext.suppliers,
    setup,
    `Branch fit-out: ${districtLabel(district)}, ${m.data.name}`,
    getMarket(world, c.market).month,
  );
  const b: Branch = {
    id: newId(world, 'br'),
    companyId: c.id,
    market,
    district,
    openedMonth: m.month,
    status: 'open',
    monthlyOpex: opex,
    setupCost: setup,
    lastMonth: { month: m.month, revenue: 0, opex: 0 },
  };
  (world.branches ??= {})[b.id] = b;
  return b;
}

/** `company.branch.open`: a founder opens a branch. */
export function openBranch(
  world: World,
  me: Player,
  companyId: Id,
  market: MarketId,
  district: string,
) {
  const c = ownCompany(world, me.id, companyId);
  const blocker = branchBlocker(world, c, market, district);
  ensure(!blocker, 'branch.open', blocker ?? '');
  spendHours(me, BRANCH.hours, 'Opening a branch');
  const b = openBranchFor(world, c, market, district);
  c.lastDecisionMonth = getMarket(world, c.market).month;
  const m = getMarket(world, market);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  return {
    branchId: b.id,
    setupCost: b.setupCost,
    monthlyOpex: b.monthlyOpex,
    message: `${c.name} opened in ${districtLabel(district)}, ${m.data.name}: ${fmt(b.setupCost)} to set up, ${fmt(b.monthlyOpex)} a month to run. Customers find it over the next few months.`,
  };
}

/** `company.branch.close`. A month's rent breaks the lease (if the company can pay it). */
export function closeBranch(world: World, me: Player, branchId: Id) {
  const b = branchesOf(world)[branchId];
  ensure(b && b.status === 'open', 'branch.missing', 'That branch isn’t open.');
  const c = ownCompany(world, me.id, b.companyId);
  const m = getMarket(world, b.market);
  const cash = account(world, c.account);
  let paid = 0;
  if (cash.balance >= costIn(world, b.monthlyOpex, m.data.currency, cash.currency)) {
    payExact(
      world,
      c.account,
      m.ext.suppliers,
      b.monthlyOpex,
      'Branch lease break',
      getMarket(world, c.market).month,
    );
    paid = b.monthlyOpex;
  }
  // Branches note: its staff get a month's pay, and its marketing stops.
  let severance = 0;
  if (branchesOn(world)) {
    for (const s of b.staff ?? []) severance += letGo(world, c, b, s);
    b.staff = [];
    delete b.budget;
  }
  b.status = 'closed';
  b.closedMonth = m.month;
  b.closedReason = 'closed by the founders';
  return {
    leaseBreak: paid,
    ...(severance > 0 ? { severance } : {}),
    message: `The ${districtLabel(b.district)} branch has closed.`,
  };
}

/** How much a branch's product, district and city pull customers in (about 0.15–1.6). */
function branchPull(world: World, c: Company, market: MarketId, district?: string): number {
  const m = getMarket(world, market);
  const quality = 0.25 + 0.35 * c.product.fit + 0.25 * reliability(c) + 0.15 * (c.stars.value / 5);
  const climate = 0.85 + 0.15 * clamp(m.climate, 0.5, 1.6);
  const pull = district ? districtPull(market, district) : 1;
  return pull * quality * climate;
}

/**
 * What a branch takes in a month at full ramp (before noise), branch-city
 * minor units. Without a district: a typical one.
 */
function branchDemand(world: World, c: Company, market: MarketId, district?: string): number {
  const m = getMarket(world, market);
  return Math.round(scale(col(m), BRANCH.demandCol) * branchPull(world, c, market, district));
}

function shut(world: World, b: Branch, reason: string) {
  const m = getMarket(world, b.market);
  b.status = 'closed';
  b.closedMonth = m.month;
  b.closedReason = reason;
  const c = world.companies[b.companyId];
  if (c)
    for (const fid of c.founderIds)
      notify(world, fid, {
        month: getMarket(world, c.market).month,
        kind: 'warning',
        text: `${c.name}’s ${districtLabel(b.district)} branch in ${m.data.name} closed: ${reason}.`,
      });
}

/**
 * Each settlement of a city: its branches trade (takings from households,
 * running costs to suppliers). Branches of closed companies close.
 */
export function settleBranches(world: World, marketId: MarketId, month: number) {
  const m = getMarket(world, marketId);
  for (const b of Object.values(branchesOf(world))) {
    if (b.market !== marketId || b.status !== 'open') continue;
    const c = world.companies[b.companyId];
    if (!c || c.status !== 'active') {
      shut(world, b, 'the company is no longer operating');
      continue;
    }
    // Branches note: the branch's own customers, budget and staff.
    if (branchesOn(world)) {
      tradeBranch(world, c, b, m, month);
      continue;
    }
    const rng = deriveRng(world.seed, 'branches', b.id, month);
    const age = month - b.openedMonth;
    const ramp = Math.min(1, (age + 1) / BRANCH.rampMonths);
    const hibernating = c.hibernation ? 0.3 : 1;
    const takings = Math.max(
      0,
      Math.round(
        branchDemand(world, c, b.market, b.district) *
          ramp *
          hibernating *
          (1 + rng.normal(0, 0.08)),
      ),
    );
    const homeMonth = getMarket(world, c.market).month;
    const received = takings
      ? pay(
          world,
          m.ext.customers,
          c.account,
          takings,
          `Branch takings: ${districtLabel(b.district)}`,
          homeMonth,
        )
      : 0;
    const ledger = c.ledgerThisMonth;
    ledger.branchRevenue = (ledger.branchRevenue ?? 0) + received;
    const cash = account(world, c.account);
    if (cash.balance < costIn(world, b.monthlyOpex, m.data.currency, cash.currency)) {
      b.lastMonth = { month, revenue: takings, opex: 0 };
      shut(world, b, 'it couldn’t pay its rent and staff');
      continue;
    }
    const spent = payExact(
      world,
      c.account,
      m.ext.suppliers,
      b.monthlyOpex,
      `Branch running costs: ${districtLabel(b.district)}`,
      homeMonth,
    );
    ledger.branchCost = (ledger.branchCost ?? 0) + spent;
    b.lastMonth = { month, revenue: takings, opex: b.monthlyOpex };
  }
}

/**
 * AI expansion, sparingly and deterministically (own RNG stream): strong AI
 * companies that can afford it open a branch; thriving local businesses open
 * a second site in another district, funded from their own till.
 */
export function aiExpansion(world: World, marketId: MarketId, month: number) {
  const m = getMarket(world, marketId);
  const rng = deriveRng(world.seed, 'branches', 'ai', marketId, month);
  for (const c of Object.values(world.companies)) {
    if (!c.ai || c.market !== marketId || c.status !== 'active' || c.hibernation) continue;
    if (isEstablished(c)) continue;
    if (c.stars.value < 2.5 || openBranches(world, c.id).length >= BRANCH.aiMaxOpen) continue;
    if (!rng.chance(BRANCH.aiChance)) continue;
    const taken = openBranches(world, c.id)
      .filter((b) => b.market === marketId)
      .map((b) => b.district);
    const district = randomDistrict(marketId, rng, [companyDistrict(c), ...taken]);
    if (!district) continue;
    const { setup, opex } = branchCosts(world, c, marketId);
    // Only with the set-up cost and six months of running costs in the bank.
    if (account(world, c.account).balance < setup + opex * 6) continue;
    if (branchBlocker(world, c, marketId, district)) continue;
    openBranchFor(world, c, marketId, district);
  }
  localBranches(world, m, rng, month);
}

function localBranches(
  world: World,
  m: MarketState,
  rng: ReturnType<typeof deriveRng>,
  month: number,
) {
  const all = Object.values(businessesOf(m));
  if (all.filter((b) => b.branchOf && isOpen(b)).length >= BRANCH.localCap) return;
  for (const b of all) {
    if (!isOpen(b) || b.branchOf || b.landmark || b.health < 0.8) continue;
    if (all.some((x) => x.branchOf === b.id && isOpen(x))) continue;
    if (account(world, b.account).balance < b.base * 2) continue;
    if (!rng.chance(BRANCH.localChance)) continue;
    const district = randomDistrict(m.id, rng, [b.district]);
    if (!district) continue;
    const opened = openBusiness(
      world,
      m,
      -1,
      rng,
      month,
      false,
      {
        name: `${b.name} ${districtLabel(district).replace(/^the /, '')}`,
        kind: b.kind,
        district,
        street: null,
        owner: b.owner.name,
      },
      b.account,
    );
    if (opened) {
      opened.branchOf = b.id;
      opened.seed = -2;
      announce(world, m, b, opened, month);
    }
    return; // at most one a month
  }
}

function announce(
  world: World,
  m: MarketState,
  parent: LocalBusiness,
  b: LocalBusiness,
  month: number,
) {
  const text = `${parent.name} opened a second site in ${districtLabel(b.district)}.`;
  for (const p of Object.values(world.players))
    if (!p.ai && p.market === m.id) notify(world, p.id, { month, kind: 'system', text });
}

// ---------------------------------------------------------------- Running a branch (branches note)

/** What one branch customer spends a month, branch-city minor units. */
const ticketOf = (m: MarketState) => Math.max(1, scale(col(m), BRANCH_GROW.ticketCol));

const salaryOf = (m: MarketState, role: BranchStaff['role']) =>
  scale(col(m), BRANCH_GROW[role].salaryCol);

/** The most a branch can spend on local marketing a month (branch-city minor). */
export const maxBranchBudget = (m: MarketState) => scale(col(m), BRANCH_GROW.maxBudgetCol);

/** A branch's customers now (one from before the note: what its takings bought). */
function customersOf(world: World, b: Branch): number {
  if (b.customers !== undefined) return b.customers;
  return Math.round(b.lastMonth.revenue / ticketOf(getMarket(world, b.market)));
}

/**
 * The customers a branch can reach this month: walk-ins (as it ramps up),
 * its local marketing, its sales reps; a manager reaches further.
 */
function reachOf(world: World, c: Company, b: Branch, month: number, budget: number): number {
  const G = BRANCH_GROW;
  const m = getMarket(world, b.market);
  const staff = b.staff ?? [];
  const reps = staff.filter((s) => s.role === 'rep').length;
  const manager = staff.some((s) => s.role === 'manager');
  const ramp = Math.min(1, (month - b.openedMonth + 1) / BRANCH.rampMonths);
  const units = budget > 0 ? budget / Math.max(1, col(m)) : 0;
  const raw = G.baseCustomers * ramp + G.marketingReach * Math.sqrt(units) + G.rep.reach * reps;
  return raw * branchPull(world, c, b.market, b.district) * (manager ? G.manager.reachX : 1);
}

/** Monthly churn of a branch's customers. */
function churnOf(c: Company, b: Branch): number {
  const manager = (b.staff ?? []).some((s) => s.role === 'manager');
  const p =
    BRANCH_GROW.churn + Math.max(0, 0.55 - reliability(c)) * 0.4 + (c.hibernation ? 0.1 : 0);
  return clamp(p * (manager ? BRANCH_GROW.manager.churnX : 1), 0, 0.6);
}

/** Businesses in a city that buy what the company sells and aren't in its pipeline or book. */
function cityBusinesses(c: Company, m: MarketState): LocalBusiness[] {
  const taken = new Set(
    [
      ...(c.deals ?? [])
        .filter((d) => isOpenDeal(d) || d.stage === 'won')
        .map((d) => d.customer.businessId),
      ...(c.salesAccounts ?? []).map((a) => a.businessId),
    ].filter(Boolean),
  );
  return Object.values(businessesOf(m))
    .filter(
      (x) =>
        isOpen(x) &&
        !x.landmark &&
        !taken.has(x.id) &&
        !x.suppliers.some((s) => s.companyId === c.id) &&
        businessSegment(m, c, x) !== null,
    )
    .sort((a, z) => (a.id < z.id ? -1 : 1));
}

/**
 * A lead from a city: one of its businesses (or a buyer from its segments),
 * its budget converted to the company's currency, tagged with the city when
 * it isn't the company's own.
 */
function cityCustomer(
  world: World,
  c: Company,
  m: MarketState,
  rng: Rng,
  business?: LocalBusiness,
): SalesCustomer | null {
  let b = business;
  if (!b && rng.chance(0.6)) {
    const pool = cityBusinesses(c, m);
    if (pool.length) b = pool[rng.int(0, pool.length - 1)];
  }
  const who = makeLead(world, c, m, rng, b);
  if (!who) return null;
  const to = getMarket(world, c.market).data.currency;
  if (m.data.currency !== to) {
    who.budgetMin = Math.max(1, Math.round(valueIn(world, who.budgetMin, m.data.currency, to)));
    who.budgetMax = Math.max(2, Math.round(valueIn(world, who.budgetMax, m.data.currency, to)));
  }
  if (m.id !== c.market) who.market = m.id;
  return who;
}

/** The branch's staff member leaves with a month's pay (when the company can pay it). */
function letGo(world: World, c: Company, b: Branch, s: BranchStaff): number {
  const m = getMarket(world, b.market);
  const due = s.salary * BRANCH_GROW.severanceMonths;
  const cash = account(world, c.account);
  if (due <= 0 || cash.balance < costIn(world, due, m.data.currency, cash.currency)) return 0;
  payExact(
    world,
    c.account,
    m.ext.payroll,
    due,
    `Severance: ${s.name}`,
    getMarket(world, c.market).month,
  );
  return due;
}

/**
 * Branches note: a month at a branch. Its marketing is paid first (only when
 * the company can also cover rent and staff), then it wins and loses
 * customers and takes what they spend, pays rent (or closes), pays its staff
 * (someone unpaid leaves) and its reps bring leads from the city.
 */
function tradeBranch(world: World, c: Company, b: Branch, m: MarketState, month: number) {
  const G = BRANCH_GROW;
  const rng = deriveRng(world.seed, 'branches', 'grow', b.id, month);
  const homeMonth = getMarket(world, c.market).month;
  const ledger = c.ledgerThisMonth;
  const canPay = (amount: number) => {
    const cash = account(world, c.account);
    return cash.balance >= costIn(world, amount, m.data.currency, cash.currency);
  };
  const place = districtLabel(b.district);
  const staffCost = (b.staff ?? []).reduce((a, s) => a + s.salary, 0);
  // 1. Local marketing, paid up front for the month.
  const budget = c.hibernation ? 0 : (b.budget ?? 0);
  let marketing = 0;
  if (budget > 0 && canPay(budget + b.monthlyOpex + staffCost)) {
    ledger.branchCost =
      (ledger.branchCost ?? 0) +
      payExact(world, c.account, m.ext.suppliers, budget, `Branch marketing: ${place}`, homeMonth);
    marketing = budget;
  }
  // 2. Customers: won from those it can reach, a few lost, and what they spend.
  let customers = customersOf(world, b);
  const reach = reachOf(world, c, b, month, marketing);
  let won = 0;
  const gap = reach - customers;
  if (!c.hibernation && gap > 0.5)
    won = Math.max(1, Math.round(gap * G.winShare + rng.normal(0, 0.5)));
  const lost = Math.min(customers, Math.floor(customers * churnOf(c, b) + rng.next()));
  customers = Math.max(0, customers + won - lost);
  const takings = Math.max(0, Math.round(customers * ticketOf(m) * (1 + rng.normal(0, 0.05))));
  const received = takings
    ? pay(world, m.ext.customers, c.account, takings, `Branch takings: ${place}`, homeMonth)
    : 0;
  ledger.branchRevenue = (ledger.branchRevenue ?? 0) + received;
  b.customers = customers;
  const last = { month, revenue: takings, marketing, customers, won, lost };
  // 3. Rent and the shop team: a branch that can't pay them closes.
  if (!canPay(b.monthlyOpex)) {
    b.lastMonth = { ...last, opex: 0, staff: 0, leads: 0 };
    shut(world, b, 'it couldn’t pay its rent and staff');
    return;
  }
  ledger.branchCost =
    (ledger.branchCost ?? 0) +
    payExact(
      world,
      c.account,
      m.ext.suppliers,
      b.monthlyOpex,
      `Branch running costs: ${place}`,
      homeMonth,
    );
  // 4. Branch staff: paid, or they leave.
  let staffPaid = 0;
  const kept: BranchStaff[] = [];
  for (const s of b.staff ?? []) {
    if (!canPay(s.salary)) {
      for (const fid of c.founderIds)
        notify(world, fid, {
          month: homeMonth,
          kind: 'warning',
          text: `${s.name} left the ${place} branch: ${c.name} couldn’t pay their salary.`,
        });
      continue;
    }
    ledger.branchCost =
      (ledger.branchCost ?? 0) +
      payExact(world, c.account, m.ext.payroll, s.salary, `Branch salary: ${s.name}`, homeMonth);
    staffPaid += s.salary;
    kept.push(s);
  }
  if (b.staff) b.staff = kept;
  // 5. Each rep brings leads from the city into the Sales pipeline.
  let leads = 0;
  if (!c.hibernation)
    for (const s of kept) {
      if (s.role !== 'rep') continue;
      for (let i = 0; i < G.rep.leads && hasDealRoom(c); i++) {
        const who = cityCustomer(world, c, m, rng);
        if (!who) break;
        addEventDeal(c, who, {
          stage: 'lead',
          discountPct: 0,
          trust: 0.05,
          month: homeMonth,
          months: 3,
        });
        leads++;
      }
    }
  if (leads > 0)
    for (const fid of c.founderIds)
      notify(world, fid, {
        month: homeMonth,
        kind: 'lead',
        text:
          leads === 1
            ? `Your ${place} branch’s sales rep found a new lead in ${m.data.name}: it’s in Sales.`
            : `Your ${place} branch’s sales reps found ${leads} new leads in ${m.data.name}: they’re in Sales.`,
      });
  b.lastMonth = { ...last, opex: b.monthlyOpex, staff: staffPaid, leads };
}

function myOpenBranch(world: World, me: Player, branchId: Id) {
  const b = branchesOf(world)[branchId];
  ensure(b && b.status === 'open', 'branch.missing', 'That branch isn’t open.');
  const c = ownCompany(world, me.id, b!.companyId);
  return { b: b!, c, m: getMarket(world, b!.market) };
}

/** `company.branch.budget`: the branch's local marketing a month (branch-city minor units). */
export function setBranchBudget(world: World, me: Player, branchId: Id, amount: number) {
  const { b, m } = myOpenBranch(world, me, branchId);
  const max = maxBranchBudget(m);
  ensure(
    Number.isInteger(amount) && amount >= 0 && amount <= max,
    'branch.budget',
    `A branch’s marketing budget is between nothing and ${formatMoney(max, m.data.currency)} a month.`,
  );
  if (amount > 0) b.budget = amount;
  else delete b.budget;
  const place = districtLabel(b.district);
  return {
    budget: amount,
    message:
      amount > 0
        ? `${place} branch: ${formatMoney(amount, m.data.currency)} a month on local marketing, paid at each month end.`
        : `${place} branch: local marketing stopped.`,
  };
}

/** `company.branch.hire`: a local sales rep (brings leads, reaches more) or a branch manager. */
export function hireBranchStaff(world: World, me: Player, branchId: Id, role: BranchStaff['role']) {
  const { b, c, m } = myOpenBranch(world, me, branchId);
  ensure(!c.hibernation, 'branch.hire', 'You can’t hire while the company hibernates.');
  const staff = b.staff ?? [];
  const have = staff.filter((s) => s.role === role).length;
  const max = BRANCH_GROW[role].max;
  ensure(
    have < max,
    'branch.hire',
    role === 'manager'
      ? 'This branch already has a manager.'
      : `${max} sales reps is the most a branch can keep busy.`,
  );
  const salary = salaryOf(m, role);
  const cash = account(world, c.account);
  ensure(
    cash.balance >= costIn(world, salary, m.data.currency, cash.currency),
    'branch.hire',
    `${c.name} needs a month of their salary (${formatMoney(salary, m.data.currency)}) in the bank first.`,
  );
  spendHours(me, BRANCH_GROW.hireHours, 'Hiring for a branch');
  b.staffSeq = (b.staffSeq ?? 0) + 1;
  const rng = deriveRng(world.seed, 'branches', 'hire', b.id, b.staffSeq);
  const parts = CITY_NAME_PARTS[b.market];
  const name = `${rng.pick(rng.chance(0.5) ? parts.female : parts.male)} ${rng.pick(parts.last)}`;
  const s: BranchStaff = { id: `${b.id}-s${b.staffSeq}`, role, name, salary, since: m.month };
  b.staff = [...staff, s];
  c.lastDecisionMonth = getMarket(world, c.market).month;
  const fmt = formatMoney(salary, m.data.currency);
  return {
    staffId: s.id,
    name,
    salary,
    message:
      role === 'manager'
        ? `${name} now manages your ${districtLabel(b.district)} branch for ${fmt} a month: it reaches more customers and keeps more of them.`
        : `${name} now sells for your ${districtLabel(b.district)} branch for ${fmt} a month: more customers, and a lead from ${m.data.name} in Sales every month.`,
  };
}

/** `company.branch.fire`: let someone at a branch go, with a month's pay. */
export function fireBranchStaff(world: World, me: Player, branchId: Id, staffId: Id) {
  const { b, c, m } = myOpenBranch(world, me, branchId);
  const s = (b.staff ?? []).find((x) => x.id === staffId);
  ensure(s, 'branch.staff', 'They don’t work at this branch.');
  const due = s!.salary * BRANCH_GROW.severanceMonths;
  const cash = account(world, c.account);
  ensure(
    cash.balance >= costIn(world, due, m.data.currency, cash.currency),
    'branch.fire',
    `Letting ${s!.name} go costs a month’s pay (${formatMoney(due, m.data.currency)}); ${c.name} doesn’t have it.`,
  );
  const paid = letGo(world, c, b, s!);
  b.staff = (b.staff ?? []).filter((x) => x.id !== staffId);
  return {
    severance: paid,
    message: `${s!.name} has left the ${districtLabel(b.district)} branch with a month’s pay (${formatMoney(paid, m.data.currency)}).`,
  };
}

/**
 * `company.branch.pitch`: in the branch's city, walk into one of its
 * businesses. It joins the Sales pipeline as a warm lead from that city,
 * already contacted (you met the owner).
 */
export function pitchForBranch(world: World, me: Player, branchId: Id, businessId: Id) {
  const { b, c, m } = myOpenBranch(world, me, branchId);
  ensure(
    locationOf(me) === b.market,
    'branch.pitch.away',
    `You’re not in ${m.data.name}: travel there to pitch its businesses in person.`,
  );
  const biz = businessesOf(m)[businessId];
  ensure(biz && isOpen(biz), 'branch.pitch.missing', 'That business isn’t open.');
  ensure(
    businessSegment(m, c, biz!) !== null,
    'branch.pitch.buyer',
    `${biz!.name} doesn’t buy what ${c.name} sells.`,
  );
  ensure(
    cityBusinesses(c, m).some((x) => x.id === biz!.id),
    'branch.pitch.taken',
    `${biz!.name} is already in your pipeline or buying from you.`,
  );
  const used = me.businessPitches?.month === m.month ? me.businessPitches.count : 0;
  ensure(
    used < ECONOMY.pitchesPerMonth,
    'branch.pitch.limit',
    `You’ve made ${ECONOMY.pitchesPerMonth} pitches this month. Come back next month.`,
  );
  ensure(
    hasDealRoom(c),
    'sales.prospect.full',
    'Your pipeline is full. Close or drop a deal first.',
  );
  ensure(
    hoursLeft(me) >= BRANCH_GROW.pitchHours,
    'hours.short',
    'You don’t have enough hours left this month for that.',
  );
  const rng = deriveRng(world.seed, 'branches', 'pitch', b.id, biz!.id, m.month);
  const who = cityCustomer(world, c, m, rng, biz);
  ensure(who, 'sales.prospect.market', 'No buyers for this product here.');
  spendHours(me, BRANCH_GROW.pitchHours, `Pitching ${biz!.name}`);
  me.businessPitches = { month: m.month, count: used + 1 };
  const home = getMarket(world, c.market).month;
  c.lastDecisionMonth = home;
  const d = addEventDeal(c, who!, {
    stage: 'contacted',
    discountPct: 0,
    trust: BRANCH_GROW.pitchTrust,
    month: home,
    months: 3,
  });
  return {
    dealId: d.id,
    message: `${biz!.name} heard you out in person: they’re in Sales as a warm lead from ${m.data.name}.`,
  };
}

/**
 * `sales.prospect` with a `market` (branches note): find 1–3 leads in a city
 * where the company has a branch. Uses a prospecting round; leads found while
 * you're in that city start a little warmer.
 */
export function prospectCity(world: World, me: Player, market: MarketId, companyId?: Id) {
  const c = companyId
    ? ownCompany(world, me.id, companyId)
    : me.companyIds
        .map((id) => world.companies[id])
        .find((x) => x && x.status === 'active' && x.founderIds.includes(me.id));
  ensure(c, 'sales.company', 'Start a company first: you need something to sell.');
  // The company's own city: the usual prospecting.
  if (market === c!.market) return prospect(world, me, c!.id);
  const m = world.markets[market];
  ensure(m, 'sales.city', 'That city isn’t open yet.');
  ensure(
    openBranches(world, c!.id).some((b) => b.market === market),
    'sales.city',
    `Open a branch in ${m!.data.name} first: leads there come through a branch.`,
  );
  const month = getMarket(world, c!.market).month;
  const used = prospectsUsed(c!, month);
  ensure(
    used < prospectLimit(c!),
    'sales.prospect.limit',
    'You’ve done all your prospecting this month. Hire sales staff to do more, or wait for next month.',
  );
  ensure(
    hasDealRoom(c!),
    'sales.prospect.full',
    'Your pipeline is full. Close or drop a deal first.',
  );
  spendHours(me, SALES.hours.prospect, 'Prospecting');
  c!.salesProspects = { month, count: used + 1 };
  c!.lastDecisionMonth = month;
  const rng = deriveRng(world.seed, 'branches', 'prospect', c!.id, market, month, used);
  const here = locationOf(me) === market;
  const n = rng.int(SALES.leadsPerProspect[0], SALES.leadsPerProspect[1]);
  const added: { id: string; name: string }[] = [];
  for (let i = 0; i < n && hasDealRoom(c!); i++) {
    const who = cityCustomer(world, c!, m!, rng);
    if (!who) break;
    const d = addEventDeal(c!, who, {
      stage: 'lead',
      discountPct: 0,
      trust: here ? BRANCH_GROW.hereTrust : 0,
      month,
      months: rng.int(SALES.deadline[0], SALES.deadline[1]),
    });
    added.push({ id: d.id, name: d.customer.name });
  }
  ensure(added.length > 0, 'sales.prospect.market', 'No buyers for this product here.');
  return {
    leads: added,
    market,
    message:
      added.length === 1
        ? `New lead in ${m!.data.name}: ${added[0]!.name}.`
        : `${added.length} new leads in ${m!.data.name}: ${added.map((x) => x.name).join(', ')}.`,
  };
}

// ---------------------------------------------------------------- Views

function branchRow(world: World, b: Branch, viewerId: Id | null) {
  const c = world.companies[b.companyId];
  const m = getMarket(world, b.market);
  return {
    id: b.id,
    companyId: b.companyId,
    companyName: c?.name ?? '',
    ai: c?.ai ?? true,
    mine: !!viewerId && !!c?.founderIds.includes(viewerId),
    market: b.market,
    marketName: m.data.name,
    currency: m.data.currency,
    district: b.district,
    districtLabel: districtLabel(b.district),
    status: b.status,
    openedMonth: b.openedMonth,
    monthlyOpex: b.monthlyOpex,
    setupCost: b.setupCost,
    lastMonth: b.lastMonth,
    closedReason: b.closedReason ?? null,
  };
}

/**
 * Branches note: running one of your open branches. Money in the branch
 * city's minor units (`currency` on the row); signed customers from its city
 * in the company's.
 */
function branchRunView(world: World, c: Company, b: Branch, viewer: Player | undefined) {
  const m = getMarket(world, b.market);
  const G = BRANCH_GROW;
  const staff = b.staff ?? [];
  const last = b.lastMonth;
  const lastCosts = last.opex + (last.marketing ?? 0) + (last.staff ?? 0);
  const signed = (c.salesAccounts ?? []).filter((a) =>
    b.market === c.market ? false : a.market === b.market,
  );
  const here = !!viewer && locationOf(viewer) === b.market;
  const used =
    viewer && viewer.businessPitches?.month === m.month ? viewer.businessPitches.count : 0;
  const reach = Math.round(reachOf(world, c, b, m.month + 1, b.budget ?? 0));
  return {
    customers: customersOf(world, b),
    /** Customers it can reach next month at today's budget and staff. */
    reach,
    budget: b.budget ?? 0,
    maxBudget: maxBranchBudget(m),
    staff: staff.map((s) => ({ ...s })),
    reps: staff.filter((s) => s.role === 'rep').length,
    manager: staff.some((s) => s.role === 'manager'),
    hire: {
      rep: { salary: salaryOf(m, 'rep'), max: G.rep.max, reach: G.rep.reach, leads: G.rep.leads },
      manager: { salary: salaryOf(m, 'manager'), max: G.manager.max },
      hours: G.hireHours,
    },
    /** What one customer spends a month here. */
    ticket: ticketOf(m),
    /** Last settled month: customers won and lost, leads the reps brought, costs and profit. */
    last: {
      month: last.month,
      revenue: last.revenue,
      opex: last.opex,
      marketing: last.marketing ?? 0,
      staff: last.staff ?? 0,
      costs: lastCosts,
      profit: last.revenue - lastCosts,
      won: last.won ?? null,
      lost: last.lost ?? null,
      leads: last.leads ?? 0,
      settled: last.month > b.openedMonth,
    },
    /** A month at today's settings: running costs, marketing and salaries. */
    monthlyCosts: b.monthlyOpex + (b.budget ?? 0) + staff.reduce((a, s) => a + s.salary, 0),
    /** Closing now: a month's rent breaks the lease, and each person gets a month's pay. */
    closeCost: b.monthlyOpex + staff.reduce((a, s) => a + s.salary * G.severanceMonths, 0),
    /** Customers signed in Sales from this branch's city (another city only). */
    signed: {
      count: signed.length,
      monthly: signed.reduce((a, x) => a + x.monthly, 0),
      currency: getMarket(world, c.market).data.currency,
    },
    /** Open deals in Sales from this city (another city only). */
    openDeals:
      b.market === c.market
        ? 0
        : (c.deals ?? []).filter((d) => isOpenDeal(d) && d.customer.market === b.market).length,
    /** You're in this city now: its businesses to pitch in person. */
    here,
    pitch: {
      hours: G.pitchHours,
      left: Math.max(0, ECONOMY.pitchesPerMonth - used),
      businesses: here
        ? cityBusinesses(c, m)
            .slice(0, G.pitchList)
            .map((x) => ({
              id: x.id,
              name: x.name,
              kind: specOf(x).label,
              district: districtLabel(x.district),
            }))
        : [],
    },
  };
}

/** `companies[].branches`: a company's branches (open and closed), plus where it could open. */
export function companyBranchesView(world: World, c: Company, viewerId: Id) {
  const m = getMarket(world, c.market);
  const on = branchesOn(world);
  const viewer = world.players[viewerId];
  const progress = secondCityProgress(world, c);
  return {
    /** Branches note: branches have customers, a budget and staff you manage. */
    run: on,
    headOffice: { market: c.market, district: companyDistrict(c) },
    branches: companyBranches(world, c.id).map((b) => ({
      ...branchRow(world, b, viewerId),
      run: on && b.status === 'open' ? branchRunView(world, c, b, viewer) : null,
    })),
    /** Cities whose leads Sales can work: the home city, then each branch city (branches note). */
    leadCities: on
      ? [
          { market: c.market, name: m.data.name, home: true },
          ...[
            ...new Set(
              openBranches(world, c.id)
                .map((b) => b.market)
                .filter((x) => x !== c.market),
            ),
          ].map((x) => ({ market: x, name: getMarket(world, x).data.name, home: false })),
        ]
      : [],
    /** "Sell in a second city": branches and customers in other cities. */
    secondCity: { ...progress, selling: progress.branches > 0 && progress.customers > 0 },
    /** Customers at your branches (in the one customer total, branches note). */
    customers: branchCustomerCount(world, c),
    /** Costs to open in each open city (minor units of that city). */
    costs: Object.keys(world.markets).map((id) => {
      const k = branchCosts(world, c, id as MarketId);
      return {
        market: id as MarketId,
        currency: getMarket(world, id as MarketId).data.currency,
        setup: k.setup,
        monthlyOpex: k.opex,
        /** Full-ramp takings for a typical district, before noise. */
        demand: branchDemand(world, c, id as MarketId),
      };
    }),
    maxOpen: BRANCH.maxOpen,
    homeCurrency: m.data.currency,
  };
}

/** `market.branches` / `here.branches`: every open branch in the city (for the map). */
export function cityBranchesView(world: World, viewer: Player, m: MarketState) {
  return Object.values(branchesOf(world))
    .filter((b) => b.market === m.id && b.status === 'open')
    .map((b) => branchRow(world, b, viewer.id));
}

/** `market.offices`: where each active company has its head office (scattered, for the map). */
export function cityOfficesView(world: World, m: MarketState) {
  return Object.values(world.companies)
    .filter((c) => c.market === m.id && c.status === 'active' && !isEstablished(c))
    .map((c) => ({ companyId: c.id, name: c.name, ai: c.ai, district: companyDistrict(c) }));
}
