import type { Locator, Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupPlayer, tab, test } from './fixtures';

/**
 * Player feedback: "When I book first class travel the return is always
 * economy. I should be able to book both journeys and that should stay
 * consistent", and "the first class just shows a private seat: show how it
 * is in flight, and a first-class lounge in the airport for waiting".
 *
 * Book first class to London and back in the Travel app (both legs on the
 * ticket, each charged), wait in the first class lounge (a meal, champagne,
 * a shower, until the flight is called), fly in the suite (the doors, the
 * meal served course by course, turndown into a bed), land; then fly home on
 * the return ticket: first class again, the lounge again, nothing charged.
 *
 * FIRST_CLASS_SHOTS=<dir> saves screenshots along the way.
 */

const SHOTS = process.env.FIRST_CLASS_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/firstclass-${name}.png` });
};

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

/** WebGL in headless Chromium is drawn in software: generous waits. */
const SLOW = 3;

type Cabin = 'economy' | 'business' | 'first';
type State = {
  view: {
    flights: {
      cabinTo?: Record<string, { cabin: Cabin; price: number }[]>;
      returnTo?: Record<string, { cabin: Cabin; price: number }[]>;
      heldReturn?: { cabin: Cabin; paid: number } | null;
      lounge?: { cabin: Cabin; done: string[] } | null;
      inflight?: { cabin: Cabin; done: string[] } | null;
    };
    me: {
      energy: number;
      needs: { hunger: number; hygiene: number; fun: number; social: number };
      flightTicket: {
        paid: number;
        cabin?: Cabin;
        prepaid?: boolean;
        return?: { cabin: Cabin; paid: number };
        hotel?: { paid: number };
      } | null;
      location: { market: string } | null;
    };
    accounts: { local: { balance: number } | null };
  };
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as State;
  });

async function openTravel(page: Page) {
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  return phone;
}

/** Arrive at the airport after booking (skip the ride there). */
async function toAirport(page: Page) {
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 4000 })
    .catch(() => undefined);
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 * SLOW });
  return trip;
}

/** Check in and go through security: the lounge. */
async function toLounge(page: Page, trip: Locator, city: string) {
  await trip.getByRole('button', { name: `Check in for ${city}` }).click();
  await trip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const security = trip.getByRole('button', { name: 'Go through security' });
  await expect(security).toBeVisible({ timeout: 5000 * SLOW });
  await security.click();
  await trip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const lounge = page.locator('.lounge-scene[data-lounge="first"]');
  await expect(lounge).toBeVisible({ timeout: 5000 * SLOW });
  await expect(lounge).toHaveAttribute('data-lounge-ready', 'yes', { timeout: 60_000 * SLOW });
  return lounge;
}

test('first class to London and back: both legs first, the lounge, the suite', async ({ page }) => {
  test.setTimeout(900_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
      localStorage.setItem('runway.flightClock', '2026-06-15T11:00:00Z');
    } catch {
      /* storage blocked */
    }
  });
  await playAsGuest(page);
  // An ex-banker turned investor: savings enough for first class both ways.
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Folake First',
    handle: `folake_${letters(6)}`,
    role: 'investor',
    backgroundId: 'i-banker',
    market: 'lagos',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000 * SLOW,
  });

  // 1. Book: first class out, and the return (first, like the way out).
  const s0 = await state(page);
  const out = s0.view.flights.cabinTo!.london!.find((c) => c.cabin === 'first')!.price;
  const back = s0.view.flights.returnTo!.london!.find((c) => c.cabin === 'first')!.price;
  const phone = await openTravel(page);
  const row = phone.locator('[data-flight="london"]');
  await row.getByRole('button', { name: 'Book a flight to London' }).click();
  const picker = row.locator('[data-trip-picker]');
  await picker.locator('[data-cabin-option="first"]').click();
  await expect(picker.locator('[data-trip-kind="return"]')).toHaveClass(/is-picked/);
  // The way home follows the way out: first.
  await expect(picker.locator('[data-trip-back]')).toHaveAttribute('data-trip-back', 'first');
  await expect(picker.locator('[data-return-option="first"]')).toHaveClass(/is-picked/);
  await picker.locator('[data-hotel="business"]').click();
  await picker.locator('[data-hotel-book]').click();
  const trip = await toAirport(page);
  const s1 = await state(page);
  const ticket = s1.view.me.flightTicket!;
  expect(ticket).toMatchObject({
    cabin: 'first',
    paid: out,
    return: { cabin: 'first', paid: back },
  });
  // Both legs charged (and the hotel), each its own payment.
  expect(s1.view.accounts.local!.balance).toBe(
    s0.view.accounts.local!.balance - out - back - (ticket.hotel?.paid ?? 0),
  );
  // The ticket shows both legs, first both ways.
  const legs = trip.locator('[data-ticket-legs]');
  await expect(legs.locator('[data-ticket-leg="out"]')).toHaveAttribute('data-leg-cabin', 'first');
  await expect(legs.locator('[data-ticket-leg="return"]')).toHaveAttribute(
    'data-leg-cabin',
    'first',
  );
  await expect(legs).toContainText('Return: London → Lagos');
  await legs.scrollIntoViewIfNeeded();
  await shot(page, 'ticket');

  // 2. The first class lounge: a meal, champagne, a shower; then the flight is called.
  const lounge = await toLounge(page, trip, 'London');
  const before = (await state(page)).view.me;
  const panel = trip.locator('[data-lounge-panel="first"]');
  for (const act of ['dine', 'drink', 'shower']) {
    await panel.locator(`[data-lounge-act="${act}"]`).click();
    await expect(panel.locator(`[data-lounge-result="${act}"]`)).toBeVisible({
      timeout: 10_000 * SLOW,
    });
    await expect(lounge).toHaveAttribute('data-lounge-spot', act);
  }
  const after = (await state(page)).view.me;
  expect(after.needs.hunger).toBeGreaterThan(before.needs.hunger);
  expect(after.needs.hygiene).toBeGreaterThan(before.needs.hygiene);
  await expect(lounge).toHaveAttribute('data-lounge-called', 'yes');
  await expect(lounge.locator('[data-lounge-call]')).toContainText('London is now boarding');
  await page.waitForTimeout(2500);
  await shot(page, 'lounge');
  await panel.locator('[data-lounge-board]').click();
  await expect(trip.locator('[data-pass-cabin="first"]')).toBeVisible();
  await trip.getByRole('button', { name: 'Board for London' }).click();

  // 3. The suite: doors, the meal served course by course, turndown into a bed.
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 60_000 * SLOW });
  const suite = flight.locator('.suite-flight[data-cabin="first"]');
  await expect(suite).toBeVisible();
  await expect(suite).toHaveAttribute('data-suite-ready', 'yes', { timeout: 60_000 * SLOW });
  await expect(suite.locator('[data-cabin-service="first"]')).toContainText('Champagne');
  await expect(suite.locator('[data-suite-crew]')).toContainText('pyjamas');
  // The flight is confirmed: the acts are live.
  await expect
    .poll(async () => (await state(page)).view.flights.inflight?.cabin ?? null, {
      timeout: 30_000 * SLOW,
    })
    .toBe('first');
  await suite.locator('[data-suite-door-toggle]').click();
  await expect(suite).toHaveAttribute('data-suite-doors', 'closed');
  await page.waitForTimeout(2500);
  await shot(page, 'suite');
  await suite.locator('[data-suite-door-toggle]').click();
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'meal');
  await suite.locator('[data-inflight-act="dine"]').click();
  await expect(suite.locator('[data-inflight-result="dine"]')).toBeVisible({
    timeout: 10_000 * SLOW,
  });
  await suite.locator('[data-next-course]').click();
  await suite.locator('[data-next-course]').click();
  await expect(suite.locator('[data-course="main"]')).toHaveAttribute('data-served', 'yes');
  await page.waitForTimeout(2500);
  await shot(page, 'meal');
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'night');
  await suite.locator('[data-inflight-act="sleep"]').click();
  await expect(suite.locator('[data-inflight-result="sleep"]')).toBeVisible({
    timeout: 10_000 * SLOW,
  });
  await expect(suite).toHaveAttribute('data-suite-doors', 'closed');
  await page.waitForTimeout(4000);
  await shot(page, 'bed');
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'arrival');
  await expect(suite.locator('[data-flight-summary]')).toContainText('Energy');
  const flown = (await state(page)).view.flights.inflight!;
  expect(flown.done).toEqual(['dine', 'sleep']);
  await suite.locator('[data-suite-land]').click();
  await flight.locator('.fl7-skip').click();
  await expect(flight).toBeHidden({ timeout: 30_000 * SLOW });
  await expect
    .poll(async () => (await state(page)).view.me.location?.market ?? null, {
      timeout: 30_000 * SLOW,
    })
    .toBe('london');
  const held = (await state(page)).view.flights.heldReturn;
  expect(held).toEqual({ cabin: 'first', paid: back });

  // 4. Home on the return ticket: first class, offered first, nothing charged.
  const s2 = await state(page);
  const phone2 = await openTravel(page);
  const home = phone2.locator('[data-flight="lagos"]');
  await home.getByRole('button', { name: 'Book a flight to Lagos' }).click();
  const homePicker = home.locator('[data-trip-picker]');
  await expect(homePicker.locator('[data-held-return="first"]')).toBeVisible();
  await expect(homePicker.locator('[data-cabin-option="first"]')).toHaveClass(/is-picked/);
  await expect(homePicker.locator('[data-cabin-book]')).toHaveText('Use my return ticket');
  await homePicker.locator('[data-cabin-book]').click();
  const trip2 = await toAirport(page);
  const s3 = await state(page);
  expect(s3.view.me.flightTicket).toMatchObject({ cabin: 'first', prepaid: true, paid: back });
  expect(s3.view.accounts.local!.balance).toBe(s2.view.accounts.local!.balance);
  await expect(trip2.locator('[data-ticket-leg="home"]')).toHaveAttribute(
    'data-leg-cabin',
    'first',
  );
  await shot(page, 'return');
  const lounge2 = await toLounge(page, trip2, 'Lagos');
  await expect(lounge2).toHaveAttribute('data-lounge', 'first');
  await trip2.locator('[data-lounge-panel="first"] [data-lounge-act="rest"]').click();
  await expect(trip2.locator('[data-lounge-result="rest"]')).toBeVisible({
    timeout: 10_000 * SLOW,
  });
  await trip2.getByRole('button', { name: /go to the gate/i }).click();
  await trip2.getByRole('button', { name: 'Board for Lagos' }).click();
  const flight2 = page.getByRole('dialog', { name: 'Flight to Lagos' });
  await expect(flight2).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 60_000 * SLOW });
  await expect(flight2.locator('.suite-flight[data-cabin="first"]')).toBeVisible();
  await page.waitForTimeout(2000);
  await shot(page, 'return-suite');
  await flight2.locator('.fl7-skip').click();
  await expect(flight2).toBeHidden({ timeout: 30_000 * SLOW });
  await expect
    .poll(async () => (await state(page)).view.me.location ?? null, { timeout: 30_000 * SLOW })
    .toBeNull();
  const s4 = await state(page);
  // Home, and the flight home cost nothing more.
  expect(s4.view.accounts.local!.balance).toBe(s2.view.accounts.local!.balance);
  expect(s4.view.flights.heldReturn).toBeNull();
});
