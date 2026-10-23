import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * The bigger mall (player feedback: "more stores and more items to buy … and
 * that you can invite someone and take them shopping"): sixteen shops; in
 * Lite, buy in a few of the new ones (shoes, books, the pharmacy); in 3D,
 * walk up to a storefront and buy from its list; take an AI friend shopping
 * (they say yes at once and walk with you) and buy them a gift: you pay, it's
 * theirs. SHOTS_DIR=… saves pictures for review.
 */
const DIR = process.env.SHOTS_DIR;
test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

interface State {
  accounts: { local: { balance: number } };
  me: {
    mall?: {
      shops?: string[];
      bag?: { item: string }[];
      trip?: { status: string; friend: { id: string; name: string }; gifts: { item: string }[] };
    };
    wardrobe?: { items: { item: string }[] };
  };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view as State;
  });
const snap = async (page: Page, name: string, wait = 600) => {
  if (!DIR) return;
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${DIR}/mall-more-${name}.png` });
};

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
    name: 'Ada Shops',
    handle: `more_${letters(6)}`,
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

test('sixteen shops in Lite: buy trainers, a novel and a toothbrush', async ({ page }) => {
  test.setTimeout(180_000);
  const scene = await toMall(page, 'lite');
  await expect(scene).toHaveAttribute('data-mall-mode', '2d');
  await expect(scene.locator('[data-shop]')).toHaveCount(16);
  await snap(page, 'lite-1-directory');
  const start = (await state(page)).accounts.local.balance;
  let spent = 0;
  for (const [shop, item] of [
    ['shoes', 'shoe-trainers'],
    ['books', 'book-novel'],
    ['pharmacy', 'ph-toothcare'],
  ] as const) {
    await scene.locator(`[data-shop="${shop}"]`).click();
    await expect(scene).toHaveAttribute('data-mall-shop', shop);
    // A good range in each.
    expect(await scene.locator('.mall-items li').count()).toBeGreaterThanOrEqual(8);
    await snap(page, `lite-2-${shop}`);
    const buy = scene.locator(`[data-buy="${item}"]`);
    const price = Number(
      (await scene.evaluate(
        (_, id) =>
          fetch('/api/state', { headers: { 'x-runway': '1' } })
            .then((r) => r.json())
            .then(
              (s) =>
                (s.view.me.mall.items as { id: string; price: number }[]).find((i) => i.id === id)
                  ?.price ?? 0,
            ),
        item,
      )) as number,
    );
    expect(price).toBeGreaterThan(0);
    await buy.click();
    const bought = scene.locator(`[data-mall-bought="${item}"]`);
    await expect(bought).toBeVisible({ timeout: 10_000 });
    spent += price;
    // Shoes go on you (and in your wardrobe); a novel in your bag.
    if (shop === 'shoes') await expect(bought).toContainText('wearing it');
    if (shop === 'books') await expect(bought).toContainText('in your bag');
    await snap(page, `lite-3-bought-${shop}`);
    await bought.locator('[data-action="mall-ok"]').click();
    await scene.locator('[data-action="mall-back"]').click();
  }
  await expect
    .poll(async () => (await state(page)).accounts.local.balance, { timeout: 10_000 })
    .toBe(start - spent);
  const s = await state(page);
  expect(s.me.mall?.bag?.map((b) => b.item) ?? []).toEqual(['book-novel']);
  expect(s.me.wardrobe?.items.map((b) => b.item)).toEqual(['shoe-trainers']);
});

test('take an AI friend shopping and buy them a gift (Lite)', async ({ page }) => {
  test.setTimeout(180_000);
  const scene = await toMall(page, 'lite');
  await scene.locator('[data-action="mall-invite"]').click();
  const sheet = scene.locator('[data-mall-invite]');
  await expect(sheet).toBeVisible();
  const ai = sheet.locator('[data-mall-ai="1"]').first();
  await expect(ai).toBeVisible({ timeout: 10_000 });
  await ai.click();
  await snap(page, 'lite-4-invite');
  await sheet.locator('[data-action="mall-invite-send"]').click();
  // An AI friend says yes at once: they're with you.
  await expect(scene.locator('[data-mall-trip="together"]')).toBeVisible({ timeout: 10_000 });
  await expect(scene.locator('[data-mall-friend]')).toBeAttached();
  const s0 = await state(page);
  const friend = s0.me.mall!.trip!.friend;
  await snap(page, 'lite-5-together');
  // A bouquet from the toy and gift shop: you pay, it's theirs.
  await scene.locator('[data-shop="toys"]').click();
  await scene.locator('[data-gift="toy-flowers"]').click();
  const bought = scene.locator('[data-mall-bought="toy-flowers"]');
  await expect(bought).toBeVisible({ timeout: 10_000 });
  await expect(bought).toContainText(`A gift for ${friend.name}`);
  await snap(page, 'lite-6-gift');
  const s1 = await state(page);
  expect(s1.accounts.local.balance).toBeLessThan(s0.accounts.local.balance);
  expect(s1.me.mall!.trip!.gifts.map((g) => g.item)).toEqual(['toy-flowers']);
  // Not in your own bag: theirs.
  expect(s1.me.mall?.bag?.some((b) => b.item === 'toy-flowers')).toBe(false);
  await bought.locator('[data-action="mall-ok"]').click();
  await scene.locator('[data-action="mall-trip-leave"]').click();
  await expect(scene.locator('[data-mall-trip="none"]')).toBeVisible({ timeout: 10_000 });
});

test('3D: walk up to a storefront, buy from its list; a friend walks with you and gets a gift', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const scene = await toMall(page, '3d');
  await expect(scene).toHaveAttribute('data-mall-mode', '3d');
  await expect(scene.locator('[data-mall-walk="ready"]')).toBeAttached({ timeout: 90_000 });
  await snap(page, '3d-1-concourse', 2500);
  // Bring a friend first: they walk a step behind you.
  await scene.locator('[data-action="mall-invite"]').click();
  await scene.locator('[data-mall-invite] [data-mall-ai="1"]').first().click();
  await scene.locator('[data-action="mall-invite-send"]').click();
  await expect(scene.locator('[data-mall-trip="together"]')).toBeVisible({ timeout: 10_000 });
  // The beauty counter by the escalators: the directory walks you there and its list opens.
  await scene.locator('[data-action="directory"]').click();
  await scene.locator('[data-dir-shop="beauty"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'beauty', { timeout: 60_000 });
  const shelf = scene.locator('[data-mall-shelf="beauty"]');
  await expect(shelf).toBeVisible({ timeout: 10_000 });
  await snap(page, '3d-2-beauty-list', 2500);
  await shelf.locator('[data-shelf-item="bty-perfume"]').click();
  const card = scene.locator('[data-item-card="bty-perfume"]');
  await expect(card).toBeVisible();
  const price = Number(await card.getAttribute('data-price'));
  const before = (await state(page)).accounts.local.balance;
  await card.locator('[data-action="buy-now"]').click();
  await expect(scene.locator('[data-mall-receipt="1"]')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await state(page)).accounts.local.balance, { timeout: 10_000 })
    .toBe(before - price);
  await scene.locator('[data-action="keep-shopping"]').click();
  // A gift from the same list: a lipstick for your friend.
  await scene.locator('[data-action="mall-shelf"]').click();
  await scene.locator('[data-shelf-item="bty-lipstick"]').click();
  await scene.locator('[data-item-card="bty-lipstick"] [data-action="gift-now"]').click();
  const receipt = scene.locator('[data-mall-receipt="1"]');
  await expect(receipt).toBeVisible({ timeout: 20_000 });
  await expect(receipt).toHaveAttribute('data-gift-for', /.+/);
  await snap(page, '3d-3-gift-receipt', 1500);
  expect((await state(page)).me.mall!.trip!.gifts.map((g) => g.item)).toEqual(['bty-lipstick']);
  await scene.locator('[data-action="keep-shopping"]').click();
  // More storefronts, for the pictures.
  for (const s of ['sports', 'arcade', 'outlet']) {
    await scene.locator('[data-action="directory"]').click();
    await scene.locator(`[data-dir-shop="${s}"]`).click();
    await expect(scene).toHaveAttribute('data-mall-shop', s, { timeout: 60_000 });
    await expect(scene.locator(`[data-mall-shelf="${s}"]`)).toBeVisible({ timeout: 10_000 });
    await snap(page, `3d-4-${s}`, 2500);
    await scene.locator(`[data-mall-shelf="${s}"]`).getByRole('button', { name: 'Close' }).click();
    await snap(page, `3d-5-${s}-front`, 2000);
  }
  await scene.locator('[data-action="look-around"]').click();
  await snap(page, '3d-6-look-around', 2500);
});
