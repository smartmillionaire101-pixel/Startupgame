import { describe, expect, it } from 'vitest';
import { HOME_SLOTS } from '../src/city/life';
import {
  TIER_OF_KIND,
  bathDoors,
  blockedTiles,
  floorsFor,
  homeSpecOf,
  key,
  planFor,
  wallEdges,
  type HomeKind,
  type HomePlan,
} from '../src/home/layout';
import { bayKindOf, groundsFor, outdoorThings } from '../src/home/grounds';
import { findPath, type Grid } from '../src/home/path';
import { canPlace } from '../src/interiors3d/placement';
import { MOVABLE } from '../src/interiors3d/placement';

const ALL = new Set<string>(HOME_SLOTS);
const KINDS: HomeKind[] = [
  'studio',
  'apartment',
  'townhouse',
  'house',
  'villa',
  'mansion',
  'penthouse',
];

describe('Wave 12: the house grows with the kind of home and your wealth', () => {
  for (const kind of KINDS)
    for (const wealth of [0, 1, 2, 3])
      it(`${kind}, wealth ${wealth}: nothing overlaps, everything is reachable from the door`, () => {
        const tier = TIER_OF_KIND[kind];
        const plan = planFor(tier, { kind, wealth });
        expect(plan.kind).toBe(kind);
        for (const slot of HOME_SLOTS) expect(plan.slots[slot], slot).toBeDefined();
        // Rooms tile the grid exactly.
        const cover = new Map<string, string>();
        for (const r of plan.rooms)
          for (let x = r.x; x < r.x + r.w; x++)
            for (let y = r.y; y < r.y + r.h; y++) {
              expect(cover.get(key(x, y)), `${r.id} over ${cover.get(key(x, y))}`).toBeUndefined();
              cover.set(key(x, y), r.id);
            }
        expect(cover.size).toBe(plan.w * plan.h);
        for (const owned of [new Set<string>(), ALL]) {
          const seen = new Map<string, string>();
          const things = [
            ...Object.entries(plan.slots).filter(([s]) => owned.has(s)),
            ...plan.decor.map((d) => [d.id, d.spot] as const),
          ];
          for (const [id, s] of things) {
            if (!s.blocked || s.wall) continue;
            for (let x = s.x; x < s.x + s.w; x++)
              for (let y = s.y; y < s.y + s.h; y++) {
                expect(x >= 0 && y >= 0 && x < plan.w && y < plan.h, `${id} in bounds`).toBe(true);
                expect(
                  seen.get(key(x, y)),
                  `${id} overlaps ${seen.get(key(x, y))}`,
                ).toBeUndefined();
                seen.set(key(x, y), id);
              }
          }
          const g: Grid = {
            w: plan.w,
            h: plan.h,
            blocked: blockedTiles(plan, owned),
            walls: wallEdges(plan),
          };
          const spots = [
            ...Object.values(plan.slots),
            ...Object.values(plan.fixtures),
            ...plan.decor.map((d) => d.spot),
          ];
          for (const s of spots)
            expect(
              findPath(g, plan.door, s!.interact),
              key(s!.interact.x, s!.interact.y),
            ).not.toBeNull();
          // Every room can be walked into.
          for (const r of plan.rooms) {
            let ok = false;
            for (let x = r.x; x < r.x + r.w && !ok; x++)
              for (let y = r.y; y < r.y + r.h && !ok; y++)
                if (!g.blocked.has(key(x, y)) && findPath(g, plan.door, { x, y })) ok = true;
            expect(ok, `${r.id} at ${r.x},${r.y}`).toBe(true);
          }
        }
        // Moving things around still works in the bigger home.
        for (const slot of MOVABLE) {
          const s = plan.slots[slot]!;
          expect(canPlace(plan, ALL, slot, { x: s.x, y: s.y, rot: 0 }), slot).toBe(true);
        }
      });

  it('richer means more and bigger rooms, a gym and a cinema', () => {
    const area = (k: HomeKind, w: number) => {
      const p = planFor(TIER_OF_KIND[k], { kind: k, wealth: w });
      return p.w * p.h;
    };
    const order: HomeKind[] = ['studio', 'apartment', 'townhouse', 'villa', 'mansion'];
    for (let i = 1; i < order.length; i++)
      expect(area(order[i]!, 1)).toBeGreaterThan(area(order[i - 1]!, 1));
    for (const k of ['villa', 'mansion'] as const)
      for (let w = 1; w <= 3; w++) expect(area(k, w)).toBeGreaterThanOrEqual(area(k, w - 1));
    const rich = planFor(5, { kind: 'mansion', wealth: 3 });
    const rooms = rich.rooms.map((r) => r.id);
    expect(rooms.filter((r) => r === 'guest')).toHaveLength(2);
    expect(rooms).toContain('gym');
    expect(rooms).toContain('cinema');
    expect(rooms).toContain('dining');
    expect(rich.decor.map((d) => d.model)).toEqual(
      expect.arrayContaining(['island', 'guest-bed', 'treadmill', 'cinema-seats']),
    );
    const studio = planFor(1, { kind: 'studio', wealth: 3 });
    expect(studio.decor).toHaveLength(0);
    // The renter's flat without a spec is unchanged.
    expect(planFor(2).w).toBe(10);
  });

  it('owners get their property; renters the kind their lifestyle pays for', () => {
    expect(homeSpecOf({ tier: 'villa', wealth: 2 }, 4)).toEqual({ kind: 'villa', wealth: 2 });
    expect(homeSpecOf(null, 4)).toEqual({ kind: 'house', wealth: 1 });
    expect(homeSpecOf(null, 1).kind).toBe('room');
  });
});

