/**
 * World creation and the AI population (§2): every market opens full of AI
 * founders, investors, a bank, incumbents and a newsroom so it never feels empty.
 */
import {
  AI_FIRST_NAMES,
  AI_FUNDS,
  AI_INCUMBENTS,
  AI_LAST_NAMES,
  AI_STARTUP_PREFIXES,
  AI_STARTUP_SUFFIXES,
  OUTLETS,
} from './data/fiction.js';
import { INDUSTRIES, SEGMENT_TEMPLATES, segmentsForIndustry } from './data/industries.js';
import type { Industry } from './data/industries.js';
import { LAUNCH_MARKETS, MARKET_DATA, PUBLIC_MULTIPLES } from './data/markets.js';
import { CURRENT_SCHEMA } from './upgrade.js';
import { createAiFund, firstHighStreetName, seedExtraFunds, seedLenders } from './capital.js';
import { ensureAngels } from './angels.js';
import { NO_EFFECTS } from './marketplace.js';
import type { MarketId } from './data/markets.js';
import {
  BACKGROUNDS,
  BASE_HOURS,
  LIFESTYLE_TIERS,
  SKILLS,
  STARTING_RUNWAY_MONTHS,
  backgroundById,
} from './data/characters.js';
import type { Role, Skills } from './data/characters.js';
import { ensure } from './errors.js';
import { col, getMarket, notify, usdToLocal } from './helpers.js';
import { newId } from './ids.js';
import { openAccount, transfer } from './ledger.js';
import { major, scale } from './money.js';
import { checkName, normaliseName, reservedAiNames } from './names.js';
import { localDate } from './clock.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import { newStars } from './stars.js';
import { newCapTable } from './captable.js';
import { refreshTalent } from './staff.js';
import { ensureBusinesses, growOnJoin } from './economy.js';
import type {
  Gender,
  Company,
  ExternalPurpose,
  Id,
  Incorporation,
  MarketState,
  Player,
  RevenueModel,
  SegmentState,
  Stage,
  World,
} from './types.js';

const EXTERNAL: ExternalPurpose[] = [
  'genesis',
  'customers',
  'payroll',
  'suppliers',
  'tax',
  'lifestyle',
  'lps',
  'bank',
  'fx',
  'gigs',
];

export const AI_STARTUPS_PER_MARKET = 10;

export function buildSegments(marketId: MarketId): Record<string, SegmentState> {
  const d = MARKET_DATA[marketId];
  const out: Record<string, SegmentState> = {};
  for (const t of SEGMENT_TEMPLATES) {
    const base =
      t.base === 'adults'
        ? d.demographics.population * d.demographics.adultShare
        : d.demographics[t.base];
    const share = t.shareByMarket?.[marketId] ?? t.share;
    const buyers = Math.max(50, Math.round(base * d.demographics.digitalAdoption * share));
    out[t.key] = {
      key: t.key,
      industry: t.industry,
      name: t.name,
      kind: t.kind,
      needs: t.needs,
      needsLabel: t.needsLabel,
      buyers,
      budget: Math.round(major(d.costOfLiving) * t.budgetCol),
      switchingCost: t.switchingCost,
      trustThreshold: t.trustThreshold,
      incumbentName: AI_INCUMBENTS[marketId][t.industry] ?? 'Incumbent',
      incumbentCustomers: Math.round(buyers * t.incumbentShare),
      incumbentScore: t.incumbentScore,
      monthlyGrowth: t.monthlyGrowth,
      salesCycle: t.salesCycle,
    };
  }
  return out;
}

function createMarket(world: World, id: MarketId, now: number): MarketState {
  const data = structuredClone(MARKET_DATA[id]);
  const ext = {} as Record<ExternalPurpose, Id>;
  for (const purpose of EXTERNAL) {
    ext[purpose] = openAccount(world, {
      id: `ext:${id}:${purpose}`,
      currency: data.currency,
      market: id,
      label: `${data.name} ${purpose}`,
      external: true,
    });
  }
  const market: MarketState = {
    id,
    data,
    month: 0,
    multiples: { ...PUBLIC_MULTIPLES },
    climate: 1,
    segments: buildSegments(id),
    talent: [],
    outlets: OUTLETS[id].map((o) => ({ ...o })),
    news: [],
    bankName: firstHighStreetName(id),
    lenders: seedLenders(id),
    economicNote: `${data.name}: policy rate ${(data.baseRateBps / 100).toFixed(2)}%. Markets open for business.`,
    lastSettledDate: localDate(now, data.timeZone),
    settledAt: now,
    ext,
  };
  world.names[id] = {};
  for (const n of reservedAiNames(id)) world.names[id][normaliseName(n)] = 'ai';
  return market;
}

