// @vitest-environment node
/**
 * Wave 10 §B: no building in the 3D city stands in another's space.
 *
 * Real data: a block of committed full-density tiles (public/geo/<city>/)
 * goes through the same thinning the map does as tiles stream in; then the
 * generated infill over a stretch of Lagos is checked against itself, the
 * city file's real outlines, the road ribbons and the game's ground.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGeo } from '../src/city/geo';
import { decodeTile } from '../src/city/geo3d/tiles';
import {
  CHUNK,
  LOT_GAP,
  LotMaker,
  lotPoly,
  osmFootprints,
  REAL_GAP,
  ROAD_SETBACK,
  type BoxB,
} from '../src/city/three/buildings';
import { cityLook } from '../src/city/three/cities';
import {
  convexOverlap,
  dedupeFootprints,
  discPoly,
  FootprintGrid,
  makeFp,
  overlapArea,
  rectPoly,
  segRectDist,
  type Fp,
} from '../src/city/three/footprints';
import { GroundMask, ROAD_HALF } from '../src/city/three/mask';
import { RoadIndex } from '../src/city/three/roads';
import { tileBuildings } from '../src/city/three/tiles';

const HERE = dirname(fileURLToPath(import.meta.url));
const geoDir = (city: string) => join(HERE, '..', 'public', 'geo', city) + '/';

/** Overlap allowed between two real outlines: a sliver (1 m², or 2% of the smaller). */
const tolOf = (a: Fp, b: Fp) => Math.max(1, 0.02 * Math.min(a.area, b.area));

/** Pairs that share space in plan (beyond the sliver) and in height. */
function clashes(list: Fp[]) {
  const grid = new FootprintGrid();
  for (const f of list) grid.add(f);
  const out: [Fp, Fp, number][] = [];
  for (const f of list)
    for (const o of grid.query(f.box)) {
      if (o === f || o.area > f.area || (o.area === f.area && o.p[0]! >= f.p[0]!)) continue;
      if (f.top <= o.base + 0.05 || o.top <= f.base + 0.05) continue;
      const ov = overlapArea(f, o);
      if (ov > tolOf(f, o)) out.push([f, o, ov]);
    }
  return out;
}

function tileFps(city: string, tx: number, ty: number) {
  const buf = readFileSync(`${geoDir(city)}b-${tx}_${ty}.bin`);
  const list = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return tileBuildings(list);
}

