/** The city at night: how dark it is, and each city's own lights. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Fp } from '../src/city/three/footprints';
import { streetLamps, towerCrowns } from '../src/city/three/lights';
import type { RoadIndex } from '../src/city/three/roads';
import { cityLook } from '../src/city/three/cities';
import { NIGHT_LOOKS, nightExposure, nightFactor, nightLook } from '../src/city/three/night';
import { hazeToward, skyAt } from '../src/city/three/sky';
import { citySun } from '../src/city/solar';

const DEG = Math.PI / 180;

describe('nightFactor', () => {
  it('is 0 with the sun up and 1 once it is well down', () => {
    expect(nightFactor(12, 40 * DEG)).toBe(0);
    expect(nightFactor(12, 3 * DEG)).toBe(0);
    expect(nightFactor(0, -7 * DEG)).toBe(1);
    expect(nightFactor(0, -30 * DEG)).toBe(1);
  });

  it('fades through twilight, darker as the sun sinks', () => {
    const steps = [2, 0, -2, -4, -6].map((a) => nightFactor(19, a * DEG));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    expect(steps[2]!).toBeGreaterThan(0.2);
    expect(steps[2]!).toBeLessThan(0.9);
  });

  it('falls back on the hour without a sun', () => {
    expect(nightFactor(12)).toBe(0);
    expect(nightFactor(23)).toBe(1);
    expect(nightFactor(2)).toBe(1);
    expect(nightFactor(19)).toBeGreaterThan(0.2);
    expect(nightFactor(19)).toBeLessThan(0.8);
    expect(nightFactor(6)).toBeGreaterThan(0.2);
    expect(nightFactor(6)).toBeLessThan(0.8);
    expect(nightFactor(25)).toBe(nightFactor(1));
    expect(nightFactor(Number.NaN)).toBe(0);
  });
});

describe('the night sky', () => {
  it('turns the exposure down at night, not up', () => {
    expect(nightExposure(0)).toBe(1);
    expect(nightExposure(1)).toBeLessThan(0.65);
    expect(nightExposure(1)).toBeGreaterThan(0.5);
    expect(skyAt(23, 6.5, 0.7).exposure).toBeLessThan(skyAt(12, 6.5, 0.7).exposure);
  });

  it('is a dark city night: a near-black sky, faint blue moonlight, little ambient', () => {
    // Players preferred this to a navy sky lighting the city a flat grey-blue.
    const s = skyAt(23.5, 51.5, 0.65);
    const day = skyAt(12.5, 51.5, 0.65);
    expect(s.night).toBe(1);
    const hsl = (c: typeof s.zenith) => c.getHSL({ h: 0, s: 0, l: 0 });
    // Near black overhead with a hint of navy (linear colour), lighter towards
    // the horizon where the city glows.
    expect(hsl(s.zenith).l).toBeLessThan(0.008);
    expect(s.zenith.b).toBeGreaterThan(s.zenith.r * 2);
    expect(hsl(s.horizon).l).toBeGreaterThan(hsl(s.zenith).l);
    expect(hsl(s.horizon).l).toBeLessThan(0.05);
    // Moonlight: cool and faint; the sky's fill dim and blue, never off.
    expect(s.sunColor.b).toBeGreaterThan(s.sunColor.r);
    expect(s.sunIntensity).toBeLessThan(0.4);
    expect(s.sunIntensity).toBeGreaterThan(0.1);
    expect(s.hemiIntensity).toBeLessThan(0.3);
    expect(s.hemiIntensity).toBeGreaterThan(0.1);
    expect(s.hemiIntensity).toBeLessThan(day.hemiIntensity);
    expect(s.hemiSky.b).toBeGreaterThan(s.hemiSky.r);
  });

  it('is a dusk, not a grey haze: a deep blue zenith over a warm horizon', () => {
    // Lagos, 20 October, about 18:00: the sun just down, half dark.
    const at = Date.UTC(2026, 9, 20, 17, 32);
    const s = skyAt(18.5, 6.5, 0.7, citySun('lagos', at));
    expect(s.night).toBeGreaterThan(0.2);
    expect(s.night).toBeLessThan(0.8);
    // The horizon warm (red over blue), the zenith a saturated deep blue.
    expect(s.horizon.r).toBeGreaterThan(s.horizon.b);
    const z = s.zenith.getHSL({ h: 0, s: 0, l: 0 });
    expect(z.s).toBeGreaterThan(0.4);
    expect(s.zenith.b).toBeGreaterThan(s.zenith.r * 2);
    // The city's ambient already dimmer and bluer than by day.
    const day = skyAt(12.5, 6.5, 0.7);
    expect(s.hemiIntensity).toBeLessThan(day.hemiIntensity * 0.8);
  });

  it('changes the light smoothly, minute by minute, through golden hour and dusk', () => {
    // The low sun now brightens towards the horizon before it sets, so the light
    // no longer only fades: what is bounded is how far anything moves in a minute.
    // San Francisco (a slow, slanting sunset) and Lagos (a fast one near the
    // equator), from 90 minutes before sunset to an hour after, and the dawn mirror.
    const cases = [
      { city: 'san-francisco', at: Date.UTC(2026, 10, 24, 0, 55) },
      { city: 'san-francisco', at: Date.UTC(2026, 10, 23, 14, 58) },
      { city: 'lagos', at: Date.UTC(2026, 9, 20, 17, 40) },
    ];
    for (const { city, at } of cases) {
      const look = cityLook(city);
      const read = (m: number) => {
        const s = skyAt(12, look.lat, look.haze, citySun(city, at + m * 60_000));
        // The key light as it lands (colour × intensity): when the moon takes over
        // the colour switches, but the light is out by then.
        const key = s.sunColor.clone().multiplyScalar(s.sunIntensity);
        return {
          light: [s.sunIntensity, key.r, key.g, key.b],
          fill: [s.hemiIntensity, s.hemiSky.r, s.hemiSky.g, s.hemiSky.b, s.exposure],
          sky: [
            s.night,
            s.gold,
            s.zenith.r,
            s.zenith.g,
            s.zenith.b,
            s.horizon.r,
            s.horizon.g,
          ].concat([s.horizon.b, s.glow.r, s.glow.g, s.glow.b, s.band.r, s.band.g, s.band.b]),
        };
      };
      const most = { light: 0, fill: 0, sky: 0 };
      let prev = read(-90);
      for (let m = -89; m <= 60; m++) {
        const cur = read(m);
        for (const k of ['light', 'fill', 'sky'] as const)
          cur[k].forEach((v, i) => (most[k] = Math.max(most[k], Math.abs(v - prev[k][i]!))));
        prev = cur;
      }
      expect(most.light).toBeLessThan(0.55);
      expect(most.fill).toBeLessThan(0.06);
      expect(most.sky).toBeLessThan(0.08);
    }
    // Without a sun (the hour alone), in steps of a minute.
    let prev = skyAt(17, 6.5, 0.7).sunIntensity;
    for (let h = 17 + 1 / 60; h <= 21; h += 1 / 60) {
      const s = skyAt(h, 6.5, 0.7).sunIntensity;
      expect(Math.abs(s - prev)).toBeLessThan(0.55);
      prev = s;
    }
  });

  it('is a golden hour: a strong orange sun, a blazing sky towards it, blue shade', () => {
    // San Francisco, 23 November: 20 minutes before sunset (16:54), the sun ~2.6° up in the WSW.
    const look = cityLook('san-francisco');
    const sun = citySun('san-francisco', Date.UTC(2026, 10, 24, 0, 35));
    const s = skyAt(16.6, look.lat, look.haze, sun, look.hazeTint, look.night.skyGlow);
    const noon = skyAt(12.5, look.lat, look.haze);
    const hsl = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 });
    // The key light: stronger than at noon, and orange (hue 15°–40°), not white.
    expect(s.sunIntensity).toBeGreaterThan(noon.sunIntensity);
    expect(s.sunColor.r).toBeGreaterThan(s.sunColor.b * 4);
    expect(hsl(s.sunColor).h * 360).toBeGreaterThan(10);
    expect(hsl(s.sunColor).h * 360).toBeLessThan(40);
    // The sky burns towards the sun: a bright, saturated orange glow at full strength.
    expect(s.gold).toBeGreaterThan(0.9);
    expect(hsl(s.glow).s).toBeGreaterThan(0.8);
    expect(s.glow.r).toBeGreaterThan(0.9);
    expect(s.glow.r).toBeGreaterThan(s.glow.b * 10);
    // Looking towards the sun the haze is orange and brighter than looking away.
    const toward = hazeToward(s, s.skyDir.x, s.skyDir.z, new THREE.Color());
    const away = hazeToward(s, -s.skyDir.x, -s.skyDir.z, new THREE.Color());
    expect(toward.r).toBeGreaterThan(toward.b * 3);
    expect(toward.r + toward.g).toBeGreaterThan(away.r + away.g);
    expect(away.b / away.r).toBeGreaterThan(toward.b / toward.r);
    // Overhead a deep blue; the shade's light blue too (warm walls, cool shadows).
    expect(s.zenith.b).toBeGreaterThan(s.zenith.r * 2);
    expect(s.hemiSky.b).toBeGreaterThan(s.hemiSky.r);
    expect(s.hemiIntensity).toBeLessThan(noon.hemiIntensity);
    // The key light never comes from below the ground, even with the sun just set.
    const set = skyAt(
      17,
      look.lat,
      look.haze,
      citySun('san-francisco', Date.UTC(2026, 10, 24, 0, 58)),
    );
    expect(set.skyDir.y).toBeLessThan(0);
    expect(set.sunDir.y).toBeGreaterThan(0);
    // No golden hour at noon or at midnight.
    expect(noon.gold).toBe(0);
    expect(skyAt(23.5, look.lat, look.haze).gold).toBe(0);
    expect(hazeToward(noon, 1, 0, new THREE.Color()).equals(noon.horizon)).toBe(true);
  });

  it('stays finite and non-negative through a whole dusk (nothing to blank the scene)', () => {
    // San Francisco, 23 November: from before sunset (16:54) into full night, a minute at a time.
    const look = cityLook('san-francisco');
    const from = Date.UTC(2026, 10, 24, 0, 30);
    for (let m = 0; m <= 120; m++) {
      const at = from + m * 60_000;
      const s = skyAt(16.5 + m / 60, look.lat, look.haze, citySun('san-francisco', at));
      const nums = [s.night, s.exposure, s.sunIntensity, s.hemiIntensity];
      nums.push(s.gold);
      for (const c of [s.zenith, s.horizon, s.sunColor, s.hemiSky, s.hemiGround, s.glow, s.band])
        nums.push(c.r, c.g, c.b);
      for (const n of nums) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
      expect(s.exposure).toBeGreaterThan(0.5);
    }
  });

  it('leaves the day as it was', () => {
    const noon = skyAt(12.5, 6.5, 0.7);
    expect(noon.night).toBe(0);
    expect(noon.exposure).toBe(1);
    expect(noon.sunIntensity).toBeGreaterThan(3);
  });

  it('is night in Lagos at 23:00 by the real sun', () => {
    const at = Date.UTC(2026, 9, 20, 22);
    expect(nightFactor(23, citySun('lagos', at).altitude)).toBe(1);
    expect(nightFactor(12, citySun('lagos', Date.UTC(2026, 9, 20, 11)).altitude)).toBe(0);
  });
});

describe('street lamps and tower crowns', () => {
  const seg = (ax: number, c = 4) => ({ ax, ay: 0, bx: ax + 2000, by: 0, c, ha: 0, hb: 0 });
  // Far roads first in the data, the one you're on last.
  const roads = { segs: [seg(40000), seg(20000), seg(0)] } as unknown as RoadIndex;

  it('spends the budget on the streets round you', () => {
    const l = streetLamps(roads, 30, undefined, { x: 1000, y: 0 });
    expect(l.length).toBeGreaterThan(40);
    for (let i = 0; i < l.length; i++) expect(l.pos[i * 3]!).toBeLessThan(20000);
  });

  it("burns in the city's own colours", () => {
    const l = streetLamps(roads, 1000, nightLook('lagos').lamps);
    const sodium = new THREE.Color(nightLook('lagos').lamps[4]);
    expect(l.col[0]).toBeCloseTo(sodium.r, 5);
    expect(l.col[2]).toBeCloseTo(sodium.b, 5);
  });

  it('crowns a share of the tall towers, none of the low ones', () => {
    const fp = (x: number, top: number) => ({ box: [x, 0, x + 30, 30], top }) as unknown as Fp;
    const tall = Array.from({ length: 40 }, (_, i) => fp(i * 100, 200));
    const all = towerCrowns(tall, '#ffd27a', 1).length;
    const half = towerCrowns(tall, '#ffd27a', 0.5).length;
    expect(all).toBeGreaterThan(0);
    expect(half).toBeLessThan(all);
    expect(half).toBeGreaterThan(0);
    expect(towerCrowns([fp(0, 20)], '#ffd27a', 1).length).toBe(0);
  });
});

describe("each city's night", () => {
  it('Lagos burns sodium orange, London cooler white, Dubai lit up in gold', () => {
    const warmth = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) - (n & 255);
    };
    const lagos = nightLook('lagos');
    const london = nightLook('london');
    const dubai = nightLook('dubai');
    expect(warmth(lagos.lamps[0])).toBeGreaterThan(warmth(london.lamps[0]) + 60);
    expect(dubai.lit).toBeGreaterThan(london.lit);
    expect(london.lit).toBeGreaterThan(lagos.lit);
    expect(dubai.crowns).toBeGreaterThan(0.8);
    expect(warmth(dubai.accent)).toBeGreaterThan(50);
  });

  it('comes with the city look, with a default for any other city', () => {
    expect(cityLook('lagos').night).toBe(NIGHT_LOOKS.lagos);
    expect(cityLook('dubai').night).toBe(NIGHT_LOOKS.dubai);
    const other = cityLook('atlantis').night;
    expect(other.lamps).toHaveLength(6);
    for (const n of Object.values(NIGHT_LOOKS)) {
      expect(n.lamps).toHaveLength(6);
      expect(n.lit).toBeGreaterThan(0);
      expect(n.coolShare[1]).toBeGreaterThanOrEqual(n.coolShare[0]);
    }
  });
});
