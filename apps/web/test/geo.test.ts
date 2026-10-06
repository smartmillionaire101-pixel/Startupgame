import { describe, expect, it } from 'vitest';
import { officeOf } from '../src/city/contract';
import { hasGeo, loadGeo, type GeoData } from '../src/city/geo';
import { buildCityLayout, buildGraph, geoMetres, geoTile } from '../src/city/geoLayout';
import {
  buildLayout,
  findPath,
  nearestStreetPoint,
  pathLength,
  travelTiles,
  type CityInput,
} from '../src/city/layout';
import { passersBy } from '../src/city/people';
import { PLANS } from '../src/city/plans';

const input = (marketId: string, over: Partial<CityInput> = {}): CityInput => ({
  marketId,
  lenders: [
    { id: 'l1', name: 'Marina Bank', look: { color: '#123', accent: '#fff', motif: 'columns' } },
    { id: 'l2', name: 'Keke Credit', look: { color: '#456', accent: '#fff', motif: 'kiosk' } },
  ],
  playerBanks: [],
  funds: Array.from({ length: 6 }, (_, i) => ({
    id: `f${i}`,
    name: `Fund ${i}`,
    office: officeOf({ id: `f${i}` }),
  })),
  segments: Array.from({ length: 21 }, (_, i) => ({
    key: `s${i}`,
    name: `Segment ${i}`,
    industry: i < 3 ? 'fintech' : 'other',
  })),
  industry: 'fintech',
  office: { headcount: 2, siren: false },
  homeTier: 2,
  businesses: PLANS[marketId]!.districts.flatMap((d, n) =>
    Array.from({ length: 3 }, (_, k) => ({
      id: `b${n}-${k}`,
      name: `Shop ${n}-${k}`,
      kind: 'shop',
      category: 'retail' as const,
      district: d.id,
      shape: (['shopfront', 'restaurant', 'kiosk'] as const)[k]!,
      color: '#eee',
      awning: null,
    })),
  ),
  capital: [{ id: 'acc', name: 'Accelerator', kind: 'accelerator' }],
  ...over,
});

const CITIES = ['lagos', 'london', 'freetown'];
const maps = new Map<string, GeoData>();
const geo = async (id: string) => {
  if (!maps.has(id)) maps.set(id, (await loadGeo(id))!);
  return maps.get(id)!;
};

describe('real city maps (Wave 8 §A)', () => {
  it('has a map file for the cities built so far, and none for unknown markets', () => {
    for (const id of CITIES) expect(hasGeo(id)).toBe(true);
    expect(hasGeo('atlantis')).toBe(false);
  });

  it('turns metres into tiles and back', () => {
    const p = geoTile(1234, -567);
    const m = geoMetres(p);
    expect(m.e).toBeCloseTo(1234, 6);
    expect(m.s).toBeCloseTo(-567, 6);
  });

  for (const id of CITIES)
    it(`walks ${id}: one connected road graph, every place reachable`, async () => {
      const data = await geo(id);
      const g = buildGraph(data);
      expect(g.nodes).toBeGreaterThan(500);
      expect(g.connected()).toBe(true);
      const layout = buildCityLayout(input(id), data);
      expect(layout.geo).toBeTruthy();
      const office = layout.places.find((p) => p.kind === 'office')!;
      expect(layout.start).toEqual(office.door);
      for (const kind of ['hub', 'home', 'airport', 'eventhall', 'lender', 'fund', 'stall'])
        expect(layout.places.some((p) => p.kind === kind)).toBe(true);
      expect(layout.places.filter((p) => p.kind === 'business')).toHaveLength(
        input(id).businesses!.length,
      );
      for (const p of layout.places) {
        // The door is on a road …
        const s = nearestStreetPoint(layout, p.door);
        expect(Math.hypot(s.x - p.door.x, s.y - p.door.y)).toBeLessThan(1e-6);
        // … and the walk from your office gets there, along roads.
        const path = findPath(layout, layout.start, p.door);
        expect(path[0]).toEqual(layout.start);
        expect(path[path.length - 1]).toEqual(p.door);
        expect(Number.isFinite(pathLength(path))).toBe(true);
        for (const q of path) {
          const n = nearestStreetPoint(layout, q);
          expect(Math.hypot(n.x - q.x, n.y - q.y)).toBeLessThan(1e-6);
        }
      }
      // Every building has its own door.
      const doors = new Set(layout.places.map((p) => `${p.door.x},${p.door.y}`));
      expect(doors.size).toBe(layout.places.length);
      // Buildings don't overlap.
      const ps = layout.places;
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i]!;
          const b = ps[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
          expect(overlap, `${a.id} / ${b.id}`).toBe(false);
        }
    });

  it('is deterministic for the market and the map', async () => {
    const data = await geo('lagos');
    const a = buildCityLayout(input('lagos'), data);
    const b = buildCityLayout(input('lagos'), data);
    expect(a.places).toEqual(b.places);
    expect(a.decor).toEqual(b.decor);
    expect(a.vehicles).toEqual(b.vehicles);
    expect(passersBy(a, 6)).toEqual(passersBy(b, 6));
  });

  it('puts districts in their real neighbourhoods (Lagos: Balogun on the Island, Lekki east)', async () => {
    const data = await geo('lagos');
    const l = buildCityLayout(input('lagos'), data);
    const at = (pred: (p: (typeof l.places)[number]) => boolean) => {
      const p = l.places.find(pred)!;
      return geoMetres({ x: p.x + p.w / 2, y: p.y + p.d / 2 });
    };
    const home = at((p) => p.kind === 'home'); // Lekki
    const stall = at((p) => p.kind === 'stall'); // Balogun, Lagos Island
    const hub = at((p) => p.kind === 'hub'); // Yaba, on the mainland
    expect(home.e).toBeGreaterThan(stall.e + 5000);
    expect(hub.s).toBeLessThan(stall.s - 3000);
    // Far trips count in the game's 50 m travel tiles.
    const path = findPath(l, l.start, l.places.find((p) => p.kind === 'home')!.door);
    expect(travelTiles(l, pathLength(path))).toBeGreaterThan(100);
  });

  it('falls back to the generated city without a map', () => {
    expect(buildCityLayout(input('lagos'), null)).toEqual(buildLayout(input('lagos')));
  });

  it('sends passers-by along real roads', async () => {
    const data = await geo('london');
    const l = buildCityLayout(input('london'), data);
    const ws = passersBy(l, 6);
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws)
      for (const q of w.route) {
        const n = nearestStreetPoint(l, q);
        expect(Math.hypot(n.x - q.x, n.y - q.y)).toBeLessThan(1e-6);
      }
  });
});
