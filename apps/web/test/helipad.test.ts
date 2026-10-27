/**
 * The heliport's pad on open ground (player feedback: back on the pad the
 * helicopter sat among walls and windows): in every city with a helicopter
 * tour, no other place's plot within HELIPAD_CLEAR of the pad, however
 * crowded its district; and the Outside camera kept above the roofs.
 */
import { describe, expect, it } from 'vitest';
import { GAME_VENUES, type MarketId } from '@runway/engine';
import { officeOf } from '../src/city/contract';
import { loadGeo } from '../src/city/geo';
import { buildCityLayout, geoMetres, HELIPAD_CLEAR } from '../src/city/geoLayout';
import type { CityInput, Place } from '../src/city/layout';
import { chaseLift } from '../src/experiences/air/air3d';

const HELI_CITIES = (Object.keys(GAME_VENUES) as MarketId[]).filter((m) =>
  GAME_VENUES[m].some((v) => v.kind === 'heliport'),
);

const biz = (id: string, kind: string, district: string) => ({
  id,
  name: id,
  kind,
  category: 'hospitality' as const,
  district,
  shape: 'shopfront' as const,
  color: '#eee',
  awning: null,
});

const input = (marketId: string, district: string): CityInput => ({
  marketId,
  lenders: [],
  playerBanks: [],
  funds: Array.from({ length: 3 }, (_, i) => ({
    id: `f${i}`,
    name: `Fund ${i}`,
    office: officeOf({ id: `f${i}` }),
  })),
  segments: [],
  industry: 'fintech',
  office: { headcount: 2, siren: false },
  homeTier: 2,
  // The heliport among a crowd of neighbours in its own district.
  businesses: [
    biz('heli', 'heliport', district),
    ...Array.from({ length: 16 }, (_, i) => biz(`n${i}`, 'cafe', district)),
  ],
});

/** The nearest a place's plot comes to a point (m), along its edges. */
function plotDist(p: Place, e: number, s: number) {
  let best = Infinity;
  const corners = [
    [p.x, p.y],
    [p.x + p.w, p.y],
    [p.x + p.w, p.y + p.d],
    [p.x, p.y + p.d],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[(i + 1) % 4]!;
    for (let t = 0; t <= 1; t += 1 / 16) {
      const m = geoMetres({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
      best = Math.min(best, Math.hypot(m.e - e, m.s - s));
    }
  }
  return best;
}

describe('the heliport pad', () => {
  it('is a tour city’s list: London and more', () => {
    expect(HELI_CITIES).toContain('london');
    expect(HELI_CITIES.length).toBeGreaterThan(5);
  });

  for (const city of HELI_CITIES)
    it(`stands clear of every other place in ${city}`, async () => {
      const data = await loadGeo(city);
      if (!data) return;
      const district = GAME_VENUES[city].find((v) => v.kind === 'heliport')!.district;
      const layout = buildCityLayout(input(city, district), data);
      const pad = layout.places.find((p) => p.id === 'biz:heli')!;
      expect(pad.bizKind).toBe('heliport');
      const c = geoMetres({ x: pad.x + pad.w / 2, y: pad.y + pad.d / 2 });
      for (const p of layout.places) {
        if (p === pad) continue;
        expect(plotDist(p, c.e, c.s), `${p.id} by the pad`).toBeGreaterThan(HELIPAD_CLEAR - 0.5);
      }
      // Its open ground is kept clear of the real and made-up buildings too.
      expect(
        layout.geo!.clear.some((k) => Math.hypot(k.e - c.e, k.s - c.s) < 1 && k.r >= HELIPAD_CLEAR),
      ).toBe(true);
    });
});

describe('the Outside camera on the pad', () => {
  const at = { x: 0, y: 10, z: 0 };
  const from = { x: 0, y: 16.5, z: 17 };
  it('stays where it is over open ground', () => {
    expect(chaseLift(at, from, () => 10)).toBeLessThanOrEqual(0);
  });
  it('rises over a building behind the helicopter, and its line of sight too', () => {
    // A 20 m block from 8 m behind: camera and sight line over its roof.
    const top = (_x: number, z: number) => (z > 8 ? 30 : 10);
    const lift = chaseLift(at, from, top);
    expect(from.y + lift).toBeGreaterThanOrEqual(32);
    for (const t of [0.7, 1]) {
      const y = at.y + (from.y + lift - at.y) * t;
      expect(y).toBeGreaterThanOrEqual(31.9);
    }
  });
});
