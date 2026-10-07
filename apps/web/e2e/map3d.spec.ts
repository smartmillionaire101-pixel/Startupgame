import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

// WebGL through software rendering, for this spec only: the flags slow the
// CSS-animated scenes (airport, flights) other specs time.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/**
 * Wave 9 §B: the city in 3D (WebGL). Playwright's Chromium draws it with
 * software WebGL (slow), so this spec only checks that it renders, keeps the
 * licence credit, and that a place opens from its label.
 */
test('The 3D city renders, credits OpenStreetMap, and a place opens from its label', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
    } catch {
      /* storage blocked */
    }
  });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tolu Three',
    handle: `tolu_${letters(6)}`,
    company: `Eko Cubes ${letters(5)}`,
    idea: 'Payments for market traders',
  });

  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  // The WebGL map: a canvas, built and drawing.
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  await expect(map.locator('canvas.c3-canvas')).toBeAttached();
  const drawn = await page.waitForFunction(
    () => {
      const s = (window as unknown as { __city3d?: { stats: { draws: number; tris: number } } })
        .__city3d;
      return s && s.stats.draws > 10 && s.stats.tris > 1000 ? s.stats : null;
    },
    null,
    { timeout: 60_000 },
  );
  expect(await drawn.jsonValue()).toBeTruthy();
  const credit = map.locator('[data-osm-credit]');
  await expect(credit).toBeVisible();
  await expect(credit).toHaveText('© OpenStreetMap contributors');
  await expect(page.locator('[data-landmark="Lekki–Ikoyi Link Bridge"]')).toBeAttached();
  // The accessible way in stays: the map's own buttons.
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();

  // The Hub's label floats over its building; tapping it walks there and goes in.
  const hub = map.locator('[data-label="hub"]');
  await expect(hub).toBeVisible({ timeout: 30_000 });
  await hub.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await hub.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  if (await chooser.isVisible().catch(() => false))
    await chooser.locator('[data-mode="walk"]').click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
});
