import { expect, letters, openTogether, playAsGuest, setupFounder, test } from './fixtures';
import type { Page } from './fixtures';

/**
 * The city at night is night: a dark sky, low exposure, lit windows, street
 * lamps in the city's own colours. The clock is fixed at 22:00 UTC (23:00 in
 * Lagos and London in October, 02:00 in Dubai) and the 3D map reports how
 * dark it is (`data-night`, 0 day … 1 night).
 *
 * NIGHT_SHOTS=<dir> also saves 390×844 screenshots of the map and a sky view.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.NIGHT_SHOTS;
const NIGHT = new Date('2026-10-20T22:00:00Z');
const DAY = new Date('2026-10-20T11:00:00Z');

async function openMap(page: Page, market: RegExp, city: string, at: Date) {
  await page.clock.setFixedTime(at);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((hq) => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
      // NIGHT_HQ: the GPU path a phone takes (not the software renderer's).
      if (hq) localStorage.setItem('runway.hq', '1');
    } catch {
      /* storage blocked */
    }
  }, !!process.env.NIGHT_HQ);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Nnamdi Night',
    handle: `night_${letters(8)}`,
    company: `Moonlit ${letters(6)}`,
    idea: 'Payments for market traders',
    market,
  });
  const map = page.getByRole('application', { name: new RegExp(`Map of ${city}`) });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 90_000 });
  return map;
}

/** Wait for the map's tiles to settle, then a screenshot (NIGHT_SHOTS only). */
async function shot(page: Page, name: string, which: '__city3d' | '__sky3d' = '__city3d') {
  if (!SHOTS) return;
  await page.waitForTimeout(8000);
  // Hold the frame: a software renderer drawing a big city can keep the page
  // too busy to hand over a screenshot. (__sky3d holds its CityScene as `scene`.)
  const hold = (w: string, on: boolean) =>
    page.evaluate(
      ({ w, on }) => {
        const h = (
          window as unknown as Record<string, { paused: boolean; scene: { paused: boolean } }>
        )[w];
        if (!h) return;
        if (w === '__sky3d') h.scene.paused = on;
        else h.paused = on;
      },
      { w, on },
    );
  await hold(which, true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 90_000 });
  await hold(which, false);
}

for (const c of [
  { id: 'lagos', name: 'Lagos', market: /Lagos/ },
  { id: 'london', name: 'London', market: /London/ },
  { id: 'dubai', name: 'Dubai', market: /Dubai/ },
]) {
  test(`${c.name} at night is dark, with its own lights`, async ({ page }) => {
    test.setTimeout(240_000);
    const map = await openMap(page, c.market, c.name, NIGHT);
    await shot(page, `map-${c.id}-night`);
    await expect(map).toHaveAttribute('data-night', /^(0\.9\d*|1)$/);
    // The street lamps are lit round where you are (not spent on the far side of the map).
    const near = await page.evaluate(() => {
      type P = {
        isPoints?: boolean;
        visible: boolean;
        geometry: { attributes: { position: { count: number; array: ArrayLike<number> } } };
      };
      const s = (
        window as unknown as {
          __city3d: { rig: { x: number; y: number }; scene: { traverse(f: (o: P) => void): void } };
        }
      ).__city3d;
      let n = 0;
      s.scene.traverse((o) => {
        if (!o.isPoints || !o.visible) return;
        const a = o.geometry.attributes.position;
        for (let i = 0; i < a.count; i++)
          if (Math.hypot(a.array[i * 3]! - s.rig.x, a.array[i * 3 + 2]! - s.rig.y) < 800) n++;
      });
      return n;
    });
    expect(near).toBeGreaterThan(50);
    const exposure = await page.evaluate(
      () =>
        (window as unknown as { __city3d: { renderer: { toneMappingExposure: number } } }).__city3d
          .renderer.toneMappingExposure,
    );
    expect(exposure).toBeLessThan(0.8);
  });
}

test('By day the map stays day', async ({ page }) => {
  test.setTimeout(240_000);
  const map = await openMap(page, /Lagos/, 'Lagos', DAY);
  await shot(page, 'map-lagos-day');
  await expect(map).toHaveAttribute('data-night', '0');
});

for (const c of [
  // Lagos, 20 October: the sun sets about 17:25 UTC and rises about 05:32 UTC.
  { id: 'dusk', at: new Date('2026-10-20T17:38:00Z') },
  { id: 'dawn', at: new Date('2026-10-20T05:24:00Z') },
])
  test(`Lagos at ${c.id} is half-lit, between day and night`, async ({ page }) => {
    test.setTimeout(240_000);
    const map = await openMap(page, /Lagos/, 'Lagos', c.at);
    await shot(page, `map-lagos-${c.id}`);
    const n = Number(await map.getAttribute('data-night'));
    expect(n).toBeGreaterThan(0.05);
    expect(n).toBeLessThan(0.98);
  });

test('A sky view at night', async ({ page }) => {
  test.setTimeout(420_000);
  await openMap(page, /Dubai/, 'Dubai', NIGHT);
  await openTogether(page);
  const home = page.getByRole('dialog', { name: 'Home and social experiences' });
  await home.locator('[data-sky-view="burj-khalifa"]').click();
  const pano = page.getByRole('dialog', { name: 'City panorama' });
  await expect(pano.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => !!(window as unknown as { __sky3d?: unknown }).__sky3d, null, {
    timeout: 60_000,
  });
  await pano.getByLabel('Light').selectOption('night');
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __sky3d: { scene: { night: number; renderer: { toneMappingExposure: number } } };
        }
      ).__sky3d.scene.night > 0.9,
    null,
    { timeout: 60_000 },
  );
  const exposure = await page.evaluate(
    () =>
      (window as unknown as { __sky3d: { scene: { renderer: { toneMappingExposure: number } } } })
        .__sky3d.scene.renderer.toneMappingExposure,
  );
  expect(exposure).toBeLessThan(0.8);
  await page.evaluate(() =>
    (window as unknown as { __sky3d: { ride: { seek(u: number): void } } }).__sky3d.ride.seek(1),
  );
  if (SHOTS) await page.waitForTimeout(15_000);
  await shot(page, 'sky-dubai-night', '__sky3d');
});
