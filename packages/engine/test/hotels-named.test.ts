import { describe, expect, it } from 'vitest';
import { CITY_DISTRICTS } from '../src/data/businesses.js';
import { CITY_HOTELS, HOTEL_BY_ID } from '../src/data/hotels.js';
import { MARKET_IDS, type MarketId } from '../src/data/markets.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import {
  HOTEL_NIGHTS,
  flightFare,
  hotelName,
  hotelNight,
  hotelNightUsd,
  hotelPrice,
  hotelStayPrice,
} from '../src/travel.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { makeWorld, moneyByCurrency, run, tryRun } from './helpers.js';

/**
 * The feedback round (player feedback: "More hotel options in different
 * parts of the city. Not only 3 hotels."): every city has named hotels in
 * its districts; booking one by id charges its stay through the ledger, and
 * friends on holiday book the same one. Worlds without the note book by
 * tier exactly as before.
 */

const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;

function person(w: World, id: string, market: MarketId, name: string): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name,
    role: 'investor',
    backgroundId: 'i-first',
    market,
    investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
  }).world;
}

/** Ada (Lagos) and Bola (Nairobi), both with money for a five-star trip. */
function setup(on = true): World {
  let w = makeWorld(11, ['lagos', 'nairobi', 'london']);
  if (on) w = announce(w);
  w = person(w, 'u_a', 'lagos', 'Ada A');
  w = structuredClone(person(w, 'u_b', 'nairobi', 'Bola B'));
  for (const id of ['u_a', 'u_b']) {
    const acc = w.accounts[w.players[id]!.accounts.local]!;
    const big =
      20 *
      (flightFare(w, w.players[id]!, 'london') + hotelPrice(w, w.players[id]!, 'london', 'luxury'));
    acc.balance = Math.max(acc.balance, big);
  }
  return w;
}

const bal = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

describe('named hotels: the data', () => {
  it('every city has 6–10 hotels across at least four of its districts', () => {
    for (const m of MARKET_IDS) {
      const list = CITY_HOTELS[m];
      expect(list.length, m).toBeGreaterThanOrEqual(6);
      expect(list.length, m).toBeLessThanOrEqual(10);
      for (const h of list) {
        expect(CITY_DISTRICTS[m], `${h.id} district`).toContain(h.district);
        expect(h.stars).toBeGreaterThanOrEqual(1);
        expect(h.stars).toBeLessThanOrEqual(5);
        expect(h.km).toBeGreaterThan(0);
        expect(HOTEL_BY_ID.get(h.id)?.market).toBe(m);
      }
      expect(new Set(list.map((h) => h.district)).size, m).toBeGreaterThanOrEqual(4);
      expect(new Set(list.map((h) => h.tier)), m).toEqual(
        new Set(['budget', 'business', 'luxury']),
      );
      // The three hotels a city had before are on its list, under their old names.
      for (const tier of ['budget', 'business', 'luxury'] as const)
        expect(list.map((h) => h.name)).toContain(hotelName(m, tier));
    }
    expect(HOTEL_BY_ID.size).toBe(MARKET_IDS.reduce((n, m) => n + CITY_HOTELS[m].length, 0));
  });

  it('prices by stars and the city’s cost of living, the same every time', () => {
    const w = setup();
    const five = (m: MarketId) => CITY_HOTELS[m].find((h) => h.stars === 5)!;
    expect(hotelNightUsd(w, 'london', five('london'))).toBeGreaterThan(
      hotelNightUsd(w, 'nairobi', five('nairobi')),
    );
    const pod = CITY_HOTELS.london.find((h) => h.stars === 1)!;
    expect(hotelNightUsd(w, 'london', pod)).toBeLessThan(
      hotelNightUsd(w, 'london', five('london')),
    );
    expect(hotelNightUsd(w, 'london', pod)).toBe(hotelNightUsd(structuredClone(w), 'london', pod));
  });
});

