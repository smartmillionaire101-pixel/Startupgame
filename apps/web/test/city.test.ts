import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import {
  capitalOf,
  cityInput,
  hash,
  lendersOf,
  officeOf,
  rescueOf,
  storyOf,
} from '../src/city/contract';
import {
  B,
  buildLayout,
  findPath,
  nearestStreetPoint,
  pathLength,
  pointAlong,
  project,
  spiral,
  unproject,
  type CityInput,
  type Pt,
} from '../src/city/layout';

const input = (over: Partial<CityInput> = {}): CityInput => ({
  marketId: 'lagos',
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
  ...over,
});

/** A view with only the fields the adapter reads. */
const view = (market: Record<string, unknown> = {}, company: Record<string, unknown> = {}) =>
  ({
    market: {
      id: 'nairobi',
      bankName: 'Harambee Bank',
      banks: [],
      funds: [{ id: 'fund-1', name: 'Savannah Ventures' }],
      segments: [{ key: 'k', name: 'Kiosks', industry: 'fintech' }],
      ...market,
    },
    companies: [{ id: 'c1', status: 'active', industry: 'fintech', teamSize: 3, ...company }],
    me: { lifestyle: { tier: 3 } },
  }) as unknown as PlayerView;

const onStreet = (p: Pt) =>
  Math.abs(p.x / B - Math.round(p.x / B)) < 1e-6 || Math.abs(p.y / B - Math.round(p.y / B)) < 1e-6;

describe('city layout', () => {
  it('is deterministic per market', () => {
    expect(buildLayout(input())).toEqual(buildLayout(input()));
    const a = buildLayout(input());
    const b = buildLayout(input({ marketId: 'london' }));
    expect(a.blocks.map((x) => x.district)).not.toEqual(b.blocks.map((x) => x.district));
  });

  it('has every district and one building per lender, fund and segment', () => {
    const l = buildLayout(input());
    const kinds = (k: string) => l.places.filter((p) => p.kind === k);
    expect(kinds('lender').map((p) => p.ref)).toEqual(['l1', 'l2']);
    expect(kinds('fund')).toHaveLength(6);
    expect(kinds('stall')).toHaveLength(21);
    for (const k of ['office', 'home', 'hub', 'airport', 'newsstand', 'eventhall'])
      expect(kinds(k)).toHaveLength(1);
    expect(kinds('eventhall')[0]!.soon).toBe(true);
    // Stalls outside your industry are dimmed.
    expect(kinds('stall').filter((p) => !p.dim)).toHaveLength(3);
  });

  it('grows with the market and never overlaps blocks', () => {
    const big = buildLayout(
      input({
        lenders: Array.from({ length: 9 }, (_, i) => ({
          id: `l${i}`,
          name: `L${i}`,
          look: { color: '#000', accent: '#fff', motif: 'glass' as const },
        })),
        funds: Array.from({ length: 14 }, (_, i) => ({
          id: `f${i}`,
          name: `F${i}`,
          office: officeOf({ id: `f${i}` }),
        })),
      }),
    );
    expect(big.places.filter((p) => p.kind === 'lender')).toHaveLength(9);
    expect(big.places.filter((p) => p.kind === 'fund')).toHaveLength(14);
    const cells = new Set(big.blocks.map((b) => `${b.i},${b.j}`));
    expect(cells.size).toBe(big.size * big.size);
  });

  it('puts every door on a street, inside the city', () => {
    const l = buildLayout(input());
    for (const p of l.places) {
      expect(onStreet(p.door), p.id).toBe(true);
      expect(p.door.x).toBeGreaterThanOrEqual(0);
      expect(p.door.y).toBeLessThanOrEqual(l.extent);
    }
  });

  it('sizes the office by headcount and raises a siren in a rescue', () => {
    const small = buildLayout(input()).places.find((p) => p.kind === 'office')!;
    const big = buildLayout(input({ office: { headcount: 12, siren: true } })).places.find(
      (p) => p.kind === 'office',
    )!;
    expect(big.h).toBeGreaterThan(small.h);
    expect(big.w).toBeGreaterThan(small.w);
    expect(big.siren).toBe(true);
  });

  it('works for every market, including unknown ones', () => {
    for (const m of ['lagos', 'nairobi', 'london', 'dubai', 'cairo', 'accra', 'atlantis']) {
      const l = buildLayout(input({ marketId: m }));
      expect(l.vehicles.length).toBeGreaterThan(0);
      expect(l.streets.length).toBeGreaterThan(0);
    }
  });

  it('spirals over every cell exactly once', () => {
    for (const n of [4, 5, 6])
      for (const turn of [1, -1] as const)
        for (const h of [0, 1, 2, 3]) {
          const cells = spiral(n, turn, h);
          expect(new Set(cells.map((c) => c.join())).size).toBe(n * n);
        }
  });
});

