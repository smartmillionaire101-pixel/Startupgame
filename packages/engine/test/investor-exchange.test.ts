import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { fullyDiluted } from '../src/captable.js';
import { INVESTOR } from '../src/data/investor.js';
import { EXCHANGE_LISTINGS, indexHolderId, listedDividends, listedIn } from '../src/exchange.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addInvestor,
  careerWorld,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const I = 'u_investor';
const ready = () =>
  run(addInvestor(careerWorld(11)), I, { type: 'investor.tutorial', action: 'skip' }).world;
const ex = (w: World) => playerView(w, I)!.exchange!;
const lagos = (w: World) => ex(w).markets.find((m) => m.market === 'lagos')!;
/** Lagos listings: the stock market list, each with what the exchange adds (sent once). */
const lagosListings = (w: World) =>
  playerView(w, I)!
    .capital!.market.filter((l) => l.market === 'lagos')
    .map((l) => ({ ...l, ...l.trade! }));
const zero = (before: Record<string, number>, w: World) => {
  expect(moneyByCurrency(w)).toEqual(before);
  expect(negativeInternalAccounts(w)).toEqual([]);
};

describe('exchange: opening (§7.2)', () => {
  it('opens every city with AI listings and an index at 100', () => {
    const w = ready();
    expect(listedIn(w, 'lagos').length).toBe(EXCHANGE_LISTINGS);
    const x = lagos(w);
    expect(x.level).toBe(100);
    expect(lagosListings(w).every((l) => l.marketCap > 0)).toBe(true);
    expect(lagosListings(w).reduce((a, l) => a + l.weightPct, 0)).toBeCloseTo(100, 0);
  });

  it('stays closed without the note', () => {
    const w = addInvestor(makeWorld(11, ['lagos']));
    expect(playerView(w, I)!.exchange).toBeNull();
    const r = tryRun(w, I, { type: 'index.buy', market: 'lagos', amount: 1_000_000 });
    expect(r.ok).toBe(false);
  });

  it('moves the index with its companies and keeps it continuous', () => {
    let w = ready();
    const before = listedIn(w, 'lagos').reduce(
      (a, c) => a + c.ipo!.price! * fullyDiluted(c.capTable),
      0,
    );
    w = settle(w, 'lagos', 1);
    const after = listedIn(w, 'lagos').reduce(
      (a, c) => a + (c.ipo!.price ?? 0) * fullyDiluted(c.capTable),
      0,
    );
    expect(lagos(w).level).toBeCloseTo((100 * after) / before, 1);
    expect(lagos(w).history.length).toBe(2);
  });
});

describe('exchange: the city index fund', () => {
  it('buys a basket from the float, then sells it back with tax on the gain', () => {
    let w = ready();
    const total = moneyByCurrency(w);
    const r = run(w, I, { type: 'index.buy', market: 'lagos', amount: 50_000_000 });
    w = r.world;
    expect(r.result.cost).toBeGreaterThan(0);
    expect(r.result.cost).toBeLessThanOrEqual(50_000_000);
    const h = indexHolderId('lagos');
    expect(
      listedIn(w, 'lagos').filter((c) => (c.capTable.holdings[h]?.shares ?? 0) > 0).length,
    ).toBe(EXCHANGE_LISTINGS);
    expect(lagos(w).indexFund.yourValue).toBeGreaterThan(r.result.cost * 0.95);
    expect(w.players[I]!.milestones['investor.index-fund']).toBeDefined();
    // Counted as sellable wealth.
    expect(playerView(w, I)!.me.wealth.shares.sellable).toBeGreaterThan(0);
    zero(total, w);
    w = settle(w, 'lagos', 2);
    const s = run(w, I, { type: 'index.sell', market: 'lagos', pctBps: 10_000 });
    w = s.world;
    expect(lagos(w).indexFund.yourUnits).toBe(0);
    expect(s.result.net).toBe(s.result.gross - s.result.tax);
    expect(s.result.tax).toBe(
      Math.round(Math.max(0, s.result.gain) * w.markets.lagos!.data.tax.capitalGains),
    );
    zero(total, w);
  });

  it('charges its fee in shares, a twelfth of the yearly rate each month', () => {
    let w = ready();
    w = run(w, I, { type: 'index.buy', market: 'lagos', amount: 80_000_000 }).world;
    const h = indexHolderId('lagos');
    const c = listedIn(w, 'lagos')[0]!;
    const held = c.capTable.holdings[h]!.shares;
    w = settle(w, 'lagos', 1);
    const owed = w.markets.lagos!.exchange!.feeOwed![c.id]!;
    const now = w.companies[c.id]!.capTable.holdings[h]!.shares;
    // Whole shares paid plus the fraction carried equal a twelfth of the yearly rate.
    // (A dividend reinvested that month would add shares back.)
    expect(held - now + owed).toBeLessThanOrEqual(
      (held * INVESTOR.exchange.indexFeeYear) / 12 + 1e-6,
    );
    expect(owed).toBeGreaterThan(0);
  });
});

