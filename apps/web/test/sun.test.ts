import { describe, expect, it } from 'vitest';
import { dayLightOf, fmtSunTime, overrideMoment, sunFor, sunTimes } from '../src/city/sun';
import { CITY_GEO } from '../src/city/travel';

/** Minutes after local midnight of an epoch-ms time in a city. */
const hm = (id: string, ms: number) => fmtSunTime(id, ms);
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
/** Within `tol` minutes of a published "HH:MM". */
const near = (got: string, want: string, tol = 3) =>
  expect(Math.abs(mins(got) - mins(want)), `${got} vs ${want}`).toBeLessThanOrEqual(tol);

const timesOn = (id: string, isoNoonUtc: string) => {
  const g = CITY_GEO[id]!;
  return sunTimes(Date.parse(isoNoonUtc), g.lat, g.lon);
};

describe('the real sun (Wave 12 §D)', () => {
  it('rises and sets in London at the published solstice times', () => {
    // Summer: 04:43 / 21:21 BST. Winter: 08:04 / 15:53 GMT.
    const jun = timesOn('london', '2026-06-21T12:00:00Z');
    near(hm('london', jun.sunrise), '04:43');
    near(hm('london', jun.sunset), '21:21');
    const dec = timesOn('london', '2026-12-21T12:00:00Z');
    near(hm('london', dec.sunrise), '08:04');
    near(hm('london', dec.sunset), '15:53');
  });

  it('San Francisco on the solstices', () => {
    // 05:48 / 20:35 PDT; 07:21 / 16:54 PST.
    const jun = timesOn('san-francisco', '2026-06-21T20:00:00Z');
    near(hm('san-francisco', jun.sunrise), '05:48');
    near(hm('san-francisco', jun.sunset), '20:35');
    const dec = timesOn('san-francisco', '2026-12-21T20:00:00Z');
    near(hm('san-francisco', dec.sunrise), '07:21');
    near(hm('san-francisco', dec.sunset), '16:54');
  });

  it('Lagos, near the equator: a day of about twelve hours all year, noon near 12:50', () => {
    // Equinox: 06:50 / 18:57 WAT.
    const mar = timesOn('lagos', '2026-03-20T12:00:00Z');
    near(hm('lagos', mar.sunrise), '06:50');
    near(hm('lagos', mar.sunset), '18:57');
    for (const iso of ['2026-06-21T12:00:00Z', '2026-12-21T12:00:00Z']) {
      const t = timesOn('lagos', iso);
      const len = (t.sunset - t.sunrise) / 3_600_000;
      expect(len).toBeGreaterThan(11.6);
      expect(len).toBeLessThan(12.6);
    }
  });

  it('puts the sun where it really is', () => {
    // London, midsummer noon (13:02 BST): due south, about 62° up.
    const noon = sunFor('london', Date.parse('2026-06-21T12:02:00Z'), null);
    expect(noon.elevation).toBeGreaterThan(60);
    expect(noon.elevation).toBeLessThan(63);
    expect(Math.abs(noon.azimuth - 180)).toBeLessThan(3);
    expect(noon.dir.z).toBeGreaterThan(0); // south is +z
    expect(noon.phase).toBe('day');
    expect(noon.lightsOn).toBe(false);
    // Lagos at 03:00 WAT: deep night, the lamps on.
    const night = sunFor('lagos', Date.parse('2026-10-08T02:00:00Z'), null);
    expect(night.elevation).toBeLessThan(-30);
    expect(night.night).toBe(1);
    expect(night.lightsOn).toBe(true);
    expect(dayLightOf(night)).toBe('night');
    // Morning sun in the east, evening sun in the west.
    const am = sunFor('dubai', Date.parse('2026-10-08T03:30:00Z'), null);
    const pm = sunFor('dubai', Date.parse('2026-10-08T13:30:00Z'), null);
    expect(am.azimuth).toBeGreaterThan(80);
    expect(am.azimuth).toBeLessThan(130);
    expect(am.rising).toBe(true);
    expect(pm.azimuth).toBeGreaterThan(230);
    expect(pm.rising).toBe(false);
  });

  it('every city at its own time: SF can be dark while Lagos is in full sun', () => {
    const at = Date.parse('2026-10-08T12:00:00Z'); // 13:00 Lagos, 05:00 SF
    expect(sunFor('lagos', at, null).phase).toBe('day');
    expect(sunFor('san-francisco', at, null).lightsOn).toBe(true);
    expect(sunFor('lagos', at, null).hour).toBeCloseTo(13, 5);
    expect(sunFor('san-francisco', at, null).hour).toBeCloseTo(5, 5);
  });

  it('turns gold and warm at sunset, the lamps on at dusk', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    const set = sunFor('london', now, 'sunset');
    expect(set.forced).toBe('sunset');
    expect(set.elevation).toBeGreaterThan(-1);
    expect(set.elevation).toBeLessThan(2);
    expect(set.golden).toBeGreaterThan(0.5);
    expect(set.color).not.toBe(sunFor('london', now, 'noon').color);
    expect(sunFor('london', now, 'dusk').lightsOn).toBe(true);
    expect(sunFor('london', now, 'sunrise').rising).toBe(true);
    expect(sunFor('london', now, 'night').elevation).toBeLessThan(-20);
    // An hour override is that local hour today.
    const seven = overrideMoment('7', 'london', now)!;
    expect(hm('london', seven)).toBe('07:00');
    expect(sunFor('london', now, 'nonsense').forced).toBeNull();
  });
});

describe('the 3D sky from the real sun', () => {
  it('casts shadows along the real bearing, lights up at night, warms at sunset', async () => {
    const { skyFromSun } = await import('../src/city/three/sky');
    const now = Date.parse('2026-10-08T12:00:00Z');
    const morning = skyFromSun(sunFor('lagos', Date.parse('2026-10-08T07:30:00Z'), null), 0.5);
    // Lagos in October, mid-morning: the sun in the east (+x).
    expect(morning.sunDir.x).toBeGreaterThan(0.3);
    expect(morning.night).toBe(0);
    const night = skyFromSun(sunFor('lagos', now, 'night'), 0.5);
    expect(night.night).toBe(1);
    const set = skyFromSun(sunFor('lagos', now, 'sunset'), 0.5);
    expect(set.sunDir.x).toBeLessThan(0); // setting in the west
    expect(set.sunColor.g).toBeLessThan(set.sunColor.r);
  });
});
