import { describe, expect, it } from 'vitest';
import { companyBranches, companyDistrict } from '../src/branches.js';
import { aiScore, COMPETITION, competitionId, isCompetitionMonth } from '../src/competitions.js';
import { CITY_DISTRICTS } from '../src/data/businesses.js';
import { NEIGHBOURHOODS } from '../src/data/property.js';
import { MARKET_IDS } from '../src/data/markets.js';
import type { MarketId } from '../src/data/markets.js';
import { TECH_CAPITAL_FUNDS } from '../src/data/tech-capital.js';
import { stableDistrict } from '../src/districts.js';
import { marketProperties, priceOf } from '../src/property.js';
import { techEventsFor } from '../src/social.js';
import { playerView } from '../src/views.js';
import { createWorld } from '../src/world.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  T0,
  tryRun,
} from './helpers.js';

const SF = 'san-francisco' as const;

const withSf = (seed = 11, markets: MarketId[] = ['lagos']): World => {
  const w = createWorld({ seed, now: T0, markets, aiStartupsPerMarket: 6 });
  return run(w, null, { type: 'market.open', market: SF }).world;
};

const addSfFounder = (w: World, id = 'u_sf'): World =>
  run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name: 'Sam Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: SF,
    company: {
      name: 'Fogline',
      industry: 'saas',
      revenueModel: 'subscription',
      idea: 'Scheduling software for clinics',
      incorporation: 'us',
    },
  }).world;

/** Hand a player money from the outside world (genesis), keeping the books balanced. */
function gift(w: World, playerId: string, amount: number): World {
  const out = structuredClone(w);
  const p = out.players[playerId]!;
  const m = out.markets[p.market]!;
  out.accounts[m.ext.genesis]!.balance -= amount;
  out.accounts[p.accounts.local]!.balance += amount;
  return out;
}

const bal = (w: World, acc: string) => w.accounts[acc]!.balance;

const conserved = (before: World, after: World) => {
  expect(moneyByCurrency(after)).toEqual(moneyByCurrency(before));
  expect(negativeInternalAccounts(after)).toEqual([]);
};

