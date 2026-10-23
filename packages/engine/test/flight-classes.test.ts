import { describe, expect, it } from 'vitest';
import { addFounder, makeWorld, moneyByCurrency, run, tryRun } from './helpers.js';
import { playerView } from '../src/views.js';
import {
  CABIN,
  CABIN_CLASSES,
  cabinEffects,
  cabinFare,
  flightFare,
  flightFareUsd,
  type CabinClass,
} from '../src/travel.js';
import { usdToLocal } from '../src/helpers.js';
import { INVESTOR_NOTE, JOBS_NOTE } from '../src/releases.js';
import { needsOf } from '../src/needs.js';
import { stressOf } from '../src/lifebars.js';
import type { MarketId } from '../src/data/markets.js';
import type { World } from '../src/types.js';

const announce = (w: World, id: string = INVESTOR_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'Update.' }).world;

/** A founder in Lagos (or `market`), with a fresh mind and money for first class. */
function world(note = true, market: MarketId = 'lagos'): World {
  let w = addFounder(makeWorld(), 'host', market);
  if (note) w = announce(w);
  w = structuredClone(w);
  const p = w.players.host!;
  p.energy = 50;
  p.stress = 50;
  p.needs = { hunger: 50, hygiene: 50, fun: 50, social: 50 };
  const local = w.accounts[p.accounts.local]!;
  local.balance = Math.max(local.balance, 20 * flightFare(w, p, 'london'));
  return w;
}
const balance = (w: World) => w.accounts[w.players.host!.accounts.local]!.balance;

