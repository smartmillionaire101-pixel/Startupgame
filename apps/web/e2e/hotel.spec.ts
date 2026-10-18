import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Player feedback: booking a flight abroad, you book a hotel too, and what
 * you can stay in depends on your money. Three hotels with prices; pick
 * one; the ticket names it; flight + hotel come out of your account.
 */

type State = {
  view: {
    flights?: { fareTo: Record<string, number> };
    me: {
      destinations: {
        id: string;
        hotels?: { tier: string; name: string; price: number; affordable: boolean }[];
      }[];
      flightTicket: { paid: number; hotel?: { tier: string; name: string; paid: number } } | null;
    };
    accounts: { local: { balance: number } | null };
  };
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as State;
  });

test('book London from the Travel app with a hotel: the ticket names it, money goes on both', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Hana Hotelier',
    handle: `hana_${letters(6)}`,
    company: `Hana Ledger ${letters(5)}`,
    idea: 'Ledgers for traders',
    market: /Lagos, Nigeria/,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  const s0 = await state(page);
  const hotels = s0.view.me.destinations.find((d) => d.id === 'london')!.hotels!;
  expect(hotels.map((h) => h.tier)).toEqual(['budget', 'business', 'luxury']);
  const fare = s0.view.flights!.fareTo.london!;
  const budget = hotels[0]!;
  expect(budget.affordable).toBe(true);

  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const london = phone.locator('[data-flight="london"]');
  await london.getByRole('button', { name: 'Book a flight to London' }).click();

  // Three hotels, each with its price, and a choice already made.
  const picker = london.locator('[data-hotel-picker]');
  await expect(picker).toBeVisible();
  for (const tier of ['budget', 'business', 'luxury'])
    await expect(picker.locator(`[data-hotel="${tier}"]`)).toContainText(/\d/);
  await expect(picker.locator('[data-hotel="budget"]')).toContainText(budget.name);
  await expect(picker.getByRole('radio', { checked: true })).toHaveCount(1);

  await picker.locator('[data-hotel="budget"]').click();
  await expect(picker.locator('[data-hotel-book]')).toContainText('Book flight + hotel');
  await picker.locator('[data-hotel-book]').click();
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // At the airport: the ticket names the hotel.
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 });
  await expect(trip.locator('[data-ticket-hotel="budget"]')).toContainText(`Hotel: ${budget.name}`);

  // The server charged the fare and the hotel.
  const s1 = await state(page);
  expect(s1.view.me.flightTicket?.hotel).toMatchObject({ tier: 'budget', name: budget.name });
  expect(s1.view.accounts.local!.balance).toBe(
    s0.view.accounts.local!.balance - fare - budget.price,
  );

  // The boarding pass carries it too.
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await expect(trip.locator('[data-pass-hotel="budget"]')).toContainText(budget.name);
});
