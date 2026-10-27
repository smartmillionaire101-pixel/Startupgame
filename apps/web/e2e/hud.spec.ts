import {
  expect,
  hudMore,
  letters,
  playAsGuest,
  setupFounder,
  tab,
  test,
  withoutNetlifyDrawer,
  type Page,
} from './fixtures';

/**
 * The floating HUD (player: "make the whole game look like this"): the scene
 * fills the screen and the HUD floats over it. Its icons have names (said
 * on a long press and on keyboard focus, written under them in a first
 * session and in Simple mode), ⋯ keeps the rest of a scene's buttons, the
 * ⌄ folds the extras away, the pills slide off a list as you scroll down
 * and come back, nothing runs off a small phone, and on a laptop the nav is
 * a pill standing down the left.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function founder(page: Page) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Hu Dee',
    handle: `hud_${letters(8)}`,
    company: `Pill ${letters(6)}`,
    idea: 'Payments for market traders',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

/** Nothing on the page is wider than the window. */
async function noSideScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
}

/** The HUD's top row: inside the window, one line. */
async function topRowFits(page: Page, what: string) {
  const vp = page.viewportSize()!;
  const row = await page.locator('.hud-top').evaluate((el) => {
    const kids = [...el.children].map((c) => c.getBoundingClientRect());
    return {
      left: Math.min(...kids.map((r) => r.left)),
      right: Math.max(...kids.map((r) => r.right)),
      tops: kids.map((r) => Math.round(r.top + r.height / 2)),
    };
  });
  expect(row.left, what).toBeGreaterThanOrEqual(0);
  expect(row.right, what).toBeLessThanOrEqual(vp.width);
  // One line: every pill's middle at the same height.
  expect(Math.max(...row.tops) - Math.min(...row.tops), what).toBeLessThanOrEqual(2);
}