describe('real estate (Wave 10 §A)', () => {
  it('every city has a property market in real neighbourhoods, in real districts', () => {
    for (const market of MARKET_IDS) {
      const hoods = NEIGHBOURHOODS[market];
      expect(hoods.length, market).toBeGreaterThanOrEqual(5);
      for (const h of hoods)
        expect(CITY_DISTRICTS[market], `${market}/${h.name}`).toContain(h.district);
    }
    const names = (m: MarketId) => NEIGHBOURHOODS[m].map((h) => h.name);
    for (const n of ['Pacific Heights', 'Sea Cliff', 'Nob Hill', 'SoMa lofts', 'Mission'])
      expect(names(SF)).toContain(n);
    for (const n of ['Banana Island', 'Ikoyi', 'Victoria Island', 'Lekki Phase 1', 'Yaba'])
      expect(names('lagos')).toContain(n);
    for (const n of ['Mayfair', 'Hampstead', 'Shoreditch', 'Canary Wharf'])
      expect(names('london')).toContain(n);
    for (const n of ['Palm Jumeirah', 'Emirates Hills', 'Downtown', 'Dubai Marina'])
      expect(names('dubai')).toContain(n);

    const w = withSf(3, ['lagos', 'london']);
    const sf = marketProperties(w, SF);
    expect(sf.length).toBeGreaterThan(15);
    // A Sea Cliff mansion costs millions of dollars; a Yaba studio a few tens of millions of naira.
    const mansion = sf.find((p) => p.neighbourhood === 'Sea Cliff' && p.tier === 'mansion')!;
    expect(priceOf(w, mansion)).toBeGreaterThan(10_000_000_00);
    const studio = marketProperties(w, 'lagos').find(
      (p) => p.neighbourhood === 'Yaba' && p.tier === 'studio',
    )!;
    expect(priceOf(w, studio)).toBeGreaterThan(20_000_000_00);
    expect(priceOf(w, studio)).toBeLessThan(60_000_000_00);
    const bi = marketProperties(w, 'lagos').find(
      (p) => p.neighbourhood === 'Banana Island' && p.tier === 'mansion',
    )!;
    expect(priceOf(w, bi)).toBeGreaterThan(priceOf(w, studio) * 50);
  });

  it('prices move with a deterministic city index', () => {
    const a = settle(withSf(5), SF, 6);
    const b = settle(withSf(5), SF, 6);
    expect(a.markets[SF]!.propertyIndex).toEqual(b.markets[SF]!.propertyIndex);
    expect(a.markets[SF]!.propertyIndex!.value).not.toBe(1);
    expect(a.properties).toEqual(b.properties);
    const c = settle(withSf(6), SF, 6);
    expect(c.markets[SF]!.propertyIndex!.value).not.toBe(a.markets[SF]!.propertyIndex!.value);
  });

  it('buy with cash, let it out, sell: money is conserved and the portfolio adds up', () => {
    let w = gift(addSfFounder(withSf(7)), 'u_sf', 5_000_000_00);
    const start = w;
    const p = marketProperties(w, SF).find(
      (x) => x.neighbourhood === 'SoMa lofts' && x.tier === 'apartment',
    )!;
    const price = priceOf(w, p);
    const before = bal(w, w.players.u_sf!.accounts.local);
    const r = run(w, 'u_sf', { type: 'property.buy', propertyId: p.id });
    w = r.world;
    expect(w.properties![p.id]!.ownerId).toBe('u_sf');
    expect(bal(w, w.players.u_sf!.accounts.local)).toBe(before - price - Math.round(price * 0.03));
    conserved(start, w);
    // Someone else can't buy it now.
    w = gift(addInvestor(w, 'u_sf2', SF), 'u_sf2', 5_000_000_00);
    expect(tryRun(w, 'u_sf2', { type: 'property.buy', propertyId: p.id }).ok).toBe(false);

    w = run(w, 'u_sf', { type: 'property.rent', propertyId: p.id }).world;
    const v0 = playerView(w, 'u_sf')!;
    const mine = v0.me.properties.find((x) => x.id === p.id)!;
    expect(mine.rentedOut).toBe(true);
    expect(mine.equity).toBe(mine.value);
    expect(mine.monthlyRent).toBeGreaterThan(0);
    expect(v0.me.netWorth.propertyEquity).toBe(mine.value);
    expect(v0.me.netWorth.total).toBe(v0.me.netWorth.cash + mine.value - v0.me.netWorth.loans);
    const listing = v0.market.properties.listings.find((x) => x.id === p.id)!;
    expect(listing.forSale).toBe(false);
    expect(listing.owner?.you).toBe(true);

    const s0 = w;
    w = settle(w, SF, 3);
    conserved(s0, w);
    const last = w.properties![p.id]!.lastMonth!;
    expect(last.upkeep).toBeGreaterThan(0);
    expect(last.rent + (last.vacant ? 1 : 0)).toBeGreaterThan(0);

    const s1 = w;
    const sold = run(w, 'u_sf', { type: 'property.sell', propertyId: p.id });
    w = sold.world;
    expect(sold.result.received).toBe(sold.result.price - sold.result.fee);
    expect(w.properties![p.id]!.ownerId).toBeNull();
    conserved(s1, w);
  });

  it('a mortgage: deposit now, repayments through the ledger, the bank repaid on sale', () => {
    let w = gift(addSfFounder(withSf(8)), 'u_sf', 1_500_000_00);
    const p = marketProperties(w, SF).find(
      (x) => x.neighbourhood === 'Pacific Heights' && x.tier === 'apartment',
    )!;
    // Cash alone isn't enough; a mortgage is.
    const cash = tryRun(w, 'u_sf', { type: 'property.buy', propertyId: p.id });
    expect(!cash.ok && cash.error.code).toBe('property.buy');
    const start = w;
    const r = run(w, 'u_sf', {
      type: 'property.buy',
      propertyId: p.id,
      mortgage: { downPct: 25, months: 300 },
    });
    w = r.world;
    const mg = w.properties![p.id]!.mortgage!;
    expect(mg.principal).toBe(r.result.price - Math.round(r.result.price * 0.25));
    expect(mg.monthlyPayment).toBe(r.result.mortgage.monthly);
    conserved(start, w);
    const s0 = w;
    w = settle(w, SF, 4);
    conserved(s0, w);
    const after = w.properties![p.id]!.mortgage!;
    expect(after.outstanding).toBeLessThan(mg.principal);
    expect(after.monthsLeft).toBe(296);
    expect(after.missed).toBe(0);
    const v = playerView(w, 'u_sf')!;
    const mine = v.me.properties[0]!;
    expect(mine.mortgage!.outstanding).toBe(after.outstanding);
    expect(mine.equity).toBe(mine.value - after.outstanding);
    // Selling repays the bank first.
    const bank = w.markets[SF]!.ext.bank;
    const bankBefore = bal(w, bank);
    const s1 = w;
    const sold = run(w, 'u_sf', { type: 'property.sell', propertyId: p.id });
    w = sold.world;
    expect(bal(w, bank) - bankBefore).toBe(after.outstanding);
    conserved(s1, w);
  });

  it('missed mortgage payments end in repossession', () => {
    let w = gift(addSfFounder(withSf(9)), 'u_sf', 3_000_000_00);
    const p = marketProperties(w, SF).find((x) => x.tier === 'penthouse')!;
    w = run(w, 'u_sf', {
      type: 'property.buy',
      propertyId: p.id,
      mortgage: { downPct: 20, months: 360 },
    }).world;
    // Empty the account (back to the outside world).
    w = structuredClone(w);
    const acc = w.players.u_sf!.accounts.local;
    w.accounts[w.markets[SF]!.ext.genesis]!.balance += bal(w, acc);
    w.accounts[acc]!.balance = 0;
    const s0 = w;
    w = settle(w, SF, 3);
    expect(w.properties![p.id]!.ownerId).toBeNull();
    expect(w.players.u_sf!.credit.defaults).toBeGreaterThan(0);
    conserved(s0, w);
  });

  it('moving in sets your home and lifestyle tier and saves the rent; it must be bought in person', () => {
    let w = gift(addSfFounder(withSf(10)), 'u_sf', 20_000_000_00);
    const mansion = marketProperties(w, SF).find((x) => x.tier === 'mansion')!;
    const costBefore = playerView(w, 'u_sf')!.me.lifestyle.monthlyCost;
    w = run(w, 'u_sf', { type: 'property.buy', propertyId: mansion.id }).world;
    w = run(w, 'u_sf', { type: 'property.moveIn', propertyId: mansion.id }).world;
    const me = w.players.u_sf!;
    expect(me.lifestyleTier).toBe(5);
    expect(me.residence?.propertyId).toBe(mansion.id);
    const v = playerView(w, 'u_sf')!;
    expect(v.me.residence?.tier).toBe('mansion');
    expect(v.me.residence?.district).toBe(mansion.district);
    // Lavish living without rent: 60% of the Lavish cost.
    const lavish = Math.round(5_500_00 * 5.25 * 0.6);
    expect(v.me.lifestyle.monthlyCost).toBe(lavish);
    expect(costBefore).toBeLessThan(lavish);
    // Can't let the home you live in.
    expect(tryRun(w, 'u_sf', { type: 'property.rent', propertyId: mansion.id }).ok).toBe(false);
    // Lagos homes are bought in Lagos.
    const lagos = marketProperties(w, 'lagos')[0]!;
    const away = tryRun(w, 'u_sf', { type: 'property.buy', propertyId: lagos.id });
    expect(!away.ok && away.error.message).toMatch(/Fly to Lagos/);
  });

  it('moving into a home in another city makes it your home city', () => {
    let w = gift(addInvestor(withSf(12), 'u_inv', 'lagos'), 'u_inv', 3_000_000_000_00);
    w = run(w, 'u_inv', { type: 'travel.fly', to: SF }).world;
    const studio = marketProperties(w, SF).find((x) => x.tier === 'studio')!;
    const start = w;
    // Bought in dollars from a naira account (converted at the official rate).
    w = run(w, 'u_inv', { type: 'property.buy', propertyId: studio.id }).world;
    conserved(start, w);
    const r = run(w, 'u_inv', { type: 'property.moveIn', propertyId: studio.id });
    w = r.world;
    expect(r.result.relocated).toBe(true);
    const me = w.players.u_inv!;
    expect(me.market).toBe(SF);
    expect(me.lifestyleTier).toBe(1);
    expect(playerView(w, 'u_inv')!.me.residence?.propertyId).toBe(studio.id);
    conserved(start, w);
  });
});

