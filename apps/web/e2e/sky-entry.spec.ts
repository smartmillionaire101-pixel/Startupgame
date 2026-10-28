/**
 * Sky views open straight from the city: the Sky views button and the Places
 * list offer the city's real towers, wheels and hills, and a tap goes up.
 */
import { test, expect, letters, playAsGuest, setupFounder, hudMore } from './fixtures';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('a San Francisco founder goes up the Salesforce Tower from the city map', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ana Tower',
    handle: `tower_${letters(8)}`,
    company: `Tall ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /San Francisco/,
  });
  await hudMore(page);
  await page.getByTestId('sky-views-btn').click();
  const sheet = page.getByRole('dialog', { name: 'Sky views' });
  await expect(sheet.locator('[data-sky-view="salesforce-tower"]')).toBeVisible();
  await sheet.locator('[data-sky-view="salesforce-tower"]').click();
  const sky = page.getByRole('dialog', { name: 'City panorama' });
  await expect(sky).toHaveAttribute('data-sky-view', 'salesforce-tower', { timeout: 60_000 });
  await expect(sky.getByRole('heading', { name: /Salesforce Tower/ })).toBeVisible({
    timeout: 60_000,
  });
});
