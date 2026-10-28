import { devices } from '@playwright/test';
import {
  expect,
  letters,
  playAsGuest,
  setupPlayer,
  tapPlace,
  test,
  withoutNetlifyDrawer,
  type Page,
} from './fixtures';

/**
 * Round 7, item 26: "New" was on almost every pin. A place new to you is a
 * small dot (no label), only for what opened since you first saw the city,
 * the nearest few at most, gone once you've been in. "Where to?" can show
 * the places you haven't been in yet.
 */
const MARKET = 'accra';

async function founder(page: Page, name: string) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name,
    handle: `np_${letters(8)}`,
    role: 'founder',
    backgroundId: 'f-engineer',
    market: MARKET,
    gender: 'female',
    company: {
      name: `Dot ${letters(5)}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  });
  await expect(page.getByRole('application', { name: /Map of Accra/ })).toBeVisible({
    timeout: 30_000,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the e2e reads the view loosely
const state = async (p: Page): Promise<any> =>
  (await (await p.request.get('/api/state')).json()).view;

test('only what opened since you came is marked, as a dot, a few at most, gone once visited', async ({
  page,
  browser,
}) => {
  test.slow();
  await founder(page, 'Ama Dots');
  // Day one: what stood there already isn't news.
  await expect(page.locator('[data-new]')).toHaveCount(0);
  const start = (await state(page)).market.month as number;

  // A month on, another founder arrives: the city opens a business for them.
  const r = await page.request.post('/api/dev/settle', {
    headers: { 'x-runway': '1' },
    data: { market: MARKET },
  });
  expect(r.ok()).toBe(true);
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const other = await (
    await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(other);
  await founder(other, 'Kofi Arrives');
  const opened = (
    (await state(page)).market.businesses as {
      id: string;
      openedMonth: number;
      isNew: boolean;
    }[]
  ).filter((b) => b.isNew && b.openedMonth > start);
  expect(opened.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Accra/ })).toBeVisible({
    timeout: 30_000,
  });
  const dots = page.locator('[data-new]');
  await expect(dots.first()).toBeAttached({ timeout: 20_000 });
  expect(await dots.count()).toBeLessThanOrEqual(3);
  if (process.env.BUY_SHOTS)
    await page.screenshot({ path: `${process.env.BUY_SHOTS}/map-dots.png` });
  // A dot, not a label.
  for (const d of await dots.all()) expect((await d.textContent())?.trim() ?? '').toBe('');
  await expect(page.locator('.c3-labels, .city-map').getByText('New', { exact: true })).toHaveCount(
    0,
  );

  // "Where to?": the places not visited yet.
  await page
    .getByRole('button', { name: /Places|Where to\?/ })
    .first()
    .click();
  const places = page.getByRole('dialog', { name: /Places|Where to\?/ });
  await places.locator('[data-filter="unvisited"]').click();
  await expect(places.locator('[data-kind="business"]').first()).toBeVisible();
  await places.getByRole('button', { name: 'Close' }).first().click();

  // Go in: its dot goes.
  const id = (await dots.first().getAttribute('data-new'))!;
  await tapPlace(page, `[data-place="${id}"]`, 'walk');
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: 30_000 });
  await page.locator('.place-scene').getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator(`[data-new="${id}"]`)).toHaveCount(0);
});