describe('business expansion (Wave 10 §A)', () => {
  it('a branch costs to open and run, earns its district’s demand, and books into the P&L', () => {
    let w = addFounder(
      createWorld({ seed: 21, now: T0, markets: ['lagos'], aiStartupsPerMarket: 6 }),
    );
    const c = companyOf(w, 'u_founder');
    w = gift(w, 'u_founder', 50_000_000_00);
    w = run(w, 'u_founder', {
      type: 'company.inject',
      companyId: c.id,
      amount: 40_000_000_00,
    }).world;
    const hq = companyDistrict(c);
    const district = CITY_DISTRICTS.lagos.find((d) => d !== hq)!;
    const bad = tryRun(w, 'u_founder', {
      type: 'company.branch.open',
      companyId: c.id,
      market: 'lagos',
      district: hq,
    });
    expect(!bad.ok && bad.error.message).toMatch(/head office/);
    const start = w;
    const cash = bal(w, c.account);
    const r = run(w, 'u_founder', {
      type: 'company.branch.open',
      companyId: c.id,
      market: 'lagos',
      district,
    });
    w = r.world;
    expect(bal(w, c.account)).toBe(cash - r.result.setupCost);
    expect(r.result.setupCost).toBe(450_000_00 * 8);
    conserved(start, w);
    const s0 = w;
    w = settle(w, 'lagos', 3);
    conserved(s0, w);
    const b = companyBranches(w, c.id)[0]!;
    expect(b.status).toBe('open');
    expect(b.lastMonth.revenue).toBeGreaterThan(0);
    expect(b.lastMonth.opex).toBe(450_000_00 * 3);
    const pnl = w.companies[c.id]!.finance.history.at(-1)!;
    expect(pnl.branches!.revenue).toBe(b.lastMonth.revenue);
    expect(pnl.branches!.opex).toBe(b.monthlyOpex);
    expect(pnl.revenue).toBeGreaterThanOrEqual(pnl.branches!.revenue);
    const v = playerView(w, 'u_founder')!;
    expect(v.companies[0]!.expansion.branches).toHaveLength(1);
    expect(v.market.branches.map((x) => x.id)).toContain(b.id);
    // Close it: a month's rent breaks the lease.
    const s1 = w;
    w = run(w, 'u_founder', { type: 'company.branch.close', branchId: b.id }).world;
    expect(companyBranches(w, c.id)[0]!.status).toBe('closed');
    conserved(s1, w);
  });

  it('opens in another city, paid across currencies', () => {
    let w = addFounder(withSf(22));
    const c = companyOf(w, 'u_founder');
    w = gift(w, 'u_founder', 900_000_000_00);
    w = run(w, 'u_founder', {
      type: 'company.inject',
      companyId: c.id,
      amount: 800_000_000_00,
    }).world;
    const start = w;
    w = run(w, 'u_founder', {
      type: 'company.branch.open',
      companyId: c.id,
      market: SF,
      district: 'soma',
    }).world;
    conserved(start, w);
    w = settle(w, SF, 2);
    w = settle(w, 'lagos', 1);
    conserved(start, w);
    const b = companyBranches(w, c.id)[0]!;
    expect(b.market).toBe(SF);
    expect(b.lastMonth.revenue).toBeGreaterThan(0);
  });

  it('AI companies and thriving local businesses expand now and then, deterministically', () => {
    const go = () =>
      settle(
        createWorld({ seed: 31, now: T0, markets: ['lagos'], aiStartupsPerMarket: 8 }),
        'lagos',
        30,
      );
    const a = go();
    const b = go();
    expect(a.branches).toEqual(b.branches);
    const sites = Object.values(a.markets.lagos!.businesses!).filter((x) => x.branchOf);
    const ai = Object.values(a.branches ?? {});
    expect(sites.length + ai.length).toBeGreaterThan(0);
    // Sparingly.
    expect(sites.length).toBeLessThanOrEqual(12);
    for (const s of sites)
      expect(s.district).not.toBe(a.markets.lagos!.businesses![s.branchOf!]!.district);
    expect(moneyByCurrency(a)).toEqual(
      moneyByCurrency(
        createWorld({ seed: 31, now: T0, markets: ['lagos'], aiStartupsPerMarket: 8 }),
      ),
    );
  });
});

