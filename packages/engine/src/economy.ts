/**
 * The city economy (Wave 3): local businesses run by AI owners, and the
 * trade between them, households, players and startups.
 *
 * Every month, on its own RNG stream (`deriveRng(seed, 'economy', market,
 * month)`), after customer segments and before company settlement:
 *   1. Households spend at businesses (ext.customers → business).
 *   2. Businesses pay wages (→ ext.payroll), rent and stock (→ ext.suppliers).
 *   3. Businesses buy from startups: each sector in their `buys` gets a share
 *      of takings, paid to their supplier (business → company, booked as the
 *      company's revenue this month) or, with no startup supplier, to the
 *      incumbent (ext.suppliers). AI startups win some accounts on their own;
 *      players win them by pitching. Poor service loses accounts.
 *   4. Health follows profit: healthy businesses grow, failing ones close
 *      (their cash returns to ext.genesis), and new ones open from the
 *      city's roster.
 * Players also work gigs at businesses, eat and drink there, and meet people
 * over a meal. Every amount is a ledger transfer, so money is conserved.
 */
import {
  CITY_BUSINESSES,
  GIG_SKILL_BACKGROUNDS,
  LATE_OPENINGS,
  businessKind,
} from './data/businesses.js';
import type { BusinessCategory, BusinessKindSpec, JobRole } from './data/businesses.js';
import { INDUSTRY_LABEL } from './data/industries.js';
import type { Industry } from './data/industries.js';
import type { MarketId } from './data/markets.js';
import { priceScore, reliability } from './customers.js';
import { ensure, fail } from './errors.js';
import { addContact, contactWarmth } from './events.js';
import {
  adjustTrust,
  col,
  getMarket,
  hoursLeft,
  locationOf,
  notify,
  ownCompany,
  spendHours,
} from './helpers.js';
import {
  account,
  costIn,
  openAccount,
  pay as payLedger,
  payExact,
  transfer,
  transferUpTo,
} from './ledger.js';
import { CATEGORY } from './marketplace.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import type {
  BusinessNews,
  Company,
  ContactKind,
  EconomyStats,
  Id,
  LocalBusiness,
  MarketState,
  Player,
  World,
} from './types.js';

// ---------------------------------------------------------------- Tuning

export const ECONOMY = {
  /** Wages as a share of the business's size (its cost base). */
  wageShare: {
    food: 0.28,
    retail: 0.16,
    services: 0.38,
    trades: 0.32,
    health: 0.42,
    education: 0.48,
    logistics: 0.34,
    hospitality: 0.34,
  } as Record<BusinessCategory, number>,
  rentShare: { hospitality: 0.16 } as Partial<Record<BusinessCategory, number>>,
  defaultRentShare: 0.1,
  /** Margin a business makes in a normal month (stock is sized to leave this). */
  targetMargin: 0.08,
  /** Cash a new business starts with, in months of takings. */
  startCashMonths: 1.2,
  /** Cash beyond this many months of takings is drawn by the owner. */
  keepCashMonths: 2,
  /** Monthly chance a business looks for a startup supplier in a sector it has none in. */
  searchChance: 0.06,
  /** Monthly chance it looks again at a sector it already has a supplier in. */
  reviewChance: 0.03,
  /** Lowest score an AI startup needs to win an account on its own. */
  minScore: 0.45,
  /** Lowest score a pitched startup needs for a yes. */
  pitchScore: 0.42,
  /** A rival must beat the current supplier by this much (switching is a hassle). */
  inertia: 0.1,
  /** Reliability below which a pitch is told to come back later. */
  minReliability: 0.35,
  /** A price above this multiple of their budget gets "come back later". */
  maxPriceRatio: 1.5,
  /** Monthly chance a new business opens from the roster (times the funding climate). */
  openChance: 0.1,
  /** Months before a closed roster place can reopen under new owners. */
  reopenAfter: 6,
  /** A business closes when its health falls to this. */
  closeHealth: 0.05,
  pitchesPerMonth: 4,
  pitchHours: 6,
  /** Gigs a month (Wave 5: up from 4), shared with the agency gig. */
  gigsPerMonth: 8,
  /** Energy spent per hour of gig work. */
  gigEnergyPerHour: 0.6,
  /** A gig matching your background pays this much more. */
  skillPremium: 1.5,
  /** Wave 5: a meeting over a meal costs money only. */
  meetingHours: 0,
} as const;

/** Wave 5: a part-time job takes this many hours a month. */
export const JOB_HOURS = 40;
/** A job matching your background pays this much more. */
export const JOB_SKILL_PREMIUM = 1.25;

export const BUSINESS_RECENT_MONTHS = 3;

// ---------------------------------------------------------------- Accessors

export const businessesOf = (m: MarketState): Record<Id, LocalBusiness> => m.businesses ?? {};

export const isOpen = (b: LocalBusiness) => b.closedMonth === undefined;

export function specOf(b: LocalBusiness): BusinessKindSpec {
  const spec = businessKind(b.kind);
  if (!spec) fail('business.kind', `Unknown business kind ${b.kind}`);
  return spec;
}

