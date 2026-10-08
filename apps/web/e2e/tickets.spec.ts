import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Wave 12 §D: fares are charged when booked. Booking in the Travel app takes
 * the fare at once and the ticket lives on the server (`view.ticket`, not
 * this device); cancelling before departure refunds it minus a small fee;
 * booking again at the airport desk and boarding doesn't charge a second time.
 */

test.use({ viewport: { width: 390, height: 844 } });

type State = {
  view: {
    accounts: { local: { balance: number } | null };
    flights: { fareTo: Record<string, number> };
    ticket: { to: string; fare: number; refund: number; fee: number; status: string } | null;
  };
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as State;
  });
const balance = async (page: Page) => (await state(page)).view.accounts.local?.balance ?? 0;

test('a fare is charged at booking, refunded less a fee on cancel, and not charged again at boarding', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Kemi Fares',
    handle: `kemi_${letters(6)}`,
    company: `Kemi Ledger ${letters(5)}`,
    idea: 'Ledgers for traders',
    market: /Lagos, Nigeria/,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  const s0 = await state(page);
  const fare = s0.view.flights.fareTo.london!;
  expect(fare).toBeGreaterThan(0);
  expect(s0.view.ticket).toBeNull();
  const b0 = s0.view.accounts.local!.balance;

  // Book in the Travel app: charged now.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  await phone
    .locator('[data-flight="london"]')
    .getByRole('button', { name: 'Book a flight to London' })
    .click();
  await expect(page.getByText(/Booked: .* charged\./)).toBeVisible();
  const s1 = await state(page);
  expect(s1.view.accounts.local!.balance).toBe(b0 - fare);
  expect(s1.view.ticket).toMatchObject({ to: 'london', fare, status: 'valid' });

  // The airport shows the paid ticket; cancel it from the trip sheet.
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 });
  await expect(trip.locator('[data-ticket="london"]')).toContainText('Paid');
  await trip.getByRole('button', { name: 'Cancel your ticket to London' }).click();
  await expect(page.getByText(/Ticket cancelled: .* refunded\./)).toBeVisible();
  const s2 = await state(page);
  expect(s2.view.ticket).toBeNull();
  const fee = s1.view.ticket!.fee;
  expect(fee).toBeGreaterThan(0);
  expect(s2.view.accounts.local!.balance).toBe(b0 - fee);

  // Book again at the ticket desk, then check in and board: no second charge.
  const desk = trip.getByRole('list', { name: 'Where do you want to go?' });
  await expect(desk).toBeVisible();
  await desk.getByRole('button', { name: 'Book a flight to London' }).click();
  await expect(trip.locator('[data-ticket="london"]')).toContainText('London');
  const paid = await balance(page);
  expect(paid).toBe(b0 - fee - fare);
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await trip.getByRole('button', { name: 'Go to the gate' }).click();
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toBeVisible();
  await flight
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(flight).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible();
  const s3 = await state(page);
  expect(s3.view.accounts.local!.balance).toBe(paid);
  expect(s3.view.ticket).toBeNull();
});