describe('a scattered economy (Wave 10 §A)', () => {
  it('new businesses spread across every district, not just the busy ones', () => {
    let w = createWorld({ seed: 41, now: T0, markets: ['lagos'], aiStartupsPerMarket: 4 });
    w = structuredClone(w);
    w.markets.lagos!.humansJoined = 60;
    w = settle(w, 'lagos', 30);
    const gen = Object.values(w.markets.lagos!.businesses!).filter((b) => b.seed === -1);
    expect(gen.length).toBeGreaterThan(40);
    const districts = new Set(gen.map((b) => b.district));
    for (const d of CITY_DISTRICTS.lagos) expect(districts, d).toContain(d);
    // No district has more than a third of them.
    for (const d of CITY_DISTRICTS.lagos)
      expect(gen.filter((b) => b.district === d).length).toBeLessThan(gen.length / 3);
  });

  it('offices, funds and AI startups land in every district', () => {
    for (const market of MARKET_IDS) {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) seen.add(stableDistrict(market, 'company', `co_${i}`)!);
      expect([...seen].sort(), market).toEqual([...CITY_DISTRICTS[market]].sort());
    }
    const w = withSf(42);
    const v = playerView(addSfFounder(w), 'u_sf')!;
    expect(new Set(v.market.offices.map((o) => o.district)).size).toBeGreaterThan(3);
    expect(new Set(v.market.funds.map((f) => f.district)).size).toBeGreaterThan(4);
  });
});

