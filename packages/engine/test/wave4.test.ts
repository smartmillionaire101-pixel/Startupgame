import { describe, expect, it } from 'vitest';
import {
  CLOCK_EPOCH,
  dueSettlements,
  nextSettlementAt,
  periodOf,
  periodStart,
} from '../src/clock.js';
import { flightFareUsd, MAX_FLIGHTS_PER_MONTH, tripCostUsd } from '../src/travel.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  T0,
  tryRun,
} from './helpers.js';

const MIN = 60_000;
const MONTH = 5 * MIN;
const savings = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

describe('the period clock (Wave 4)', () => {
  it('numbers periods from the epoch', () => {
    expect(periodOf(CLOCK_EPOCH, MONTH)).toBe(0);
    expect(periodOf(CLOCK_EPOCH + MONTH - 1, MONTH)).toBe(0);
    expect(periodOf(CLOCK_EPOCH + MONTH, MONTH)).toBe(1);
    expect(nextSettlementAt(CLOCK_EPOCH + 2 * MIN, MONTH)).toBe(CLOCK_EPOCH + MONTH);
  });

  it('settles each market once per period, and not again for the same one', () => {
    let w = makeWorld(3, ['lagos', 'london']);
    // A new market is up to date until the next boundary.
    expect(dueSettlements(w, T0, MONTH)).toEqual([]);
    const next = nextSettlementAt(T0, MONTH);
    const due = dueSettlements(w, next + 1, MONTH);
    expect(due).toEqual([
      { market: 'lagos', at: next },
      { market: 'london', at: next },
    ]);
    for (const d of due)
      w = run(w, null, { type: 'market.settle', ...d, monthMs: MONTH }, next + 1).world;
    expect(w.markets.lagos!.month).toBe(1);
    expect(w.markets.lagos!.settledAt).toBe(next);
    expect(dueSettlements(w, next + 1, MONTH)).toEqual([]);
    expect(
      tryRun(w, null, { type: 'market.settle', market: 'lagos', at: next, monthMs: MONTH }).ok,
    ).toBe(false);
  });

  it('catches up at most seven periods after an outage', () => {
    const w = makeWorld(3, ['lagos']);
    const later = T0 + 100 * MONTH;
    const due = dueSettlements(w, later, MONTH);
    expect(due).toHaveLength(7);
    expect(due.at(-1)!.at).toBe(periodStart(periodOf(later, MONTH), MONTH));
  });

  it('moves saved day-clock worlds onto periods with one settlement', () => {
    const w = makeWorld(3, ['lagos']);
    delete w.markets.lagos!.settledAt;
    const now = T0 + 2 * MIN;
    expect(dueSettlements(w, now, MONTH)).toEqual([
      { market: 'lagos', at: periodStart(periodOf(now, MONTH), MONTH) },
    ]);
  });

  it('still accepts the old date-based settlements, and extra (dev) months', () => {
    let w = makeWorld(3, ['lagos']);
    w = run(w, null, { type: 'market.settle', market: 'lagos', date: '2099-01-01' }).world;
    expect(w.markets.lagos!.month).toBe(1);
    w = run(w, null, { type: 'market.settle', market: 'lagos', monthMs: MONTH }).world;
    expect(w.markets.lagos!.month).toBe(2);
  });

  it('shows the countdown in the view', () => {
    const w = addFounder(makeWorld(3, ['lagos']));
    expect(playerView(w, 'u_founder')!.clock).toBeNull();
    const v = playerView(w, 'u_founder', { now: T0, monthMs: MONTH })!;
    expect(v.clock).toEqual({
      monthMs: MONTH,
      nextSettlementAt: nextSettlementAt(T0, MONTH),
      serverNow: T0,
    });
  });
});

