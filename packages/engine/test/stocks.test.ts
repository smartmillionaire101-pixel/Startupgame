import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { EXITS } from '../src/exits.js';
import { listedIn } from '../src/exchange.js';
import { EXITS_NOTE, FEEDBACK_NOTE } from '../src/releases.js';
import { stockAnalysisFor } from '../src/stocks.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addInvestor, careerWorld, makeWorld, moneyByCurrency, run, settle } from './helpers.js';

/**
 * Stock analysis (game feedback: "I am London based but stocks are from
 * other countries"): the player's own exchange first, and an analysis of
 * every listed company before buying.
 */
const I = 'u_investor';
const CITIES = ['lagos', 'nairobi', 'london'] as const;
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Release.' }).world;

/** A listing's analysis, as its page fetches it (round 7: not in the state). */
const analysisOf = (w: World, companyId: string) => stockAnalysisFor(w, I, companyId)!;

/** A London investor in a world whose stock market is open (Founder Journey 5). */
const londoner = (seed = 5) =>
  addInvestor(announce(makeWorld(seed, [...CITIES]), EXITS_NOTE), I, 'london');
/** The same in an investor-career world: every city's exchange with its index. */
const careerLondoner = (seed = 5) => {
  const w = addInvestor(careerWorld(seed, [...CITIES]), I, 'london');
  return run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
};

describe('stock market: your city first', () => {
  it('lists London first for a London investor, then the other cities by name', () => {
    const w = londoner();
    const v = playerView(w, I)!;
    const market = v.capital!.market;
    expect(new Set(market.map((x) => x.market)).size).toBe(3);
    const firstOther = market.findIndex((x) => x.market !== 'london');
    expect(firstOther).toBeGreaterThan(0);
    expect(market.slice(0, firstOther).every((x) => x.market === 'london')).toBe(true);
    expect(market.slice(firstOther).some((x) => x.market === 'london')).toBe(false);
    // The others by city name: Lagos before Nairobi.
    const others = [...new Set(market.slice(firstOther).map((x) => x.city))];
    expect(others).toEqual(['Lagos', 'Nairobi']);
    // Biggest company first within a city.
    const london = market.filter((x) => x.market === 'london');
    for (let i = 1; i < london.length; i++)
      expect(london[i - 1]!.marketCap).toBeGreaterThanOrEqual(london[i]!.marketCap);
    // The exchanges list agrees.
    const ex = v.capital!.exchanges;
    expect(ex[0]).toMatchObject({ market: 'london', city: 'London', home: true });
    expect(ex.slice(1).map((x) => x.city)).toEqual(['Lagos', 'Nairobi']);
    expect(ex[1]!.fx).toBeGreaterThan(1); // One pound buys many naira.
  });

  it('a Lagos investor sees Lagos first', () => {
    const w = addInvestor(announce(makeWorld(5, [...CITIES]), EXITS_NOTE), 'u_lagos', 'lagos');
    expect(playerView(w, 'u_lagos')!.capital!.market[0]!.market).toBe('lagos');
  });

  it('the investor exchange puts your city first too', () => {
    const w = careerLondoner();
    const markets = playerView(w, I)!.exchange!.markets;
    expect(markets.map((m) => m.market)).toEqual(['london', 'lagos', 'nairobi']);
    expect(markets[0]!.home).toBe(true);
  });
});

