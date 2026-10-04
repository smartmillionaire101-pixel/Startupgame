import { describe, expect, it } from 'vitest';
import { officeOf, type BusinessCategory, type BusinessShape } from '../src/city/contract';
import {
  B,
  buildLayout,
  findPath,
  nearestStreetPoint,
  segKey,
  type CityInput,
  type Pt,
} from '../src/city/layout';
import { PLANS } from '../src/city/plans';
import { aiCharacters, crowdSize } from '../src/city/people';
import {
  CITY_BUSINESSES,
  CITY_DISTRICTS,
  businessKind,
} from '../../../packages/engine/src/data/businesses';

/** The district ids the engine's business seeds reference (Wave 3 §C). */
const DISTRICTS: Record<string, string[]> = {
  london: [
    'city',
    'shoreditch',
    'mayfair',
    'soho',
    'borough',
    'camden',
    'southbank',
    'canary-wharf',
  ],
  lagos: ['marina', 'victoria-island', 'ikoyi', 'yaba', 'ikeja', 'balogun', 'lekki', 'surulere'],
  nairobi: [
    'cbd',
    'upper-hill',
    'westlands',
    'kilimani',
    'gikomba',
    'karen',
    'eastleigh',
    'industrial-area',
  ],
  accra: ['osu', 'airport-city', 'makola', 'cantonments', 'labadi', 'east-legon', 'jamestown'],
  freetown: ['central', 'aberdeen', 'lumley', 'kissy', 'wilberforce', 'congo-cross'],
  kigali: ['kiyovu', 'kimihurura', 'nyarugenge', 'nyabugogo', 'kacyiru', 'remera'],
  johannesburg: ['sandton', 'braamfontein', 'maboneng', 'rosebank', 'soweto', 'marshalltown'],
  cairo: [
    'downtown',
    'zamalek',
    'garden-city',
    'khan-el-khalili',
    'maadi',
    'new-cairo',
    'heliopolis',
  ],
  dubai: ['difc', 'marina', 'deira', 'jumeirah', 'business-bay', 'al-quoz', 'creek'],
  'san-francisco': [
    'fidi',
    'soma',
    'mission',
    'chinatown',
    'north-beach',
    'wharf',
    'castro',
    'dogpatch',
    'presidio',
  ],
};

const SHAPES: BusinessShape[] = [
  'restaurant',
  'shopfront',
  'pub',
  'kiosk',
  'stall',
  'clinic',
  'school',
  'warehouse',
  'hotel',
];
const CATS: BusinessCategory[] = ['food', 'retail', 'services', 'health', 'education', 'logistics'];

