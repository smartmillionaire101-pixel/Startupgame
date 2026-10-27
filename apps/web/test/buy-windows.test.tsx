import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HOME_SLOTS } from '../src/city/life';
import { groundsFor } from '../src/home/grounds';
import { hotelGrounds, hotelPlan, HOTEL_WINDOWS } from '../src/home/hotel';
import { HomeWindows } from '../src/home/HomeWindows';
import { floorsFor, planFor, TIER_OF_KIND, type HomeKind, type HomePlan } from '../src/home/layout';
import { homeWindows, overOpening, wallOpenings } from '../src/home/windows';
import { buildHouse } from '../src/interiors3d/house';
import {
  canPlace,
  extraKey,
  nudgeOnWall,
  snapToWall,
  wallBehind,
  withPlacements,
  type Placement,
} from '../src/interiors3d/placement';

/**
 * Playtest #40: a poster could hang over a window. One list of a home's
 * windows (the 3D house builds from it, the 2D home draws from it), and a
 * picture is never put over one: its own spot, a nudge, a spot saved before.
 */
const KINDS: HomeKind[] = [
  'room',
  'studio',
  'apartment',
  'townhouse',
  'house',
  'villa',
  'mansion',
  'penthouse',
];
const ALL = new Set<string>(HOME_SLOTS);

/** jsdom has no 2D canvas: the house's painted textures draw into a context that does nothing. */
const noop: object = new Proxy(() => noop, { get: () => noop, set: () => true, apply: () => noop });
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    noop) as unknown as HTMLCanvasElement['getContext'];
});

/** Every home: the renter's flat of each tier, every kind at every wealth, every floor. */
const homes: { name: string; plan: HomePlan }[] = [];
for (let t = 1; t <= 5; t++) homes.push({ name: `tier ${t}`, plan: planFor(t) });
for (const kind of KINDS)
  for (const wealth of [0, 1, 2, 3])
    floorsFor(TIER_OF_KIND[kind], { kind, wealth }).forEach((plan, i) =>
      homes.push({ name: `${kind} w${wealth} floor ${i}`, plan }),
    );

const wallRot = (plan: HomePlan, s: { x: number; y: number; w: number; rot?: number }) =>
  s.rot ?? (s.y === 0 ? 0 : s.x === 0 ? 1 : s.x + s.w === plan.w ? 3 : 2);

/** The tiles and ways a picture could face with a wall behind it. */
function wallSpots(plan: HomePlan): Placement[] {
  const out: Placement[] = [];
  for (let x = 0; x < plan.w; x++)
    for (let y = 0; y < plan.h; y++)
      for (let rot = 0; rot < 4; rot++) if (wallBehind(plan, x, y, rot)) out.push({ x, y, rot });
  return out;
}