describe('San Francisco, the tech capital (Wave 10 §A)', () => {
  it('has more funds, angels, AI startups, tech campuses and tech events', () => {
    let w = withSf(51, ['london']);
    const funds = (m: MarketId) => Object.values(w.funds).filter((f) => f.market === m).length;
    for (const f of TECH_CAPITAL_FUNDS[SF]!)
      expect(Object.values(w.funds).some((x) => x.name === f.name)).toBe(true);
    expect(funds(SF)).toBeGreaterThan(funds('london') + 8);
    const startups = (m: MarketId) =>
      Object.values(w.companies).filter((c) => c.ai && c.market === m).length;
    expect(startups(SF)).toBeGreaterThan(startups('london'));
    w = settle(w, SF, 1);
    const campuses = Object.values(w.markets[SF]!.businesses!).filter(
      (b) => b.kind === 'tech-campus',
    );
    expect(campuses.length).toBeGreaterThanOrEqual(5);
    expect(new Set(campuses.map((b) => b.district)).size).toBeGreaterThanOrEqual(5);
    const sf = techEventsFor(w, w.markets[SF]!, 3).length;
    const ldn = techEventsFor(w, w.markets.london!, 3).length;
    expect(sf).toBeGreaterThanOrEqual(7);
    expect(sf).toBeGreaterThan(ldn);
  });
});

