import { describe, expect, it } from 'vitest';
import {
  BODY,
  cabinPlan,
  legClear,
  outsideAt,
  pathClear,
  placeFor,
  segmentGap,
  walkPath,
  type PlaceId,
} from '../src/city/premium/cabinplan';

/**
 * Player feedback: "When going to the bar/shower we can walk through the
 * wall." The walk follows the plan: out of your suite through its door,
 * along the aisle, through the bulkhead's doorway; never through a wall.
 */
describe('the first class walk', () => {
  const plan = cabinPlan('first');
  const pts = (ids: PlaceId[]) => ids.map((id) => plan.places[id]!);

  it('the old straight line from the seat to the bar went through walls', () => {
    const seat = plan.places.seat!;
    expect(legClear(plan, seat, plan.places.bar!)).toBe(false);
    expect(legClear(plan, seat, plan.places.spa!)).toBe(false);
  });

  it('walks to the bar out of the door, up the aisle and through the doorway', () => {
    const path = walkPath(plan, 'seat', 'bar')!;
    expect(path[0]).toBe('seat');
    expect(path.at(-1)).toBe('bar');
    for (const id of ['stand', 'door', 'aisle', 'doorway'] as const) expect(path).toContain(id);
    // The leg into the bar passes the doorway (between its jambs, at the bulkhead).
    const into = pts(path).findIndex((p) => p.z < plan.bulkhead);
    const a = pts(path)[into - 1]!;
    const b = pts(path)[into]!;
    const k = (plan.bulkhead - a.z) / (b.z - a.z);
    const x = a.x + k * (b.x - a.x);
    expect(x).toBeGreaterThan(plan.doorway![0] + BODY);
    expect(x).toBeLessThan(plan.doorway![1] - BODY);
    // Everything after getting up stays clear of the walls.
    expect(pathClear(plan, pts(path.slice(1)))).toBe(true);
  });

  it('walks to the shower spa through its own door', () => {
    const path = walkPath(plan, 'seat', 'spa')!;
    expect(path.slice(0, 4)).toEqual(['seat', 'stand', 'door', 'aisle']);
    expect(path.at(-1)).toBe('spa');
    expect(pathClear(plan, pts(path.slice(1)))).toBe(true);
    const into = pts(path).findIndex((p) => p.z < plan.bulkhead);
    const a = pts(path)[into - 1]!;
    const b = pts(path)[into]!;
    const x = a.x + ((plan.bulkhead - a.z) / (b.z - a.z)) * (b.x - a.x);
    expect(x).toBeGreaterThan(plan.spaDoor![0]);
    expect(x).toBeLessThan(plan.spaDoor![1]);
  });

  it('walks back the same way, and from the bar to the spa', () => {
    const back = walkPath(plan, 'bar', 'seat')!;
    expect(back.slice(0, 2)).toEqual(['bar', 'doorway']);
    expect(back.slice(-4)).toEqual(['aisle', 'door', 'stand', 'seat']);
    expect(pathClear(plan, pts(back.slice(0, -1)))).toBe(true);
    const across = walkPath(plan, 'bar', 'spa')!;
    expect(across).toContain('doorway');
    expect(pathClear(plan, pts(across))).toBe(true);
  });

  it('the crew come from the galley to your door along the aisle', () => {
    const path = walkPath(plan, 'galley', 'serve')!;
    expect(pathClear(plan, pts(path))).toBe(true);
  });

  it('the bar and the spa are first class only', () => {
    expect(placeFor('bar', 'first')).toBe('bar');
    expect(placeFor('spa', 'first')).toBe('spa');
    expect(placeFor('bar', 'business')).toBe('seat');
    expect(placeFor('dine', 'first')).toBe('seat');
  });
});

describe('the business cabin', () => {
  const plan = cabinPlan('business');
  it('is 1-2-1: four pods a row, two aisles', () => {
    expect(plan.aisles).toHaveLength(2);
    const rows = new Set(plan.pods.map((p) => p.z));
    expect(plan.pods.length).toBe(rows.size * 4);
    expect(plan.pods.filter((p) => p.mine)).toHaveLength(1);
  });
  it('the crew walk the aisle to your pod', () => {
    const path = walkPath(plan, 'galley', 'serve')!;
    expect(path).not.toBeNull();
    expect(
      pathClear(
        plan,
        path.map((id) => plan.places[id]!),
      ),
    ).toBe(true);
  });
});

describe('segment gaps', () => {
  it('is zero for crossing segments and the nearest distance otherwise', () => {
    const p = (x: number, z: number) => ({ x, z });
    expect(segmentGap(p(0, 0), p(2, 2), p(0, 2), p(2, 0))).toBe(0);
    expect(segmentGap(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBeCloseTo(1);
  });
});

describe('outside the windows', () => {
  it('climbs after take-off, cruises, and descends for the arrival', () => {
    const a = outsideAt('boarding', 0);
    expect(a.phase).toBe('climb');
    expect(a.altitude).toBeLessThan(0.2);
    expect(a.pitch).toBeGreaterThan(0);
    expect(outsideAt('boarding', 20).altitude).toBeGreaterThan(a.altitude);
    expect(outsideAt('boarding', 120)).toEqual({ phase: 'cruise', altitude: 1, pitch: 0 });
    expect(outsideAt('meal', 5).phase).toBe('cruise');
    expect(outsideAt('night', 5).altitude).toBe(1);
    const d = outsideAt('arrival', 0);
    expect(d.phase).toBe('descent');
    expect(outsideAt('arrival', 200).altitude).toBeLessThan(0.2);
  });
});
