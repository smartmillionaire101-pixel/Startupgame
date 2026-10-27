import { expect, letters, signUp, playAsGuest, setupFounder, test, type Page } from './fixtures';

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

test('a brand-new founder starts at home too, with the guided first steps', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('runway.startAtHome', '1');
    // Someone else just played on this phone: a new player still starts at home.
    localStorage.setItem('runway.lastSeen.u_someone_else', String(Date.now()));
  });
  await page.goto('/');
  await signUp(page, {
    role: 'founder',
    name: 'Ada Home',
    city: 'Nairobi',
    username: `nh_${letters(8)}`,
    email: `nh-${letters()}@example.com`,
    background: 'f-consultant',
  });
  const home = page.locator('.place-scene[data-scene="home"]');
  await expect(home).toBeVisible({ timeout: 30_000 });
  // The tutorial starts in the flat: open the phone from there.
  const coach = page.locator('.coach');
  await expect(coach).toHaveAttribute('data-tutorial-step', 'phone');
  await shot(page, 'new-founder-home');
  await coach.getByRole('button', { name: 'Open my phone' }).click();
  await expect(page.getByRole('dialog', { name: 'Phone' })).toBeVisible();
});

test('a new session starts at home, and going out shows the city', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('runway.startAtHome', '1');
    // Signing up counts as coming back after a while; the quick reload below doesn't.
    if (!sessionStorage.getItem('arrivals-quick'))
      for (const k of Object.keys(localStorage))
        if (k.startsWith('runway.lastSeen')) localStorage.removeItem(k);
  });
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
  // The HUD's phone button floats over your home too.
  await page.locator('[data-phone-button]').click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(phone).toBeHidden();
  await home.getByRole('button', { name: 'Go out', exact: true }).click();
  await expect(home).toBeHidden();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  // A quick reload stays on the map.
  await page.evaluate(() => sessionStorage.setItem('arrivals-quick', '1'));
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(home).toHaveCount(0);

  // Back to a tab left in the background for an hour: at home again.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('runway.lastSeen.'))
        localStorage.setItem(k, String(Date.now() - 60 * 60_000));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(home).toBeVisible({ timeout: 15_000 });
  // Refreshing then (the "new version" banner) keeps you at home.
  await page.reload();
  await expect(home).toBeVisible({ timeout: 30_000 });
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
  await expect(arrivals.locator('.arrival-airport')).toContainText('Heathrow', {
    timeout: 20_000,
  });
  await expect(arrivals.locator('.place-title')).toContainText('Arrivals');
  // Your hotel, by name, before you go.
  await expect(arrivals.locator('.arrival-stay')).toContainText(/Guesthouse|Hotel|Grand/);
  const sheet = arrivals.locator('[data-arrival]');
  await expect(sheet).toContainText('Welcome to London');
  await expect(sheet.locator('[data-arrival-go]')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, 'arrivals-heathrow');
  await sheet.locator('[data-arrival-go="home"]').click();
  // The hotel's car takes you straight there: no map, no ride to choose.
  await expect(page.locator('[data-transfer]')).toBeVisible();
  await shot(page, 'arrivals-transfer');
  await expect(page.getByRole('dialog', { name: 'How do you want to get there?' })).toHaveCount(0);
  // The hotel: where your stay in London starts.
  await expect(arrivals).toBeHidden({ timeout: 20_000 });
  const hotel = page.locator('.place-scene[data-scene="home"]');
  await expect(hotel).toBeVisible({ timeout: 30_000 });
  // Titled with the hotel you booked.
  await expect(hotel.locator('h2').first()).toContainText(/Guesthouse|Hotel|Grand/);
  await shot(page, 'arrivals-hotel');
});
