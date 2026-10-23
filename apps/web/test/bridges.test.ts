import { describe, expect, it } from 'vitest';
import { fromLatLon, GEO_LANDMARKS, loadGeo, type GeoData } from '../src/city/geo';
import { bridgeEnds } from '../src/city/geoLayout';
import { BAY_ANCHORAGE, BAY_TOWERS } from '../src/city/three/landmarks';
import { RoadIndex } from '../src/city/three/roads';

const spec = (city: string, name: RegExp) => GEO_LANDMARKS[city]!.find((s) => name.test(s.name))!;
const lerp = (e: NonNullable<ReturnType<typeof bridgeEnds>>, t: number) => ({
  x: e.at.x + (e.to.x - e.at.x) * t,
  y: e.at.y + (e.to.y - e.at.y) * t,
});
/** Distance from a point to the nearest bridge way of this name in the file. */
function offWay(g: GeoData, re: RegExp, p: { x: number; y: number }) {
  let best = Infinity;
  for (const b of g.bridges)
    if (b.n && re.test(b.n))
      for (let i = 0; i + 3 < b.l.length; i += 2) {
        const [ax, ay, bx, by] = [b.l[i]!, b.l[i + 1]!, b.l[i + 2]!, b.l[i + 3]!];
        const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / L2));
        best = Math.min(best, Math.hypot(p.x - ax - (bx - ax) * t, p.y - ay - (by - ay) * t));
      }
  return best;
}

