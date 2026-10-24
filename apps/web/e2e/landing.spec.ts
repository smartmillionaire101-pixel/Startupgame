import { expect, test } from './fixtures';

/**
 * The landing page: a new visitor sees what the game is (pictures from the
 * game), and "Play free" opens sign-up; "Log in" opens the email log-in.
 * Each of the three careers has a card that opens sign-up as that role.
 * Back (the browser's, or sign-up's own) returns to it.
 *
 * LANDING_SHOTS=<dir> saves screenshots (phone and desktop).
 */
const SHOTS = process.env.LANDING_SHOTS;

test.beforeEach(async ({ page }) => {
  // The shared fixture marks the landing page as seen; this spec is a new visitor.
  await page.addInitScript(() => localStorage.setItem('runway.landingSeen', '0'));
});

test('a new visitor sees the landing page, then Play free opens sign-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const landing = page.locator('[data-landing]');
  await expect(landing).toBeVisible({ timeout: 30_000 });
  await expect(landing.getByRole('heading', { level: 1 })).toContainText(
    'Found it. Fund it. Bank it.',
  );
  // Pictures from the game, and every one of them loads.
  const imgs = landing.locator('.ld-phone img, .ld-role img');
  expect(await imgs.count()).toBeGreaterThanOrEqual(12);
  for (const img of await imgs.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  // The club plays as a clip; the mansion turns, by itself and by dragging.
  const clip = landing.locator('.ld-screen video');
  await clip.scrollIntoViewIfNeeded();
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(1);
  const turn = landing.locator('[data-turntable]');
  await turn.scrollIntoViewIfNeeded();
  await expect(turn.locator('img')).toHaveCount(30);
  const f0 = await turn.getAttribute('data-frame');
  await expect.poll(() => turn.getAttribute('data-frame')).not.toBe(f0);
  const box = (await turn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const held = Number(await turn.getAttribute('data-frame'));
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
  expect(Number(await turn.getAttribute('data-frame'))).toBe((held + 5) % 30);
  await page.mouse.up();
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
  await expect(landing.getByRole('heading', { level: 1 })).toContainText(
    'Créez. Financez. Prêtez.',
  );
  await landing.getByRole('button', { name: 'EN', exact: true }).click();

  await landing.locator('[data-landing-play]').click();
  await expect(landing).toBeHidden();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  // Back (the browser's) returns to the landing page…
  await page.goBack();
  await expect(landing).toBeVisible();
  // …and so does sign-up's own Back.
  await landing.locator('[data-landing-play]').click();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await page.locator('[data-signin-back]').click();
  await expect(landing).toBeVisible();
});

test('a career card opens sign-up with that role chosen; Play free stays a founder', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const landing = page.locator('[data-landing]');
  await expect(landing).toBeVisible({ timeout: 30_000 });
  const cards = landing.locator('[data-landing-role]');
  await expect(cards).toHaveCount(3);
  for (const [role, name] of [
    ['investor', 'Play as an investor'],
    ['banker', 'Play as a banker'],
    ['founder', 'Play as a founder'],
  ] as const) {
    const card = landing.locator(`[data-landing-role="${role}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText(name);
    await card.click();
    await expect(landing).toBeHidden();
    await expect(page.getByLabel('Join as')).toHaveValue(role);
    // Back to the landing page, by sign-up's own Back.
    await page.locator('[data-signin-back]').click();
    await expect(landing).toBeVisible();
  }
  // The browser's Back and Forward keep the role.
  await landing.locator('[data-landing-role="banker"]').click();
  await expect(page.getByLabel('Join as')).toHaveValue('banker');
  await page.goBack();
  await expect(landing).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Join as')).toHaveValue('banker');
  await page.goBack();
  // Play free: sign-up as it always was (a founder unless you choose).
  await landing.locator('[data-landing-play]').click();
  await expect(page.getByLabel('Join as')).toHaveValue('founder');
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
