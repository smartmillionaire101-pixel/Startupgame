import { devices, type Page } from '@playwright/test';
import { expect, letters, more, playAsGuest, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Wave 4: getting around. A far trip across town asks how to get there (a
 * taxi costs pocket money), the month counts down, and a flight plays out
 * full screen before you walk the streets of the city you landed in, where
 * the people who live there can see you.
 *
 * Each part checks for the server's Wave 4 contracts first (view.clock,
 * view.flights, city.ride) and exercises the fallback where they're missing.
 */

async function founder(page: Page, city: RegExp, name: string) {
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: city }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Handle').fill(`${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Ledgers for traders');
  await page.getByLabel('Company name').fill(`${name.split(' ')[0]} Ledger ${letters(5)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
}

type State = {
  view: {
    me: { id: string };
    clock?: unknown;
    flights?: unknown;
    accounts: { local: { balance: number } | null };
  };
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as State;
  });

/** Tap a place on the map the way the map listens for taps. */
async function tap(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.dispatchEvent('pointerdown', { pointerId: 3, clientX: 10, clientY: 10 });
  await el.dispatchEvent('pointerup', { pointerId: 3, clientX: 10, clientY: 10 });
}

test('a taxi across town, the month countdown, a flight to London and back', async ({
  page,
  browser,
}) => {
  test.slow();
  await founder(page, /Lagos, Nigeria/, 'Ada Traveller');
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  const s0 = await state(page);
  const wave4 = s0.view.flights !== undefined;

  // The month counts down (when the server sends its clock).
  if (s0.view.clock) await expect(page.getByRole('timer')).toContainText(/Next month in \d/);

  // The Event Hall is across the Lagoon: far enough to choose how to get there.
  await tap(page, '[data-place="eventhall"]');
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('[data-mode="walk"]')).toContainText('Free');
  // Lagos's own transit is the danfo.
  await expect(chooser.locator('[data-mode="bus"]')).toContainText('Danfo');
  await chooser.locator('[data-mode="taxi"]').click();
  await expect(chooser).toBeHidden();
  await expect(page.locator('.city-avatar')).toHaveClass(/is-riding/);
  await expect(page.locator('[data-ride]')).toBeAttached();
  await more(page);
  const hall = page.getByRole('dialog').getByRole('heading', { name: 'Host an event' });
  await expect(hall).toBeVisible({ timeout: 10_000 });
  const s1 = await state(page);
  const before = s0.view.accounts.local?.balance ?? 0;
  const after = s1.view.accounts.local?.balance ?? 0;
  // With rides on the server the taxi costs pocket money; without, it's a free animation.
  if (wave4) expect(after).toBeLessThan(before);
  else expect(after).toBe(before);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Someone who lives in London, to see us arrive.
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL });
  const local = await ctx.newPage();
  await withoutNetlifyDrawer(local);
  if (wave4) {
    await founder(local, /London/, 'Lola Local');
    await expect(local.getByRole('application', { name: /Map of London/ })).toBeVisible();
  }

  // To the airport (from the Places list) and onto a plane to London.
  await page.getByRole('button', { name: /Places/ }).click();
  await page.getByRole('dialog', { name: 'Places' }).locator('[data-kind="airport"]').click();
  await more(page);
  const desk = page.getByRole('list', { name: 'Departures' });
  await expect(desk).toBeVisible({ timeout: 10_000 });
  await desk.getByRole('button', { name: 'Fly to London' }).click();

  // The flight: take-off, the route map, landing.
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toBeVisible();
  await expect(flight).toHaveAttribute('data-flight-phase', 'takeoff');
  await expect(flight).toContainText('Lagos → London');
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 6000 });
  await expect(flight.locator('[data-flight-plane]')).toBeAttached();
  await expect(flight).toHaveAttribute('data-flight-phase', 'landing', { timeout: 8000 });

  if (!wave4) {
    // The old trip: you're visiting London this month, but the city stays Lagos.
    await flight.getByRole('button', { name: 'Continue' }).click({ timeout: 10_000 });
    await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
    await ctx.close();
    return;
  }

  // Landed: London's streets, its own districts, and a way home.
  await expect(flight).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible();
  await expect(page.getByText('You’re in London')).toBeVisible();
  await page.getByRole('button', { name: /Places/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Places' }).getByRole('heading', { name: 'Shoreditch' }),
  ).toBeVisible();
  await page.getByRole('dialog', { name: 'Places' }).getByRole('button', { name: 'Close' }).click();

  // Londoners see the visitor walking their city (presence polls every few seconds).
  const me = s0.view.me.id;
  await expect(local.locator(`[data-person="${me}"]`)).toBeAttached({ timeout: 25_000 });
  await ctx.close();

  // Fly home.
  await page.getByRole('button', { name: 'Fly home' }).click();
  const home = page.getByRole('dialog', { name: 'Flight to Lagos' });
  await expect(home).toBeVisible();
  await home.getByRole('button', { name: 'Skip' }).click();
  await expect(home).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  await expect(page.getByText('You’re in London')).toBeHidden();
});
