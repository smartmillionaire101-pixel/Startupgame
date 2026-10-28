import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_ENTRIES, FLOOR_FINISHES, FURNITURE } from '@runway/engine';
import {
  basketTotal,
  boostLines,
  maxInBasket,
  buyCards,
  footprint,
  isNew,
  ownedCount,
  toggleBasket,
  type BuyItem,
} from '../src/interiors3d/buy';
import { builtFloor, roomFloor, wallPalette, WALL_GREEN } from '../src/interiors3d/finishes';
import { floorThumb, furnitureThumb } from '../src/shop/thumbs';
import { planFor } from '../src/home/layout';

const PUBLIC = join(__dirname, '..', 'public');
const file = (url: string) => join(PUBLIC, url.replace(/^\//, ''));

describe('catalogue pictures (public/thumbs, scripts/furniture-thumbs.ts)', () => {
  it('every furniture item and every catalogue furniture variant has its picture', () => {
    const ids = new Set([
      ...FURNITURE.map((f) => f.id),
      ...CATALOG_ENTRIES.filter((e) => e.source === 'furniture').flatMap((e) =>
        e.variants.map((v) => v.ref),
      ),
    ]);
    expect(ids.size).toBe(63);
    const missing = [...ids].filter((id) => !existsSync(file(furnitureThumb(id))));
    expect(missing).toEqual([]);
  });

  it('every floor finish has its swatch', () => {
    const missing = FLOOR_FINISHES.filter((f) => !existsSync(file(floorThumb(f.id))));
    expect(missing).toEqual([]);
  });

  it('stays small', () => {
    const dir = join(PUBLIC, 'thumbs');
    const size = (d: string): number =>
      readdirSync(d).reduce((n, f) => {
        const p = join(d, f);
        return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
      }, 0);
    expect(size(dir)).toBeLessThan(1.5 * 1024 * 1024);
  });
});

const items: BuyItem[] = ['sofa', 'tv', 'plants', 'bed'].flatMap((slot, i) =>
  [1, 2, 3].map((tier) => ({
    id: `${slot}-${tier}`,
    slot,
    tier,
    label: `${slot} ${tier}`,
    price: (i + 1) * 100 * tier,
  })),
);

describe('Buy mode: the cards', () => {
  const owned = new Map([['sofa', 1]]);
  const q = { tab: 'all' as const, room: 'all', price: 'any' as const, search: '', pocket: 500 };

  it('Owned shows what you have; New the next step up in each slot', () => {
    expect(buyCards(items, owned, { ...q, tab: 'owned' }).map((f) => f.id)).toEqual(['sofa-1']);
    expect(ownedCount(items, owned)).toBe(1);
    expect(buyCards(items, owned, { ...q, tab: 'new' }).map((f) => f.id)).toEqual([
      'sofa-2',
      'tv-1',
      'plants-1',
      'bed-1',
    ]);
    expect(isNew(items[1]!, owned)).toBe(true);
    expect(isNew(items[2]!, owned)).toBe(false);
  });

  it('filters by room, floor, price and a search', () => {
    expect(buyCards(items, owned, { ...q, room: 'bedroom' }).every((f) => f.slot === 'bed')).toBe(
      true,
    );
    expect(
      buyCards(items, owned, { ...q, floorSlots: new Set(['bed']) }).map((f) => f.slot),
    ).toEqual(['bed', 'bed', 'bed']);
    const afford = buyCards(items, owned, { ...q, price: 'afford' });
    expect(afford.every((f) => f.price <= 500 || owned.get(f.slot) === f.tier)).toBe(true);
    const low = buyCards(items, owned, { ...q, price: 'low' }).map((f) => f.price);
    expect(low).toEqual([...low].sort((a, z) => a - z));
    expect(buyCards(items, owned, { ...q, search: 'TV 3' }).map((f) => f.id)).toEqual(['tv-3']);
  });

  it('footprints and boosts read like the cards', () => {
    expect(footprint(planFor(3).slots.sofa)).toBe('3×1');
    expect(footprint(planFor(3).slots.art)).toBe('wall');
    expect(boostLines({ comfort: 3, social: 2 })).toEqual([
      ['social', 2],
      ['comfort', 3],
    ]);
  });
});

describe('Buy mode: the basket', () => {
  const owned = new Map([['sofa', 1]]);
  it('one per slot, nothing you own, and a total', () => {
    let b = toggleBasket([], items[1]!, items, owned); // sofa-2
    b = toggleBasket(b, items[3]!, items, owned); // tv-1
    b = toggleBasket(b, items[0]!, items, owned); // sofa-1: yours, stays out
    expect(b).toEqual(['sofa-2', 'tv-1']);
    b = toggleBasket(b, items[2]!, items, owned); // sofa-3 swaps sofa-2
    expect(b).toEqual(['tv-1', 'sofa-3']);
    expect(basketTotal(b, items)).toEqual({
      items: [items[3], items[2]],
      total: 200 + 300,
      count: 2,
    });
    b = toggleBasket(b, items[3]!, items, owned);
    expect(basketTotal(b, items).total).toBe(300);
    expect(basketTotal([], items)).toEqual({ items: [], total: 0, count: 0 });
  });

  it('round 7: how many of each (− 1 +), and more of a thing you have', () => {
    // Three of the TV, one sofa: the total and the count follow.
    const bag = basketTotal(['tv-1', 'sofa-3'], items, { 'tv-1': 3 });
    expect(bag.total).toBe(3 * 200 + 300);
    expect(bag.count).toBe(4);
    // A line can't go under one.
    expect(basketTotal(['tv-1'], items, { 'tv-1': 0 }).count).toBe(1);
    // Yours can go in as more of it when the home can take more.
    expect(toggleBasket([], items[0]!, items, owned)).toEqual([]);
    expect(toggleBasket([], items[0]!, items, owned, () => true)).toEqual(['sofa-1']);
    // One in the slot plus the room for more; yours: only the more.
    expect(maxInBasket(false, 5)).toBe(6);
    expect(maxInBasket(true, 2)).toBe(2);
    expect(maxInBasket(false, 0)).toBe(1);
  });
});

describe('Buy mode: floors and paint', () => {
  it('a room keeps its own floor until you choose one; paint colours the walls', () => {
    expect(builtFloor('living', 3, null)[0]).toBe('cream');
    expect(roomFloor('living', 0, 3, null, { floors: { '0:living': 'marble' } })).toEqual([
      'marble',
    ]);
    expect(roomFloor('living', 1, 3, null, { floors: { '0:living': 'marble' } })[0]).toBe('cream');
    expect(wallPalette(null).outer).toBe(WALL_GREEN);
    expect(wallPalette(null, '#9fb59a').outer).toBe('#9fb59a');
    expect(wallPalette('modern', '#9fb59a').cap).toBe(wallPalette('modern').cap);
  });
});
