/**
 * City places (places.ts, data/places.ts): named buildings in every city,
 * members' doors by player type with the reason and what opens them,
 * government appointments booked on the game clock (go in only from the
 * booked time), what each place does, and the release switch (old worlds
 * play exactly as before).
 */
import { describe, expect, it } from 'vitest';
import { CITY_DISTRICTS } from '../src/data/businesses.js';
import { MARKET_IDS } from '../src/data/markets.js';
import { CITY_PLACES, PLACE_ROLES, PLACE_SPECS } from '../src/data/places.js';
import { dispatch } from '../src/dispatch.js';
import {
  DAY_MIN,
  MONTH_MIN,
  cityPlaces,
  gameMinute,
  placeAccess,
  findPlace,
} from '../src/places.js';
import { INVESTOR_NOTE, PLACES_NOTE, RELEASES, investorOn, placesOn } from '../src/releases.js';
import { MAX_FLIGHTS_PER_MONTH } from '../src/travel.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  DAY,
  T0,
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const I = 'u_investor';
const announce = (w: World, id: string = PLACES_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'City places.' }).world;
const placesWorld = () => addInvestor(addFounder(announce(makeWorld(42, ['lagos', 'nairobi']))), I);
/** Real milliseconds per game minute in a test world (one real day per month). */
const MS_PER_MIN = DAY / MONTH_MIN;
/** The real time a game minute falls at, from T0 (no settlement in between). */
const at = (w: World, min: number) => T0 + (min - gameMinute(w.markets.lagos!, T0)) * MS_PER_MIN;
/** A copy of the world to change by hand (dispatch freezes what it returns). */
const thaw = (w: World): World => structuredClone(w);

describe('city places: every city has its named buildings', () => {
  it('names every role in every city, in a real district, with no name twice', () => {
    for (const id of MARKET_IDS) {
      const places = cityPlaces(id);
      expect(places.map((p) => p.role)).toEqual([...PLACE_ROLES]);
      for (const p of places) {
        expect(p.name.length).toBeGreaterThan(3);
        expect(CITY_DISTRICTS[id]).toContain(p.district);
        expect(findPlace(p.id)?.name).toBe(p.name);
      }
      expect(new Set(places.map((p) => p.name)).size).toBe(places.length);
      expect(Object.keys(CITY_PLACES[id]).length).toBe(PLACE_ROLES.length);
    }
  });

  it('has government offices by appointment, members-only places and public ones', () => {
    const kinds = PLACE_ROLES.map((r) => PLACE_SPECS[r].access);
    expect(kinds).toContain('appointment');
    expect(kinds).toContain('members');
    expect(kinds).toContain('public');
    for (const r of PLACE_ROLES) {
      const s = PLACE_SPECS[r];
      if (s.access === 'members') {
        expect(s.gates?.length).toBeGreaterThan(0);
        expect(s.refusal).toBeTruthy();
        expect(s.unlock).toBeTruthy();
      }
      expect(s.services.length).toBeGreaterThan(0);
    }
  });

  it('lists the places in the city view with what you can do there', () => {
    const w = placesWorld();
    const v = playerView(w, F, { now: T0, monthMs: DAY })!;
    const cp = v.market.cityPlaces!;
    expect(cp.places).toHaveLength(PLACE_ROLES.length);
    const chamber = cp.places.find((p) => p.role === 'chamber')!;
    expect(chamber.name).toBe('Lagos Chamber of Commerce');
    expect(chamber.open).toBe(true);
    expect(chamber.services[0]).toMatchObject({ id: 'mixer', ok: true });
    expect(cp.now.day).toBeGreaterThanOrEqual(1);
  });
});

