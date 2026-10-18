import { describe, expect, it } from 'vitest';
import { bathDoors, blockedTiles, key, roomAt, wallEdges } from '../src/home/layout';
import { findPath, walkable, type Grid } from '../src/home/path';
import {
  HOTEL_MODELS,
  HOTEL_WINDOWS,
  hotelContents,
  hotelDoors,
  hotelFurniture,
  hotelGrounds,
  hotelPlan,
  hotelRow,
} from '../src/home/hotel';

describe('hotel rooms abroad (player feedback)', () => {
  for (const tier of ['budget', 'business', 'luxury'] as const) {
    it(`${tier}: a bathroom behind a door, nothing overlaps, everything reachable from the door`, () => {
      const plan = hotelPlan(tier);
      const owned = new Set(hotelFurniture(plan, tier).keys());
      // A bathroom with a shower, a toilet and a basin, and one doorway into it.
      expect(plan.rooms.filter((r) => r.id === 'bathroom')).toHaveLength(1);
      for (const f of ['shower', 'toilet', 'sink', 'door'] as const)
        expect(plan.fixtures[f], f).toBeDefined();
      for (const f of ['shower', 'toilet', 'sink'] as const)
        expect(roomAt(plan, plan.fixtures[f]!.x, plan.fixtures[f]!.y)).toBe('bathroom');
      expect(bathDoors(plan)).toHaveLength(1);
      // A bed, a wardrobe and your suitcase.
      expect(plan.slots.bed).toBeDefined();
      expect(plan.slots.wardrobe).toBeDefined();
      expect(plan.decor.some((d) => d.model === 'suitcase')).toBe(true);
      // Footprints inside the room, not overlapping.
      const seen = new Map<string, string>();
      const things = [
        ...Object.entries(plan.slots),
        ...Object.entries(plan.fixtures),
        ...plan.decor.map((d) => [d.id, d.spot] as const),
      ];
      for (const [id, s] of things) {
        if (!s || !s.blocked || s.wall) continue;
        for (let x = s.x; x < s.x + s.w; x++)
          for (let y = s.y; y < s.y + s.h; y++) {
            expect(x >= 0 && y >= 0 && x < plan.w && y < plan.h, `${id} in bounds`).toBe(true);
            const k = key(x, y);
            expect(seen.get(k), `${id} overlaps ${seen.get(k)} at ${k}`).toBeUndefined();
            seen.set(k, id);
          }
      }
      const g: Grid = {
        w: plan.w,
        h: plan.h,
        blocked: blockedTiles(plan, owned),
        walls: wallEdges(plan),
      };
      expect(walkable(g, plan.door.x, plan.door.y)).toBe(true);
      for (const [id, s] of things)
        if (s) expect(findPath(g, plan.door, s.interact), `reach ${id}`).not.toBeNull();
      // A floor partway up the hotel's tower (not its roof): no pool, no cars.
      const gr = hotelGrounds(plan, { tier, name: 'The Grand' });
      expect(gr.style).toBe('hotel');
      expect(gr.hotel).toMatchObject({ tier, name: 'The Grand' });
      expect(gr.hotel!.floor).toBeGreaterThanOrEqual(8);
      expect(gr.hotel!.floor).toBeLessThanOrEqual(14);
      expect(gr.pool).toBeNull();
      expect(gr.bays).toHaveLength(0);
    });
  }

  it('grows with the tier: the suite is the biggest and has a tub; no hotel is the budget room', () => {
    const area = (t: 'budget' | 'business' | 'luxury') => hotelPlan(t).w * hotelPlan(t).h;
    expect(area('business')).toBeGreaterThan(area('budget'));
    expect(area('luxury')).toBeGreaterThan(area('business'));
    expect(hotelPlan('luxury').fixtures.bathtub).toBeDefined();
    expect(hotelPlan('luxury').rooms.some((r) => r.id === 'living')).toBe(true);
    expect(hotelPlan('business').slots.desk).toBeDefined();
    expect(hotelPlan('business').decor.some((d) => d.id === 'armchair')).toBe(true);
    expect(hotelPlan(null)).toBe(hotelPlan('budget'));
  });
});

