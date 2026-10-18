import { describe, expect, it } from 'vitest';
import { addFounder, makeWorld, moneyByCurrency, run, tryRun } from './helpers.js';
import { playerView } from '../src/views.js';
import { flightFare, hotelPrice, hotelPriceUsd, HOTEL_TIERS } from '../src/travel.js';
import type { World } from '../src/types.js';

const world = () => addFounder(makeWorld(), 'host');
const balance = (w: World) => w.accounts[w.players.host!.accounts.local]!.balance;

describe('hotels with flights', () => {
  it('prices three hotels per destination, scaled by cost of living', () => {
    const w = world();
    const london = playerView(w, 'host')!.me.destinations.find((d) => d.id === 'london')!;
    expect(london.hotels.map((h) => h.tier)).toEqual(['budget', 'business', 'luxury']);
    expect(london.hotels.map((h) => h.name)).toEqual([
      'Camden Guesthouse',
      'Canary Wharf Business Hotel',
      'The Mayfair Grand',
    ]);
    for (const h of london.hotels)
      expect(h.price).toBe(hotelPrice(w, w.players.host!, 'london', h.tier));
    expect(hotelPriceUsd(w, 'london', 'budget')).toBeGreaterThan(
      hotelPriceUsd(w, 'nairobi', 'budget'),
    );
    expect(hotelPriceUsd(w, 'london', 'luxury')).toBe(2_160);
  });

  for (const tier of HOTEL_TIERS)
    it(`books a ${tier} hotel with the flight, refunds both on cancel and stays there on landing`, () => {
      let w = structuredClone(world());
      const fare = flightFare(w, w.players.host!, 'london');
      const price = hotelPrice(w, w.players.host!, 'london', tier);
      // Enough for a five-star round trip, whatever the starting savings.
      const local = w.accounts[w.players.host!.accounts.local]!;
      local.balance = Math.max(local.balance, 3 * (fare + price));
      const before = balance(w);
      const supply = moneyByCurrency(w);
      w = run(w, 'host', { type: 'travel.book', to: 'london', hotel: tier }).world;
      expect(balance(w)).toBe(before - fare - price);
      expect(w.players.host!.flightTicket?.hotel).toMatchObject({ tier, paid: price });
      expect(playerView(w, 'host')!.me.flightTicket?.hotel?.tier).toBe(tier);
      w = run(w, 'host', { type: 'travel.cancel' }).world;
      expect(balance(w)).toBe(before);
      expect(moneyByCurrency(w)).toEqual(supply);
      w = run(w, 'host', { type: 'travel.book', to: 'london', hotel: tier }).world;
      const landed = run(w, 'host', { type: 'travel.fly', to: 'london' });
      w = landed.world;
      // The result goes over the wire after the command: no Immer drafts in it.
      expect(JSON.parse(JSON.stringify(landed.result))).toMatchObject({ hotel: { tier } });
      expect(balance(w)).toBe(before - fare - price);
      expect(w.players.host!.location?.hotel?.tier).toBe(tier);
      expect(playerView(w, 'host')!.me.location?.hotel?.name).toBe(
        w.players.host!.location!.hotel!.name,
      );
      // Flying home: no hotel, and the stay ends.
      expect(tryRun(w, 'host', { type: 'travel.book', to: 'lagos', hotel: 'budget' }).ok).toBe(
        false,
      );
      w = run(w, 'host', { type: 'travel.book', to: 'lagos' }).world;
      expect(w.players.host!.flightTicket?.hotel).toBeUndefined();
      w = run(w, 'host', { type: 'travel.fly', to: 'lagos' }).world;
      expect(w.players.host!.location).toBeUndefined();
    });

  it('refuses flight + hotel the player can’t afford, and flags it in the view', () => {
    const w0 = world();
    const fare = flightFare(w0, w0.players.host!, 'london');
    const w = structuredClone(w0);
    w.accounts[w.players.host!.accounts.local]!.balance = fare + 1;
    const r = tryRun(w, 'host', { type: 'travel.book', to: 'london', hotel: 'luxury' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.funds');
    const london = playerView(w, 'host')!.me.destinations.find((d) => d.id === 'london')!;
    expect(london.hotels.every((h) => !h.affordable)).toBe(true);
    // The flight alone still works.
    const ok = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
    expect(balance(ok)).toBe(1);
  });

  it('charges just the fare without a hotel, exactly as before', () => {
    let w = world();
    const before = balance(w);
    const fare = flightFare(w, w.players.host!, 'london');
    w = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
    expect(balance(w)).toBe(before - fare);
    expect(w.players.host!.flightTicket).not.toHaveProperty('hotel');
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
    expect(w.players.host!.location).not.toHaveProperty('hotel');
    expect(playerView(w, 'host')!.me.location).not.toHaveProperty('hotel');
  });
});
