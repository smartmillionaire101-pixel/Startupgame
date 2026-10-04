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
import { gameDate } from './clock.js';
import { companyRunway, defaultAlive } from './company.js';
import { reliability, scoreOffer, segmentFit } from './customers.js';
import { trackRecord } from './funds.js';
import { creditProfile } from './credit.js';
import { tripCostUsd } from './travel.js';
import {
  burn,
  getMarket,
  usdToLocal,
  hoursLeft,
  lastPnl,
  nextStage,
  totalCustomers,
} from './helpers.js';
import { lifestyleCost, tierOf } from './personal.js';
import { hasPublicWarning } from './stars.js';
import { isOverloaded, managementCapacity } from './staff.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type { MarketId } from './data/markets.js';
import type { Company, DealCard, Id, NewsItem, Player, World } from './types.js';

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
    playerRevenueShare: 0,
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
            ? getMarket(world, p.id as MarketId).bankName
            : p.id;
  const mine = (p: DealCard['proposer']) =>
    (p.kind === 'player' && p.id === viewerId) ||
    (p.kind === 'fund' && world.funds[p.id]?.managerId === viewerId) ||
    (p.kind === 'company' && !!world.companies[p.id]?.founderIds.includes(viewerId));
  return {
    ...rest,
    companyName: c?.name ?? 'Personal',
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
      };
    });
}

/** Everything the client needs to render a player's game, in one payload. */
export function playerView(world: World, playerId: Id) {
  const p = world.players[playerId];
  if (!p) return null;
  const m = getMarket(world, p.market);
  const acc = (id: Id | undefined) =>
    id
      ? {
          id,
          currency: world.accounts[id]!.currency,
          balance: world.accounts[id]!.balance,
          recent: world.accounts[id]!.recent,
        }
      : null;
  const myCompanies = p.companyIds.map((id) => world.companies[id]!).filter(Boolean);
  const fund = p.investor?.fundId ? world.funds[p.investor.fundId] : undefined;
  const others = Object.values(world.companies).filter(
    // Your market, plus any market you've travelled to (§14).
    (c) =>
      (c.market === p.market || p.visited[c.market] !== undefined) && !c.founderIds.includes(p.id),
  );
  return {
    worldVersion: world.version,
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
      failures: p.failures,
      visited: p.visited,
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
    },
    accounts: { local: acc(p.accounts.local), usd: acc(p.accounts.usd) },
    market: {
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
        .filter((f) => f.market === m.id || p.visited[f.market] === m.month)
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
        })),
      talent: p.role === 'founder' || myCompanies.length ? m.talent : [],
    },
    lifestyleTiers: LIFESTYLE_TIERS.map((t) => ({
      ...t,
      monthlyCost: Math.round(m.data.costOfLiving * 100 * t.costCol),
    })),
    companies: myCompanies.map((c) => companyDetail(world, c)),
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
    players: Object.values(world.players)
      .filter((x) => !x.ai && x.id !== p.id && x.market === p.market)
      .map((x) => ({
        id: x.id,
        handle: x.handle,
        name: x.name,
        role: x.role,
        stars: round1(x.stars.value),
        companies: x.companyIds.map((id) => world.companies[id]?.name).filter(Boolean),
        /** Your trust with them, built only through real interactions (§13). */
        trust: Math.round((p.trust[x.id] ?? 0) * 100) / 100,
      })),
    deals: Object.values(world.deals)
      .filter((d) => d.market === p.market)
      .map((d) => dealView(world, d, p.id))
      .filter(
        (d) =>
          d.yourTurn ||
          d.youProposed ||
          myCompanies.some((c) => c.id === d.companyId) ||
          (d.counterparty.kind === 'player' && d.counterparty.id === p.id),
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
  };
}

export type PlayerView = NonNullable<ReturnType<typeof playerView>>;

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
