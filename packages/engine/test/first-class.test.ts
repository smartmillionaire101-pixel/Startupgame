/**
 * First class, both ways (player feedback: "When I book first class travel
 * the return is always economy"), and the lounge and the flight as things to
 * do (bankers note). A return booked with the flight out is charged as its
 * own leg and flown in its cabin; flying home with no cabin asked for uses
 * the return you hold, else the cabin you flew out in. Old worlds book,
 * fly and land exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { addFounder, makeWorld, moneyByCurrency, run, tryRun } from './helpers.js';
import { playerView } from '../src/views.js';
import {
  INFLIGHT_FX,
  LOUNGE_FX,
  cabinFare,
  flightFare,
  legFare,
  type CabinClass,
} from '../src/travel.js';
import { BANKERS_NOTE, INVESTOR_NOTE, MORE_GAMES_NOTE } from '../src/releases.js';
import { needsOf } from '../src/needs.js';
import { stressOf } from '../src/lifebars.js';
import type { World } from '../src/types.js';

const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Update.' }).world;

/** A founder in Lagos with money for first class both ways. */
function world(note: string | null = BANKERS_NOTE): World {
  let w = addFounder(makeWorld(), 'host', 'lagos');
  if (note) w = announce(w, note);
  w = structuredClone(w);
  const p = w.players.host!;
  p.energy = 50;
  p.stress = 50;
  p.hours.used = 40;
  p.needs = { hunger: 40, hygiene: 40, fun: 40, social: 40 };
  const local = w.accounts[p.accounts.local]!;
  local.balance = Math.max(local.balance, 40 * flightFare(w, p, 'london'));
  return w;
}
const balance = (w: World) => w.accounts[w.players.host!.accounts.local]!.balance;
/** The host's statement lines whose memo matches. */
const ledgerLines = (w: World, re: RegExp) =>
  w.accounts[w.players.host!.accounts.local]!.recent.filter((t) => re.test(t.memo));

