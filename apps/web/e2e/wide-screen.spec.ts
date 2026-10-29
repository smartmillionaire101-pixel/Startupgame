import { expect, letters, playAsGuest, setupFounder, tab, test, type Page } from './fixtures';

/**
 * The game on a laptop and a tablet on its side (player: "can we have the
 * game take the whole screen", and the floating HUD): the nav pill standing
 * down the left instead of along the bottom, the city to the window's edges,
 * content screens in two columns, and the phone as a panel down the
 * right-hand side. The other specs play on a phone.
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

/**
 * The nav is a pill standing down the left (the floating HUD), the HUD's
 * pills across the top; nothing keeps clear of a bottom bar. Only the
 * current tab says its name.
 */
async function sideNav(page: Page, width: [number, number]) {
  const vp = page.viewportSize()!;
  const nav = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
  const top = await box(page, '.hud-top');
  expect(nav.x).toBeGreaterThanOrEqual(8);
  expect(nav.x).toBeLessThanOrEqual(32);
  expect(nav.width).toBeGreaterThanOrEqual(width[0]);
  expect(nav.width).toBeLessThanOrEqual(width[1]);
  // Standing in the middle of the left edge, under the pills.
  expect(Math.abs(nav.y + nav.height / 2 - vp.height / 2)).toBeLessThanOrEqual(4);
  expect(nav.y).toBeGreaterThanOrEqual(top.y + top.height);
  expect(top.width).toBeGreaterThanOrEqual(vp.width - 48);
  const navH = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--nav-h').trim(),
  );
  expect(navH).toBe('0px');
  const label = async (name: string) =>
    (await tab(page, name).locator('.nav-label').boundingBox())!.width;
  const current = (await page
    .getByRole('navigation', { name: 'Main' })
    .locator('[aria-current="page"] .nav-label')
    .textContent())!;
  expect(await label(current)).toBeGreaterThan(20);
  expect(await label(current === 'Me' ? 'City' : 'Me')).toBeLessThanOrEqual(1);
  return nav;
}