describe('pitch competitions (Wave 10 §A)', () => {
  it('SF holds one every month, other cities every quarter', () => {
    for (let m = 0; m < 12; m++) expect(isCompetitionMonth(SF, m)).toBe(true);
    for (const market of MARKET_IDS.filter((x) => x !== SF)) {
      const months = Array.from({ length: 12 }, (_, m) => m).filter((m) =>
        isCompetitionMonth(market, m),
      );
      expect(months, market).toHaveLength(4);
    }
  });

  it('enter, judge (AI and human), resolve: prizes conserved, scores revealed, the winner rewarded', () => {
    let w = addSfFounder(withSf(61));
    w = addInvestor(w, 'u_judge', SF);
    w = addInvestor(w, 'u_far', 'lagos');
    const comp0 = w.competitions![competitionId(SF, 0)]!;
    expect(comp0.status).toBe('open');
    expect(comp0.judges.filter((j) => j.kind === 'ai')).toHaveLength(3);
    expect(comp0.entries.length).toBeGreaterThanOrEqual(3);
    const c = companyOf(w, 'u_sf');
    const start = w;
    w = run(w, 'u_sf', {
      type: 'competition.enter',
      competitionId: comp0.id,
      companyId: c.id,
    }).world;
    // Twice is once.
    expect(
      tryRun(w, 'u_sf', { type: 'competition.enter', competitionId: comp0.id, companyId: c.id }).ok,
    ).toBe(false);
    // Founders can't judge their own competition; investors can (from anywhere).
    expect(tryRun(w, 'u_sf', { type: 'competition.judge.join', competitionId: comp0.id }).ok).toBe(
      false,
    );
    w = run(w, 'u_judge', { type: 'competition.judge.join', competitionId: comp0.id }).world;
    w = run(w, 'u_far', { type: 'competition.judge.join', competitionId: comp0.id }).world;
    const comp = w.competitions![comp0.id]!;
    const mine = comp.entries.find((e) => e.companyId === c.id)!;
    for (const e of comp.entries) {
      const score = e.id === mine.id ? 10 : 2;
      w = run(w, 'u_judge', {
        type: 'competition.score',
        competitionId: comp.id,
        entryId: e.id,
        score,
      }).world;
      w = run(w, 'u_far', {
        type: 'competition.score',
        competitionId: comp.id,
        entryId: e.id,
        score,
      }).world;
    }
    // Before the result, scores stay hidden (you see your own).
    const v0 = playerView(w, 'u_sf')!.market.competitions.list.find((x) => x.id === comp.id)!;
    expect(v0.entries.every((e) => e.scores === null && e.total === null)).toBe(true);
    expect(v0.you.entryId).toBe(mine.id);
    const vj = playerView(w, 'u_judge')!.market.competitions.list.find((x) => x.id === comp.id)!;
    expect(vj.you.judging).toBe(true);
    expect(vj.entries.find((e) => e.id === mine.id)!.myScore).toBe(10);
    const cash = bal(w, c.account);
    w = settle(w, SF, 1);
    conserved(start, w);
    const done = w.competitions![comp.id]!;
    expect(done.status).toBe('judged');
    expect(bal(w, done.account)).toBe(0);
    const e = done.entries.find((x) => x.id === mine.id)!;
    // 3 AI scores + 2 human scores.
    expect(Object.keys(e.scores)).toHaveLength(5);
    for (const j of done.judges.filter((x) => x.kind === 'ai')) {
      expect(e.scores[j.id]).toBeGreaterThanOrEqual(1);
      expect(e.scores[j.id]).toBeLessThanOrEqual(10);
    }
    // AI judges score from the company's numbers with seeded noise: the same every time.
    const j0 = done.judges.find((x) => x.kind === 'ai')!;
    expect(aiScore(w, done, j0, e)).toBe(aiScore(w, done, j0, e));
    const paid = done.entries.reduce((a, x) => a + (x.prize ?? 0), 0);
    expect(paid).toBe(done.prizePool);
    const winner = done.entries.find((x) => x.id === done.winnerEntryId)!;
    expect(winner.rank).toBe(1);
    const v1 = playerView(w, 'u_sf')!.market.competitions.list.find((x) => x.id === comp.id)!;
    expect(v1.entries.every((x) => x.scores !== null)).toBe(true);
    expect(v1.winner?.entryId).toBe(done.winnerEntryId);
    if (done.winnerEntryId === mine.id) {
      expect(bal(w, c.account)).toBeGreaterThanOrEqual(cash);
      expect(w.players.u_sf!.contacts?.some((x) => x.kind === 'fund')).toBe(true);
      expect(w.markets[SF]!.news.some((n) => n.headline.includes(c.name))).toBe(true);
    }
    // A new one opened for the new month.
    expect(w.competitions![competitionId(SF, 1)]!.status).toBe('open');
  });

  it('is deterministic, and refuses founders who are not in the city', () => {
    const a = settle(withSf(71), SF, 3);
    const b = settle(withSf(71), SF, 3);
    expect(a.competitions).toEqual(b.competitions);
    let w = addFounder(withSf(72));
    const c = companyOf(w, 'u_founder');
    const r = tryRun(w, 'u_founder', {
      type: 'competition.enter',
      competitionId: competitionId(SF, 0),
      companyId: c.id,
    });
    expect(!r.ok && r.error.message).toMatch(/fly there/);
    w = run(w, 'u_founder', { type: 'travel.fly', to: SF }).world;
    w = run(w, 'u_founder', {
      type: 'competition.enter',
      competitionId: competitionId(SF, 0),
      companyId: c.id,
    }).world;
    expect(w.competitions![competitionId(SF, 0)]!.entries.some((e) => e.companyId === c.id)).toBe(
      true,
    );
    expect(COMPETITION.aiJudges).toBe(3);
  });
});

