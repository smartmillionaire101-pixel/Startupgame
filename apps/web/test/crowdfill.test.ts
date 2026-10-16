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
import { ROOM_SLOTS } from '../src/city/rooms';

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

  it('busy clubs at night, a crowd by day too; banks in office hours', () => {
    expect(venueTarget('club', 23)).toBeGreaterThanOrEqual(14);
    expect(venueTarget('club', 1.5)).toBeGreaterThanOrEqual(14);
    expect(venueTarget('club', 14)).toBeGreaterThanOrEqual(4);
    expect(venueTarget('club', 14)).toBeLessThan(venueTarget('club', 23));
    expect(venueTarget('bar', 20)).toBeGreaterThanOrEqual(10);
    expect(venueTarget('bar', 20)).toBeGreaterThan(venueTarget('bar', 10));
    expect(venueTarget('restaurant', 13)).toBeGreaterThanOrEqual(10);
    expect(venueTarget('restaurant', 20)).toBeGreaterThanOrEqual(10);
    expect(venueTarget('restaurant', 16)).toBeLessThan(venueTarget('restaurant', 13));
    expect(venueTarget('cafe', 8)).toBeGreaterThan(venueTarget('cafe', 22));
    expect(venueTarget('hub', 11)).toBeGreaterThanOrEqual(8);
    expect(venueTarget('cowork', 11)).toBeGreaterThanOrEqual(8);
    expect(venueTarget('eventhall', 20)).toBeGreaterThanOrEqual(12);
    expect(venueTarget('bank', 11)).toBeGreaterThanOrEqual(6);
    expect(venueTarget('bank', 22)).toBeLessThan(venueTarget('bank', 11));
    expect(venueTarget('investor', 11)).toBeGreaterThanOrEqual(5);
    expect(venueTarget('shop', 12)).toBe(0);
  });

  it('never leaves a venue you can walk into empty, at any hour', () => {
    const rooms = [
      'club',
      'bar',
      'lounge',
      'karaoke',
      'stage',
      'restaurant',
      'cafe',
      'cowork',
      'hub',
      'eventhall',
      'bank',
      'investor',
      'gym',
    ] as const;
    for (const room of rooms)
      for (let h = 0; h < 24; h++) {
        expect(venueTarget(room, h + 0.5), `${room} at ${h}h`).toBeGreaterThan(0);
        // Every person the room wants has a spot to stand or sit in, with room for a few players.
        const guests = ROOM_SLOTS[room].filter((s) => s.who === 'guest').length;
        expect(guests, `${room} slots`).toBeGreaterThanOrEqual(venueTarget(room, h) + 1);
      }
  });

  it('every spot is inside the room, on the floor', () => {
    for (const slots of Object.values(ROOM_SLOTS))
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(10);
        expect(s.x).toBeLessThanOrEqual(350);
        expect(s.y).toBeGreaterThanOrEqual(130);
        expect(s.y).toBeLessThanOrEqual(240);
      }
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
    // By day, fewer.
    expect(crowdAt(v, { ...q, hour: 14 }).length).toBe(venueTarget('club', 14));
    expect(crowdAt(v, { ...q, hour: 14 }).length).toBeLessThan(a.length);
  });

  it('tops the room up with the city’s regulars when the named crowd runs out', () => {
    const v = view();
    const q = { placeId: 'biz:club1', room: 'club' as const, hour: 23, real: 0 };
    const here = crowdAt(v, q);
    const regs = here.filter((p) => p.role === 'regular');
    expect(here.length).toBe(venueTarget('club', 23));
    for (const r of regs) {
      expect(r.id).toMatch(/^npc:lagos:\d+$/);
      expect(r.name).toMatch(/\S+ \S+/);
    }
    // Named people first.
    const firstReg = here.findIndex((p) => p.role === 'regular');
    if (firstReg >= 0) expect(here.slice(firstReg).every((p) => p.role === 'regular')).toBe(true);
    // An empty world still fills its clubs, and two venues don't share a regular this hour.
    const bare = { ...v, directory: [], market: { ...v.market, funds: [], lenders: [] } };
    const a = crowdAt(bare as PlayerView, q);
    const b = crowdAt(bare as PlayerView, { ...q, placeId: 'biz:club2' });
    expect(a.length).toBe(venueTarget('club', 23));
    expect(a.every((p) => p.role === 'regular' || p.role === 'owner')).toBe(true);
    const ids = new Set(a.map((p) => p.id));
    expect(b.some((p) => p.role === 'regular' && ids.has(p.id))).toBe(false);
    expect(crowdAt(bare as PlayerView, q)).toEqual(a);
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
    // Bankers on the floor, and customers too.
    expect(here.filter((p) => p.role === 'banker').length).toBeLessThanOrEqual(here.length / 2 + 1);
    expect(here.some((p) => p.role !== 'banker')).toBe(true);
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
