import { expect, test } from '@playwright/test';

test('a founder signs up, onboards in under two minutes, and plays a month', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build, invest and grow.' })).toBeVisible();

  // 1. Sign up with phone verification and an 18+ check.
  await page.getByLabel('Mobile number').fill(`+23480${Date.now().toString().slice(-8)}`);
  await page.getByLabel('Date of birth').fill('1994-03-12');
  await page.getByRole('button', { name: 'Send code' }).click();
  const hint = page.getByText(/your code is \d{6}/i);
  await expect(hint).toBeVisible();
  const code = (await hint.textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();

  // 2–5. Role, background, market, setup.
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByLabel('Your name').fill('Ada E2E');
  await page.getByLabel('Handle').fill(`ada_${Date.now().toString().slice(-6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Payments for market traders');
  await page.getByLabel('Company name').fill('Flutterwav');
  await expect(page.getByText('Too close to a well-known brand.')).toBeVisible();
  await page.getByLabel('Company name').fill(`Mama Pay ${Date.now().toString().slice(-4)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText('This is a game. Nothing here is financial, legal, or tax advice.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  // Dashboard leads with four numbers; the first day brings an early win.
  await expect(page.getByText('Monthly revenue')).toBeVisible();
  await expect(page.getByText('Runway', { exact: true })).toBeVisible();
  await expect(page.getByText(/First customer/)).toBeVisible();

  // Do some work, then advance a month.
  await page.getByRole('button', { name: 'Company' }).click();
  await page.getByRole('button', { name: 'Build yourself (40h)' }).click();
  await expect(page.getByText(/40h of building logged/)).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: /Advance Lagos one month/ }).click();
  await expect(page.getByText('Year 1, Month 2')).toBeVisible();

  // The news digest is reachable.
  await page.getByRole('button', { name: 'News' }).click();
  await expect(page.getByText(/Lagos daily digest/)).toBeVisible();
});