const inPoly = (p: number[], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const [xi, yi, xj, yj] = [p[2 * i]!, p[2 * i + 1]!, p[2 * j]!, p[2 * j + 1]!];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** On the file's land (and not in its water). */
const onLand = (g: GeoData, p: { x: number; y: number }) =>
  g.land.some((l) => inPoly(l, p.x, p.y)) && !g.water.some((w) => inPoly(w, p.x, p.y));

describe('landmark bridges stand on their real decks, over the water', () => {
  it('the Bay Bridge: on the I-80 deck, from the shore to Yerba Buena, not up on Rincon Hill', async () => {
    const g = (await loadGeo('san-francisco'))!;
    const e = bridgeEnds(g, spec('san-francisco', /Bay Bridge/))!;
    expect(e).not.toBeNull();
    // Its line is the file's deck (the towers and cables hang over the road).
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      expect(offWay(g, /Eisenhower/, lerp(e, t))).toBeLessThan(20);
    // The span is over the bay; it starts at the shore, not back over the city.
    for (const t of [0.1, 0.18, 0.4, 0.6, 0.82, 0.9]) {
      const p = lerp(e, t);
      expect(onLand(g, p), `t=${t}`).toBe(false);
    }
    const L = Math.hypot(e.to.x - e.at.x, e.to.y - e.at.y);
    expect(L).toBeGreaterThan(2500);
    expect(L).toBeLessThan(3100);
    // Facing out from the city (south-west end first), and well clear of the
    // penthouse balcony on Rincon Hill.
    const rincon = fromLatLon(g, 37.7848, -122.3905);
    expect(Math.hypot(e.at.x - rincon.x, e.at.y - rincon.y)).toBeGreaterThan(350);
    expect(e.to.y).toBeLessThan(e.at.y);
  });

  it('the Bay Bridge’s towers stand where the file maps them', async () => {
    const g = (await loadGeo('san-francisco'))!;
    const e = bridgeEnds(g, spec('san-francisco', /Bay Bridge/))!;
    const L = Math.hypot(e.to.x - e.at.x, e.to.y - e.at.y);
    const [ux, uy] = [(e.to.x - e.at.x) / L, (e.to.y - e.at.y) / L];
    const found: number[] = [];
    let anchorage = -1;
    for (const b of g.buildings) {
      let [cx, cy] = [0, 0];
      for (let i = 0; i < b.p.length; i += 2) [cx, cy] = [cx + b.p[i]!, cy + b.p[i + 1]!];
      [cx, cy] = [cx / (b.p.length / 2), cy / (b.p.length / 2)];
      const t = ((cx - e.at.x) * ux + (cy - e.at.y) * uy) / L;
      const off = Math.abs((cx - e.at.x) * uy - (cy - e.at.y) * ux);
      if (t < 0 || t > 1 || off > 20) continue;
      if (b.n && /Anchorage/i.test(b.n)) anchorage = t;
      else if ((b.h ?? 0) >= 40) found.push(t);
    }
    expect(found).toHaveLength(BAY_TOWERS.length);
    for (const t of found)
      expect(Math.min(...BAY_TOWERS.map((x) => Math.abs(x - t)))).toBeLessThan(0.01);
    expect(Math.abs(anchorage - BAY_ANCHORAGE)).toBeLessThan(0.01);
  });

  it('the file’s Bay Bridge decks rise with it: no second deck low on the water', async () => {
    const g = (await loadGeo('san-francisco'))!;
    const e = bridgeEnds(g, spec('san-francisco', /Bay Bridge/))!;
    const roads = new RoadIndex(g);
    roads.raiseAlong(e.at.x, e.at.y, e.to.x, e.to.y, 58);
    for (const t of [0.3, 0.5, 0.7]) {
      const p = lerp(e, t);
      // Every deck within a carriageway or two of the line is up at the bridge's height.
      for (const s of roads.decks) {
        const mx = (s.ax + s.bx) / 2;
        const my = (s.ay + s.by) / 2;
        if (Math.hypot(mx - p.x, my - p.y) < 60) expect((s.ha + s.hb) / 2).toBeGreaterThan(50);
      }
    }
    // The viaduct on Rincon Hill, past the shore, stays down at street level.
    const rincon = fromLatLon(g, 37.7863, -122.3902);
    expect(roads.deckAt(rincon.x, rincon.y)).toBeLessThan(12);
  });

  it('the Golden Gate’s long ways stay level across the strait (they sagged end to end)', async () => {
    const g = (await loadGeo('san-francisco'))!;
    const e = bridgeEnds(g, spec('san-francisco', /Golden Gate/))!;
    const roads = new RoadIndex(g);
    roads.raiseAlong(e.at.x, e.at.y, e.to.x, e.to.y, 67);
    for (const s of roads.decks)
      if (s.n && /Golden Gate/.test(s.n)) {
        const L = Math.hypot(e.to.x - e.at.x, e.to.y - e.at.y);
        const t =
          (((s.ax + s.bx) / 2 - e.at.x) * (e.to.x - e.at.x) +
            ((s.ay + s.by) / 2 - e.at.y) * (e.to.y - e.at.y)) /
          (L * L);
        if (t > 0.15 && t < 0.85)
          expect(Math.min(s.ha, s.hb), JSON.stringify(s)).toBeGreaterThan(60);
      }
  });

  it('Tower Bridge spans the Thames between its approaches', async () => {
    const g = (await loadGeo('london'))!;
    const e = bridgeEnds(g, spec('london', /Tower Bridge/))!;
    const L = Math.hypot(e.to.x - e.at.x, e.to.y - e.at.y);
    // Both approaches, not just the north one (it stood on the bank, 116 m long).
    expect(L).toBeGreaterThan(250);
    expect(L).toBeLessThan(350);
    // Its towers stand in the river.
    for (const t of [0.39, 0.5, 0.61]) expect(onLand(g, lerp(e, t))).toBe(false);
  });

  it('keeps the other bridges on their own ways', async () => {
    for (const [city, name, re] of [
      ['san-francisco', /Golden Gate/, /Golden Gate Bridge/],
      ['lagos', /Lekki/, /Lekki.*Ikoyi/],
      ['johannesburg', /Mandela/, /Nelson Mandela Bridge/],
    ] as const) {
      const g = (await loadGeo(city))!;
      const e = bridgeEnds(g, spec(city, name))!;
      expect(e, city).not.toBeNull();
      for (const t of [0, 0.5, 1]) expect(offWay(g, re, lerp(e, t))).toBeLessThan(20);
    }
  });
});
