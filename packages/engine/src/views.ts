/**
 * Read models. The world holds everything; a player only ever sees:
 *  - their own accounts, companies, deals, pitches, stories and inbox in full,
 *  - public information about everyone else (stars, sector, stage, public news),
 *  - extra company data only to the depth of diligence they paid for (§7),
 * and never an AI counterparty's hidden negotiation limits.
 */
import { BACKGROUNDS, LIFESTYLE_TIERS } from './data/characters.js';
import { INDUSTRY_LABEL } from './data/industries.js';
import { rulesFor } from './data/rules.js';
import { markValue, ownership, waterfall } from './captable.js';
import { clockView, gameDate } from './clock.js';
import { companyRunway, defaultAlive } from './company.js';
import { rescuePlan } from './rescue.js';
import { reliability, scoreOffer, segmentFit } from './customers.js';
import { trackRecord } from './funds.js';
import { creditProfile } from './credit.js';
import { CAPITAL } from './data/capital.js';
import {
  appetiteLabel,
  companyQuote,
  founderQuote,
  fundOffice,
  productAmount,
  productRateBps,
} from './capital.js';
import { flightsView, isVisiting, tripCostUsd } from './travel.js';
import { EVENT_KINDS, EVENT_KIND_DATA, EVENT_RECENT_MONTHS } from './data/events.js';
import { contactWarmth, eventCost } from './events.js';
import {
  businessCustomersOf,
  businessesView,
  economyView,
  jobsView,
  myJobView,
} from './economy.js';
import { carView, homeView as myHomeView, shopView, statusOf } from './shop.js';
import { marketRate, playerRevenueShare } from './marketplace.js';
import { boardOf } from './governance.js';
import { BANK_TYPES, MIN_CAPITAL_RATIO, bankFigures } from './banks.js';
import {
  attendeesAi,
  capitalProgramsView,
  fundInvestorType,
  playerInvestorType,
} from './programs.js';
import {
  burn,
  getMarket,
  usdToLocal,
  hoursLeft,
  lastPnl,
  locationOf,
  nextStage,
  totalCustomers,
} from './helpers.js';
import { lifestyleCost, tierOf } from './personal.js';
import { hasPublicWarning } from './stars.js';
import { isOverloaded, managementCapacity } from './staff.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type { MarketId } from './data/markets.js';
import type { Company, DealCard, Id, MarketState, NewsItem, Player, World } from './types.js';

const round1 = (x: number) => Math.round(x * 10) / 10;
const finite = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

export function publicCompany(world: World, c: Company) {
  return {
    id: c.id,
    name: c.name,
    market: c.market,
    marketName: getMarket(world, c.market).data.name,
    currency: getMarket(world, c.market).data.currency,
    aiCeo: c.aiCeo,
    industry: c.industry,
    industryLabel: INDUSTRY_LABEL[c.industry],
    idea: c.idea,
    ai: c.ai,
    status: c.status,
    stars: round1(c.stars.value),
    publicWarning: hasPublicWarning(c.stars),
    lastRound: c.lastRound,
    raising: c.raising,
    teamSize: c.staff.length + c.founderIds.length,
    founders: c.founderIds.map((id) => ({
      id,
      name: world.players[id]?.name ?? '—',
      ai: world.players[id]?.ai ?? true,
    })),
    ageMonths: getMarket(world, c.market).month - c.foundedMonth,
    forSale: c.forSale,
  };
}

/** What an investor can see after diligence (depth 1: numbers; depth 2: the skeletons). */
export function diligenceView(world: World, c: Company, depth: number) {
  if (depth <= 0) return null;
  const pnl = lastPnl(c);
  const base = {
    revenue: pnl?.revenue ?? 0,
    customers: totalCustomers(c),
    growth: Math.round(monthlyGrowth(c) * 1000) / 10,
    burn: burn(c),
    runwayMonths: finite(companyRunway(world, c)),
    revenueHistory: c.finance.history.slice(-12).map((h) => h.revenue),
    lastPostMoney: c.capTable.lastPostMoney,
    modelValuation: valueCompany(world, c, nextStage(c.lastRound)).value,
  };
  if (depth < 2) return { depth, ...base };
  const segs = Object.values(c.segments);
  const churned = segs.reduce((a, s) => a + s.churned, 0);
  const paying = segs.reduce((a, s) => a + s.paying, 0);
  const top = segs.reduce((a, s) => Math.max(a, s.paying), 0);
  return {
    depth,
    ...base,
    monthlyChurnPct: Math.round((churned / Math.max(1, paying + churned)) * 1000) / 10,
    largestSegmentShare: paying ? Math.round((top / paying) * 100) : 0,
    playerRevenueShare: Math.round(playerRevenueShare(c) * 100),
    // Connected parties and guardrail flags (§6): what diligence surfaces.
    flaggedContracts: Object.values(world.contracts)
      .filter((k) => k.flags.length && (k.sellerId === c.id || k.buyerId === c.id))
      .map((k) => ({
        with: world.companies[k.sellerId === c.id ? k.buyerId : k.sellerId]?.name ?? '',
        flags: k.flags,
        status: k.status,
      })),
    bannedFromRaising: c.bannedFromRaising,
    complianceGaps: rulesFor(c.market, c.industry)
      .filter((r) => !c.compliance[r.id])
      .map((r) => r.title),
    founderAgreementsSigned: !!c.compliance[`${c.market}.founder-agreements`],
    loans: c.finance.loans.map((l) => ({ lender: l.lender, outstanding: l.outstanding })),
    keyPersonLoss: c.keyPersonLossMonth !== null,
    pivots: c.pivots,
    founderLifestyle: c.founderIds.map((id) =>
      world.players[id] ? tierOf(world.players[id]!).name : '—',
    ),
    conflicts: c.founderIds
      .flatMap((id) =>
        Object.values(world.positions)
          .filter((p) => p.investorId === id)
          .map((p) => world.companies[p.companyId]?.name ?? ''),
      )
      .filter(Boolean),
  };
}

