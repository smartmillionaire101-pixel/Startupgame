import { describe, expect, it } from 'vitest';
import { B } from '../src/city/layout';
import {
  RIDE_MODES,
  legsBlocked,
  rideDistance,
  rideMinutes,
  skipModeFor,
  tripCommand,
  tripCost,
  tripMinutes,
} from '../src/city/travel';

/**
 * Play-test round 6: #19 "Skip the ride: be there now (Walk)" when too tired
 * to walk (and then nothing happened); #31 the chooser said "Danfo · 54 min",
 * the ride's card "25 min", and a danfo or taxi took the same time to
 * anywhere in a distance band (a taxi slower than cycling to golf).
 */
describe('rides across town', () => {
  const tired = { hoursLeft: 170, energy: 5 };
  const fresh = { hoursLeft: 170, energy: 80 };

  it('skips the ride a way you can manage', () => {
    const tiles = 5 * B;
    expect(legsBlocked('walk', tiles, tired)).toBe('tired');
    expect(skipModeFor(RIDE_MODES, 'walk', tiles, fresh)).toBe('walk');
    const as = skipModeFor(RIDE_MODES, 'walk', tiles, tired);
    expect(legsBlocked(as, tiles, tired)).toBeNull();
    expect(as).toBe('bus');
    // Out of hours for a long walk: a ride still goes.
    expect(skipModeFor(RIDE_MODES, 'cycle', 600, { hoursLeft: 0.5, energy: 80 })).toBe('bus');
  });

  it('shows one time for a trip, and charges that time', () => {
    for (const mode of ['bus', 'taxi'] as const) {
      const near = 3 * B + 2;
      const far = 7 * B - 2;
      expect(rideDistance(near)).toBe(rideDistance(far));
      // The same band, a longer trip: longer.
      expect(tripMinutes(mode, far, true)).toBeGreaterThan(tripMinutes(mode, near, true));
      // The chooser's minutes are the ride's own, and what the server is told.
      expect(tripMinutes(mode, far, true)).toBe(rideMinutes(mode, far));
      expect(tripCommand(mode, far, true)).toMatchObject({ minutes: rideMinutes(mode, far) });
      expect(tripCost(mode, far).hours * 60).toBeCloseTo(rideMinutes(mode, far), 0);
    }
    // A taxi is quicker than cycling across town.
    expect(tripMinutes('taxi', 100, true)).toBeLessThan(tripMinutes('cycle', 100, true));
  });
});
