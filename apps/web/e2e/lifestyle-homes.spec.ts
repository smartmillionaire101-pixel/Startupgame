import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Player feedback: "This house is no different from the poor house (Lean),
 * and I selected Modest." Every lifestyle tier lives somewhere of its own,
 * matching its housing label: a room in a shared flat (Lean), a small flat
 * (Modest), a good flat (Comfortable), a house (Affluent), a penthouse
 * (Lavish). On the map the home's building differs by tier, and inside the
 * plan, the building round it and the finishes do.
 *
 * LIFESTYLE_SHOTS=<dir> also saves 390×844 screenshots of the home on the
 * map and inside for Lean, Modest and Comfortable.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.LIFESTYLE_SHOTS;
const NAMES = ['', 'lean', 'modest', 'comfortable', 'affluent', 'lavish'];
const BLOCKS = ['', 'walkup', 'block', 'modern'];

async function founder(page: Page) {
  await playAsGuest(page);
  const handle = `ls_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Lola Lifestyle',
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
}

async function lifestyle(page: Page, tier: number) {
  const status = await page.evaluate(async (t) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: { type: 'player.lifestyle', tier: t } }),
    });
    return r.status;
  }, tier);
  expect(status).toBe(200);
  await page.reload();
  const map = page.getByRole('application', { name: /Map of/ });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 90_000 });
  return map;
}

type Scene = {
  paused: boolean;
  places: { place: { id: string }; x: number; y: number; h: number }[];
  flyTo(x: number, y: number, d?: number): void;
  rig: { yaw: number; pitch: number };
};

/** Fly to your home on the map; its height there (metres). */
async function homeOnMap(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __city3d: Scene }).__city3d;
    const b = s.places.find((p) => p.place.id === 'home')!;
    s.rig.pitch = 0.5;
    s.flyTo(b.x, b.y, 120);
    return b.h;
  });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(6000);
  const hold = (on: boolean) =>
    page.evaluate((on) => {
      const s = (window as unknown as { __city3d?: Scene }).__city3d;
      if (s) s.paused = on;
    }, on);
  await hold(true);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 90_000 });
  await hold(false);
}

test('each lifestyle tier lives in a home of its own, on the map and inside', async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
    } catch {
      /* storage blocked */
    }
  });
  await founder(page);
  const kinds: string[] = [];
  const heights: number[] = [];
  const sizes: number[] = [];
  for (const tier of [1, 2, 3]) {
    await lifestyle(page, tier);
    await tapPlace(page, '[data-place="home"]', 'cycle');
    const scene = page.locator('.home-scene');
    await expect(scene).toBeVisible({ timeout: 20_000 });
    await expect(scene).toHaveClass(/is-3d/, { timeout: 60_000 });
    kinds.push((await scene.getAttribute('data-kind')) ?? '');
    // Inside: the flat's block round it, by tier.
    await expect(scene.locator('canvas[data-home-3d]')).toHaveAttribute(
      'data-block',
      BLOCKS[tier]!,
    );
    sizes.push(Number(await scene.getAttribute('data-plan-w')));
    if (SHOTS) {
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SHOTS}/home-${NAMES[tier]}-inside.png` });
    }
    await scene.getByRole('button', { name: 'Close' }).first().click();
    await expect(scene).toBeHidden();
    heights.push(await homeOnMap(page));
    await shot(page, `home-${NAMES[tier]}-map`);
  }
  expect(kinds).toEqual(['room', 'apartment', 'apartment']);
  // Bigger each tier up, and a taller building on the map.
  expect(sizes[1]).toBeGreaterThan(sizes[0]!);
  expect(sizes[2]).toBeGreaterThan(sizes[1]!);
  expect(heights[1]).toBeGreaterThan(heights[0]!);
  expect(heights[2]).toBeGreaterThan(heights[1]!);
});