/** A busy world: many banks, funds (AI angels included) and ~4 businesses a district. */
const input = (marketId: string, over: Partial<CityInput> = {}): CityInput => ({
  marketId,
  lenders: Array.from({ length: 6 }, (_, i) => ({
    id: `l${i}`,
    name: `Lender ${i}`,
    look: { color: '#123', accent: '#fff', motif: 'columns' as const },
  })),
  playerBanks: [{ id: 'pb1', name: 'Player Bank' }],
  funds: Array.from({ length: 14 }, (_, i) => ({
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
  businesses: [
    ...(DISTRICTS[marketId] ?? []).flatMap((d, n) =>
      Array.from({ length: 4 }, (_, k) => ({
        id: `b-${d}-${k}`,
        name: `Shop ${d} ${k}`,
        kind: k === 1 ? 'cafe' : 'shop',
        category: CATS[(n + k) % CATS.length]!,
        district: d,
        shape: SHAPES[(n * 4 + k) % SHAPES.length]!,
        color: '#f59e0b',
        awning: null,
      })),
    ),
    {
      id: 'b-nowhere',
      name: 'Lost Shop',
      kind: 'shop',
      category: 'food',
      district: 'no-such-district',
      shape: 'shopfront',
      color: '#000',
      awning: null,
    },
  ],
  ...over,
});

/** Walk a polyline and check it never uses a closed street segment. */
function usesOnlyOpenStreets(path: Pt[], cuts: Set<string>) {
  for (let n = 1; n < path.length; n++) {
    const a = path[n - 1]!;
    const b = path[n]!;
    const horiz = Math.abs(a.y - b.y) < 1e-6;
    const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    for (let s = Math.floor(lo / B + 1e-9); s < Math.ceil(hi / B - 1e-9); s++) {
      const k = horiz ? Math.round(a.y / B) : Math.round(a.x / B);
      const key = horiz ? segKey(s, k, s + 1, k) : segKey(k, s, k, s + 1);
      if (cuts.has(key)) return false;
    }
  }
  return true;
}

const IMPORTANT = ['office', 'hub', 'newsstand', 'home', 'airport', 'eventhall'];

describe('city plans', () => {
  it('covers all ten markets with the engine district ids', () => {
    expect(Object.keys(PLANS).sort()).toEqual(Object.keys(DISTRICTS).sort());
    for (const [m, ids] of Object.entries(DISTRICTS)) {
      const have = PLANS[m]!.districts.map((d) => d.id);
      for (const id of ids) expect(have, `${m}: ${id}`).toContain(id);
    }
  });

  for (const market of Object.keys(DISTRICTS)) {
    describe(market, () => {
      const l = buildLayout(input(market));
      const cuts = new Set(l.cuts);

      it('has every important place, bank, fund, stall and business', () => {
        for (const id of IMPORTANT)
          expect(
            l.places.filter((p) => p.id === id),
            id,
          ).toHaveLength(1);
        expect(l.places.filter((p) => p.kind === 'lender')).toHaveLength(6);
        expect(l.places.filter((p) => p.kind === 'playerbank')).toHaveLength(1);
        expect(l.places.filter((p) => p.kind === 'fund')).toHaveLength(14);
        expect(l.places.filter((p) => p.kind === 'stall')).toHaveLength(21);
        expect(l.places.filter((p) => p.kind === 'business')).toHaveLength(
          DISTRICTS[market]!.length * 4 + 1,
        );
        expect(l.areas.map((a) => a.id)).toEqual(PLANS[market]!.districts.map((d) => d.id));
      });

      it('puts each business in the district its seed names', () => {
        for (const p of l.places.filter((x) => x.kind === 'business' && x.ref !== 'b-nowhere')) {
          const want = p.ref!.replace(/^b-/, '').replace(/-\d+$/, '');
          expect(p.area, p.id).toBe(want);
        }
        // An unknown district still gets a home in a real one.
        const lost = l.places.find((p) => p.ref === 'b-nowhere')!;
        expect(l.areas.map((a) => a.id)).toContain(lost.area);
      });

      it('never puts two blocks on one cell or a block in a river', () => {
        const cells = l.blocks.map((b) => `${b.i},${b.j}`);
        expect(new Set(cells).size).toBe(cells.length);
        for (const w of l.waters.filter((x) => x.kind === 'river'))
          for (const b of l.blocks) {
            const cx = b.i * B + B / 2;
            const cy = b.j * B + B / 2;
            expect(cx > w.x0 && cx < w.x1 && cy > w.y0 && cy < w.y1, `${b.i},${b.j}`).toBe(false);
          }
      });

      it('reaches every place on foot from the office, on open streets only', () => {
        for (const p of l.places) {
          const e = p.door;
          expect(
            Math.abs(e.x / B - Math.round(e.x / B)) < 1e-6 ||
              Math.abs(e.y / B - Math.round(e.y / B)) < 1e-6,
            `${p.id} door on a street`,
          ).toBe(true);
          const path = findPath(l, l.start, p.door);
          expect(path[0], p.id).toEqual(l.start);
          expect(path[path.length - 1], p.id).toEqual(p.door);
          expect(usesOnlyOpenStreets(path, cuts), p.id).toBe(true);
        }
      });

      it('is deterministic', () => {
        expect(buildLayout(input(market))).toEqual(l);
      });
    });
  }

  it('gives each city its own water, hills and landmarks', () => {
    const london = buildLayout(input('london'));
    expect(london.waters.find((w) => w.kind === 'river')?.name).toBe('River Thames');
    expect(london.bridges.map((b) => b.name)).toContain('Tower Bridge');
    expect(london.bridges.filter((b) => b.walk).length).toBeGreaterThanOrEqual(1);
    expect(london.flavour.vehicles.some((v) => v.id === 'routemaster')).toBe(true);
    const lagos = buildLayout(input('lagos'));
    expect(lagos.waters.map((w) => w.name)).toContain('Lagos Lagoon');
    expect(lagos.bridges.map((b) => b.name)).toContain('Third Mainland Bridge');
    const sf = buildLayout(input('san-francisco'));
    expect(sf.decor.filter((d) => d.kind === 'hill').length).toBeGreaterThan(0);
    expect(sf.bridges.find((b) => b.name === 'Golden Gate Bridge')?.walk).toBe(false);
    expect(sf.flavour.fog).toBe(true);
    expect(sf.decor.some((d) => d.landmark === 'transamerica')).toBe(true);
    const nairobi = buildLayout(input('nairobi'));
    expect(nairobi.waters).toEqual([]);
    // Organic cities merge some blocks; grid cities keep every street.
    expect(buildLayout(input('cairo')).cuts.length).toBeGreaterThan(
      buildLayout(input('johannesburg')).cuts.length,
    );
  });

  it('snaps a tap to an open street, never into the river', () => {
    const london = buildLayout(input('london'));
    const cuts = new Set(london.cuts);
    const river = london.waters.find((w) => w.kind === 'river')!;
    for (let x = 0; x < london.extent; x += 1.3) {
      const s = nearestStreetPoint(london, { x, y: (river.y0 + river.y1) / 2 });
      expect(usesOnlyOpenStreets([s, s], cuts)).toBe(true);
      const path = findPath(london, london.start, s);
      expect(usesOnlyOpenStreets(path, cuts)).toBe(true);
    }
  });

  it('matches the engine: every seeded business lands in its own district', () => {
    for (const [m, ids] of Object.entries(CITY_DISTRICTS)) {
      expect([...ids].sort(), m).toEqual([...DISTRICTS[m]!].sort());
      const seeds = CITY_BUSINESSES[m as keyof typeof CITY_BUSINESSES];
      const l = buildLayout(
        input(m, {
          businesses: seeds.map((s, n) => {
            const k = businessKind(s.kind)!;
            return {
              id: `seed${n}`,
              name: s.name,
              kind: s.kind,
              category: k.category,
              district: s.district,
              shape: k.look.shape,
              color: k.look.color,
              awning: k.look.awning ?? null,
            };
          }),
        }),
      );
      seeds.forEach((s, n) => {
        const p = l.places.find((x) => x.ref === `seed${n}`);
        expect(p?.area, `${m}: ${s.name}`).toBe(s.district);
      });
    }
  });

  it('falls back to the generic generator for an unknown market', () => {
    const l = buildLayout(input('atlantis', { businesses: [] }));
    expect(l.areas).toEqual([]);
    expect(l.cuts).toEqual([]);
    expect(l.blocks).toHaveLength(l.size * l.size);
    for (const id of IMPORTANT)
      expect(
        l.places.some((p) => p.id === id),
        id,
      ).toBe(true);
    const withBiz = buildLayout(input('atlantis'));
    expect(withBiz.places.filter((p) => p.kind === 'business').length).toBeGreaterThan(0);
  });

  it('still lays out a plan when the engine sends no businesses yet', () => {
    const l = buildLayout(input('london', { businesses: undefined }));
    expect(l.places.some((p) => p.kind === 'business')).toBe(false);
    for (const id of IMPORTANT)
      expect(
        l.places.some((p) => p.id === id),
        id,
      ).toBe(true);
  });

  it('stands owners at their shops and walks angels from their fund to a restaurant', () => {
    const l = buildLayout(input('san-francisco'));
    const businesses = l.places.filter((p) => p.kind === 'business');
    const cast = aiCharacters(
      l,
      {
        marketId: 'san-francisco',
        funds: [],
        founders: [],
        candidates: [],
        segments: [],
        owners: businesses.map((p) => ({ id: p.ref!, name: `Owner ${p.ref}` })),
        angels: [
          { id: 'ang1', name: 'Wes Angel', fundId: 'f3' },
          { id: 'ang2', name: 'Kai Angel', fundId: null },
        ],
      },
      crowdSize(375),
    );
    expect(cast.length).toBeLessThanOrEqual(crowdSize(375));
    const owner = cast.find((c) => c.kind === 'owner')!;
    expect(owner.home).toBe(`biz:${owner.ref}`);
    const angel = cast.find((c) => c.ref === 'ang1')!;
    expect(angel.fund).toBe('f3');
    const office = l.places.find((p) => p.id === 'fund:f3')!;
    expect(angel.route[0]).toEqual(office.door);
    const venues = l.places.filter((p) => ['b-restaurant', 'b-cafe', 'b-pub'].includes(p.motif));
    expect(venues.some((v) => angel.route.some((q) => q.x === v.door.x && q.y === v.door.y))).toBe(
      true,
    );
    expect(usesOnlyOpenStreets(angel.route, new Set(l.cuts))).toBe(true);
  });
});
