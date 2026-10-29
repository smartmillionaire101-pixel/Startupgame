/**
 * Play-test: in Accra a Lagos founder's naira balance showed with a cedi sign
 * ("GH₵3.8m" for ₦3.78m) at the mall, weighed against cedi prices; and the
 * return home already paid for read "₦383k · Book" at the departures desk.
 */
import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

async function command(page: Page, command: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

test('abroad: your naira at cedi prices, and the return you paid for', async ({ page }) => {
  test.setTimeout(180_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Kofi Abroad',
    handle: `kofi_${letters(6)}`,
    company: `Kente ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  await command(page, { type: 'travel.book', to: 'accra', returnCabin: 'economy' });
  await command(page, { type: 'travel.fly', to: 'accra' });
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Accra/ })).toBeVisible({
    timeout: 60_000,
  });

  // The Travel app: the way home is yours already.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const home = phone.locator('[data-flight="lagos"]');
  await expect(home).toHaveAttribute('data-held-return', '');
  await expect(home).toContainText('Your return ticket · paid');
  await expect(home.getByRole('button', { name: /Book a flight to Lagos/ })).toHaveText(
    'Use ticket',
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('dialog', { name: 'Phone' })
    .getByRole('button', { name: 'Close' })
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // The mall: your money in cedi (≈), with the naira alongside.
  await expect(page.locator('[data-place="mall"]').first()).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, '[data-place="mall"]', 'cycle');
  const scene = page.locator('.mall-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  const pocket = scene.locator('.golf-pocket');
  await expect(pocket).toContainText('≈ GH₵');
  await expect(pocket).toContainText('₦');
  const naira = Number(await pocket.getAttribute('data-pocket'));
  const cedi = Number(await pocket.getAttribute('data-pocket-here'));
  expect(cedi).toBeGreaterThan(0);
  // A cedi is worth many naira: the balance here is far fewer cedi than naira.
  expect(cedi).toBeLessThan(naira / 10);
  // Buying converts as the header does: the cedi balance falls by the price.
  await scene.locator('[data-shop="fashion"]').click();
  await scene.locator('[data-colour="#db2777"]').click();
  await scene.locator('[data-buy="top-hoodie"]').click();
  const bought = scene.locator('[data-mall-bought="top-hoodie"]');
  await expect(bought).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(naira);
  await bought.locator('[data-action="mall-ok"]').click();
  await scene.getByRole('button', { name: 'Close' }).click();
  await expect(scene).toBeHidden();

  // The departures desk: the Lagos row is the ticket you hold, not "₦383k · Book".
  await tapPlace(page, '[data-place="airport"]', 'cycle');
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 5000 })
    .catch(() => undefined);
  const desk = page
    .getByRole('region', { name: 'Your trip' })
    .getByRole('list', { name: 'Where do you want to go?' });
  const lagos = desk.locator('[data-dest="lagos"]');
  await expect(lagos).toHaveAttribute('data-held-return', '', { timeout: 20_000 });
  await expect(lagos).toContainText('Your return ticket · paid');
  await expect(lagos.getByRole('button', { name: /Book a flight to Lagos/ })).toHaveText(
    'Use ticket',
  );
  await expect(desk.locator('[data-dest="london"]')).not.toHaveAttribute('data-held-return');
});

type Clocked = {
  view?: {
    clock?: { monthMs: number; nextSettlementAt: number; serverNow: number } | null;
    market?: { cityPlaces?: { now?: { day: number; hour: number; minute: number } } | null };
    me?: { flightTicket?: { flight?: { time?: string } } | null };
    accounts?: { local?: { balance: number } | null };
  };
};
const stateOf = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as Clocked;
  });

/**
 * Move the game clock on by `min` game minutes in every state the page reads
 * (the engine's "now" for the city, else the month's countdown).
 */
async function clockOn(page: Page, min: number) {
  await page.route('**/api/state**', async (route) => {
    const headers = { ...route.request().headers() };
    delete headers['if-none-match'];
    const res = await route.fetch({ headers });
    const body = (await res.json().catch(() => null)) as Clocked | null;
    const v = body?.view;
    const now = v?.market?.cityPlaces?.now;
    if (now) {
      // The game clock stops at the month's last minute (the month settles first).
      const at = Math.min((now.day - 1) * 1440 + now.hour * 60 + now.minute + min, 30 * 1440 - 1);
      Object.assign(now, {
        day: Math.min(30, Math.floor(at / 1440) + 1),
        hour: Math.floor((at % 1440) / 60),
        minute: at % 60,
      });
    } else if (v?.clock) v.clock.nextSettlementAt -= (min / (30 * 1440)) * v.clock.monthMs;
    await route.fulfill({ response: res, json: body });
  });
}

/**
 * A deploy preview has no scheduled clock: once its month's time is up the
 * game clock waits at the month's last minute until something settles it.
 * This test moves the clock on by hours, so close a month that's nearly over.
 */
async function monthWithTimeLeft(page: Page) {
  const left = await page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' }, cache: 'no-store' });
    const v = (await r.json()) as {
      view?: { clock?: { nextSettlementAt: number; serverNow: number; monthMs: number } };
    };
    const c = v.view?.clock;
    return c ? (c.nextSettlementAt - c.serverNow) / c.monthMs : null;
  });
  // A day of game time is 1/30 of the month; the test needs up to a day and a bit.
  if (left === null || left > 2 / 30) return;
  for (let i = 0; i < 3; i++) {
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/dev/settle', {
        method: 'POST',
        headers: { 'x-runway': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ market: 'lagos' }),
      });
      return r.status;
    });
    if (status !== 504) break;
  }
  await page.reload();
}

test('a booked flight waits for you: past its time, check in and board', async ({ page }) => {
  test.setTimeout(180_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Late Larry',
    handle: `larry_${letters(6)}`,
    company: `Late ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  await monthWithTimeLeft(page);
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 60_000,
  });

  // Book London at the airport's ticket desk (a flight still to leave).
  const toAirport = async () => {
    await page.getByRole('button', { name: /Places/ }).click();
    await page.getByRole('dialog', { name: 'Places' }).locator('[data-kind="airport"]').click();
  };
  await toAirport();
  const trip = page.getByRole('region', { name: 'Your trip' });
  const desk = trip.getByRole('list', { name: 'Where do you want to go?' });
  await expect(desk).toBeVisible({ timeout: 20_000 });
  await desk.getByRole('button', { name: 'Book a flight to London' }).click();
  // The cabin and hotel picker: book what it suggests.
  await desk.locator('[data-hotel-book], [data-cabin-book]').first().click();
  await expect(trip.locator('[data-ticket]')).toContainText('London', { timeout: 10_000 });
  // Not past its time yet: nothing waits.
  await expect(trip.locator('[data-ticket-waited]')).toHaveCount(0);
  const booked = await stateOf(page);
  const paid = booked.view?.accounts?.local?.balance ?? 0;
  const time = booked.view?.me?.flightTicket?.flight?.time;
  expect(time, 'the ticket keeps its flight').toMatch(/^\d\d:\d\d$/);
  const now = booked.view?.market?.cityPlaces?.now;
  const clock = booked.view?.clock;
  expect(now ?? clock, 'the view has a game clock').toBeTruthy();
  const nowMin = now
    ? now.hour * 60 + now.minute
    : Math.floor((1 - (clock!.nextSettlementAt - clock!.serverNow) / clock!.monthMs) * 43_200) %
      1440;
  const dep = Number(time!.slice(0, 2)) * 60 + Number(time!.slice(3));
  await page.locator('.airport-scene').getByRole('button', { name: 'Close' }).first().click();

  // The ride to the airport takes a while: the game clock is past the departure.
  await clockOn(page, ((dep - nowMin + 1440) % 1440) + 75);
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 60_000,
  });
  await toAirport();
  await expect(trip.locator('[data-ticket]')).toContainText('London', { timeout: 20_000 });
  // The ticket, the desk and the board: boarding now, never departed.
  await expect(trip.locator('[data-ticket] [data-ticket-waited]')).toHaveText(
    'Boarding now · we waited for you',
  );
  const board = page.locator('.board');
  await expect(board.locator('[data-board-waited]')).toContainText(
    'Boarding now · we waited for you',
  );
  await expect(board.locator('tr[data-waited]')).toHaveAttribute('data-status', 'Boarding');
  // Check in, security, the gate, board: the plane leaves with you on it.
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await trip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect(trip.locator('[data-boarding-pass] [data-ticket-waited]')).toBeVisible();
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await trip.getByRole('button', { name: 'Go to the gate' }).click({ timeout: 5000 });
  await trip.getByRole('button', { name: 'Board for London' }).click();
  await expect(page.getByRole('dialog', { name: 'Flight to London' })).toBeVisible();
  // Nothing more to pay: the ticket was paid when booked.
  await expect
    .poll(async () => (await stateOf(page)).view?.me?.flightTicket ?? null, { timeout: 15_000 })
    .toBeNull();
  expect((await stateOf(page)).view?.accounts?.local?.balance).toBe(paid);
});