export function getBusiness(world: World, id: Id): LocalBusiness {
  for (const m of Object.values(world.markets)) {
    const b = m.businesses?.[id];
    if (b) return b;
  }
  return fail('business.missing', 'Business not found.');
}

function openBusinessOf(world: World, me: Player, id: Id): LocalBusiness {
  const b = getBusiness(world, id);
  ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
  ensure(b.market === locationOf(me), 'business.market', `${b.name} is in another city.`);
  return b;
}

const rentShare = (cat: BusinessCategory) => ECONOMY.rentShare[cat] ?? ECONOMY.defaultRentShare;

/** Share of takings spent on stock and supplies: whatever leaves the target margin. */
export function goodsShare(spec: BusinessKindSpec): number {
  const buys = Object.values(spec.buys).reduce((a, b) => a + (b ?? 0), 0);
  return Math.max(
    0.05,
    1 - ECONOMY.targetMargin - ECONOMY.wageShare[spec.category] - rentShare(spec.category) - buys,
  );
}

/** What the business spends on a sector a month (approximate, from last month's takings). */
export function sectorBudget(b: LocalBusiness, sector: Industry): number {
  const share = specOf(b).buys[sector] ?? 0;
  return Math.round((b.monthlyTakings || b.base) * share);
}

const emptyStats = (month: number): EconomyStats => ({
  month,
  takings: 0,
  trade: 0,
  gigs: 0,
  gigsNow: 0,
  openings: 0,
  closures: 0,
});

// ---------------------------------------------------------------- Opening and closing

/** Seed a market's businesses when missing (new markets and saved worlds). */
export function ensureBusinesses(world: World, marketId: MarketId) {
  const m = getMarket(world, marketId);
  if (m.businesses) return;
  m.businesses = {};
  m.economy = emptyStats(m.month);
  const roster = CITY_BUSINESSES[marketId] ?? [];
  const rng = deriveRng(world.seed, 'economy', 'genesis', marketId);
  const first = Math.max(0, roster.length - LATE_OPENINGS);
  for (let i = 0; i < first; i++) openBusiness(world, m, i, rng, m.month, true);
}

/**
 * Saved worlds (Wave 5): roster places added after the market opened (new
 * business kinds, Freetown's full roster) open now, as established businesses.
 * Places that have ever been open keep their history; ids stay as they are.
 * Own RNG stream, so nothing else shifts. A no-op for new worlds.
 */
export function ensureRoster(world: World, marketId: MarketId, month: number) {
  const m = getMarket(world, marketId);
  const roster = CITY_BUSINESSES[marketId] ?? [];
  const all = Object.values(businessesOf(m));
  const seen = new Set(all.map((b) => b.seed));
  const first = Math.max(0, roster.length - LATE_OPENINGS);
  const missing = [];
  for (let i = 0; i < first; i++) if (!seen.has(i)) missing.push(i);
  if (!missing.length) return;
  const rng = deriveRng(world.seed, 'economy', 'roster', marketId, month);
  for (const i of missing) openBusiness(world, m, i, rng, month, true);
}

function openBusiness(
  world: World,
  m: MarketState,
  seedIdx: number,
  rng: Rng,
  month: number,
  founding: boolean,
): LocalBusiness | null {
  const seed = CITY_BUSINESSES[m.id]?.[seedIdx];
  const spec = seed ? businessKind(seed.kind) : undefined;
  if (!seed || !spec) return null;
  const all = (m.businesses ??= {});
  const id = `biz-${m.id}-${Object.keys(all).length}`;
  const acc = openAccount(world, {
    id: `acc:${id}`,
    currency: m.data.currency,
    market: m.id,
    label: seed.name,
  });
  const [lo, hi] = spec.revenueCol;
  // Day-one businesses are established; new openings start a little smaller.
  const base = scale(col(m), rng.range(lo, hi) * (founding ? 1 : 0.8));
  transfer(
    world,
    m.ext.genesis,
    acc,
    Math.round(base * ECONOMY.startCashMonths),
    'Opening capital',
    month,
  );
  const b: LocalBusiness = {
    id,
    market: m.id,
    name: seed.name,
    kind: seed.kind,
    district: seed.district,
    owner: { name: seed.owner },
    account: acc,
    monthlyTakings: 0,
    health: founding ? rng.range(0.55, 0.85) : 0.6,
    suppliers: [],
    openedMonth: founding ? month - rng.int(6, 120) : month,
    seed: seedIdx,
    base,
    costBase: base,
    rapport: {},
    lastMonth: { takings: 0, costs: 0, trade: 0, profit: 0 },
  };
  all[id] = b;
  return b;
}

function news(c: Company): BusinessNews {
  return (c.businessNews ??= { won: [], lost: [] });
}

function loseSupplier(
  world: World,
  b: LocalBusiness,
  companyId: Id,
  reason: string,
  month: number,
  notifyFounders = true,
) {
  const i = b.suppliers.findIndex((s) => s.companyId === companyId);
  if (i < 0) return;
  const [gone] = b.suppliers.splice(i, 1);
  const c = world.companies[companyId];
  if (!c || c.status !== 'active') return;
  news(c).lost.push({ businessId: b.id, name: b.name, reason, monthly: gone!.monthlyMinor });
  if (notifyFounders)
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'warning',
        text: `${b.name} stopped buying from ${c.name}: ${reason}.`,
      });
}

