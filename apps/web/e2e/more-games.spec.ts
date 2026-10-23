/**
 * More games on a phone: ten-pin bowling against the AI at the city's
 * bowling alley (a swipe down the 3D lane, then the rest of the game by the
 * API, to the pot), a tandem skydive over the real 3D city (the climb, the
 * door, freefall, the pull, the canopy and the scored landing) and a
 * helicopter tour past the landmarks (the commentary, the controls, the pad).
 * GAME_SHOTS=<dir> saves the screenshots there (as games-*.png).
 */
import { aiBowl, createRng, type PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
type Room = PlayerView['playRooms'][number];
const SHOTS = process.env.GAME_SHOTS;
const snap = (p: Page, name: string, info: { outputPath: (n: string) => string }) =>
  p.screenshot({
    path: SHOTS ? `${SHOTS}/games-${name}.png` : info.outputPath(`games-${name}.png`),
  });
const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;
const command = (p: Page, command: unknown) =>
  p.request.post('/api/commands', { headers: { 'x-runway': '1' }, data: { command } });
/** Software WebGL draws the real city slowly: every 3D step gets this long. */
const STEP_3D = 60_000;

async function founder(p: Page, name: string, market = /Lagos/) {
  await p.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(p);
  await setupFounder(p, {
    name,
    handle: `mg_${letters(8)}`,
    company: `Fun ${letters(8)}`,
    idea: 'Tools for local businesses',
    market,
  });
  await expect(p.locator('.topbar')).toBeVisible({ timeout: 30_000 });
}

async function goingOut(p: Page) {
  const phone = p.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await p.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  await phone.locator('[data-app="goingout"]').click();
  const games = phone.locator('[data-going="games"]');
  await expect(games).toBeVisible({ timeout: 15_000 });
  return { phone, games };
}

test('bowling against the AI at the alley: a swipe down the lane, ten frames, the pot', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The lane in 3D (specs default to Lite).
  await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
  await founder(page, 'Bo Lanes');
  const me = (await state(page)).me.id;
  const before = (await state(page)).accounts.local!.balance;
  const { phone, games } = await goingOut(page);
  await expect(games.locator('[data-game="bowling"]')).toContainText('Lekki Strike Lanes');
  await expect(games.locator('[data-game="skydive"]')).toBeVisible();
  await expect(games.locator('[data-game="heli"]')).toBeVisible();
  await snap(page, 'going-out', info);
  // Go bowling: walk (or ride) to the alley, then pick up a lane.
  await games.locator('[data-go="bowling"]').click();
  await expect(phone).toBeHidden();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  if (
    await chooser.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    )
  )
    await chooser.locator('[data-mode="cycle"]').click();
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await scene.locator('[data-action="fun:bowling"]').click();
  const dialog = page.getByRole('dialog', { name: 'Play together' });
  await expect(dialog.getByRole('button', { name: /Bowling/ }).first()).toBeVisible();
  await dialog
    .getByLabel(/Stake per player/)
    .last()
    .fill('5');
  await dialog.getByRole('button', { name: 'Play vs AI' }).click();
  const lane = dialog.locator('.bowling-lane canvas');
  await expect(lane).toBeVisible({ timeout: STEP_3D });
  await expect(lane).toHaveAttribute('data-mine', '1', { timeout: 15_000 });
  await page.waitForTimeout(800);
  await snap(page, 'bowling-lane', info);
  // The first ball by hand: a swipe up from the right of the lane, bowing out to hook back.
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  const from = { x: box.x + box.width * 0.66, y: box.y + box.height * 0.92 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const q = i / 8;
    await page.mouse.move(
      from.x - box.width * 0.04 * q + Math.sin(Math.PI * q) * 18,
      from.y - box.height * 0.5 * q,
    );
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await expect(lane).toHaveAttribute('data-rolling', '1', { timeout: 15_000 });
  await page.waitForTimeout(1600);
  await snap(page, 'bowling-roll', info);
  // The rest of the game straight to the server (the lane still replays every ball).
  const roomOf = async () =>
    (await state(page)).playRooms.find(
      (r) => r.game === 'bowling' && r.members.some((m) => m.id === me),
    )!;
  let k = 0;
  const deadline = Date.now() + 300_000;
  let room: Room = await roomOf();
  while (Date.now() < deadline && room.status === 'playing') {
    const g = room.bowling!;
    const now = Date.now();
    if (g.bowler === me && now >= g.readyAt) {
      const input = aiBowl(createRng(k++), g.players[me]!.standing);
      await command(page, { type: 'play.bowl', roomId: room.id, round: room.round, ...input });
    } else {
      if (now >= g.readyAt + 2_600) await command(page, { type: 'play.sync', roomId: room.id });
      await page.waitForTimeout(500);
    }
    room = await roomOf();
  }
  expect(room.status).toBe('finished');
  const fee = room.bowling!.fee;
  expect(fee).toBeGreaterThan(0);
  for (const m of room.members) expect(room.bowling!.players[m.id]!.done).toBe(true);
  await expect(dialog.locator('.bowling-sheet [data-bowler]')).toHaveCount(2);
  await expect(dialog.getByRole('heading', { name: /wins!|It’s a tie!/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(600);
  await snap(page, 'bowling-finished', info);
  // Money: the lane fee to the alley, and the pot to the winner (two 5.00 stakes).
  const after = (await state(page)).accounts.local!.balance;
  const won = room.winners.length === 1 ? (room.winners[0] === me ? 500 : -500) : 0;
  expect(after - before).toBe(won - fee);
  expect((await state(page)).me.games!.you.bowling!.games).toBe(1);
  // A photo of the result.
  await dialog.locator('[data-action="play-photo"]').click();
  await expect(page.getByRole('dialog', { name: /Your result/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a tandem skydive over the real city: jump, pull, steer to the target, the score', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await founder(page, 'Sky Diver');
  // A skydive needs standard of living 3.
  expect((await command(page, { type: 'player.lifestyle', tier: 3 })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 30_000 });
  const before = (await state(page)).accounts.local!.balance;
  const { games } = await goingOut(page);
  await games.locator('[data-go="skydive"]').click();
  const book = page.getByRole('dialog', { name: 'Book a skydive' });
  await expect(book.locator('[data-air-item="skydive-tandem"]')).toBeVisible();
  // Solo needs standard of living 4: locked.
  await expect(book.locator('[data-air-item="skydive-solo"] button')).toBeDisabled();
  await book.locator('[data-air-item="skydive-tandem"] [data-action="air-book"]').click();
  const air = page.locator('[data-air="skydive"]');
  await expect(air).toBeVisible({ timeout: STEP_3D });
  await page.evaluate(() => ((window as unknown as { __airSpeed: number }).__airSpeed = 3));
  await expect(air).toHaveAttribute('data-air-phase', 'door', { timeout: STEP_3D });
  await page.waitForTimeout(1500);
  await snap(page, 'skydive-door', info);
  // Freefall at real speed (a minute compressed to about twenty seconds).
  await page.evaluate(() => ((window as unknown as { __airSpeed: number }).__airSpeed = 1));
  await air.locator('[data-action="jump"]').click();
  await expect(air).toHaveAttribute('data-air-phase', 'freefall', { timeout: 15_000 });
  await air.locator('[data-action="arch"]').click();
  await snap(page, 'skydive-freefall', info);
  // Pull in the band (by the altimeter).
  await expect
    .poll(async () => Number(await air.locator('[data-alt]').getAttribute('data-alt')), {
      timeout: 60_000,
      intervals: [200],
    })
    .toBeLessThan(1700);
  await air.locator('[data-action="pull"]').click({ timeout: 5_000 });
  await expect(air).toHaveAttribute('data-air-phase', 'canopy', { timeout: 10_000 });
  await page.waitForTimeout(800);
  await snap(page, 'skydive-canopy', info);
  await page.evaluate(() => ((window as unknown as { __airSpeed: number }).__airSpeed = 6));
  await air.locator('[data-action="air-photo"]').click();
  await expect(page.getByRole('dialog', { name: /Photo from the sky/ })).toBeVisible();
  await page
    .getByRole('dialog', { name: /Photo from the sky/ })
    .getByRole('button', { name: /Close|Done/ })
    .first()
    .click();
  await expect(air).toHaveAttribute('data-air-phase', 'landed', { timeout: 120_000 });
  const result = air.locator('[data-air-result]');
  await expect(result).toContainText(/points/, { timeout: 20_000 });
  await snap(page, 'skydive-landed', info);
  const v = await state(page);
  expect(v.me.games!.you.jumps).toBe(1);
  expect(v.me.games!.you.lastJump!.score).toBeGreaterThan(0);
  const price = v.me.games!.skydive!.items.find((i) => i.id === 'skydive-tandem')!.price;
  expect(before - v.accounts.local!.balance).toBe(price);
  await result.locator('[data-action="air-done"]').click();
  await expect(air).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a helicopter tour past the landmarks: the commentary, the controls, back on the pad', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await founder(page, 'Heli Rider', /London/);
  expect((await command(page, { type: 'player.lifestyle', tier: 3 })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 30_000 });
  const { games } = await goingOut(page);
  await games.locator('[data-go="heli"]').click();
  const book = page.getByRole('dialog', { name: 'Book a helicopter ride' });
  await book.locator('[data-air-item="heli-tour"] [data-action="air-book"]').click();
  const air = page.locator('[data-air="heli"]');
  await expect(air).toBeVisible({ timeout: STEP_3D });
  await page.evaluate(() => ((window as unknown as { __airSpeed: number }).__airSpeed = 3));
  await expect(air.locator('[data-air-say]')).toBeVisible({ timeout: 120_000 });
  await expect(air.locator('[data-air-say]')).toContainText(/On your (left|right):/);
  await page.waitForTimeout(1000);
  await snap(page, 'heli-tour', info);
  // Take the controls for a moment, then hand back.
  await air.locator('[data-action="heli-controls"]').click();
  await expect(air.getByRole('button', { name: 'Climb' })).toBeVisible();
  await air.getByRole('button', { name: 'Back to the pilot' }).click();
  // Head back to the pad.
  await air.locator('[data-action="heli-home"]').click();
  await page.evaluate(() => ((window as unknown as { __airSpeed: number }).__airSpeed = 8));
  await expect(air).toHaveAttribute('data-air-phase', 'landed', { timeout: 180_000 });
  await expect(air.locator('[data-air-result]')).toContainText('What a view!');
  await snap(page, 'heli-landed', info);
  const v = await state(page);
  expect(v.me.games!.you.flights).toBe(1);
  expect(v.me.games!.you.booked).toBeNull();
  expect(errors).toEqual([]);
});