describe('no overlaps in the 3D city (Wave 10 §B)', () => {
  it('measures shared area exactly, concave outlines too', () => {
    const a = makeFp([0, 0, 10, 0, 10, 10, 0, 10]);
    const b = makeFp([5, 5, 15, 5, 15, 15, 5, 15]);
    expect(overlapArea(a, b)).toBeCloseTo(25, 6);
    // An L: the notch is empty.
    const l = makeFp([0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10]);
    expect(overlapArea(l, makeFp([6, 6, 9, 6, 9, 9, 6, 9]))).toBeCloseTo(0, 6);
    expect(overlapArea(l, makeFp([2, 2, 6, 2, 6, 6, 2, 6]))).toBeCloseTo(12, 6);
    expect(convexOverlap(rectPoly(0, 0, 10, 10, 0.3), rectPoly(9.5, 0, 10, 10, 0.3))).toBe(true);
    expect(convexOverlap(rectPoly(0, 0, 10, 10, 0), rectPoly(10.5, 0, 10, 10, 0))).toBe(false);
    expect(segRectDist(-20, 8, 20, 8, 0, 0, 10, 10, 0)).toBeCloseTo(3, 6);
    expect(segRectDist(-20, 0, 20, 0, 0, 0, 10, 10, 0)).toBe(0);
  });

  it('drops the smaller of two overlapping real outlines, stacks a tower on its podium', () => {
    const podium = makeFp([0, 0, 60, 0, 60, 60, 0, 60], 0, 15);
    const tower = makeFp([20, 20, 40, 20, 40, 40, 20, 40], 0, 120);
    const dup = makeFp([1, 1, 30, 1, 30, 30, 1, 30], 0, 12);
    const r = dedupeFootprints([dup, tower, podium]);
    expect(r.kept).toContain(podium);
    expect(r.kept).toContain(tower);
    expect(r.dropped).toEqual([dup]);
    expect(tower.base).toBe(15);
    expect(clashes(r.kept)).toEqual([]);
  });

  for (const [city, tiles] of [
    [
      'san-francisco',
      [
        [1, 2],
        [2, 2],
        [1, 3],
        [2, 3],
      ],
    ],
    [
      'lagos',
      [
        [-7, 7],
        [-6, 7],
        [-7, 8],
        [-6, 8],
      ],
    ],
    [
      'london',
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    ],
  ] as const)
    it(`thins ${city}'s real tiles (OSM + Overture) to zero overlaps`, () => {
      const look = cityLook(city);
      // Raw: the data does overlap (Overture footprints over OSM parts).
      const raw: Fp[] = [];
      for (const [tx, ty] of tiles)
        for (const b of tileFps(city, tx, ty))
          raw.push(makeFp(Array.from(b.p), b.base ?? 0, b.hm ?? 10));
      expect(raw.length).toBeGreaterThan(1500);
      // As the map streams them in: one tile after another, against what stands.
      const grid = new FootprintGrid();
      const blocked = new FootprintGrid();
      blocked.add(makeFp(discPoly(tiles[0]![0] * 1000 + 500, tiles[0]![1] * 1000 + 500, 40)));
      const kept: Fp[] = [];
      for (const [tx, ty] of tiles)
        kept.push(
          ...osmFootprints({ buildings: tileFps(city, tx, ty) }, look, [], city, {
            grid,
            blocked,
          }).fps,
        );
      expect(kept.length).toBeGreaterThan(raw.length * 0.8);
      expect(
        clashes(kept).map(([a, b, v]) => [a.area, b.area, v, a.base, a.top, b.base, b.top]),
      ).toEqual([]);
      for (const f of kept) expect(blocked.overlapsPlan(f, 0.5)).toBe(false);
      if (city === 'lagos' || city === 'london') expect(clashes(raw).length).toBeGreaterThan(0);
    });

  it('keeps generated lots apart, off the roads, off real buildings and the game’s ground', async () => {
    const g = (await loadGeo('lagos'))!;
    const look = cityLook('lagos');
    const mask = new GroundMask(g, 256);
    const roads = new RoadIndex(g);
    const real = new FootprintGrid();
    const blocked = new FootprintGrid();
    const [c0, c1, c2, c3] = g.core;
    const cx = (c0 + c2) / 2;
    const cy = (c1 + c3) / 2;
    // A place's plot in the middle of it all.
    blocked.add(makeFp(rectPoly(cx + 40, cy + 40, 30, 30, 0.2)));
    const realFps = osmFootprints(g, look, [], 'lagos', { grid: real, blocked }).fps;
    const lots = new LotMaker(
      mask,
      roads,
      look,
      [{ x: cx, y: cy, r: 4000, w: 1 }],
      'lagos',
      g.bounds,
      { real, blocked },
    );
    const ci0 = Math.floor(cx / CHUNK) - 2;
    const cj0 = Math.floor(cy / CHUNK) - 2;
    const mains: BoxB[] = [];
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const { low, tall } = lots.chunk(ci0 + i, cj0 + j);
        // Footprints only: roof plant and a tower's upper tiers stand on their own roofs.
        for (const b of [...low, ...tall]) if (b.y0 === 0) mains.push(b);
      }
    expect(mains.length).toBeGreaterThan(200);
    // Lot to lot: a gap all round.
    const polys = mains.map((b) => lotPoly(b, LOT_GAP / 2 - 0.01));
    const grid = new FootprintGrid();
    const fps = polys.map((p) => makeFp(p));
    fps.forEach((f) => grid.add(f));
    let lotClash = 0;
    fps.forEach((f, i) => {
      for (const o of grid.query(f.box)) if (o !== f && convexOverlap(f.p, o.p)) lotClash++;
      void i;
    });
    expect(lotClash).toBe(0);
    // Lot to real building, place or landmark.
    for (const b of mains) {
      const f = makeFp(lotPoly(b, REAL_GAP - 0.01));
      expect(real.overlapsPlan(f)).toBe(false);
      expect(blocked.overlapsPlan(f)).toBe(false);
    }
    expect(realFps.length).toBeGreaterThan(100);
    // Lot to road: the ribbon's half-width and a setback.
    let near = 0;
    for (const b of mains) {
      const k = b.roofType === 1 ? 1.12 : 1;
      roads.forNear(b.x, b.y, 60, (s) => {
        const d = segRectDist(s.ax, s.ay, s.bx, s.by, b.x, b.y, b.w * k, b.d * k, b.rot);
        if (d < ROAD_HALF[s.c]! + ROAD_SETBACK - 0.01) near++;
      });
    }
    expect(near).toBe(0);
    // Where a full-density tile stands, no lot at all.
    const tx = Math.floor(cx / 1000);
    const ty = Math.floor(cy / 1000);
    lots.setTiles(new Set([`${tx}_${ty}`]), 1000);
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const { low, tall } = lots.chunk(ci0 + i, cj0 + j);
        for (const b of [...low, ...tall]) {
          const inX = b.x > tx * 1000 - 20 && b.x < tx * 1000 + 1020;
          const inY = b.y > ty * 1000 - 20 && b.y < ty * 1000 + 1020;
          expect(inX && inY).toBe(false);
        }
      }
  });
});
