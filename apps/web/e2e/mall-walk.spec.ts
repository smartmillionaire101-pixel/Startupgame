import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * Walking the mall in 3D (software WebGL: slow, a few frames a second):
 * tap a shop's sign and you walk there and go in; tap an item's tag for its
 * card; Buy now pays from your pocket (the server's ledger says so); a
 * basket of two pays one after the other and one receipt lists both; the
 * food court's counters still sell food. Lite keeps the 2D directory.
 */
test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

interface State {
  accounts: { local: { balance: number } };
  me: { appearance?: { topStyle?: string; topColor?: string; headwear?: string } };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view as State;
  });

async function toMall(page: Page, quality: '3d' | 'lite') {
  await page.addInitScript((q) => {
    try {
      localStorage.setItem('runway.mapQuality', q);
    } catch {
      /* storage blocked */
    }
  }, quality);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Walks',
    handle: `walk_${letters(6)}`,
    company: `Aisle ${letters(5)}`,
    idea: 'Delivery for mall shops',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  if (quality === 'lite') {
    await expect(page.locator('[data-place="mall"]').first()).toBeAttached({ timeout: 20_000 });
    await tapPlace(page, '[data-place="mall"]', 'cycle');
  } else {
    // On the 3D map places may be off-screen: go by the Places list.
    await page
      .locator('.city-hud-bottom')
      .getByRole('button', { name: /^(Where to\?|Places)$/ })
      .click();
    await page.locator('[data-outing="mall"]').click();
    const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
    if (
      await chooser.waitFor({ timeout: 1500 }).then(
        () => true,
        () => false,
      )
    )
      await chooser.locator('[data-mode="cycle"]').click();
  }
  const scene = page.locator('.mall-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  return scene;
}

test('walk to a shop by its sign, open an item, Buy now pays from your pocket', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const scene = await toMall(page, '3d');
  await expect(scene).toHaveAttribute('data-mall-mode', '3d');
  await expect(scene.locator('[data-mall-walk="ready"]')).toBeAttached({ timeout: 90_000 });
  await expect(scene.locator('canvas[data-mall-3d]')).toHaveAttribute('data-ready', '1');
  await expect(scene).toHaveAttribute('data-mall-shop', 'concourse');

  // Tap the fashion shop's sign: you walk there ("Walking to … · n m") and go in.
  const sign = scene.locator('[data-shop-sign="fashion"]');
  await expect(sign).toBeVisible({ timeout: 20_000 });
  await sign.click();
  await expect(scene.locator('[data-walking="fashion"]')).toContainText(/Walking to .* · \d+ m/);
  await expect(scene).toHaveAttribute('data-mall-shop', 'fashion', { timeout: 60_000 });
  await expect(scene.locator('[data-action="mall-concourse"]')).toBeVisible();

  // Its stock is tagged with prices; the hoodie's card has colours.
  const tag = scene.locator('[data-item-tag="top-hoodie"]');
  await expect(tag).toBeVisible({ timeout: 20_000 });
  await expect(tag).toContainText(/Hoodie .*\d/);
  await tag.click();
  const card = scene.locator('[data-item-card="top-hoodie"]');
  await expect(card).toBeVisible();
  await card.locator('[data-colour="#f59e0b"]').click();
  await expect(card.locator('[data-colour="#f59e0b"]')).toHaveAttribute('aria-checked', 'true');
  const price = Number(await card.getAttribute('data-price'));
  expect(price).toBeGreaterThan(0);

  // Buy now: one mall.buy, paid from your personal account, a receipt and a toast.
  const before = (await state(page)).accounts.local.balance;
  await card.locator('[data-action="buy-now"]').click();
  const receipt = scene.locator('[data-mall-receipt="1"]');
  await expect(receipt).toBeVisible({ timeout: 20_000 });
  await expect(receipt.locator('[data-receipt-item="top-hoodie"]')).toContainText('wearing it now');
  await expect(scene.locator(`[data-paid-toast="${price}"]`)).toContainText('Paid');
  await expect
    .poll(async () => (await state(page)).accounts.local.balance, { timeout: 10_000 })
    .toBe(before - price);
  const me = (await state(page)).me.appearance;
  expect(me?.topStyle).toBe('hoodie');
  expect(me?.topColor).toBe('#f59e0b');
  // The header's pocket shows the new balance.
  await expect(scene.locator('[data-pocket]')).toHaveAttribute(
    'data-pocket',
    String(before - price),
  );
  await receipt.locator('[data-action="keep-shopping"]').click();
  await expect(receipt).toBeHidden();
});

