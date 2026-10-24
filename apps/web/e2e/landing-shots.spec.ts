import type { Locator } from '@playwright/test';
import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  setupPlayer,
  tab,
  tapPlace,
  test,
  type Page,
} from './fixtures';

/**
 * The landing page's pictures (public/landing), taken from the game itself
 * (LANDING_ASSETS=<dir> only): a phone screen is a 420×909 JPEG (390×844 at
 * a 420/390 scale), a career card's picture a 420×315 slice of one.
 *
 * Spread over San Francisco, Cairo, Dubai and Johannesburg (product owner:
 * no Lagos on the landing page): the founder's company with its first
 * revenue (SF), founders pitching an investor at a tech event (Cairo), a
 * banker's offers from the shareholders (Johannesburg) and the Central
 * Bank's appointment door (Dubai), the Stock Exchange floor (Johannesburg),
 * bowling (Johannesburg), a skydive (Dubai), the first class lounge and
 * suite (Dubai to London), the mall (Cairo) and the lifestyle picker (Dubai).
 * The city (SF), the club (London) and the mansion are older pictures.
 */
const DIR = process.env.LANDING_ASSETS;
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 420 / 390,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});
/** Software WebGL draws the real city slowly: every 3D step gets this long. */
const SLOW = 60_000;

/** A whole phone screen, without the toasts over it. */
async function phoneShot(page: Page, name: string) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

