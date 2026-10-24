import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Player feedback: booking a flight abroad, you book a hotel too, and what
 * you can stay in depends on your money. The feedback round ("More hotel
 * options in different parts of the city"): the Travel app's Hotels tab
 * lists a city's named hotels by district (a map with price pins, area and
 * price filters); book one and the flight there comes with it; the ticket
 * names it; flight + stay come out of your account.
 */

type Named = {
  id: string;
  name: string;
  district: string;
  area: string;
  stars: number;
  tier: string;
  night: number;
  price: number;
  affordable: boolean;
};
type State = {
  view: {
    flights?: { fareTo: Record<string, number> };
    me: {
      destinations: { id: string; hotelList?: Named[] }[];
      flightTicket: {
        paid: number;
        hotel?: { tier: string; name: string; paid: number; id?: string };
      } | null;
    };
    accounts: { local: { balance: number } | null };
  };
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as State;
  });

test('book a named London hotel from the Travel app’s hotel list: the ticket names it, money goes on both', async ({
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
  const list = s0.view.me.destinations.find((d) => d.id === 'london')!.hotelList!;
  // Many hotels, in different parts of the city.
  expect(list.length).toBeGreaterThanOrEqual(6);
  expect(new Set(list.map((h) => h.district)).size).toBeGreaterThanOrEqual(4);
  const fare = s0.view.flights!.fareTo.london!;
  // The cheapest one you can afford.
  const pick = list.filter((h) => h.affordable).sort((a, b) => a.price - b.price)[0]!;
  expect(pick).toBeTruthy();

  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  await phone.getByRole('radio', { name: 'Hotels' }).click();
  await phone.locator('[data-hotel-city="london"]').click();
  const hotels = phone.locator('[data-hotel-list="london"]');
  await expect(hotels).toBeVisible();
  // A map with a price pin per hotel, and a card each.
  await expect(hotels.locator('[data-hotel-map] [data-hotel-pin]')).toHaveCount(list.length);
  await expect(hotels.locator('[data-hotel-id]')).toHaveCount(list.length);

  // The area filter: only that district's hotels (and pins).
  await hotels.locator(`[data-hotel-area="${pick.district}"]`).click();
  const inArea = list.filter((h) => h.district === pick.district).length;
  await expect(hotels.locator('[data-hotel-id]')).toHaveCount(inArea);
  await expect(hotels.locator('[data-hotel-pin]')).toHaveCount(inArea);
  const card = hotels.locator(`[data-hotel-id="${pick.id}"]`);
  await expect(card).toContainText(pick.name);
  await expect(card).toContainText(pick.area);
  await expect(card).toContainText('a night');

  await card.getByRole('button', { name: `Book ${pick.name}` }).click();
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // At the airport: the ticket names the hotel.
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 });
  await expect(trip.locator(`[data-ticket-hotel="${pick.tier}"]`)).toContainText(
    `Hotel: ${pick.name}`,
  );

  // The server charged the fare and the stay; the room tier is the hotel's.
  const s1 = await state(page);
  expect(s1.view.me.flightTicket?.hotel).toMatchObject({
    id: pick.id,
    tier: pick.tier,
    name: pick.name,
    paid: pick.price,
  });
  expect(s1.view.accounts.local!.balance).toBe(s0.view.accounts.local!.balance - fare - pick.price);

  // The boarding pass carries it too.
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await expect(trip.locator(`[data-pass-hotel="${pick.tier}"]`)).toContainText(pick.name);
});