describe('first class both ways', () => {
  it('a return booked with first stays first, charged per leg', () => {
    let w = world();
    const p = w.players.host!;
    const out = cabinFare(w, p, 'london', 'first');
    const back = legFare(w, p, 'london', 'lagos', 'first');
    const supply = moneyByCurrency(w);
    const before = balance(w);
    w = run(w, 'host', {
      type: 'travel.book',
      to: 'london',
      cabin: 'first',
      returnCabin: 'first',
    }).world;
    expect(w.players.host!.flightTicket).toMatchObject({
      cabin: 'first',
      paid: out,
      return: { cabin: 'first', paid: back },
    });
    expect(balance(w)).toBe(before - out - back);
    expect(moneyByCurrency(w)).toEqual(supply);
    // Two legs on the ledger, each its own line.
    expect(ledgerLines(w, /^Flight Lagos → London \(First class\)$/).map((l) => l.amount)).toEqual([
      -out,
    ]);
    expect(
      ledgerLines(w, /^Flight London → Lagos \(First class, return\)$/).map((l) => l.amount),
    ).toEqual([-back]);
    // Fly out: the return travels with you.
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
    expect(w.players.host!.location).toMatchObject({
      market: 'london',
      cabin: 'first',
      returnLeg: { cabin: 'first', paid: back },
    });
    expect(playerView(w, 'host')!.flights.heldReturn).toEqual({ cabin: 'first', paid: back });
    // Fly home with no cabin asked for: the return you hold, first, nothing charged.
    const abroad = balance(w);
    w = run(w, 'host', { type: 'travel.book', to: 'lagos' }).world;
    expect(w.players.host!.flightTicket).toMatchObject({ cabin: 'first', prepaid: true });
    expect(balance(w)).toBe(abroad);
    const home = run(w, 'host', { type: 'travel.fly', to: 'lagos' });
    expect((home.result as { cabin: { cabin: CabinClass } }).cabin.cabin).toBe('first');
    expect(String((home.result as { text: string }).text)).toMatch(/return ticket/);
    expect(home.world.players.host!.location).toBeUndefined();
    expect(balance(home.world)).toBe(before - out - back);
    expect(moneyByCurrency(home.world)).toEqual(supply);
  });

  it('the return can be another cabin, and changing it home refunds the held leg', () => {
    let w = world();
    const p = w.players.host!;
    const before = balance(w);
    const out = cabinFare(w, p, 'london', 'first');
    const back = legFare(w, p, 'london', 'lagos', 'business');
    w = run(w, 'host', {
      type: 'travel.book',
      to: 'london',
      cabin: 'first',
      returnCabin: 'business',
    }).world;
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
    // Home in first instead: the business return is refunded, first is charged.
    const firstHome = cabinFare(w, w.players.host!, 'lagos', 'first');
    w = run(w, 'host', { type: 'travel.book', to: 'lagos', cabin: 'first' }).world;
    expect(w.players.host!.flightTicket).toMatchObject({ cabin: 'first', paid: firstHome });
    expect(w.players.host!.flightTicket!.prepaid).toBeUndefined();
    expect(w.players.host!.location!.returnLeg).toBeUndefined();
    expect(balance(w)).toBe(before - out - back + back - firstHome);
  });

  it('cancelling the flight home on a return keeps the return; cancelling the trip refunds both legs', () => {
    let w = world();
    const before = balance(w);
    const supply = moneyByCurrency(w);
    w = run(w, 'host', {
      type: 'travel.book',
      to: 'london',
      cabin: 'first',
      returnCabin: 'first',
      hotel: 'luxury',
    }).world;
    const cancelled = run(w, 'host', { type: 'travel.cancel' }).world;
    expect(balance(cancelled)).toBe(before);
    expect(moneyByCurrency(cancelled)).toEqual(supply);
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
    const held = w.players.host!.location!.returnLeg!;
    w = run(w, 'host', { type: 'travel.book', to: 'lagos' }).world;
    const mid = balance(w);
    w = run(w, 'host', { type: 'travel.cancel' }).world;
    expect(balance(w)).toBe(mid);
    expect(w.players.host!.location!.returnLeg).toEqual(held);
  });

  it('without a return, flying home uses the cabin you flew out in (economy when you can’t pay)', () => {
    let w = world();
    w = run(w, 'host', { type: 'travel.book', to: 'london', cabin: 'first' }).world;
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
    const view = playerView(w, 'host')!.flights;
    expect(view.lastCabin).toBe('first');
    const price = cabinFare(w, w.players.host!, 'lagos', 'first');
    const a = run(w, 'host', { type: 'travel.book', to: 'lagos' }).world;
    expect(a.players.host!.flightTicket).toMatchObject({ cabin: 'first', paid: price });
    // An explicit economy is economy.
    const b = run(w, 'host', { type: 'travel.book', to: 'lagos', cabin: 'economy' }).world;
    expect(b.players.host!.flightTicket!.cabin).toBeUndefined();
    // Short of first: economy home (standby), as before.
    const poor = structuredClone(w);
    poor.accounts[poor.players.host!.accounts.local]!.balance = 10;
    const c = run(poor, 'host', { type: 'travel.book', to: 'lagos' }).world;
    expect(c.players.host!.flightTicket!.cabin).toBeUndefined();
    expect(c.players.host!.flightTicket!.paid).toBe(10);
  });

  it('a return home is refused when flying home, or when you already hold one', () => {
    let w = world();
    w = run(w, 'host', {
      type: 'travel.book',
      to: 'london',
      cabin: 'business',
      returnCabin: 'business',
    }).world;
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
    const home = tryRun(w, 'host', { type: 'travel.book', to: 'lagos', returnCabin: 'first' });
    expect(home.ok).toBe(false);
    if (!home.ok) expect(home.error.code).toBe('travel.return');
    const again = tryRun(w, 'host', {
      type: 'travel.book',
      to: 'nairobi',
      returnCabin: 'first',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('travel.return');
    // On to Nairobi one way: the return home still goes with you.
    w = run(w, 'host', { type: 'travel.book', to: 'nairobi' }).world;
    w = run(w, 'host', { type: 'travel.fly', to: 'nairobi' }).world;
    expect(w.players.host!.location!.returnLeg!.cabin).toBe('business');
  });

  it('the view prices the way home per cabin from each city', () => {
    const w = world();
    const p = w.players.host!;
    const v = playerView(w, 'host')!.flights;
    expect(v.returnTo!.london!.map((c) => c.cabin)).toEqual(['economy', 'business', 'first']);
    expect(v.returnTo!.london![2]!.price).toBe(legFare(w, p, 'london', 'lagos', 'first'));
    expect(v.returnTo).not.toHaveProperty('lagos');
    expect(v.heldReturn).toBeNull();
  });
});

describe('the lounge', () => {
  it('first class: dine, a drink, a shower, a rest and the people, each once', () => {
    let w = world();
    w = run(w, 'host', { type: 'travel.book', to: 'london', cabin: 'first' }).world;
    const p0 = structuredClone(w.players.host!);
    const v = playerView(w, 'host')!.flights.lounge!;
    expect(v.cabin).toBe('first');
    expect(v.acts.map((a) => a.act)).toEqual(['dine', 'drink', 'shower', 'rest', 'mingle']);
    for (const act of ['dine', 'drink', 'shower', 'rest', 'mingle'] as const)
      w = run(w, 'host', { type: 'travel.lounge', act }).world;
    const p = w.players.host!;
    expect(needsOf(p).hunger).toBe(needsOf(p0).hunger + LOUNGE_FX.dine.first.hunger!);
    expect(needsOf(p).hygiene).toBe(needsOf(p0).hygiene + LOUNGE_FX.shower.first.hygiene!);
    expect(p.energy).toBe(p0.energy + LOUNGE_FX.rest.first.energy!);
    expect(stressOf(p)).toBeLessThan(stressOf(p0));
    expect(p.network).toBe(Math.min(100, p0.network + 1));
    expect(p.flightTicket!.lounge).toHaveLength(5);
    const again = tryRun(w, 'host', { type: 'travel.lounge', act: 'dine' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('travel.lounge.done');
  });

  it('business is the lighter version; economy has no lounge', () => {
    let w = world();
    const eco = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
    const r = tryRun(eco, 'host', { type: 'travel.lounge', act: 'dine' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.lounge');
    expect(playerView(eco, 'host')!.flights.lounge).toBeNull();
    w = run(w, 'host', { type: 'travel.book', to: 'london', cabin: 'business' }).world;
    const p0 = structuredClone(w.players.host!);
    w = run(w, 'host', { type: 'travel.lounge', act: 'dine' }).world;
    expect(needsOf(w.players.host!).hunger).toBe(
      needsOf(p0).hunger + LOUNGE_FX.dine.business.hunger!,
    );
  });

  it('meets another player flying first from the same airport', () => {
    let w = world();
    w = addFounder(w, 'guest', 'lagos', 'Guestco');
    w = structuredClone(w);
    w.accounts[w.players.guest!.accounts.local]!.balance = balance(w);
    w = run(w, 'host', { type: 'travel.book', to: 'london', cabin: 'first' }).world;
    w = run(w, 'guest', { type: 'travel.book', to: 'nairobi', cabin: 'first' }).world;
    const guests = playerView(w, 'host')!.flights.lounge!.guests;
    expect(guests.map((g) => g.id)).toEqual(['guest']);
    w = run(w, 'host', { type: 'travel.lounge', act: 'mingle', with: 'guest' }).world;
    expect(w.players.host!.contacts?.some((c) => c.refId === 'guest')).toBe(true);
    expect(w.players.guest!.contacts?.some((c) => c.refId === 'host')).toBe(true);
  });
});

describe('the flight', () => {
  const flown = (cabin: CabinClass) => {
    let w = world();
    w = run(w, 'host', { type: 'travel.book', to: 'london', cabin }).world;
    return run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
  };

  it('first class: dine, sleep in the bed, watch, the bar and the spa land with you', () => {
    let w = flown('first');
    const v = playerView(w, 'host')!.flights.inflight!;
    expect(v).toMatchObject({ cabin: 'first', longHaul: true, done: [] });
    expect(v.acts.map((a) => a.act)).toEqual(['dine', 'sleep', 'watch', 'work', 'bar', 'spa']);
    const p0 = structuredClone(w.players.host!);
    for (const act of ['dine', 'sleep', 'watch', 'bar', 'spa'] as const)
      w = run(w, 'host', { type: 'travel.inflight', act }).world;
    const p = w.players.host!;
    expect(p.energy).toBe(Math.min(100, p0.energy + INFLIGHT_FX.sleep.first!.energy!));
    expect(needsOf(p).hunger).toBe(needsOf(p0).hunger + INFLIGHT_FX.dine.first!.hunger!);
    expect(needsOf(p).hygiene).toBe(needsOf(p0).hygiene + INFLIGHT_FX.spa.first!.hygiene!);
    expect(stressOf(p)).toBeLessThan(stressOf(p0));
    // Slept through: no time to work, and nothing twice.
    const work = tryRun(w, 'host', { type: 'travel.inflight', act: 'work' });
    expect(work.ok).toBe(false);
    if (!work.ok) expect(work.error.code).toBe('travel.inflight.time');
    const twice = tryRun(w, 'host', { type: 'travel.inflight', act: 'dine' });
    expect(twice.ok).toBe(false);
  });

  it('working gives hours back; business has no bar, and the acts end with the next booking', () => {
    let w = flown('business');
    const v = playerView(w, 'host')!.flights.inflight!;
    expect(v.acts.map((a) => a.act)).toEqual(['dine', 'sleep', 'watch', 'work']);
    const bar = tryRun(w, 'host', { type: 'travel.inflight', act: 'bar' });
    expect(bar.ok).toBe(false);
    const used = w.players.host!.hours.used;
    w = run(w, 'host', { type: 'travel.inflight', act: 'work' }).world;
    expect(w.players.host!.hours.used).toBe(used - INFLIGHT_FX.work.business!.hours!);
    w = run(w, 'host', { type: 'travel.book', to: 'lagos' }).world;
    expect(playerView(w, 'host')!.flights.inflight).toBeNull();
    expect(tryRun(w, 'host', { type: 'travel.inflight', act: 'watch' }).ok).toBe(false);
  });

  it('economy has no acts: it is kept as it is', () => {
    const w = flown('economy');
    expect(playerView(w, 'host')!.flights.inflight).toBeNull();
    expect(tryRun(w, 'host', { type: 'travel.inflight', act: 'sleep' }).ok).toBe(false);
  });
});

describe('worlds without the bankers note', () => {
  for (const note of [INVESTOR_NOTE, MORE_GAMES_NOTE])
    it(`book, fly and land exactly as before (${note})`, () => {
      let w = world(note);
      // A return is refused; the lounge and the flight's acts are unknown commands.
      const r = tryRun(w, 'host', {
        type: 'travel.book',
        to: 'london',
        cabin: 'first',
        returnCabin: 'first',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('travel.return');
      w = run(w, 'host', { type: 'travel.book', to: 'london', cabin: 'first' }).world;
      const lounge = tryRun(w, 'host', { type: 'travel.lounge', act: 'dine' });
      expect(lounge.ok).toBe(false);
      if (!lounge.ok) expect(lounge.error.code).toBe('command.unknown');
      const v = playerView(w, 'host')!.flights;
      expect(v).not.toHaveProperty('returnTo');
      expect(v).not.toHaveProperty('lounge');
      w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
      // No cabin remembered, no return, no acts: the way home is economy as it always was.
      expect(w.players.host!.location).toEqual({
        market: 'london',
        since: w.players.host!.location!.since,
      });
      expect(w.players.host!.lastFlight).toBeUndefined();
      const fx = tryRun(w, 'host', { type: 'travel.inflight', act: 'sleep' });
      expect(fx.ok).toBe(false);
      const home = run(w, 'host', { type: 'travel.book', to: 'lagos' }).world;
      expect(home.players.host!.flightTicket!.cabin).toBeUndefined();
      expect(home.players.host!.flightTicket!.paid).toBe(flightFare(w, w.players.host!, 'lagos'));
    });
});