function winSupplier(
  world: World,
  b: LocalBusiness,
  c: Company,
  monthly: number,
  how: 'pitch' | 'found',
  month: number,
) {
  b.suppliers.push({ companyId: c.id, sector: c.industry, monthlyMinor: monthly, since: month });
  news(c).won.push({ businessId: b.id, name: b.name, monthly, how });
  if (how === 'found')
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'lead',
        text: `${b.name} started buying from ${c.name}.`,
      });
}

function closeBusiness(world: World, m: MarketState, b: LocalBusiness, month: number) {
  for (const s of [...b.suppliers]) loseSupplier(world, b, s.companyId, 'it closed down', month);
  transfer(
    world,
    b.account,
    m.ext.genesis,
    account(world, b.account).balance,
    'Business closed',
    month,
  );
  b.closedMonth = month;
  b.health = 0;
}

// ---------------------------------------------------------------- Choosing suppliers

const rapportWith = (b: LocalBusiness, c: Company) =>
  Math.max(0, ...c.founderIds.map((id) => b.rapport[id] ?? 0));

/** How much the owner likes a startup as a supplier (about 0–1). */
export function supplierScore(b: LocalBusiness, c: Company, budget: number): number {
  const known = Math.min(
    1,
    Math.max(0, ...Object.values(c.segments).map((s) => s.awareness)) * 5 + c.stars.value / 10,
  );
  return (
    0.2 * priceScore(c.price, Math.max(1, budget)) +
    0.3 * reliability(c) +
    0.15 * c.product.fit +
    0.1 * (c.stars.value / 5) +
    0.1 * known +
    0.25 * rapportWith(b, c)
  );
}

const sectorRivals = (world: World, m: MarketState, sector: Industry) =>
  Object.values(world.companies).filter(
    (c) => c.market === m.id && c.status === 'active' && c.industry === sector,
  );

function raiseRapport(b: LocalBusiness, playerId: Id, by: number) {
  b.rapport[playerId] = Math.round(clamp01((b.rapport[playerId] ?? 0) + by) * 100) / 100;
}

// ---------------------------------------------------------------- The month

