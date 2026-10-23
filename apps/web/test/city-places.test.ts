import { describe, expect, it } from 'vitest';
import { PLACE_ROLES, cityPlaces, type MarketId } from '@runway/engine';
import { officeOf } from '../src/city/contract';
import { loadGeo } from '../src/city/geo';
import { buildCityLayout } from '../src/city/geoLayout';
import { buildLayout, civicRole, type CityInput } from '../src/city/layout';
import { CIVIC_ICON, FALLBACK_ICON, placeBadge } from '../src/city/mapIcons';
import { PLANS } from '../src/city/plans';
import { CIVIC_ROOM, roomOf } from '../src/city/rooms';
import { placeSpec } from '../src/city/three/scene';

/** A city with its named buildings (the city places release). */
const input = (marketId: string, over: Partial<CityInput> = {}): CityInput => ({
  marketId,
  lenders: [
    { id: 'l1', name: 'Marina Bank', look: { color: '#123', accent: '#fff', motif: 'columns' } },
  ],
  playerBanks: [],
  funds: Array.from({ length: 3 }, (_, i) => ({
    id: `f${i}`,
    name: `Fund ${i}`,
    office: officeOf({ id: `f${i}` }),
  })),
  segments: Array.from({ length: 9 }, (_, i) => ({
    key: `s${i}`,
    name: `Segment ${i}`,
    industry: 'fintech',
  })),
  industry: 'fintech',
  office: { headcount: 2, siren: false },
  homeTier: 2,
  civic: cityPlaces(marketId as MarketId).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    district: p.district,
  })),
  ...over,
});

const civicOf = (places: { kind: string; id: string; name: string }[]) =>
  places.filter((p) => p.kind === 'civic');

describe('city places on the map', () => {
  it('stands every named building in every planned city, with its name', () => {
    for (const id of Object.keys(PLANS)) {
      const layout = buildLayout(input(id));
      const civic = civicOf(layout.places);
      expect(civic.map((p) => p.name).sort()).toEqual(
        cityPlaces(id as MarketId)
          .map((p) => p.name)
          .sort(),
      );
      // In the district the place names (planned cities).
      const lagos = layout.places.find((p) => p.id === 'civic:lagos:tech-hub');
      if (id === 'lagos') expect(lagos?.area).toBe('yaba');
    }
  });

  it('stands them on the real map too, each with a door on a road', async () => {
    const data = (await loadGeo('lagos'))!;
    const layout = buildCityLayout(input('lagos'), data);
    const civic = layout.places.filter((p) => p.kind === 'civic');
    expect(civic).toHaveLength(PLACE_ROLES.length);
    for (const p of civic) {
      expect(Number.isFinite(p.door.x) && Number.isFinite(p.door.y)).toBe(true);
      expect(p.ref).toBe(p.id.slice('civic:'.length));
    }
    // A city without the release draws none.
    expect(
      buildLayout(input('lagos', { civic: undefined })).places.some((p) => p.kind === 'civic'),
    ).toBe(false);
  });

  it('gives each role an icon, a room and a 3D building', () => {
    const layout = buildLayout(input('london'));
    for (const p of layout.places.filter((x) => x.kind === 'civic')) {
      const role = civicRole(p)!;
      expect(PLACE_ROLES).toContain(role);
      expect(placeBadge(p).icon).toBe(CIVIC_ICON[role]);
      expect(placeBadge(p).icon).not.toBe(FALLBACK_ICON);
      expect(roomOf(p)).toBe(CIVIC_ROOM[role]);
      const spec = placeSpec(p);
      expect(spec.h).toBeGreaterThanOrEqual(16);
    }
    const tower = layout.places.find((p) => p.id === 'civic:london:family-office')!;
    expect(placeSpec(tower).h).toBeGreaterThan(80);
  });
});