describe('away mode and inactivity in game months (Wave 4)', () => {
  const settleAt = (w: World, k: number, monthMs = MONTH) =>
    run(
      w,
      null,
      { type: 'market.settle', market: 'lagos', at: T0 + k * monthMs, monthMs },
      T0 + k * monthMs,
    ).world;

  it('hibernates a company after two idle months, with an inbox note, and never wakes it', () => {
    let w = addFounder(makeWorld(3, ['lagos']));
    const cid = companyOf(w, 'u_founder').id;
    w = settleAt(w, 1);
    expect(w.companies[cid]!.hibernation).toBeFalsy();
    w = settleAt(w, 2);
    expect(w.companies[cid]!.hibernation).toBeTruthy();
    expect(w.inbox.u_founder!.some((i) => i.text.startsWith('While you were away'))).toBe(true);
    // Back again: seen, but the company stays asleep until the player chooses.
    w = run(w, 'u_founder', { type: 'player.seen' }, T0 + 2 * MONTH + 1).world;
    w = settleAt(w, 3);
    expect(w.companies[cid]!.hibernation).toBeTruthy();
    expect(w.players.u_founder!.lastActiveAt).toBe(T0 + 2 * MONTH + 1);
  });

  it('warns after 6 idle months and offers companies for sale after 12', () => {
    let w = addFounder(makeWorld(3, ['lagos']));
    const cid = companyOf(w, 'u_founder').id;
    for (let k = 1; k <= 6; k++) w = settleAt(w, k);
    expect(w.players.u_founder!.inactivity.warned).toBe(true);
    expect(w.companies[cid]!.forSale).toBe(false);
    for (let k = 7; k <= 12; k++) w = settleAt(w, k);
    expect(w.companies[cid]!.forSale).toBe(true);
  });

  it('keeps an active player out of away mode', () => {
    let w = addFounder(makeWorld(3, ['lagos']));
    const cid = companyOf(w, 'u_founder').id;
    for (let k = 1; k <= 4; k++) {
      w = run(w, 'u_founder', { type: 'player.seen' }, T0 + k * MONTH - MIN).world;
      w = settleAt(w, k);
    }
    expect(w.companies[cid]!.hibernation).toBeFalsy();
  });
});