/** The city fills the whole window, under the pills and the nav pill. */
async function cityFills(page: Page) {
  const vp = page.viewportSize()!;
  await tab(page, 'City').click();
  await expect(tab(page, 'City')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.city-stage')).toBeVisible({ timeout: 30_000 });
  const stage = await box(page, '.city-stage');
  expect(Math.abs(stage.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(stage.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(stage.width - vp.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(stage.height - vp.height)).toBeLessThanOrEqual(2);
  // The map's buttons: a rail of round icons down the right.
  const rail = await box(page, '[data-hud-rail]');
  expect(rail.x + rail.width).toBeGreaterThan(vp.width - 40);
  await noSideScroll(page);
}

/** The screen's content sits right of the nav pill. */
async function besideNav(page: Page, nav: { x: number; width: number }) {
  const main = await box(page, 'main');
  expect(main.x).toBeGreaterThanOrEqual(nav.x + nav.width);
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

  test('the nav pill down the left, the city to the edges, two columns, the phone down the right', async ({
    page,
  }) => {
    await founder(page);
    const nav = await sideNav(page, [60, 96]);

    await cityFills(page);

    await tab(page, 'Today').click();
    await expect(tab(page, 'Today')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main .whatnow-card').first()).toBeVisible();
    // "What to do now" runs across the top; the cards below in two columns, within 1200px.
    const main = await box(page, 'main');
    expect(main.width).toBeLessThanOrEqual(1200);
    const whatNow = await box(page, 'main .whatnow-card');
    expect(whatNow.width).toBeGreaterThan(main.width - 4);
    await twoColumns(page, 400);
    await besideNav(page, nav);
    await sideNav(page, [60, 96]);

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

  test('the nav pill, the city to the edges, two columns, the phone panel', async ({ page }) => {
    await founder(page);
    const nav = await sideNav(page, [60, 96]);
    // Icons over the current tab's name.
    const city = (await tab(page, 'City').boundingBox())!;
    expect(city.height).toBeGreaterThan(city.width * 0.5);

    await cityFills(page);

    await tab(page, 'Company').click();
    await expect(page.getByRole('tab', { name: 'Product' })).toBeVisible();
    await twoColumns(page, 300);
    await besideNav(page, nav);

    await phonePanel(page);
  });
});

/**
 * Round 7 #7 (player feedback: on a laptop an interview and a sales
 * conversation were a narrow dark column under a separate strip with the
 * business name): one centred panel, the conversation on the left and what
 * you know on the right, on a laptop and on a tablet held upright. The
 * place's column and its strip step back; a phone keeps one column.
 */
async function talkOpen(page: Page) {
  // A lead you've called, then its sales conversation from the Company screen.
  const r = await page.evaluate(async () => {
    const post = (command: unknown) =>
      fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-runway': '1' },
        body: JSON.stringify({ command }),
      }).then((x) => x.json());
    const p = await post({ type: 'sales.prospect' });
    const id = p.result.leads[0].id as string;
    await post({ type: 'sales.advance', dealId: id, action: 'contact' });
    return id;
  });
  await page.reload();
  await tab(page, 'Company').click();
  await page.getByRole('tab', { name: 'Sales' }).click();
  await page.locator(`[data-deal="${r}"] button[data-action="talk"]`).click();
  const sheet = page.getByRole('dialog', { name: /^Sales conversation/ });
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-talk-start]').click();
  await expect(sheet.locator('[data-turn="lead"]')).toBeVisible({ timeout: 15_000 });
  return sheet;
}

/** The conversation's two columns: side by side, the right one `side` px or so. */
async function convoColumns(page: Page, minWidth: number) {
  const panel = (await box(page, '.sheet.sheet-convo'))!;
  expect(panel.width).toBeGreaterThan(minWidth);
  // Centred in the room beside the nav pill (the backdrop's padding keeps clear of it).
  const mid = await page
    .locator('.sheet-backdrop', { has: page.locator('.sheet-convo') })
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const l = r.x + parseFloat(cs.paddingLeft);
      const rr = r.x + r.width - parseFloat(cs.paddingRight);
      return (l + rr) / 2;
    });
  expect(Math.abs(panel.x + panel.width / 2 - mid)).toBeLessThan(4);
  const main = (await box(page, '.sheet-convo .convo-main'))!;
  const side = (await box(page, '.sheet-convo .convo-side'))!;
  expect(side.x).toBeGreaterThanOrEqual(main.x + main.width - 1);
  expect(Math.abs(side.y - main.y)).toBeLessThan(4);
  // The sub-title names who you're talking to.
  await expect(page.locator('.sheet-convo .sheet-sub')).toContainText(/with /);
}

test.describe('a conversation on a laptop (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, ...desktop });

  test('a sales conversation and an interview are one centred panel with two columns', async ({
    page,
  }) => {
    await founder(page);
    const sheet = await talkOpen(page);
    await convoColumns(page, 900);
    // What you know (who they are, the win meter) is the right column.
    await expect(sheet.locator('.convo-side .convo-first')).toBeVisible();
    await expect(sheet.locator('.convo-side').getByRole('meter')).toBeVisible();
    await page.keyboard.press('Escape');

    // The Market's stall: the interview, over the place, without its strip.
    await tab(page, 'City').click();
    await page.getByRole('button', { name: /Places/ }).click();
    await page
      .getByRole('dialog', { name: 'Places' })
      .locator('[data-kind="stall"]')
      .first()
      .click();
    await page.locator('.tray-card[data-action="interview"]').click();
    const iv = page.getByRole('dialog', { name: /^Customer interview/ });
    await expect(iv).toBeVisible();
    await expect(page.locator('.place-scene > .place-head')).toBeHidden();
    await iv.getByRole('button', { name: 'Start the interview' }).click();
    await expect(iv.locator('[data-interview="round"]')).toBeVisible({ timeout: 15_000 });
    const panel = (await box(page, '.sheet.sheet-convo'))!;
    expect(panel.width).toBeGreaterThan(900);
    const main = (await box(page, '.sheet-convo .convo-main'))!;
    const notes = (await iv.locator('.convo-side').boundingBox())!;
    expect(notes.x).toBeGreaterThanOrEqual(main.x + main.width - 1);
    await expect(iv.locator('.convo-side')).toContainText('Your notes');
  });
});

test.describe('a conversation on a tablet held upright (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 }, ...desktop });

  test('two columns too', async ({ page }) => {
    await founder(page);
    await talkOpen(page);
    await convoColumns(page, 600);
  });
});

test.describe('a conversation on a phone (390×844)', () => {
  test('one column, who they are first', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await founder(page);
    const sheet = await talkOpen(page);
    const who = (await sheet.locator('.convo-first').boundingBox())!;
    const lead = (await sheet.locator('[data-turn="lead"]').boundingBox())!;
    expect(who.y).toBeLessThan(lead.y);
    expect(Math.abs(who.x - lead.x)).toBeLessThan(30);
    // Nothing in it runs off the side.
    const over = await sheet
      .locator('.sheet-body')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
