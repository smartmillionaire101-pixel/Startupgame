import { expect, letters, tab, test } from './fixtures';

test('a founder signs up, onboards in under two minutes, and plays a month', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build, invest and grow.' })).toBeVisible();

  // 1. Play straight away as a guest after confirming 18+ (no date of birth).
  await expect(page.getByRole('button', { name: 'Play now' })).toBeDisabled();
  await page.getByLabel('I confirm I’m 18 or older').check();
  await page.getByRole('button', { name: 'Play now' }).click();

  // 2–5. Role, background, market, setup.
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill('Ada E2E');
  await page.getByLabel('Handle').fill(`ada_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Payments for market traders');
  await page.getByLabel('Company name').fill('Flutterwav');
  await expect(page.getByText('Too close to a well-known brand.')).toBeVisible();
  await page.getByLabel('Company name').fill(`Mama Pay ${letters(5)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText('This is a game. Nothing here is financial, legal, or tax advice.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  // The City opens first; the dashboard is the Home tab.
  await tab(page, 'Today').click();

  // Dashboard leads with four numbers; the first day brings an early win.
  await expect(page.getByText('Monthly revenue')).toBeVisible();
  await expect(page.getByText('Runway', { exact: true })).toBeVisible();
  await expect(page.getByText(/First customer/)).toBeVisible();

  // Do some work, then advance a month.
  await tab(page, 'Company').click();
  await page.getByRole('button', { name: 'Build yourself (40h)' }).click();
  await expect(page.getByText(/40h of building logged/)).toBeVisible();
  await tab(page, 'Today').click();
  // A deploy preview keeps one world across runs, so compare with today's date.
  const date = page.locator('.topbar .topbar-date');
  const before = (await date.textContent())!;
  const settled = page.waitForResponse((r) => r.url().endsWith('/api/dev/settle'));
  await page.getByRole('button', { name: /Advance Lagos one month/ }).click();
  const res = await settled;
  expect(res.status(), await res.text()).toBe(200);
  await expect(date).toHaveText(/^Y\d+ M\d+$/);
  await expect(date).not.toHaveText(before);

  // The news digest is reachable.
  await page.getByRole('button', { name: 'News', exact: true }).click();
  await expect(page.getByText(/Lagos daily digest/)).toBeVisible();
});