describe('walking', () => {
  const l = buildLayout(input());

  it('projects and unprojects', () => {
    const p = project(3.5, 7.25);
    expect(unproject(p.x, p.y).x).toBeCloseTo(3.5);
    expect(unproject(p.x, p.y).y).toBeCloseTo(7.25);
  });

  it('snaps taps to the nearest street', () => {
    expect(nearestStreetPoint(l, { x: 0.8, y: 5.5 })).toEqual({ x: 0, y: 5.5 });
    expect(nearestStreetPoint(l, { x: 5.5, y: 7.6 })).toEqual({ x: 5.5, y: 8 });
  });

  it('finds paths that stay on streets and are as short as the grid allows', () => {
    for (const target of l.places) {
      const path = findPath(l, l.start, target.door);
      expect(path[0]).toEqual(l.start);
      expect(path[path.length - 1]).toEqual(target.door);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        // Each leg runs along one street line.
        expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true);
        expect(onStreet(a) && onStreet(b)).toBe(true);
      }
      const manhattan = Math.abs(l.start.x - target.door.x) + Math.abs(l.start.y - target.door.y);
      expect(pathLength(path)).toBeGreaterThanOrEqual(manhattan - 1e-6);
      expect(pathLength(path)).toBeLessThanOrEqual(manhattan + 2 * B + 1e-6);
    }
  });

  it('interpolates along a path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ];
    expect(pointAlong(path, 0.5).p).toEqual({ x: 4, y: 0 });
    expect(pointAlong(path, 0.75).p).toEqual({ x: 4, y: 2 });
    expect(pointAlong(path, 1).p).toEqual({ x: 4, y: 4 });
  });
});

describe('view adapter fallbacks', () => {
  it('falls back to one lender named after market.bankName, with no products', () => {
    const lenders = lendersOf(view());
    expect(lenders).toHaveLength(1);
    expect(lenders[0]).toMatchObject({
      name: 'Harambee Bank',
      kind: 'high-street',
      products: [],
      fallback: true,
    });
  });

  it('reads market.lenders when the engine sends them', () => {
    const lenders = lendersOf(
      view({
        lenders: [
          {
            id: 'startup-loans',
            name: 'Start Up Loans',
            kind: 'government',
            appetite: 1.3,
            look: { color: '#000', accent: '#fff', motif: 'tower' },
            products: [
              {
                id: 'sul',
                kind: 'startup-loan',
                label: 'Start Up Loan',
                borrower: 'founder',
                pitch: 'For founders',
                termMonths: [12, 60],
                guarantee: 'none',
                rateBps: 600,
                amount: [50_000, 2_500_000],
                you: { eligible: true, reason: null, maxMinor: 2_500_000, companyId: null },
              },
            ],
          },
        ],
      }),
    );
    expect(lenders).toHaveLength(1);
    expect(lenders[0]!.appetite).toBe('loose');
    expect(lenders[0]!.fallback).toBeUndefined();
    expect(lenders[0]!.products[0]!.label).toBe('Start Up Loan');
  });

  it('derives a stable office from the fund id when office is missing', () => {
    const a = officeOf({ id: 'fund-1' });
    expect(a).toEqual(officeOf({ id: 'fund-1' }));
    expect(['loft', 'tower', 'garden', 'shophouse', 'glass']).toContain(a.style);
    const styles = new Set(Array.from({ length: 20 }, (_, i) => officeOf({ id: `f${i}` }).style));
    expect(styles.size).toBeGreaterThan(2);
    const given = { id: 'fund-1', office: { style: 'garden', color: '#abc', floor: 3 } };
    expect(officeOf(given)).toEqual({ style: 'garden', color: '#abc', floor: 3 });
  });

  it('returns null story, rescue and capital until the engine sends them', () => {
    const v = view();
    expect(storyOf(v.companies[0])).toBeNull();
    expect(rescueOf(v.companies[0])).toBeNull();
    expect(capitalOf(v)).toBeNull();
    const w = view(
      { capital: { vcDepth: 0.3, angelDepth: 0.2, schemes: [], sources: ['CBK'] } },
      {
        story: { month: 3, headline: 'Revenue up', items: [], next: [] },
        rescue: { level: 'danger', monthsLeft: 2, deadline: 'Month 5', options: [] },
      },
    );
    expect(storyOf(w.companies[0])!.headline).toBe('Revenue up');
    expect(rescueOf(w.companies[0])!.level).toBe('danger');
    expect(capitalOf(w)!.vcDepth).toBe(0.3);
  });

  it('builds a layout input from a sparse view', () => {
    const ci = cityInput(view());
    expect(ci.lenders.map((l) => l.name)).toEqual(['Harambee Bank']);
    expect(ci.office).toEqual({ headcount: 3, siren: false });
    expect(ci.homeTier).toBe(3);
    expect(buildLayout(ci).places.some((p) => p.kind === 'lender')).toBe(true);
  });

  it('hashes consistently', () => {
    expect(hash('lagos')).toBe(hash('lagos'));
    expect(hash('lagos')).not.toBe(hash('london'));
  });
});
