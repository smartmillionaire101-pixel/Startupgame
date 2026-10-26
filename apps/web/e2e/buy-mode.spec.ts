import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Buy mode at home as a picture catalogue (the feedback round): the home
 * stays in view above a dark panel; cards with the thing's picture,
 * footprint, stars, price and what it does for you; Owned and Design tabs
 * (floors and paint, try one on and keep it); and Pick several, a basket
 * and Buy all (one order each, through the ledger).
 *
 * BUY_SHOTS=<dir> saves phone-size screenshots of each step.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const SHOTS = process.env.BUY_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;

async function founder(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `buy_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Bola Buyer',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Nest ${h.slice(4)}`,
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
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

test('Buy mode: picture cards, Owned, Design swatches, and a basket bought at once', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await founder(page);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await scene.getByRole('button', { name: 'Buy' }).click();
  const sheet = page.getByRole('dialog', { name: 'Buy mode' });
  await expect(sheet).toBeVisible();

  // Picture cards: the living room's things, each with its rendered picture.
  const cards = sheet.locator('[data-buy-item]');
  await expect(cards.first()).toBeVisible();
  const sofa = sheet.locator('[data-buy-item="sofa-2"]');
  await expect(sofa.locator('img')).toHaveAttribute('src', /\/thumbs\/furniture\/sofa-2\.webp$/);
  await expect
    .poll(() => sofa.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await expect(sofa.locator('.buy-foot')).toHaveText('3×1');
  await expect(sofa.locator('.buy-stars')).toHaveText('★★');
  await expect(sofa.locator('.buy-boost')).toContainText('+Social +2');
  // New: the next step up in each slot (the basic one where you have none).
  await expect(sheet.locator('[data-buy-item="sofa-1"]')).toHaveAttribute('data-new', '1');
  await shot(page, '1-catalogue');

  // Owned: only what you have (a new flat may have nothing yet).
  await sheet.locator('[data-buy-tab="owned"]').click();
  const ownedCards = await sheet.locator('[data-buy-item]').count();
  if (ownedCards === 0) await expect(sheet.locator('.buy-empty')).toBeVisible();
  else await expect(sheet.locator('[data-buy-item][data-owned="0"]')).toHaveCount(0);

  // Design: floors and paint as swatches; try a free paint on and keep it.
  await sheet.locator('[data-buy-tab="design"]').click();
  await expect(sheet.locator('[data-finish^="floor:"]').first()).toBeVisible();
  expect(await sheet.locator('[data-finish^="floor:"]').count()).toBeGreaterThanOrEqual(10);
  await expect(sheet.locator('[data-swatches="floor"] [data-state="now"]')).toHaveCount(1);
  await expect(sheet.locator('[data-finish="floor:marble"]')).toHaveAttribute(
    'data-state',
    'price',
  );
  await expect(sheet.locator('[data-finish="wall:sage"]')).toHaveAttribute('data-state', 'yours');
  await shot(page, '2-design');
  await sheet.locator('[data-finish="wall:sage"]').click();
  await expect(sheet.locator('[data-trying="wall:sage"]')).toBeVisible();
  await sheet.locator('[data-action="apply-finish"]').click();
  await expect.poll(async () => (await state(page)).me.homeStyle?.chosen.wall).toBe('sage');
  await expect(sheet.locator('[data-finish="wall:sage"]')).toHaveAttribute('data-state', 'now');

  // Pick several: the basket fills, its total adds up, and Buy all orders each.
  await sheet.locator('[data-buy-tab="all"]').click();
  await sheet.locator('[data-action="pick-several"]').click();
  const basket = sheet.locator('.buy-basket');
  await expect(basket).toContainText('Basket empty');
  await expect(basket.locator('[data-action="buy-all"]')).toBeDisabled();
  await shot(page, '3-basket-empty');
  const view = await state(page);
  const prices = view.me.shop!.prices;
  await sheet.locator('[data-buy-item="plants-1"]').click();
  await sheet.locator('[data-buy-item="art-1"]').click();
  // One per slot: picking another tier of plants swaps it.
  await sheet.locator('[data-buy-item="plants-2"]').click();
  await sheet.locator('[data-buy-item="plants-1"]').click();
  await expect(sheet.locator('[data-buy-item="plants-2"]')).toHaveAttribute('data-picked', '0');
  await expect(basket).toHaveAttribute('data-basket', '2');
  await expect(basket).toHaveAttribute(
    'data-total',
    String(prices['plants-1']! + prices['art-1']!),
  );
  await expect(basket).toContainText('2 in basket');
  await shot(page, '4-basket');
  const before = view.accounts.local!.balance;
  await basket.locator('[data-action="buy-all"]').click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
  const after = await state(page);
  const mine = after.living.deliveries.filter((d) => d.owner === after.me.id && !d.complete);
  expect(mine.map((d) => d.item?.slot).sort()).toEqual(['art', 'plants']);
  expect(after.accounts.local!.balance).toBe(before - prices['plants-1']! - prices['art-1']!);
  // Then each is placed in turn: the plants first (art hangs where it hangs).
  await expect(scene.getByRole('toolbar', { name: /Place/ })).toBeVisible();
  await shot(page, '5-placing');
  await scene.getByRole('button', { name: 'Put it here' }).click();
  await expect(scene.getByRole('toolbar', { name: /Place/ })).toBeHidden();
});
