import { expect, letters, more, playAsGuest, tab, tapPlace, test } from './fixtures';

test('a founder walks the city to a bank, goes in, then visits the market', async ({ page }) => {
  await playAsGuest(page);

  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill('Tobi City');
  await page.getByLabel('Handle').fill(`tobi_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Invoices for market traders');
  await page.getByLabel('Company name').fill(`Oja Ledger ${letters(5)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  // The City is the first tab and opens by default, centred on your office.
  await expect(tab(page, 'City')).toHaveAttribute('aria-current', 'page');
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible();
  await expect(page.locator('[data-place="office"]')).toBeAttached();
  await expect(page.locator('[data-place^="stall:"]').first()).toBeAttached();

  // The city is spread out: at the default zoom only the key places are labelled.
  await expect(page.locator('[data-label="hub"]')).toBeVisible();
  await expect(page.locator('.city-label.lbl-biz').first()).toBeHidden();

  // Tap a bank across the Lagoon: it's far, so you choose how to get there, then walk in.
  await tapPlace(page, '[data-place^="lender:"]', 'walk');
  await expect(page.locator('.city-avatar')).toHaveClass(/is-walking/);
  const lobby = page.getByRole('dialog');
  await expect(lobby).toBeVisible({ timeout: 10_000 });
  // A bank lobby, with the loan officer behind the counter.
  await expect(lobby).toHaveAttribute('data-room', 'bank');
  await expect(lobby.getByRole('button', { name: /Loan officer/ })).toBeAttached();
  await more(page);
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
  await expect(market).toHaveAttribute('data-room', 'market');
  await more(page);
  await expect(market.getByText(/Every stall is a customer segment/)).toBeVisible();
  await expect(
    market.getByRole('button', { name: 'Customer discovery (20h)' }).first(),
  ).toBeVisible();

  // The bottom tabs work even with a panel open: tapping one leaves the city.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Company' }).click();
  await expect(market).toBeHidden();
  await nav.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText('Monthly revenue')).toBeVisible();
  for (const tab of ['Money', 'Me', 'City']) {
    await nav.getByRole('button', { name: tab, exact: true }).click();
    await expect(nav.getByRole('button', { name: tab, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});