describe('Wave 12: the grounds', () => {
  it('a villa has a pool, loungers, a gated drive, hedges and a carport', () => {
    const plan = planFor(4, { kind: 'villa', wealth: 1 });
    const g = groundsFor(plan, ['luxury', 'city-suv', 'hatchback']);
    expect(g.style).toBe('estate');
    expect(g.pool).not.toBeNull();
    expect(g.loungers.length).toBeGreaterThanOrEqual(2);
    expect(g.gate).not.toBeNull();
    expect(g.hedges.length).toBeGreaterThan(3);
    expect(g.carport).not.toBeNull();
    // Every car has its own bay of its kind, and nothing overlaps the house.
    const cars = g.bays.filter((b) => b.car);
    expect(cars.map((b) => [b.car, b.kind]).sort()).toEqual(
      [
        ['city-suv', 'carport'],
        ['hatchback', 'open'],
        ['luxury', 'showroom'],
      ].sort(),
    );
    for (const b of g.bays) expect(b.y).toBeGreaterThan(plan.h);
    const pool = g.pool!;
    // Behind the house, as in the reference picture.
    expect(pool.y + pool.h).toBeLessThan(0);
    // The lawn holds the focus.
    const f = g.focus;
    for (const [x, y] of [
      [f.x, f.y],
      [f.x + f.w, f.y + f.h],
    ] as const)
      expect(Math.hypot(x - g.lawn.x, y - g.lawn.y)).toBeLessThan(g.lawn.r);
    expect(outdoorThings(g).filter((o) => o.model.startsWith('car:'))).toHaveLength(3);
  });

  it('a mansion has a bigger pool and a formal garden; a penthouse a hot tub on the roof', () => {
    const villa = groundsFor(planFor(4, { kind: 'villa', wealth: 1 }), []);
    const m = groundsFor(planFor(5, { kind: 'mansion', wealth: 2 }), []);
    expect(m.pool!.w * m.pool!.h).toBeGreaterThan(villa.pool!.w * villa.pool!.h);
    expect(m.fountain).not.toBeNull();
    expect(m.beds.length).toBeGreaterThan(0);
    const p = groundsFor(planFor(4, { kind: 'penthouse', wealth: 1 }), ['electric']);
    expect(p.style).toBe('roof');
    expect(p.pool?.hot).toBe(true);
    expect(p.bays.filter((b) => b.car)).toHaveLength(1);
    const flat = groundsFor(planFor(2, { kind: 'apartment', wealth: 1 }), []);
    expect(flat.pool).toBeNull();
    expect(flat.gate).toBeNull();
  });

  it('puts SUVs under the carport, supercars in the showroom, EVs at a charger', () => {
    expect(bayKindOf('city-suv')).toBe('carport');
    expect(bayKindOf('luxury')).toBe('showroom');
    expect(bayKindOf('electric')).toBe('charger');
    expect(bayKindOf('hatchback')).toBe('open');
    // Eight cars at most, deterministic.
    const plan = planFor(5, { kind: 'mansion', wealth: 3 });
    const many = Array.from({ length: 10 }, (_, i) => ['hatchback', 'city-suv', 'luxury'][i % 3]!);
    const a = groundsFor(plan, many);
    expect(a.bays.filter((b) => b.car)).toHaveLength(8);
    expect(groundsFor(plan, many)).toEqual(a);
  });
});