describe('stock market: the company analysis', () => {
  it('shows the numbers, the price against the city, the risk and what a buy needs', () => {
    const w = careerLondoner();
    const v = playerView(w, I)!;
    const x = v.capital!.market.find((m) => m.market === 'london')!;
    const a = analysisOf(w, x.companyId);
    expect(a.idea.length).toBeGreaterThan(0);
    expect(a.marketCap).toBe(x.marketCap);
    expect(a.shares).toBeGreaterThan(0);
    expect(a.revenueYear).toBeGreaterThanOrEqual(a.revenueMonth);
    if (a.ps !== null) expect(a.cityPs).not.toBeNull();
    if (a.pe !== null) expect(a.cityPe).not.toBeNull();
    expect(a.risk.score).toBeGreaterThanOrEqual(1);
    expect(a.risk.score).toBeLessThanOrEqual(5);
    expect(a.risk.reasons.length).toBeGreaterThan(0);
    // A fresh listing has little price history: that is one of the reasons.
    expect(a.risk.reasons.map((r) => r.kind)).toContain('new');
    // The buyer's money is shown in pounds, with the month's limit and limit orders.
    expect(a.yourCurrency).toBe('GBP');
    expect(a.yourCash).toBe(w.accounts[w.players[I]!.accounts.local]!.balance);
    expect(a.maxBuyShares).toBeGreaterThan(0);
    expect(a.limitOrders).toBe(true);
    // The exchange view lists the same company (its analysis fetched the same way).
    const listing = v.exchange!.markets[0]!.listings.find((l) => l.companyId === x.companyId)!;
    expect(listing.marketCap).toBe(a.marketCap);
  });

  it('round 7: the state carries no analysis (fetched when a company opens), nothing for a stranger', () => {
    const w = careerLondoner();
    const v = playerView(w, I)!;
    for (const x of v.capital!.market) expect('analysis' in x).toBe(false);
    for (const m of v.exchange!.markets)
      for (const l of m.listings) expect('analysis' in l).toBe(false);
    const x = v.capital!.market[0]!;
    expect(typeof x.recentNews).toBe('boolean');
    expect(stockAnalysisFor(w, 'nobody', x.companyId)).toBeNull();
    expect(stockAnalysisFor(w, I, 'co_nothing')).toBeNull();
  });

  it('a Lagos company is analysed in naira, with the London buyer’s money converted', () => {
    const w = londoner();
    const a = analysisOf(
      w,
      playerView(w, I)!.capital!.market.find((m) => m.market === 'lagos')!.companyId,
    );
    const pounds = w.accounts[w.players[I]!.accounts.local]!.balance;
    expect(a.yourCurrency).toBe('GBP');
    expect(a.yourCash).toBeGreaterThan(pounds * 100);
    // No limit orders before the investor career.
    expect(a.limitOrders).toBe(false);
  });

  it('a London investor buys London shares after reading the analysis', () => {
    let w = careerLondoner();
    const total = moneyByCurrency(w);
    const x = playerView(w, I)!.capital!.market[0]!;
    const max = analysisOf(w, x.companyId).maxBuyShares;
    const r = run(w, I, { type: 'shares.buy', companyId: x.companyId, amount: 50_000_00 });
    w = r.world;
    expect(r.result.shares).toBeGreaterThan(0);
    expect(r.result.shares).toBeLessThanOrEqual(max);
    expect(moneyByCurrency(w)).toEqual(total);
    const after = playerView(w, I)!.capital!.market.find((m) => m.companyId === x.companyId)!;
    expect(after.yourShares).toBe(r.result.shares);
  });
});

describe('stock market: price history (FEEDBACK_NOTE)', () => {
  /** Lagos listings with a full two years of prices already recorded. */
  const fullHistory = (w: World) =>
    produce(w, (d) => {
      for (const c of Object.values(d.companies))
        if (c.market === 'lagos' && c.ipo?.status === 'listed')
          c.ipo.history = Array.from({ length: EXITS.ipo.historyLimit }, () => c.ipo!.price!);
    });

  it('keeps two years of prices in worlds without the note, as before', () => {
    let w = fullHistory(announce(makeWorld(9, ['lagos']), EXITS_NOTE));
    w = settle(w, 'lagos', 2);
    const listed = listedIn(w, 'lagos');
    expect(listed.length).toBeGreaterThan(0);
    for (const c of listed) expect(c.ipo!.history!.length).toBe(EXITS.ipo.historyLimit);
  });

  it('keeps five years once the feedback note is logged', () => {
    let w = announce(announce(makeWorld(9, ['lagos']), EXITS_NOTE), FEEDBACK_NOTE);
    w = fullHistory(w);
    w = settle(w, 'lagos', 2);
    const listed = listedIn(w, 'lagos');
    expect(listed.length).toBeGreaterThan(0);
    for (const c of listed) expect(c.ipo!.history!.length).toBe(EXITS.ipo.historyLimit + 2);
    expect(EXITS.ipo.historyMonths).toBe(60);
  });
});
