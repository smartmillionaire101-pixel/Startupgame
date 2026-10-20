/** The city at night: how dark it is, and each city's own lights. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Fp } from '../src/city/three/footprints';
import { streetLamps, towerCrowns } from '../src/city/three/lights';
import type { RoadIndex } from '../src/city/three/roads';
import { cityLook } from '../src/city/three/cities';
import { NIGHT_LOOKS, nightExposure, nightFactor, nightLook } from '../src/city/three/night';
import { skyAt } from '../src/city/three/sky';
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
    expect(skyAt(23, 6.5, 0.7).exposure).toBeLessThan(skyAt(12, 6.5, 0.7).exposure);
  });

  it('is dark: near-black sky, faint blue moonlight, little ambient', () => {
    const s = skyAt(23.5, 51.5, 0.65);
    expect(s.night).toBe(1);
    expect(s.zenith.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.03);
    expect(s.horizon.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.12);
    expect(s.sunColor.b).toBeGreaterThan(s.sunColor.r);
    expect(s.sunIntensity).toBeLessThan(0.3);
    expect(s.hemiIntensity).toBeLessThan(0.3);
  });

  it('dims the light smoothly through dusk (no jump when the moon takes over)', () => {
    let prev = Infinity;
    let jump = 0;
    for (let h = 17; h <= 21; h += 0.05) {
      const s = skyAt(h, 6.5, 0.7);
      if (prev !== Infinity) jump = Math.max(jump, Math.abs(s.sunIntensity - prev));
      prev = s.sunIntensity;
    }
    expect(jump).toBeLessThan(0.3);
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
