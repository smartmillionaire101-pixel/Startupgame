import { priceWithOptions, groupsFor, type PlayerView } from '@runway/engine';
import {
  expect,
  letters,
  openTogether,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
  type Page,
} from './fixtures';

/**
 * Player feedback, round two: shopping online (the Shop app, a delivery fee
 * and a wait), a catalogue with pictures, options and their prices, and
 * walls and dividers to split the home into rooms.
 *
 * SHOP_SHOTS=<dir> saves phone-size screenshots of each step.
 */
// Software WebGL, so the catalogue's 3D pictures and the 3D home draw on CI.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const SHOTS = process.env.SHOP_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

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
  await setupFounder(page, {
    name: 'Ada Shopper',
    handle: `shop_${letters(8)}`,
    company: `Cart ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function openShop(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="shop"]').click();
  await expect(phone.locator('[data-phone-app="shop"]')).toBeVisible();
  return phone;
}

test('shop online: groceries with express delivery, paid with a fee, unpacked at home', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await founder(page);
  const s0 = await state(page);
  const phone = await openShop(page);
  await expect(phone.locator('[data-catalogue="online"]')).toBeVisible();
  await expect(phone.locator('[data-cat-entry]').first()).toBeVisible();
  await shot(page, '1-online-shop');

  // Groceries: the weekly shop, the premium brand.
  await phone.locator('[data-category="groceries"]').click();
  await phone.locator('[data-cat-entry="mall:groceries"]').click();
  const item = phone.locator('[data-cat-item="mall:groceries"]');
  await item.locator('[data-group="variant"] [data-option="groceries-week"]').click();
  await item.locator('[data-group="brand"] [data-option="premium"]').click();
  const base = s0.me.shop!.prices['groceries-week']!;
  const price = priceWithOptions(base, groupsFor('mall', 'groceries-week'), {
    brand: 'premium',
  }).price;
  await expect(item.locator('.cat-price')).toHaveAttribute('data-price', String(price));
  await item.locator('[data-action="checkout"]').click();

  // Checkout: express is dearer and quicker; the total is the item and the fee.
  const checkout = phone.locator('[data-checkout="mall:groceries"]');
  await checkout.locator('[data-speed="express"]').click();
  const fee = Number(await checkout.locator('[data-fee]').getAttribute('data-fee'));
  expect(fee).toBeGreaterThan(0);
  await expect(checkout.locator('dd[data-total]')).toHaveAttribute(
    'data-total',
    String(price + fee),
  );
  await shot(page, '3-checkout-with-delivery');
  await checkout.locator('[data-action="place-order"]').click();
  await expect(phone.locator('[data-order-placed]')).toBeVisible();
  const s1 = await state(page);
  expect(s0.accounts.local!.balance - s1.accounts.local!.balance).toBe(price + fee);
  const order = s1.living.deliveries.find((d) => d.owner === s1.me.id && !d.complete)!;
  expect(order.order).toMatchObject({ speed: 'express', fee, price, category: 'groceries' });

  // Track it: on its way, then at the door.
  await phone.locator('[data-action="track-order"]').click();
  const row = phone.locator(`[data-order="${order.id}"]`);
  await expect(row).toHaveAttribute('data-state', 'coming');
  await expect(row).toHaveAttribute('data-state', 'arrived', { timeout: 40_000 });
  await row.locator('[data-action="unpack"]').click();
  const home = await openTogether(page);
  await home.getByRole('button', { name: 'Unpack delivery' }).click();
  await expect(home.getByText('No deliveries on the way.')).toBeVisible();
  const s2 = await state(page);
  expect(s2.living.deliveries.find((d) => d.id === order.id)!.complete).toBe(true);
  await home.getByRole('button', { name: 'Close home experiences' }).click();
  const again = await openShop(page);
  await again.locator('[data-tab="orders"]').click();
  await expect(again.locator(`[data-order="${order.id}"]`)).toHaveAttribute(
    'data-state',
    'unpacked',
  );
  await shot(page, '4-delivered-item');
});

test('the catalogue: every option has its price, filters and sorting by price', async ({
  page,
}) => {
  await founder(page);
  const s = await state(page);
  const phone = await openShop(page);
  // Sorted by price, low to high.
  await phone.getByRole('combobox', { name: 'Sort' }).selectOption('price-up');
  const prices = await phone
    .locator('[data-cat-entry]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-price'))));
  expect(prices.length).toBeGreaterThan(20);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));

  // A sofa: quality tiers and finishes, each with its own price.
  await phone.locator('[data-category="home"]').click();
  await phone.locator('[data-cat-entry="furn:sofa"]').click();
  const item = phone.locator('[data-cat-item="furn:sofa"]');
  const groups = groupsFor('furniture', 'sofa-3');
  for (const tier of [1, 2, 3]) {
    const p = priceWithOptions(s.me.shop!.prices[`sofa-${tier}`]!, groups, {}).price;
    await expect(
      item.locator(`[data-group="variant"] [data-option="sofa-${tier}"]`),
    ).toHaveAttribute('data-price', String(p));
  }
  // Each finish shows what the sofa costs in it.
  for (const o of groups[0]!.options)
    await expect(item.locator(`[data-group="finish"] [data-option="${o.id}"]`)).toHaveAttribute(
      'data-price',
      String(priceWithOptions(s.me.shop!.prices['sofa-1']!, groups, { finish: o.id }).price),
    );
  await item.locator('[data-group="variant"] [data-option="sofa-3"]').click();
  await item.locator('[data-group="finish"] [data-option="walnut"]').click();
  const luxuryWalnut = priceWithOptions(s.me.shop!.prices['sofa-3']!, groups, {
    finish: 'walnut',
  }).price;
  await expect(item.locator('.cat-price')).toHaveAttribute('data-price', String(luxuryWalnut));
  expect(luxuryWalnut).toBeGreaterThan(s.me.shop!.prices['sofa-3']!);
  // Its picture: drawn from the game's 3D sofa (or its illustration without WebGL).
  await expect(item.locator('.cat-thumb')).toHaveAttribute('data-thumb', /3d|icon/);
  await item.locator('.cat-thumb').scrollIntoViewIfNeeded();
  await shot(page, '2-catalogue-item-options');

  // Walls & dividers is a category of its own.
  await item.getByRole('button', { name: '← Catalogue' }).click();
  await phone.locator('[data-category="walls"]').click();
  await expect(phone.locator('[data-cat-entry^="wall:"]')).toHaveCount(5);
  await shot(page, '5-walls-category');
});

test('a wall: ordered, unpacked, put up in Buy mode at home', async ({ page }) => {
  test.setTimeout(150_000);
  await founder(page);
  const r = await command(page, {
    type: 'home.wall.buy',
    kind: 'glass',
    length: 3,
    options: { finish: 'frosted' },
    delivery: 'express',
  });
  const arrives = r.result.arrivesAt as number;
  const id = r.result.id as string;
  await page.waitForTimeout(Math.max(0, arrives - Date.now() + 1500));
  await command(page, { type: 'living.collect', deliveryId: id });
  const wall = (await state(page)).me.home.walls![0]!;
  expect(wall).toMatchObject({ kind: 'glass', len: 3, finish: 'frosted' });

  await page.reload();
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await scene.getByRole('button', { name: 'Buy' }).click();
  await page.locator('[data-buy-tab="walls"]').click();
  const row = page.locator(`[data-wall="${wall.id}"]`);
  await expect(row).toHaveAttribute('data-placed', '0');
  await row.locator('[data-action="place-wall"]').click();
  // Between the living room and the kitchen: tap a tile, turn it to run along y.
  await expect(scene.locator('.home-wall-ghost')).toBeVisible();
  await scene.locator('rect[data-tile="6,6"]').click();
  await scene.getByRole('button', { name: /Turn/ }).click();
  await expect(scene.locator('.home-wall-ghost')).toHaveAttribute('data-ok', '1');
  await scene.getByRole('button', { name: 'Put it here' }).click();
  await expect(scene).toHaveAttribute('data-dividers', '1');
  const placed = (await state(page)).me.home.walls![0]!;
  expect(placed).toMatchObject({ dir: 'v', floor: 0 });
  expect(placed.x).toBeGreaterThan(0);
  await expect(scene.locator(`[data-divider="${wall.id}"]`)).toBeAttached();

  // Room names show only while editing (Buy or Edit), not when you're just at home.
  await command(page, { type: 'home.room.label', floor: 0, x: 3, y: 3, label: 'Lounge' });
  await page.reload();
  await tapPlace(page, '[data-place="home"]', 'cycle');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await expect(scene.locator('[data-room-name="Lounge"]')).toHaveCount(0);
  await scene.getByRole('button', { name: 'Buy' }).click();
  await expect(scene.locator('[data-room-name="Lounge"]')).toBeAttached();
});
