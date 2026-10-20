import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Wave 12: the home grows with the kind of home and your wealth. Through the
 * dev tools' home preview (a show home, furnished, with a garage full of
 * cars): a studio, a villa and a mansion in 3D on a phone.
 *
 * HOME_SHOTS=<dir> saves 390×844 screenshots of each.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

async function preview(page: Page, kind: string, wealth: number) {
  await page.getByRole('button', { name: 'Today' }).click();
  const tools = page.locator('[data-home-preview]');
  await tools.scrollIntoViewIfNeeded();
  await tools.getByRole('button', { name: `Wealth ${wealth}` }).click();
  await tools.locator(`[data-preview-kind="${kind}"]`).click();
  const home = page.locator('.home-scene');
  await expect(home).toHaveAttribute('data-kind', kind);
  return home;
}

test('a studio, a villa and a mansion grow with wealth, in 3D', async ({ page }) => {
  test.setTimeout(240_000);
  const dir = process.env.HOME_SHOTS;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
  // Midday in Lagos, like the reference picture.
  await page.clock.setFixedTime(new Date('2026-06-14T11:30:00Z'));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Hana Homes',
    handle: `homes_${letters(8)}`,
    company: `Homes ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  const sizes: Record<string, number> = {};
  for (const [kind, wealth] of [
    ['studio', 1],
    ['villa', 1],
    ['villa', 3],
    ['mansion', 3],
    ['penthouse', 2],
  ] as const) {
    const home = await preview(page, kind, wealth);
    await expect(home).toHaveClass(/is-3d/, { timeout: 60_000 });
    const canvas = home.locator('canvas[data-home-3d]');
    await expect(canvas).toHaveAttribute('data-kind', kind);
    sizes[`${kind}${wealth}`] = Number(await home.getAttribute('data-plan-w'));
    if (kind === 'penthouse') {
      // Up on the roof: a pool to swim in, and no cars (they're in the building's garage).
      await expect(canvas).toHaveAttribute('data-cars', '0');
      await expect(canvas).toHaveAttribute('data-pool', '1');
    } else if (kind !== 'studio') {
      // Every car in the garage is parked in a bay of its own.
      await expect(canvas).toHaveAttribute('data-cars', /^[1-9]/);
      await expect(canvas).toHaveAttribute('data-pool', '1');
    }
    await page.waitForTimeout(1500);
    if (dir) await page.screenshot({ path: `${dir}/home-${kind}-w${wealth}.png` });
    await home.getByRole('button', { name: 'Close' }).first().click();
    await expect(home).toBeHidden();
  }
  expect(sizes.villa1).toBeGreaterThan(sizes.studio1!);
  expect(sizes.villa3).toBeGreaterThan(sizes.villa1!);
  expect(sizes.mansion3).toBeGreaterThan(sizes.villa3!);
});
