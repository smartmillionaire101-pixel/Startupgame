import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Round 7, item 20 (home shopping): how many of a thing in the basket
 * (− 1 +), one order in one van ("Your delivery is outside: N items ·
 * Unpack all"), and what you unpack goes straight to placing: a painting is
 * never hung before you pick where. No empty "Games with other players".
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;

async function command(p: Page, command: unknown) {
  const r = await p.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { result: Record<string, unknown> };
}

async function founder(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const h = `hs_${letters(8)}`;
  await command(page, {
    type: 'player.create',
    handle: h,
    name: 'Ife Shopper',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'lagos',
    gender: 'female',
    company: {
      name: `Van ${h.slice(3)}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  });
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

async function home(page: Page) {
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  return scene;
}

const waiting = (v: PlayerView) =>
  v.living.deliveries.filter((d) => d.owner === v.me.id && !d.complete);

test('three plants in the basket: one van, Unpack all, three plants placed and owned', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await founder(page);
  const scene = await home(page);
  await scene.getByRole('button', { name: 'Buy' }).click();
  const sheet = page.getByRole('dialog', { name: 'Buy mode' });
  await sheet.locator('[data-buy-tab="all"]').click();
  await sheet.locator('[data-action="pick-several"]').click();
  await sheet.locator('[data-buy-item="plants-1"]').click();
  const line = sheet.locator('[data-basket-line="plants-1"]');
  await expect(line).toHaveAttribute('data-qty', '1');
  await line.locator('[data-action="qty-up"]').click();
  await line.locator('[data-action="qty-up"]').click();
  await expect(line).toHaveAttribute('data-qty', '3');
  await line.locator('[data-action="qty-down"]').click();
  await line.locator('[data-action="qty-up"]').click();
  const basket = sheet.locator('.buy-basket');
  const price = (await state(page)).me.shop!.prices['plants-1']!;
  await expect(basket).toHaveAttribute('data-count', '3');
  await expect(basket).toHaveAttribute('data-total', String(3 * price));
  await expect(basket).toContainText('3 in basket');
  const before = (await state(page)).accounts.local!.balance;
  await basket.locator('[data-action="buy-all"]').click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });

  // One order, one van: three deliveries riding together, arriving together.
  const v = await state(page);
  const ds = waiting(v);
  expect(ds).toHaveLength(3);
  expect(new Set(ds.map((d) => (d as { van?: string }).van)).size).toBe(1);
  expect(new Set(ds.map((d) => d.arrivesAt)).size).toBe(1);
  expect(v.accounts.local!.balance).toBe(before - 3 * price);

  // The first is placed now (the spot kept for the van).
  const bar = scene.getByRole('toolbar', { name: /Place/ });
  await expect(bar).toBeVisible();
  await scene.getByRole('button', { name: 'Keep this spot' }).click();
  await expect(bar).toBeHidden();

  // The van: on its way, then outside with all three.
  const banner = scene.locator('.home-delivery-banner[data-van]');
  await expect(banner).toHaveAttribute('data-van-items', '3');
  await expect(banner).toHaveAttribute('data-van-state', 'outside', { timeout: 45_000 });
  await expect(banner).toContainText('Your delivery is outside: 3 items');
  await banner.getByRole('button', { name: 'Unpack all' }).click();
  await expect(banner).toBeHidden({ timeout: 10_000 });
  expect(waiting(await state(page))).toHaveLength(0);

  // Straight to placing the two more (the first keeps the spot you chose).
  await expect(scene).toHaveAttribute('data-extras', '2');
  const placedKeys: string[] = [];
  for (let n = 1; n <= 2; n++) {
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(scene).toHaveAttribute('data-placing', /^plants#/);
    const key = (await scene.getAttribute('data-placing'))!;
    expect(placedKeys).not.toContain(key);
    placedKeys.push(key);
    await bar.getByRole('button', { name: 'Put it here' }).click();
  }
  await expect(bar).toBeHidden();
  const after = await state(page);
  // Each has its own spot.
  for (const k of placedKeys)
    expect(
      await page.evaluate(([id, k]) => localStorage.getItem(`runway.place.${id}.${k}`), [
        after.me.id,
        k,
      ] as const),
    ).not.toBeNull();
  expect(after.me.home!.items.filter((i) => i.itemId === 'plants-1')).toHaveLength(1);
  expect(after.me.homeStyle!.extras.map((x) => x.itemId)).toEqual(['plants-1', 'plants-1']);
  await scene.getByRole('button', { name: 'Buy' }).click();
  await expect(sheet.locator('[data-buy-item="plants-1"] [data-have]')).toHaveAttribute(
    'data-have',
    '3',
  );
});

test('a painting ordered online is unpacked straight into placing it, never hung for you', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await founder(page);
  const r = await command(page, { type: 'home.order', itemId: 'art-1', delivery: 'express' });
  await page.waitForTimeout(Math.max(0, (r.result.arrivesAt as number) - Date.now() + 1000));

  // Home and social: no empty "Games with other players", the van at the door.
  const scene = await home(page);
  const banner = scene.locator('.home-delivery-banner[data-van]');
  await expect(banner).toContainText('Your delivery is outside: 1 item');
  await banner.getByRole('button', { name: 'Unpack all' }).click();
  const bar = scene.getByRole('toolbar', { name: /Place/ });
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await expect(bar).toHaveAttribute('data-on-wall', '1');
  await expect(scene).toHaveAttribute('data-placing', 'art');
  await bar.getByRole('button', { name: 'Hang it here' }).click();
  await expect(bar).toBeHidden();
  const me = (await state(page)).me;
  const spot = await page.evaluate((id) => localStorage.getItem(`runway.place.${id}.art`), me.id);
  expect(spot).not.toBeNull();
});

test('Home and social: no empty "Games with other players" heading; a van with Unpack all', async ({
  page,
}) => {
  await founder(page);
  await command(page, {
    type: 'shop.order',
    lines: [
      { kind: 'furniture', itemId: 'rug-1', qty: 2 },
      { kind: 'furniture', itemId: 'lights-1', qty: 1 },
    ],
    delivery: 'express',
  });
  const v = await state(page);
  expect(v.playRooms.filter((r) => r.status === 'waiting' || r.status === 'playing')).toHaveLength(
    0,
  );
  // Me → Home & friends.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Me/ }).click();
  await page.locator('[data-open-living]').click();
  const sheet = page.getByRole('dialog', { name: 'Home and social experiences' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Games with other players' })).toHaveCount(0);
  const van = sheet.locator('.living-delivery[data-van]');
  await expect(van).toHaveCount(1);
  await expect(van).toHaveAttribute('data-van-items', '3');
});