export function settleEconomy(world: World, marketId: MarketId, month: number) {
  ensureBusinesses(world, marketId);
  ensureRoster(world, marketId, month);
  const m = getMarket(world, marketId);
  const rng = deriveRng(world.seed, 'economy', marketId, month);
  const stats = emptyStats(month);
  stats.gigs = m.economy?.gigsNow ?? 0;
  const climate = 0.85 + 0.15 * clamp(m.climate, 0.5, 1.6);
  const cityCol = col(m);

  for (const b of Object.values(businessesOf(m))) {
    if (!isOpen(b)) continue;
    const spec = specOf(b);
    const [lo, hi] = spec.revenueCol;

    // 1. Households spend: demand drifts, the seasons turn, and the odd bad month hits.
    // Demand wanders around what this kind of business does in this city.
    const typical = (cityCol * (lo + hi)) / 2;
    b.base = b.base * Math.exp(rng.normal(0, 0.03)) + (typical - b.base) * 0.015;
    if (rng.chance(0.03)) b.base *= rng.range(0.5, 0.85);
    b.base = Math.round(clamp(b.base, cityCol * lo * 0.3, cityCol * hi * 2));
    const season = 1 + 0.05 * Math.sin((2 * Math.PI * (month + b.seed)) / 12);
    const takings = Math.max(0, Math.round(b.base * season * climate * (1 + rng.normal(0, 0.04))));
    transfer(world, m.ext.customers, b.account, takings, 'Takings', month);

    // 2. Costs: staff and rent are sized to the business; stock follows sales.
    const wagesDue = Math.round(b.costBase * ECONOMY.wageShare[spec.category]);
    const rentDue = Math.round(b.costBase * rentShare(spec.category));
    const wages = transferUpTo(world, b.account, m.ext.payroll, wagesDue, 'Wages', month);
    const rent = transferUpTo(world, b.account, m.ext.suppliers, rentDue, 'Rent', month);
    const goods = transferUpTo(
      world,
      b.account,
      m.ext.suppliers,
      Math.round(takings * goodsShare(spec)),
      'Stock and supplies',
      month,
    );
    const short = wages < wagesDue || rent < rentDue;

    // 3. Trade with startups (or the incumbent, when no startup supplies the sector).
    let trade = 0;
    let incumbent = 0;
    for (const [sector, share] of Object.entries(spec.buys) as [Industry, number][]) {
      const want = Math.round(takings * share);
      const sup = b.suppliers.find((s) => s.sector === sector);
      const c = sup ? world.companies[sup.companyId] : undefined;
      if (sup && (!c || c.status !== 'active' || c.market !== m.id || c.industry !== sector)) {
        loseSupplier(world, b, sup.companyId, 'it no longer serves them', month);
      }
      const still = b.suppliers.find((s) => s.sector === sector);
      const supplier = still ? world.companies[still.companyId] : undefined;
      if (still && supplier) {
        const paid = transferUpTo(world, b.account, supplier.account, want, b.name, month);
        supplier.ledgerThisMonth.businessRevenue =
          (supplier.ledgerThisMonth.businessRevenue ?? 0) + paid;
        still.monthlyMinor = paid;
        trade += paid;
      } else {
        incumbent += transferUpTo(
          world,
          b.account,
          m.ext.suppliers,
          want,
          `${CATEGORY[sector]} (incumbent)`,
          month,
        );
      }
    }

    // Satisfaction: poor service, a price above budget or going quiet loses the account.
    for (const s of [...b.suppliers]) {
      const c = world.companies[s.companyId];
      if (!c) continue;
      const rel = reliability(c);
      const budget = Math.round(takings * (spec.buys[s.sector] ?? 0));
      const pricey = c.price > budget * 2;
      const p =
        0.01 + Math.max(0, 0.55 - rel) * 0.6 + (c.hibernation ? 0.15 : 0) + (pricey ? 0.04 : 0);
      if (!rng.chance(p)) continue;
      const reason = c.hibernation
        ? 'you went quiet while hibernating'
        : rel < 0.55
          ? `your service was down too often (${Math.round(rel * 100)}% reliable)`
          : pricey
            ? 'your price is above what they want to spend'
            : 'they wanted to try someone else';
      loseSupplier(world, b, c.id, reason, month);
    }

    // AI startups win and steal some accounts on their own; players win them by pitching.
    for (const [sector, share] of Object.entries(spec.buys) as [Industry, number][]) {
      const current = b.suppliers.find((s) => s.sector === sector);
      if (!rng.chance(current ? ECONOMY.reviewChance : ECONOMY.searchChance)) continue;
      const budget = Math.round(takings * share);
      const ai = sectorRivals(world, m, sector).filter((c) => c.ai && c.id !== current?.companyId);
      if (!ai.length) continue;
      const scored = ai
        .map((c) => ({ c, s: supplierScore(b, c, budget) + rng.normal(0, 0.03) }))
        .sort((x, y) => y.s - x.s);
      const best = scored[0]!;
      if (best.s < ECONOMY.minScore) continue;
      if (current) {
        const cur = world.companies[current.companyId];
        if (cur && supplierScore(b, cur, budget) + ECONOMY.inertia >= best.s) continue;
        loseSupplier(world, b, current.companyId, `they switched to ${best.c.name}`, month);
      }
      winSupplier(world, b, best.c, budget, 'found', month);
    }

    // 4. Health: profit grows a business slowly; losses shrink it and, in the end, close it.
    const costs = wages + rent + goods + incumbent;
    const profit = takings - costs - trade;
    b.costBase = Math.round(b.costBase + (b.base - b.costBase) * 0.1);
    const target = clamp01(0.5 + (8 * profit) / Math.max(1, b.base));
    b.health = clamp01(0.75 * b.health + 0.25 * target - (short ? 0.2 : 0));
    b.base = Math.round(b.base * (1 + 0.006 * (b.health - 0.5)));
    // The owner draws what the business doesn't need.
    const spare = account(world, b.account).balance - b.base * ECONOMY.keepCashMonths;
    if (spare > 0)
      transfer(world, b.account, m.ext.lifestyle, Math.round(spare / 2), "Owner's drawings", month);
    b.monthlyTakings = takings;
    b.lastMonth = { takings, costs, trade, profit };
    stats.takings += takings;
    stats.trade += trade;
    if (b.health <= ECONOMY.closeHealth) {
      closeBusiness(world, m, b, month);
      stats.closures += 1;
    }
  }

  // New businesses open from the roster pool, so the city keeps changing.
  const roster = CITY_BUSINESSES[marketId] ?? [];
  const all = Object.values(businessesOf(m));
  const openNow = all.filter(isOpen);
  const pool = roster
    .map((_, i) => i)
    .filter(
      (i) =>
        !all.some(
          (b) =>
            b.seed === i && (isOpen(b) || month - (b.closedMonth ?? month) < ECONOMY.reopenAfter),
        ),
    );
  const belowStart = openNow.length < roster.length - LATE_OPENINGS;
  if (
    pool.length &&
    rng.chance(belowStart ? 0.4 : ECONOMY.openChance * clamp(m.climate, 0.5, 1.6))
  ) {
    const b = openBusiness(world, m, rng.pick(pool), rng, month, false);
    if (b) stats.openings += 1;
  }
  m.economy = stats;
}

// ---------------------------------------------------------------- Pitching

export interface PitchAnswer {
  answer: 'yes' | 'later' | 'no';
  monthly: number;
  reason: string;
  message: string;
  coffee: number;
}

