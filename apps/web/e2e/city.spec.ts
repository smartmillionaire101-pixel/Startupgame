import { letters, expect, test, playAsGuest } from './fixtures';

test('a founder walks the city to a bank, goes in, then visits the market', async ({ page }) => {
  await playAsGuest(page);

  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByLabel('Your name').fill('Tobi City');
  await page.getByLabel('Handle').fill(`tobi_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Invoices for market traders');
  await page.getByLabel('Company name').fill(`Oja Ledger ${letters(5)}`);
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
  // Lagos's stalls are in Balogun: the list groups places by the city's districts.
  await expect(places.getByRole('heading', { name: 'Balogun' })).toBeVisible();
  await places.locator('[data-kind="stall"]').first().click();
  const market = page.getByRole('dialog');
  await expect(market).toBeVisible({ timeout: 8000 });
  await expect(market.getByText(/Every stall is a customer segment/)).toBeVisible();
  await expect(
    market.getByRole('button', { name: 'Customer discovery (20h)' }).first(),
  ).toBeVisible();

  // The bottom tabs work even with a panel open: tapping one leaves the city.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Company' }).click();
  await expect(market).toBeHidden();
  await nav.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('Monthly revenue')).toBeVisible();
  for (const tab of ['Money', 'News', 'Me', 'City']) {
    await nav.getByRole('button', { name: tab, exact: true }).click();
    await expect(nav.getByRole('button', { name: tab, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});