describe('floors: a house has an upstairs, a mansion a roof terrace; every home a bathroom', () => {
  /** What's in a floor's bathrooms (fixtures and the things a bigger home comes with). */
  const bathThings = (p: HomePlan) => {
    const baths = p.rooms.filter((r) => r.id === 'bathroom');
    const inBath = (s: { x: number; y: number }) =>
      baths.some((r) => s.x >= r.x && s.x < r.x + r.w && s.y >= r.y && s.y < r.y + r.h);
    return [
      ...Object.entries(p.fixtures)
        .filter(([, s]) => s && inBath(s))
        .map(([id]) => id),
      ...p.decor.filter((d) => inBath(d.spot)).map((d) => d.model),
    ];
  };
  const STANDING = ['toilet', 'sink', 'shower', 'bathtub', 'pool', 'piano'];

  for (const kind of KINDS)
    for (const wealth of [0, 1, 2, 3])
      it(`${kind}, wealth ${wealth}: every floor works, and the home has a proper bathroom`, () => {
        const floors = floorsFor(TIER_OF_KIND[kind], { kind, wealth });
        const storeys =
          kind === 'mansion' ? 3 : ['townhouse', 'house', 'villa'].includes(kind) ? 2 : 1;
        expect(floors).toHaveLength(storeys);
        floors.forEach((p, i) => expect(p.level ?? 0).toBe(i));
        // Every slot is on exactly one floor.
        expect(floors.flatMap((p) => Object.keys(p.slots)).sort()).toEqual([...HOME_SLOTS].sort());
        // A bathroom you'd recognise: a toilet, a basin and a shower or a bath, behind a door.
        const things = new Set(floors.flatMap(bathThings));
        for (const t of ['toilet', 'sink']) expect(things.has(t), t).toBe(true);
        expect(things.has('shower') || things.has('bathtub')).toBe(true);
        for (const p of floors)
          expect(bathDoors(p)).toHaveLength(p.rooms.filter((r) => r.id === 'bathroom').length);
        for (const p of floors) {
          const cover = new Set<string>();
          for (const r of p.rooms)
            for (let x = r.x; x < r.x + r.w; x++)
              for (let y = r.y; y < r.y + r.h; y++) {
                expect(cover.has(key(x, y)), `${r.id} at ${key(x, y)}`).toBe(false);
                cover.add(key(x, y));
              }
          expect(cover.size).toBe(p.w * p.h);
          for (const owned of [new Set<string>(), ALL]) {
            const seen = new Map<string, string>();
            const standing = [
              ...Object.entries(p.slots).filter(([s]) => owned.has(s)),
              ...p.decor.map((d) => [d.id, d.spot] as const),
              ...Object.entries(p.fixtures).filter(([f]) => STANDING.includes(f)),
            ];
            for (const [id, s] of standing) {
              if (!s || !s.blocked || s.wall) continue;
              for (let x = s.x; x < s.x + s.w; x++)
                for (let y = s.y; y < s.y + s.h; y++) {
                  expect(x >= 0 && y >= 0 && x < p.w && y < p.h, `${id} in bounds`).toBe(true);
                  expect(seen.get(key(x, y)), `${id} on ${seen.get(key(x, y))}`).toBeUndefined();
                  seen.set(key(x, y), id);
                }
            }
            const g: Grid = {
              w: p.w,
              h: p.h,
              blocked: blockedTiles(p, owned),
              walls: wallEdges(p),
            };
            for (const s of [
              ...Object.values(p.slots),
              ...Object.values(p.fixtures),
              ...p.decor.map((d) => d.spot),
            ])
              expect(
                findPath(g, p.door, s!.interact),
                `floor ${p.level} ${key(s!.interact.x, s!.interact.y)}`,
              ).not.toBeNull();
            for (const r of p.rooms) {
              let ok = false;
              for (let x = r.x; x < r.x + r.w && !ok; x++)
                for (let y = r.y; y < r.y + r.h && !ok; y++)
                  if (!g.blocked.has(key(x, y)) && findPath(g, p.door, { x, y })) ok = true;
              expect(ok, `floor ${p.level} ${r.id} at ${r.x},${r.y}`).toBe(true);
            }
          }
          for (const slot of MOVABLE) {
            const s = p.slots[slot];
            if (s) expect(canPlace(p, ALL, slot, { x: s.x, y: s.y, rot: 0 }), slot).toBe(true);
          }
        }
        // The stairs join the floors: each leads to the next one up, and back down.
        const leadsTo = (p: HomePlan, n: number) =>
          p.decor.some((d) => d.verbs.some((v) => 'to' in v && v.to === n));
        for (let i = 0; i < floors.length - 1; i++) {
          expect(leadsTo(floors[i]!, i + 1), `up from ${i}`).toBe(true);
          expect(leadsTo(floors[i + 1]!, i), `down from ${i + 1}`).toBe(true);
        }
      });

  it('a mansion: a hall with a grand staircase, a master suite and a balcony, a roof terrace', () => {
    const [ground, upper, roof] = floorsFor(5, { kind: 'mansion', wealth: 3 });
    const ids = (p: HomePlan) => p.rooms.map((r) => r.id);
    expect(ids(ground!)).toEqual(
      expect.arrayContaining([
        'hall',
        'living',
        'kitchen',
        'dining',
        'bathroom',
        'office',
        'cinema',
      ]),
    );
    expect(ground!.decor.find((d) => d.model === 'stairs')!.spot.w).toBe(3);
    expect(ids(upper!)).toEqual(expect.arrayContaining(['landing', 'bedroom', 'guest', 'balcony']));
    expect(ids(upper!).filter((r) => r === 'bathroom')).toHaveLength(2);
    expect(upper!.rooms.find((r) => r.id === 'balcony')!.open).toBe(true);
    expect(upper!.slots.bed).toBeDefined();
    expect(upper!.decor.filter((d) => d.model === 'guest-bed').length).toBeGreaterThanOrEqual(3);
    expect(roof!.rooms.every((r) => r.open)).toBe(true);
    // The renter's flat and a studio stay one floor.
    expect(floorsFor(2)).toHaveLength(1);
    expect(floorsFor(1, { kind: 'studio', wealth: 1 })).toHaveLength(1);
  });

  it('a penthouse terrace has a rail to watch the skyline and throw a party from', () => {
    const g = groundsFor(planFor(4, { kind: 'penthouse', wealth: 1 }), []);
    const view = outdoorThings(g).find((o) => o.id === 'skyline')!;
    expect(view.verbs.map((v) => ('act' in v ? v.act : v.id))).toEqual(['skyline', 'party']);
    expect(view.y).toBeGreaterThan(g.terrace!.y);
    expect(groundsFor(planFor(4, { kind: 'villa', wealth: 1 }), []).view).toBeUndefined();
  });
});