describe('city places: who may go in', () => {
  it('turns a founder away from the family office and the trading floor, with the reason', () => {
    const w = placesWorld();
    const p = w.players[F]!;
    const fo = findPlace('lagos:family-office')!;
    expect(placeAccess(w, p, fo, T0)).toMatchObject({ ok: false, why: 'members' });
    const r = tryRun(w, F, { type: 'place.use', placeId: fo.id, service: 'principals' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('place.members');
      expect(r.error.message).toMatch(/track record/);
    }
    const floor = tryRun(w, F, {
      type: 'place.use',
      placeId: 'lagos:stock-exchange',
      service: 'floor-briefing',
    });
    expect(floor.ok).toBe(false);
    const view = playerView(w, F, { now: T0, monthMs: DAY })!.market.cityPlaces!;
    const card = view.places.find((x) => x.role === 'family-office')!;
    expect(card.open).toBe(false);
    expect(card.why).toBe('members');
    expect(card.unlock).toMatch(/investor career/);
  });

  it('lets a founder into the Founders’ Hub, an investor onto the floor, and not the other way round', () => {
    let w = placesWorld();
    const hub = run(w, F, { type: 'place.use', placeId: 'lagos:tech-hub', service: 'mentor' });
    expect(hub.result.effects.product).toBeGreaterThan(0);
    w = hub.world;
    const turned = tryRun(w, I, {
      type: 'place.use',
      placeId: 'lagos:tech-hub',
      service: 'mentor',
    });
    expect(turned.ok).toBe(false);
    const floor = run(w, I, {
      type: 'place.use',
      placeId: 'lagos:stock-exchange',
      service: 'floor-briefing',
    });
    expect(floor.result.effects.investing).toBeGreaterThan(0);
    // Once a month: a second visit waits for next month.
    const again = tryRun(floor.world, I, {
      type: 'place.use',
      placeId: 'lagos:stock-exchange',
      service: 'floor-briefing',
    });
    expect(again.ok).toBe(false);
  });

  it('opens the members’ club by lifestyle, the family office by investor career level', () => {
    const w = thaw(placesWorld());
    const club = findPlace('lagos:members-club')!;
    expect(placeAccess(w, w.players[F]!, club, T0).ok).toBe(false);
    w.players[F]!.lifestyleTier = 4;
    expect(placeAccess(w, w.players[F]!, club, T0).ok).toBe(true);
    const fo = findPlace('lagos:family-office')!;
    w.players[I]!.career = { reached: { 1: 0, 2: 0, 3: 0 }, invitations: [] };
    expect(placeAccess(w, w.players[I]!, fo, T0).ok).toBe(true);
  });

  it('keeps a visitor out of a place in another city', () => {
    const w = placesWorld();
    const there = findPlace('nairobi:chamber')!;
    expect(placeAccess(w, w.players[F]!, there, T0)).toMatchObject({ ok: false, why: 'away' });
  });
});

describe('city places: government offices by appointment', () => {
  it('books a slot in office hours later on, notifies you, and lets you in only from then', () => {
    let w = placesWorld();
    const tax = 'lagos:tax-office';
    const before = tryRun(w, F, { type: 'place.use', placeId: tax, service: 'tax-registration' });
    expect(!before.ok && before.error.code).toBe('place.appointment');
    const nowMin = gameMinute(w.markets.lagos!, T0);
    const booked = run(w, F, { type: 'place.book', placeId: tax });
    w = booked.world;
    const slot = booked.result.appointment.at as number;
    expect(slot).toBeGreaterThan(nowMin);
    expect(slot - nowMin).toBeLessThanOrEqual(2 * DAY_MIN);
    const hour = Math.floor((slot % DAY_MIN) / 60);
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(17);
    expect(w.inbox[F]![0]!.text).toMatch(/Appointment confirmed at Tax Office/);
    // Deterministic: the same world and command book the same time.
    expect(run(placesWorld(), F, { type: 'place.book', placeId: tax }).result.appointment.at).toBe(
      slot,
    );
    // Booking twice is refused.
    expect(tryRun(w, F, { type: 'place.book', placeId: tax }).ok).toBe(false);

    // Too early: refused with the time.
    const early = tryRun(
      w,
      F,
      { type: 'place.use', placeId: tax, service: 'tax-registration' },
      at(w, slot - 30),
    );
    expect(!early.ok && early.error.code).toBe('place.early');
    const v = playerView(w, F, { now: at(w, slot - 30), monthMs: DAY })!.market.cityPlaces!;
    expect(v.places.find((p) => p.id === tax)!.appointment).toMatchObject({ status: 'booked' });

    // At the appointment: the filing is done in person, at half the hours.
    const c0 = companyOf(w, F);
    const rule = Object.keys(c0.compliance).length;
    const used = w.players[F]!.hours.used;
    const done = run(
      w,
      F,
      { type: 'place.use', placeId: tax, service: 'tax-registration' },
      at(w, slot + 5),
    );
    const c1 = companyOf(done.world, F);
    expect(c1.compliance['lagos.tax-registration']).toBe(true);
    expect(Object.keys(c1.compliance).length).toBe(rule + 1);
    expect(done.world.players[F]!.hours.used - used).toBe(2);
    expect(done.world.players[F]!.places!.appointments[0]!.attended).toBe(true);
  });

  it('lapses a month after the slot, and lets residents only book', () => {
    const w = placesWorld();
    const booked = run(w, F, { type: 'place.book', placeId: 'lagos:central-bank' });
    const slot = booked.result.appointment.at as number;
    // A month on (the next settlement), the slot has lapsed.
    const later = thaw(booked.world);
    later.markets.lagos!.month += 1;
    const late = tryRun(
      later,
      F,
      { type: 'place.use', placeId: 'lagos:central-bank', service: 'payments-licence' },
      at(w, slot + 1),
    );
    expect(!late.ok && late.error.code).toBe('place.appointment');
    const away = tryRun(w, F, { type: 'place.book', placeId: 'nairobi:tax-office' });
    expect(!away.ok && away.error.code).toBe('place.resident');
    const walkIn = tryRun(w, F, { type: 'place.book', placeId: 'lagos:chamber' });
    expect(!walkIn.ok && walkIn.error.code).toBe('place.walkin');
  });

  it('licenses a fund manager, pays an incentive and issues a visa, keeping money whole', () => {
    let w = placesWorld();
    const money0 = moneyByCurrency(w);
    const go = (id: string, actor: string) => {
      const b = run(w, actor, { type: 'place.book', placeId: id });
      w = b.world;
      return at(w, b.result.appointment.at + 1);
    };
    // The central bank: a fund manager licence for the investor.
    let when = go('lagos:central-bank', I);
    const cred = w.players[I]!.investor!.lpCredibility;
    w = run(
      w,
      I,
      { type: 'place.use', placeId: 'lagos:central-bank', service: 'fund-licence' },
      when,
    ).world;
    expect(w.players[I]!.investor!.lpCredibility).toBeCloseTo(Math.min(1, cred + 0.1));
    // The investment promotion agency: a one-off incentive for the founder's company.
    when = go('lagos:ipa', F);
    const cash = w.accounts[companyOf(w, F).account]!.balance;
    w = run(w, F, { type: 'place.use', placeId: 'lagos:ipa', service: 'incentive' }, when).world;
    expect(w.accounts[companyOf(w, F).account]!.balance).toBeGreaterThan(cash);
    const twice = tryRun(
      w,
      F,
      { type: 'place.use', placeId: 'lagos:ipa', service: 'incentive' },
      when,
    );
    expect(twice.ok).toBe(false);
    // The embassy: a business visa for Nairobi; its flights stop counting.
    when = go('lagos:embassy', F);
    w = run(
      w,
      F,
      { type: 'place.use', placeId: 'lagos:embassy', service: 'visa', to: 'nairobi' },
      when,
    ).world;
    expect(w.players[F]!.places!.visas!.nairobi).toBe(w.markets.lagos!.month);
    const t = thaw(w);
    t.players[F]!.flights = { month: t.markets.lagos!.month, count: MAX_FLIGHTS_PER_MONTH };
    const fly = run(t, F, { type: 'travel.fly', to: 'nairobi' }, when);
    expect(fly.world.players[F]!.location?.market).toBe('nairobi');
    expect(fly.world.players[F]!.flights!.count).toBe(MAX_FLIGHTS_PER_MONTH);
    // Fees and the incentive move money between accounts; none is made or lost.
    expect(moneyByCurrency(w)).toEqual(money0);
  });
});

describe('city places: the release switch', () => {
  it('is the newest note and implies the investor career', () => {
    expect(RELEASES.at(-1)).toBe(PLACES_NOTE);
    const w = { announcements: [PLACES_NOTE] } as unknown as World;
    expect(placesOn(w)).toBe(true);
    expect(investorOn(w)).toBe(true);
    expect(placesOn({ announcements: [INVESTOR_NOTE] } as unknown as World)).toBe(false);
  });

  it('leaves old worlds as they were: no places in the view, the commands unknown', () => {
    const w = addFounder(
      run(makeWorld(42, ['lagos']), null, {
        type: 'system.announce',
        id: INVESTOR_NOTE,
        text: 'Investor career.',
      }).world,
    );
    expect(playerView(w, F, { now: T0, monthMs: DAY })!.market.cityPlaces).toBeNull();
    for (const cmd of [
      { type: 'place.book', placeId: 'lagos:tax-office' },
      { type: 'place.use', placeId: 'lagos:chamber', service: 'mixer' },
    ] as const) {
      const r = dispatch(w, cmd, { actorId: F, now: T0 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('command.unknown');
    }
    expect(w.players[F]!.places).toBeUndefined();
  });
});
