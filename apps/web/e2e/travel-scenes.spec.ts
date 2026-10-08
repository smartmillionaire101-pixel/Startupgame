import { setupFounder } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { expect, letters, playAsGuest, test } from './fixtures';

/**
 * Wave 7 §B: travel you experience. A taxi plays the booking card then the
 * back seat (Skip arrives), the bike rides through parallax layers, the bus
 * names the stops, the airport is busy (a six-row board, planes moving) and
 * a flight shows the cabin before you land.
 *
 * The shared fixture turns rides off ("Always skip rides"); these specs turn
 * them back on. WAVE7_SHOTS=<dir> saves screenshots of each scene.
 */

const SHOTS = process.env.WAVE7_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('runway.skipRides');
    } catch {
      /* storage blocked */
    }
  });
});

async function founder(page: Page, name: string) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `${name.split(' ')[0]} Ledger ${letters(5)}`,
    idea: 'Ledgers for traders',
    market: /Lagos, Nigeria/,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
}

/** Tap a far place on the map and pick how to get there. */
async function rideTo(page: Page, placeId: string, mode: string) {
  const el = page.locator(`[data-place="${placeId}"]`).first();
  await el.dispatchEvent('pointerdown', { pointerId: 5, clientX: 10, clientY: 10 });
  await el.dispatchEvent('pointerup', { pointerId: 5, clientX: 10, clientY: 10 });
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible();
  await chooser.locator(`[data-mode="${mode}"]`).click();
  const scene = page.locator(`.ride-scene[data-ride-mode="${mode}"]`);
  await expect(scene).toBeVisible();
  return scene;
}

/** Skip › arrives at once. */
async function skip(page: Page, scene: Locator) {
  // A busy machine can reach the end of the ride first: arriving is fine too.
  await scene
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(scene).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: 10_000 });
}

async function closeScene(page: Page) {
  await page.locator('.place-scene').getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('.place-scene')).toBeHidden();
}

const transformOf = (l: Locator) => l.evaluate((el) => el.getAttribute('transform') ?? '');

