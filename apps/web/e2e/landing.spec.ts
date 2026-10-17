import { expect, test } from './fixtures';

/**
 * The landing page: a new visitor sees what the game is (pictures from the
 * game), and "Play free" opens sign-up; "Log in" opens the email log-in. Once
 * past it, the browser goes straight to sign-up.
 *
 * LANDING_SHOTS=<dir> saves screenshots (phone and desktop).
 */
const SHOTS = process.env.LANDING_SHOTS;

test.beforeEach(async ({ page }) => {
  // The shared fixture marks the landing page as seen; this spec is a new visitor.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('landing.spec')) {
      sessionStorage.setItem('landing.spec', '1');
      localStorage.setItem('runway.landingSeen', '0');
    }
  });
});

test('a new visitor sees the landing page, then Play free opens sign-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const landing = page.locator('[data-landing]');
  await expect(landing).toBeVisible({ timeout: 30_000 });
  await expect(landing.getByRole('heading', { level: 1 })).toContainText('Start a company.');
  // Pictures from the game, and every one of them loads.
  const imgs = landing.locator('.ld-phone img');
  expect(await imgs.count()).toBeGreaterThanOrEqual(5);
  for (const img of await imgs.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (SHOTS) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/landing-phone.png` });
    await page.screenshot({ path: `${SHOTS}/landing-phone-full.png`, fullPage: true });
  }
  // No sideways scrolling on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // In French.
  await landing.getByRole('button', { name: 'FR', exact: true }).click();
  await expect(landing.getByRole('heading', { level: 1 })).toContainText('Lancez une entreprise.');
  await landing.getByRole('button', { name: 'EN', exact: true }).click();

  await landing.locator('[data-landing-play]').click();
  await expect(landing).toBeHidden();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  // Past it once: a reload goes straight to sign-up.
  await page.reload();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-landing]')).toHaveCount(0);
});

test('Log in on the landing page opens the email log-in; wide screens get it side by side', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const landing = page.locator('[data-landing]');
  await expect(landing).toBeVisible({ timeout: 30_000 });
  if (SHOTS) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/landing-desktop.png` });
    await page.screenshot({ path: `${SHOTS}/landing-desktop-full.png`, fullPage: true });
  }
  await landing.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test('a sign-in link skips the landing page', async ({ page }) => {
  await page.goto('/?signin=not-a-real-token');
  await expect(page.locator('[data-landing]')).toHaveCount(0);
});