describe('named hotels: booking', () => {
  it('lists the city’s hotels by district with a night and the stay in your currency', () => {
    const w = setup();
    const v = playerView(w, 'u_a')!;
    const list = v.me.destinations.find((d) => d.id === 'london')!.hotelList;
    expect(list.map((h) => h.id)).toEqual(CITY_HOTELS.london.map((h) => h.id));
    const a = w.players.u_a!;
    for (const h of list) {
      const spec = HOTEL_BY_ID.get(h.id)!;
      expect(h.night).toBe(hotelNight(w, a, 'london', spec));
      expect(h.price).toBe(HOTEL_NIGHTS * h.night);
      expect(h.nights).toBe(HOTEL_NIGHTS);
      expect(h.affordable).toBe(true);
    }
    // Home is no destination for a hotel; the city on the map lists its own.
    expect(v.market.hotels?.map((h) => h.id)).toEqual(CITY_HOTELS.lagos.map((h) => h.id));
  });

  it('books a named hotel by id: the tier comes from the hotel, the ledger charges its stay', () => {
    let w = setup();
    const a = w.players.u_a!;
    const spec = CITY_HOTELS.london.find((h) => h.id === 'london-shoreditch-loft')!;
    const fare = flightFare(w, a, 'london');
    const stay = hotelStayPrice(w, a, 'london', spec);
    const before = bal(w, 'u_a');
    const supply = moneyByCurrency(w);
    // The tier sent alongside is ignored: the hotel decides the room.
    w = run(w, 'u_a', {
      type: 'travel.book',
      to: 'london',
      hotel: 'luxury',
      hotelId: spec.id,
    }).world;
    expect(bal(w, 'u_a')).toBe(before - fare - stay);
    expect(moneyByCurrency(w)).toEqual(supply);
    expect(w.players.u_a!.flightTicket?.hotel).toEqual({
      tier: spec.tier,
      name: spec.name,
      paid: stay,
      id: spec.id,
      district: spec.district,
      stars: spec.stars,
      nights: HOTEL_NIGHTS,
    });
    const memo = w.accounts[a.accounts.local]!.recent.find((r) => r.memo.startsWith('Hotel'));
    expect(memo?.memo).toBe(`Hotel: ${spec.name}`);
    // Cancelled: everything back.
    const c = run(w, 'u_a', { type: 'travel.cancel' }).world;
    expect(bal(c, 'u_a')).toBe(before);
    // Landed: you're staying there.
    w = run(w, 'u_a', { type: 'travel.fly', to: 'london' }).world;
    expect(w.players.u_a!.location?.hotel?.id).toBe(spec.id);
    expect(playerView(w, 'u_a')!.me.location?.hotel).toMatchObject({
      id: spec.id,
      district: 'shoreditch',
    });
  });

  it('refuses a hotel from another city, an unknown one, and a hotel at home', () => {
    const w = setup();
    for (const hotelId of ['nairobi-westlands', 'london-nowhere']) {
      const r = tryRun(w, 'u_a', { type: 'travel.book', to: 'london', hotelId });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('travel.hotel');
    }
    const home = tryRun(w, 'u_a', { type: 'travel.book', to: 'lagos', hotelId: 'lagos-ikoyi' });
    expect(home.ok).toBe(false);
  });

  it('refuses a stay you can’t afford with the fare', () => {
    const w = structuredClone(setup());
    const a = w.players.u_a!;
    w.accounts[a.accounts.local]!.balance = flightFare(w, a, 'london') + 1;
    const r = tryRun(w, 'u_a', {
      type: 'travel.book',
      to: 'london',
      hotelId: 'london-mayfair-grand',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.funds');
    const list = playerView(w, 'u_a')!.me.destinations.find((d) => d.id === 'london')!.hotelList;
    expect(list.every((h) => !h.affordable)).toBe(true);
  });

  it('old clients sending only the tier book as before, in a world with the note', () => {
    let w = setup();
    const price = hotelPrice(w, w.players.u_a!, 'london', 'business');
    w = run(w, 'u_a', { type: 'travel.book', to: 'london', hotel: 'business' }).world;
    expect(w.players.u_a!.flightTicket?.hotel).toEqual({
      tier: 'business',
      name: 'Canary Wharf Business Hotel',
      paid: price,
    });
  });
});

describe('named hotels: holiday with friends', () => {
  it('a friend who accepts books the host’s hotel by id, and pays its stay', () => {
    let w = setup();
    const spec = HOTEL_BY_ID.get('london-south-bank')!;
    w = run(w, 'u_a', { type: 'travel.book', to: 'london', hotelId: spec.id }).world;
    w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: false }).world;
    const h = Object.values(w.holidays!)[0]!;
    expect(h).toMatchObject({ tier: spec.tier, hotelId: spec.id });
    expect(w.inbox.u_b!.find((i) => i.ref?.kind === 'holiday')!.text).toContain(spec.name);
    const inv = playerView(w, 'u_b')!.holidays[0]!;
    const b = w.players.u_b!;
    expect(inv.hotel).toMatchObject({ id: spec.id, name: spec.name, district: 'southbank' });
    const stay = hotelStayPrice(w, b, 'london', spec);
    expect(inv.invite?.hotel).toBe(stay);
    const b0 = bal(w, 'u_b');
    const fare = flightFare(w, b, 'london');
    const supply = moneyByCurrency(w);
    const r = run(w, 'u_b', { type: 'holiday.accept', holidayId: h.id });
    w = r.world;
    expect(r.result.message).toContain(spec.name);
    expect(w.players.u_b!.flightTicket?.hotel).toMatchObject({ id: spec.id, paid: stay });
    expect(bal(w, 'u_b')).toBe(b0 - fare - stay);
    expect(moneyByCurrency(w)).toEqual(supply);
  });
});

describe('named hotels: worlds without the note', () => {
  it('list none, refuse a hotel id, and book by tier exactly as before', () => {
    let w = setup(false);
    const v = playerView(w, 'u_a')!;
    expect(v.me.destinations.find((d) => d.id === 'london')!.hotelList).toEqual([]);
    expect(v.market.hotels).toBeNull();
    const r = tryRun(w, 'u_a', {
      type: 'travel.book',
      to: 'london',
      hotelId: 'london-mayfair-grand',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.hotel');
    const price = hotelPrice(w, w.players.u_a!, 'london', 'luxury');
    const before = bal(w, 'u_a');
    const fare = flightFare(w, w.players.u_a!, 'london');
    w = run(w, 'u_a', { type: 'travel.book', to: 'london', hotel: 'luxury' }).world;
    expect(w.players.u_a!.flightTicket?.hotel).toEqual({
      tier: 'luxury',
      name: 'The Mayfair Grand',
      paid: price,
    });
    expect(bal(w, 'u_a')).toBe(before - fare - price);
    // A holiday on it has no named hotel: friends book the tier, as before.
    w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: false }).world;
    const h = Object.values(w.holidays!)[0]!;
    expect(h.hotelId).toBeUndefined();
    w = run(w, 'u_b', { type: 'holiday.accept', holidayId: h.id }).world;
    expect(w.players.u_b!.flightTicket?.hotel).toEqual({
      tier: 'luxury',
      name: 'The Mayfair Grand',
      paid: hotelPrice(w, w.players.u_b!, 'london', 'luxury'),
    });
  });
});