function seedFunds(world: World, marketId: MarketId) {
  for (const seed of AI_FUNDS[marketId]) createAiFund(world, marketId, seed);
  // Deeper capital markets get more and bigger funds and angel networks (Wave 1).
  seedExtraFunds(world, marketId);
}

const baseSkills = (): Skills => Object.fromEntries(SKILLS.map((s) => [s, 20])) as Skills;

export interface NewPlayerInput {
  playerId: Id;
  handle: string;
  name: string;
  role: Role;
  backgroundId: string;
  market: MarketId;
  now: number;
  ai?: boolean;
  /** Fixed personal account id (AI angels), so creating them never shifts other ids. */
  accountId?: Id;
  /** Wave 5: chosen at onboarding (stored when given). */
  gender?: Gender;
}

/** Wave 5: new human players start with twice the savings, so nobody is stuck early. */
export const HUMAN_SAVINGS_MULTIPLIER = 2;

/**
 * Wave 6: a new human's savings last at least this many months at the Modest
 * lifestyle with no income, whatever their background.
 */
export const HUMAN_MIN_RUNWAY_MONTHS = 24;

export function createPlayer(world: World, input: NewPlayerInput): Player {
  ensure(!world.players[input.playerId], 'player.exists', 'Player already exists.');
  const bg = backgroundById(input.backgroundId);
  ensure(bg && bg.role === input.role, 'player.background', 'Pick a background for your role.');
  const m = getMarket(world, input.market);
  const handleKey = `@${normaliseName(input.handle)}`;
  // AI handles are internal ids, never shown or reserved.
  if (!input.ai) {
    const check = checkName(input.handle, { taken: {}, kind: 'handle' });
    if (!check.ok) ensure(false, 'player.handle', check.reason);
    ensure(!world.names[input.market]![handleKey], 'player.handle', 'That handle is taken.');
  }
  const local = openAccount(world, {
    currency: m.data.currency,
    market: input.market,
    label: `${input.name} personal`,
    ...(input.accountId ? { id: input.accountId } : {}),
  });
  // Starting savings: same months of personal runway in every market (§3), adjusted by background.
  // Wave 6: a human's savings cover at least 24 months at Modest (exactly, in minor units).
  const savings = Math.max(
    Math.round(
      col(m) *
        STARTING_RUNWAY_MONTHS *
        bg.savingsMultiplier *
        (input.ai ? 1 : HUMAN_SAVINGS_MULTIPLIER),
    ),
    input.ai ? 0 : HUMAN_MIN_RUNWAY_MONTHS * scale(col(m), LIFESTYLE_TIERS[1]!.costCol),
  );
  transfer(world, m.ext.genesis, local, savings, 'Starting savings', m.month);
  const tier = LIFESTYLE_TIERS[1]!;
  const player: Player = {
    id: input.playerId,
    handle: input.handle,
    name: input.name,
    ai: input.ai ?? false,
    role: input.role,
    backgroundId: bg.id,
    market: input.market,
    joinedAt: input.now,
    lastActiveAt: input.now,
    skills: { ...baseSkills(), ...bg.skills },
    network: bg.network,
    stars: newStars(bg.stars),
    hours: { available: BASE_HOURS + bg.hoursBonus + tier.hours, used: 0 },
    energy: 80,
    burnout: false,
    lifestyleTier: tier.tier,
    accounts: { local },
    credit: { missedPayments: 0, defaults: 0, onTimePayments: 0 },
    loans: [],
    companyIds: [],
    milestones: {},
    trust: {},
    inactivity: { warned: false, forSale: false },
    lastMonth: { income: 0, spend: 0, tax: 0 },
    diligence: {},
    pitchedOutlets: {},
    gigsThisMonth: 0,
    failures: 0,
    visited: {},
    ...(input.gender ? { gender: input.gender } : {}),
    // Wave 7: people have needs (AI players don't).
    ...(input.ai ? {} : { needs: { hunger: 80, hygiene: 80, fun: 80, social: 80 } }),
  };
  // Wave 6: the city grows as people arrive (counted before the player is stored).
  if (!input.ai) growOnJoin(world, input.market, player.id);
  world.players[player.id] = player;
  if (!input.ai) world.names[input.market]![handleKey] = player.id;
  world.inbox[player.id] = [];
  return player;
}

