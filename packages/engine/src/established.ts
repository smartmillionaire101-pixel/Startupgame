/**
 * Established listed companies (player feedback, round two: "only five
 * companies on each exchange"). Each city's exchange also lists its
 * established companies: a bank, a freight group, a retailer, a software
 * house… across the city's sectors, in every size, from steady dividend
 * payers to fast growers losing money and a company in trouble.
 *
 * They are run by the game, not by AI founders: no founder, no staff to
 * hire, no customers taken from startups' segments, never raising, pitching
 * or being met at the Hub. Each month their sales move with their profile
 * (growth, profit margin, how much they swing) and the city's mood, with
 * their own random stream; the money moves through the ledger (sales from
 * the city's customers, costs to its payroll and suppliers, tax), and their
 * share price follows the model like any listing.
 *
 * Replay safety: feedback-note worlds only (`feedbackOn`). Ids are fixed per
 * city slot (`co_est_<city>_<n>`, with matching account ids), so creating
 * them never takes an id from the world counter, and any slot missing (a
 * world that had the note before this) is filled at the next
 * `ensureExchange` (a settlement, a city opening or an announcement), the
 * same way every time.
 */
import { CITY_NAME_PARTS } from './data/business-names.js';
import { INDUSTRY_LABEL, segmentsForIndustry, type Industry } from './data/industries.js';
import type { MarketId } from './data/markets.js';
import { listAtModelPrice } from './exits.js';
import { getMarket, nextStage } from './helpers.js';
export { isEstablished } from './helpers.js';
import { account, openAccount, transfer } from './ledger.js';
import { NO_EFFECTS } from './marketplace.js';
import { checkName } from './names.js';
import { feedbackOn } from './releases.js';
import { deriveRng, type Rng } from './rng.js';
import { newStars } from './stars.js';
import { valueCompany } from './valuation.js';
import type {
  Company,
  EstablishedProfile,
  MarketState,
  MonthlyPnl,
  RevenueModel,
  Stage,
  World,
} from './types.js';

type Kind = EstablishedProfile['kind'];

