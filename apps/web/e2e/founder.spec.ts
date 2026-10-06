import { expect, letters, tab, test } from './fixtures';

test('a founder signs up, onboards in under two minutes, and plays a month', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build, invest and grow.' })).toBeVisible();

  await expect(page.getByRole('textbox')).toHaveCount(2);
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await page.getByLabel('Username', { exact: true }).fill(`ada_${letters(6)}`);
  await page.getByLabel('Email', { exact: true }).fill(`ada-${letters()}@example.com`);
  await page.getByLabel('Join as').selectOption('founder');
  await page.getByRole('button', { name: 'Play now' }).click();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  await tab(page, 'Me').click();
  await page.getByLabel('Your name').fill('Ada E2E');
  await page.getByLabel('You are', { exact: true }).selectOption('female');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await page.getByLabel('Idea in one line').fill('Payments for market traders');
  await page.getByLabel('Company name').fill('Flutterwav');
  await expect(page.getByText('Too close to a well-known brand.')).toBeVisible();
  await page.getByLabel('Company name').fill(`Mama Pay ${letters(5)}`);
  await page.getByLabel('Industry', { exact: true }).selectOption('fintech');
  await page.getByRole('button', { name: 'Start the company' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your business' })).toHaveCount(0);

  // The City opens first; the dashboard is the Home tab.
  await tab(page, 'Today').click();

  // Dashboard leads with four numbers; the first day brings an early win.
  await expect(page.getByText('Monthly revenue')).toBeVisible();
  await expect(page.getByText('Runway', { exact: true })).toBeVisible();

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