export interface NewCompanyInput {
  founderId: Id;
  name: string;
  industry: Industry;
  revenueModel: RevenueModel;
  idea: string;
  incorporation: Incorporation;
  ai?: boolean;
}

/** Incorporation costs (one-off, multiples of cost of living) and investor appeal. */
export const INCORPORATION: Record<
  Incorporation,
  { costCol: number; label: string; investorAppeal: number }
> = {
  local: { costCol: 0.3, label: 'Local entity', investorAppeal: 0 },
  uk: { costCol: 1.2, label: 'UK Ltd', investorAppeal: 0.03 },
  us: { costCol: 2.5, label: 'US-style holding company', investorAppeal: 0.06 },
};

export function createCompany(world: World, input: NewCompanyInput): Company {
  const founder = world.players[input.founderId];
  ensure(founder, 'player.missing', 'Founder not found.');
  const m = getMarket(world, founder.market);
  const check = checkName(input.name, { taken: world.names[m.id]! });
  if (!check.ok) ensure(false, 'company.name', check.reason);
  const id = newId(world, 'co');
  const account = openAccount(world, {
    currency: m.data.currency,
    market: m.id,
    label: input.name,
  });
  const segs = segmentsForIndustry(input.industry);
  const first = m.segments[segs[0]!.key]!;
  const price = Math.round(first.budget * 0.6);
  const company: Company = {
    id,
    name: input.name.trim(),
    handle: check.normalised,
    market: m.id,
    industry: input.industry,
    idea: input.idea.trim(),
    revenueModel: input.revenueModel,
    incorporation: input.incorporation,
    founderIds: [input.founderId],
    ai: input.ai ?? false,
    status: 'active',
    foundedMonth: m.month,
    account,
    stars: newStars(Math.min(2, founder.stars.value)),
    lastRound: null,
    lastRaiseMonth: null,
    closedMonth: null,
    raising: false,
    cogsUsdPerCustomer: 0,
    buildHours: 0,
    keyPersonLossMonth: null,
    product: { fit: 0.25, quality: 0.4, techDebt: 0.1, buildMode: 'balanced', discovery: {} },
    price,
    marketingBudget: 0,
    founderSalary: 0,
    targetSegments: [first.key],
    segments: {},
    staff: [],
    capTable: newCapTable([{ id: input.founderId, bps: 10_000 }]),
    finance: { history: [], lossCarryForward: 0, receivables: [], loans: [], unpaidPayroll: 0 },
    compliance: {},
    pivots: 0,
    warnings: [],
    lastDecisionMonth: m.month,
    forSale: false,
    aiCeo: false,
    supply: { ...NO_EFFECTS },
    supplyDisruptionMonth: null,
    ledgerThisMonth: { playerRevenue: 0, supplierCost: 0, flaggedRevenue: 0 },
    lastFlaggedRevenue: 0,
    fraudStreak: 0,
    bannedFromRaising: false,
    board: [],
    vetoes: [],
    parentId: null,
    removedFounders: {},
  };
  setCogs(world, company);
  world.companies[id] = company;
  world.names[m.id]![check.normalised] = id;
  founder.companyIds.push(id);
  // Founder seeds the company with a little personal money for incorporation.
  const incCost = scale(col(m), INCORPORATION[input.incorporation].costCol);
  const personal = world.accounts[founder.accounts.local]!;
  const seed = Math.min(personal.balance, Math.max(incCost, Math.round(col(m) * 1)));
  transfer(world, founder.accounts.local, account, seed, 'Founder capital', m.month, 'capital');
  transfer(
    world,
    account,
    m.ext.suppliers,
    Math.min(incCost, seed),
    `Incorporation (${INCORPORATION[input.incorporation].label})`,
    m.month,
  );
  return company;
}

/** Cost-to-serve ratio by revenue model; the dollar-priced share of each customer's price. */
export const COGS_RATIO: Record<RevenueModel, number> = {
  subscription: 0.12,
  transaction: 0.3,
  usage: 0.22,
  marketplace: 0.18,
  'one-off': 0.25,
  services: 0.1,
};

