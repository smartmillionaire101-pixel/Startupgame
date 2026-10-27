import { expect, letters, playAsGuest, setupFounder, tab, test, type Page } from './fixtures';

/**
 * The game on a laptop and a tablet on its side (player: "can we have the
 * game take the whole screen"): a sidebar instead of the bottom bar, the city
 * to the window's edges, content screens in two columns, and the phone as a
 * panel down the right-hand side. The other specs play on a phone.
 */
const desktop = { isMobile: false, hasTouch: false, deviceScaleFactor: 1 };

async function founder(page: Page) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Wide',
    handle: `wd_${letters(8)}`,
    company: `Wide ${letters(5)}`,
    idea: 'Payments for market traders',
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible();
}

const box = async (page: Page, selector: string) =>
  (await page.locator(selector).first().boundingBox())!;

/** Nothing on the page is wider than the window. */
async function noSideScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
}

/** The screen's first two columns sit side by side, each at least `min` px wide. */
async function twoColumns(page: Page, min: number) {
  const cols = page.locator('main .screen-cols > .screen-col');
  await expect(cols.first()).toBeVisible();
  const a = (await cols.nth(0).boundingBox())!;
  const b = (await cols.nth(1).boundingBox())!;
  expect(a.width).toBeGreaterThan(min);
  expect(b.width).toBeGreaterThan(min);
  expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
  await noSideScroll(page);
}

/** The bar is a sidebar down the left, under a top bar the width of the window. */
async function sidebar(page: Page, width: [number, number]) {
  const vp = page.viewportSize()!;
  const nav = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
  const top = await box(page, '.topbar');
  expect(nav.x).toBe(0);
  expect(nav.width).toBeGreaterThanOrEqual(width[0]);
  expect(nav.width).toBeLessThanOrEqual(width[1]);
  expect(top.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(nav.y).toBeGreaterThanOrEqual(top.y + top.height - 2);
  expect(nav.y + nav.height).toBeGreaterThanOrEqual(vp.height - 1);
  // Nothing on screen keeps clear of a bottom bar.
  const navH = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--nav-h').trim(),
  );
  expect(navH).toBe('0px');
  return { nav, top };
}

/** The city fills the window right of the sidebar and under the top bar. */
async function cityFills(page: Page, nav: { width: number }, top: { y: number; height: number }) {
  const vp = page.viewportSize()!;
  await tab(page, 'City').click();
  await expect(tab(page, 'City')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.city-stage')).toBeVisible({ timeout: 30_000 });
  const stage = await box(page, '.city-stage');
  expect(Math.abs(stage.x - nav.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(stage.x + stage.width - vp.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(stage.y - (top.y + top.height))).toBeLessThanOrEqual(2);
  expect(Math.abs(stage.y + stage.height - vp.height)).toBeLessThanOrEqual(2);
  await noSideScroll(page);
}

/** The phone opens as a full-height panel down the right, the game beside it, and closes. */
async function phonePanel(page: Page) {
  const vp = page.viewportSize()!;
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await expect(phone.getByRole('meter', { name: 'Energy' })).toBeVisible();
  // Once it has slid in: against the right-hand edge.
  await expect
    .poll(async () => {
      const f = await box(page, '.phone-frame');
      return Math.round(f.x + f.width);
    })
    .toBe(vp.width);
  const frame = await box(page, '.phone-frame');
  expect(Math.round(frame.width)).toBeGreaterThanOrEqual(400);
  expect(Math.round(frame.width)).toBeLessThanOrEqual(480);
  expect(frame.y).toBeLessThanOrEqual(1);
  expect(frame.height).toBeGreaterThanOrEqual(vp.height - 1);
  // An app opens in the panel, and its ✕ closes the phone.
  await phone.locator('[data-app="messages"]').click();
  await expect(phone.getByRole('button', { name: 'New message' })).toBeVisible();
  await phone.getByRole('button', { name: 'Close phone' }).click();
  await expect(phone).toBeHidden();
  // From the home screen, "Back to the game" closes it.
  await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  await phone.getByRole('button', { name: /^Back to the game/ }).click();
  await expect(phone).toBeHidden();
}

test.describe('a laptop (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, ...desktop });

  test('sidebar, the city to the edges, two columns, the phone down the right', async ({
    page,
  }) => {
    await founder(page);
    const { nav, top } = await sidebar(page, [200, 280]);
    // Icons with their labels beside them.
    const city = (await tab(page, 'City').boundingBox())!;
    expect(city.width).toBeGreaterThan(city.height * 2);

    await cityFills(page, nav, top);

    await tab(page, 'Today').click();
    await expect(tab(page, 'Today')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main .whatnow-card').first()).toBeVisible();
    // "What to do now" runs across the top; the cards below in two columns, within 1200px.
    const main = await box(page, 'main');
    expect(main.width).toBeLessThanOrEqual(1200);
    const whatNow = await box(page, 'main .whatnow-card');
    expect(whatNow.width).toBeGreaterThan(main.width - 4);
    await twoColumns(page, 400);

    await tab(page, 'Company').click();
    await expect(tab(page, 'Company')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('tab', { name: 'Product' })).toBeVisible();
    await twoColumns(page, 400);

    await tab(page, 'Me').click();
    await expect(tab(page, 'Me')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main .profile-card')).toBeVisible();
    await twoColumns(page, 400);

    await phonePanel(page);
  });
});

test.describe('a tablet on its side (1024×768)', () => {
  test.use({ viewport: { width: 1024, height: 768 }, ...desktop });

  test('a slim sidebar, the city to the edges, two columns, the phone panel', async ({ page }) => {
    await founder(page);
    const { nav, top } = await sidebar(page, [72, 110]);
    // Icons over their labels.
    const city = (await tab(page, 'City').boundingBox())!;
    expect(city.height).toBeGreaterThan(city.width * 0.5);

    await cityFills(page, nav, top);

    await tab(page, 'Company').click();
    await expect(page.getByRole('tab', { name: 'Product' })).toBeVisible();
    await twoColumns(page, 300);

    await phonePanel(page);
  });
});
