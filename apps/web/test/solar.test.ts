import { expect, it } from 'vitest';
import { citySun } from '../src/city/solar';
it('tracks seasons and city longitude instead of fixed opening hours', () => {
  const summer = citySun('london', Date.UTC(2026, 5, 21, 19));
  const winter = citySun('london', Date.UTC(2026, 11, 21, 19));
  expect(summer.night).toBe(false);
  expect(winter.night).toBe(true);
  expect(summer.sunset - summer.sunrise).toBeGreaterThan(16 * 3_600_000);
  expect(winter.sunset - winter.sunrise).toBeLessThan(9 * 3_600_000);
  expect(citySun('san-francisco', Date.UTC(2026, 5, 21, 12)).night).toBe(true);
  expect(citySun('london', Date.UTC(2026, 5, 21, 12)).night).toBe(false);
});
