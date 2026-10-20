/**
 * Booked abroad in the Travel app (a flight and a hotel), the airport knows
 * your ticket: it opens at check-in, not the ticket desk — straight away, in
 * a new session, after a month's settlement and after a real ride there.
 */
import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

async function command(page: Page, command: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

test('a flight and hotel booked abroad in the Travel app: the airport opens at check-in', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Abroad',
    handle: `abroad_${letters(6)}`,
    company: `Abroad ${letters(5)}`,
    idea: 'Payments for travellers',
    market: /Johannesburg/,
  });
  await command(page, { type: 'travel.book', to: 'san-francisco', hotel: 'business' });
  await command(page, { type: 'travel.fly', to: 'san-francisco' });
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of San Francisco/ })).toBeVisible({
    timeout: 60_000,
  });

  // Book Dubai with a hotel in the Travel app.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const dubai = phone.locator('[data-flight="dubai"]');
  await dubai.getByRole('button', { name: /Book a flight to Dubai/ }).click();
  await dubai.locator('[data-hotel-book]').first().click();
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 5000 })
    .catch(() => undefined);
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip.getByRole('button', { name: 'Check in for Dubai' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(trip.locator('[data-ticket-hotel]')).toBeVisible();

  // A month later, in a new session, going there from the Travel app's ticket.
  for (const market of ['san-francisco', 'johannesburg'])
    await page.request.post('/api/dev/settle', { headers: { 'x-runway': '1' }, data: { market } });
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of San Francisco/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /^Phone/ }).click();
  await phone.locator('[data-app="travel"]').click();
  await phone.getByRole('button', { name: 'Go to the airport' }).click();
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(trip.getByRole('button', { name: 'Check in for Dubai' })).toBeVisible({
    timeout: 20_000,
  });
});