test('a basket of two pays in one go, one receipt; the food court still sells food', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // Reduced motion: walking jumps.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scene = await toMall(page, '3d');
  await expect(scene.locator('[data-mall-walk="ready"]')).toBeAttached({ timeout: 90_000 });

  // The Directory takes you to a shop.
  await scene.locator('[data-action="directory"]').click();
  await expect(scene.locator('[data-mall-directory] [data-dir-shop]')).toHaveCount(6);
  await scene.locator('[data-dir-shop="fashion"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'fashion', { timeout: 20_000 });

  // A cap and a T-shirt in the basket.
  for (const [id, colour] of [
    ['acc-cap', null],
    ['top-tee', '#0f766e'],
  ] as const) {
    const tag = scene.locator(`[data-item-tag="${id}"]`);
    await expect(tag).toBeVisible({ timeout: 20_000 });
    await tag.click();
    const card = scene.locator(`[data-item-card="${id}"]`);
    await expect(card).toBeVisible();
    if (colour) await card.locator(`[data-colour="${colour}"]`).click();
    await card.locator('[data-action="add-basket"]').click();
    await expect(card).toBeHidden();
  }
  await expect(scene.locator('[data-basket-count]')).toHaveAttribute('data-basket-count', '2');
  await scene.locator('[data-action="basket"]').click();
  const basket = scene.locator('[data-mall-basket]');
  await expect(basket.locator('li')).toHaveCount(2);

  const before = (await state(page)).accounts.local.balance;
  await basket.locator('[data-action="checkout"]').click();
  const receipt = scene.locator('[data-mall-receipt="2"]');
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  await expect(receipt.locator('[data-receipt-item="acc-cap"]')).toBeVisible();
  await expect(receipt.locator('[data-receipt-item="top-tee"]')).toContainText('Teal');
  const total = Number(await receipt.getAttribute('data-total'));
  expect(total).toBeGreaterThan(0);
  await expect
    .poll(async () => (await state(page)).accounts.local.balance, { timeout: 10_000 })
    .toBe(before - total);
  const look = (await state(page)).me.appearance;
  expect(look?.topStyle).toBe('tee');
  expect(look?.headwear).toBe('cap');

  // Back out to the concourse (the basket's empty), then to the food court: its counters sell food.
  await receipt.locator('[data-action="receipt-concourse"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'concourse', { timeout: 20_000 });
  await expect(scene.locator('[data-basket-count]')).toHaveAttribute('data-basket-count', '0');
  await scene.locator('[data-action="directory"]').click();
  await scene.locator('[data-dir-shop="foodcourt"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'foodcourt', { timeout: 20_000 });
  const burger = scene.locator('[data-item-tag="burger"]');
  await expect(burger).toBeVisible({ timeout: 20_000 });
  await burger.click();
  const food = scene.locator('[data-item-card="burger"]');
  const fee = Number(await food.getAttribute('data-price'));
  const b0 = (await state(page)).accounts.local.balance;
  await food.locator('[data-action="buy-now"]').click();
  await expect(scene.locator('[data-receipt-item="burger"]')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await state(page)).accounts.local.balance, { timeout: 10_000 })
    .toBe(b0 - fee);

  // Look around: a compass, and Back to me.
  await scene.locator('[data-action="keep-shopping"]').click();
  await scene.locator('[data-action="look-around"]').click();
  await expect(scene.locator('[data-compass]')).toBeVisible();
  await expect(scene.locator('.mall-hud')).toHaveAttribute('data-looking', '1');
  await scene.locator('[data-action="back-to-me"]').click();
  await expect(scene.locator('[data-compass]')).toBeHidden();
});

test('Lite keeps the 2D mall and its directory', async ({ page }) => {
  test.setTimeout(120_000);
  const scene = await toMall(page, 'lite');
  await expect(scene).toHaveAttribute('data-mall-mode', '2d');
  await expect(scene.locator('canvas')).toHaveCount(0);
  await expect(scene.locator('.mall-2d')).toBeVisible();
  await expect(scene.locator('.mall-tray [data-shop]')).toHaveCount(6);
  await scene.locator('[data-shop="foodcourt"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'foodcourt');
  await expect(scene.locator('[data-buy="burger"]')).toBeVisible();
});
