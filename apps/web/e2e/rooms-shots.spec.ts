import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * Walls and dividers (player feedback: "so I can divide my apartment into
 * different rooms"): a flat split with a glass divider, a bookshelf, a
 * sliding screen and a full wall, its rooms named, in 3D on a phone, from
 * above and from inside. Only with SHOP_SHOTS=<dir> (it saves the pictures).
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const SHOTS = process.env.SHOP_SHOTS;

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;
async function command(p: Page, command: unknown) {
  const r = await p.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { result: Record<string, unknown> };
}

test('an apartment divided into rooms, from above and inside', async ({ page }) => {
  test.skip(!SHOTS, 'Screenshots only (SHOP_SHOTS).');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Rooms',
    handle: `rooms_${letters(8)}`,
    company: `Rooms ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  // The tier-2 flat: living room (0–5 × 4–9) open to the kitchen (6–9 × 4–9).
  const walls = [
    { kind: 'glass', length: 3, finish: 'framed', at: { x: 6, y: 5, dir: 'v' } },
    { kind: 'sliding', length: 1, finish: 'slats', at: { x: 6, y: 8, dir: 'v' } },
    { kind: 'bookshelf', length: 2, finish: 'walnut', at: { x: 4, y: 7, dir: 'h' } },
    { kind: 'full', length: 2, finish: 'sage', at: { x: 3, y: 1, dir: 'v' } },
  ] as const;
  const ids: string[] = [];
  let last = 0;
  for (const w of walls) {
    const r = await command(page, {
      type: 'home.wall.buy',
      kind: w.kind,
      length: w.length,
      options: { finish: w.finish },
      delivery: 'express',
    });
    ids.push(r.result.id as string);
    last = Math.max(last, r.result.arrivesAt as number);
  }
  await page.waitForTimeout(Math.max(0, last - Date.now() + 1500));
  for (const id of ids) await command(page, { type: 'living.collect', deliveryId: id });
  const mine = (await state(page)).me.home.walls!;
  for (const [n, w] of walls.entries())
    await command(page, { type: 'home.wall.place', wallId: mine[n]!.id, floor: 0, ...w.at });
  for (const [x, y, label] of [
    [2, 6, 'Lounge'],
    [8, 6, 'Dining'],
    [4, 2, 'Office'],
    [4, 8, 'Reading nook'],
  ] as const)
    await command(page, { type: 'home.room.label', floor: 0, x, y, label });

  await page.reload();
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const home = page.locator('.home-scene');
  await expect(home).toHaveClass(/is-3d/, { timeout: 90_000 });
  await expect(home).toHaveAttribute('data-dividers', '4');
  await expect(home.locator('canvas[data-home-3d]')).toHaveAttribute('data-dividers', '4');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/6-rooms-top-view.png` });

  // Inside: closer in, and lower (drag down to tilt, the wheel to zoom).
  const svg = home.locator('svg.home-svg');
  const box = (await svg.boundingBox())!;
  for (let i = 0; i < 6; i++) await svg.dispatchEvent('wheel', { deltaY: -120 });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy - 140, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/7-rooms-inside-view.png` });
});
