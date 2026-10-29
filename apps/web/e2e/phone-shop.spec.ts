import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Round 7, item 22: on a phone the online catalogue is one tap away: its own
 * Shop button on the home's rail (never behind ⋯), in Buy mode, and the
 * phone's Shop app. Item 20 there too: how many (− 1 +) of a thing, and the
 * order comes in one van.
 */
test.use({ viewport: { width: 390, height: 844 } });

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;

async function founder(page: Page) {
  await playAsGuest(page);
  const h = `ps_${letters(8)}`;
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: {
      command: {
        type: 'player.create',
        handle: h,
        name: 'Kemi Phone',
        role: 'founder',
        backgroundId: 'f-engineer',
        market: 'lagos',
        gender: 'female',
        company: {
          name: `Cart ${h.slice(3)}`,
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
}

test('on a phone: Shop on the home rail and in Buy mode, and two plants from the Shop app in one van', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await founder(page);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });

  // The rail's own button, visible without opening ⋯.
  const rail = scene.locator('[data-hud-rail]');
  await expect(rail.locator('[data-hud-more]')).toHaveAttribute('aria-expanded', 'false');
  const shop = rail.locator('[data-action="shop-online"]');
  await expect(shop).toBeVisible();
  await expect(rail.locator('.hud-rail-extra [data-action="shop-online"]')).toHaveCount(0);
  await shop.click();
  const sheet = page.locator('[data-catalogue-sheet]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-catalogue="online"]')).toBeVisible();
  await expect(sheet.getByRole('heading', { name: /Shop online/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // In Buy mode too.
  await scene.getByRole('button', { name: 'Buy' }).click();
  const buy = page.getByRole('dialog', { name: 'Buy mode' });
  await expect(buy).toBeVisible();
  await buy.locator('[data-action="shop-online"]').click();
  await expect(buy).toBeHidden();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();

  // And the phone's Shop app: two plants, one van, the fee once.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="shop"]').click();
  await expect(phone.locator('[data-phone-app="shop"]')).toBeVisible();
  await phone.locator('[data-cat-entry="furn:plants"]').click();
  const item = phone.locator('[data-cat-item="furn:plants"]');
  await item.locator('[data-group="variant"] [data-option="plants-1"]').click();
  const qty = item.locator('[data-cat-qty]');
  await expect(qty).toHaveAttribute('data-cat-qty', '1');
  await qty.locator('[data-action="qty-up"]').click();
  await expect(qty).toHaveAttribute('data-cat-qty', '2');
  await item.locator('[data-action="checkout"]').click();
  const checkout = phone.locator('[data-checkout="furn:plants"]');
  await expect(checkout.locator('.cat-line-price')).toHaveAttribute('data-qty', '2');
  const fee = Number(await checkout.locator('[data-fee]').getAttribute('data-fee'));
  const s0 = await state(page);
  const price = s0.me.shop!.prices['plants-1']!;
  await expect(checkout.locator('dd[data-total]')).toHaveAttribute(
    'data-total',
    String(2 * price + fee),
  );
  await checkout.locator('[data-action="place-order"]').click();
  await expect(phone.locator('[data-order-placed]')).toBeVisible();
  const s1 = await state(page);
  const ds = s1.living.deliveries.filter((d) => d.owner === s1.me.id && !d.complete);
  expect(ds).toHaveLength(2);
  expect(new Set(ds.map((d) => (d as { van?: string }).van)).size).toBe(1);
  expect(s0.accounts.local!.balance - s1.accounts.local!.balance).toBe(2 * price + fee);
});