/** Every tuning number in one place (revenue in US dollars a month, converted per city). */
export const ESTABLISHED = {
  /** Each city's established companies, by sector, in slot order (what the city is known for first). */
  roster: {
    lagos: [
      'fintech',
      'ecommerce',
      'logistics',
      'fintech',
      'agritech',
      'healthtech',
      'ecommerce',
      'saas',
      'fintech',
      'edtech',
      'agritech',
    ],
    nairobi: [
      'fintech',
      'agritech',
      'logistics',
      'fintech',
      'ecommerce',
      'healthtech',
      'agritech',
      'saas',
      'edtech',
      'fintech',
      'logistics',
    ],
    london: [
      'fintech',
      'saas',
      'ecommerce',
      'fintech',
      'healthtech',
      'logistics',
      'saas',
      'edtech',
      'fintech',
      'healthtech',
      'ecommerce',
      'saas',
      'agritech',
    ],
    accra: [
      'fintech',
      'agritech',
      'ecommerce',
      'logistics',
      'fintech',
      'healthtech',
      'edtech',
      'agritech',
      'saas',
      'logistics',
    ],
    freetown: [
      'agritech',
      'logistics',
      'fintech',
      'agritech',
      'ecommerce',
      'healthtech',
      'logistics',
      'edtech',
      'fintech',
      'saas',
    ],
    kigali: [
      'agritech',
      'healthtech',
      'fintech',
      'logistics',
      'edtech',
      'saas',
      'agritech',
      'fintech',
      'ecommerce',
      'healthtech',
    ],
    johannesburg: [
      'fintech',
      'logistics',
      'healthtech',
      'fintech',
      'ecommerce',
      'saas',
      'agritech',
      'logistics',
      'fintech',
      'edtech',
      'healthtech',
    ],
    cairo: [
      'ecommerce',
      'fintech',
      'logistics',
      'edtech',
      'healthtech',
      'agritech',
      'saas',
      'ecommerce',
      'fintech',
      'logistics',
      'edtech',
    ],
    dubai: [
      'logistics',
      'fintech',
      'ecommerce',
      'logistics',
      'saas',
      'fintech',
      'healthtech',
      'ecommerce',
      'edtech',
      'saas',
      'agritech',
    ],
    'san-francisco': [
      'saas',
      'fintech',
      'saas',
      'healthtech',
      'ecommerce',
      'saas',
      'fintech',
      'logistics',
      'edtech',
      'healthtech',
      'saas',
      'agritech',
      'ecommerce',
      'fintech',
    ],
  } as Record<MarketId, Industry[]>,
  /** How big a city's companies are (1 = Johannesburg). */
  scale: {
    lagos: 0.9,
    nairobi: 0.6,
    london: 1.5,
    accra: 0.45,
    freetown: 0.2,
    kigali: 0.3,
    johannesburg: 1,
    cairo: 0.8,
    dubai: 1.2,
    'san-francisco': 2,
  } as Record<MarketId, number>,
  /** The mix of kinds, by slot (repeats). */
  kinds: [
    'blue-chip',
    'steady',
    'grower',
    'steady',
    'blue-chip',
    'small',
    'grower',
    'turnaround',
    'steady',
    'small',
    'grower',
    'blue-chip',
    'turnaround',
    'small',
    'steady',
  ] as Kind[],
  /** Per kind: monthly sales (USD), monthly growth, net margin, monthly swing, stars, last round. */
  profiles: {
    'blue-chip': {
      revenueUsd: [2_500_000, 8_000_000],
      growth: [0.002, 0.006],
      margin: [0.12, 0.24],
      swing: [0.008, 0.018],
      stars: [4, 4.6],
      round: 'series-b',
      cashMonths: 4,
    },
    steady: {
      revenueUsd: [600_000, 2_000_000],
      growth: [0.004, 0.012],
      margin: [0.05, 0.14],
      swing: [0.015, 0.03],
      stars: [3.5, 4.2],
      round: 'series-a',
      cashMonths: 3,
    },
    grower: {
      revenueUsd: [200_000, 900_000],
      growth: [0.02, 0.045],
      margin: [-0.2, 0.02],
      swing: [0.04, 0.07],
      stars: [3.2, 4],
      round: 'series-a',
      cashMonths: 2,
    },
    turnaround: {
      revenueUsd: [300_000, 1_200_000],
      growth: [-0.015, 0],
      margin: [-0.1, 0.03],
      swing: [0.04, 0.08],
      stars: [2.4, 3.2],
      round: 'series-a',
      cashMonths: 2,
    },
    small: {
      revenueUsd: [120_000, 400_000],
      growth: [0.004, 0.02],
      margin: [0.02, 0.12],
      swing: [0.025, 0.05],
      stars: [3, 3.8],
      round: 'seed',
      cashMonths: 3,
    },
  } as Record<
    Kind,
    {
      revenueUsd: [number, number];
      growth: [number, number];
      margin: [number, number];
      swing: [number, number];
      stars: [number, number];
      round: Stage;
      cashMonths: number;
    }
  >,
  /** A company losing money keeps this many months of losses in the bank when it lists. */
  lossMonths: 30,
  /** Growers slow and move toward a profit as they age; turnarounds recover slowly. */
  growerFade: 0.985,
  growerMarginStep: 0.004,
  turnaroundMarginStep: 0.002,
  maxMargin: 0.2,
  /** Tax on a month's profit, and the payroll share of costs. */
  taxRate: 0.25,
  payrollShare: 0.55,
  /** Sales a year per employee (USD). */
  revenuePerEmployeeUsd: 150_000,
  /** A share's price when it lists (USD). */
  shareUsd: [1, 40] as [number, number],
  /** Months of accounts a company lists with. */
  historyMonths: 12,
  /** How much the city's mood moves sales a month (climate 1 = neutral). */
  climateEffect: 0.03,
} as const;

const NOUNS: Record<Industry, readonly string[]> = {
  fintech: ['Bank', 'Payments', 'Capital', 'Insurance', 'Savings'],
  ecommerce: ['Stores', 'Retail', 'Markets', 'Brands'],
  logistics: ['Freight', 'Logistics', 'Haulage', 'Couriers', 'Ports'],
  healthtech: ['Health', 'Pharma', 'Clinics', 'Diagnostics'],
  edtech: ['Learning', 'Schools', 'Publishing', 'Education'],
  saas: ['Systems', 'Software', 'Data', 'Networks'],
  agritech: ['Agro', 'Farms', 'Foods', 'Mills'],
};

const SUFFIX: Record<MarketId, string> = {
  london: 'plc',
  lagos: 'Plc',
  nairobi: 'Ltd',
  accra: 'Ltd',
  freetown: 'Ltd',
  kigali: 'Ltd',
  johannesburg: 'Holdings',
  cairo: 'Group',
  dubai: 'Group',
  'san-francisco': 'Inc.',
};

const MODEL: Record<Industry, RevenueModel> = {
  fintech: 'transaction',
  ecommerce: 'marketplace',
  logistics: 'usage',
  healthtech: 'subscription',
  edtech: 'subscription',
  saas: 'subscription',
  agritech: 'transaction',
};

/** What each sector's company does (the client translates these exact lines). */
const WHAT: Record<Industry, string> = {
  fintech: 'Banking, payments and insurance for the city.',
  ecommerce: 'Shops and online retail across the city.',
  logistics: 'Freight, warehousing and deliveries in and out of the city.',
  healthtech: 'Clinics, pharmacies and health services.',
  edtech: 'Schools, courses and learning.',
  saas: 'Business software and data for the city’s companies.',
  agritech: 'Food, farming and processing.',
};

