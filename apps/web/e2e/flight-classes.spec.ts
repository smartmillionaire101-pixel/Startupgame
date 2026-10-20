import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Player feedback: "I should choose which class I want: economy, business
 * and first class… and each one has to have different experiences." Book
 * from the Travel app: the three cabins side by side with their fares, what
 * you get and whether you can afford them; the ticket and the boarding pass
 * name the cabin; the airport's lounge and the plane's cabin are the class
 * you paid for (lie-flat business seats, first class suites with champagne
 * and a chauffeur at the other end); landing changes how you feel.
 *
 * FLIGHT_CLASS_SHOTS=<dir> saves a screenshot at every step.
 */

const SHOTS = process.env.FLIGHT_CLASS_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

/** WebGL in headless Chromium is drawn in software: generous waits. */
const SLOW = 3;
/** The flight runs this many times slower (`runway.flightPace`): time to look in the cabin. */
const PACE = 6;

type Cabin = 'economy' | 'business' | 'first';
type State = {
  view: {
    flights: {
      fareTo: Record<string, number>;
      cabinTo?: Record<string, { cabin: Cabin; price: number; affordable: boolean }[]>;
    };
    me: {
      energy: number;
      milestones?: Record<string, number>;
      flightTicket: { paid: number; cabin?: Cabin } | null;
    };
    accounts: { local: { balance: number } | null };
  };
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as State;
  });

