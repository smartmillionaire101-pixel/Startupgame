import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  floorsFor,
  homeSpecOf,
  wallEdges,
  withBuiltIns,
  key,
  type HomePlan,
} from '../src/home/layout';
import { blockOf } from '../src/home/grounds';
import {
  canPlaceDivider,
  dividerAt,
  dividersOn,
  inBounds,
  nudgeDivider,
  segmentsOf,
  turnDivider,
  withDividers,
  type Divider,
} from '../src/home/dividers';
import { buildDivider } from '../src/interiors3d/dividers';

/**
 * Walls and dividers (shop note) in every home a player can live in: the
 * flats in their blocks (Lean's walk-up, Modest's tidy block, Comfortable's
 * modern tower), the house (both floors) and the penthouse. Written against
 * the old house-on-a-lawn plans; the flat-in-block homes (and Comfortable's
 * bigger good flat) must hold them the same way.
 */
const HOMES = [1, 2, 3, 4, 5].flatMap((tier) =>
  floorsFor(tier, homeSpecOf(null, tier)).map((plan, floor) => ({
    name: `tier ${tier} ${plan.kind}${blockOf(plan) ? ` (${blockOf(plan)})` : ''} floor ${floor}`,
    tier,
    floor,
    plan,
    owned: new Set(withBuiltIns(plan, new Map()).keys()),
  })),
);

const div = (d: Partial<Divider> & Pick<Divider, 'x' | 'y' | 'dir' | 'len'>): Divider => ({
  id: `w${d.x}.${d.y}.${d.dir}`,
  kind: 'full',
  finish: 'white',
  ...d,
});

/** Every placement of a divider of this kind and length in the plan. */
function everywhere(plan: HomePlan, kind: Divider['kind'], len: number): Divider[] {
  const out: Divider[] = [];
  for (const dir of ['h', 'v'] as const)
    for (let x = 0; x <= plan.w; x++)
      for (let y = 0; y <= plan.h; y++) out.push(div({ kind, len, x, y, dir }));
  return out;
}

const edgeOf = (s: { dir: 'h' | 'v'; x: number; y: number }) =>
  s.dir === 'h' ? `${key(s.x, s.y - 1)}|${key(s.x, s.y)}` : `${key(s.x - 1, s.y)}|${key(s.x, s.y)}`;

