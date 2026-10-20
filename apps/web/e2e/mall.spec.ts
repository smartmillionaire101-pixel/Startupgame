import { expect, letters, playAsGuest, setupFounder, tapPlace, test } from './fixtures';

/**
 * The mall (player feedback: "people should go to the malls to shop"): walk
 * to the city's mall, buy a new top in the fashion shop (you're wearing it)
 * and a phone in the electronics shop (it's yours), paid from your pocket.
 */
test('shop at the mall: a new outfit you wear, and a phone', async ({ page }) => {
  test.setTimeout(120_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Bisi Shops',
    handle: `bisi_${letters(6)}`,
    company: `Basket ${letters(5)}`,
    idea: 'Delivery for mall shops',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-place="mall"]').first()).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, '[data-place="mall"]', 'cycle');
  const scene = page.locator('.mall-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await expect(scene).toHaveAttribute('data-room', 'mall');
  const pocket = scene.locator('[data-pocket]');
  const start = Number(await pocket.getAttribute('data-pocket'));
  // Six shops in the directory.
  await expect(scene.locator('[data-shop]')).toHaveCount(6);

  // Fashion: pick a colour, try on a hoodie, buy it: you're wearing it.
  await scene.locator('[data-shop="fashion"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'fashion');
  await scene.locator('[data-colour="#db2777"]').click();
  await scene.locator('[data-buy="top-hoodie"]').click();
  const bought = scene.locator('[data-mall-bought="top-hoodie"]');
  await expect(bought).toBeVisible({ timeout: 10_000 });
  await expect(bought).toContainText('wearing it');
  await expect(bought.locator('[data-top-style="hoodie"]')).toBeAttached({ timeout: 10_000 });
  await expect(bought.locator('[data-top="#db2777"]')).toBeAttached();
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(start);
  const afterTop = Number(await pocket.getAttribute('data-pocket'));
  await bought.locator('[data-action="mall-ok"]').click();

  // Phones: a new phone is yours.
  await scene.locator('[data-action="mall-back"]').click();
  await scene.locator('[data-shop="phones"]').click();
  await expect(scene).toHaveAttribute('data-mall-shop', 'phones');
  await scene.locator('[data-buy="phone-1"]').click();
  await expect(scene.locator('[data-mall-bought="phone-1"]')).toBeVisible({ timeout: 10_000 });
  await expect(scene.locator('[data-buy="phone-1"]')).toHaveText('Yours');
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(afterTop);
  await scene.getByRole('button', { name: 'Close' }).click();
  await expect(scene).toBeHidden();
  // Out in the city you're in your new hoodie.
  await expect(page.locator('[data-top-style="hoodie"]').first()).toBeAttached({ timeout: 10_000 });
});
