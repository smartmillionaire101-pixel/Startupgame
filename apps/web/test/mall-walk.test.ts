import { describe, expect, it } from 'vitest';
import { MALL_ITEMS } from '@runway/engine';
import {
  HALF,
  ROOM_SHOPS,
  SPOT,
  START,
  backOut,
  bearing,
  compassPoint,
  displays,
  findPath,
  goal,
  onGrid,
  pathLength,
  regionOf,
  walkGrid,
} from '../src/city/mall/layout';

/** The walkable mall: every shop reachable through its door, nothing walked through. */
const stock = MALL_ITEMS.map((i) => ({ id: i.id, shop: i.shop }));
const ds = displays(stock);
const grid = walkGrid(ds);

/** Every point along a path is on free floor. */
function walkable(a: { x: number; z: number }, pts: { x: number; z: number }[]) {
  let p = a;
  for (const q of pts) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    for (let k = 1; k <= Math.ceil(d / 0.1); k++) {
      const u = k / Math.ceil(d / 0.1);
      if (!onGrid(grid, p.x + (q.x - p.x) * u, p.z + (q.z - p.z) * u)) return false;
    }
    p = q;
  }
  return true;
}

describe('walking the mall', () => {
  it('shows every item somewhere, each shop its own', () => {
    expect(ds).toHaveLength(stock.length);
    for (const d of ds) expect(regionOf(d.x, d.z)).toBe(d.shop);
    const at = new Set(ds.map((d) => `${d.x},${d.z}`));
    expect(at.size).toBe(ds.length);
  });

  it('reaches every shop and the food court from the entrance, round things and through doors', () => {
    for (const s of [...ROOM_SHOPS, 'foodcourt' as const]) {
      const path = findPath(grid, START, goal(s));
      expect(path, s).not.toBeNull();
      expect(walkable(START, path!), s).toBe(true);
      const end = path![path!.length - 1]!;
      expect(regionOf(end.x, end.z)).toBe(s);
      // And back out to the hall.
      const out = findPath(grid, end, backOut(s));
      expect(out, s).not.toBeNull();
      expect(regionOf(out!.at(-1)!.x, out!.at(-1)!.z)).not.toBe(s);
    }
  });

  it('goes into a shop by its door, not through the glass', () => {
    const { side, z } = SPOT.fashion;
    // From the hall just outside the glass, to the left of the door.
    const from = { x: side * (HALF - 1), z: z - 3.5 };
    const path = findPath(grid, from, goal('fashion'))!;
    expect(walkable(from, path)).toBe(true);
    // Crossing the shopfront happens in the doorway.
    let p = from;
    for (const q of path) {
      const u0 = side * p.x - HALF;
      const u1 = side * q.x - HALF;
      if (u0 < 0 && u1 > 0) {
        const k = -u0 / (u1 - u0);
        expect(Math.abs(p.z + (q.z - p.z) * k - z)).toBeLessThan(1.3);
      }
      p = q;
    }
    expect(pathLength(from, path)).toBeGreaterThan(
      Math.hypot(goal('fashion').x - from.x, goal('fashion').z - from.z),
    );
  });

  it("won't walk into a wall: a tap in one goes to the nearest free floor", () => {
    expect(grid.free(-HALF - 3, -11.5)).toBe(false); // between two shops' rooms
    expect(grid.free(0, -17)).toBe(false); // the escalators
    const path = findPath(grid, START, { x: 0, z: -17 });
    expect(path).not.toBeNull();
    expect(grid.free(path!.at(-1)!.x, path!.at(-1)!.z)).toBe(true);
    expect(findPath(grid, START, { x: 40, z: 40 })).toBeNull();
  });

  it('names where you face: north is down the hall', () => {
    expect(compassPoint(Math.PI)).toBe('N');
    expect(compassPoint(Math.PI / 2)).toBe('E');
    expect(compassPoint(0)).toBe('S');
    expect(compassPoint(-Math.PI / 2)).toBe('W');
    // Facing down the hall, +x is on your right.
    expect(bearing({ x: 0, z: 0 }, Math.PI, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(bearing({ x: 0, z: 0 }, Math.PI, { x: 0, z: -5 })).toBeCloseTo(0);
  });
});
