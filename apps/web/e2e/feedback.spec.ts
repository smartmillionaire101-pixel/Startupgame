import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Feedback from inside the game: the button in the top row opens a short
 * form, and what the player writes is sent with the screen they were on.
 * FEEDBACK_SHOTS=<dir> saves 390×844 screenshots.
 */
const SHOTS = process.env.FEEDBACK_SHOTS;

test('a player sends feedback from the top row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The longest the row gets: the online count can't be fetched.
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
  const open = page.locator('[data-feedback-open]');
  await expect(open).toBeVisible({ timeout: 30_000 });
  // The top row still fits a phone with the extra button.
  await expect(page.locator('.online-count')).toContainText('unavailable');
  const row = await page.locator('.game-activity').evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(row.scroll).toBeLessThanOrEqual(row.client + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/feedback-row.png` });

  await open.click();
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
