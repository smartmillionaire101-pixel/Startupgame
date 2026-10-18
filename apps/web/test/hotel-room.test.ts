import { describe, expect, it } from 'vitest';
import { bathDoors, blockedTiles, key, roomAt, wallEdges } from '../src/home/layout';
import { findPath, walkable, type Grid } from '../src/home/path';
import { hotelFurniture, hotelGrounds, hotelPlan } from '../src/home/hotel';

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
    expect(hotelPlan('business').decor.some((d) => d.model === 'armchair')).toBe(true);
    expect(hotelPlan(null)).toBe(hotelPlan('budget'));
  });
});