/** Why a founder can't pitch a business right now (null when they can). */
export function pitchBlocker(
  world: World,
  me: Player,
  b: LocalBusiness,
  companyId?: Id,
): string | null {
  if (!isOpen(b)) return `${b.name} has closed.`;
  if (locationOf(me) !== b.market) return 'This business is in another city.';
  const m = getMarket(world, b.market);
  const spec = specOf(b);
  const mine = me.companyIds
    .map((id) => world.companies[id])
    .filter(
      (c): c is Company =>
        !!c &&
        c.status === 'active' &&
        c.founderIds.includes(me.id) &&
        c.market === b.market &&
        (!companyId || c.id === companyId),
    );
  if (!mine.length) return 'Only founders with a company in this city can pitch.';
  const sells = mine.filter((c) => (spec.buys[c.industry] ?? 0) > 0);
  if (!sells.length)
    return `They don’t buy ${mine.map((c) => INDUSTRY_LABEL[c.industry].toLowerCase()).join(' or ')} products.`;
  const open = sells.filter((c) => !b.suppliers.some((s) => s.companyId === c.id));
  if (!open.length) return 'They already buy from you.';
  const used = me.businessPitches?.month === m.month ? me.businessPitches.count : 0;
  if (used >= ECONOMY.pitchesPerMonth)
    return `You’ve made ${ECONOMY.pitchesPerMonth} pitches this month. Come back next month.`;
  if (hoursLeft(me) < ECONOMY.pitchHours)
    return `A pitch takes ${ECONOMY.pitchHours} hours; you don’t have that left this month.`;
  return null;
}

/** A founder walks in and pitches the owner. Deterministic for the month. */
export function pitchBusiness(
  world: World,
  me: Player,
  companyId: Id,
  businessId: Id,
): PitchAnswer {
  const c = ownCompany(world, me.id, companyId);
  const b = openBusinessOf(world, me, businessId);
  const m = getMarket(world, b.market);
  const month = m.month;
  const blocker = pitchBlocker(world, me, b, c.id);
  ensure(!blocker, 'business.pitch', blocker ?? '');
  const spec = specOf(b);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  spendHours(me, ECONOMY.pitchHours, `Pitching ${b.name}`);
  me.businessPitches = {
    month,
    count: (me.businessPitches?.month === month ? me.businessPitches.count : 0) + 1,
  };
  // Buy something while you're there, if they sell anything and you can afford it.
  let coffee = 0;
  const cheapest = spec.venue?.items.slice().sort((a, z) => a.priceCol - z.priceCol)[0];
  if (cheapest) {
    const price = scale(col(m), cheapest.priceCol);
    const mine = account(world, me.accounts.local);
    if (mine.balance >= costIn(world, price, m.data.currency, mine.currency)) {
      payExact(world, me.accounts.local, b.account, price, `${cheapest.label} at ${b.name}`, month);
      coffee = price;
      raiseRapport(b, me.id, 0.03);
    }
  }
  raiseRapport(b, me.id, 0.12);

  const rng = deriveRng(world.seed, 'economy', 'pitch', b.id, c.id, month);
  const budget = sectorBudget(b, c.industry);
  const rel = reliability(c);
  const score =
    supplierScore(b, c, budget) + 0.06 + (me.skills.sales / 100) * 0.08 + rng.normal(0, 0.03);
  const current = b.suppliers.find((s) => s.sector === c.industry);
  const rival = current ? world.companies[current.companyId] : undefined;
  const rivalScore = rival ? supplierScore(b, rival, budget) + ECONOMY.inertia : 0;
  const owner = b.owner.name;

  let answer: PitchAnswer['answer'];
  let reason: string;
  if (rel < ECONOMY.minReliability) {
    answer = 'later';
    reason = `Come back when your product is more reliable: ${Math.round(rel * 100)}% now, they need ${Math.round(ECONOMY.minReliability * 100)}%.`;
  } else if (c.price > budget * ECONOMY.maxPriceRatio) {
    answer = 'later';
    reason = `Come back with a price under ${fmt(Math.round(budget * ECONOMY.maxPriceRatio))}: they spend about ${fmt(budget)} a month on ${CATEGORY[c.industry].toLowerCase()}.`;
  } else if (rival && score < rivalScore) {
    answer = score >= rivalScore - 0.08 ? 'later' : 'no';
    reason = `They’re happy with ${rival.name} (${Math.round(reliability(rival) * 100)}% reliable). Beat that, or get to know ${owner} better.`;
  } else if (score >= ECONOMY.pitchScore) {
    answer = 'yes';
    reason = `${owner} likes it: about ${fmt(budget)} a month on ${CATEGORY[c.industry].toLowerCase()}.`;
  } else {
    answer = 'no';
    const weakest = [
      {
        k: c.product.fit,
        why: `the product doesn’t fit how they work yet (fit ${Math.round(c.product.fit * 100)}%)`,
      },
      {
        k: c.stars.value / 5,
        why: `they haven’t heard of ${c.name} (${c.stars.value.toFixed(1)} stars)`,
      },
      { k: rapportWith(b, c), why: `${owner} doesn’t know you well yet` },
    ].sort((x, y) => x.k - y.k)[0]!;
    reason = `Not convinced: ${weakest.why}.`;
  }

  let monthly = 0;
  if (answer === 'yes') {
    monthly = budget;
    if (rival) loseSupplier(world, b, rival.id, `they switched to ${c.name}`, month);
    winSupplier(world, b, c, monthly, 'pitch', month);
    raiseRapport(b, me.id, 0.05);
    c.lastDecisionMonth = month;
  }
  const message =
    answer === 'yes'
      ? `${b.name} is a customer: about ${fmt(monthly)} a month from next settlement.`
      : answer === 'later'
        ? `${owner}: “Not yet.” ${reason}`
        : `${owner}: “No, thanks.” ${reason}`;
  return { answer, monthly, reason, message, coffee };
}

