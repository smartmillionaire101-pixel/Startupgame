import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Feedback from inside the game: Feedback in the phone's Settings app opens
 * a short form, and what the player writes is sent with the screen they were on.
 * FEEDBACK_SHOTS=<dir> saves 390×844 screenshots.
 */
const SHOTS = process.env.FEEDBACK_SHOTS;

test('a player sends feedback from the phone’s Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The online count can't be fetched: the top bar shows a dash.
  await page.route('**/api/online', (route) => route.abort());
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Feedback ${n}`,
    handle: `fb_${n}`,
    company: `Quillmark ${letters(5)}`,
    idea: 'Payroll for market traders',
    market: /San Francisco/,
  });
  await expect(page.locator('[data-hud-bar] .online-count')).toContainText('unavailable', {
    timeout: 30_000,
  });
  // The HUD's pills fit the phone.
  const right = await page
    .locator('.hud-top')
    .evaluate((el) => Math.max(...[...el.children].map((c) => c.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="settings"]').click();
  const open = phone.locator('[data-feedback-open]');
  await open.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/feedback-settings.png` });
  await open.click();
  // The phone steps aside for the form.
  await expect(phone).toBeHidden();
  const form = page.locator('[data-feedback-form]');
  await expect(form).toBeVisible();
  await form.getByRole('radio', { name: /Confusing/ }).click();
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(form.getByRole('alert')).toHaveText('Tell us a little more.');
  await form.getByLabel('What happened?').fill('I did not know where to find my first customer.');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/feedback-form.png` });
  const sent = page.waitForRequest(
    (r) => r.url().endsWith('/api/feedback') && r.method() === 'POST',
  );
  await form.getByRole('button', { name: 'Send' }).click();
  const body = (await sent).postDataJSON() as {
    topic: string;
    text: string;
    context: Record<string, string>;
  };
  expect(body).toMatchObject({
    topic: 'confusing',
    text: 'I did not know where to find my first customer.',
    context: { screen: 'city' },
  });
  await expect(page.locator('[data-feedback-sent]')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/feedback-sent.png` });
  await expect(page.locator('[data-feedback-sent]')).toBeHidden({ timeout: 6000 });
});
