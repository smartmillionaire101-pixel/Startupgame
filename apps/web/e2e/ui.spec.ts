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
  const city = page.locator('.hud-city');
  await expect(city).toHaveText(/^Day \d+$/);
  // Shown whole, not cut to an ellipsis.
  expect(await city.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect((await city.boundingBox())!.width).toBeGreaterThan(20);
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

/**
 * Round 7 (play-test: on a phone the floating nav pill covered the bottom of
 * sheets, their last button under it): while a sheet is open the nav pill
 * and the phone button step aside, over a screen and over a place's scene.
 */
test.describe('sheets on a 390×844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** The sheet's last button, scrolled into view, is clear of the nav pill and the phone button. */
  async function lastButtonClear(page: Page, sheetName: RegExp | string) {
    const sheet = page.getByRole('dialog', { name: sheetName });
    await expect(sheet).toBeVisible();
    // Its last button (or, with none, its last line).
    const body = sheet.locator('.sheet-body');
    const last = (await body.locator('button').count())
      ? body.locator('button').last()
      : body.locator('p, li, dd').last();
    await last.scrollIntoViewIfNeeded();
    const b = (await last.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(844);
    for (const sel of ['nav.nav', '.hud-phone.hud-ib']) {
      const el = page.locator(sel).first();
      if (!(await el.count()) || !(await el.isVisible())) continue;
      const n = (await el.boundingBox())!;
      const overlap =
        b.x < n.x + n.width && n.x < b.x + b.width && b.y < n.y + n.height && n.y < b.y + b.height;
      expect(overlap, `${sel} covers the sheet's last button`).toBe(false);
    }
    // The topmost thing at the button's centre is the button itself.
    const hit = await last.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && (top === el || el.contains(top));
    });
    expect(hit).toBe(true);
  }

  test('a sheet over a screen and one over a place keep their last button clear', async ({
    page,
  }) => {
    await founder(page);
    // Over a screen: your day (the time pill's sheet).
    await page.locator('[data-hud-life]').click();
    await lastButtonClear(page, 'Your day');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Your day' })).toBeHidden();
    await expect(page.locator('nav.nav')).toBeVisible();

    // Over a place: the Market's interview.
    await page.getByRole('button', { name: /Places/ }).click();
    await page
      .getByRole('dialog', { name: 'Places' })
      .locator('[data-kind="stall"]')
      .first()
      .click();
    await page.locator('.tray-card[data-action="interview"]').click();
    await lastButtonClear(page, /^Customer interview/);
  });
});
