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
 * a 420/390 scale), a career card's picture a 420×315 slice of one. The
 * founder's company, an investor pitched at a tech event, a banker's offers
 * from the shareholders, the Stock Exchange floor and the lifestyle picker.
 *
 * The rest come from the screenshots other specs already take, scaled to
 * 420×909: FIRST_CLASS_SHOTS (first-lounge, first-suite), GAME_SHOTS
 * (bowling, skydive), BANKER_SHOTS (central-bank), SHOTS_DIR in
 * mall-more.spec.ts (mall).
 */
const DIR = process.env.LANDING_ASSETS;
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 420 / 390,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

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

async function investor(page: Page) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: `Ife${letters(4)} Angel`,
    handle: `ld_${letters(8)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'lagos',
    gender: 'female',
    investor: { sectors: ['fintech', 'saas'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  expect((await command(page, { type: 'investor.tutorial', action: 'skip' })).status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(() => test.skip(!DIR));

test('founder: the company', async ({ page }) => {
  test.setTimeout(120_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Zara Okafor',
    handle: `ld_${letters(8)}`,
    company: `Marketline ${letters(4)}`,
    idea: 'Payments for market traders',
  });
  await tab(page, 'Company').click();
  await page.waitForTimeout(1500);
  await cardShot(page, 'role-founder', 86);
});

test('investor: founders pitch at a tech event', async ({ page }) => {
  test.setTimeout(120_000);
  await investor(page);
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

test('banker: the shareholders’ offers', async ({ page }) => {
  test.setTimeout(120_000);
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Ama Mensah',
    handle: `ld_${letters(8)}`,
    role: 'banker',
    backgroundId: 'b-commercial',
    market: 'accra',
    gender: 'female',
    bank: { name: `Adinkra Trust ${letters(4)}`, bankType: 'microfinance' },
  });
  await tab(page, 'Bank').click();
  const neg = page.locator('[data-banker="negotiate"]');
  await expect(neg).toBeVisible({ timeout: 15_000 });
  await neg.locator('[data-take="g2"]').click();
  await expect(neg.locator('[data-take="g2"]')).toBeChecked();
  await neg.locator('[data-take="g3"]').click();
  await expect(neg.locator('[data-take="g3"]')).toBeChecked();
  // The three offers side by side, under their heading.
  await neg.locator('.offer-table').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -110);
  });
  await cardShot(page, 'role-banker', 56);
});

test('the Stock Exchange floor, for investors', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('runway.mapQuality', 'lite'));
  await investor(page);
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, '[data-place="civic:lagos:stock-exchange"]');
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  await phoneShot(page, 'exchange');
});

test('the lifestyle picker', async ({ page }) => {
  test.setTimeout(120_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Zara Okafor',
    handle: `ld_${letters(8)}`,
    company: `Stall ${letters(5)}`,
    idea: 'Payments for market traders',
  });
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="settings"]').click();
  await phone.locator('[data-open-lifestyle]').click();
  await expect(page.getByRole('dialog', { name: 'Lifestyle' })).toBeVisible();
  await phoneShot(page, 'lifestyle');
});