/** Re-anchor the USD cost to serve a customer (called when price or model changes). */
export function setCogs(world: World, c: Company) {
  const m = getMarket(world, c.market);
  const localCost = c.price * COGS_RATIO[c.revenueModel];
  c.cogsUsdPerCustomer = Math.round(localCost / m.data.unitsPerUsd);
}

// ------------------------------------------------------------------ AI population

function aiName(rng: Rng, market: MarketId) {
  return `${rng.pick(AI_FIRST_NAMES[market])} ${rng.pick(AI_LAST_NAMES[market])}`;
}

export function spawnAiStartup(
  world: World,
  marketId: MarketId,
  rng: Rng,
  now: number,
): Company | null {
  const m = getMarket(world, marketId);
  for (let attempt = 0; attempt < 12; attempt++) {
    const name = `${rng.pick(AI_STARTUP_PREFIXES)}${rng.pick(AI_STARTUP_SUFFIXES)}`;
    if (!checkName(name, { taken: world.names[marketId]! }).ok) continue;
    const industry = rng.pick(INDUSTRIES);
    const bg = rng.pick(BACKGROUNDS.filter((b) => b.role === 'founder'));
    const pid = newId(world, 'ai');
    const founder = createPlayer(world, {
      playerId: pid,
      handle: `ai_${pid}`,
      name: aiName(rng, marketId),
      role: 'founder',
      backgroundId: bg.id,
      market: marketId,
      now,
      ai: true,
    });
    const company = createCompany(world, {
      founderId: founder.id,
      name,
      industry,
      revenueModel: rng.pick(['subscription', 'transaction', 'marketplace', 'usage'] as const),
      idea: `${name} serves ${m.segments[segmentsForIndustry(industry)[0]!.key]!.name.toLowerCase()}.`,
      incorporation: 'local',
      ai: true,
    });
    // AI founders start at different points so the market has texture (§1 "markets are uneven").
    const ageMonths = rng.int(0, 30);
    company.foundedMonth = m.month - ageMonths;
    company.product.fit = Math.min(0.75, 0.25 + ageMonths * rng.range(0.008, 0.016));
    company.product.quality = Math.min(0.8, 0.4 + ageMonths * 0.01);
    const seg = m.segments[company.targetSegments[0]!]!;
    const paying = Math.round(
      Math.min(seg.buyers * 0.004, ageMonths * rng.range(5, 40) * (seg.kind === 'b2b' ? 0.05 : 1)),
    );
    company.segments[seg.key] = {
      awareness: Math.min(0.2, ageMonths * 0.002),
      paying,
      won: 0,
      churned: 0,
      pipeline: [],
      funnel: { aware: 0, interested: 0, trial: 0, paying, churned: 0 },
    };
    const capital = scale(col(m), rng.range(15, 60) * (1 + ageMonths / 15));
    transfer(world, m.ext.genesis, company.account, capital, 'Prior funding', m.month);
    if (ageMonths > 12) company.lastRound = rng.chance(0.5) ? 'seed' : 'pre-seed';
    company.marketingBudget = scale(col(m), 0.8);
    company.price = Math.round(seg.budget * rng.range(0.4, 0.8));
    setCogs(world, company);
    company.stars = newStars(Math.min(3.5, 1 + ageMonths / 15));
    return company;
  }
  return null;
}

export interface CreateWorldOptions {
  seed: number;
  now: number;
  markets?: readonly MarketId[];
  aiStartupsPerMarket?: number;
}

/**
 * Open a market (§2: "New markets open in waves, giving newcomers ground
 * where nobody has an advantage yet"). Fills it with its AI population.
 */
export function openMarket(
  world: World,
  id: MarketId,
  now: number,
  aiStartups = AI_STARTUPS_PER_MARKET,
) {
  ensure(!world.markets[id], 'market.open', 'That market is already open.');
  world.markets[id] = createMarket(world, id, now);
  seedFunds(world, id);
  const rng = deriveRng(world.seed, 'genesis', id);
  refreshTalent(world, id, rng);
  for (let i = 0; i < aiStartups; i++) spawnAiStartup(world, id, rng, now);
  // Local businesses (Wave 3), with deterministic ids so other ids don't shift.
  ensureBusinesses(world, id);
  // AI angels (Wave 3): stable ids and their own RNG stream, so nothing above shifts.
  ensureAngels(world, id, now);
  return world.markets[id]!;
}