async function start(page: Page, name: string, arrivals = false) {
  await page.addInitScript(
    ({ pace, arrivals }) => {
      try {
        if (arrivals) localStorage.setItem('runway.arrivals', '1');
        localStorage.setItem('runway.mapQuality', '3d');
        localStorage.setItem('runway.flightClock', '2026-06-15T11:00:00Z');
        localStorage.setItem('runway.flightPace', String(pace));
      } catch {
        /* storage blocked */
      }
    },
    { pace: PACE, arrivals },
  );
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Cabin ${letters(5)}`,
    idea: 'Payments for travellers',
    market: /Lagos, Nigeria/,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000 * SLOW,
  });
}

/** Book `cabin` to `city` in the Travel app; returns the trip sheet at the airport. */
async function book(page: Page, to: string, city: string, cabin: Cabin) {
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const row = phone.locator(`[data-flight="${to}"]`);
  await row.getByRole('button', { name: `Book a flight to ${city}` }).click();
  const picker = row.locator('[data-trip-picker]');
  await expect(picker).toBeVisible();
  // Three cabins side by side, each with a fare and what you get.
  for (const c of ['economy', 'business', 'first'])
    await expect(picker.locator(`[data-cabin-option="${c}"]`)).toContainText(/\d/);
  await expect(picker.locator('[data-cabin-option="first"]')).toContainText('Chauffeur on arrival');
  await expect(picker.locator('[data-cabin-option="business"]')).toContainText('Lie-flat seat');
  await picker.locator(`[data-cabin-option="${cabin}"]`).click();
  await expect(picker.locator(`[data-cabin-option="${cabin}"]`)).toHaveClass(/is-picked/);
  await picker.scrollIntoViewIfNeeded();
  await shot(page, `${cabin}-01-picker`);
  await picker.locator('[data-hotel-book]').click();
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 * SLOW });
  return trip;
}

async function board(page: Page, trip: ReturnType<Page['getByRole']>, city: string, cabin: Cabin) {
  await expect(trip.locator('[data-trip-perk="checkin"]')).toBeVisible();
  await trip.getByRole('button', { name: `Check in for ${city}` }).click();
  await trip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const security = trip.getByRole('button', { name: 'Go through security' });
  if (await security.isVisible().catch(() => false)) await security.click();
  await expect(trip.getByRole('button', { name: 'Go to the gate' })).toBeVisible({
    timeout: 4000 * SLOW,
  });
  // The lounge: business and first have one; it's drawn in the terminal above.
  await expect(page.locator(`[data-lounge="${cabin}"]`)).toBeVisible();
  await expect(trip.locator('[data-trip-perk="lounge"]')).toContainText(
    cabin === 'first' ? 'first class lounge' : 'business lounge',
  );
  await shot(page, `${cabin}-02-lounge`);
  await trip.getByRole('button', { name: 'Go to the gate' }).click();
  await expect(trip.locator('[data-trip-perk="board"]')).toBeVisible();
  // The boarding pass names the cabin.
  await expect(trip.locator(`[data-pass-cabin="${cabin}"]`)).toBeVisible();
  await trip.getByRole('button', { name: `Board for ${city}` }).click();
  const flight = page.getByRole('dialog', { name: `Flight to ${city}` });
  await expect(flight).toBeVisible({ timeout: 20_000 * SLOW });
  return flight;
}

test('business to London: lie-flat seats, the lounge, three courses and a kit', async ({
  page,
}) => {
  test.setTimeout(240_000 * PACE);
  await start(page, 'Bisi Business');
  const s0 = await state(page);
  const options = s0.view.flights.cabinTo!.london!;
  expect(options.map((c) => c.cabin)).toEqual(['economy', 'business', 'first']);
  const eco = options[0]!.price;
  const biz = options[1]!;
  // Realistic multiples, in naira.
  expect(biz.price / eco).toBeGreaterThan(3);
  expect(biz.price / eco).toBeLessThan(4);
  expect(options[2]!.price / eco).toBeGreaterThan(6);
  expect(biz.affordable).toBe(true);

  const trip = await book(page, 'london', 'London', 'business');
  await expect(trip.locator('[data-ticket]')).toBeVisible();
  const s1 = await state(page);
  expect(s1.view.me.flightTicket).toMatchObject({ cabin: 'business', paid: biz.price });

  const flight = await board(page, trip, 'London', 'business');
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 30_000 * PACE });
  const cabin = flight.locator('[data-cabin]');
  await expect(cabin).toHaveAttribute('data-cabin', 'business', { timeout: 15_000 * SLOW });
  await expect(cabin.locator('[data-cabin-service="business"]')).toContainText('lies flat');
  await expect(cabin.locator('[data-cabin-kit]')).toContainText('amenity kit');
  await page.waitForTimeout(1200 * PACE);
  await shot(page, 'business-03-cabin');
  await page.waitForTimeout(2200 * PACE);
  await shot(page, 'business-04-meal');
  await flight.locator('.fl7-skip').click();
  await expect(flight).toBeHidden({ timeout: 20_000 * SLOW });
  // Landed: the first business flight is a milestone (how you feel is in the engine's tests).
  await expect
    .poll(
      async () => (await state(page)).view.me.milestones?.['lifestyle.business-class'] ?? null,
      // The London map loading in software keeps the page busy: a slow answer.
      { timeout: 30_000 * SLOW },
    )
    .not.toBeNull();
});

test('first class to Accra: a suite, champagne, and a chauffeur waiting', async ({ page }) => {
  test.setTimeout(240_000 * PACE);
  await start(page, 'Folake First', true);
  const s0 = await state(page);
  const first = s0.view.flights.cabinTo!.accra!.find((c) => c.cabin === 'first')!;
  expect(first.affordable).toBe(true);
  const trip = await book(page, 'accra', 'Accra', 'first');
  const flight = await board(page, trip, 'Accra', 'first');
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 30_000 * PACE });
  const cabin = flight.locator('[data-cabin]');
  await expect(cabin).toHaveAttribute('data-cabin', 'first', { timeout: 15_000 * SLOW });
  await expect(cabin.locator('[data-cabin-service="first"]')).toContainText('Champagne');
  await page.waitForTimeout(1200 * PACE);
  await shot(page, 'first-03-cabin');
  await page.waitForTimeout(2200 * PACE);
  await shot(page, 'first-04-meal');
  await flight.locator('.fl7-skip').click();
  await expect(flight).toBeHidden({ timeout: 20_000 * SLOW });
  // Arrivals: the chauffeur, and the milestone.
  await expect(page.locator('[data-arrival-chauffeur]')).toBeVisible({ timeout: 20_000 * SLOW });
  await page.locator('[data-arrival-step]').getByRole('button', { name: /Exit/ }).click();
  await expect(page.locator('.arr-caption')).toContainText('chauffeur');
  await shot(page, 'first-05-arrivals');
  const s1 = await state(page);
  expect(s1.view.me.milestones?.['lifestyle.first-class']).toBeDefined();
});
