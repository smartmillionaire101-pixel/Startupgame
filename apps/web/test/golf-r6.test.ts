import { describe, expect, it } from 'vitest';
import { MARKET_IDS, golfCourse } from '@runway/engine';
import { POWER_MAX, dist, holeGeo, powerZone } from '../src/city/golf/game';
import { holeMetres, powerAt } from '../src/city/golf/parts';

/**
 * Play-test round 6, #35: "Par 4 · 265 m" over "268 m to the pin" on the
 * tee, and a swing held for 30 seconds still came out as good as a timed one
 * (the meter swung back down).
 */
describe('golf', () => {
  it('holds a swing held too long at the top: a lunge', () => {
    expect(powerAt(650)).toBeCloseTo(55, 0);
    expect(powerAt(1300)).toBe(POWER_MAX);
    expect(powerAt(30_000)).toBe(POWER_MAX);
    expect(powerZone(powerAt(30_000))).toBe('lunge');
    // The putter fills half as fast, and stops at the top too.
    expect(powerAt(1300, true)).toBeCloseTo(55, 0);
    expect(powerAt(30_000, true)).toBe(POWER_MAX);
  });

  it('gives a hole the length the HUD measures from the tee', () => {
    for (const id of MARKET_IDS)
      for (const h of golfCourse(id).holes) {
        const g = holeGeo(h);
        // What the chip says is what "to the pin" says on the tee.
        expect(holeMetres(g)).toBe(Math.round(dist(g.tee, g.pin)));
        expect(holeMetres(g)).toBeGreaterThanOrEqual(h.length);
      }
  });
});
