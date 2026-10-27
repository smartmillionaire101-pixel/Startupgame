/**
 * Play-test #21: the 3D city ran at 2 frames a second with no way out
 * offered. Persistently slow frames step the default map down to Lite; a
 * 3D map the player chose in Settings only suggests it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getMapQuality,
  isSlowFrame,
  mapQualityChosen,
  setMapQuality,
  SLOW_CHECKS,
  slowMapDue,
} from '../src/city/three/quality';

afterEach(() => localStorage.clear());

describe('a slow 3D city (play-test #21)', () => {
  it('counts a frame as too slow by the page’s own time or the gap between frames', () => {
    expect(isSlowFrame({ costMs: 8, gapMs: 16 })).toBe(false);
    expect(isSlowFrame({ costMs: 60, gapMs: 120 })).toBe(false);
    expect(isSlowFrame({ costMs: 300, gapMs: 120 })).toBe(true);
    // The play-test's 2 frames a second.
    expect(isSlowFrame({ costMs: 30, gapMs: 500 })).toBe(true);
  });

  it('knows a map the player picked from the default', () => {
    expect(mapQualityChosen()).toBe(false);
    expect(getMapQuality()).toBe('3d');
    setMapQuality('lite');
    expect(mapQualityChosen()).toBe(true);
    expect(getMapQuality()).toBe('lite');
  });

  it('waits for a trip to end before stepping down (the trip would be dropped)', () => {
    expect(slowMapDue(SLOW_CHECKS - 1, false)).toBe(false);
    expect(slowMapDue(SLOW_CHECKS, false)).toBe(true);
    expect(slowMapDue(SLOW_CHECKS, true)).toBe(false);
    expect(slowMapDue(SLOW_CHECKS + 3, true)).toBe(false);
    expect(slowMapDue(SLOW_CHECKS + 3, false)).toBe(true);
  });
});