// ---------------------------------------------------------------- Gigs

export const gigSkillMatch = (p: Player, skill: string | null | undefined): boolean =>
  !!skill &&
  (GIG_SKILL_BACKGROUNDS[skill as keyof typeof GIG_SKILL_BACKGROUNDS] ?? []).includes(
    p.backgroundId,
  );

export function gigPay(
  m: MarketState,
  p: Player | null,
  g: { payCol: number; skill?: string | null },
) {
  return scale(col(m), g.payCol * (p && gigSkillMatch(p, g.skill) ? ECONOMY.skillPremium : 1));
}

/** Work a shift or a freelance job at a business, paid from its till. */
export function takeBusinessGig(world: World, me: Player, businessId: Id, gigId: string) {
  const b = openBusinessOf(world, me, businessId);
  const m = getMarket(world, b.market);
  const month = m.month;
  const g = specOf(b).gigs.find((x) => x.id === gigId);
  ensure(g, 'gig.missing', 'That job isn’t on offer here.');
  ensure(
    me.gigsThisMonth < ECONOMY.gigsPerMonth,
    'gig.limit',
    `At most ${ECONOMY.gigsPerMonth} gigs a month.`,
  );
  const energy = Math.round(g.hours * ECONOMY.gigEnergyPerHour);
  ensure(
    me.energy >= energy + 5,
    'gig.energy',
    'You’re too tired for this job. Rest or eat first.',
  );
  spendHours(me, g.hours, g.label);
  const promised = gigPay(m, me, g);
  const skillMatch = gigSkillMatch(me, g.skill);
  const home = getMarket(world, me.market);
  const abroad = home.id !== m.id;
  const pay = abroad
    ? Math.max(0, Math.min(promised, account(world, b.account).balance))
    : transferUpTo(world, b.account, me.accounts.local, promised, `${g.label} at ${b.name}`, month);
  // Abroad, the pay is converted into your home currency and taxed at home.
  const received = abroad
    ? pay > 0
      ? payLedger(world, b.account, me.accounts.local, pay, `${g.label} at ${b.name}`, month)
      : 0
    : pay;
  const tax = Math.round(received * home.data.tax.personalIncome);
  transfer(world, me.accounts.local, home.ext.tax, tax, 'Personal income tax', home.month);
  me.energy = clamp(me.energy - energy, 0, 100);
  me.gigsThisMonth += 1;
  m.economy ??= emptyStats(month);
  m.economy.gigsNow += 1;
  raiseRapport(b, me.id, 0.04);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const fmtHome = (v: number) => formatMoney(v, home.data.currency);
  const short = pay < promised;
  return {
    pay,
    promised,
    /** What reached your personal account (your home currency; differs from `pay` abroad). */
    received,
    tax,
    short,
    skillMatch,
    energy,
    message: short
      ? `${b.owner.name} could only pay ${fmt(pay)} of ${fmt(promised)}: business is slow. Tax: ${fmtHome(tax)}.`
      : `${g.label} done: ${fmt(pay)}${skillMatch ? ' (your background paid off)' : ''}. Tax: ${fmtHome(tax)}.`,
  };
}

// ---------------------------------------------------------------- Jobs (Wave 5)

export const jobSkillMatch = gigSkillMatch;

/** Monthly pay for a role at a business in this city (gross, local minor units). */
export function jobPay(m: MarketState, p: Player | null, r: JobRole): number {
  return scale(col(m), r.payCol * (p && gigSkillMatch(p, r.skill) ? JOB_SKILL_PREMIUM : 1));
}

/** Take a part-time job: 40 hours this month and every month, paid at each settlement. */
export function takeJob(world: World, me: Player, businessId: Id, roleId: string) {
  const b = openBusinessOf(world, me, businessId);
  ensure(b.market === me.market, 'job.market', 'Jobs are in your home city.');
  const role = specOf(b).roles.find((r) => r.role === roleId);
  ensure(role, 'job.role', 'That job isn’t on offer here.');
  if (me.job) {
    const cur = world.markets[me.market]?.businesses?.[me.job.businessId];
    fail('job.one', `You already work at ${cur?.name ?? 'a business'}. Quit that job first.`);
  }
  const m = getMarket(world, b.market);
  spendHours(me, JOB_HOURS, `A job at ${b.name}`);
  me.job = { businessId: b.id, role: role.role, since: m.month };
  raiseRapport(b, me.id, 0.05);
  const pay = jobPay(m, me, role);
  return {
    job: myJobView(world, me),
    message: `You’re a ${role.label.toLowerCase()} at ${b.name}: ${formatMoney(pay, m.data.currency)} a month for ${JOB_HOURS} hours, paid at month end.`,
  };
}

export function quitJob(world: World, me: Player) {
  ensure(me.job, 'job.none', 'You don’t have a job.');
  const b = world.markets[me.market]?.businesses?.[me.job.businessId];
  delete me.job;
  return {
    message: `You left ${b?.name ?? 'your job'}. This month’s hours are gone and won’t be paid.`,
  };
}