describe('hotel rooms: price steps, privacy, a friend next door', () => {
  it('each tier has what its price buys (no kitchen in any)', () => {
    const has = (t: 'budget' | 'business' | 'luxury') => new Set(hotelContents(t));
    for (const t of ['budget', 'business', 'luxury'] as const) {
      const p = hotelPlan(t);
      expect(p.slots.kitchen, t).toBeUndefined();
      expect(p.fixtures.kitchenette, t).toBeUndefined();
      expect(p.rooms.some((r) => r.id === 'kitchen')).toBe(false);
    }
    for (const id of ['bed', 'desk', 'tv', 'wardrobe', 'shower', 'toilet', 'sink'])
      expect(has('budget').has(id), `budget ${id}`).toBe(true);
    for (const id of ['bed', 'desk', 'armchair', 'side-table', 'tea', 'tv', 'wardrobe'])
      expect(has('business').has(id), `business ${id}`).toBe(true);
    expect(HOTEL_MODELS.business.shower).toBe('walk-in-shower');
    expect(HOTEL_MODELS.business.desk).toBe('hotel-desk');
    // The suite: a foyer, a living room (sofa set, TV wall, dining for four, a
    // bar), a bedroom, a walk-in wardrobe and a big bathroom with the WC walled off.
    const s = hotelPlan('luxury');
    expect(s.w * s.h).toBeGreaterThanOrEqual(140);
    for (const r of ['hall', 'living', 'bedroom', 'guest', 'bathroom'] as const)
      expect(
        s.rooms.some((x) => x.id === r),
        r,
      ).toBe(true);
    for (const id of [
      'sofa',
      'rug',
      'coffee-table',
      'tv',
      'dining',
      'bar',
      'bed',
      'nightstand-1',
      'nightstand-2',
      'wardrobe',
      'bathtub',
      'shower',
      'sink',
      'toilet',
      'console',
    ])
      expect(has('luxury').has(id), `suite ${id}`).toBe(true);
    expect(HOTEL_MODELS.luxury).toMatchObject({
      bathtub: 'freestanding-tub',
      shower: 'rain-shower',
      sink: 'double-vanity',
      wardrobe: 'walk-in-wardrobe',
    });
    // The WC behind its own wall inside the bathroom.
    const wc = s.fixtures.toilet!;
    expect(s.walls.some((w) => w.dir === 'h' && w.y <= wc.y && w.x >= 11)).toBe(true);
    // Windows: floor-to-ceiling glass onto the suite's balcony.
    expect(HOTEL_WINDOWS.luxury.some((w) => w.tall && w.w >= 4)).toBe(true);
  });

  it('the doors either side: friends next door first, strangers with some "Do not disturb"', () => {
    const d = hotelDoors(1208, [
      { id: 'b', name: 'Bola Guest', room: 1209 },
      { id: 'c', name: 'Chi', room: 1210 },
    ]);
    expect(d.map((x) => x.slot)).toEqual(['R1', 'L1', 'R2', 'L2']);
    expect(d[0]).toMatchObject({ number: 1209, friend: { id: 'b' }, dnd: false });
    expect(d[1]).toMatchObject({ number: 1210, friend: { id: 'c' }, dnd: false });
    const nums = d.map((x) => x.number);
    expect(new Set([...nums, 1208]).size).toBe(5);
    expect(d.filter((x) => !x.friend).every((x) => x.dnd === (x.number % 3 === 0))).toBe(true);
    // Deterministic, and no friends: four strangers.
    expect(hotelDoors(1208)).toEqual(hotelDoors(1208));
    expect(hotelDoors(1208).every((x) => !x.friend)).toBe(true);
    // Next door is next to your room on the corridor.
    const plan = hotelPlan('business');
    const row = hotelRow(plan);
    expect(row.rooms.R1.x0).toBe(plan.w);
    expect(row.rooms.L1.x1).toBe(0);
    expect(row.rooms.R1.door - plan.w).toBeLessThan(2);
  });

  it('a holiday room number puts you on its floor, the doors in the grounds', () => {
    const plan = hotelPlan('luxury');
    const g = hotelGrounds(plan, {
      tier: 'luxury',
      name: 'The Grand',
      room: 709,
      friends: [{ id: 'b', name: 'Bola', room: 710 }],
    });
    expect(g.hotel).toMatchObject({ floor: 7, room: 709 });
    expect(g.hotel!.doors!.find((x) => x.friend)?.slot).toBe('R1');
    expect(hotelGrounds(plan, { tier: 'luxury' }).hotel!.floor).toBe(14);
  });
});
