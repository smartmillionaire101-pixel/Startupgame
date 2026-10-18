import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Where you start (player feedback): a new session opens at home, and you
 * walk out to explore the city; after a flight you're in the city's airport
 * (Arrivals, under its own name) with the way to your hotel and places worth
 * seeing. The other specs turn both off (fixtures.ts). ARRIVALS_SHOTS=<dir>
 * saves screenshots.
 */
const SHOTS = process.env.ARRIVALS_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ viewport: { width: 390, height: 844 } });

test('a new session starts at home, and going out shows the city', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('runway.startAtHome', '1'));
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Homebody ${n}`,
    handle: `home_${n}`,
    company: `Hearth ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  const home = page.locator('.place-scene[data-scene="home"]');
  await expect(home).toBeVisible({ timeout: 30_000 });
  await shot(page, 'start-at-home');
  await home.getByRole('button', { name: 'Close' }).first().click();
  await expect(home).toBeHidden();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  // Once a session: a reload stays on the map.
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(home).toHaveCount(0);
});

test('landing in London: Arrivals at Heathrow, then the way to your hotel', async ({ page }) => {
  test.slow();
  await page.addInitScript(() => localStorage.setItem('runway.arrivals', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Traveller ${n}`,
    handle: `trav_${n}`,
    company: `Roam ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  // Book London (and a hotel) in the Travel app; straight to the airport.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const london = phone.locator('[data-flight="london"]');
  await london.getByRole('button', { name: 'Book a flight to London' }).click();
  await london.locator('[data-hotel-book]').click();
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 });
  // Lagos airport says Departures, under its own name.
  await expect(page.locator('.airport-scene .place-title h2')).toContainText('Murtala Muhammed');
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await trip.getByRole('button', { name: 'Go to the gate' }).click();
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toBeVisible({ timeout: 30_000 });
  await flight
    .getByRole('button', { name: 'Skip' })
    .click({ force: true, timeout: 10_000 })
    .catch(() => undefined);
  await expect(flight).toBeHidden({ timeout: 60_000 });

  // Arrivals: Heathrow by name, welcome, the way to your hotel and places to see.
  const arrivals = page.locator('.airport-scene');
  await expect(arrivals.locator('.place-title h2')).toContainText('Heathrow', { timeout: 20_000 });
  await expect(arrivals.locator('.place-title')).toContainText('Arrivals');
  const sheet = arrivals.locator('[data-arrival]');
  await expect(sheet).toContainText('Welcome to London');
  await expect(sheet.locator('[data-arrival-go]')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, 'arrivals-heathrow');
  await sheet.locator('[data-arrival-go="home"]').click();
  // The hotel: where your stay in London starts.
  await expect(arrivals).toBeHidden({ timeout: 20_000 });
  const hotel = page.locator('.place-scene[data-scene="home"]');
  await expect(hotel).toBeVisible({ timeout: 30_000 });
  // Titled with the hotel you booked.
  await expect(hotel.locator('h2').first()).toContainText(/Guesthouse|Hotel|Grand/);
  await shot(page, 'arrivals-hotel');
});
