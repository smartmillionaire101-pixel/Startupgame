import { describe, expect, it } from 'vitest';
import { HOME_SLOTS } from '../src/city/life';
import { TIER_GRID, blockedTiles, key, planFor, wallEdges } from '../src/home/layout';
import { findPath, pathTowards, walkable, type Grid } from '../src/home/path';

const ALL = new Set<string>(HOME_SLOTS);

describe('home floor plans (Wave 7 §A)', () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    it(`tier ${tier}: every slot has a spot, nothing overlaps, every interact tile is reachable`, () => {
      const plan = planFor(tier);
      expect({ w: plan.w, h: plan.h }).toEqual(TIER_GRID[tier]);
      for (const slot of HOME_SLOTS) expect(plan.slots[slot], slot).toBeDefined();
      for (const owned of [new Set<string>(), ALL]) {
        const blocked = blockedTiles(plan, owned);
        // Footprints stay inside the grid and don't overlap.
        const seen = new Map<string, string>();
        for (const [slot, s] of Object.entries(plan.slots)) {
          if (!owned.has(slot) || !s.blocked || s.wall) continue;
          for (let x = s.x; x < s.x + s.w; x++)
            for (let y = s.y; y < s.y + s.h; y++) {
              expect(x >= 0 && y >= 0 && x < plan.w && y < plan.h, `${slot} in bounds`).toBe(true);
              const k = key(x, y);
              expect(seen.get(k), `${slot} overlaps ${seen.get(k)} at ${k}`).toBeUndefined();
              seen.set(k, slot);
            }
        }
        const g: Grid = { w: plan.w, h: plan.h, blocked, walls: wallEdges(plan) };
        expect(walkable(g, plan.door.x, plan.door.y)).toBe(true);
        const spots = [...Object.values(plan.slots), ...Object.values(plan.fixtures)];
        for (const s of spots) {
          const path = findPath(g, plan.door, s.interact);
          expect(
            path,
            `reach ${key(s.interact.x, s.interact.y)} (owned ${owned.size})`,
          ).not.toBeNull();
        }
      }
    });
  }

  it('A* takes the shortest 4-way route and walks round walls', () => {
    const plan = planFor(2);
    const g: Grid = {
      w: plan.w,
      h: plan.h,
      blocked: blockedTiles(plan, new Set()),
      walls: wallEdges(plan),
    };
    const p = findPath(g, { x: 0, y: 9 }, { x: 0, y: 3 })!;
    // Up through the bedroom door at x=4 (the wall at y=4 blocks the direct way).
    expect(p.some((t) => t.x === 4 && t.y === 3)).toBe(true);
    for (let i = 1; i < p.length; i++)
      expect(Math.abs(p[i]!.x - p[i - 1]!.x) + Math.abs(p[i]!.y - p[i - 1]!.y)).toBe(1);
    // A tap on a blocked tile walks to the nearest free one.
    const full = { ...g, blocked: blockedTiles(plan, ALL) };
    const to = pathTowards(full, plan.door, { x: 0, y: 0 })!;
    const end = to.at(-1)!;
    expect(walkable(full, end.x, end.y)).toBe(true);
  });
});
