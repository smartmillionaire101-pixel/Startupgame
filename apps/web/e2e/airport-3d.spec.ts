import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * The airport in 3D (the default quality; the other specs play Lite): the
 * terminal is a WebGL scene with people in it at every step (the ticket
 * desk, check-in, security, the gate), the flight's cabin is full of seated
 * passengers, Arrivals is a 3D hall (passport control, baggage reclaim, the
 * drivers with their name boards), and the hotel transfer is a 3D ride. The
 * trip's buttons and words stay the same. No page errors on the way.
 * AIRPORT3D_SHOTS=<dir> saves screenshots (runway.hq: full quality on
 * software WebGL).
 */
const SHOTS = process.env.AIRPORT3D_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

/** The terminal's canvas has drawn, with at least `min` people in the zone. */
async function terminalShows(page: Page, zone: string | RegExp, min: number) {
  const canvas = page.locator('canvas[data-terminal-3d]');
  await expect(canvas).toHaveAttribute('data-ready', 'yes', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-zone', zone, { timeout: 20_000 });
  await expect(canvas).toHaveAttribute('data-crowd', 'ready', { timeout: 60_000 });
  const n = Number(await canvas.getAttribute('data-people'));
  expect(n).toBeGreaterThanOrEqual(min);
}

test('the airport, the cabin, arrivals and the hotel ride in 3D, with people', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('runway.mapQuality', '3d');
    localStorage.setItem('runway.arrivals', '1');
    if (localStorage.getItem('e2e.hq') !== '0') localStorage.setItem('runway.hq', '1');
  });
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Flyer ${n}`,
    handle: `fly_${n}`,
    company: `Jet ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 90_000,
  });

  // The ticket desk: the departures board over the 3D hall.
  await tapPlace(page, '[data-place="airport"]', 'skip');
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.airport-scene [data-board-row]')).not.toHaveCount(0);
  await terminalShows(page, 'ticket', 8);
  await page.waitForTimeout(1500);
  await shot(page, '01-airport-ticket-desk-3d');
  const desk = trip.getByRole('list', { name: 'Where do you want to go?' });
  await desk.getByRole('button', { name: 'Book a flight to London' }).click();
  await desk.locator('[data-hotel-book]').click();
  await expect(trip.locator('[data-ticket="london"]')).toContainText('London');

  // Check-in: the agents at their desks, the queue; then your bag on the belt.
  await terminalShows(page, 'checkin', 8);
  await page.waitForTimeout(1200);
  await shot(page, '02-airport-check-in-3d');
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await expect(trip.locator('[data-boarding-pass="london"]').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, '03-airport-checking-in-3d');
  await trip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // Security (through the arch), the seats by the gate (economy), then boarding.
  await terminalShows(page, 'security', 6);
  await page.waitForTimeout(2600);
  await shot(page, '05-airport-step-Security-3d');
  // (Skipping the check-in moment may already have walked you through.)
  await trip
    .getByRole('button', { name: 'Go through security' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot(page, '05-airport-through-the-arch-3d');
  await terminalShows(page, 'gate', 10);
  await page.waitForTimeout(3000);
  await shot(page, '05-airport-step-Waitingarea-3d');
  await trip.getByRole('button', { name: 'Go to the gate' }).click({ timeout: 20_000 });
  await terminalShows(page, 'board', 8);
  const board = trip.getByRole('button', { name: 'Board for London' });
  await expect(board).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  await shot(page, '06-airport-gate-3d');
  await shot(page, '05-airport-step-Boarding-3d');
  await board.click();

  // The flight: take-off, then the cabin with its passengers.
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await shot(page, '07-flight-takeoff-3d');
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 60_000 });
  await expect(flight.locator('[data-cabin]')).toBeVisible();
  const view = flight.locator('[data-passengers]');
  await expect
    .poll(async () => Number((await view.first().getAttribute('data-passengers')) ?? 0), {
      timeout: 60_000,
      intervals: [100],
    })
    .toBeGreaterThan(20);
  await shot(page, '08-flight-cruise-3d');
  await flight
    .getByRole('button', { name: 'Skip' })
    .click({ force: true, timeout: 10_000 })
    .catch(() => undefined);
  await expect(flight).toBeHidden({ timeout: 90_000 });

  // Arrivals in 3D: passport control, baggage reclaim, the hall with your name board.
  const arrivals = page.locator('.airport-scene');
  await expect(arrivals.locator('[data-arrival]')).toBeVisible({ timeout: 30_000 });
  await terminalShows(page, 'passport', 8);
  await page.waitForTimeout(1500);
  await shot(page, '10-arrivals-passport-3d');
  await arrivals.locator('.arr-step').nth(1).click();
  await terminalShows(page, 'baggage', 6);
  await page.waitForTimeout(2600);
  await shot(page, '11-arrivals-baggage-3d');
  await arrivals.locator('.arr-step').nth(2).click();
  await terminalShows(page, 'hall', 8);
  await expect(arrivals.locator('.arr-your-sign')).toContainText(/Guesthouse|Hotel|Grand|Inn/);
  await page.waitForTimeout(2600);
  await shot(page, '12-arrivals-hall-driver-board-3d');

  // The hotel's car: a 3D ride with the words over it.
  await arrivals.locator('[data-arrival-go="home"]').click();
  const ride = page.locator('[data-transfer]');
  await expect(ride).toBeVisible();
  await expect(ride.locator('canvas[data-transfer-3d]')).toBeAttached();
  await page.waitForTimeout(700);
  await shot(page, '13-hotel-transfer-3d');
  await expect(page.locator('.place-scene[data-scene="home"]')).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
