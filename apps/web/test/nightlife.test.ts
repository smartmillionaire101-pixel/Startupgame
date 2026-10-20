import { describe, expect, it } from 'vitest';
import {
  GENRES,
  LAYOUT_SLOTS,
  STYLES,
  dressFor,
  nightRegulars,
  nightStyleOf,
  styleStaff,
} from '../src/city/nightlife';
import { renderGroove } from '../src/city/nightlife-audio';
import { FR } from '../src/i18n/fr';

const CITIES = [
  'lagos',
  'accra',
  'freetown',
  'nairobi',
  'kigali',
  'johannesburg',
  'cairo',
  'dubai',
  'london',
  'san-francisco',
];

describe('nightlife of each city', () => {
  it('gives every city its own club, bar and lounge', () => {
    const clubs = CITIES.map((m) => nightStyleOf({ market: m, id: 'b1', kind: 'nightclub' }));
    expect(clubs.every((s) => s && ['dancefloor', 'warehouse', 'boat'].includes(s.layout))).toBe(
      true,
    );
    // Ten cities, ten different clubs (style and music).
    expect(new Set(clubs.map((s) => s!.id)).size).toBe(10);
    expect(new Set(clubs.map((s) => s!.genre)).size).toBeGreaterThanOrEqual(8);
    for (const kind of ['bar', 'lounge-bar', 'lounge', 'live-music'])
      expect(
        new Set(CITIES.map((m) => nightStyleOf({ market: m, id: 'x', kind })!.id)).size,
      ).toBeGreaterThanOrEqual(7);
  });

  it('is deterministic, and not for cafés or karaoke', () => {
    const a = nightStyleOf({ market: 'johannesburg', id: 'biz-9', kind: 'bar', name: 'Spot' });
    const b = nightStyleOf({ market: 'johannesburg', id: 'biz-9', kind: 'bar', name: 'Spot' });
    expect(a).toBe(b);
    expect(nightStyleOf({ market: 'lagos', id: 'c', kind: 'cafe' })).toBeNull();
    expect(nightStyleOf({ market: 'lagos', id: 'k', kind: 'karaoke' })).toBeNull();
  });

  it('reads a venue’s name for what it is', () => {
    const at = (market: string, kind: string, name: string) =>
      nightStyleOf({ market, id: name, kind, name })!.id;
    expect(at('cairo', 'nightclub', 'Zamalek Riverboat Club')).toBe('cairo-nile-boat');
    expect(at('johannesburg', 'live-music', 'Soweto Jazz Shebeen')).toBe('joburg-jazz-shebeen');
    expect(at('johannesburg', 'bar', 'Maboneng Gallery Bar')).toBe('joburg-jazz');
    expect(at('johannesburg', 'bar', 'Juta Street Taproom')).toBe('joburg-shisanyama');
    expect(at('london', 'pub', 'The Lamb & Lantern')).toBe('london-pub');
    expect(at('san-francisco', 'bar', 'Castro Street Tavern')).toBe('sf-speakeasy');
    expect(at('accra', 'beach-club', 'Labadi Sands Beach Club')).toBe('accra-labadi-beach');
    expect(at('dubai', 'lounge', 'Gate Avenue Majlis Lounge')).toBe('dubai-majlis');
    // A hint never turns a club into a lounge.
    expect(at('london', 'nightclub', 'The Rooftop Club')).toMatch(/london-(grime|house)/);
  });

  it('has floor plans inside the room, staff first, and staff for each style', () => {
    for (const [layout, slots] of Object.entries(LAYOUT_SLOTS)) {
      const firstGuest = slots.findIndex((s) => s.who === 'guest');
      expect(
        slots.slice(firstGuest).every((s) => s.who === 'guest'),
        layout,
      ).toBe(true);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(360);
        expect(s.y).toBeGreaterThanOrEqual(120);
        expect(s.y).toBeLessThanOrEqual(240);
      }
    }
    for (const s of Object.values(STYLES)) {
      const staffSlots = LAYOUT_SLOTS[s.layout].filter((x) => x.who === 'staff').length;
      expect(styleStaff(s).length + 1, s.id).toBeLessThanOrEqual(staffSlots);
      expect(GENRES[s.genre], s.id).toBeDefined();
    }
  });

  it('fills a packed club fuller than an intimate bar', () => {
    const club = STYLES['joburg-amapiano']!;
    const jazz = STYLES['sf-speakeasy']!;
    expect(nightRegulars(club, 'p', 3, 2)).toBeGreaterThan(nightRegulars(jazz, 'p', 3, 2));
  });

  it('dresses the crowd for the night', () => {
    const look = {
      skin: '#8d5524',
      hair: '#111',
      hairStyle: 'short',
      top: '#123456',
      bottom: '#111827',
      accessory: 'none',
      gender: 'female',
    } as const;
    const owambe = STYLES['lagos-owambe-lounge']!;
    const dressed = Array.from({ length: 20 }, (_, i) =>
      dressFor(owambe, { ...look } as never, `g${i}`),
    );
    expect(dressed.filter((l) => l.headwear === 'gele').length).toBeGreaterThan(5);
    expect(dressed.filter((l) => l.top !== '#123456').length).toBeGreaterThan(10);
  });

  it('plays a different groove per genre (32 steps each)', () => {
    const lengths = new Set<number>();
    for (const g of Object.values(GENRES)) {
      const gr = g.groove;
      for (const p of [
        gr.kick,
        gr.snare,
        gr.clap,
        gr.hat,
        gr.shaker,
        gr.perc,
        gr.bass,
        gr.comp,
        gr.melody,
        gr.log ?? '',
      ])
        expect(p.length === 0 || p.length === 32, `${g.id}: ${p}`).toBe(true);
      const out = renderGroove(gr);
      lengths.add(out.length);
      let peak = 0;
      for (const v of out) peak = Math.max(peak, Math.abs(v));
      expect(peak, g.id).toBeGreaterThan(0.5);
      expect(peak, g.id).toBeLessThanOrEqual(0.91);
    }
    expect(lengths.size).toBeGreaterThan(10);
  });

  it('speaks French', () => {
    for (const s of Object.values(STYLES)) {
      expect(FR[s.label], s.label).toBeDefined();
      for (const v of Object.values(s.relabel ?? {})) expect(FR[v], v).toBeDefined();
      for (const x of styleStaff(s)) expect(FR[x.role], x.role).toBeDefined();
    }
    for (const g of Object.values(GENRES)) expect(FR[g.label], g.label).toBeDefined();
  });
});