export function companyDetail(world: World, c: Company) {
  const m = getMarket(world, c.market);
  const cash = world.accounts[c.account]!.balance;
  const stage = nextStage(c.lastRound);
  const valuation = valueCompany(world, c, stage);
  return {
    ...publicCompany(world, c),
    revenueModel: c.revenueModel,
    incorporation: c.incorporation,
    cash,
    bankId: world.accounts[c.account]!.bankId ?? null,
    runwayMonths: finite(companyRunway(world, c)),
    defaultAlive: defaultAlive(world, c),
    monthlyRevenue: lastPnl(c)?.revenue ?? 0,
    burn: burn(c),
    price: c.price,
    marketingBudget: c.marketingBudget,
    founderSalary: c.founderSalary,
    product: { ...c.product, reliability: reliability(c) },
    targetSegments: c.targetSegments,
    segments: Object.entries(c.segments).map(([key, pos]) => {
      const seg = m.segments[key]!;
      return {
        key,
        name: seg.name,
        kind: seg.kind,
        targeted: c.targetSegments.includes(key),
        fit: segmentFit(c, key),
        score: scoreOffer(c, seg),
        buyers: seg.buyers,
        budget: seg.budget,
        ...pos,
        pipeline: pos.pipeline.reduce((a, p) => a + p.count, 0),
      };
    }),
    staff: c.staff,
    management: { capacity: managementCapacity(c), overloaded: isOverloaded(c) },
    capTable: {
      rows: Object.entries(c.capTable.holdings).map(([holderId, h]) => ({
        holderId,
        name:
          world.players[holderId]?.name ??
          world.funds[holderId]?.name ??
          c.staff.find((s) => s.id === holderId)?.name ??
          (holderId === 'pool'
            ? 'Option pool'
            : holderId.startsWith('bank:')
              ? `${getMarket(world, holderId.slice(5) as MarketId).bankName} (seized)`
              : holderId),
        kind: h.kind,
        shares: h.shares,
        pct: Math.round(ownership(c.capTable, holderId) * 1000) / 10,
      })),
      safes: c.capTable.safes.map((s) => ({
        holder: world.players[s.holderId]?.name ?? world.funds[s.holderId]?.name ?? s.holderId,
        amount: s.amount,
        cap: s.cap,
      })),
      lastPostMoney: c.capTable.lastPostMoney,
    },
    valuation,
    nextStage: stage,
    finance: {
      history: c.finance.history,
      loans: c.finance.loans,
      receivables: c.finance.receivables.reduce((a, r) => a + r.amount, 0),
      unpaidPayroll: c.finance.unpaidPayroll,
    },
    rules: rulesFor(c.market, c.industry).map((r) => ({ ...r, done: !!c.compliance[r.id] })),
    listing: Object.values(world.listings).find((l) => l.companyId === c.id) ?? null,
    marketRate: marketRate(world, c),
    contracts: Object.values(world.contracts)
      .filter((k) => k.buyerId === c.id || k.sellerId === c.id)
      .sort((a, b) => b.startMonth - a.startMonth)
      .slice(0, 20)
      .map((k) => ({
        ...k,
        role: k.sellerId === c.id ? ('seller' as const) : ('buyer' as const),
        counterparty: world.companies[k.sellerId === c.id ? k.buyerId : k.sellerId]?.name ?? '',
        category: world.listings[k.listingId]?.category ?? '',
      })),
    supply: c.supply,
    /** Board (§9): founders plus investors who negotiated a seat; vetoes on sale. */
    board: boardOf(c).map((h) => ({
      id: h,
      name: world.players[h]?.name ?? world.funds[h]?.name ?? h,
      founder: c.founderIds.includes(h),
    })),
    vetoes: c.vetoes.map((h) => world.players[h]?.name ?? world.funds[h]?.name ?? h),
    parentName: c.parentId ? (world.companies[c.parentId]?.name ?? null) : null,
    removedFounders: Object.keys(c.removedFounders),
    bannedFromRaising: c.bannedFromRaising,
    warnings: c.warnings,
    pivots: c.pivots,
    /** Illustrative exit at the model valuation: who would get what (§12). */
    waterfallPreview: waterfall(c.capTable, valuation.value).map((l) => ({
      ...l,
      name:
        world.players[l.holderId]?.name ??
        world.funds[l.holderId]?.name ??
        c.staff.find((s) => s.id === l.holderId)?.name ??
        l.holderId,
    })),
  };
}