export const establishedId = (market: string, slot: number) => `co_est_${market}_${slot}`;
const accountId = (market: string, slot: number) => `acc_est_${market}_${slot}`;

const usd = (m: MarketState, x: number) => Math.round(x * 100 * m.data.unitsPerUsd);

/** The slot's name: a city place and a sector word, the first one free. */
function nameFor(world: World, m: MarketState, slot: number, sector: Industry) {
  const places = CITY_NAME_PARTS[m.id]?.places ?? [m.data.name];
  const nouns = NOUNS[sector];
  const taken = world.names[m.id] ?? {};
  for (let k = 0; k < places.length * nouns.length; k++) {
    const place = places[(slot * 3 + k) % places.length]!;
    const noun = nouns[(slot + Math.floor(k / places.length)) % nouns.length]!;
    for (const name of [`${place} ${noun} ${SUFFIX[m.id]}`, `${place} ${noun}`]) {
      const check = checkName(name, { taken });
      if (check.ok) return { name, handle: check.normalised };
    }
  }
  return null;
}

/** One month of accounts at `revenue`, with the margin drawn for it. */
function pnlFor(
  month: number,
  revenue: number,
  margin: number,
  customers: number,
  cashEnd: number,
): MonthlyPnl {
  const net = Math.round(revenue * margin);
  const tax = net > 0 ? Math.round((net / (1 - ESTABLISHED.taxRate)) * ESTABLISHED.taxRate) : 0;
  const costs = revenue - net - tax;
  const payroll = Math.round(costs * ESTABLISHED.payrollShare);
  const office = Math.round(costs * 0.1);
  const marketing = Math.round(costs * 0.1);
  return {
    month,
    revenue,
    playerRevenue: 0,
    suppliers: 0,
    payroll,
    founderSalary: 0,
    office,
    marketing,
    cloud: costs - payroll - office - marketing,
    compliance: 0,
    interest: 0,
    tax,
    net,
    cashEnd,
    customers,
  };
}

const customersAt = (c: Company, revenue: number) =>
  c.price > 0 ? Math.max(1, Math.round(revenue / c.price)) : 0;

/** Build and list one slot's company. */
function createEstablished(world: World, m: MarketState, slot: number, sector: Industry) {
  const rng = deriveRng(world.seed, 'established', m.id, slot);
  const kind = ESTABLISHED.kinds[slot % ESTABLISHED.kinds.length]!;
  const P = ESTABLISHED.profiles[kind];
  const named = nameFor(world, m, slot, sector);
  if (!named) return null;
  const id = establishedId(m.id, slot);
  const acc = openAccount(world, {
    id: accountId(m.id, slot),
    currency: m.data.currency,
    market: m.id,
    label: named.name,
  });
  const scale = ESTABLISHED.scale[m.id] ?? 1;
  const revenueNow = usd(m, rng.range(...P.revenueUsd) * scale);
  const profile: EstablishedProfile = {
    kind,
    slot,
    growth: rng.range(...P.growth),
    margin: rng.range(...P.margin),
    swing: rng.range(...P.swing),
    employees: Math.max(
      12,
      Math.round(
        (((revenueNow / 100 / m.data.unitsPerUsd) * 12) / ESTABLISHED.revenuePerEmployeeUsd) *
          rng.range(0.7, 1.3),
      ),
    ),
  };
  const seg = segmentsForIndustry(sector)[0]!;
  const budget = m.segments[seg.key]?.budget ?? usd(m, 20);
  const price = Math.max(1, Math.round(budget * rng.range(0.5, 0.9)));
  const c: Company = {
    id,
    name: named.name,
    handle: named.handle,
    market: m.id,
    industry: sector,
    idea: WHAT[sector],
    revenueModel: MODEL[sector],
    incorporation: 'local',
    founderIds: [],
    ai: true,
    status: 'active',
    foundedMonth: m.month - rng.int(60, 480),
    account: acc,
    stars: newStars(Math.round(rng.range(...P.stars) * 10) / 10),
    lastRound: P.round,
    lastRaiseMonth: null,
    closedMonth: null,
    raising: false,
    cogsUsdPerCustomer: 0,
    buildHours: 0,
    keyPersonLossMonth: null,
    product: {
      fit: rng.range(0.6, 0.85),
      quality: rng.range(0.6, 0.85),
      techDebt: 0.2,
      buildMode: 'balanced',
      discovery: {},
    },
    price,
    marketingBudget: 0,
    founderSalary: 0,
    targetSegments: [],
    segments: {},
    staff: [],
    capTable: {
      // Long-standing institutional holders (the outside world's side of the ledger).
      holdings: {},
      safes: [],
      preferences: [],
      lastPrice: 0,
      lastPostMoney: 0,
      roundsRaised: 0,
    },
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
    // Never raises: keeps it out of every startup fundraising path.
    bannedFromRaising: true,
    board: [],
    vetoes: [],
    parentId: null,
    removedFounders: {},
    established: profile,
  };
  // Its last year of accounts, back from today (no money moves for the past).
  const months: number[] = [revenueNow];
  for (let i = 1; i < ESTABLISHED.historyMonths; i++) {
    const g = profile.growth + rng.normal(0, profile.swing);
    months.unshift(Math.max(1, Math.round(months[0]! / (1 + g))));
  }
  const lossy = profile.margin < 0 ? -profile.margin * revenueNow * ESTABLISHED.lossMonths : 0;
  const cash = Math.round(revenueNow * P.cashMonths + lossy);
  c.finance.history = months.map((rev, i) =>
    pnlFor(
      m.month - months.length + i,
      rev,
      profile.margin + rng.normal(0, profile.swing / 2),
      customersAt(c, rev),
      cash,
    ),
  );
  // Shares sized so one trades at a believable price ($1–$40), held by long-standing
  // institutions (the outside world's side of the ledger) until the float is sold.
  const value = valueCompany(world, c, nextStage(c.lastRound)).value;
  const perShare = Math.max(1, usd(m, rng.range(...ESTABLISHED.shareUsd)));
  const shares = Math.max(100_000, Math.round(value / perShare));
  c.capTable.holdings[`sec:inst:${id}`] = { shares, kind: 'investor' };
  world.companies[id] = c;
  (world.names[m.id] ??= {})[named.handle] = id;
  transfer(world, m.ext.genesis, acc, cash, 'Prior funding', m.month);
  listAtModelPrice(world, m, c);
  return c;
}