/** A career card's picture: a 4:3 slice of the screen from `top` down. */
async function cardShot(page: Page, name: string, top: number) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${DIR}/${name}.jpg`,
    type: 'jpeg',
    quality: 80,
    clip: { x: 0, y: top, width: 390, height: 292.5 },
  });
}

const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.json() };
  }, cmd);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the shots read the view loosely
const view = (page: Page): Promise<any> =>
  page.request
    .get('/api/state')
    .then((r) => r.json())
    .then((s) => s.view);

/** A month on (the dev tools' settle), in `market`. */
const settle = (page: Page, market: string) =>
  page.request.post('/api/dev/settle', { headers: { 'x-runway': '1' }, data: { market } });

/** The map, in Lite (2D) or 3D. */
const quality = (page: Page, q: 'lite' | '3d') =>
  page.addInitScript((v) => localStorage.setItem('runway.mapQuality', v), q);

async function founder(page: Page, market: RegExp) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Zara Okafor',
    handle: `ld_${letters(8)}`,
    company: `Stallwise ${letters(4)}`,
    idea: 'Payments for market traders',
    market,
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function investor(page: Page, market: string) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: `Nour${letters(3)} Angel`,
    handle: `ld_${letters(8)}`,
    role: 'investor',
    backgroundId: 'i-banker',
    market,
    gender: 'female',
    investor: { sectors: ['fintech', 'saas'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  expect((await command(page, { type: 'investor.tutorial', action: 'skip' })).status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function banker(page: Page, market: string) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Thandi Banker',
    handle: `ld_${letters(8)}`,
    role: 'banker',
    backgroundId: 'b-commercial',
    market,
    gender: 'female',
    bank: { name: `Baobab Trust ${letters(4)}`, bankType: 'microfinance' },
  });
  await tab(page, 'Bank').click();
  const neg = page.locator('[data-banker="negotiate"]');
  await expect(neg).toBeVisible({ timeout: 15_000 });
  await neg.locator('[data-take="g2"]').click();
  await expect(neg.locator('[data-take="g2"]')).toBeChecked();
  await neg.locator('[data-take="g3"]').click();
  await expect(neg.locator('[data-take="g3"]')).toBeChecked();
  return neg;
}

async function goingOut(page: Page) {
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="goingout"]').click();
  const games = phone.locator('[data-going="games"]');
  await expect(games).toBeVisible({ timeout: 15_000 });
  return { phone, games };
}

/** Skip the ride there, if one is offered. */
async function arrive(page: Page, mode = 'cycle') {
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator(`[data-mode="${mode}"]`)
    .click({ timeout: 3000 })
    .catch(() => undefined);
}

test.beforeEach(() => test.skip(!DIR));

test('founder: the company, a few months in (San Francisco)', async ({ page }) => {
  test.setTimeout(120_000);
  await founder(page, /San Francisco/);
  // Money in from savings, then three months: the first customers are paying.
  const v = await view(page);
  const mine = v.companies.find((c: { name: string }) => c.name.startsWith('Stallwise'));
  expect(
    (await command(page, { type: 'company.inject', companyId: mine.id, amount: 6_000_000 })).status,
  ).toBe(200);
  for (let i = 0; i < 3; i++) expect((await settle(page, 'san-francisco')).status()).toBe(200);
  await page.reload();
  await tab(page, 'Company').click();
  await expect(page.getByText('Monthly revenue')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await cardShot(page, 'role-founder', 86);
});

test('investor: founders pitch at a tech event (Cairo)', async ({ page }) => {
  test.setTimeout(120_000);
  await investor(page, 'cairo');
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await page.getByRole('button', { name: /^Phone/ }).click();
  await phone.locator('[data-app="events"]').click();
  const card = phone.locator('[data-tech-event]').first();
  await card.getByRole('button', { name: 'Attend' }).click();
  const pitch = card.locator('[data-pitch]').first();
  await expect(pitch).toBeVisible({ timeout: 10_000 });
  await pitch.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await cardShot(page, 'role-investor', 0);
});

test('banker: the shareholders’ offers (Johannesburg)', async ({ page }) => {
  test.setTimeout(120_000);
  const neg = await banker(page, 'johannesburg');
  // The three offers side by side, under their heading.
  await neg.locator('.offer-table').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -110);
  });
  await cardShot(page, 'role-banker', 56);
});

test('the Central Bank, by appointment (Dubai)', async ({ page }) => {
  test.setTimeout(120_000);
  const neg = await banker(page, 'dubai');
  await neg.locator('[data-sign]').click();
  await expect(page.locator('[data-banker="licence"]')).toBeVisible({ timeout: 15_000 });
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, '[data-place="civic:dubai:central-bank"]');
  const door = page.locator('.civic-door');
  await expect(door).toHaveAttribute('data-civic-closed', 'appointment', { timeout: 15_000 });
  await door.locator('[data-book-appointment]').click();
  await expect(door).toHaveAttribute('data-civic-closed', 'early', { timeout: 15_000 });
  await phoneShot(page, 'central-bank');
});

test('the Stock Exchange floor, for investors (Johannesburg)', async ({ page }) => {
  test.setTimeout(120_000);
  await quality(page, 'lite');
  await investor(page, 'johannesburg');
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, '[data-place="civic:johannesburg:stock-exchange"]');
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  await phoneShot(page, 'exchange');
});

test('the lifestyle picker (Dubai)', async ({ page }) => {
  test.setTimeout(120_000);
  await founder(page, /Dubai/);
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="settings"]').click();
  await phone.locator('[data-open-lifestyle]').click();
  await expect(page.getByRole('dialog', { name: 'Lifestyle' })).toBeVisible();
  await phoneShot(page, 'lifestyle');
});

test('the mall’s seventeen shops (Cairo)', async ({ page }) => {
  test.setTimeout(180_000);
  await quality(page, 'lite');
  await founder(page, /Cairo/);
  await tab(page, 'City').click();
  await expect(page.locator('[data-place="mall"]').first()).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, '[data-place="mall"]', 'cycle');
  const scene = page.locator('.mall-scene');
  await expect(scene.locator('[data-shop]')).toHaveCount(17, { timeout: 30_000 });
  await phoneShot(page, 'mall');
});

test('bowling at the alley, the ball rolling (Johannesburg)', async ({ page }) => {
  test.setTimeout(420_000);
  await quality(page, '3d');
  await founder(page, /Johannesburg/);
  const { games } = await goingOut(page);
  await games.locator('[data-go="bowling"]').click();
  await arrive(page);
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await scene.locator('[data-action="fun:bowling"]').click();
  const dialog = page.getByRole('dialog', { name: 'Play together' });
  await dialog
    .getByLabel(/Stake per player/)
    .last()
    .fill('5');
  await dialog.getByRole('button', { name: 'Play vs AI' }).click();
  const lane = dialog.locator('.bowling-lane canvas');
  await expect(lane).toHaveAttribute('data-mine', '1', { timeout: SLOW });
  // A swipe up from the right of the lane, bowing out to hook back.
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  const from = { x: box.x + box.width * 0.66, y: box.y + box.height * 0.92 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const q = i / 8;
    await page.mouse.move(
      from.x - box.width * 0.04 * q + Math.sin(Math.PI * q) * 18,
      from.y - box.height * 0.5 * q,
    );
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await expect(lane).toHaveAttribute('data-rolling', '1', { timeout: 15_000 });
  await page.waitForTimeout(1600);
  await phoneShot(page, 'bowling');
});

test('a tandem skydive, under the canopy (Dubai)', async ({ page }) => {
  test.setTimeout(420_000);
  await founder(page, /Dubai/);
  // A skydive needs standard of living 3.
  expect((await command(page, { type: 'player.lifestyle', tier: 3 })).status).toBe(200);
  await page.reload();
  const { games } = await goingOut(page);
  await games.locator('[data-go="skydive"]').click();
  const book = page.getByRole('dialog', { name: 'Book a skydive' });
  await book.locator('[data-air-item="skydive-tandem"] [data-action="air-book"]').click();
  const air = page.locator('[data-air="skydive"]');
  await expect(air).toHaveAttribute('data-air-phase', 'door', { timeout: SLOW });
  await air.locator('[data-action="jump"]').click();
  await expect(air).toHaveAttribute('data-air-phase', 'freefall', { timeout: 15_000 });
  await air.locator('[data-action="arch"]').click();
  await expect
    .poll(async () => Number(await air.locator('[data-alt]').getAttribute('data-alt')), {
      timeout: 60_000,
      intervals: [200],
    })
    .toBeLessThan(1700);
  await air.locator('[data-action="pull"]').click({ timeout: 5_000 });
  await expect(air).toHaveAttribute('data-air-phase', 'canopy', { timeout: 10_000 });
  await page.waitForTimeout(800);
  await phoneShot(page, 'skydive');
});

test('first class from Dubai: the lounge, then the bed at turndown', async ({ page }) => {
  test.setTimeout(900_000);
  await quality(page, '3d');
  await page.addInitScript(() =>
    localStorage.setItem('runway.flightClock', '2026-06-15T11:00:00Z'),
  );
  await investor(page, 'dubai');
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of Dubai/ })).toBeVisible({
    timeout: SLOW,
  });
  // Book first class to London (and back).
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const row = phone.locator('[data-flight="london"]');
  await row.getByRole('button', { name: 'Book a flight to London' }).click();
  const picker = row.locator('[data-trip-picker]');
  await picker.locator('[data-cabin-option="first"]').click();
  await picker.locator('[data-hotel="business"]').click();
  await picker.locator('[data-hotel-book]').click();
  await arrive(page, 'skip');
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: SLOW });
  // Check in, security: the lounge. A meal, champagne and a shower, until the flight is called.
  const skip = (where: Locator) =>
    where
      .getByRole('button', { name: 'Skip' })
      .click({ timeout: 3000 })
      .catch(() => undefined);
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await skip(trip);
  await trip.getByRole('button', { name: 'Go through security' }).click({ timeout: 15_000 });
  await skip(trip);
  const lounge = page.locator('.lounge-scene[data-lounge="first"]');
  await expect(lounge).toHaveAttribute('data-lounge-ready', 'yes', { timeout: 3 * SLOW });
  const panel = trip.locator('[data-lounge-panel="first"]');
  for (const act of ['dine', 'drink', 'shower']) {
    await panel.locator(`[data-lounge-act="${act}"]`).click();
    await expect(panel.locator(`[data-lounge-result="${act}"]`)).toBeVisible({ timeout: 30_000 });
  }
  await expect(lounge).toHaveAttribute('data-lounge-called', 'yes');
  await page.waitForTimeout(2500);
  await phoneShot(page, 'first-lounge');
  // The suite: on to the night, turndown into a bed.
  await panel.locator('[data-lounge-board]').click();
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 3 * SLOW });
  const suite = flight.locator('.suite-flight[data-cabin="first"]');
  await expect(suite).toHaveAttribute('data-suite-ready', 'yes', { timeout: 3 * SLOW });
  await expect
    .poll(async () => (await view(page)).flights.inflight?.cabin ?? null, { timeout: SLOW })
    .toBe('first');
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'meal');
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'night');
  await suite.locator('[data-inflight-act="sleep"]').click();
  await expect(suite.locator('[data-inflight-result="sleep"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4000);
  await phoneShot(page, 'first-suite');
});
