import { expect, test } from '@playwright/test';

test('a banker applies for a licence in Accra, gets it, and sets pricing', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Mobile number').fill(`+23324${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Date of birth').fill('1979-03-14');
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.getByText(/Dev mode: your code is \d{6}/).textContent())!.match(
    /\d{6}/,
  )![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();

  await page.getByRole('button', { name: /Banker/ }).click();
  await page.getByRole('button', { name: /Wealthy exited founder/ }).click();
  await page.getByRole('button', { name: /Accra, Ghana/ }).click();
  await page.getByLabel('Your name').fill('Ama E2E');
  await page.getByLabel('Handle').fill(`ama_${Date.now().toString().slice(-5)}`);
  await page.getByLabel('Bank name').fill(`Adinkra Trust ${Date.now().toString().slice(-4)}`);
  await expect(page.getByText('Available in Accra')).toBeVisible();
  await page.getByRole('button', { name: /Microfinance bank/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/applies for a licence in Accra/)).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  await page.getByRole('button', { name: 'Bank' }).click();
  await expect(page.getByText('Applying')).toBeVisible();

  // Two game months later the central bank decides.
  await page.getByRole('button', { name: 'Home' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Advance Accra one month/ }).click();
    await expect(page.getByText(`Advanced to month ${i + 1}.`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Bank' }).click();
  await expect(page.getByText(/Licensed ·/)).toBeVisible();
  await page.getByLabel('Deposit rate (%)').fill('8');
  await page.getByRole('button', { name: 'Save pricing' }).click();
  await expect(page.getByText('Pricing updated.')).toBeVisible();
});