describe('flight classes: prices', () => {
  it('business is 3.5× and first 7× the economy fare, in your home currency', () => {
    for (const market of ['lagos', 'nairobi', 'london'] as MarketId[]) {
      const w = world(true, market);
      const p = w.players.host!;
      const to: MarketId = market === 'london' ? 'lagos' : 'london';
      const home = w.markets[market]!;
      const usd = flightFareUsd(market, to);
      expect(cabinFare(w, p, to, 'economy')).toBe(flightFare(w, p, to));
      expect(cabinFare(w, p, to, 'business')).toBe(usdToLocal(w, home, usd * 3.5));
      expect(cabinFare(w, p, to, 'first')).toBe(usdToLocal(w, home, usd * 7));
      const eco = cabinFare(w, p, to, 'economy');
      expect(cabinFare(w, p, to, 'business') / eco).toBeCloseTo(3.5, 1);
      expect(cabinFare(w, p, to, 'first') / eco).toBeCloseTo(7, 1);
    }
  });

  it('the view lists the three cabins per destination with price and affordability', () => {
    const w = world();
    const p = w.players.host!;
    const v = playerView(w, 'host')!;
    const london = v.flights.cabinTo!.london!;
    expect(london.map((c) => c.cabin)).toEqual(['economy', 'business', 'first']);
    for (const c of london) {
      expect(c.price).toBe(cabinFare(w, p, 'london', c.cabin));
      expect(c.affordable).toBe(true);
    }
    expect(london.find((c) => c.cabin === 'first')).toMatchObject({
      lounge: true,
      chauffeur: true,
    });
    expect(london.find((c) => c.cabin === 'economy')).toMatchObject({ lounge: false, hours: 2 });
    // Short of first class: flagged, and refused.
    const poor = structuredClone(w);
    poor.accounts[p.accounts.local]!.balance = cabinFare(w, p, 'london', 'business');
    const pv = playerView(poor, 'host')!.flights.cabinTo!.london!;
    expect(pv.map((c) => c.affordable)).toEqual([true, true, false]);
    const r = tryRun(poor, 'host', { type: 'travel.book', to: 'london', cabin: 'first' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.funds');
  });
});

describe('flight classes: money', () => {
  for (const cabin of CABIN_CLASSES)
    it(`${cabin}: charged once, refunded in full, money conserved`, () => {
      let w = world();
      const price = cabinFare(w, w.players.host!, 'london', cabin);
      const before = balance(w);
      const supply = moneyByCurrency(w);
      w = run(w, 'host', { type: 'travel.book', to: 'london', cabin, hotel: 'business' }).world;
      const hotel = w.players.host!.flightTicket!.hotel!.paid;
      expect(balance(w)).toBe(before - price - hotel);
      expect(w.players.host!.flightTicket!.cabin).toBe(cabin === 'economy' ? undefined : cabin);
      expect(moneyByCurrency(w)).toEqual(supply);
      w = run(w, 'host', { type: 'travel.cancel' }).world;
      expect(balance(w)).toBe(before);
      w = run(w, 'host', { type: 'travel.book', to: 'london', cabin }).world;
      w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
      expect(balance(w)).toBe(before - price);
      expect(moneyByCurrency(w)).toEqual(supply);
    });

  it('no standby up front: flying home in first needs the full fare', () => {
    let w = world();
    w = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
    w = structuredClone(run(w, 'host', { type: 'travel.fly', to: 'london' }).world);
    w.accounts[w.players.host!.accounts.local]!.balance = 10;
    const r = tryRun(w, 'host', { type: 'travel.book', to: 'lagos', cabin: 'first' });
    expect(r.ok).toBe(false);
    // Economy home still flies standby for what you have.
    expect(tryRun(w, 'host', { type: 'travel.book', to: 'lagos' }).ok).toBe(true);
  });
});

describe('flight classes: the experience', () => {
  const fly = (cabin: CabinClass, to: MarketId = 'london') => {
    let w = world();
    const p0 = structuredClone(w.players.host!);
    w = run(w, 'host', { type: 'travel.book', to, cabin }).world;
    const r = run(w, 'host', { type: 'travel.fly', to });
    return { p0, p: r.world.players.host!, r: r.result as Record<string, unknown>, w: r.world };
  };

  it('economy is tiring, business nearly fresh, first restful', () => {
    const eco = fly('economy');
    const biz = fly('business');
    const first = fly('first');
    expect(eco.p.energy).toBe(eco.p0.energy + CABIN.economy.energy);
    expect(stressOf(eco.p)).toBe(stressOf(eco.p0) + CABIN.economy.stress);
    expect(eco.p.hours.used).toBe(eco.p0.hours.used + CABIN.economy.hours);
    expect(biz.p.energy).toBeGreaterThan(eco.p.energy);
    expect(first.p.energy).toBeGreaterThan(biz.p.energy);
    expect(first.p.energy).toBe(first.p0.energy + CABIN.first.energy);
    expect(stressOf(first.p)).toBeLessThan(stressOf(first.p0));
    expect(needsOf(first.p).fun).toBe(needsOf(first.p0).fun + CABIN.first.fun);
    expect(first.p.hours.used).toBe(first.p0.hours.used);
    expect(first.p.network).toBe(Math.min(100, first.p0.network + 2));
    expect(first.r.cabin).toMatchObject({ cabin: 'first', chauffeur: true, lounge: true });
    expect(String(first.r.text)).toMatch(/chauffeur/);
    expect(String(eco.r.text)).toMatch(/tired/);
  });

  it('first class is a milestone, once', () => {
    const { p, w } = fly('first');
    expect(p.milestones['lifestyle.first-class']).toBe(w.markets.lagos!.month);
    expect(fly('economy').p.milestones['lifestyle.first-class']).toBeUndefined();
    const biz = fly('business');
    expect(biz.p.milestones['lifestyle.business-class']).toBe(biz.w.markets.lagos!.month);
  });

  it('shorter flights matter less', () => {
    expect(cabinEffects('economy', 'lagos', 'nairobi').energy).toBe(
      Math.round(CABIN.economy.energy * 0.75),
    );
    const near = fly('economy', 'nairobi');
    expect(near.p.energy).toBe(near.p0.energy + Math.round(CABIN.economy.energy * 0.75));
  });
});

describe('flight classes: worlds without the note', () => {
  it('fly exactly as before: no cabins in the view, upgrades refused, no effects on landing', () => {
    let w = world(false);
    // An older note does not switch it on.
    w = announce(w, JOBS_NOTE);
    expect(playerView(w, 'host')!.flights).not.toHaveProperty('cabinTo');
    const r = tryRun(w, 'host', { type: 'travel.book', to: 'london', cabin: 'business' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.cabin');
    const p0 = structuredClone(w.players.host!);
    const before = balance(w);
    // An explicit economy is the ticket as it always was.
    const a = run(w, 'host', { type: 'travel.book', to: 'london', cabin: 'economy' }).world;
    const b = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
    expect(a).toEqual(b);
    const landed = run(b, 'host', { type: 'travel.fly', to: 'london' });
    const p = landed.world.players.host!;
    expect(balance(landed.world)).toBe(before - flightFare(w, p0, 'london'));
    expect(p.energy).toBe(p0.energy);
    expect(p.stress).toBe(p0.stress);
    expect(p.hours.used).toBe(p0.hours.used);
    expect(p.network).toBe(p0.network);
    expect(landed.result).not.toHaveProperty('cabin');
    expect((landed.result as { hours: number }).hours).toBe(0);
  });
});