describe('exchange: depth caps and price impact', () => {
  it('refuses an order bigger than the month allows, with the most you can buy', () => {
    const w = ready();
    const c = listedIn(w, 'lagos')[0]!;
    const float = c.capTable.holdings[`pub:${c.id}`]!.shares;
    const tooMany = Math.ceil(float * INVESTOR.exchange.depthShare) + 5;
    const r = tryRun(w, I, {
      type: 'shares.buy',
      companyId: c.id,
      amount: Math.ceil(tooMany * c.ipo!.price! * 1.02),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('shares.depth');
      expect(r.error.message).toMatch(/at most \d+ shares/);
    }
  });

  it('a buy moves the price up a little, and counts against the month', () => {
    let w = ready();
    const c0 = listedIn(w, 'lagos')[0]!;
    const price = c0.ipo!.price!;
    const r = run(w, I, { type: 'shares.buy', companyId: c0.id, amount: Math.round(price * 50) });
    w = r.world;
    expect(w.companies[c0.id]!.ipo!.price!).toBeGreaterThan(price);
    const l = lagosListings(w).find((x) => x.companyId === c0.id)!;
    expect(l.yourShares).toBe(r.result.shares);
    expect(l.yourCost).toBe(r.result.cost);
    expect(lagos(w).holdings.cost).toBe(r.result.cost);
    expect(lagos(w).holdings.benchValue).toBe(r.result.cost);
  });
});

describe('exchange: limit orders', () => {
  it('fills a buy at month end when the price is at or under the limit', () => {
    let w = ready();
    const total = moneyByCurrency(w);
    const c = listedIn(w, 'lagos')[0]!;
    const price = c.ipo!.price!;
    const r = run(w, I, {
      type: 'shares.order',
      companyId: c.id,
      side: 'buy',
      amount: Math.round(price * 20),
      limit: price * 3,
    });
    w = r.world;
    expect(w.orders![r.result.orderId]!.status).toBe('open');
    w = settle(w, 'lagos', 1);
    const o = w.orders![r.result.orderId]!;
    expect(o.status).toBe('filled');
    expect(o.fill!.shares).toBeGreaterThan(0);
    expect(w.companies[c.id]!.capTable.holdings[I]!.shares).toBe(o.fill!.shares);
    zero(total, w);
  });

  it('leaves a buy far under the price open, then expires it', () => {
    let w = ready();
    const c = listedIn(w, 'lagos')[0]!;
    const r = run(w, I, {
      type: 'shares.order',
      companyId: c.id,
      side: 'buy',
      amount: 1_000_000,
      limit: c.ipo!.price! * 0.1,
    });
    w = settle(r.world, 'lagos', 1);
    expect(w.orders![r.result.orderId]!.status).toBe('open');
    w = settle(w, 'lagos', INVESTOR.exchange.orderMonths);
    expect(w.orders![r.result.orderId]!.status).toBe('expired');
  });

  it('can be cancelled', () => {
    let w = ready();
    const c = listedIn(w, 'lagos')[0]!;
    const r = run(w, I, {
      type: 'shares.order',
      companyId: c.id,
      side: 'buy',
      amount: 1_000_000,
      limit: 1,
    });
    w = run(r.world, I, { type: 'shares.cancel', orderId: r.result.orderId }).world;
    expect(w.orders![r.result.orderId]!.status).toBe('cancelled');
  });
});

describe('exchange: dividends and insiders', () => {
  it('profitable listed companies pay a share of profit, pro rata', () => {
    let w = settle(ready(), 'lagos', 1);
    const c0 = listedIn(w, 'lagos').find((c) => !c.aiCeo)!;
    w = run(w, I, {
      type: 'shares.buy',
      companyId: c0.id,
      amount: Math.round(c0.ipo!.price! * 30),
    }).world;
    w = run(w, I, { type: 'index.buy', market: 'lagos', amount: 50_000_000 }).world;
    const total = moneyByCurrency(w);
    const out = produce(w, (d) => {
      const c = d.companies[c0.id]!;
      const last = c.finance.history[c.finance.history.length - 1]!;
      last.net = 10_000_000;
      listedDividends(d as World, c, d.markets.lagos!.month);
    });
    expect(out.markets.lagos!.exchange!.dividends[I]).toBeGreaterThan(0);
    zero(total, out);
  });

  it('blacks out a board member while a vote is open, and in the last week before results', () => {
    const w0 = ready();
    const c0 = listedIn(w0, 'lagos')[0]!;
    const w = produce(w0, (d) => {
      d.companies[c0.id]!.board.push(I);
    });
    // Results week: the last quarter of the month.
    const late = produce(w, (d) => {
      d.markets.lagos!.settledAt = 0;
      d.markets.lagos!.monthMs = 1000;
    });
    const r1 = tryRun(late, I, { type: 'shares.buy', companyId: c0.id, amount: 10_000_000 }, 900);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('shares.blackout');
    const r2 = tryRun(late, I, { type: 'shares.buy', companyId: c0.id, amount: 10_000_000 }, 100);
    expect(r2.ok).toBe(true);
    expect(lagosListings(late).find((l) => l.companyId === c0.id)!.insider).toBe(true);
  });
});
