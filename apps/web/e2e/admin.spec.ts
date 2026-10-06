import { test, expect } from '@playwright/test';

test('protected live dashboard shows visits, players and money on desktop and mobile', async ({
  page,
  context,
}, testInfo) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local test server only.');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in to admin' })).toBeVisible();
  await page.getByLabel('Admin password').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'The game economy' })).toBeVisible();
  const before = await page.request.get('/api/admin/dashboard').then((r) => r.json());
  const visitor = await context.newPage();
  await visitor.goto('/');
  await visitor.getByLabel('Username', { exact: true }).fill('admin_browser_player');
  await visitor.getByLabel('Email', { exact: true }).fill('admin-browser@example.com');
  await visitor.getByLabel('Join as').selectOption('founder');
  await visitor.getByRole('button', { name: 'Play now' }).click();
  await expect(visitor.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  await page.bringToFront();
  await expect
    .poll(async () => {
      const d = await page.request.get('/api/admin/dashboard').then((r) => r.json());
      return (
        d.players.some((p: { name: string }) => p.name === 'admin_browser_player') &&
        d.visits.total > before.visits.total
      );
    })
    .toBe(true);
  await expect(page.getByRole('cell', { name: /admin_browser_player/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: testInfo.outputPath('admin-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Your game, at a glance.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Search players').fill('no_such_player_zzzz');
  await expect(page.getByText('No players match your search.')).toBeVisible();
  await page.getByLabel('Search players').fill('');
  await page.screenshot({ path: testInfo.outputPath('admin-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to admin' })).toBeVisible();
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(401);
  expect(errors).toEqual([]);
});