describe('lifestyle-gated activities (Wave 10 §A)', () => {
  const venue = (w: World, kind: string) =>
    Object.values(w.markets[SF]!.businesses!).find((b) => b.kind === kind)!;

  it('the engine refuses below the tier, with a clear reason; views show the lock', () => {
    let w = settle(addSfFounder(withSf(81)), SF, 1);
    w = gift(w, 'u_sf', 2_000_000_00);
    const marina = venue(w, 'marina');
    const r = tryRun(w, 'u_sf', { type: 'venue.buy', businessId: marina.id, itemId: 'yacht-day' });
    expect(!r.ok && r.error.code).toBe('venue.tier');
    expect(!r.ok && r.error.message).toBe(
      'Yacht day unlocks at lifestyle tier 4 (Affluent). You live Modest (tier 2).',
    );
    const view = playerView(w, 'u_sf')!.market.businesses.find((b) => b.id === marina.id)!;
    const yacht = view.venue!.items.find((i) => i.id === 'yacht-day')!;
    expect(yacht.requiresTier).toBe(4);
    expect(yacht.locked).toBe(true);
    expect(view.venue!.items.find((i) => i.id === 'drink')!.locked).toBe(false);
    expect(view.landmark).toBe(true);
    // Golf at tier 3, polo at 4, galas at 4, a rooftop party at 3.
    const start = w;
    w = run(w, 'u_sf', { type: 'player.lifestyle', tier: 4 }).world;
    w = run(w, 'u_sf', { type: 'venue.buy', businessId: marina.id, itemId: 'yacht-day' }).world;
    w = run(w, 'u_sf', {
      type: 'venue.buy',
      businessId: venue(w, 'golf-club').id,
      itemId: 'polo',
    }).world;
    w = run(w, 'u_sf', {
      type: 'venue.buy',
      businessId: venue(w, 'ballroom').id,
      itemId: 'gala',
    }).world;
    conserved(start, w);
  });

  it('a private-jet weekend (tier 5) takes you to another city', () => {
    let w = settle(addSfFounder(withSf(82)), SF, 1);
    w = gift(w, 'u_sf', 2_000_000_00);
    const jet = venue(w, 'private-terminal');
    expect(
      tryRun(w, 'u_sf', {
        type: 'venue.buy',
        businessId: jet.id,
        itemId: 'jet-weekend',
        to: 'lagos',
      }).ok,
    ).toBe(false);
    w = run(w, 'u_sf', { type: 'player.lifestyle', tier: 5 }).world;
    expect(
      tryRun(w, 'u_sf', { type: 'venue.buy', businessId: jet.id, itemId: 'jet-weekend' }).ok,
    ).toBe(false);
    const start = w;
    const r = run(w, 'u_sf', {
      type: 'venue.buy',
      businessId: jet.id,
      itemId: 'jet-weekend',
      to: 'lagos',
    });
    w = r.world;
    expect(r.result.travelled.market).toBe('lagos');
    expect(w.players.u_sf!.location?.market).toBe('lagos');
    conserved(start, w);
  });

  it('lifestyle venues open where they fit', () => {
    const w = settle(
      createWorld({
        seed: 83,
        now: T0,
        markets: ['lagos', 'london', 'nairobi'],
        aiStartupsPerMarket: 4,
      }),
      'lagos',
      1,
    );
    const kinds = Object.values(w.markets.lagos!.businesses!).map((b) => b.kind);
    for (const k of ['marina', 'golf-club', 'ballroom', 'private-terminal'])
      expect(kinds).toContain(k);
  });
});
