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
 */
import { CITY_DISTRICTS } from './data/businesses.js';
import type { MarketId } from './data/markets.js';
import { reliability } from './customers.js';
import { districtWeights, randomDistrict, stableDistrict } from './districts.js';
import { businessesOf, districtLabel, isOpen, openBusiness } from './economy.js';
import { ensure, fail } from './errors.js';
import { col, getMarket, notify, ownCompany, spendHours } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, pay, payExact } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { deriveRng } from './rng.js';
import type { Branch, Company, Id, LocalBusiness, MarketState, Player, World } from './types.js';

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

export const branchesOf = (world: World): Record<Id, Branch> => world.branches ?? {};

export const companyBranches = (world: World, companyId: Id): Branch[] =>
  Object.values(branchesOf(world)).filter((b) => b.companyId === companyId);

const openBranches = (world: World, companyId: Id) =>
  companyBranches(world, companyId).filter((b) => b.status === 'open');

/** Where a company's head office is: stored, or a stable district from its id (scattered). */
export function companyDistrict(c: Company): string {
  return stableDistrict(c.market, 'company', c.id) ?? CITY_DISTRICTS[c.market]?.[0] ?? 'centre';
}

/** A district's pull relative to the city average (about 0.6–1.5). */
function districtPull(market: MarketId, district: string): number {
  const all = districtWeights(market);
  const avg = all.reduce((a, d) => a + d.w, 0) / Math.max(1, all.length);
  const w = all.find((d) => d.district === district)?.w ?? avg;
  return clamp(w / avg, 0.6, 1.5);
}

export function branchCosts(world: World, c: Company, market: MarketId) {
  const m = getMarket(world, market);
  return {
    setup: scale(col(m), BRANCH.setupCol * (market === c.market ? 1 : BRANCH.abroadSetup)),
    opex: scale(col(m), BRANCH.opexCol),
  };
}

/** Why this company can't open a branch there (null when it can). */
export function branchBlocker(
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
    payExact(world, c.account, m.ext.suppliers, b.monthlyOpex, 'Branch lease break', getMarket(world, c.market).month);
    paid = b.monthlyOpex;
  }
  b.status = 'closed';
  b.closedMonth = m.month;
  b.closedReason = 'closed by the founders';
  return {
    leaseBreak: paid,
    message: `The ${districtLabel(b.district)} branch has closed.`,
  };
}

/**
 * What a branch takes in a month at full ramp (before noise), branch-city
 * minor units. Without a district: a typical one.
 */
export function branchDemand(world: World, c: Company, market: MarketId, district?: string): number {
  const m = getMarket(world, market);
  const quality =
    0.25 + 0.35 * c.product.fit + 0.25 * reliability(c) + 0.15 * (c.stars.value / 5);
  const climate = 0.85 + 0.15 * clamp(m.climate, 0.5, 1.6);
  const pull = district ? districtPull(market, district) : 1;
  return Math.round(scale(col(m), BRANCH.demandCol) * pull * quality * climate);
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
    const rng = deriveRng(world.seed, 'branches', b.id, month);
    const age = month - b.openedMonth;
    const ramp = Math.min(1, (age + 1) / BRANCH.rampMonths);
    const hibernating = c.hibernation ? 0.3 : 1;
    const takings = Math.max(
      0,
      Math.round(branchDemand(world, c, b.market, b.district) * ramp * hibernating * (1 + rng.normal(0, 0.08))),
    );
    const homeMonth = getMarket(world, c.market).month;
    const received = takings
      ? pay(world, m.ext.customers, c.account, takings, `Branch takings: ${districtLabel(b.district)}`, homeMonth)
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

function localBranches(world: World, m: MarketState, rng: ReturnType<typeof deriveRng>, month: number) {
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

function announce(world: World, m: MarketState, parent: LocalBusiness, b: LocalBusiness, month: number) {
  const text = `${parent.name} opened a second site in ${districtLabel(b.district)}.`;
  for (const p of Object.values(world.players))
    if (!p.ai && p.market === m.id) notify(world, p.id, { month, kind: 'system', text });
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

/** `companies[].branches`: a company's branches (open and closed), plus where it could open. */
export function companyBranchesView(world: World, c: Company, viewerId: Id) {
  const m = getMarket(world, c.market);
  return {
    headOffice: { market: c.market, district: companyDistrict(c) },
    branches: companyBranches(world, c.id).map((b) => branchRow(world, b, viewerId)),
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
    .filter((c) => c.market === m.id && c.status === 'active')
    .map((c) => ({ companyId: c.id, name: c.name, ai: c.ai, district: companyDistrict(c) }));
}

export function getBranch(world: World, id: Id): Branch {
  const b = branchesOf(world)[id];
  if (!b) fail('branch.missing', 'Branch not found.');
  return b;
}
