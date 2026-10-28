import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Round 7, item 21: Buy mode is one bottom panel (the home above it): half
 * height first, dragged to full or low (or down to close); the online
 * catalogue opens in the same panel (‹ Buy back, its title the category);
 * any furniture comes in more than one (− N + on a picked card), built-ins
 * one per home; no footprint badge on the cards. On a laptop the panel is
 * docked along the bottom edge, the full width, the nav pill stepped aside.
 * BUY_SHOTS=<dir> saves screenshots.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const SHOTS = process.env.BUY_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;

async function atHome(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await playAsGuest(page);
  const h = `bp_${letters(8)}`;
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: {
      command: {
        type: 'player.create',
        handle: h,
        name: 'Ada Panel',
        role: 'founder',
        backgroundId: 'f-engineer',
        market: 'lagos',
        gender: 'female',
        company: {
          name: `Panel ${h.slice(3)}`,
          industry: 'fintech',
          revenueModel: 'subscription',
          idea: 'Payments for market traders',
          incorporation: 'local',
        },
      },
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await scene.getByRole('button', { name: 'Buy' }).click();
  const sheet = page.getByRole('dialog', { name: 'Buy mode' });
  await expect(sheet).toBeVisible();
  // Settled (it rises into place).
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return Math.round(b.y + b.height);
    })
    .toBe(size.height);
  return { scene, sheet };
}

/** Drag the panel's handle by dy pixels (up is negative). */
async function drag(page: Page, dy: number) {
  const grip = page.locator('[data-buy-grip]');
  const b = (await grip.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y + (dy * i) / 6);
  await page.mouse.up();
}

test('phone: half, full and low by the handle; the catalogue in the same panel; three sofas in one van', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { scene, sheet } = await atHome(page, { width: 390, height: 844 });
  // Half height first, the whole width, down to the bottom edge.
  await expect(sheet).toHaveAttribute('data-height', 'half');
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(389);
  expect(Math.round(box.y + box.height)).toBe(844);
  expect(box.height).toBeGreaterThan(844 * 0.4);
  expect(box.height).toBeLessThan(844 * 0.6);
  // The nav pill and the phone button step aside.
  await expect(page.locator('.nav')).toBeHidden();
  await expect(page.locator('.hud-phone')).toBeHidden();
  // No footprint badge; rooms as tabs.
  await expect(sheet.locator('.buy-foot')).toHaveCount(0);
  await expect(sheet.locator('[data-buy-room="all"]')).toBeVisible();
  await shot(page, 'phone-1-half');
  await drag(page, -400);
  await expect(sheet).toHaveAttribute('data-height', 'full');
  // Full stops under the time and money pills.
  expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(50);
  await shot(page, 'phone-2-full');
  await drag(page, 500);
  await expect(sheet).toHaveAttribute('data-height', 'low');
  await shot(page, 'phone-3-low');
  await drag(page, -60);
  await expect(sheet).toHaveAttribute('data-height', 'half');

  // The online catalogue opens in the same bottom panel; ‹ Buy goes back.
  await sheet.locator('[data-action="shop-online"]').click();
  const cat = page.locator('.cat-dock [data-catalogue-sheet]');
  await expect(cat).toBeVisible();
  const cb = (await cat.boundingBox())!;
  expect(cb.width).toBeGreaterThanOrEqual(389);
  expect(Math.round(cb.y + cb.height)).toBe(844);
  await cat.locator('.cat-chip[data-category="walls"]').click();
  await expect(cat.locator('[data-cat-title]')).toHaveAttribute('data-cat-title', 'walls');
  await shot(page, 'phone-4-catalogue');
  await cat.locator('[data-action="back-to-buy"]').click();
  await expect(sheet).toBeVisible();

  // Three sofas: picked, − N + to 3, one order, one van, three owned once unpacked.
  await sheet.locator('[data-buy-tab="all"]').click();
  await sheet.locator('[data-action="pick-several"]').click();
  await sheet.locator('[data-buy-item="sofa-1"]').click();
  const step = sheet.locator('[data-buy-item="sofa-1"] ~ [data-card-qty]');
  await step.locator('[data-action="qty-up"]').click();
  await step.locator('[data-action="qty-up"]').click();
  await expect(step).toHaveAttribute('data-card-qty', '3');
  // A built-in: one per home.
  await sheet.locator('[data-buy-room="kitchen"]').click();
  await sheet.locator('[data-buy-item="kitchen-1"]').click();
  await expect(sheet.locator('[data-buy-item="kitchen-1"] ~ [data-one-per-home]')).toBeVisible();
  await sheet.locator('[data-buy-item="kitchen-1"]').click();
  await shot(page, 'phone-6-basket');
  await sheet.locator('[data-action="buy-all"]').click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
  const bar = scene.getByRole('toolbar', { name: /Place/ });
  await expect(bar).toBeVisible();
  // Placing: a slim bar along the bottom, with the floor tiles it takes.
  await expect(bar.locator('[data-tiles]')).toBeVisible();
  await shot(page, 'phone-5-place');
  await bar.getByRole('button', { name: 'Keep this spot' }).click();
  const v = await state(page);
  const ds = v.living.deliveries.filter((d) => d.owner === v.me.id && !d.complete);
  expect(ds).toHaveLength(3);
  expect(new Set(ds.map((d) => (d as { van?: string }).van)).size).toBe(1);
  await page.waitForTimeout(Math.max(0, ds[0]!.arrivesAt - Date.now() + 1000));
  const u = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'living.collect', deliveryId: ds[0]!.id, all: true } },
  });
  expect(u.ok(), await u.text()).toBeTruthy();
  const after = await state(page);
  const sofas =
    after.me.home!.items.filter((i) => i.itemId === 'sofa-1').length +
    after.me.homeStyle!.extras.filter((x) => x.itemId === 'sofa-1').length;
  expect(sofas).toBe(3);
});

