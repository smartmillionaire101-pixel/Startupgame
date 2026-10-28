import { expect, hudMore, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

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
  // The needs are in the time pill's sheet (the floating HUD).
  await page.locator('[data-hud-life]').click();
  const day = page.getByRole('dialog', { name: 'Your day' });
  await expect(day.locator('[data-need="hunger"]')).toHaveAttribute(
    'data-value',
    String(after.view.me.needs!.hunger),
  );
  await day.getByRole('button', { name: 'Close' }).click();
  await expect(day).toBeHidden();

  // Invite someone over (behind ⋯): they walk in.
  await hudMore(scene);
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

test('the HUD over your home on a 412px phone: one row of pills, the room’s rail, how you’re doing a tap away', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await founder(page);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  // The floating HUD's top row over the room: one row, inside 412px. No home name.
  const top = page.locator('.hud-top');
  const box = (await top.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(48);
  const tops = await top
    .locator(':scope > *')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  for (const r of tops) {
    expect(r.right).toBeLessThanOrEqual(412.5);
    expect(r.top).toBeGreaterThanOrEqual(box.y - 0.5);
    expect(r.bottom).toBeLessThanOrEqual(box.y + box.height + 0.5);
  }
  await expect(top).not.toContainText('Small flat');
  // The room's own buttons are a rail of named icons (Turn and Look around in
  // 3D too); the phone is the HUD's.
  const rail = scene.getByRole('group', { name: 'Home actions' });
  for (const name of ['Go out', 'Buy', 'More'])
    await expect(rail.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.locator('[data-phone-button]')).toBeVisible();
  // Mood, energy and the four needs: the time pill's sheet.
  const energy = await scene.getAttribute('data-energy');
  await page.locator('[data-hud-life]').click();
  const day = page.getByRole('dialog', { name: 'Your day' });
  await expect(day.locator('[data-home-energy]')).toHaveAttribute('data-home-energy', energy!);
  await expect(day.locator('[data-need]')).toHaveCount(4);
  // Each need bar sits under its name and has room to read.
  const bar = (await day.locator('[data-need="hunger"] .lifebar-track').boundingBox())!;
  const head = (await day.locator('[data-need="hunger"] .lifebar-head').boundingBox())!;
  expect(bar.y).toBeGreaterThan(head.y + head.height - 1);
  expect(bar.width).toBeGreaterThan(40);
});