/** Feedback-note worlds: every slot of the city's roster exists (a slot whose company closed stays closed). */
export function ensureEstablished(world: World, marketId: string): number {
  if (!feedbackOn(world)) return 0;
  const m = world.markets[marketId as MarketId];
  const roster = ESTABLISHED.roster[marketId as MarketId];
  if (!m || !roster) return 0;
  let made = 0;
  roster.forEach((sector, slot) => {
    if (world.companies[establishedId(m.id, slot)]) return;
    if (createEstablished(world, m, slot, sector)) made++;
  });
  return made;
}

/** Month end for an established company: sales, costs and tax through the ledger. */
export function settleEstablished(world: World, c: Company, month: number) {
  const p = c.established;
  if (!p || c.status !== 'active') return;
  const m = getMarket(world, c.market);
  const rng: Rng = deriveRng(world.seed, 'established', c.id, month);
  const last = c.finance.history[c.finance.history.length - 1];
  const before = last?.revenue ?? usd(m, 100_000);
  const g = p.growth + rng.normal(0, p.swing) + (m.climate - 1) * ESTABLISHED.climateEffect;
  const revenue = Math.max(1, Math.round(before * (1 + g)));
  const cash = account(world, c.account).balance;
  // Never spends money it doesn't have: a loss is capped at the cash in the bank.
  let margin = p.margin + rng.normal(0, p.swing / 2);
  if (revenue * margin < -cash) margin = -cash / revenue;
  const pnl = pnlFor(month, revenue, margin, customersAt(c, revenue), 0);
  transfer(
    world,
    m.ext.customers,
    c.account,
    revenue,
    `Sales: ${INDUSTRY_LABEL[c.industry]}`,
    month,
  );
  transfer(world, c.account, m.ext.payroll, pnl.payroll, 'Payroll', month);
  transfer(
    world,
    c.account,
    m.ext.suppliers,
    pnl.office + pnl.marketing + pnl.cloud,
    'Running costs',
    month,
  );
  transfer(world, c.account, m.ext.tax, pnl.tax, 'Corporation tax', month);
  pnl.cashEnd = account(world, c.account).balance;
  c.finance.history.push(pnl);
  if (c.finance.history.length > 36) c.finance.history.shift();
  // Growers slow and move toward a profit; turnarounds mend slowly.
  if (p.kind === 'grower') {
    p.growth = Math.round(p.growth * ESTABLISHED.growerFade * 1e6) / 1e6;
    p.margin = Math.min(ESTABLISHED.maxMargin, p.margin + ESTABLISHED.growerMarginStep);
  } else if (p.kind === 'turnaround') {
    p.margin = Math.min(0.08, p.margin + ESTABLISHED.turnaroundMarginStep);
    p.growth = Math.min(0.006, p.growth + 0.0005);
  }
  // Too little cash left to keep losing money: costs are cut to break even.
  if (p.margin < 0 && pnl.cashEnd < -p.margin * revenue * 3) p.margin = 0.01;
  c.lastDecisionMonth = month;
}