/** Month-end: the business pays your wage from its till (as much as it has), taxed at home. */
export function payJob(world: World, p: Player, month: number) {
  if (!p.job) return;
  const m = getMarket(world, p.market);
  const b = m.businesses?.[p.job.businessId];
  const role = b ? specOf(b).roles.find((r) => r.role === p.job!.role) : undefined;
  if (!b || !role || !isOpen(b)) {
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: b ? `${b.name} closed down: you’ve lost your job there.` : 'Your job has ended.',
    });
    delete p.job;
    return;
  }
  const promised = jobPay(m, p, role);
  const paid = transferUpTo(
    world,
    b.account,
    p.accounts.local,
    promised,
    `Wages: ${role.label} at ${b.name}`,
    month,
  );
  const tax = Math.round(paid * m.data.tax.personalIncome);
  transfer(world, p.accounts.local, m.ext.tax, tax, 'Personal income tax', month);
  raiseRapport(b, p.id, 0.02);
  if (paid < promised)
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: `${b.owner.name} could only pay ${formatMoney(paid, m.data.currency)} of your ${formatMoney(promised, m.data.currency)} wage: business is slow.`,
    });
}

/** `view.me.job`. */
export function myJobView(world: World, p: Player) {
  if (!p.job) return null;
  const m = world.markets[p.market];
  const b = m?.businesses?.[p.job.businessId];
  const role = b ? businessKind(b.kind)?.roles.find((r) => r.role === p.job!.role) : undefined;
  if (!m || !b || !role) return null;
  return {
    businessId: b.id,
    businessName: b.name,
    role: role.role,
    label: role.label,
    monthlyPay: jobPay(m, p, role),
    hours: JOB_HOURS,
  };
}

/** `view.here.jobs` / `view.market.jobs`: every role at every open business in the city. */
export function jobsView(viewer: Player, m: MarketState) {
  return Object.values(businessesOf(m))
    .filter(isOpen)
    .flatMap((b) =>
      specOf(b).roles.map((r) => ({
        businessId: b.id,
        businessName: b.name,
        role: r.role,
        label: r.label,
        monthlyPay: jobPay(m, viewer, r),
        hours: JOB_HOURS,
      })),
    );
}

// ---------------------------------------------------------------- Venues and meetings

interface Guest {
  name: string;
  /** Contact kind and ref for the inviter's contacts. */
  contact: { kind: ContactKind; refId: Id; name: string };
  /** A human player who spends the hours too. */
  player?: Player;
}

function resolveGuest(world: World, me: Player, withId: Id, b: LocalBusiness): Guest {
  ensure(withId !== me.id, 'venue.self', 'Invite someone else.');
  const p = world.players[withId];
  if (p) {
    ensure(locationOf(p) === b.market, 'venue.guest', `${p.name} isn’t in this city.`);
    if (!p.ai)
      return { name: p.name, contact: { kind: 'player', refId: p.id, name: p.name }, player: p };
    // AI angels (and AI fund managers): warmth goes to their fund, so warm intros work.
    const fundId = p.angel?.fundId ?? p.investor?.fundId;
    const fund = fundId ? world.funds[fundId] : undefined;
    if (fund)
      return {
        name: p.name,
        contact: { kind: 'fund', refId: fund.id, name: `${p.name}, ${fund.name}` },
      };
    const company = p.companyIds
      .map((id) => world.companies[id])
      .find((c) => c?.status === 'active');
    return {
      name: p.name,
      contact: {
        kind: 'founder',
        refId: p.id,
        name: company ? `${p.name}, ${company.name}` : p.name,
      },
    };
  }
  const f = world.funds[withId];
  if (f) {
    ensure(f.market === b.market, 'venue.guest', `${f.partner} isn’t in this city.`);
    const manager = f.managerId ? world.players[f.managerId] : undefined;
    if (manager && !manager.ai)
      return {
        name: manager.name,
        contact: { kind: 'player', refId: manager.id, name: manager.name },
        player: manager,
      };
    return {
      name: f.partner,
      contact: { kind: 'fund', refId: f.id, name: `${f.partner}, ${f.name}` },
    };
  }
  const c = (me.contacts ?? []).find((x) => x.id === withId);
  ensure(c, 'venue.guest', 'Pick someone from your contacts, a fund partner or a player.');
  return { name: c.name.split(',')[0]!, contact: { kind: c.kind, refId: c.refId, name: c.name } };
}