function dealView(world: World, d: DealCard, viewerId: Id) {
  const { aiLimit: _hidden, ...rest } = d;
  const c = d.companyId ? world.companies[d.companyId] : undefined;
  const name = (p: DealCard['proposer']) =>
    p.kind === 'player'
      ? world.players[p.id]?.name
      : p.kind === 'fund'
        ? world.funds[p.id]?.name
        : p.kind === 'company'
          ? world.companies[p.id]?.name
          : p.kind === 'bank'
            ? ((p.lenderId
                ? getMarket(world, p.id as MarketId).lenders?.[p.lenderId]?.name
                : undefined) ?? getMarket(world, p.id as MarketId).bankName)
            : p.id;
  const mine = (p: DealCard['proposer']) =>
    (p.kind === 'player' && p.id === viewerId) ||
    (p.kind === 'fund' && world.funds[p.id]?.managerId === viewerId) ||
    (p.kind === 'company' && !!world.companies[p.id]?.founderIds.includes(viewerId)) ||
    (p.kind === 'playerbank' && world.banks[p.id]?.ownerId === viewerId);
  return {
    ...rest,
    companyName: c?.name ?? 'Personal',
    currency: getMarket(world, d.market).data.currency,
    proposerName: name(d.proposer) ?? '',
    counterpartyName: name(d.counterparty) ?? '',
    yourTurn: d.status === 'open' && mine(d.awaiting),
    youProposed: mine(d.proposer),
    waterfall:
      d.terms.kind === 'acquisition' && c
        ? waterfall(c.capTable, d.terms.price).map((l) => ({
            ...l,
            name: world.players[l.holderId]?.name ?? world.funds[l.holderId]?.name ?? 'Staff',
          }))
        : undefined,
  };
}

/** Top five headlines per market for the month (§10 "Daily digest"). */
export function digest(world: World, market: MarketId): NewsItem[] {
  const m = getMarket(world, market);
  return m.news
    .filter((n) => n.month >= m.month - 1)
    .slice()
    .sort((a, b) => Math.abs(b.starDelta) - Math.abs(a.starDelta) || b.month - a.month)
    .slice(0, 5);
}

