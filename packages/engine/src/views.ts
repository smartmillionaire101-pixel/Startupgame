import { applicationView, inSetup, setupView } from './setup.js';
import { careerView } from './career.js';
import { bankerView } from './bankers.js';
import { exchangeView } from './exchange.js';
import { syndicatesView } from './syndicates.js';
import { lpFundsView } from './lpfunds.js';
import { firmView } from './firms.js';
import { familyOfficeView, investorStakesView, stakeConsentsView } from './allocation.js';
import { dealCraftView, offerComparisonView, redFlags, reviewableView } from './dealcraft.js';
import { investorDealFlowView } from './dealflow.js';
import { investorGuideView } from './investorguide.js';
import { bankWorkView } from './bankwork.js';
import { acceleratorView, hallOfFame } from './institutions.js';
import { positionStatus, proRataView } from './fundops.js';
import { barEffects, barsOf } from './lifebars.js';
import { feedbackOn, gameplayOn, investorOn, lifeBarsOn, placesOn, shopOn } from './releases.js';
import { homeStyleView } from './homestyle.js';
import { shopCatalogView } from './catalog.js';
import { cityPlacesView } from './places.js';
import { errandsView } from './errands.js';
import { anyJobView, workView } from './work.js';
import { pitchQuestionsNow } from './fundraising.js';
import { meetingView } from './pitchmeeting.js';
import { journeyView } from './journey.js';
import { exitOptionsView, publicMarketView, secondaryOffersView } from './exits.js';
import { stockExchangesView } from './stocks.js';
import { allocatorView } from './allocator.js';
import { wealthView } from './wealth.js';
import { firstSessionView } from './firstsession.js';
import { recapView } from './recap.js';
import { decisionsView } from './decisions.js';
import { rivalsView } from './rivals.js';
import { roadmapView } from './roadmap.js';
import { salesWithTalk } from './salestalk.js';
import { interviewsView } from './customer-interviews.js';
import { founderGuide, founderPlanBase } from './founderguide.js';
import { hiringView, teamView } from './hiring.js';
import { founderFinanceView, friendsRoundsView } from './founderfinance.js';
import { livingView } from './living.js';
import { bowlingOptions, golfMatchOptions, myPlayRoom, playInvites, playView } from './play.js';
import { gamesView } from './games.js';
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
import {
  companyRunway,
  defaultAlive,
  forwardRunway,
  monthlyCosts,
  payrollThisMonth,
  projectedBurn,
} from './company.js';
import { rescuePlan } from './rescue.js';
import { spendRate } from './ledger.js';
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
import {
  cityHotelsView,
  flightsView,
  hotelList,
  hotelOptions,
  isVisiting,
  tripCostUsd,
} from './travel.js';
import {
  CONTACTS_LIMIT,
  EVENT_KINDS,
  EVENT_KIND_DATA,
  EVENT_RECENT_MONTHS,
} from './data/events.js';
import { chatIdOf } from './people.js';
import { contactWarmth, eventCost } from './events.js';
import { businessCustomersOf, businessesView, economyView, jobsView } from './economy.js';
import { customerFacts, payingCustomers } from './traction.js';
import { bringsOf, teamBringsView } from './team.js';
import { introsView } from './intros.js';
import { restView } from './rest.js';
import { carView, homeView as myHomeView, shopView, statusOf } from './shop.js';
import { golfView, mallView } from './leisure.js';
import { mallTripView } from './malltrips.js';
import { wardrobeView } from './wardrobe.js';
import { deliveryView, homeActsView, moodOf, needsOf } from './needs.js';
import { hangoutsView, sendLimits, techEventsView, visitingView, visitsView } from './social.js';
import { holidaysView } from './holidays.js';
import { marketRate, playerRevenueShare } from './marketplace.js';
import { myPropertiesView, netWorth, propertiesView, residenceView } from './property.js';
import {
  cityBranchesView,
  cityOfficesView,
  companyBranchesView,
  companyDistrict,
} from './branches.js';
import { competitionsView } from './competitions.js';
import { stableDistrict } from './districts.js';
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
  isEstablished,
} from './helpers.js';
import { floorGigPay, lifestyleCost, tierOf } from './personal.js';
import { hasPublicWarning } from './stars.js';
import { isOverloaded, managementCapacity } from './staff.js';
import { statementPreview } from './statement.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type { MarketId } from './data/markets.js';
import type { Company, DealCard, Id, MarketState, NewsItem, Player, World } from './types.js';

