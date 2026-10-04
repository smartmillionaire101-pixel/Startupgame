import { letters, expect, test, playAsGuest } from './fixtures';

test('a banker applies for a licence in Accra, gets it, and sets pricing', async ({ page }) => {
  await playAsGuest(page);

  await page.getByRole('button', { name: /Banker/ }).click();
  await page.getByRole('button', { name: /Wealthy exited founder/ }).click();
  await page.getByRole('button', { name: /Accra, Ghana/ }).click();
  await page.getByLabel('Your name').fill('Ama E2E');
  await page.getByLabel('Handle').fill(`ama_${letters(6)}`);
  await page.getByLabel('Bank name').fill(`Adinkra Trust ${letters(5)}`);
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
    const settled = page.waitForResponse((r) => r.url().endsWith('/api/dev/settle'));
    await page.getByRole('button', { name: /Advance Accra one month/ }).click();
    const res = await settled;
    expect(res.status(), await res.text()).toBe(200);
    await expect(page.getByText(/Advanced to month \d+\./).last()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Bank' }).click();
  await expect(page.getByText(/Licensed ·/)).toBeVisible();
  await page.getByLabel('Deposit rate (%)').fill('8');
  await page.getByRole('button', { name: 'Save pricing' }).click();
  await expect(page.getByText('Pricing updated.')).toBeVisible();
});