export function leaderboards(world: World, market: MarketId) {
  const companies = Object.values(world.companies).filter(
    (c) => c.market === market && c.status === 'active',
  );
  const players = Object.values(world.players).filter((p) => p.market === market);
  return {
    fastestGrowing: companies
      .filter((c) => c.finance.history.length >= 3 && (lastPnl(c)?.revenue ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        ai: c.ai,
        value: Math.round(monthlyGrowth(c) * 1000) / 10,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    highestStars: players
      .map((p) => ({
        id: p.id,
        name: p.name,
        ai: p.ai,
        role: p.role,
        value: round1(p.stars.value),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    topInvestors: players
      .filter((p) => p.role === 'investor')
      .map((p) => {
        const r = trackRecord(world, [p.id, ...(p.investor?.fundId ? [p.investor.fundId] : [])]);
        return { id: p.id, name: p.name, ai: p.ai, value: r.returned, deals: r.deals };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  };
}

export function portfolio(world: World, p: Player) {
  const holders = [p.id, ...(p.investor?.fundId ? [p.investor.fundId] : [])];
  return Object.values(world.positions)
    .filter((x) => holders.includes(x.investorId))
    .map((x) => {
      const c = world.companies[x.companyId]!;
      const mark = c.status === 'active' ? markValue(c.capTable, x.investorId) : 0;
      return {
        companyId: c.id,
        name: c.name,
        currency: getMarket(world, c.market).data.currency,
        status: c.status,
        stars: round1(c.stars.value),
        via: x.investorId === p.id ? 'personal' : 'fund',
        invested: x.invested,
        returned: x.returned,
        mark,
        ownershipPct: Math.round(ownership(c.capTable, x.investorId) * 1000) / 10,
        writtenOff: x.writtenOff,
        onBoard: c.board.includes(x.investorId),
        founders: c.founderIds.map((id) => ({ id, name: world.players[id]?.name ?? '—' })),
      };
    });
}

/**
 * The market's AI lenders and products (Wave 1), with what each would mean
 * for the viewer: eligible, how much, or exactly why not. Company products
 * are quoted for the viewer's first active company in this market.
 */
function lendersView(world: World, p: Player, m: MarketState) {
  const company =
    p.companyIds
      .map((id) => world.companies[id])
      .find((c) => c && c.status === 'active' && c.market === m.id) ?? null;
  return Object.values(m.lenders ?? {}).map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    appetite: appetiteLabel(l.appetite),
    look: l.look,
    products: l.products.map((pr) => {
      const q =
        pr.borrower === 'founder'
          ? founderQuote(world, m, l, pr, p)
          : companyQuote(world, m, l, pr, company);
      return {
        id: pr.id,
        kind: pr.kind,
        label: pr.label,
        borrower: pr.borrower,
        pitch: pr.pitch,
        termMonths: pr.termMonths,
        guarantee: pr.guarantee,
        /** What it costs today: base + spread, or fixed. Revenue-based: the flat fee (1000 = repay 1.1×). */
        rateBps: productRateBps(m, pr),
        ...(pr.revenueShareBps !== undefined ? { revenueShareBps: pr.revenueShareBps } : {}),
        amount: productAmount(world, m, pr),
        you: {
          eligible: q.eligible,
          reason: q.reason,
          maxMinor: q.maxMinor,
          companyId: q.companyId,
        },
      };
    }),
  }));
}

/**
 * A city as the player sees it: the home market (`view.market`) or the one
 * they're physically in (`view.here`, Wave 4), same shape.
 */
type ViewClock = { now: number; monthMs: number };

function marketView(
  world: World,
  p: Player,
  m: MarketState,
  founderish: boolean,
  clock?: ViewClock,
) {
  return {
    id: m.id,
    name: m.data.name,
    country: m.data.country,
    currency: m.data.currency,
    timeZone: m.data.timeZone,
    month: m.month,
    date: gameDate(m.month),
    unitsPerUsd: m.data.unitsPerUsd,
    fxFeeBps: m.data.fxFeeBps,
    baseRateBps: m.data.baseRateBps,
    tax: m.data.tax,
    costOfLiving: m.data.costOfLiving * 100,
    climate: Math.round(m.climate * 100) / 100,
    economicNote: m.economicNote,
    bankName: m.bankName,
    depositInsurance: m.data.depositInsurance * 100,
    floorGig: { pay: m.data.floorGig.pay * 100, hours: m.data.floorGig.hours },
    sources: m.data.sources,
    segments: Object.values(m.segments).map((s) => ({
      key: s.key,
      industry: s.industry,
      name: s.name,
      kind: s.kind,
      buyers: s.buyers,
      budget: s.budget,
      needsLabel: s.needsLabel,
      incumbentName: s.incumbentName,
      incumbentShare: Math.round((s.incumbentCustomers / Math.max(1, s.buyers)) * 100),
      salesCycle: s.salesCycle,
    })),
    outlets: m.outlets,
    funds: Object.values(world.funds)
      // Home funds, plus funds in a market you're visiting this month (§14).
      .filter((f) => f.market === m.id || isVisiting(world, p, f.market))
      .map((f) => ({
        id: f.id,
        name: f.name,
        market: f.market,
        marketName: getMarket(world, f.market).data.name,
        currency: getMarket(world, f.market).data.currency,
        partner: f.partner,
        ai: f.ai,
        sectors: f.sectors,
        stages: f.stages,
        check: f.check,
        minStars: f.minStars,
        thesis: f.thesis,
        mood: f.mood > 1.1 ? 'hungry' : f.mood < 0.9 ? 'cautious' : 'steady',
        /** City art: deterministic from the fund id. */
        office: fundOffice(f.id),
        /** Wave 5: angel, VC, impact or corporate. */
        type: fundInvestorType(f),
        /** AI angel funds (Wave 3): the person behind the cheque; null for other funds. */
        angel: f.angelId
          ? { playerId: f.angelId, name: world.players[f.angelId]?.name ?? f.partner }
          : null,
      })),
    lenders: lendersView(world, p, m),
    capital: {
      vcDepth: CAPITAL[m.id].vcDepth,
      angelDepth: CAPITAL[m.id].angelDepth,
      schemes: CAPITAL[m.id].schemes,
      sources: CAPITAL[m.id].sources,
    },
    talent: founderish ? m.talent : [],
    /** B2B marketplace listings in your market (§6). */
    /** Player banks in this market (§8), for depositors and borrowers. */
    banks: Object.values(world.banks)
      .filter((b) => b.market === m.id && b.status === 'licensed')
      .map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type,
        typeLabel: BANK_TYPES[b.type].label,
        owner: world.players[b.ownerId]?.name ?? '',
        stars: round1(b.stars.value),
        depositRateBps: b.policy.depositRateBps,
        loanSpreadPp: b.policy.loanSpreadPp,
        accountFee: b.policy.accountFee,
        rating: b.reviews.count ? Math.round((b.reviews.sum / b.reviews.count) * 10) / 10 : null,
        lends: {
          people: BANK_TYPES[b.type].personal,
          companies: BANK_TYPES[b.type].companies,
          advisory: BANK_TYPES[b.type].advisory,
        },
      })),
    bankTypes: Object.entries(BANK_TYPES).map(([id, t]) => ({
      id,
      ...t,
      minCapital: Math.round(m.data.costOfLiving * 100 * t.minCapitalCol),
    })),
    listings: Object.values(world.listings)
      .filter(
        (l) => l.market === m.id && l.active && world.companies[l.companyId]?.status === 'active',
      )
      .map((l) => {
        const seller = world.companies[l.companyId]!;
        return {
          ...l,
          seller: seller.name,
          sellerAi: seller.ai,
          sellerStars: round1(seller.stars.value),
          uptime: Math.round(reliability(seller) * 100),
          rating: l.reviews.count ? Math.round((l.reviews.sum / l.reviews.count) * 10) / 10 : null,
          marketRate: marketRate(world, seller),
        };
      }),
    /** City events (Wave 2): upcoming, and held or cancelled recently. */
    events: eventsView(world, p, m.id, m.month, clock),
    /** Local businesses (Wave 3): open ones, and those closed in the last few months. */
    businesses: businessesView(world, p, m),
    /** Part-time jobs at open businesses (Wave 5): 40 hours a month, paid monthly. */
    jobs: jobsView(p, m),
    /** Furniture and cars with prices in this city's currency (Wave 5). */
    shop: shopView(m),
    /** The city economy at a glance (Wave 3). */
    economy: economyView(m),
    /**
     * Wave 5 (section B): accelerators, devPartners, lps, dealFlow, angelsAt
     * (businessId → AI angel ids there this period), angels, centralBank.
     */
    ...capitalProgramsView(world, p, m),
    eventKinds: EVENT_KINDS.map((kind) => {
      const k = EVENT_KIND_DATA[kind];
      return {
        kind,
        label: k.label,
        description: k.description,
        /** Hosting at the Event Hall, before any budget (minor units). */
        cost: eventCost(m, kind, 'hall'),
        hoursHost: k.hoursHost,
        /** Wave 5: going to an event costs the ticket only, no hours. */
        hoursAttend: 0,
        capacity: k.capacity,
        who: k.who,
      };
    }),
  };
}

/** Everything the client needs to render a player's game, in one payload. */
export function playerView(
  world: World,
  playerId: Id,
  /** The server's clock, for the month countdown (`view.clock`; null without it). */
  clock?: { now: number; monthMs: number },
) {
  const p = world.players[playerId];
  if (!p) return null;
  const m = getMarket(world, p.market);
  const hereId = locationOf(p);
  const acc = (id: Id | undefined) =>
    id
      ? {
          id,
          currency: world.accounts[id]!.currency,
          balance: world.accounts[id]!.balance,
          recent: world.accounts[id]!.recent,
          bankId: world.accounts[id]!.bankId ?? null,
          bankName: world.accounts[id]!.bankId
            ? (world.banks[world.accounts[id]!.bankId!]?.name ?? null)
            : null,
        }
      : null;
  const myCompanies = p.companyIds.map((id) => world.companies[id]!).filter(Boolean);
  const founderish = p.role === 'founder' || myCompanies.length > 0;
  const homeView = marketView(world, p, m, founderish, clock);
  const fund = p.investor?.fundId ? world.funds[p.investor.fundId] : undefined;
  const others = Object.values(world.companies).filter(
    // Your market, plus any market you've travelled to (§14).
    (c) =>
      (c.market === p.market || p.visited[c.market] !== undefined) && !c.founderIds.includes(p.id),
  );
  return {
    worldVersion: world.version,
    /** The month clock (Wave 4): when the next settlement is due, for a countdown. */
    clock: clock ? clockView(clock.now, clock.monthMs) : null,
    /** One-way flights from where you are (Wave 4): fares in your home currency, minor units. */
    flights: flightsView(world, p),
    me: {
      id: p.id,
      handle: p.handle,
      name: p.name,
      role: p.role,
      background: BACKGROUNDS.find((b) => b.id === p.backgroundId),
      market: p.market,
      skills: p.skills,
      network: p.network,
      stars: round1(p.stars.value),
      starHistory: p.stars.history,
      publicWarning: hasPublicWarning(p.stars),
      hours: { available: p.hours.available, used: p.hours.used, left: hoursLeft(p) },
      energy: Math.round(p.energy),
      burnout: p.burnout,
      lifestyle: { ...tierOf(p), monthlyCost: lifestyleCost(world, p) },
      credit: { ...p.credit, ...creditProfile(world, p) },
      loans: p.loans,
      milestones: p.milestones,
      investor: p.investor ?? null,
      /** Wave 5: angel, VC, impact or corporate; null for non-investors. */
      investorType: playerInvestorType(world, p),
      failures: p.failures,
      visited: p.visited,
      /** Where you are (Wave 4): null at home. */
      location: p.location
        ? {
            market: p.location.market,
            name: getMarket(world, p.location.market).data.name,
            sinceAt: p.location.since,
          }
        : null,
      /** Where you can go, and what a trip costs from here (§14). */
      destinations: (Object.keys(world.markets) as MarketId[])
        .filter((id) => id !== p.market)
        .map((id) => ({
          id,
          name: getMarket(world, id).data.name,
          tripCost: usdToLocal(world, m, tripCostUsd(p.market, id)),
          visitingNow: p.visited[id] === m.month,
        })),
      lastMonth: p.lastMonth,
      gigsThisMonth: p.gigsThisMonth,
      /** Wave 5: null for saved players who never chose (the client keeps its avatar). */
      gender: p.gender ?? null,
      /** Wave 5: your part-time job, or null. */
      job: myJobView(world, p),
      /** Wave 5: your furniture and how comfortable home is (0–100). */
      home: myHomeView(p),
      /** Wave 5: your car, or null. */
      car: carView(world, p),
      /** Wave 5: status (0–100) from your home, car and lifestyle, shown on your profile. */
      status: statusOf(p),
      /** People met at events (Wave 2), newest first; warmth fades with time. */
      contacts: (p.contacts ?? []).slice(0, CONTACTS_VIEW_LIMIT).map((c) => ({
        ...c,
        warmth: Math.round(contactWarmth(c, m.month) * 100) / 100,
      })),
    },
    accounts: { local: acc(p.accounts.local), usd: acc(p.accounts.usd) },
    bank: ownBankView(world, p.id),
    market: homeView,
    /** The city you're physically in (Wave 4): same shape as `market`; your home city unless you've flown. */
    // Only when away: at home the client uses `market`, so the city isn't sent twice.
    here:
      hereId === m.id ? null : marketView(world, p, getMarket(world, hereId), founderish, clock),
    lifestyleTiers: LIFESTYLE_TIERS.map((t) => ({
      ...t,
      monthlyCost: Math.round(m.data.costOfLiving * 100 * t.costCol),
    })),
    companies: myCompanies.map((c) => {
      const plan = c.status === 'active' ? rescuePlan(world, c, playerId) : null;
      return {
        ...companyDetail(world, c),
        /** Why last month went the way it did (Wave 1). */
        story: c.story ?? null,
        /** The rescue plan; null when the company isn't in distress. */
        rescue: plan && plan.level ? plan : null,
        hibernating: !!c.hibernation,
        officeDownsized: !!c.officeDownsized,
        /** Local businesses buying from this company (Wave 3), with last month's amount. */
        businessCustomers: businessCustomersOf(world, c),
      };
    }),
    fund: fund
      ? {
          ...fund,
          record: trackRecord(world, [fund.id]),
          cash: world.accounts[fund.account]!.balance,
        }
      : null,
    directory: others.map((c) => ({
      ...publicCompany(world, c),
      diligence: diligenceView(world, c, p.diligence[c.id] ?? 0),
    })),
    /**
     * People in your market: human players, plus the AI angels still investing
     * (Wave 3; `ai: true`, role 'investor', `angel` names their fund). AI angels
     * can't chat or take pitches in person: pitch their fund instead.
     */
    players: Object.values(world.players)
      .filter(
        (x) =>
          x.id !== p.id &&
          x.market === p.market &&
          (!x.ai || (x.angel !== undefined && x.angel.retiredMonth === undefined)),
      )
      .map((x) => ({
        id: x.id,
        handle: x.handle,
        name: x.name,
        role: x.role,
        ai: x.ai,
        backgroundId: x.backgroundId,
        stars: round1(x.stars.value),
        companies: x.companyIds.map((id) => world.companies[id]?.name).filter(Boolean),
        /** Your trust with them, built only through real interactions (§13). */
        trust: Math.round((p.trust[x.id] ?? 0) * 100) / 100,
        angel: x.angel
          ? {
              fundId: x.angel.fundId,
              fundName: world.funds[x.angel.fundId]?.name ?? '',
              sectors: world.funds[x.angel.fundId]?.sectors ?? 'any',
              check: world.funds[x.angel.fundId]?.check ?? [0, 0],
            }
          : null,
      })),
    deals: Object.values(world.deals)
      .filter((d) => d.market === p.market)
      .map((d) => dealView(world, d, p.id))
      .filter(
        (d) =>
          d.yourTurn ||
          d.youProposed ||
          myCompanies.some((c) => c.id === d.companyId) ||
          (d.counterparty.kind === 'player' && d.counterparty.id === p.id) ||
          (d.counterparty.kind === 'playerbank' &&
            world.banks[d.counterparty.id]?.ownerId === p.id),
      )
      .sort((a, b) => b.createdMonth - a.createdMonth)
      .slice(0, 40),
    pitches: Object.values(world.pitches)
      .filter((x) => x.founderId === p.id || x.investorPlayerId === p.id)
      .map((x) => ({
        ...x,
        companyName: world.companies[x.companyId]?.name ?? '',
        fundName: x.fundId
          ? world.funds[x.fundId]?.name
          : x.investorPlayerId
            ? world.players[x.investorPlayerId]?.name
            : '',
        // Hide the truth behind each option; players only see the labels.
        questions: x.questions.map((q) => ({
          ...q,
          options: q.options.map(({ truth: _t, claim: _c, ...o }) => o),
        })),
      }))
      .sort((a, b) => b.month - a.month)
      .slice(0, 30),
    media: Object.values(world.media)
      .filter((x) => x.playerId === p.id)
      .sort((a, b) => b.month - a.month)
      .slice(0, 20),
    inbox: world.inbox[p.id] ?? [],
    news: m.news.slice(0, 40),
    digest: digest(world, m.id),
    leaderboards: leaderboards(world, m.id),
    portfolio: portfolio(world, p),
    record: trackRecord(world, [p.id]),
    votes: Object.values(world.votes)
      .filter((v) => {
        const mine = (h: string) => h === p.id || world.funds[h]?.managerId === p.id;
        return Object.keys(v.weights).some(mine) || p.companyIds.includes(v.companyId);
      })
      .sort((a, b) => b.createdMonth - a.createdMonth)
      .slice(0, 20)
      .map((v) => {
        const myHolders = Object.keys(v.weights).filter(
          (h) => h === p.id || world.funds[h]?.managerId === p.id,
        );
        const tally = (b: 'yes' | 'no') =>
          Math.round(
            Object.entries(v.ballots)
              .filter(([, x]) => x === b)
              .reduce((a, [h]) => a + (v.weights[h] ?? 0), 0) * 1000,
          ) / 10;
        return {
          id: v.id,
          companyId: v.companyId,
          targetIsMe: v.targetId === p.id,
          kind: v.kind,
          reason: v.reason,
          status: v.status,
          companyName: world.companies[v.companyId]?.name ?? '',
          deadlineMonth: v.deadlineMonth,
          canVote: v.status === 'open' && myHolders.length > 0,
          myBallot: myHolders.map((h) => v.ballots[h]).find(Boolean) ?? null,
          yesPct:
            v.kind === 'sale'
              ? tally('yes')
              : Object.values(v.ballots).filter((b) => b === 'yes').length,
          noPct:
            v.kind === 'sale'
              ? tally('no')
              : Object.values(v.ballots).filter((b) => b === 'no').length,
          weighting: v.kind === 'sale' ? 'shares' : 'seats',
        };
      }),
    disputes: Object.values(world.disputes)
      .filter(
        (d) =>
          d.claimantId === p.id ||
          (world.contracts[d.refId] && p.companyIds.includes(world.contracts[d.refId]!.buyerId)) ||
          p.companyIds.includes(d.refId),
      )
      .sort((a, b) => b.filedMonth - a.filedMonth)
      .slice(0, 20),
  };
}

const CONTACTS_VIEW_LIMIT = 50;

function eventsView(
  world: World,
  viewer: Player,
  market: MarketId,
  month: number,
  clock?: ViewClock,
) {
  return Object.values(world.events ?? {})
    .filter(
      (e) =>
        e.market === market && (e.status === 'upcoming' || month - e.month <= EVENT_RECENT_MONTHS),
    )
    .sort((a, b) =>
      a.status === 'upcoming' && b.status === 'upcoming'
        ? a.month - b.month
        : a.status === 'upcoming'
          ? -1
          : b.status === 'upcoming'
            ? 1
            : b.month - a.month,
    )
    .map((e) => {
      const host = world.players[e.hostId];
      return {
        id: e.id,
        kind: e.kind,
        kindLabel: EVENT_KIND_DATA[e.kind].label,
        title: e.title,
        host: { id: e.hostId, name: host?.name ?? '' },
        venue: e.venue,
        /** A local hotel or event venue hosting it (Wave 3). */
        business: e.businessId
          ? {
              id: e.businessId,
              name: world.markets[e.market]?.businesses?.[e.businessId]?.name ?? '',
            }
          : null,
        month: e.month,
        dateLabel: gameDate(e.month).label,
        capacity: e.capacity,
        /** Humans going, host included. */
        going: e.attendees.length + 1,
        ticket: e.ticket,
        segmentKey: e.segmentKey ?? null,
        status: e.status,
        youHost: e.hostId === viewer.id,
        youGoing: e.attendees.includes(viewer.id),
        /** Spent on broadcasting it (Wave 5), local minor units. */
        broadcast: e.broadcast ?? 0,
        /** AI guests by name: RSVPs so far, or who came (Wave 5). */
        attendeesAi: attendeesAi(world, e, clock),
        outcome: e.outcome
          ? {
              summary: e.outcome.summary,
              /** Contacts you made there (or everyone's, if you weren't there). */
              contacts:
                e.outcome.contacts[viewer.id] ??
                Object.values(e.outcome.contacts).reduce((a, b) => a + b, 0),
            }
          : null,
      };
    });
}

export type PlayerView = NonNullable<ReturnType<typeof playerView>>;

/** The bank a player runs, with its regulatory figures (§8). */
export function ownBankView(world: World, playerId: Id) {
  const b = Object.values(world.banks)
    .filter((x) => x.ownerId === playerId)
    .sort((a, c) => c.appliedMonth - a.appliedMonth)[0];
  if (!b) return null;
  const m = getMarket(world, b.market);
  const f = bankFigures(world, b);
  const loans = [
    ...Object.values(world.companies).flatMap((c) =>
      c.finance.loans
        .filter((l) => l.lenderBankId === b.id)
        .map((l) => ({
          borrower: c.name,
          outstanding: l.outstanding,
          rateBps: l.rateBps,
          monthsLeft: l.monthsLeft,
        })),
    ),
    ...Object.values(world.players).flatMap((p) =>
      p.loans
        .filter((l) => l.lenderBankId === b.id)
        .map((l) => ({
          borrower: p.name,
          outstanding: l.outstanding,
          rateBps: l.rateBps,
          monthsLeft: l.monthsLeft,
        })),
    ),
  ];
  return {
    ...b,
    typeLabel: BANK_TYPES[b.type].label,
    figures: f,
    minCapitalRatio: MIN_CAPITAL_RATIO,
    minCapital: Math.round(m.data.costOfLiving * 100 * BANK_TYPES[b.type].minCapitalCol),
    licenceDueMonth: b.appliedMonth + 2,
    stars: round1(b.stars.value),
    depositors: Object.values(world.accounts).filter((a) => a.bankId === b.id).length,
    loanBook: loans,
  };
}

/** Internal game-economy dashboard (§20 "Running the live game"). Not for players. */
export function economyDashboard(world: World) {
  const byCurrency: Record<
    string,
    { players: number; companies: number; funds: number; external: number }
  > = {};
  for (const a of Object.values(world.accounts)) {
    const row = (byCurrency[a.currency] ??= { players: 0, companies: 0, funds: 0, external: 0 });
    if (a.external) row.external += a.balance;
    else if (Object.values(world.companies).some((c) => c.account === a.id))
      row.companies += a.balance;
    else if (Object.values(world.funds).some((f) => f.account === a.id)) row.funds += a.balance;
    else row.players += a.balance;
  }
  const companies = Object.values(world.companies);
  const starBuckets = [0, 0, 0, 0, 0, 0];
  for (const p of Object.values(world.players))
    starBuckets[Math.min(5, Math.floor(p.stars.value))]! += 1;
  return {
    version: world.version,
    moneySupply: byCurrency,
    companies: {
      active: companies.filter((c) => c.status === 'active').length,
      shutdown: companies.filter((c) => c.status === 'shutdown').length,
      acquired: companies.filter((c) => c.status === 'acquired').length,
      survivalRate: companies.length
        ? Math.round(
            (companies.filter((c) => c.status !== 'shutdown').length / companies.length) * 100,
          )
        : 100,
    },
    starDistribution: starBuckets,
    humans: Object.values(world.players).filter((p) => !p.ai).length,
    markets: Object.values(world.markets).map((m) => ({
      id: m.id,
      month: m.month,
      climate: m.climate,
      lastSettledDate: m.lastSettledDate,
    })),
  };
}
