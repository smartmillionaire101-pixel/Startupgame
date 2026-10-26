import { expect, letters, playAsGuest, test, type Page } from './fixtures';

/**
 * Wave 7 §C: the phone's apps. Order food in Chop and money goes down; Bank
 * shows the balance; Invest lists deal flow; Map taps a place and goes there;
 * Settings toggles reduce motion.
 *
 * PHONE_SHOTS=<dir> also saves 390×844 screenshots of the home screen and apps.
 */

async function founder(page: Page) {
  await playAsGuest(page);
  const handle = `pa_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Ada Apps',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Apps ${h.slice(3)}`,
            industry: 'fintech',
            revenueModel: 'subscription',
            idea: 'Payments for market traders',
            incorporation: 'local',
          },
        },
      }),
    });
    return r.status;
  }, handle);
  expect(status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible();
}

/** The game state as the server sends it. */
async function state(page: Page) {
  return page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as {
      accounts: { local: { balance: number } };
      market: { delivery?: unknown[] };
      here?: { delivery?: unknown[] } | null;
    };
  });
}

async function openApp(page: Page, app: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator(`[data-app="${app}"]`).click();
  await expect(phone.locator(`[data-phone-app="${app}"]`)).toBeVisible();
  return phone;
}

test('Bank shows the balance; Invest lists deal flow; Settings toggles reduce motion', async ({
  page,
}) => {
  await founder(page);
  const s = await state(page);
  const phone = await openApp(page, 'bank');
  const widget = await phone.getByRole('heading', { name: 'Bank' }).isVisible();
  expect(widget).toBe(true);
  await expect(phone.locator('[data-balance]')).toHaveText(/\d/);
  expect(s.accounts.local.balance).toBeGreaterThan(0);
  await expect(phone.getByText('Credit score')).toBeVisible();

  await openApp(page, 'invest');
  await expect(phone.locator('[data-deal]').first()).toBeVisible({ timeout: 10_000 });

  await openApp(page, 'settings');
  const toggle = phone.getByRole('switch', { name: 'Reduce motion' });
  await expect(toggle).not.toBeChecked();
  await toggle.check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '1');
  expect(await page.evaluate(() => localStorage.getItem('runway.reduceMotion'))).toBe('1');
  await toggle.uncheck({ force: true });
  await expect(page.locator('html')).not.toHaveAttribute('data-reduce-motion', /.*/);
  expect(await page.evaluate(() => localStorage.getItem('runway.reduceMotion'))).toBe('0');
  const skip = phone.getByRole('switch', { name: 'Always skip rides' });
  await skip.check({ force: true });
  expect(await page.evaluate(() => localStorage.getItem('runway.skipRides'))).toBe('1');
  // Wave 9: Map quality, 3D or Lite (the specs run on Lite).
  const quality = phone.getByRole('radiogroup', { name: 'Map quality' });
  await expect(quality.getByRole('radio', { name: 'Lite' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(quality.getByRole('radio', { name: '3D' })).toHaveAttribute('aria-checked', 'false');
});

test('Map: tap a place on the mini map, Go, and you arrive there', async ({ page }) => {
  await founder(page);
  const phone = await openApp(page, 'map');
  const hub = phone.locator('svg.phone-map [data-place="hub"] circle');
  await expect(hub).toBeVisible();
  await hub.click();
  await expect(phone.locator('.phone-map-sel')).toContainText('The Hub');
  await phone.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(phone).toBeHidden();
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: 15_000 });
});

test('Chop: order food and money goes down', async ({ page }) => {
  await founder(page);
  const s = await state(page);
  const delivery = (s.here ?? s.market).delivery;
  const phone = await openApp(page, 'chop');
  if (!Array.isArray(delivery)) {
    // An engine without food delivery: the app says so plainly.
    await expect(phone.getByText(/Food delivery isn’t running/)).toBeVisible();
    test.skip(true, 'This engine has no food delivery yet.');
    return;
  }
  const before = s.accounts.local.balance;
  await phone.locator('[data-dish]').first().getByRole('button', { name: 'Order' }).click();
  await expect(phone.locator('[data-arriving]')).toBeVisible();
  await expect.poll(async () => (await state(page)).accounts.local.balance).toBeLessThan(before);
});

/** Nothing in the app is wider than the phone: no dragging the page or the app sideways. */
async function fitsTheWidth(page: Page, what: string) {
  const w = await page.evaluate(() => {
    const doc = document.documentElement;
    const screen = document.querySelector('.phone-screen');
    return {
      doc: doc.scrollWidth - doc.clientWidth,
      phone: screen ? screen.scrollWidth - screen.clientWidth : 0,
    };
  });
  expect(w, what).toEqual({ doc: 0, phone: 0 });
}

