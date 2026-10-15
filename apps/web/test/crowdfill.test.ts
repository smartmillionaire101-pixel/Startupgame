import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import {
  aiFill,
  crowdAt,
  crowdPool,
  crowdVenues,
  venueTarget,
  whereIs,
} from '../src/city/crowdfill';

/** A small Lagos: AI companies, funds, lenders and businesses (a club, a bar, a café). */
function view(): PlayerView {
  const directory = Array.from({ length: 12 }, (_, i) => ({
    id: `co${i}`,
    name: `Company ${i}`,
    market: 'lagos',
    ai: true,
    status: 'active',
    teamSize: 4,
    founders: [{ id: `ai_f${i}`, name: `Founder ${i}`, ai: true }],
  }));
  const funds = Array.from({ length: 5 }, (_, i) => ({
    id: `fund${i}`,
    name: `Fund ${i}`,
    partner: `Partner ${i}`,
    market: 'lagos',
    ai: true,
  }));
  const biz = (id: string, kind: string, shape = 'restaurant') => ({
    id,
    name: `Biz ${id}`,
    kind,
    kindLabel: kind,
    category: 'hospitality',
    district: 'vi',
    owner: { name: `Owner ${id}` },
    look: { shape, awning: null, color: '#000' },
    open: true,
    venue: null,
    gigs: [],
    buys: [],
  });
  return {
    market: {
      id: 'lagos',
      month: 7,
      bankName: 'Lagos Bank',
      funds,
      lenders: [
        { id: 'l1', name: 'Marina Bank', kind: 'high-street', products: [] },
        { id: 'l2', name: 'Eko Micro', kind: 'microfinance', products: [] },
      ],
      businesses: [
        biz('club1', 'nightclub', 'pub'),
        biz('club2', 'nightclub', 'pub'),
        biz('bar1', 'cocktail-bar', 'pub'),
        biz('cafe1', 'cafe'),
        biz('shop1', 'electronics-store', 'shopfront'),
      ],
    },
    directory,
  } as unknown as PlayerView;
}

describe('the city crowd (AI people in venues)', () => {
  it('fills to the target and never below zero', () => {
    expect(aiFill(10, 0)).toBe(10);
    expect(aiFill(10, 3)).toBe(7);
    expect(aiFill(10, 10)).toBe(0);
    expect(aiFill(10, 25)).toBe(0);
    expect(aiFill(0, 0)).toBe(0);
    expect(aiFill(5, -2)).toBe(5);
  });

  it('busy clubs at night, quiet by day; banks in office hours', () => {
    expect(venueTarget('club', 23)).toBeGreaterThanOrEqual(8);
    expect(venueTarget('club', 1.5)).toBeGreaterThanOrEqual(8);
    expect(venueTarget('club', 11)).toBeLessThanOrEqual(1);
    expect(venueTarget('bar', 20)).toBeGreaterThan(venueTarget('bar', 10));
    expect(venueTarget('cafe', 8)).toBeGreaterThan(venueTarget('cafe', 22));
    expect(venueTarget('bank', 11)).toBeGreaterThan(0);
    expect(venueTarget('bank', 22)).toBe(0);
    expect(venueTarget('shop', 12)).toBe(0);
  });

  it('draws real names from the world: founders, partners, owners, bankers, teams', () => {
    const pool = crowdPool(view());
    const roles = new Set(pool.map((p) => p.role));
    expect([...roles].sort()).toEqual(['banker', 'employee', 'founder', 'investor', 'owner']);
    expect(pool.find((p) => p.id === 'ai_f3')).toMatchObject({
      name: 'Founder 3',
      org: 'Company 3',
      role: 'founder',
    });
    expect(pool.find((p) => p.id === 'fund:fund2')).toMatchObject({
      name: 'Partner 2',
      role: 'investor',
    });
    const banker = pool.find((p) => p.role === 'banker')!;
    expect(banker.id).toMatch(/^crowd:lagos:banker:l[12]:\d$/);
    expect(banker.name).toMatch(/\S+ \S+/);
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
  });

  it('a club at night is full of named people; deterministic for the hour', () => {
    const v = view();
    const q = { placeId: 'biz:club1', room: 'club' as const, hour: 23.5, real: 0 };
    const a = crowdAt(v, q);
    expect(a.length).toBe(venueTarget('club', 23));
    expect(crowdAt(v, q)).toEqual(a);
    // A different hour can bring different people.
    const later = crowdAt(v, { ...q, hour: 1 });
    expect(later.map((p) => p.id)).not.toEqual(a.map((p) => p.id));
    // By day, nearly nobody.
    expect(crowdAt(v, { ...q, hour: 11 }).length).toBeLessThanOrEqual(1);
  });

  it('phases out as real players come in', () => {
    const v = view();
    const base = { placeId: 'biz:club1', room: 'club' as const, hour: 23 };
    const target = venueTarget('club', 23);
    for (const real of [0, 2, 5, target, target + 3])
      expect(crowdAt(v, { ...base, real }).length).toBe(aiFill(target, real));
  });

  it('never puts the same founder or partner in two places at once', () => {
    const v = view();
    const venues = crowdVenues(v);
    const seen = new Map<string, string>();
    for (const ven of venues)
      for (const p of crowdAt(v, { placeId: ven.id, room: ven.room, hour: 23, real: 0 })) {
        if (p.role !== 'founder' && p.role !== 'investor') continue;
        expect(seen.get(p.id) ?? ven.id).toBe(ven.id);
        seen.set(p.id, ven.id);
      }
    // whereIs is pure.
    const p = crowdPool(v)[0]!;
    expect(whereIs(p, venues, 23, '7:23')).toBe(whereIs(p, venues, 23, '7:23'));
  });

  it('bankers are at their bank in office hours', () => {
    const v = view();
    const here = crowdAt(v, { placeId: 'lender:l1', room: 'bank', hour: 11, real: 0 });
    expect(here.length).toBe(venueTarget('bank', 11));
    expect(here.some((p) => p.role === 'banker' && p.orgId === 'l1')).toBe(true);
    // Not in a bar while at work.
    const bar = crowdAt(v, { placeId: 'biz:bar1', room: 'bar', hour: 11, real: 0 });
    expect(bar.some((p) => p.role === 'banker')).toBe(false);
  });

  it('skips people already shown', () => {
    const v = view();
    const q = { placeId: 'biz:club2', room: 'club' as const, hour: 23, real: 0 };
    const first = crowdAt(v, q)[0]!;
    expect(crowdAt(v, { ...q, exclude: [first.id] }).map((p) => p.id)).not.toContain(first.id);
  });
});
