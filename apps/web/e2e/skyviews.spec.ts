/**
 * Wave 12: sky views over the real city, open to every player (a brand-new
 * founder, no lifestyle needed): ride the London cable car over the Thames,
 * skip to the view, find a landmark, change the light, switch to The Shard.
 */
import { test, expect, letters, playAsGuest, setupFounder } from './fixtures';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('a new player rides the real London cable car and looks around the skyline', async ({
  page,
}, info) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Nia Sky',
    handle: `sky_${letters(8)}`,
    company: `Views ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /London/,
  });
  const home = page.getByRole('dialog', { name: 'Home and social experiences' });
  await expect(async () => {
    if (!(await home.isVisible())) await page.getByRole('button', { name: /^Together/ }).click();
    await expect(home).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
  // Every one of London's real sky views is offered, with no level required.
  for (const id of ['london-eye', 'london-cable-car', 'the-shard'])
    await expect(home.locator(`[data-sky-view="${id}"]`)).toBeVisible();
  await home.locator('[data-sky-view="london-cable-car"]').click();
  const sky = page.getByRole('dialog', { name: 'City panorama' });
  await expect(sky).toHaveAttribute('data-sky-view', 'london-cable-car', { timeout: 30000 });
  await expect(sky.getByRole('heading', { name: 'IFS Cloud Cable Car' })).toBeVisible();
  await expect(sky.locator('canvas')).toBeVisible({ timeout: 60000 });
  await expect(sky).toHaveAttribute('data-sky-phase', 'ride', { timeout: 30000 });
  await sky.getByRole('button', { name: 'Pause ride' }).click();
  await sky.getByRole('button', { name: 'Resume ride' }).click();
  await sky.getByRole('button', { name: 'Skip to the view' }).click();
  await expect(sky).toHaveAttribute('data-sky-phase', 'look', { timeout: 30000 });
  await sky.getByRole('button', { name: 'The O2', exact: true }).click();
  await expect(sky.locator('footer > p')).toHaveText('The O2');
  await sky.getByRole('button', { name: 'Look left' }).click();
  await sky.getByRole('button', { name: 'Zoom in' }).click();
  await sky.getByLabel('Light').selectOption('sunset');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('cable-car.png') });
  await sky.getByLabel('Sky view').selectOption('the-shard');
  await expect(sky).toHaveAttribute('data-sky-view', 'the-shard');
  await expect(sky.locator('canvas')).toBeVisible({ timeout: 60000 });
  await sky.getByRole('button', { name: 'Close panorama' }).click();
  await expect(sky).toHaveCount(0);
  expect(errors).toEqual([]);
});
