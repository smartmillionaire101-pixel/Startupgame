import { openMoney, setupFounder } from './fixtures';
import { expect, letters, playAsGuest, test, type Page } from './fixtures';

/** Wave 7 §D: the UI overhaul, measured on a small phone (360 px wide). */
test.use({ viewport: { width: 360, height: 780 } });

async function founder(page: Page) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Overhaul',
    handle: `ada_${letters(6)}`,
    company: `Ledger ${letters(5)}`,
    idea: 'Payments for market traders',
    market: /Lagos, Nigeria/,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
}

test('the overhaul: one row of pills, small avatar, a What-to-do button, four tabs', async ({
  page,
}) => {
  await founder(page);

  // The floating HUD's top row is one line of pills at 360 px.
  const bar = page.locator('.hud-top');
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(56);
  // The game day stays readable under the time, beside the hours (play-test #14, #24).
  const city = (await page.locator('.hud-city').boundingBox())!;
  expect(city.width).toBeGreaterThan(30);
  await expect(page.locator('.hud-city')).toHaveText(/^Day \d+$/);
  const when = page.locator('.hud-when');
  expect(await when.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // The phone is a round button beside the nav pill.
  await expect(page.locator('[data-phone-button]')).toBeVisible();
  // Nothing in the row overflows the screen.
  const right = await bar.evaluate((el) =>
    Math.max(...[...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect().right)),
  );
  expect(right).toBeLessThanOrEqual(360);

  // Your avatar is person-sized next to the buildings: 15–34 px at the default
  // zoom (a street's worth of buildings on a phone, play-test #22)…
  const fig = page.locator('.city-avatar .city-avatar-fig').first();
  await expect(fig).toBeAttached();
  const h = (await fig.boundingBox())!.height;
  expect(h).toBeGreaterThanOrEqual(15);
  expect(h).toBeLessThanOrEqual(34);
  // …and your name tag shows above it, even where buildings stand in front.
  await expect(page.locator('.city-you-tag .city-you')).toBeVisible();

  // People are depth-sorted with the buildings (drawn inside the skyline's slots).
  await expect(page.locator('.city-skyline [data-depth-slot] .city-avatar')).toHaveCount(1);

  // "What to do now" is a round icon (a red dot for a new idea); it opens as a sheet.
  const chip = page.getByRole('button', { name: 'What to do now' });
  await expect(chip).toBeVisible();
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.height).toBeGreaterThanOrEqual(48);
  expect(chipBox.height).toBeLessThanOrEqual(52);
  await expect(page.locator('.whatnow-btn')).toHaveCount(0);
  await chip.click();
  await expect(page.getByRole('dialog', { name: 'What to do now' })).toBeVisible();
  await page.getByRole('dialog', { name: 'What to do now' }).getByLabel('Close').click();

  // Four tabs (money is the pill at the top), each with an icon from the same set.
  const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('button');
  const n = await tabs.count();
  expect(n).toBe(4);
  await expect(page.locator('.nav svg.icon')).toHaveCount(n);

  // The phone button opens the phone; the phone's own floating one is gone.
  await page.locator('[data-phone-button]').click();
  await expect(page.getByRole('dialog', { name: 'Phone' })).toBeVisible();
  await expect(page.locator('.phone-fab')).toBeHidden();
});

test('day one reads plainly: pre-revenue, new, investors in town', async ({ page }) => {
  await founder(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: /^Today/ }).click();
  await expect(page.getByText('Pre-revenue')).toBeVisible();
  await expect(page.getByText('Runs out before profit')).toHaveCount(0);
  await expect(page.getByText('Public warning')).toHaveCount(0);
  // News lives behind Today now.
  await page.getByRole('button', { name: /^News/ }).click();
  await expect(page.getByRole('heading', { name: 'News', level: 1 })).toBeVisible();

  await openMoney(page);
  await expect(page.getByRole('heading', { name: 'Investors in town' })).toBeVisible();
  await expect(page.getByText('AI investors')).toHaveCount(0);
  // The first screen is short: under about 1.5 viewports.
  const tall = await page.evaluate(() => document.documentElement.scrollHeight / innerHeight);
  expect(tall).toBeLessThan(1.6);
});