/** Eat, drink or get a haircut; with `withId`, a meeting over a meal (the inviter pays). */
export function venueBuy(world: World, me: Player, businessId: Id, itemId: string, withId?: Id) {
  const b = openBusinessOf(world, me, businessId);
  const m = getMarket(world, b.market);
  const month = m.month;
  const it = specOf(b).venue?.items.find((x) => x.id === itemId);
  ensure(it, 'venue.item', `${b.name} doesn’t sell that.`);
  const price = scale(col(m), it.priceCol);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  let guest: Guest | null = null;
  if (withId) {
    ensure(it.meeting, 'venue.meeting', `${it.label} isn’t something to invite someone to.`);
    // Wave 5: a meeting over a meal costs money only (no hours for anyone).
    guest = resolveGuest(world, me, withId, b);
  }
  const total = guest ? price * 2 : price;
  const mine = account(world, me.accounts.local);
  ensure(
    mine.balance >= costIn(world, total, m.data.currency, mine.currency),
    'venue.funds',
    `That costs ${fmt(total)}; you don’t have it.`,
  );
  payExact(world, me.accounts.local, b.account, total, `${it.label} at ${b.name}`, month);
  const energy = it.energy ?? 0;
  if (energy) me.energy = clamp(me.energy + energy, 0, 100);
  raiseRapport(b, me.id, 0.02);
  if (!guest)
    return {
      price: total,
      energy,
      warmth: null as number | null,
      message: `${it.label} at ${b.name}: ${fmt(total)}.`,
    };

  // A meeting over a meal: warmer than a handshake at an event.
  const warmth = clamp(0.25 + it.priceCol * 4, 0.25, 0.45);
  addContact(me, { ...guest.contact, warmth }, month);
  me.network = Math.min(100, me.network + 1);
  if (guest.player) {
    const q = guest.player;
    if (energy) q.energy = clamp(q.energy + energy, 0, 100);
    addContact(q, { kind: 'player', refId: me.id, name: me.name, warmth }, month);
    adjustTrust(me, q.id, 0.06);
    adjustTrust(q, me.id, 0.06);
    notify(world, q.id, {
      month,
      kind: 'meeting',
      text: `${me.name} took you for ${it.label.toLowerCase()} at ${b.name}.`,
    });
  }
  const c = (me.contacts ?? []).find(
    (x) => x.id === `${guest.contact.kind}:${guest.contact.refId}`,
  );
  const now = c ? Math.round(contactWarmth(c, month) * 100) / 100 : warmth;
  return {
    price: total,
    energy,
    warmth: now,
    message: `${it.label} with ${guest.name} at ${b.name}: ${fmt(total)}. You’re on warmer terms (${Math.round(now * 100)}%).`,
  };
}

// ---------------------------------------------------------------- Events at businesses

/** Businesses that can host an event (hotels, event venues and the like). */
export function canHostEvents(b: LocalBusiness): boolean {
  const spec = businessKind(b.kind);
  return !!spec && spec.category === 'hospitality';
}

export function eventVenueBusiness(world: World, me: Player, businessId: Id): LocalBusiness {
  const b = openBusinessOf(world, me, businessId);
  ensure(canHostEvents(b), 'event.business', `${b.name} doesn’t host events.`);
  return b;
}

// ---------------------------------------------------------------- Views

export function businessesView(world: World, viewer: Player, m: MarketState) {
  const month = m.month;
  return Object.values(businessesOf(m))
    .filter((b) => isOpen(b) || month - (b.closedMonth ?? month) <= BUSINESS_RECENT_MONTHS)
    .map((b) => {
      const spec = specOf(b);
      const blocker = pitchBlocker(world, viewer, b);
      return {
        id: b.id,
        name: b.name,
        kind: b.kind,
        kindLabel: spec.label,
        category: spec.category,
        district: b.district,
        /** The real street or area (Wave 5); null when the roster doesn't name one. */
        street: CITY_BUSINESSES[m.id]?.[b.seed]?.street ?? null,
        owner: { name: b.owner.name },
        look: spec.look,
        open: isOpen(b),
        venue: spec.venue
          ? {
              items: spec.venue.items.map((it) => ({
                id: it.id,
                label: it.label,
                price: scale(col(m), it.priceCol),
                ...(it.energy ? { energy: it.energy } : {}),
                ...(it.meeting ? { meeting: true } : {}),
              })),
            }
          : null,
        gigs: spec.gigs.map((g) => ({
          id: g.id,
          label: g.label,
          hours: g.hours,
          pay: gigPay(m, viewer, g),
          skillMatch: gigSkillMatch(viewer, g.skill),
        })),
        buys: (Object.keys(spec.buys) as Industry[]).map((sector) => {
          const s = b.suppliers.find((x) => x.sector === sector);
          const c = s ? world.companies[s.companyId] : undefined;
          return {
            sector,
            label: CATEGORY[sector],
            monthlyBudget: sectorBudget(b, sector),
            supplier: c
              ? { companyId: c.id, name: c.name, you: c.founderIds.includes(viewer.id) }
              : null,
          };
        }),
        you: {
          customer: b.suppliers.some((s) =>
            world.companies[s.companyId]?.founderIds.includes(viewer.id),
          ),
          canPitch: blocker === null,
          reason: blocker,
        },
      };
    });
}

export function economyView(m: MarketState) {
  const all = Object.values(businessesOf(m));
  return {
    businessesOpen: all.filter(isOpen).length,
    takingsLastMonth: m.economy?.takings ?? 0,
    tradeWithStartups: m.economy?.trade ?? 0,
    /** Gigs worked at businesses so far this month. */
    gigsWorked: m.economy?.gigsNow ?? 0,
  };
}

export function businessCustomersOf(world: World, c: Company) {
  const m = world.markets[c.market];
  if (!m) return [];
  return Object.values(businessesOf(m))
    .filter(isOpen)
    .flatMap((b) =>
      b.suppliers
        .filter((s) => s.companyId === c.id)
        .map((s) => ({ businessId: b.id, name: b.name, monthly: s.monthlyMinor })),
    );
}
