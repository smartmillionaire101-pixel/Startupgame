import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

// WebGL through software rendering (the 3D city).
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/**
 * Wave 12 §D: the real sun. Each city's light follows its real sunrise and
 * sunset (city/sun.ts): the 3D city's sun, sky and lamps, and the 2D map's
 * tint. A dev override (localStorage `runway.sun`) forces sunrise, sunset or
 * night for these checks. SUN_SHOTS=<dir> saves screenshots.
 */
const SHOTS = process.env.SUN_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

type SceneSun = { phase: string; lightsOn: boolean; elevation: number; forced: string | null };
const sceneSun = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __city3d?: { sunNow: SceneSun } }).__city3d?.sunNow ?? null,
  );

async function cityIn(page: Page, market: RegExp, quality: '3d' | 'lite', sun: string | null) {
  await page.addInitScript(
    ([q, s]) => {
      try {
        // Once per tab: a test may change the light and reload.
        if (sessionStorage.getItem('sun-init')) return;
        sessionStorage.setItem('sun-init', '1');
        localStorage.setItem('runway.mapQuality', q!);
        if (s) localStorage.setItem('runway.sun', s);
        else localStorage.removeItem('runway.sun');
      } catch {
        /* storage blocked */
      }
    },
    [quality, sun],
  );
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Sola Sun',
    handle: `sola_${letters(6)}`,
    company: `Sola Light ${letters(5)}`,
    idea: 'Solar power for shops',
    market,
  });
}

async function ready3d(page: Page, city: RegExp) {
  const map = page.getByRole('application', { name: city });
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 90_000 });
  // Let the city fill in and settle before the picture.
  await page.waitForFunction(
    () =>
      ((window as unknown as { __city3d?: { stats: { draws: number } } }).__city3d?.stats.draws ??
        0) > 10,
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2500);
  return map;
}

for (const [label, market, city] of [
  ['sf', /San Francisco/, /Map of San Francisco/],
  ['lagos', /Lagos, Nigeria/, /Map of Lagos/],
] as const) {
  test(`${label}: the 3D city in its real light right now`, async ({ page }) => {
    test.setTimeout(180_000);
    await cityIn(page, market, '3d', null);
    const map = await ready3d(page, city);
    const sun = await sceneSun(page);
    expect(sun).not.toBeNull();
    expect(sun!.forced).toBeNull();
    // The page and the scene agree on the light.
    await expect(map).toHaveAttribute('data-sun-phase', sun!.phase);
    await expect(map).toHaveAttribute('data-lights', sun!.lightsOn ? 'on' : 'off');
    await shot(page, `${label}-now-${sun!.phase}`);
  });
}

for (const forced of ['sunrise', 'sunset', 'night'] as const) {
  test(`Lagos at a forced ${forced}`, async ({ page }) => {
    test.setTimeout(180_000);
    await cityIn(page, /Lagos, Nigeria/, '3d', forced);
    const map = await ready3d(page, /Map of Lagos/);
    const sun = await sceneSun(page);
    expect(sun!.forced).toBe(forced);
    if (forced === 'night') {
      expect(sun!.elevation).toBeLessThan(-20);
      await expect(map).toHaveAttribute('data-sun-phase', 'night');
      await expect(map).toHaveAttribute('data-lights', 'on');
    } else {
      expect(Math.abs(sun!.elevation)).toBeLessThan(3);
      await expect(map).toHaveAttribute('data-sun-phase', /golden|dawn|dusk/);
    }
    await shot(page, `lagos-3d-${forced}`);
  });
}

test('the 2D map is tinted by the real light: night blue, nothing by day', async ({ page }) => {
  await cityIn(page, /London/, 'lite', 'night');
  const map = page.getByRole('application', { name: /Map of London/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-sun-phase', 'night');
  await expect(map).toHaveAttribute('data-lights', 'on');
  await expect(map.locator('.city-daylight')).toBeAttached();
  await shot(page, 'london-2d-night');
  await page.evaluate(() => localStorage.setItem('runway.sun', 'noon'));
  await page.reload();
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-sun-phase', 'day');
  await expect(map.locator('.city-daylight')).toHaveCount(0);
  await shot(page, 'london-2d-noon');
});