for (const simple of [false, true])
  test(`every phone app fits a 412 px phone${simple ? ' (Simple mode)' : ''}: nothing pushes it sideways`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 412, height: 915 });
    if (simple)
      await page.addInitScript(() => {
        try {
          localStorage.setItem('runway.simple', '1');
        } catch {
          /* storage blocked */
        }
      });
    await founder(page);
    await page.getByRole('button', { name: /^Phone/ }).click();
    const phone = page.getByRole('dialog', { name: 'Phone' });
    // The home screen draws after the dialog opens: wait for it before listing its apps.
    await expect(phone.locator('[data-phone-app="home"]')).toBeVisible();
    await expect(phone.locator('[data-app]').first()).toBeVisible();
    const apps = await phone
      .locator('[data-app]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-app')!));
    expect(apps.length).toBeGreaterThan(10);
    const home = phone.locator('[data-phone-app="home"]');
    for (const app of apps) {
      // Home first (an app's own screens can be a few levels deep).
      for (let i = 0; i < 4 && !(await home.isVisible()); i++)
        await phone.locator('.phone-bar .phone-back').click();
      await phone.locator(`[data-app="${app}"]`).click();
      await expect(phone.locator(`[data-phone-app="${app}"]`)).toBeVisible();
      await page.waitForTimeout(250);
      await fitsTheWidth(page, app);
    }
    for (let i = 0; i < 4 && !(await home.isVisible()); i++)
      await phone.locator('.phone-bar .phone-back').click();
    // Capital → Markets: the row of cities scrolls inside its card, each city on one line.
    await openApp(page, 'capital');
    await phone.getByRole('radio', { name: 'Markets' }).click();
    const chips = phone.getByRole('radiogroup', { name: 'Stock exchanges' });
    await expect(chips).toBeVisible();
    const last = chips.getByRole('radio').last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await expect(last).toHaveAttribute('aria-checked', 'true');
    const sizes = await chips.evaluate((el) => ({
      tall: Math.max(...[...el.children].map((c) => c.getBoundingClientRect().height)),
      short: Math.min(...[...el.children].map((c) => c.getBoundingClientRect().height)),
    }));
    // One line each: every chip the same height ("San Francisco" doesn't wrap).
    expect(sizes.tall).toBe(sizes.short);
    await fitsTheWidth(page, 'capital markets, last city');
  });

/**
 * Player feedback (a phone screenshot): booking a flight in Travel, the
 * three cabins sat side by side wider than the phone, pushing the whole app
 * left and cutting off "How do you want to fly to Dubai?". Both legs' cabins
 * and the hotels fit at 390 px, and at 360 px with iOS's larger text.
 * TRAVEL_SHOTS=<dir> saves the booking at 390 px.
 */
for (const { width, font } of [
  { width: 390, font: 0 },
  { width: 360, font: 20 },
])
  test(`booking a flight fits a ${width} px phone${font ? ` with ${font} px text` : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    if (font)
      await page.addInitScript((px) => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.fontSize = `${px}px`;
        });
      }, font);
    await founder(page);
    const phone = await openApp(page, 'travel');
    const row = phone.locator('[data-flight]').filter({ hasText: 'Dubai' });
    await row.getByRole('button', { name: 'Book a flight to Dubai' }).click();
    const picker = row.locator('[data-trip-picker]');
    await expect(picker.locator('[data-cabin-option="first"]')).toBeVisible();
    // A return: the way home's cabins too.
    const back = picker.locator('[data-trip-kind="return"]');
    if (await back.isVisible()) await back.click();
    await expect(picker.locator('[data-return-option="first"]')).toBeVisible();
    await page.waitForTimeout(250);
    await fitsTheWidth(page, `travel booking at ${width}px`);
    // The question over the cabins is all on screen.
    const q = picker.getByText('How do you want to fly to Dubai?');
    const box = (await q.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const dir = process.env.TRAVEL_SHOTS;
    if (dir && !font) {
      await q.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${dir}/travel-booking-${width}.png` });
      await picker.getByText('And home to').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${dir}/travel-booking-${width}-return.png` });
    }
  });

test('screenshots of the phone (PHONE_SHOTS)', async ({ page }) => {
  const dir = process.env.PHONE_SHOTS;
  test.skip(!dir, 'Set PHONE_SHOTS to save screenshots.');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await founder(page);
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone.locator('[data-app]')).toHaveCount(24);
  await page.screenshot({ path: `${dir}/phone-home.png` });
  for (const app of [
    'bank',
    'map',
    'chop',
    'rides',
    'invest',
    'fit',
    'founder',
    'jobs',
    'news',
    'travel',
    'house',
    'social',
    'settings',
    'contacts',
    'alerts',
  ]) {
    await openApp(page, app);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/phone-${app}.png` });
  }
  await openApp(page, 'rides');
  await phone.getByRole('searchbox', { name: 'Where to?' }).fill('Hub');
  await phone.locator('[data-place="hub"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${dir}/phone-rides-book.png` });
  await openApp(page, 'map');
  await phone.locator('svg.phone-map [data-place="hub"] circle').click();
  await page.screenshot({ path: `${dir}/phone-map-selected.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/desktop-phone-map.png` });
  await openApp(page, 'messages');
  await phone.getByRole('button', { name: 'Back' }).click();
  await page.screenshot({ path: `${dir}/desktop-phone-home.png` });
});