test('every icon has a name; a long press and keyboard focus say it; ⋯ opens and closes', async ({
  page,
}) => {
  await founder(page);
  const rail = page.getByRole('group', { name: 'Map actions' });
  await expect(rail).toBeVisible();

  // Every HUD button on screen has a name, and a finger-sized target.
  const buttons = page.locator('[data-hud-btn]:visible');
  expect(await buttons.count()).toBeGreaterThanOrEqual(6);
  for (const b of await buttons.all()) {
    const name = (await b.getAttribute('aria-label')) ?? '';
    expect(name.trim().length, await b.evaluate((e) => e.outerHTML.slice(0, 120))).toBeGreaterThan(
      2,
    );
    const box = (await b.boundingBox())!;
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(40);
  }
  for (const name of ['What to do now', 'Places', 'Centre on me', 'More'])
    await expect(rail.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(rail.getByRole('button', { name: /^Who’s here/ })).toBeVisible();
  // Rail buttons are at least 48px.
  const places = (await rail.getByRole('button', { name: 'Places' }).boundingBox())!;
  expect(places.width).toBeGreaterThanOrEqual(48);
  expect(places.height).toBeGreaterThanOrEqual(48);
  // No names written under the icons for a returning player.
  await expect(page.locator('html')).not.toHaveAttribute('data-hud-labels');

  // A long press says the button's name, and doesn't press it.
  const who = rail.getByRole('button', { name: /^Who’s here/ });
  await who.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  const tip = who.locator('[data-hud-tip]');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/^Who’s here/);
  await who.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
  await who.dispatchEvent('click');
  await expect(page.getByRole('dialog', { name: 'People around' })).toHaveCount(0);
  await expect(tip).toBeHidden({ timeout: 4000 });
  // A plain tap presses it.
  await who.click();
  const people = page.getByRole('dialog', { name: 'People around' });
  await expect(people).toBeVisible();
  await people.getByRole('button', { name: 'Close' }).first().click();
  await expect(people).toBeHidden();

  // Keyboard focus says the name too.
  let onHud = false;
  for (let i = 0; i < 40 && !onHud; i++) {
    await page.keyboard.press('Tab');
    onHud = await page.evaluate(() => !!document.activeElement?.closest('[data-hud-rail]'));
  }
  expect(onHud).toBe(true);
  await expect(page.locator(':focus [data-hud-tip]')).toBeVisible();

  // ⋯: the rest, with their names; Escape closes it and focus comes back to ⋯.
  const more = rail.getByRole('button', { name: 'More', exact: true });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(rail.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Zoom in', 'Zoom out', 'Sky views', 'Map key'])
    await expect(rail.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(rail.getByTestId('journey-chip')).toBeVisible();
  // Focus moved into the menu.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
    'Zoom in',
  );
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(rail.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
  await expect(more).toBeFocused();
  // Picking one runs it and closes the menu.
  await hudMore(page);
  await rail.getByRole('button', { name: 'Map key' }).click();
  await expect(page.getByRole('dialog', { name: 'Map key' })).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
});

test('the ⌄ folds the extras away (remembered); the pills slide off a list and come back', async ({
  page,
}) => {
  await founder(page);
  const html = page.locator('html');
  const rail = page.getByRole('group', { name: 'Map actions' });
  const chevron = page.locator('[data-hud-collapse]');
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.hud-sub').first()).toBeVisible();

  // Folded: the time and the money stay, the row under them and the rail go (⋯ stays).
  await chevron.click();
  await expect(html).toHaveAttribute('data-hud-collapsed', '');
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(chevron).toHaveAccessibleName('Show buttons');
  await expect(page.locator('.hud-sub').first()).toBeHidden();
  await expect(rail.getByRole('button', { name: 'Places' })).toBeHidden();
  await expect(rail.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  await expect(page.locator('[data-topbar-cash]')).toBeVisible();
  await expect(page.locator('[data-hud-life]')).toBeVisible();
  // Remembered.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-hud-collapsed', '', {
    timeout: 30_000,
  });
  await chevron.click();
  await expect(html).not.toHaveAttribute('data-hud-collapsed');
  await expect(rail.getByRole('button', { name: 'Places' })).toBeVisible();

  // A list screen: the content scrolls under the pills, which slide off going
  // down and come back going up.
  await tab(page, 'Today').click();
  await expect(html).toHaveAttribute('data-hud', 'list');
  await expect(chevron).toHaveCount(0);
  const top = page.locator('.hud-top');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await page.mouse.move(195, 500);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(80);
  }
  await expect(html).toHaveAttribute('data-hud-away', '');
  await expect.poll(async () => (await top.boundingBox())!.y + 40).toBeLessThanOrEqual(0);
  // The nav pill and the phone stay in reach.
  await expect(nav).toBeInViewport();
  await expect(page.locator('[data-phone-button]')).toBeInViewport();
  await page.mouse.wheel(0, -200);
  await expect(html).not.toHaveAttribute('data-hud-away');
  await expect.poll(async () => (await top.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  // Away again, a control in the pills getting focus brings them back.
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(80);
  }
  await expect(html).toHaveAttribute('data-hud-away', '');
  await page.locator('[data-topbar-cash]').focus();
  await expect(html).not.toHaveAttribute('data-hud-away');
});

test('a first session names the icons, the next one doesn’t; Simple mode always does', async ({
  page,
}) => {
  // A new player in this browser: no "seen" mark until the game marks this
  // tab's session as the first one (this page only; a new tab is a new session).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('runway.hudFirst') !== '1')
      localStorage.removeItem('runway.hudSeen');
  });
  await founder(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-hud-labels', '');
  const rail = page.getByRole('group', { name: 'Map actions' });
  const label = rail.locator('[data-whatnow-open] .hud-lbl');
  await expect(label).toHaveText('What to do now');
  expect((await label.boundingBox())!.width).toBeGreaterThan(30);
  // The nav says every tab's name.
  const navLabel = tab(page, 'Me').locator('.nav-label');
  expect((await navLabel.boundingBox())!.width).toBeGreaterThan(10);
  await noSideScroll(page);
  // The same session (a reload): still named.
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await expect(html).toHaveAttribute('data-hud-labels', '');

  // The next session (a new tab): icons only.
  const next = await page.context().newPage();
  await withoutNetlifyDrawer(next);
  await next.goto('/');
  await expect(next.getByRole('application', { name: /Map of/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(next.locator('html')).not.toHaveAttribute('data-hud-labels');
  const hidden = next.locator('[data-whatnow-open] .hud-lbl');
  expect((await hidden.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  // Simple mode keeps the names.
  await next.evaluate(() => localStorage.setItem('runway.simple', '1'));
  await next.reload();
  await expect(next.locator('html')).toHaveAttribute('data-simple', '1', { timeout: 30_000 });
  await expect(next.locator('html')).toHaveAttribute('data-hud-labels', '');
  await expect(next.locator('.city-hud-bottom').getByText('Where to?')).toBeVisible();
  await next.close();
});

test('nothing runs off a 360, 390 or 430px phone, or with bigger text', async ({ page }) => {
  await founder(page);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await tab(page, 'City').click();
    await expect(page.locator('.city-stage')).toBeVisible();
    await topRowFits(page, `City at ${width}px`);
    // The rail on the right edge, the nav pill and the phone side by side at the bottom.
    const rail = (await page.locator('[data-hud-rail]').first().boundingBox())!;
    expect(rail.x + rail.width).toBeLessThanOrEqual(width);
    const nav = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
    const phone = (await page.locator('[data-phone-button]').boundingBox())!;
    expect(nav.x).toBeGreaterThanOrEqual(0);
    expect(nav.x + nav.width).toBeLessThanOrEqual(phone.x);
    expect(phone.x + phone.width).toBeLessThanOrEqual(width);
    // The map's licence (a map drawn from OpenStreetMap) stays visible, clear of the nav pill.
    const credit = page.locator('[data-osm-credit]');
    if (await credit.count()) {
      const c = (await credit.boundingBox())!;
      expect(c.y + c.height).toBeLessThanOrEqual(nav.y);
      expect(c.x).toBeGreaterThanOrEqual(0);
    }
    await noSideScroll(page);
    for (const name of ['Today', 'Company', 'Me']) {
      await tab(page, name).click();
      await topRowFits(page, `${name} at ${width}px`);
      await noSideScroll(page);
    }
  }
  // Bigger text (the browser's text size): still one row, nothing off the side.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '115%'));
  for (const name of ['City', 'Today', 'Me']) {
    await tab(page, name).click();
    await topRowFits(page, `${name} with bigger text`);
    await noSideScroll(page);
  }
});

test.describe('a laptop', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });

  test('the nav pill stands down the left and works; the map fills the window', async ({
    page,
  }) => {
    await founder(page);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const box = (await nav.boundingBox())!;
    expect(box.height).toBeGreaterThan(box.width * 2);
    expect(box.x).toBeLessThan(40);
    await expect(nav.getByRole('button')).toHaveCount(4);
    for (const name of ['Today', 'Company', 'Me', 'City']) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
      await topRowFits(page, name);
      await noSideScroll(page);
    }
    // Keyboard: the tabs are buttons in order down the pill.
    await tab(page, 'Today').focus();
    await page.keyboard.press('Enter');
    await expect(tab(page, 'Today')).toHaveAttribute('aria-current', 'page');
    await tab(page, 'City').click();
    const stage = (await page.locator('.city-stage').boundingBox())!;
    expect(stage.width).toBeGreaterThanOrEqual(1438);
    expect(stage.height).toBeGreaterThanOrEqual(898);
    // The map's rail on the right, the HUD's phone under it.
    await expect(page.getByRole('group', { name: 'Map actions' })).toBeVisible();
    await expect(page.locator('[data-phone-button]')).toBeVisible();
  });
});