describe('flights: being somewhere (Wave 4)', () => {
  it('flies one way for half a round trip, moves you, and flies you home', () => {
    let w = addFounder(makeWorld(3, ['lagos', 'london']));
    const total = moneyByCurrency(w);
    const v0 = playerView(w, 'u_founder')!;
    expect(v0.me.location).toBeNull();
    expect(v0.here).toBeNull(); // at home the client uses `market`
    expect(v0.flights.hours).toBe(4);
    expect(v0.flights.fareTo.lagos).toBeUndefined();
    const fare = v0.flights.fareTo.london!;
    expect(flightFareUsd('lagos', 'london')).toBe(tripCostUsd('lagos', 'london') / 2);

    const before = savings(w, 'u_founder');
    const hours = w.players.u_founder!.hours.used;
    const r = run(w, 'u_founder', { type: 'travel.fly', to: 'london' }, T0 + 1000);
    w = r.world;
    expect(r.result.cost).toBe(fare);
    expect(r.result.location).toEqual({ market: 'london', name: 'London', sinceAt: T0 + 1000 });
    expect(savings(w, 'u_founder')).toBe(before - fare);
    expect(w.players.u_founder!.hours.used - hours).toBe(4);
    const v = playerView(w, 'u_founder')!;
    expect(v.me.location).toEqual({ market: 'london', name: 'London', sinceAt: T0 + 1000 });
    expect(v.market.id).toBe('lagos');
    expect(v.here!.id).toBe('london');
    expect(v.here!.currency).toBe('GBP');
    expect(v.here!.businesses.length).toBeGreaterThan(0);
    expect(v.here!.funds.some((f) => f.market === 'london')).toBe(true);
    expect(Object.keys(v.flights.fareTo)).toEqual(['lagos']);

    expect(tryRun(w, 'u_founder', { type: 'travel.fly', to: 'london' }).ok).toBe(false);
    w = run(w, 'u_founder', { type: 'travel.fly', to: 'lagos' }).world;
    expect(w.players.u_founder!.location).toBeUndefined();
    expect(playerView(w, 'u_founder')!.here).toBeNull();
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('allows a handful of flights a month', () => {
    let w = addInvestor(makeWorld(3, ['lagos', 'london']), 'u_inv');
    for (let i = 0; i < MAX_FLIGHTS_PER_MONTH; i++)
      w = run(w, 'u_inv', { type: 'travel.fly', to: i % 2 ? 'lagos' : 'london' }).world;
    const r = tryRun(w, 'u_inv', { type: 'travel.fly', to: 'london' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.flights');
  });

  it('validates city actions against where you are, paying abroad from home savings', () => {
    let w = addInvestor(makeWorld(3, ['lagos', 'london']), 'u_inv');
    const total = moneyByCurrency(w);
    const londonCafe = Object.values(w.markets.london!.businesses!).find((b) =>
      ['cafe', 'restaurant', 'bar'].includes(b.kind),
    )!;
    const lagosCafe = Object.values(w.markets.lagos!.businesses!).find((b) =>
      ['cafe', 'restaurant', 'bar'].includes(b.kind),
    )!;
    const item = (b: typeof londonCafe) =>
      (() => {
        const v = playerView(w, 'u_inv')!;
        return (v.here ?? v.market).businesses;
      })().find((x) => x.id === b.id)?.venue?.items[0]?.id ?? 'coffee';
    const buyLondon = { type: 'venue.buy' as const, businessId: londonCafe.id, itemId: 'x' };
    expect(tryRun(w, 'u_inv', buyLondon).ok).toBe(false);
    const lagosItem = item(lagosCafe);
    expect(
      tryRun(w, 'u_inv', { type: 'venue.buy', businessId: lagosCafe.id, itemId: lagosItem }).ok,
    ).toBe(true);

    w = run(w, 'u_inv', { type: 'travel.fly', to: 'london' }).world;
    const londonItem = item(londonCafe);
    const tillBefore = w.accounts[londonCafe.account]!.balance;
    const before = savings(w, 'u_inv');
    w = run(w, 'u_inv', { type: 'venue.buy', businessId: londonCafe.id, itemId: londonItem }).world;
    expect(w.accounts[londonCafe.account]!.balance).toBeGreaterThan(tillBefore);
    expect(savings(w, 'u_inv')).toBeLessThan(before);
    // Home businesses are out of reach while abroad.
    expect(
      tryRun(w, 'u_inv', { type: 'venue.buy', businessId: lagosCafe.id, itemId: lagosItem }).ok,
    ).toBe(false);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('relocating clears the location', () => {
    let w = addInvestor(makeWorld(3, ['lagos', 'london']), 'u_inv');
    w = run(w, 'u_inv', { type: 'travel.fly', to: 'london' }).world;
    w = run(w, 'u_inv', { type: 'player.relocate', market: 'london' }).world;
    expect(w.players.u_inv!.market).toBe('london');
    expect(w.players.u_inv!.location).toBeUndefined();
  });
});

describe('getting around town (Wave 4)', () => {
  it('charges bus and taxi fares from the cost of living, in the city you are in', () => {
    let w = addInvestor(makeWorld(3, ['lagos', 'london']), 'u_inv');
    const total = moneyByCurrency(w);
    const col = w.markets.lagos!.data.costOfLiving * 100;
    const r = run(w, 'u_inv', { type: 'city.ride', mode: 'taxi', distance: 'medium' });
    w = r.world;
    expect(r.result.fare).toBe(Math.round(col * 0.02));
    expect(r.result.currency).toBe('NGN');
    const bus = run(w, 'u_inv', { type: 'city.ride', mode: 'bus', distance: 'short' });
    expect(bus.result.fare).toBe(Math.round(col * 0.002));
    w = run(w, 'u_inv', { type: 'travel.fly', to: 'london' }).world;
    const before = savings(w, 'u_inv');
    const abroad = run(w, 'u_inv', { type: 'city.ride', mode: 'taxi', distance: 'long' });
    w = abroad.world;
    expect(abroad.result.currency).toBe('GBP');
    expect(abroad.result.fare).toBe(Math.round(w.markets.london!.data.costOfLiving * 100 * 0.035));
    expect(before - savings(w, 'u_inv')).toBe(abroad.result.paid);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('limits rides per month', () => {
    let w = addInvestor(makeWorld(3, ['lagos']), 'u_inv');
    for (let i = 0; i < 30; i++)
      w = run(w, 'u_inv', { type: 'city.ride', mode: 'bus', distance: 'short' }).world;
    expect(tryRun(w, 'u_inv', { type: 'city.ride', mode: 'bus', distance: 'short' }).ok).toBe(
      false,
    );
  });
});