const roundHours = (h: number) => Math.round(h * 100) / 100;

const round1 = (x: number) => Math.round(x * 10) / 10;
const finite = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

function publicCompany(world: World, c: Company) {
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
    // Play-test (FEEDBACK_NOTE): a listed company isn't raising a private round.
    raising: c.raising && !(feedbackOn(world) && c.ipo?.status === 'listed'),
    teamSize: c.staff.length + c.founderIds.length,
    founders: c.founderIds.map((id) => ({
      id,
      name: world.players[id]?.name ?? '—',
      ai: world.players[id]?.ai ?? true,
    })),
    ageMonths: getMarket(world, c.market).month - c.foundedMonth,
    forSale: c.forSale,
    /** Wave 10: the district of its head office. */
    district: companyDistrict(c),
  };
}

/** What an investor can see after diligence (depth 1: numbers; depth 2: the skeletons). */
function diligenceView(world: World, c: Company, depth: number) {
  if (depth <= 0) return null;
  const pnl = lastPnl(c);
  const base = {
    revenue: pnl?.revenue ?? 0,
    customers: payingCustomers(world, c),
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
    /** Investor career Phase 8: red flags deep diligence finds in company state. */
    redFlags: redFlags(world, c),
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

/** Next month's bill against today's cash and last month's revenue (see `nextMonth`). */
function nextMonthOf(world: World, c: Company) {
  const cash = world.accounts[c.account]!.balance;
  const costs = monthlyCosts(world, c);
  const salaries = payrollThisMonth(c) + c.founderSalary * c.founderIds.length;
  const revenue = lastPnl(c)?.revenue ?? 0;
  const unpaid = c.finance.unpaidPayroll;
  return {
    costs: costs + unpaid,
    salaries: salaries + unpaid,
    revenue,
    cash,
    short: Math.max(0, costs + unpaid - cash - revenue),
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
    // How long the money lasts and the net burn at next month's real costs
    // (rent and payroll count from the month they're committed), not last
    // months' average: a company that has just leased or hired sees it at once.
    runwayMonths: finite(forwardRunway(world, c)),
    defaultAlive: defaultAlive(world, c),
    monthlyRevenue: lastPnl(c)?.revenue ?? 0,
    burn: Math.max(0, projectedBurn(world, c)),
    /** What a month costs at today's settings (rent, salaries, marketing, cloud, loans). */
    spending: monthlyCosts(world, c),
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
        /** Customers won in the Sales pipeline in this segment (paying, beside the funnel's). */
        accounts: (c.salesAccounts ?? []).filter((a) => a.segmentKey === key).length,
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
    /** Founder Journey 2a: the per-deal sales pipeline (view.company.sales). */
    sales: salesWithTalk(world, c),
    /** Feedback note: customer interviews at the Market (null before it). */
    interviews: feedbackOn(world) ? interviewsView(world, c) : null,
    /** Founder guidance: the stage tracker, and what the live pricing checks stand on. */
    guide: founderGuide(world, c),
    planBase: founderPlanBase(world, c),
    /** Real paying customers and how well the founder knows them (traction.ts). */
    traction: customerFacts(world, c),
    /** Founder Journey 6: the café idea, the first up-front payment and small expenses. */
    ...firstSessionView(world, c),
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
    /** Investor career Phase 8: red flags deep diligence finds in company state. */
    redFlags: redFlags(world, c),
    warnings: c.warnings,
    pivots: c.pivots,
    /** The product roadmap (§6.3): projects, feedback inbox and the feature catalogue. */
    roadmap: roadmapView(world, c),
    /** Team health (§6.4): workload, retention risk and missing skills. */
    team: teamView(world, c),
    /** The hiring pipeline and the AI co-founders on offer (§6.4). */
    hiring: hiringView(world, c),
    /** Available vs reserve, burn and runway in plain terms, founder loans, balance sheet (§7.4). */
    founderFinance: founderFinanceView(world, c),
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
            : p.kind === 'syndicate'
              ? world.syndicates?.[p.id]?.name
              : p.id;
  const mine = (p: DealCard['proposer']) =>
    (p.kind === 'player' && p.id === viewerId) ||
    (p.kind === 'fund' && world.funds[p.id]?.managerId === viewerId) ||
    (p.kind === 'company' && !!world.companies[p.id]?.founderIds.includes(viewerId)) ||
    (p.kind === 'playerbank' && world.banks[p.id]?.ownerId === viewerId) ||
    (p.kind === 'syndicate' && world.syndicates?.[p.id]?.leadId === viewerId);
  return {
    ...rest,
    companyName: c?.name ?? 'Personal',
    currency: getMarket(world, d.market).data.currency,
    proposerName: name(d.proposer) ?? '',
    counterpartyName: name(d.counterparty) ?? '',
    yourTurn: d.status === 'open' && mine(d.awaiting),
    youProposed: mine(d.proposer),
    /** Founder setup: a startup loan application's plan and the bank-side checks. */
    application: applicationView(world, d),
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
  // Startups only: the city's established listed companies are on the exchange.
  const companies = Object.values(world.companies).filter(
    (c) => c.market === market && c.status === 'active' && !isEstablished(c),
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

function portfolio(world: World, p: Player) {
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
        /**
         * Play-test: a SAFE owns no shares until it converts, so its stake read 0%.
         * The stake it converts to at most, at its cap (amount ÷ post-money cap).
         */
        safePct:
          Math.round(
            c.capTable.safes
              .filter((s) => s.holderId === x.investorId)
              .reduce((a, s) => a + s.amount / Math.max(1, s.cap), 0) * 1000,
          ) / 10,
        writtenOff: x.writtenOff,
        /** Investor career: (cash back + mark) ÷ invested, the mark history and a status. */
        moic: x.invested > 0 ? Math.round(((x.returned + mark) / x.invested) * 100) / 100 : 0,
        history: (x.marks ?? []).map((k) => k.value),
        statusLabel: positionStatus(world, c.id, x.writtenOff),
        proRata: !!x.proRata,
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

function spendHereView(world: World, p: Player, hereId: MarketId) {
  const mine = world.accounts[p.accounts.local];
  const currency = getMarket(world, hereId).data.currency;
  if (!mine || mine.currency === currency) return null;
  return { from: mine.currency, currency, rate: spendRate(world, mine.currency, currency) };
}

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
    floorGig: { pay: floorGigPay(m), hours: m.data.floorGig.hours },
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
        /** Wave 10: the district its office is in (spread across the city). */
        district: stableDistrict(f.market, 'fund', f.id),
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
    /** Wave 7: food delivery (the Chop app): open food businesses, cheapest first (up to 20). */
    delivery: deliveryView(world, m),
    /** Wave 8: the city's tech events: this month's ("on") and next month's ("soon"). */
    techEvents: techEventsView(world, p, m, clock?.now),
    /** The city economy at a glance (Wave 3). */
    economy: economyView(m),
    /** Wave 10: the property market: price index, and every home (for sale or owned). */
    properties: propertiesView(world, p, m),
    /** Wave 10: open company branches in this city (for the map). */
    branches: cityBranchesView(world, p, m),
    /** Wave 10: where each active company has its head office (district, for the map). */
    offices: cityOfficesView(world, m),
    /** Wave 10: pitch competitions here: this month's and recent ones. */
    competitions: competitionsView(world, p, m),
    /**
     * Wave 5 (section B): accelerators, devPartners, lps, dealFlow, angelsAt
     * (businessId → AI angel ids there this period), angels, centralBank.
     */
    ...capitalProgramsView(world, p, m),
    /**
     * City places (after their release note): the city's named buildings,
     * whether you may go in (and why not), your appointment, and what you
     * can do inside. Null in worlds without the note.
     */
    cityPlaces: placesOn(world) ? cityPlacesView(world, p, m, clock?.now ?? p.lastActiveAt) : null,
    /**
     * Feedback round: the city's named hotels, each in its district (for the
     * map), priced by the night in your home currency. Null without the note.
     */
    hotels: cityHotelsView(world, p, m.id),
    /** Errands (feedback note): what you can do at businesses and spots here. Null before it. */
    errands: errandsView(world, p, m, clock?.now ?? p.lastActiveAt),
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
          // Old shape, for screens that list a few raw lines.
          recent: world.accounts[id]!.recent.slice(0, 30).map((r) => ({
            month: r.month,
            amount: r.amount,
            memo: r.memo,
          })),
          /** The latest statement lines (running balance, other party, receipt ref). */
          statement: statementPreview(world, p, id),
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
    // (Startups: the city's established listed companies are on the exchange.)
    (c) =>
      (c.market === p.market || p.visited[c.market] !== undefined) &&
      !c.founderIds.includes(p.id) &&
      !isEstablished(c),
  );
  return {
    worldVersion: world.version,
    /** The founder journey: seven chapters and the objective prompts; null for other roles. */
    journey: journeyView(world, p),
    /**
     * The investor career (investor-career worlds; null otherwise): the ladder
     * with each rung's requirements, invitations, the angel ceiling, the
     * investment tracks, the first session and three prompts.
     */
    investorCareer: careerView(world, p),
    /** The investor guide: stage tracker, checklist and next step, mentor and scored decisions. */
    investorGuide: investorGuideView(world, p),
    /** Bankers note: the negotiation, the licence tracker and checklist, and the first session. */
    banker: bankerView(world, p, clock?.now ?? p.lastActiveAt),
    /** Investor career Phase 2: every city's exchange, the index fund, your holdings and orders. */
    exchange: exchangeView(world, p),
    /** Investor career Phase 3: syndicates you lead, backed, or can back. */
    syndicates: syndicatesView(world, p),
    /** Investor career Phase 4: funds you run (LP book), funds you can join, your calls. */
    lpFunds: lpFundsView(world, p),
    /** Investor career Phase 6: your firm (team, carry pool, funds, stars) and invitations. */
    firm: firmView(world, p),
    /** Investor career Phase 7: the family office (every track), LP stake offers, LPAC votes, secondaries. */
    familyOffice: familyOfficeView(world, p),
    stakeConsents: investorOn(world) ? stakeConsentsView(world, p) : [],
    /** Investor career Phase 8: the pipeline, reputation, reviews and the monthly recap. */
    dealCraft: dealCraftView(world, p),
    /** Deal-flow note: pitches heard at events, investors met, lessons, LP panel feedback. */
    investorDealFlow: investorDealFlowView(world, p),
    /** Investor career Phase 8: for founders, the human investors you can review. */
    reviewable: reviewableView(world, p),
    offerComparison: offerComparisonView(world, p),
    /** Investor career Phase 9: your accelerator, and the hall of fame across every city. */
    playerAccelerator: acceleratorView(world, p),
    hallOfFame: hallOfFame(world),
    /** Investor career Phase 5: pro-rata offers from portfolio companies raising again. */
    prorata: investorOn(world) && !p.ai ? proRataView(world, p) : [],
    /** The month recap (Founder Journey 4b): this month's money, company, people and what's next. */
    recap: p.ai ? null : recapView(world, p.id),
    /** Founder Journey 4a: decision events waiting for you, and the last few answered. */
    decisions: decisionsView(world, p),
    /** Founder Journey 4a: per company you founded, its named rivals and their recent moves. */
    rivals: rivalsView(world, myCompanies),
    /**
     * Founder Journey 5: exit options for your companies (offers, secondary,
     * IPO checklist), the stock market, offers waiting for you, and the
     * Capital Allocator hub (mentor, give, a career, start again).
     */
    capital: p.ai
      ? null
      : {
          exits: exitOptionsView(world, p),
          market: publicMarketView(world, p, clock?.now),
          /** Cities with a stock market, the player's own first (stock analysis). */
          exchanges: stockExchangesView(world, p),
          offers: secondaryOffersView(world, p),
          /** Private stakes you hold as an investor: what selling pays, or why you can't yet. */
          stakes: investorStakesView(world, p),
          allocator: allocatorView(world, p),
        },
    /**
     * The jobs rework (after its release note; else null): your experience,
     * your professional job and its next step, every employer's ladder with
     * your eligibility, and your applications (interview questions when booked).
     */
    work: workView(world, p),
    /** Friends & Family rounds you can see: yours, your city's, your contacts' (chapter 3). */
    friendsRounds: friendsRoundsView(world, p, locationOf(p)),
    playRooms: playView(world, p),
    /** The game you're in (open or under way), wherever it is: leave it from anywhere. */
    myPlayRoom: myPlayRoom(world, p),
    /** Invitations to a table waiting for your answer, wherever they are (the gameplay round). */
    playInvites: playInvites(world, p),
    living: livingView(world, p),
    /** The month clock (Wave 4): when the next settlement is due, for a countdown. */
    clock: clock ? clockView(clock.now, clock.monthMs) : null,
    /** One-way flights from where you are (Wave 4): fares in your home currency, minor units. */
    flights: flightsView(world, p),
    me: {
      id: p.id,
      /** When this player joined (server clock, ms): the client's Simple mode default. */
      joinedAt: p.joinedAt,
      flightTicket: p.flightTicket ?? null,
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
      // Rounded for the screen: fractional costs (a 0.2h ride) add up to 73.80000000000001.
      hours: {
        available: roundHours(p.hours.available),
        used: roundHours(p.hours.used),
        left: roundHours(hoursLeft(p)),
      },
      energy: Math.round(p.energy),
      burnout: p.burnout,
      /** Wave 7: hunger, hygiene, fun and social, 0–100 each. */
      needs: needsOf(p),
      /** Wave 7: 0–100, the average of energy and the four needs. */
      mood: moodOf(p),
      /** Wave 7: home acts (and 'invite') this month: used, cap and left. */
      homeActs: homeActsView(p, m.month),
      /** Round 7 (gameplay note): resting at home: the rest under way and the rates; null before. */
      rest: gameplayOn(world) && !p.ai ? restView(world, p) : null,
      /**
       * Phase 3 life bars (only after the release note, so clients can hide them):
       * energy, health, happiness and stress, 0–100 rounded, and what they're
       * doing to you right now in plain English.
       */
      ...(lifeBarsOn(world) && !p.ai
        ? { bars: barsOf(p), barEffects: barEffects(p, feedbackOn(world)) }
        : {}),
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
            /** The hotel you're staying in (missing: no hotel booked). */
            ...(p.location.hotel ? { hotel: p.location.hotel } : {}),
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
          /** Hotels for a stay there, priced in your home currency, with flight + hotel affordability. */
          hotels: hotelOptions(world, p, id),
          /**
           * Feedback round: the city's named hotels across its districts (stars,
           * room, km from the centre, a night and the stay in your currency).
           * Empty without the note: book by `hotels` tier as before.
           */
          hotelList: hotelList(world, p, id),
        })),
      lastMonth: p.lastMonth,
      gigsThisMonth: p.gigsThisMonth,
      /** Wave 5: null for saved players who never chose (the client keeps its avatar). */
      gender: p.gender ?? null,
      /** Phase 6a: your look from the creator; null = never chosen (drawn from your seed). */
      appearance: p.appearance ?? null,
      appearanceAt: p.appearanceAt ?? null,
      /** Wave 5: your part-time job (the jobs rework: or professional job), or null. */
      job: anyJobView(world, p),
      /** Wave 5: your furniture and how comfortable home is (0–100). */
      home: myHomeView(p),
      /** Wave 5: your car, or null. */
      car: carView(world, p),
      /** Golf: the course in the city you're in, the green fee and your record. */
      golf: { ...golfView(world, p), match: golfMatchOptions(world, p) },
      /**
       * More games (null before the more-games release): the city's bowling
       * alley (and its lane fee and stakes), skydive centre and heliport, and
       * your record.
       */
      games: (() => {
        const g = gamesView(world, p);
        return g ? { ...g, lanes: bowlingOptions(world, p) } : null;
      })(),
      /** The mall in the city you're in: its shops' items and prices, your phone. */
      mall: { ...mallView(world, p), ...mallTripView(world, p) },
      /** Shop note (null before): the catalogue's prices at home, the cars sold there, delivery terms. */
      shop: shopOn(world) ? shopCatalogView(world, p) : null,
      /** Buy mode (the feedback round; null before): what things do for you, floors and paint. */
      homeStyle: feedbackOn(world) ? homeStyleView(world, p) : null,
      /** "My purchases": your wardrobe (what you can wear, free) and the other things you keep. */
      wardrobe: wardrobeView(world, p),
      garage: (p.garage ?? (p.car ? [p.car] : [])).map((car) => ({
        ...car,
        active: car.modelId === p.car?.modelId,
      })),
      /** Wave 5: status (0–100) from your home, car and lifestyle, shown on your profile. */
      status: statusOf(p),
      /** Wave 10: homes you own, in every city (amounts in each home's currency). */
      properties: myPropertiesView(world, p),
      /** Wave 10: the home you own and live in, or null when renting. */
      residence: residenceView(world, p),
      /** Wave 10: cash + property equity − personal loans, in your home currency. */
      netWorth: netWorth(world, p),
      /** Founder Journey 5 (§7.4): spendable cash vs shares and property at their mark, and what you've realised. */
      wealth: wealthView(world, p),
      /**
       * People met at events (Wave 2) and saved from Who's here (Wave 6),
       * newest first; warmth fades with time. `chatId` opens a chat with them.
       */
      contacts: (p.contacts ?? []).slice(0, CONTACTS_VIEW_LIMIT).map((c) => ({
        ...c,
        warmth: Math.round(contactWarmth(c, m.month) * 100) / 100,
        chatId: chatIdOf(c),
      })),
    },
    accounts: { local: acc(p.accounts.local), usd: acc(p.accounts.usd) },
    /** Wave 8: sending money to friends: what's left today, the fee rate and minimum. */
    sendMoney: clock ? sendLimits(world, p, clock.now) : sendLimits(world, p, p.lastActiveAt),
    /** Wave 8: the friend's home you're visiting right now (read-only), or null. */
    visiting: visitingView(world, p),
    /** Wave 8: visit invitations this month (to you and from you). */
    visits: visitsView(world, p),
    /** Wave 8: hangouts this month you planned, were asked to or joined. */
    hangouts: hangoutsView(world, p),
    /** Holiday with friends: this month's holidays you host or were invited on. */
    holidays: holidaysView(world, p),
    bank: ownBankView(world, p.id),
    /** Bankers note: the advisory desk, conversations at banks and institutions, your record. */
    bankWork: bankWorkView(world, p, clock?.now ?? p.lastActiveAt),
    market: homeView,
    /** The city you're physically in (Wave 4): same shape as `market`; your home city unless you've flown. */
    // Only when away: at home the client uses `market`, so the city isn't sent twice.
    here:
      hereId === m.id ? null : marketView(world, p, getMarket(world, hereId), founderish, clock),
    /**
     * Away, in a city with another currency: what your account's money buys
     * here (the rate a purchase charges at, after the bank's fee), so prices
     * here can be weighed against your balance; null when no exchange is needed.
     */
    spendHere: spendHereView(world, p, hereId),
    lifestyleTiers: LIFESTYLE_TIERS.map((t) => ({
      ...t,
      monthlyCost: Math.round(m.data.costOfLiving * 100 * t.costCol),
    })),
    /** Founder setup (feedback note): a company started now is set up step by step. */
    setupOn: feedbackOn(world),
    companies: myCompanies.map((c) => {
      const plan = c.status === 'active' ? rescuePlan(world, c, playerId) : null;
      return {
        ...companyDetail(world, c),
        /** Why last month went the way it did (Wave 1). */
        story: c.story ?? null,
        /** The rescue plan; null when the company isn't in distress. */
        rescue: plan && plan.level ? plan : null,
        /**
         * Next payday, so a founder sees a shortfall coming before staff go
         * unpaid: what next month costs at today's settings (salaries are
         * part of it), what came in last month, and how much the company is
         * short if revenue repeats (0 when it can pay).
         */
        // Founder setup: nothing is due before the office is chosen, so no payday yet.
        nextMonth: c.status === 'active' && !inSetup(c) ? nextMonthOf(world, c) : null,
        /** Founder setup (feedback note): the tracker's steps, money, plan, answers and offices. */
        setup: c.status === 'active' ? setupView(world, c, p) : null,
        hibernating: !!c.hibernation,
        officeDownsized: !!c.officeDownsized,
        /** Local businesses buying from this company (Wave 3), with last month's amount. */
        businessCustomers: businessCustomersOf(world, c),
        /** Round 7 (gameplay note): what each person on the team brings, by staff id. */
        teamBrings: teamBringsView(world, c),
        /** Round 7: investors a business co-founder introduced (warm leads), by fund. */
        investorIntros: introsView(world, c),
        /** Round 7: what each candidate in the city's talent pool would bring, by candidate id. */
        talentBrings: gameplayOn(world)
          ? Object.fromEntries(
              getMarket(world, c.market).talent.map((x) => [x.id, bringsOf(world, c, x)]),
            )
          : null,
        /** Wave 10: head office, branches, and what opening one costs in each city. */
        expansion: companyBranchesView(world, c, playerId),
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
        /** Phase 6a: how they look, so they're drawn the same for everyone. */
        gender: x.gender ?? null,
        appearance: x.appearance ?? null,
        appearanceAt: x.appearanceAt ?? null,
        /** Their home city: an unchosen look takes its people's skin tones. */
        home: x.market,
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
    /** Round 7: a pitch is a meeting with the investor (gameplay note). */
    pitchMeetings: gameplayOn(world),
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
        // An open pitch shows today's numbers (the life-bars note; as stored before it).
        questions: pitchQuestionsNow(world, x).map((q) => ({
          ...q,
          options: q.options.map(({ truth: _t, claim: _c, ...o }) => o),
        })),
        /** Round 7: the pitch meeting, as this viewer sees it (the raw state stays on the server). */
        meeting: meetingView(world, x, p.id),
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

/** Wave 6: every saved contact (the phone's Contacts app lists them all). */
const CONTACTS_VIEW_LIMIT = CONTACTS_LIMIT;

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
function ownBankView(world: World, playerId: Id) {
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
          /** Missed payments in a row (a company's repayments come out of its account). */
          missed: 0,
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
          /** Missed payments in a row: a late borrower (Today's "waiting for you"). */
          missed: l.missed,
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
