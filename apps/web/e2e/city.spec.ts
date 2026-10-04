import { expect, test } from './fixtures';

test('a founder walks the city to a bank, goes in, then visits the market', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Mobile number').fill(`+23481${Date.now().toString().slice(-8)}`);
  await page.getByLabel('Date of birth').fill('1993-06-21');
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.getByText(/your code is \d{6}/i).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();

  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByLabel('Your name').fill('Tobi City');
  await page.getByLabel('Handle').fill(`tobi_${Date.now().toString().slice(-6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Invoices for market traders');
  await page.getByLabel('Company name').fill(`Oja Ledger ${Date.now().toString().slice(-4)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  // The City is the first tab and opens by default, centred on your office.
  await expect(page.getByRole('button', { name: 'City' })).toHaveAttribute('aria-current', 'page');
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible();
  await expect(page.locator('[data-place="office"]')).toBeAttached();
  await expect(page.locator('[data-place^="stall:"]').first()).toBeAttached();

  // Tap a bank on Finance Row: the avatar walks to its door and goes in.
  const bank = page.locator('[data-place^="lender:"]').first();
  await bank.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await bank.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await expect(page.locator('.city-avatar')).toHaveClass(/is-walking/);
  const lobby = page.getByRole('dialog');
  await expect(lobby).toBeVisible({ timeout: 8000 });
  await expect(lobby.getByText('Loan officer')).toBeVisible();
  await expect(lobby.getByText(/Working capital|For companies|For founders/).first()).toBeVisible();
  await lobby.getByRole('button', { name: 'Close' }).click();
  await expect(lobby).toBeHidden();

  // Then walk to the market from the Places list.
  await page.getByRole('button', { name: /Places/ }).click();
  const places = page.getByRole('dialog', { name: 'Places' });
  await places
    .locator('section', { has: page.getByRole('heading', { name: 'The Market' }) })
    .getByRole('button')
    .first()
    .click();
  const market = page.getByRole('dialog');
  await expect(market).toBeVisible({ timeout: 8000 });
  await expect(market.getByText(/Every stall is a customer segment/)).toBeVisible();
  await expect(
    market.getByRole('button', { name: 'Customer discovery (20h)' }).first(),
  ).toBeVisible();

  // The classic dashboard is still one tap away.
  await market.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('Monthly revenue')).toBeVisible();
});
