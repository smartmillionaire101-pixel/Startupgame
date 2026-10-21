import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  tab,
  tapPlace,
  test,
  type Page,
} from './fixtures';

/**
 * The wardrobe (player feedback: "character should be able to wear what they
 * buy and they should have a look at what they have bought"): buy a T-shirt
 * in two colours, boots, a watch, a necklace, a tote and a novel at the mall
 * (Lite); everything to wear is on you and in My purchases, from the mall's
 * header and from Me; put the first T-shirt back on free, take the watch off.
 * Screenshots of the wardrobe and the figure wearing things go to the test's
 * output folder.
 */
test.use({ viewport: { width: 390, height: 844 } });

interface State {
  accounts: { local: { balance: number } };
  me: {
    appearance: Record<string, string> | null;
    mall?: { bag?: { item: string }[] };
    wardrobe?: { on: boolean; items: { item: string; colour: string | null; wearing: boolean }[] };
  };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view as State;
  });

/** Screenshots without the toasts over them. */
const noToasts = (page: Page) => expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });

const RED = '#dc2626';
const BLUE = '#2563eb';

async function buy(page: Page, shop: string, item: string, colour?: string) {
  const scene = page.locator('.mall-scene');
  await scene.locator(`[data-shop="${shop}"]`).click();
  await expect(scene).toHaveAttribute('data-mall-shop', shop);
  if (colour) await scene.locator(`[data-colour="${colour}"]`).click();
  await scene.locator(`[data-buy="${item}"]`).click();
  const bought = scene.locator(`[data-mall-bought="${item}"]`);
  await expect(bought).toBeVisible({ timeout: 10_000 });
  await bought.locator('[data-action="mall-ok"]').click();
  await scene.locator('[data-action="mall-back"]').click();
}

test('buy clothes, see them in My purchases, wear an earlier one free', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.mapQuality', 'lite');
    } catch {
      /* storage blocked */
    }
  });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Wardrobe',
    handle: `ward_${letters(6)}`,
    company: `Closet ${letters(5)}`,
    idea: 'Outfits on demand',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-place="mall"]').first()).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, '[data-place="mall"]', 'cycle');
  const scene = page.locator('.mall-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });

  // A T-shirt in red, then the same T-shirt in blue: both are yours.
  await buy(page, 'fashion', 'top-tee', RED);
  await buy(page, 'fashion', 'top-tee', BLUE);
  // Boots, a watch, a necklace and a tote go on you; a novel goes in your bag.
  await buy(page, 'shoes', 'shoe-boots');
  await buy(page, 'jewellery', 'jew-watch');
  await buy(page, 'jewellery', 'jew-necklace');
  await buy(page, 'outlet', 'out-tote');
  await buy(page, 'books', 'book-novel');
  const s0 = await state(page);
  expect(s0.me.appearance).toMatchObject({
    topStyle: 'tee',
    topColor: BLUE,
    shoes: 'boots',
    watch: 'everyday',
    necklace: 'silver',
    bag: 'tote',
  });
  expect(s0.me.wardrobe!.items).toHaveLength(6);
  expect(s0.me.mall!.bag!.map((b) => b.item)).toEqual(['book-novel']);

  // The red T-shirt is yours already: the shop offers it free.
  await scene.locator('[data-shop="fashion"]').click();
  await scene.locator(`[data-colour="${RED}"]`).click();
  await expect(scene.locator('[data-wear-owned="top-tee"]')).toBeVisible();
  await expect(scene.locator('[data-buy="top-tee"]')).toHaveCount(0);
  await scene.locator(`[data-colour="${BLUE}"]`).click();
  await scene.locator('[data-action="mall-back"]').click();

  // My purchases, from the mall's header.
  await scene.locator('[data-action="mall-purchases"]').click();
  const sheet = page.getByRole('dialog', { name: 'My purchases' });
  await expect(sheet).toBeVisible();
  const card = (item: string, colour = '', within = sheet) =>
    within.locator(`[data-wardrobe-item="${item}"][data-colour="${colour}"]`);
  await expect(sheet.locator('[data-wardrobe-item]')).toHaveCount(6);
  await expect(card('top-tee', BLUE)).toHaveAttribute('data-wearing', '1');
  await expect(card('top-tee', RED)).toHaveAttribute('data-wearing', '0');
  await expect(card('shoe-boots')).toHaveAttribute('data-wearing', '1');
  await expect(sheet.locator('[data-thing="book-novel"]')).toBeVisible();
  // Your outfit shows on your figure.
  const outfit = sheet.locator('[data-outfit] .city-avatar-fig');
  await expect(outfit).toHaveAttribute('data-shoes', 'boots');
  await expect(outfit).toHaveAttribute('data-watch', 'everyday');
  await expect(outfit).toHaveAttribute('data-bag', 'tote');
  await expect(outfit).toHaveAttribute('data-necklace', 'silver');
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('wardrobe-1-mall.png') });

  // Back into the red T-shirt: free.
  const before = (await state(page)).accounts.local.balance;
  await card('top-tee', RED).locator('[data-wear]').click();
  await expect(card('top-tee', RED)).toHaveAttribute('data-wearing', '1', { timeout: 10_000 });
  await expect(card('top-tee', BLUE)).toHaveAttribute('data-wearing', '0');
  await expect(outfit).toHaveAttribute('data-top', RED);
  // The watch off, and back on.
  await card('jew-watch').locator('[data-take-off]').click();
  await expect(outfit).toHaveAttribute('data-watch', 'none', { timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('wardrobe-2-wore-red.png') });
  await card('jew-watch').locator('[data-wear]').click();
  await expect(outfit).toHaveAttribute('data-watch', 'everyday', { timeout: 10_000 });
  const s1 = await state(page);
  expect(s1.accounts.local.balance).toBe(before);
  expect(s1.me.appearance).toMatchObject({ topColor: RED, watch: 'everyday' });
  await sheet.locator('[data-wardrobe-item]').last().scrollIntoViewIfNeeded();
  await noToasts(page);
  await page.screenshot({ path: info.outputPath('wardrobe-3-list.png') });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // In the mall, you're wearing it all.
  const me = scene.locator('.city-avatar-fig[data-shoes="boots"]').first();
  await expect(me).toBeAttached({ timeout: 10_000 });
  await scene.getByRole('button', { name: 'Close' }).first().click();
  await expect(scene).toBeHidden();

  // And from Me.
  await tab(page, 'Me').click();
  await page.locator('[data-open-purchases]').click();
  const again = page.getByRole('dialog', { name: 'My purchases' });
  await expect(again.locator('[data-wardrobe-item]')).toHaveCount(6);
  await expect(again.locator('[data-outfit] .city-avatar-fig')).toHaveAttribute('data-top', RED);
  await noToasts(page);
  await page.screenshot({ path: info.outputPath('wardrobe-4-me.png') });
  await again.getByRole('button', { name: 'Close' }).click();

  // And on the phone: the My purchases app.
  await tab(page, 'City').click();
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="purchases"]').click();
  await expect(phone.locator('[data-wardrobe-item]')).toHaveCount(6);
  await expect(phone.locator('[data-outfit] .city-avatar-fig')).toHaveAttribute('data-top', RED);
  await card('top-tee', BLUE, phone).locator('[data-wear]').click();
  await expect(phone.locator('[data-outfit] .city-avatar-fig')).toHaveAttribute('data-top', BLUE, {
    timeout: 10_000,
  });
  await noToasts(page);
  await page.screenshot({ path: info.outputPath('wardrobe-5-phone.png') });
});