describe('playtest #40: one list of windows, and no picture over one', () => {
  it('the 2D and the 3D home draw the same windows, from the one list', () => {
    for (const { name, plan } of homes) {
      const list = homeWindows(plan);
      const house = buildHouse(plan, {
        tier: plan.tier,
        night: false,
        grounds: groundsFor(plan, []),
        later: true,
      });
      expect(house.windows, name).toEqual(list);
      const svg = renderToStaticMarkup(
        <svg>
          <HomeWindows plan={plan} night={false} wallH={44} />
        </svg>,
      );
      const drawn = [...svg.matchAll(/data-window="([^"]+)"/g)].map((m) => m[1]);
      expect(drawn, name).toEqual(list.map((w) => `${w.wall}:${w.c.toFixed(2)}:${w.w.toFixed(2)}`));
    }
    // Most homes have a window to keep clear of.
    expect(homes.filter((h) => homeWindows(h.plan).length).length).toBeGreaterThan(
      homes.length / 2,
    );
  }, 60_000);

  it("a hotel room's windows are where its plan puts them, in 2D and 3D", () => {
    for (const tier of ['budget', 'business', 'luxury'] as const) {
      const plan = hotelPlan(tier);
      const grounds = hotelGrounds(plan, { tier });
      const house = buildHouse(plan, { tier: plan.tier, night: true, grounds, later: true });
      expect(house.windows).toEqual(homeWindows(plan, { hotel: HOTEL_WINDOWS[tier] }));
      expect(house.windows.map((w) => w.c)).toEqual(HOTEL_WINDOWS[tier].map((w) => w.c));
      const svg = renderToStaticMarkup(
        <svg>
          <HomeWindows plan={plan} night hotel={HOTEL_WINDOWS[tier]} wallH={44} />
        </svg>,
      );
      expect([...svg.matchAll(/data-window="back:([^:]+):/g)].map((m) => Number(m[1]))).toEqual(
        HOTEL_WINDOWS[tier].map((w) => Number(w.c.toFixed(2))),
      );
    }
  });

  it("a picture's own spot is clear of the windows and the door, in every home", () => {
    for (const { name, plan } of homes)
      for (const [k, s] of Object.entries(plan.slots)) {
        if (!s.wall) continue;
        for (let i = 0; i < s.w; i++)
          expect(
            overOpening(plan, s.x + (s.y === 0 ? i : 0), s.y, wallRot(plan, s)),
            `${name}: ${k}`,
          ).toBe(false);
        if (k === 'art')
          expect(canPlace(plan, ALL, 'art', { x: s.x, y: s.y, rot: wallRot(plan, s) }), name).toBe(
            true,
          );
      }
  });

  it('can never be put over a window; nudges skip past one to the next clear spot', () => {
    for (const { name, plan } of homes) {
      const openings = wallOpenings(plan);
      for (const p of wallSpots(plan)) {
        if (overOpening(plan, p.x, p.y, p.rot, openings))
          expect(canPlace(plan, ALL, 'art', p), `${name} ${p.x},${p.y},${p.rot}`).toBe(false);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const q = nudgeOnWall(plan, p, dx, dy);
          if (q === p) continue;
          const at = `${name}: ${p.x},${p.y},${p.rot} by ${dx},${dy} → ${q.x},${q.y},${q.rot}`;
          expect(wallBehind(plan, q.x, q.y, q.rot), at).toBe(true);
          expect(overOpening(plan, q.x, q.y, q.rot, openings), at).toBe(false);
        }
        const s = snapToWall(plan, p);
        if (!overOpening(plan, p.x, p.y, p.rot, openings) || s !== p)
          expect(overOpening(plan, s.x, s.y, s.rot, openings), `${name} snap`).toBe(false);
      }
    }
  }, 60_000);

  it('another painting, bought, finds a spot clear of the windows', () => {
    for (const { name, plan } of homes) {
      const k1 = extraKey('art', 'extra_a');
      const k2 = extraKey('art', 'extra_b');
      const next = withPlacements(plan, ALL, {}, [k1, k2]);
      for (const k of ['art', k1, k2]) {
        const s = next.slots[k] as (typeof next.slots)[string] & { rot?: number };
        if (!s) continue;
        expect(overOpening(next, s.x, s.y, wallRot(next, s)), `${name}: ${k}`).toBe(false);
      }
    }
  }, 60_000);

  it('a spot saved over a window (before they were kept clear) moves beside it', () => {
    let moved = 0;
    for (const { name, plan } of homes) {
      if (!plan.slots.art) continue;
      const openings = wallOpenings(plan).filter((w) => w.kind === 'window');
      for (const p of wallSpots(plan)) {
        if (!overOpening(plan, p.x, p.y, p.rot, openings)) continue;
        const next = withPlacements(plan, ALL, { art: p });
        const s = next.slots.art as (typeof next.slots)[string] & { rot?: number };
        const at = `${name}: ${p.x},${p.y},${p.rot} → ${s.x},${s.y},${s.rot}`;
        expect(overOpening(next, s.x, s.y, wallRot(next, s)), at).toBe(false);
        // Nearby, on the same wall where it can.
        expect(Math.abs(s.x - p.x) + Math.abs(s.y - p.y), at).toBeLessThanOrEqual(
          Math.max(plan.w, plan.h),
        );
        moved++;
      }
    }
    expect(moved).toBeGreaterThan(0);
    // The tier-3 flat: saved at the middle of the bedroom's window, it lands just past it.
    const plan = planFor(3);
    expect(withPlacements(plan, ALL, { art: { x: 4, y: 0, rot: 0 } }).slots.art).toMatchObject({
      y: 0,
      rot: 0,
    });
    const s = withPlacements(plan, ALL, { art: { x: 4, y: 0, rot: 0 } }).slots.art!;
    expect([2, 6]).toContain(s.x);
  }, 60_000);
});
