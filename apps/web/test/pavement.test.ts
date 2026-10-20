import { describe, expect, it } from 'vitest';
import { KERB, offsetPath, pavementPath, sideOf } from '../src/city/three/pavement';

describe('pavements and lanes', () => {
  it('keeps a walk on one pavement, round the inside of a corner', () => {
    // North (y down is south) up x = 0, then right, east along y = -100.
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: -100 },
      { x: 100, y: -100 },
    ];
    const out = pavementPath(pts, [5, 5], 1, 1, () => false);
    // Right of travel going north is east (+x); going east it is south (+y).
    expect(out[0]).toEqual({ x: 5, y: 0 });
    expect(out[1]!.x).toBeCloseTo(5);
    expect(out[1]!.y).toBeCloseTo(-95);
    expect(out[2]).toEqual({ x: 100, y: -95 });
  });

  it('crosses over only at the last junction before the end', () => {
    const pts = [0, 100, 200, 300].map((x) => ({ x, y: 0 }));
    // Junctions at 100 and 200: from the right-hand pavement to the left one at 200.
    const out = pavementPath(pts, [5, 5, 5], 1, -1, (k) => k === 1 || k === 2);
    const ys = out.map((p) => p.y);
    expect(ys[0]).toBe(5);
    // Along the right side to x = 200, across there, on along the left.
    const cross = out.findIndex((p) => p.y < 0);
    expect(out[cross - 1]!.x).toBeCloseTo(200);
    expect(out[cross]!.x).toBeCloseTo(200);
    expect(ys.at(-1)).toBe(-5);
    expect(out.slice(0, cross).every((p) => p.y > 0)).toBe(true);
  });

  it('crosses halfway along a single stretch', () => {
    const out = pavementPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [4],
      1,
      -1,
      () => false,
    );
    expect(out[0]!.y).toBe(4);
    expect(out.at(-1)!.y).toBe(-4);
    expect(out.some((p) => Math.abs(p.x - 50) < 1e-6)).toBe(true);
  });

  it('offsets a lane to one side, and tells sides apart', () => {
    const lane = offsetPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 50 },
      ],
      [-2],
    );
    // Going south (+y), right of travel is west (-x): -2 is two metres east.
    expect(lane[0]!.x).toBeCloseTo(2);
    expect(sideOf({ x: 0, y: 0 }, { x: 0, y: 50 }, { x: -3, y: 10 })).toBe(1);
    expect(sideOf({ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 3, y: 10 })).toBe(-1);
    // The pavement is beyond the drawn road, widest on the big roads.
    expect(KERB[0]).toBeGreaterThan(KERB[5]!);
  });
});
