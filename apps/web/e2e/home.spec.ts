import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Wave 7 §A (docs/WAVE7-IMMERSIVE.md): the home you walk around. Enter
 * home, walk on the grid, sleep in bed, cook, and have someone over.
 */

/** A Lagos founder, created through the API. */
async function founder(page: Page) {
  await playAsGuest(page);
  const handle = `hm_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Hana Homebody',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Nest ${h.slice(3)}`,
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

interface Me {
  energy: number;
  needs?: { hunger: number; social: number };
}
const state = async (page: Page) =>
  (await page.request.get('/api/state').then((r) => r.json())) as {
    view: { me: Me; accounts: { local: { balance: number } } };
  };

test('home: walk around, sleep, cook and have a friend over', async ({ page }) => {
  await founder(page);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await expect(scene).toHaveAttribute('data-room', 'apartment');

  // The grid renders: a 10×10 flat for a new player (lifestyle tier 2).
  await expect(scene.locator('[data-home-grid]')).toHaveAttribute('data-w', '10');
  await expect(scene.locator('rect[data-tile]')).toHaveCount(100);
  const me = scene.locator('[data-home-avatar]');
  await expect(me).toHaveAttribute('data-tile', '1,8');

  // Tap a floor tile: you walk there.
  await scene.locator('rect[data-tile="5,6"]').click();
  await expect(me).toHaveAttribute('data-tile', '5,6', { timeout: 8000 });

  // The bed (a mat until you buy one): Sleep. Energy rises and a float shows.
  const before = await state(page);
  await scene.locator('[data-obj="bed"]').click();
  await scene.locator('[data-verb="sleep"]').click();
  await expect(scene.locator('.home-float').first()).toBeAttached({ timeout: 10_000 });
  await expect
    .poll(async () => (await state(page)).view.me.energy, { timeout: 8000 })
    .toBeGreaterThan(before.view.me.energy);

  // The kitchen: Cook. Money goes on groceries; hunger fills up.
  const pre = await state(page);
  await scene.locator('[data-obj="kitchen"]').click();
  await scene.locator('[data-verb="cook"]').click();
  await expect
    .poll(async () => (await state(page)).view.accounts.local.balance, { timeout: 12_000 })
    .toBeLessThan(pre.view.accounts.local.balance);
  const after = await state(page);
  expect(after.view.me.needs!.hunger).toBeGreaterThanOrEqual(pre.view.me.needs!.hunger);
  await expect(scene.locator('[data-need="hunger"]')).toHaveAttribute(
    'data-value',
    String(after.view.me.needs!.hunger),
  );

  // Invite someone over: they walk in.
  await scene.getByRole('button', { name: 'Invite', exact: true }).click();
  const sheet = scene.getByRole('dialog', { name: 'Invite someone over' });
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-invite]').first().click();
  await expect(scene.locator('[data-guest]')).toHaveCount(1, { timeout: 8000 });
  await expect
    .poll(async () => (await state(page)).view.me.needs!.social, { timeout: 8000 })
    .toBeGreaterThan(pre.view.me.needs!.social);

  // Go out closes the scene.
  await scene.getByRole('button', { name: 'Go out', exact: true }).click();
  await expect(scene).toBeHidden();
});
