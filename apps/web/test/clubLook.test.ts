import { describe, expect, it } from 'vitest';
import {
  THEMES,
  clubLookOf,
  clubStyleOf,
  clubTier,
  hasClubLook,
  hourCrowd,
} from '../src/city/clubLook';
import { STYLES, nightStyleOf } from '../src/city/nightlife';
import { FR } from '../src/i18n/fr';

/** The clubs the engine seeds (name, district), by city. */
const CLUBS: [string, string, string][] = [
  ['lagos', 'Club Eko Nights', 'victoria-island'],
  ['lagos', 'Lekki Afrobeats Arena', 'lekki'],
  ['london', 'Velvet Arches Club', 'shoreditch'],
  ['london', 'Neon Arches', 'shoreditch'],
  ['nairobi', 'Westlands Groove Club', 'westlands'],
  ['nairobi', 'Woodvale Nights', 'westlands'],
  ['accra', 'Oxford Street Club House', 'osu'],
  ['accra', 'Oxford Street After Dark', 'osu'],
  ['freetown', 'Atlantic Groove Club', 'aberdeen'],
  ['freetown', 'Aberdeen Night Owl Club', 'aberdeen'],
  ['kigali', 'Kimihurura Night Club', 'kimihurura'],
  ['kigali', 'Kimihurura Pulse Club', 'kimihurura'],
  ['johannesburg', 'Rivonia Night Club', 'sandton'],
  ['johannesburg', 'Braam Basement Club', 'braamfontein'],
  ['cairo', 'Zamalek After Dark', 'zamalek'],
  ['dubai', 'Marina After Hours', 'marina'],
  ['dubai', 'Marina Walk Neon Club', 'marina'],
  ['san-francisco', 'SoMa Warehouse Club', 'soma'],
  ['san-francisco', 'Folsom Street Warehouse Club', 'soma'],
];

const venue = ([market, name, district]: [string, string, string], i: number) => ({
  market,
  id: `biz-${market}-${i}`,
  kind: 'nightclub',
  name,
  district,
});

const styled = (v: ReturnType<typeof venue>) =>
  clubStyleOf(v, nightStyleOf({ market: v.market, id: v.id, kind: v.kind, name: v.name }));

describe('every club its own look', () => {
  it('is deterministic: the same club always looks the same', () => {
    for (const [i, c] of CLUBS.entries()) {
      const v = venue(c, i);
      const s = nightStyleOf(v)!;
      expect(clubLookOf(v, s)).toEqual(clubLookOf({ ...v }, s));
      expect(styled(v)).toEqual(styled({ ...v }));
    }
  });

  it('gives two clubs in one city different rooms', () => {
    const byCity = new Map<string, string[]>();
    for (const [i, c] of CLUBS.entries()) {
      const s = styled(venue(c, i));
      if (!s?.club) continue;
      byCity.set(c[0], [...(byCity.get(c[0]) ?? []), s.club.key]);
    }
    for (const [city, keys] of byCity)
      if (keys.length > 1) expect(new Set(keys).size, city).toBe(keys.length);
  });

  it('varies across all clubs: themes, floors, rigs, booths, palettes', () => {
    const looks = CLUBS.map((c, i) => styled(venue(c, i))?.club).filter((l) => !!l);
    expect(looks.length).toBeGreaterThan(14);
    expect(new Set(looks.map((l) => l.key)).size).toBeGreaterThanOrEqual(looks.length - 1);
    expect(new Set(looks.map((l) => l.theme)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(looks.map((l) => l.floorShape)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(looks.map((l) => l.rig)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(looks.map((l) => l.booth)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(looks.map((l) => l.glow.join())).size).toBeGreaterThanOrEqual(8);
    expect(new Set(looks.map((l) => l.tier))).toEqual(new Set(['street', 'mid', 'luxe']));
    // Many generated ids in one city: still spread out.
    const many = Array.from({ length: 40 }, (_, i) => {
      const v = { market: 'lagos', id: `club-${i}`, kind: 'nightclub', name: 'Club' };
      return clubLookOf(v, nightStyleOf(v)!).key;
    });
    expect(new Set(many).size).toBeGreaterThan(15);
  });

  it('makes upscale clubs look upscale and raw rooms look raw', () => {
    expect(
      clubTier({ market: 'lagos', id: 'a', kind: 'nightclub', district: 'victoria-island' }),
    ).toBe('luxe');
    expect(
      clubTier({ market: 'johannesburg', id: 'b', kind: 'nightclub', name: 'Braam Basement Club' }),
    ).toBe('street');
    expect(clubTier({ market: 'x', id: 'c', kind: 'nightclub', name: 'The Gold Room' })).toBe(
      'luxe',
    );
    expect(clubTier({ market: 'x', id: 'd', kind: 'nightclub' })).toBe('mid');
    for (let i = 0; i < 30; i++) {
      const v = { market: 'dubai', id: `lux-${i}`, kind: 'nightclub', district: 'marina' };
      const l = clubLookOf(v, nightStyleOf(v)!);
      expect(['gold', 'marble', 'velvet']).toContain(l.theme);
      expect(l.vip).toBe(true);
      expect(l.mezzanine).toBe(true);
      expect(l.crowd).toBeLessThan(1.1);
      const w = { market: 'london', id: `raw-${i}`, kind: 'nightclub', district: 'shoreditch' };
      expect(['warehouse', 'techno', 'neon']).toContain(clubLookOf(w, nightStyleOf(w)!).theme);
    }
  });

  it('reads the name: a Velvet club is velvet, a Neon one neon', () => {
    const at = (name: string, district = 'osu') => {
      const v = { market: 'accra', id: name, kind: 'nightclub', name, district };
      return clubLookOf(v, nightStyleOf(v)!);
    };
    expect(at('Velvet Room').theme).toBe('velvet');
    expect(at('Neon Nights').theme).toBe('neon');
    expect(at('Neon Nights').sign).toBe('NEON NIGHTS');
  });

  it('keeps the city’s style (sound, plan, props) and only dresses the room', () => {
    const v = {
      market: 'lagos',
      id: 'eko',
      kind: 'nightclub',
      name: 'Club Eko',
      district: 'ikoyi',
    };
    const base = nightStyleOf(v)!;
    const s = clubStyleOf(v, base, 23)!;
    expect(s.id).toBe(base.id);
    expect(s.genre).toBe(base.genre);
    expect(s.layout).toBe(base.layout);
    expect(s.props).toEqual(base.props);
    expect(s.club?.theme).toBeDefined();
    expect(s.glow).toEqual(s.club!.glow);
    // Busier after eleven than at eight.
    expect(clubStyleOf(v, base, 0)!.crowd).toBeGreaterThan(clubStyleOf(v, base, 20)!.crowd);
    expect(hourCrowd(1)).toBeGreaterThan(hourCrowd(19));
  });

  it('leaves bars, lounges and boat clubs alone', () => {
    const bar = { market: 'london', id: 'p', kind: 'pub', name: 'The Lamb' };
    expect(clubStyleOf(bar, nightStyleOf(bar))).toBe(nightStyleOf(bar));
    const boat = { market: 'cairo', id: 'b', kind: 'nightclub', name: 'Zamalek Riverboat Club' };
    expect(hasClubLook(boat, nightStyleOf(boat))).toBe(false);
    expect(clubStyleOf(boat, null)).toBeNull();
    expect(STYLES['cairo-nile-boat']).toBeDefined();
  });

  it('speaks French', () => {
    for (const th of Object.values(THEMES)) expect(FR[th.label], th.label).toBeDefined();
  });
});
