import { describe, expect, it } from 'vitest';
import { loadGeo } from '../src/city/geo';
import { cleanOutline, h3, LotMaker } from '../src/city/three/buildings';
import { cityLook, CITY_LOOKS } from '../src/city/three/cities';
import { GroundMask } from '../src/city/three/mask';
import { getMapQuality, setMapQuality } from '../src/city/three/quality';
import { RoadIndex } from '../src/city/three/roads';
import { skyAt } from '../src/city/three/sky';

describe('the 3D city (Wave 9 §B)', () => {
  it('cleans building outlines: no closing point, one winding', () => {
    const ccw = cleanOutline([0, 0, 10, 0, 10, 10, 0, 10, 0, 0])!;
    const cw = cleanOutline([0, 0, 0, 10, 10, 10, 10, 0])!;
    expect(ccw).toHaveLength(8);
    const area = (p: number[]) => {
      let a = 0;
      for (let i = 0; i < p.length / 2; i++) {
        const j = (i + 1) % (p.length / 2);
        a += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!;
      }
      return a;
    };
    expect(Math.sign(area(ccw))).toBe(Math.sign(area(cw)));
    expect(area(ccw)).toBeLessThan(0);
    expect(cleanOutline([0, 0, 1, 1])).toBeNull();
  });

  it('hashes deterministically', () => {
    expect(h3(1, 2, 3)).toBe(h3(1, 2, 3));
    expect(h3(1, 2, 3)).not.toBe(h3(1, 2, 4));
    for (let i = 0; i < 50; i++) expect(h3(i, i * 7)).toBeGreaterThanOrEqual(0);
  });

  it('has a look for every city with a real map', () => {
    for (const id of [
      'lagos',
      'london',
      'dubai',
      'san-francisco',
      'cairo',
      'nairobi',
      'accra',
      'freetown',
      'kigali',
      'johannesburg',
    ]) {
      expect(CITY_LOOKS[id], id).toBeTruthy();
      expect(cityLook(id).walls.length).toBeGreaterThan(2);
    }
  });

  it('raises bridge decks over the water, ramps at the ends', async () => {
    const g = (await loadGeo('san-francisco'))!;
    const roads = new RoadIndex(g);
    expect(roads.decks.length).toBeGreaterThan(0);
    expect(Math.max(...roads.decks.map((s) => Math.max(s.ha, s.hb)))).toBeGreaterThan(5);
    // A landmark bridge where the file has no deck gets one at its height.
    roads.raiseAlong(-7000, 7000, -6000, 7000, 50);
    expect(roads.deckAt(-6500, 7000)).toBeCloseTo(50, 0);
    expect(roads.deckAt(-7000, 7000)).toBeLessThan(10);
  });

  it('makes the same infill every time, on land and off the roads', async () => {
    const g = (await loadGeo('lagos'))!;
    const mask = new GroundMask(g, 256);
    const roads = new RoadIndex(g);
    const look = cityLook('lagos');
    const lots = new LotMaker(
      mask,
      roads,
      look,
      [{ x: 0, y: 0, r: 3000, w: 1 }],
      'lagos',
      g.bounds,
    );
    const a = lots.chunk(-3, 15);
    const b = lots.chunk(-3, 15);
    expect(a).toEqual(b);
    for (const box of [...a.low, ...a.tall]) {
      expect(box.h).toBeGreaterThan(0);
      expect(Number.isFinite(box.x + box.y + box.w + box.d)).toBe(true);
    }
  });

  it('follows the clock: sun up at noon (to the south in the north), night at midnight', () => {
    const noon = skyAt(12.5, 37.7, 0.5);
    expect(noon.sunDir.y).toBeGreaterThan(0.4);
    expect(noon.sunDir.z).toBeGreaterThan(0);
    expect(noon.night).toBe(0);
    const south = skyAt(12.5, -26, 0.5);
    expect(south.sunDir.z).toBeLessThan(0);
    expect(skyAt(0.5, 6, 0.5).night).toBe(1);
  });

  it('remembers the map quality', () => {
    expect(['3d', 'lite']).toContain(getMapQuality());
    setMapQuality('lite');
    expect(getMapQuality()).toBe('lite');
    expect(localStorage.getItem('runway.mapQuality')).toBe('lite');
    setMapQuality('3d');
    expect(getMapQuality()).toBe('3d');
  });
});