test('taxi, bike, bus, the busy airport and a flight with a cabin', async ({ page }) => {
  test.slow();
  await founder(page, 'Ada Rider');

  // Taxi: the booking card, then the back seat; the card counts down; Skip arrives.
  const taxi = await rideTo(page, 'eventhall', 'taxi');
  await expect(taxi.getByRole('status')).toContainText(/Event Hall|min/);
  await expect(taxi.locator('.taxi-booking')).toBeVisible();
  await expect(page.locator('.city-avatar')).toHaveClass(/is-riding/);
  await shot(page, 'taxi-booking');
  await expect(taxi.locator('.taxi.is-riding')).toBeAttached({ timeout: 4000 });
  await expect(taxi.locator('.ride-interior')).toBeVisible();
  await expect(taxi.locator('[data-mini-car]')).toBeAttached();
  await page.waitForTimeout(600);
  await shot(page, 'taxi-interior');
  await skip(page, taxi);
  await expect(page.locator('.place-scene[data-room]')).toBeVisible();
  await closeScene(page);

  // Bike: parallax layers slide at their own pace; the second ride offers "Always skip".
  const bike = await rideTo(page, 'airport', 'cycle');
  await expect(bike.locator('[data-parallax]')).toBeVisible();
  await expect(bike.getByLabel('Always skip rides')).toBeVisible();
  const layer = bike.locator('[data-layer$="-near"]');
  const a = await transformOf(layer);
  await page.waitForTimeout(400);
  expect(await transformOf(layer)).not.toBe(a);
  await shot(page, 'bike');
  await skip(page, bike);

  // The airport: a six-row split-flap board, planes on the move, your trip,
  // which starts at the ticket desk (no ticket yet): where do you want to go?
  const airport = page.locator('.airport-scene');
  await expect(airport).toBeVisible();
  await expect(
    airport.getByRole('list', { name: 'Where do you want to go?' }).locator('[data-dest]'),
  ).not.toHaveCount(0);
  await expect(airport.locator('.trip-step.is-now')).toContainText('Ticket');
  await expect(airport.locator('[data-board-row]')).toHaveCount(6);
  const planes = airport.locator('[data-plane]');
  expect(await planes.count()).toBeGreaterThanOrEqual(3);
  const before = await Promise.all([0, 1, 2].map((n) => transformOf(planes.nth(n))));
  await page.waitForTimeout(1200);
  const after = await Promise.all([0, 1, 2].map((n) => transformOf(planes.nth(n))));
  expect(after.some((x, n) => x !== before[n])).toBe(true);
  await shot(page, 'airport');
  await closeScene(page);

  // Bus (Lagos: the danfo): a stop ticker naming the districts on the way.
  const bus = await rideTo(page, 'eventhall', 'bus');
  const ticker = bus.locator('[data-stop-ticker]');
  await expect(ticker).toBeVisible();
  await expect(ticker.locator('li.is-next')).toHaveCount(1);
  await expect(bus.locator('.bus-interior')).toBeVisible();
  await expect(bus.getByRole('status')).toContainText('Danfo');
  await page.waitForTimeout(500);
  await shot(page, 'bus');
  await skip(page, bus);
  await closeScene(page);

  // Walk back to the airport (top-down street). The trip runs in a real
  // trip's order: choose where to go and book first, then check in for that
  // flight, security, the gate, board.
  const walk = await rideTo(page, 'airport', 'walk');
  await expect(walk.locator('[data-walk-strip]')).toBeVisible();
  await shot(page, 'walk');
  await skip(page, walk);
  const trip = page.getByRole('region', { name: 'Your trip' });
  const desk = trip.getByRole('list', { name: 'Where do you want to go?' });
  await expect(desk).toContainText(/\d\d:\d\d/);
  await expect(desk.locator('[data-dest="london"]')).toContainText('London');
  // No check-in before there's a ticket.
  await expect(trip.getByRole('button', { name: /Check in/ })).toBeDisabled();
  await shot(page, 'airport-ticket-desk');
  await desk.getByRole('button', { name: 'Book a flight to London' }).click();
  await expect(trip.locator('[data-ticket="london"]')).toContainText('London');
  await expect(trip.locator('.trip-step.is-now')).toContainText('Check in');
  await shot(page, 'airport-check-in');
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  const pass = trip.locator('[data-trip-anim="checkin"] [data-boarding-pass="london"]');
  await expect(pass).toBeVisible();
  await expect(pass).toContainText('Lagos → London');
  await trip.getByRole('button', { name: 'Skip' }).click();
  // Checked in: the boarding pass (to London) stays in hand for security.
  await expect(trip.getByRole('button', { name: 'Go through security' })).toBeVisible();
  await expect(trip.locator('[data-boarding-pass="london"]')).toContainText('Lagos → London');
  await shot(page, 'airport-boarding-pass');
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await expect(trip.getByRole('button', { name: 'Go to the gate' })).toBeVisible({
    timeout: 4000,
  });
  await trip.getByRole('button', { name: 'Go to the gate' }).click();
  await expect(trip.locator('[data-boarding-pass="london"]')).toBeVisible();
  await trip.getByRole('button', { name: 'Board for London' }).click();

  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toHaveAttribute('data-flight-phase', 'takeoff');
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 6000 });
  await expect(flight.locator('[data-cabin]')).toBeVisible();
  await expect(flight.locator('[data-flight-plane]')).toBeAttached();
  await flight.getByRole('button', { name: 'Work on laptop' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'cabin');
  await flight.getByRole('button', { name: 'Skip' }).click();
  await expect(flight).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible();
});

test('reduced motion: a bird’s-eye chase on the map, still skippable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await founder(page, 'Bola Calm');
  const taxi = await rideTo(page, 'eventhall', 'taxi');
  await expect(taxi).toHaveAttribute('data-ride-chase', '1');
  await expect(taxi.locator('.ride-stage')).toHaveCount(0);
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  await skip(page, taxi);
});

test('the Travel app books first; the airport then checks you in for that flight', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await founder(page, 'Chidi Booker');
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const london = phone.locator('[data-flight="london"]');
  await expect(london).toContainText(/\d\d:\d\d/);
  await shot(page, 'phone-travel');
  await london.getByRole('button', { name: 'Book a flight to London' }).click();

  // At the airport the ticket is already booked: the first step is check-in for London.
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 });
  await expect(trip.locator('.trip-step.is-now')).toContainText('Check in');
  await expect(trip.locator('[data-ticket="london"]')).toContainText('Lagos → London');
  // Reduced motion: each step is done at once.
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await expect(trip.locator('[data-boarding-pass="london"]')).toContainText('London');
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

  // The ticket was used: the Travel app has nothing booked any more.
  await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="travel"]').click();
  await expect(phone.locator('[data-flight]').first()).toBeVisible();
  await expect(phone.locator('[data-ticket]')).toHaveCount(0);
});
