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

// The 3D checks draw with software WebGL.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.REST_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

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
  // Round 7e: lying down in Lite too: under the covers, the head on the pillow.
  await expect(avatar.locator('.home-covers')).toBeVisible();
  await shot(page, 'lite-nap-mat');
  // Walking off wakes you up.
  await scene.locator('rect[data-tile="5,6"]').click();
  await expect(chip).toBeHidden();
  await expect.poll(async () => (await me(page)).rest?.resting ?? null).toBeNull();
  await expect(avatar.locator('.home-covers')).toBeHidden();

  // Round 7e: or sit on the edge of the mat (a seat's rest: stress, not energy).
  await scene.locator('[data-obj="bed"]').click();
  await expect(scene.locator('[data-verb="nap"]')).toBeVisible();
  await scene.locator('[data-verb="sit"]').click();
  await expect(chip).toHaveAttribute('data-rest', 'seat', { timeout: 15_000 });
  await expect(chip).toContainText('Sitting on the mat');
  await expect(chip).toContainText('stress −1 / 15 min');
  await expect(avatar).toHaveAttribute('data-pose', 'sit');
  await expect.poll(async () => (await me(page)).rest?.resting?.spot).toBe('seat');
  await shot(page, 'lite-sit-mat');
  await chip.getByRole('button', { name: 'Get up' }).click();
  await expect(chip).toBeHidden();
  await expect(avatar).toHaveAttribute('data-pose', 'stand');
});

test.describe('in 3D', () => {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ] as const)
    test(`sit on the edge of your bed, then nap lying on it, at ${w}×${h}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
      await founder(page);
      // A bed of your own (the starter flat sleeps on a mat).
      const shop = (await page.request.get('/api/state').then((r) => r.json())) as {
        view: { market: { shop: { furniture: { id: string; slot: string; price: number }[] } } };
      };
      const bed = shop.view.market.shop.furniture
        .filter((f) => f.slot === 'bed')
        .sort((a, b) => a.price - b.price)[0]!;
      const bought = await page.request.post('/api/commands', {
        headers: { 'x-runway': '1' },
        data: { command: { type: 'home.buy', itemId: bed.id } },
      });
      expect(bought.status()).toBe(200);
      await page.reload();
      await tapPlace(page, '[data-place="home"]', 'cycle');
      const scene = page.locator('.home-scene');
      await expect(scene).toHaveClass(/is-3d/, { timeout: 90_000 });
      const canvas = scene.locator('canvas[data-home-3d]');
      await expect(canvas).toBeVisible();
      const hook = () =>
        page.evaluate(() => {
          const h = (
            window as unknown as {
              __home3d?: {
                me(): {
                  pose: string;
                  seat: string | null;
                  seatH: number;
                  box: { l: number; r: number; b: number; t: number } | null;
                } | null;
                objAt(id: string): { x: number; y: number } | null;
              };
            }
          ).__home3d;
          return h ? { me: h.me(), bed: h.objAt('bed') } : null;
        });
      await expect
        .poll(async () => (await hook())?.bed ?? null, { timeout: 30_000 })
        .not.toBeNull();
      // Reduced motion: you walk and sit at once (software WebGL walks slowly).
      await page.evaluate(() => (document.documentElement.dataset.reduceMotion = '1'));
      const tapBed = async () => {
        const at = (await hook())!.bed!;
        const box = (await canvas.boundingBox())!;
        await page.mouse.click(box.x + at.x, box.y + at.y);
        await expect(scene.locator('[data-verb="sit"]')).toBeVisible({ timeout: 10_000 });
      };
      await tapBed();
      // Tapping the bed: Sit or Nap (or Sleep).
      await expect(scene.locator('[data-verb="nap"]')).toBeVisible();
      await scene.locator('[data-verb="sit"]').click();
      const chip = page.locator('.rest-chip');
      await expect(chip).toHaveAttribute('data-rest', 'seat', { timeout: 15_000 });
      await expect(chip).toContainText('Sitting on the bed');
      // Sat on the mattress's edge (not stood beside it, not in the middle of it), in the picture.
      await expect.poll(async () => (await hook())?.me?.pose, { timeout: 20_000 }).toBe('sit');
      const sat = (await hook())!.me!;
      expect(sat.seat).toBe('bed');
      expect(sat.seatH).toBeGreaterThan(0.3);
      expect(sat.box!.l).toBeGreaterThan(-1);
      expect(sat.box!.r).toBeLessThan(1);
      expect(sat.box!.b).toBeGreaterThan(-1);
      expect(sat.box!.t).toBeLessThan(1);
      await page.waitForTimeout(1200);
      await shot(page, `3d-sit-bed-${w}x${h}`);
      await chip.getByRole('button', { name: 'Get up' }).click();
      await expect(chip).toBeHidden();
      // Nap: lying on the bed.
      await tapBed();
      await scene.locator('[data-verb="nap"]').click();
      await expect(chip).toHaveAttribute('data-rest', 'bed', { timeout: 15_000 });
      await expect.poll(async () => (await hook())?.me?.pose, { timeout: 20_000 }).toBe('lie');
      await page.waitForTimeout(1200);
      await shot(page, `3d-nap-bed-${w}x${h}`);
      await chip.getByRole('button', { name: 'Wake up' }).click();
      await expect(chip).toBeHidden();
    });
});
