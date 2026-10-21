import { describe, expect, it } from 'vitest';
import { businessKind } from '../src/data/businesses.js';
import { foodLevelOf, type FoodLevel } from '../src/data/cuisine.js';
import { venuePrice } from '../src/economy.js';
import { col } from '../src/helpers.js';
import { scale } from '../src/money.js';
import { playerView } from '../src/views.js';
import type { MarketId } from '../src/data/markets.js';
import type { LocalBusiness, World } from '../src/types.js';
import { addFounder, careerWorld, makeWorld, moneyByCurrency, run } from './helpers.js';

const inCity = (w: World, m: MarketId) => Object.values(w.markets[m]!.businesses ?? {});
const at = (w: World, m: MarketId, level: FoodLevel, kinds: string[]): LocalBusiness =>
  inCity(w, m).find((b) => kinds.includes(b.kind) && foodLevelOf(b) === level)!;
/** What the founder's view says an item costs at this business. */
const shown = (w: World, b: LocalBusiness, itemId: string) =>
  playerView(w, 'u_founder')!
    .market.businesses.find((x) => x.id === b.id)!
    .venue!.items.find((x) => x.id === itemId)!.price;

describe('restaurant prices by level (player feedback)', () => {
  it('reads the level from the place: street food, casual, fine dining', () => {
    const v = (kind: string, name: string) =>
      foodLevelOf({ market: 'lagos', id: 'b1', kind, name });
    expect(v('buka', "Mama Titi's Buka")).toBe('street');
    expect(v('restaurant', 'Broad Street Pepper Soup House')).toBe('casual');
    expect(v('bakery', 'Agege Bread Bakery')).toBe('casual');
    expect(v('restaurant', 'Island Bistro')).toBe('fine');
    expect(
      foodLevelOf({ market: 'kigali', id: 'b1', kind: 'restaurant', name: 'Kiyovu Bistro' }),
    ).toBe('upscale');
    // A pub, a bar or a salon keeps its kind's prices.
    expect(v('pub', 'The Anchor')).toBeNull();
    expect(v('salon', 'Hair by Ada')).toBeNull();
  });

  it('street food < casual < fine dining in the same city, and the view shows what you pay', () => {
    let w = addFounder(careerWorld(7, ['dubai']), 'u_founder', 'dubai');
    const street = at(w, 'dubai', 'street', ['shawarma', 'food-truck']);
    const casual = at(w, 'dubai', 'casual', ['restaurant']);
    const fine = inCity(w, 'dubai').find((b) => b.name === 'DIFC Grill Room')!;
    expect(foodLevelOf(fine)).toBe('fine');
    const m = w.markets.dubai!;
    const plate = shown(w, street, businessKind(street.kind)!.venue!.items[0]!.id);
    const lunch = (b: LocalBusiness) => shown(w, b, 'lunch');
    const casualLunch = scale(col(m), 0.012); // today's casual lunch
    expect(plate).toBeLessThan(lunch(casual));
    expect(lunch(casual)).toBeLessThan(lunch(fine));
    // Street food is clearly cheap; fine dining several times a casual meal.
    expect(plate / casualLunch).toBeLessThan(0.5);
    expect(shown(w, fine, 'lunch') / casualLunch).toBeGreaterThanOrEqual(4);
    expect(shown(w, fine, 'drink')).toBeLessThan(shown(w, fine, 'lunch'));
    // Dinner at fine dining costs what the menu says, and the money only moves.
    const price = shown(w, fine, 'dinner');
    expect(price).toBe(venuePrice(w, m, fine, businessKind('restaurant')!.venue!.items[1]!));
    const total = moneyByCurrency(w);
    const r = run(w, 'u_founder', { type: 'venue.buy', businessId: fine.id, itemId: 'dinner' });
    w = r.world;
    expect(r.result.price).toBe(price);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('keeps the old prices in a world from before the investor note', () => {
    const w = addFounder(makeWorld(7, ['lagos']));
    const m = w.markets.lagos!;
    const fine = inCity(w, 'lagos').find((b) => b.name === 'Island Bistro')!;
    const street = at(w, 'lagos', 'street', ['buka', 'chop-bar', 'kibanda', 'food-truck']);
    for (const b of [fine, street])
      for (const it of businessKind(b.kind)!.venue!.items)
        expect(shown(w, b, it.id), `${b.name}/${it.id}`).toBe(scale(col(m), it.priceCol));
    const r = run(w, 'u_founder', { type: 'venue.buy', businessId: fine.id, itemId: 'dinner' });
    expect(r.result.price).toBe(scale(col(m), 0.025));
  });
});