export function createWorld(opts: CreateWorldOptions): World {
  const world: World = {
    schemaVersion: CURRENT_SCHEMA,
    seed: opts.seed >>> 0,
    version: 0,
    nextId: 1,
    createdAt: opts.now,
    markets: {},
    players: {},
    companies: {},
    funds: {},
    accounts: {},
    positions: {},
    deals: {},
    pitches: {},
    media: {},
    inbox: {},
    names: {},
    listings: {},
    contracts: {},
    votes: {},
    disputes: {},
    banks: {},
    events: {},
    usdExt: { fx: 'ext:usd:fx', suppliers: 'ext:usd:suppliers', genesis: 'ext:usd:genesis' },
  };
  openAccount(world, {
    id: world.usdExt.fx,
    currency: 'USD',
    market: 'london',
    label: 'USD FX desk',
    external: true,
  });
  openAccount(world, {
    id: world.usdExt.suppliers,
    currency: 'USD',
    market: 'london',
    label: 'USD suppliers',
    external: true,
  });
  openAccount(world, {
    id: world.usdExt.genesis,
    currency: 'USD',
    market: 'london',
    label: 'USD genesis',
    external: true,
  });
  for (const id of opts.markets ?? LAUNCH_MARKETS)
    openMarket(world, id, opts.now, opts.aiStartupsPerMarket);
  return world;
}

/** First-day early wins (§3): something good happens within minutes. */
export function welcomeNewPlayer(world: World, player: Player, companyId: Id | null) {
  const m = getMarket(world, player.market);
  const reporter = m.outlets.find((o) => o.type === 'regional') ?? m.outlets[0]!;
  if (player.role === 'founder' && companyId) {
    const c = world.companies[companyId]!;
    const seg = m.segments[c.targetSegments[0]!]!;
    // A first AI customer lead: one real paying customer to start the funnel.
    const pos = (c.segments[seg.key] ??= {
      awareness: 0.0005,
      paying: 0,
      won: 0,
      churned: 0,
      pipeline: [],
      funnel: { aware: 0, interested: 0, trial: 0, paying: 0, churned: 0 },
    });
    pos.paying += 1;
    pos.funnel.paying = pos.paying;
    notify(world, player.id, {
      month: m.month,
      kind: 'lead',
      text: `First customer: a buyer from ${seg.name.toLowerCase()} signed up. Keep them happy.`,
    });
    const angel = Object.values(world.funds).find(
      (f) => f.market === m.id && f.ai && f.stages.includes('pre-seed'),
    );
    if (angel)
      notify(world, player.id, {
        month: m.month,
        kind: 'meeting',
        text: `${angel.partner} at ${angel.name} would like to hear your pitch.`,
      });
    notify(world, player.id, {
      month: m.month,
      kind: 'reporter',
      text: `Welcome note from ${reporter.reporter} (${reporter.name}): “Good luck with ${c.name}. Tell us when you have news.”`,
    });
  } else if (player.role === 'investor') {
    const pitches = Object.values(world.companies)
      .filter(
        (c) =>
          c.ai &&
          c.market === m.id &&
          c.status === 'active' &&
          (!player.investor?.sectors.length || player.investor.sectors.includes(c.industry)),
      )
      .slice(0, 3);
    for (const c of pitches) {
      c.raising = true;
      notify(world, player.id, {
        month: m.month,
        kind: 'pitch',
        text: `${c.name} (${c.industry}) is raising and wants to pitch you.`,
        ref: { kind: 'company', id: c.id },
      });
    }
    notify(world, player.id, {
      month: m.month,
      kind: 'reporter',
      text: `Welcome note from ${reporter.reporter} (${reporter.name}): “New money in town. We’ll be watching your first cheque.”`,
    });
  }
}

export const defaultCheckSize = (world: World, market: MarketId, stage: Stage): number => {
  const m = getMarket(world, market);
  const usd = stage === 'pre-seed' ? 25_000 : stage === 'seed' ? 100_000 : 500_000;
  return usdToLocal(world, m, usd * (m.data.multipleDiscount / 0.9));
};
