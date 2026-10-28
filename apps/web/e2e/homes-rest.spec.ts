import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Round 7 #3 (player feedback: "sit down at home"): tap the sofa (floor
 * cushions in a first flat) and Sit, and you stay sat, with a chip under
 * the HUD (stress −1 / 15 min) until you get up: your stress falls with the
 * game clock and the hours are spent. Nap on the sleeping mat: you lie on it
 * (play-test: you stood beside it) until you wake up, and energy comes back.
 */

async function founder(page: Page) {
  await playAsGuest(page);
  const handle = `rs_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Rita Rest',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Rest ${h.slice(3)}`,
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
  hours: { left: number };
  bars?: { stress: number };
  rest: { resting: { spot: string } | null; block: number } | null;
}
const me = async (page: Page) =>
  ((await page.request.get('/api/state').then((r) => r.json())) as { view: { me: Me } }).view.me;

test('sit on the cushions until you get up (stress falls), nap lying on the mat', async ({
  page,
}) => {
  // A 15-minute block of game time is half a real minute in the test world.
  test.setTimeout(150_000);
  await founder(page);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  const avatar = scene.locator('[data-home-avatar]').first();

  // Sit: you stay sat, and the chip says what resting does.
  const before = await me(page);
  await scene.locator('[data-obj="sofa"]').click();
  await scene.locator('[data-verb="sit"]').click();
  const chip = page.locator('.rest-chip');
  await expect(chip).toHaveAttribute('data-rest', 'seat', { timeout: 15_000 });
  await expect(chip).toContainText('stress −1 / 15 min');
  await expect(chip).toContainText(/Resting on the (cushions|sofa)/);
  await expect(avatar).toHaveAttribute('data-pose', 'sit');
  await expect.poll(async () => (await me(page)).rest?.resting?.spot).toBe('seat');
  // Still sat a while later (not a 2-second act): a block of game time goes by.
  await expect(chip.locator('[data-rest-sofar]')).not.toHaveAttribute('data-rest-sofar', '0', {
    timeout: 75_000,
  });
  await expect(avatar).toHaveAttribute('data-pose', 'sit');
  await chip.getByRole('button', { name: 'Get up' }).click();
  await expect(chip).toBeHidden();
  await expect(avatar).toHaveAttribute('data-pose', 'stand');
  const up = await me(page);
  expect(up.rest?.resting ?? null).toBeNull();
  // Stress fell (from where it was) and resting spent game hours.
  if (before.bars && before.bars.stress > 0)
    expect(up.bars!.stress).toBeLessThan(before.bars.stress);
  expect(up.hours.left).toBeLessThan(before.hours.left);

  // Nap on the sleeping mat: you lie on it until you wake up.
  await scene.locator('[data-obj="bed"]').click();
  await scene.locator('[data-verb="nap"]').click();
  await expect(chip).toHaveAttribute('data-rest', 'bed', { timeout: 15_000 });
  await expect(chip).toContainText('Napping on the mat');
  await expect(chip).toContainText('energy +4 / 15 min');
  await expect(avatar).toHaveAttribute('data-pose', 'lie');
  await expect.poll(async () => (await me(page)).rest?.resting?.spot).toBe('bed');
  await page.waitForTimeout(3000);
  await expect(avatar).toHaveAttribute('data-pose', 'lie');
  // Walking off wakes you up.
  await scene.locator('rect[data-tile="5,6"]').click();
  await expect(chip).toBeHidden();
  await expect.poll(async () => (await me(page)).rest?.resting ?? null).toBeNull();
});