describe('walls and dividers in every home', () => {
  it('covers the flats in their blocks, the house and the penthouse', () => {
    expect(HOMES.map((h) => blockOf(h.plan))).toEqual([
      'walkup',
      'block',
      'modern',
      null,
      null,
      null,
    ]);
    expect(HOMES.map((h) => h.plan.kind)).toEqual([
      'room',
      'apartment',
      'apartment',
      'house',
      'house',
      'penthouse',
    ]);
  });

  for (const h of HOMES) {
    describe(h.name, () => {
      const { plan, owned } = h;
      const planEdges = new Set(plan.walls.map((s) => `${s.dir}:${s.x},${s.y}`));

      it('places along the floor grid, inside the home and off its own walls', () => {
        const ok = everywhere(plan, 'full', 2).filter((d) => canPlaceDivider(plan, owned, [], d));
        expect(ok.length).toBeGreaterThan(20);
        for (const d of ok) {
          expect(inBounds(plan, d)).toBe(true);
          for (const s of segmentsOf(d))
            expect(planEdges.has(`${s.dir}:${s.x},${s.y}`)).toBe(false);
        }
        // A tap snaps to the grid in the home; nudged and turned, it stays there.
        for (const [tx, ty] of [
          [0, 0],
          [plan.w - 1, plan.h - 1],
          [Math.floor(plan.w / 2), Math.floor(plan.h / 2)],
        ] as const)
          for (const dir of ['h', 'v'] as const)
            for (const len of [1, 2, 3, 4]) {
              const d = { len, dir, ...dividerAt(plan, len, dir, tx, ty) };
              expect(inBounds(plan, d)).toBe(true);
              expect(inBounds(plan, turnDivider(plan, d))).toBe(true);
              expect(inBounds(plan, nudgeDivider(plan, d, 99, 99))).toBe(true);
              expect(inBounds(plan, nudgeDivider(plan, d, -99, -99))).toBe(true);
            }
      });

      it('blocks walking (a sliding door or screen lets you through)', () => {
        const d = everywhere(plan, 'full', 2).find((x) => canPlaceDivider(plan, owned, [], x))!;
        const solid = wallEdges(withDividers(plan, [d]));
        for (const s of segmentsOf(d)) expect(solid.has(edgeOf(s))).toBe(true);
        const open = wallEdges(withDividers(plan, [{ ...d, kind: 'sliding' }]));
        for (const s of segmentsOf(d)) expect(open.has(edgeOf(s))).toBe(false);
      });

      it('never overlaps another divider', () => {
        const d = everywhere(plan, 'full', 3).find((x) => canPlaceDivider(plan, owned, [], x))!;
        expect(canPlaceDivider(plan, owned, [d], { ...d, id: 'other', kind: 'glass' })).toBe(false);
        expect(canPlaceDivider(plan, owned, [d], { ...d, id: 'other', len: 1 })).toBe(false);
        // One placed by hand over the plan's own wall isn't drawn.
        const s = plan.walls[0]!;
        const over = {
          id: 'x',
          kind: 'full' as const,
          len: 1,
          finish: 'white',
          floor: h.floor,
          paid: 0,
          ...s,
        };
        expect(dividersOn([over], h.floor, plan)).toEqual([]);
      });

      it('never cuts through something standing on the floor', () => {
        const things = [
          ...Object.entries(plan.fixtures).map(([id, s]) => [id, s!] as const),
          ...Object.entries(plan.slots)
            .filter(([slot]) => owned.has(slot))
            .map(([id, s]) => [id, s] as const),
          ...plan.decor.map((d) => [d.id, d.spot] as const),
        ].filter(([, s]) => s.blocked && !s.wall && (s.w > 1 || s.h > 1));
        for (const [id, s] of things) {
          const cut =
            s.h > 1
              ? div({ x: s.x, y: s.y + 1, dir: 'h', len: 1 })
              : div({ x: s.x + 1, y: s.y, dir: 'v', len: 1 });
          expect(canPlaceDivider(plan, owned, [], cut), id).toBe(false);
        }
      });

      it.skipIf(h.floor > 0)('keeps the front door reachable', () => {
        // Box in the door's tile and its neighbours: the last wall is refused.
        const { x: dx, y: dy } = plan.door;
        const x0 = Math.max(0, dx - 1);
        const x1 = Math.min(plan.w, dx + 2);
        const walls = [
          div({ x: x0, y: dy, dir: 'h', len: x1 - x0 }),
          ...(x0 > 0 ? [div({ x: x0, y: dy, dir: 'v', len: 1 })] : []),
          ...(x1 < plan.w ? [div({ x: x1, y: dy, dir: 'v', len: 1 })] : []),
        ];
        const last = walls.pop()!;
        for (const [n, w] of walls.entries())
          expect(canPlaceDivider(plan, owned, walls.slice(0, n), w)).toBe(true);
        expect(canPlaceDivider(plan, owned, walls, last)).toBe(false);
        // A sliding door there is fine: you walk through it.
        expect(canPlaceDivider(plan, owned, walls, { ...last, kind: 'sliding' })).toBe(true);
      });
    });
  }

  it('drops walls that no longer fit after a move to a smaller home', () => {
    const modest = HOMES.find((h) => h.tier === 2)!.plan;
    const lean = HOMES.find((h) => h.tier === 1)!.plan;
    const wall = { id: 'w', kind: 'glass' as const, len: 3, finish: 'framed', paid: 1, floor: 0 };
    const placed = { ...wall, x: 9, y: 5, dir: 'v' as const };
    expect(dividersOn([placed], 0, modest)).toHaveLength(1);
    expect(dividersOn([placed], 0, lean)).toHaveLength(0);
  });
});

describe('a divider in 3D', () => {
  const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
  it('stands on the floor as high as the home’s own inner walls, along its edge', () => {
    for (const kind of ['full', 'half', 'glass', 'sliding', 'bookshelf'] as const) {
      const b = box(buildDivider(kind, 3, '#ffffff'));
      expect(b.min.y, kind).toBeGreaterThanOrEqual(-0.001);
      expect(b.max.y, kind).toBeLessThanOrEqual(1.5);
      expect(b.min.x, kind).toBeGreaterThan(-0.2);
      expect(b.max.x, kind).toBeLessThan(3.2);
      expect(Math.max(-b.min.z, b.max.z), kind).toBeLessThan(0.25);
    }
    // A full wall is the inner walls' height (1.25 m and its cap).
    expect(box(buildDivider('full', 2, '#ffffff')).max.y).toBeCloseTo(1.3, 2);
    // Turned to run along y (as Home3D turns a 'v' divider), from its start.
    const g = buildDivider('full', 2, '#ffffff');
    g.position.set(4, 0, 1);
    g.rotation.y = -Math.PI / 2;
    g.updateMatrixWorld(true);
    const v = box(g);
    expect(v.min.z).toBeCloseTo(1 - 0.08, 1);
    expect(v.max.z).toBeCloseTo(3 + 0.08, 1);
    expect((v.min.x + v.max.x) / 2).toBeCloseTo(4, 1);
  });
});