test('laptop: the panel docked along the bottom edge, the full width, the nav stepped aside', async ({
  page,
}) => {
  const { sheet } = await atHome(page, { width: 1440, height: 900 });
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(1438);
  expect(Math.round(box.y + box.height)).toBe(900);
  await expect(page.locator('.nav')).toBeHidden();
  // More things a row than on a phone.
  const cards = sheet.locator('.buy-card');
  const first = (await cards.nth(0).boundingBox())!;
  let row = 0;
  for (const c of await cards.all()) {
    const b = await c.boundingBox();
    if (b && Math.abs(b.y - first.y) < 4) row++;
  }
  expect(row).toBeGreaterThanOrEqual(6);
  await shot(page, 'laptop-docked');
  await sheet.locator('[data-action="close-buy"]').click();
  await expect(page.locator('.nav')).toBeVisible();
});

test('round 7: Bathroom and Hallway tabs, their things in more than one, placed at home (phone and laptop)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { scene, sheet } = await atHome(page, { width: 390, height: 844 });
  await sheet.locator('[data-buy-tab="all"]').click();
  const rooms = sheet.locator('[data-buy-room]');
  await expect(rooms).toHaveText([
    'All rooms',
    'Living room',
    'Bedroom',
    'Kitchen',
    'Utility',
    'Bathroom',
    'Hallway',
  ]);
  // The bathroom: a towel rail, a bath mat, a cabinet, a laundry basket and a plant, three tiers each.
  await sheet.locator('[data-buy-room="bathroom"]').click();
  for (const slot of ['cabinet', 'towels', 'bathmat', 'hamper', 'bathplant'])
    await expect(sheet.locator(`[data-buy-item^="${slot}-"]`)).toHaveCount(3);
  await expect(sheet.locator('[data-buy-item="towels-1"] img')).toHaveAttribute(
    'src',
    /thumbs\/furniture\/towels-1\.webp/,
  );
  await shot(page, 'rooms-phone-bathroom');
  // The hallway: a shoe rack, a coat stand, a console table, a mirror and a runner.
  await sheet.locator('[data-buy-room="hallway"]').click();
  for (const slot of ['shoes', 'coats', 'console', 'hallmirror', 'runner'])
    await expect(sheet.locator(`[data-buy-item^="${slot}-"]`)).toHaveCount(3);
  await shot(page, 'rooms-phone-hallway');
  // Not built in: more than one (− N +), in one van, each placed.
  await sheet.locator('[data-action="pick-several"]').click();
  await sheet.locator('[data-buy-item="shoes-2"]').click();
  const step = sheet.locator('[data-buy-item="shoes-2"] ~ [data-card-qty]');
  await step.locator('[data-action="qty-up"]').click();
  await expect(step).toHaveAttribute('data-card-qty', '2');
  await sheet.locator('[data-buy-room="bathroom"]').click();
  await sheet.locator('[data-buy-item="towels-1"]').click();
  await expect(sheet.locator('[data-buy-item="towels-1"] ~ [data-card-qty]')).toBeVisible();
  await shot(page, 'rooms-phone-basket');
  await sheet.locator('[data-action="buy-all"]').click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
  const bar = scene.getByRole('toolbar', { name: /Place/ });
  for (let i = 0; i < 2; i++) {
    await expect(bar).toBeVisible();
    await shot(page, `rooms-phone-place-${i + 1}`);
    await bar.getByRole('button', { name: 'Keep this spot' }).click();
  }
  const v = await state(page);
  const ds = v.living.deliveries.filter((d) => d.owner === v.me.id && !d.complete);
  expect(ds).toHaveLength(3);
  expect(new Set(ds.map((d) => (d as { van?: string }).van)).size).toBe(1);

  // On a laptop: the same tabs along the docked panel.
  await page.setViewportSize({ width: 1440, height: 900 });
  await scene.getByRole('button', { name: 'Buy' }).click();
  const wide = page.getByRole('dialog', { name: 'Buy mode' });
  await expect(wide).toBeVisible();
  await wide.locator('[data-buy-tab="all"]').click();
  await wide.locator('[data-buy-room="bathroom"]').click();
  await expect(wide.locator('[data-buy-item^="cabinet-"]')).toHaveCount(3);
  await page.waitForTimeout(600);
  await shot(page, 'rooms-laptop-bathroom');
  await wide.locator('[data-buy-room="hallway"]').click();
  await expect(wide.locator('[data-buy-item^="coats-"]')).toHaveCount(3);
  await page.waitForTimeout(300);
  await shot(page, 'rooms-laptop-hallway');
});
