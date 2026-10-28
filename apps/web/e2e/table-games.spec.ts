/**
 * 8-ball pool and the penalty shootout on a phone, against the AI and
 * between two players: the cue pulled back on the cloth, swipes at the
 * goal, a full frame and a full shootout to the pot. GAME_SHOTS=<dir>
 * saves the screenshots there (otherwise into the test's output folder).
 */
import { poolPlan, POOL_H, type PlayerView } from '@runway/engine';
import {
  test,
  expect,
  letters,
  playAsGuest,
  setupFounder,
  withoutNetlifyDrawer,
  openTogether,
  type Page,
} from './fixtures';
import type { Browser } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
type Room = PlayerView['playRooms'][number];
const SHOTS = process.env.GAME_SHOTS;
const snap = (p: Page, name: string, info: { outputPath: (n: string) => string }) =>
  p.screenshot({ path: SHOTS ? `${SHOTS}/${name}.png` : info.outputPath(`${name}.png`) });
const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;
const roomOf = async (p: Page, game: Room['game']) =>
  (await state(p)).playRooms.find(
    (r) => r.game === game && (r.status === 'playing' || r.status === 'finished'),
  );
async function command(p: Page, command: unknown) {
  const response = await p.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  return response;
}

async function founder(p: Page, name: string) {
  await p.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(p);
  await setupFounder(p, {
    name,
    handle: `tg_${letters(8)}`,
    company: `Studio ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /London/,
  });
  await expect(p.locator('[data-hud-bar]')).toBeVisible({ timeout: 30000 });
}
async function lobby(p: Page, gl = false) {
  // Round 7e: the games in 3D (the player in the picture); the city stays Lite.
  if (gl) await p.evaluate(() => localStorage.setItem('runway.mapQuality', '3d'));
  const home = await openTogether(p);
  await home.getByRole('button', { name: /Play football or host/ }).click();
  return p.getByRole('dialog', { name: 'Play together' });
}

/** The pool canvas: where it is, its scale, and where the cue ball sits on it. */
async function table(p: Page) {
  const canvas = p.locator('.pool-table canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const [cx, cy] = ((await canvas.getAttribute('data-cue')) ?? '0,0').split(',').map(Number);
  const scale = box.width / (POOL_H + 26);
  return { canvas, box, cue: { x: box.x + cx!, y: box.y + cy! }, scale };
}

type Box = { l: number; r: number; b: number; t: number };
/** Round 7e: the player leaning over the pool table (./game-avatar3d.ts), −1 … 1 on its layer. */
const poolPlayer = (p: Page) =>
  p.evaluate(
    () =>
      (
        window as unknown as { __pool3d?: { onScreen(): { player: Box | null } } }
      ).__pool3d?.onScreen().player ?? null,
  );
/** Round 7e: the kicker on the pitch, the ball and the goal line (−1 … 1 on the pitch). */
const pitchKicker = (p: Page) =>
  p.evaluate(
    () =>
      (
        window as unknown as {
          __kick3d?: {
            onScreen(): {
              kicker: Box | null;
              T: number;
              ball: { x: number; y: number };
              goalLine: number;
            };
          };
        }
      ).__kick3d?.onScreen() ?? null,
  );
const inFrame = (b: Box | null | undefined) =>
  !!b && b.l > -1 && b.r < 1 && b.b > -1 && b.t < 1 && b.r - b.l > 0.05;
/** A box on a layer (−1 … 1) in page px. */
async function onPage(p: Page, sel: string, b: Box) {
  const c = (await p.locator(sel).boundingBox())!;
  return {
    x: c.x + ((b.l + 1) / 2) * c.width,
    y: c.y + ((1 - b.t) / 2) * c.height,
    width: ((b.r - b.l) / 2) * c.width,
    height: ((b.t - b.b) / 2) * c.height,
  };
}
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** The player at the table, whole, on the table's layer, and over none of the controls. */
async function expectPoolPlayer(p: Page, what: string) {
  await expect
    .poll(async () => inFrame(await poolPlayer(p)), {
      timeout: 15000,
      message: `${what}: the player at the table, all of them in the picture`,
    })
    .toBe(true);
  const box = await onPage(p, '.pool-player-3d', (await poolPlayer(p))!);
  for (const sel of ['.pool-controls', '.pool-hint', '.pool-power', '.pool-hud']) {
    const el = p.locator(sel).first();
    if (!(await el.count()) || !(await el.isVisible())) continue;
    expect(overlaps(box, (await el.boundingBox())!), `${what}: the player over ${sel}`).toBe(false);
  }
}

/** The kicker on the pitch, whole, beside the ball (the swipe starts there) and below the goal. */
async function expectKicker(p: Page, what: string) {
  await expect
    .poll(async () => inFrame((await pitchKicker(p))?.kicker), {
      timeout: 15000,
      message: `${what}: the kicker, all of them on the pitch`,
    })
    .toBe(true);
  const v = (await pitchKicker(p))!;
  expect(v.kicker!.r, `${what}: the kicker stands clear of the ball`).toBeLessThan(v.ball.x);
  expect(v.kicker!.t, `${what}: the kicker stands below the goal`).toBeLessThan(v.goalLine + 0.15);
}

/** Take a pool shot the way a player does: place the ball, aim, pull the cue back, let go. */
async function strokeByHand(p: Page, room: Room) {
  const pool = room.pool!;
  await p.waitForTimeout(300);
  const plan = poolPlan(room.balls, pool.targets, pool.inHand, !pool.broken);
  let t = await table(p);
  if (plan.cue) {
    await p.mouse.move(t.cue.x, t.cue.y);
    await p.mouse.down();
    const tx = t.box.x + (13 + plan.cue.y) * t.scale,
      ty = t.box.y + (13 + 254 - plan.cue.x) * t.scale;
    await p.mouse.move(tx, ty, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(250);
    t = await table(p);
  }
  // Aim: press on the cloth well along the line of the shot.
  const dx = Math.sin(plan.angle),
    dy = -Math.cos(plan.angle);
  const reach = 90;
  let ax = t.cue.x + dx * reach,
    ay = t.cue.y + dy * reach;
  ax = Math.max(t.box.x + 4, Math.min(t.box.x + t.box.width - 4, ax));
  ay = Math.max(t.box.y + 4, Math.min(t.box.y + t.box.height - 4, ay));
  await p.mouse.click(ax, ay);
  await p.waitForTimeout(250);
  // Pull the cue back along the aim and let go (grab the stick just behind the ball).
  t = await table(p);
  const grab = { x: t.cue.x - dx * 26, y: t.cue.y - dy * 26 };
  const pull = (Math.max(8, plan.power) / 100) * 150;
  await p.mouse.move(grab.x, grab.y);
  await p.mouse.down();
  await p.mouse.move(grab.x - dx * pull * 0.5, grab.y - dy * pull * 0.5, { steps: 4 });
  await p.mouse.move(grab.x - dx * pull, grab.y - dy * pull, { steps: 4 });
  await p.mouse.up();
}

test('8-ball pool against the AI on a phone: a full frame to the pot', async ({ page }, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await founder(page, 'Pat Cue');
  const before = (await state(page)).accounts.local!.balance;
  const dialog = await lobby(page, true);
  await dialog.getByRole('button', { name: /8-ball pool/ }).click();
  await snap(page, 'pool-lobby', info);
  await dialog
    .getByLabel(/Stake per player/)
    .last()
    .fill('5');
  await dialog.getByRole('button', { name: 'Play vs AI' }).click();
  await expect(dialog.locator('.pool-table canvas')).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByText(/Ball in hand: drag the cue ball behind the line/)).toBeVisible();
  await page.waitForTimeout(400);
  // Round 7e: you, leaning over the table for the break.
  await expectPoolPlayer(page, 'the break');
  await expect(dialog.locator('.pool-player-3d')).toHaveAttribute(
    'data-player',
    (await state(page)).me.id,
  );
  await snap(page, 'pool-break', info);
  let byHand = 0;
  let shots = 0;
  const deadline = Date.now() + 520_000;
  while (Date.now() < deadline) {
    const room = (await roomOf(page, 'snooker'))!;
    if (room.status === 'finished') break;
    const me = (await state(page)).me.id;
    const rolling = (await page.locator('.pool-table canvas').getAttribute('data-rolling')) === '1';
    const serverNow = Date.now();
    if (room.turn !== me || rolling || serverNow < room.pool!.readyAt) {
      await page.waitForTimeout(700);
      continue;
    }
    const ready = await expect(page.locator('.pool-table canvas'))
      .toHaveAttribute('data-mine', '1', { timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    if (!ready) continue;
    if (byHand < 3) {
      // The first shots by hand: drag, aim and pull on the cloth.
      await strokeByHand(page, room);
      byHand++;
      await expect
        .poll(async () => (await roomOf(page, 'snooker'))!.pool!.shots, { timeout: 20000 })
        .toBeGreaterThan(room.pool!.shots);
      if (byHand === 1) {
        await page.waitForTimeout(500);
        await snap(page, 'pool-rolling', info);
      }
    } else {
      // Then the plan straight to the server (the table still replays every shot).
      const plan = poolPlan(room.balls, room.pool!.targets, room.pool!.inHand, !room.pool!.broken);
      await command(page, {
        type: 'play.shot',
        roomId: room.id,
        round: room.round,
        angle: plan.angle,
        power: Math.max(5, Math.min(100, plan.power)),
        ...(plan.spin ? { spin: plan.spin } : {}),
        ...(plan.cue ? { cueX: plan.cue.x, cueY: plan.cue.y } : {}),
      });
    }
    shots++;
    if (shots === 4) {
      await snap(page, 'pool-aim', info);
    }
    if (shots === 2) {
      // Lined up away from the break end too: still all in the picture, clear of the controls.
      await expect(page.locator('.pool-table canvas')).toHaveAttribute('data-rolling', '1', {
        timeout: 15000,
      });
      await expectPoolPlayer(page, 'watching the shot');
    }
  }
  const room = (await roomOf(page, 'snooker'))!;
  expect(room.status).toBe('finished');
  expect(room.winners).toHaveLength(1);
  await expect(dialog.getByRole('heading', { name: /wins!/ })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  await snap(page, 'pool-finished', info);
  // Money: the winner took the pot (two 5.00 stakes).
  const after = (await state(page)).accounts.local!.balance;
  const me = (await state(page)).me.id;
  expect(after - before).toBe(room.winners[0] === me ? 500 : -500);
  expect(errors).toEqual([]);
});

/** Swipe from the ball to a point on the goal (metres) over `ms`. */
async function swipeAt(p: Page, x: number, y: number, ms = 260, bow = 0) {
  const canvas = p.locator('.shootout-pitch canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const [bx, by] = (await canvas.getAttribute('data-ball'))!.split(',').map(Number);
  const [gl, gt, gr, gb] = (await canvas.getAttribute('data-goal'))!.split(',').map(Number);
  const tx = gl! + ((x + 3.66) / 7.32) * (gr! - gl!),
    ty = gb! - (y / 2.44) * (gb! - gt!);
  const from = { x: box.x + bx!, y: box.y + by! },
    to = { x: box.x + tx, y: box.y + ty };
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const q = i / steps;
    await p.mouse.move(
      from.x + (to.x - from.x) * q + bow * Math.sin(Math.PI * q),
      from.y + (to.y - from.y) * q,
    );
    await p.waitForTimeout(ms / steps);
  }
  await p.mouse.up();
}

test('a penalty shootout against the AI on a phone, to sudden death if need be', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await founder(page, 'Pat Striker');
  const dialog = await lobby(page, true);
  await dialog.getByRole('button', { name: /Football shootout/ }).click();
  await dialog.getByRole('button', { name: 'Play vs AI' }).click();
  await expect(dialog.locator('.shootout-pitch canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
  // Round 7e: you wait behind the ball in your kit, all of you on the pitch.
  await expectKicker(page, 'ready on a phone');
  await expect(dialog.locator('.shootout-kicker')).toHaveAttribute(
    'data-kicker',
    (await state(page)).me.id,
  );
  await snap(page, 'shootout-ready', info);
  const targets: [number, number, number][] = [
    [-2.6, 1.7, 0],
    [2.4, 0.4, 0],
    [-2.2, 0.5, 30],
    [2.7, 1.8, -30],
    [0.3, 1.0, 0],
  ];
  const dives = ['Dive top left', 'Dive bottom right', 'Dive bottom left', 'Dive top right'];
  let kicks = 0;
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    const room = (await roomOf(page, 'football'))!;
    if (room.status === 'finished') break;
    const me = (await state(page)).me.id;
    const playing =
      (await page.locator('.shootout-pitch canvas').getAttribute('data-playing')) === '1';
    if (playing || room.myMove !== null) {
      await page.waitForTimeout(400);
      continue;
    }
    const n = room.penalties.length;
    // Act once the table on screen has caught up with the server.
    const turn = room.shooter === me ? 'shoot' : 'dive';
    const ready = await expect(page.locator('.shootout-pitch canvas'))
      .toHaveAttribute('data-turn', turn, { timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    if (!ready) continue;
    if (room.shooter === me) {
      const [x, y, bow] = targets[kicks % targets.length]!;
      await swipeAt(page, x, y, 260, bow);
      if (kicks === 0) await snap(page, 'shootout-swipe', info);
    } else {
      await dialog
        .getByRole('button', { name: dives[kicks % dives.length], exact: true })
        .click({ timeout: 10000 });
    }
    kicks++;
    if (kicks === 1) {
      const flying = await expect(page.locator('.shootout-pitch canvas'))
        .toHaveAttribute('data-playing', '1', { timeout: 15000 })
        .then(
          () => true,
          () => false,
        );
      if (flying) {
        // The run-up and the strike: the kicker moves and stays in the picture.
        await page.waitForTimeout(350);
        const run = (await pitchKicker(page))!;
        expect(run.T, 'the kicker runs up').toBeGreaterThan(0);
        expect(inFrame(run.kicker), 'the kicker in the picture on the run-up').toBe(true);
        await snap(page, 'shootout-runup', info);
        await page.waitForTimeout(450);
        expect(inFrame((await pitchKicker(page))!.kicker)).toBe(true);
        await snap(page, 'shootout-flight', info);
      }
    }
    await expect
      .poll(async () => (await roomOf(page, 'football'))!.penalties.length, { timeout: 30000 })
      .toBeGreaterThan(n);
    if (kicks === 2) {
      await page.waitForTimeout(1300);
      await snap(page, 'shootout-result', info);
    }
  }
  const room = (await roomOf(page, 'football'))!;
  expect(room.status).toBe('finished');
  expect(room.penalties.length).toBeGreaterThanOrEqual(6);
  expect(room.penalties.every((p) => p.outcome)).toBe(true);
  await expect(dialog.getByRole('heading', { name: /wins!|It’s a tie/ })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(2500);
  await snap(page, 'shootout-finished', info);
  expect(errors).toEqual([]);
});

test('two players at the pool table: one breaks, the other sees it and plays', async ({
  page: a,
  browser,
}, info) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });
  const b = await context.newPage();
  await withoutNetlifyDrawer(b);
  try {
    await founder(a, 'Ada Breaker');
    await founder(b, 'Bola Potter');
    const aId = (await state(a)).me.id,
      bId = (await state(b)).me.id;
    await command(a, { type: 'visit.invite', toPlayerId: bId });
    const invitation = (await state(b)).visits.incoming.find((v) => v.hostId === aId)!;
    await command(b, { type: 'visit.accept', inviteId: invitation.id });
    const gameA = await lobby(a);
    await gameA.getByRole('button', { name: /8-ball pool/ }).click();
    await gameA.getByLabel('Room name').fill('Pool night');
    await gameA.getByRole('button', { name: /Create room/ }).click();
    const homeB = await openTogether(b);
    await homeB.getByRole('button', { name: /Pool night/ }).click();
    const gameB = b.getByRole('dialog', { name: 'Play together' });
    await gameB.getByRole('button', { name: /^Join/ }).click();
    await expect(gameA.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 10000 });
    await gameA.getByRole('button', { name: 'Start game' }).click();
    await expect(gameA.locator('.pool-table canvas')).toBeVisible({ timeout: 10000 });
    const room = (await roomOf(a, 'snooker'))!;
    await strokeByHand(a, room);
    // B's table replays the break as it happened.
    await expect(gameB.locator('.pool-table canvas')).toHaveAttribute('data-rolling', '1', {
      timeout: 10000,
    });
    await snap(b, 'pool-two-player-break', info);
    await expect(gameB.locator('.pool-table canvas')).toHaveAttribute('data-rolling', '0', {
      timeout: 30000,
    });
    const after = (await roomOf(a, 'snooker'))!;
    expect(after.pool!.shots).toBe(1);
    if (after.turn === bId) {
      await expect.poll(() => Date.now() > after.pool!.readyAt).toBe(true);
      await expect(gameB.locator('.pool-table canvas')).toHaveAttribute('data-mine', '1', {
        timeout: 15000,
      });
      await strokeByHand(b, (await roomOf(b, 'snooker'))!);
      await expect
        .poll(async () => (await roomOf(a, 'snooker'))!.pool!.shots, { timeout: 15000 })
        .toBe(2);
    }
    await snap(a, 'pool-two-player', info);
  } finally {
    await context.close();
  }
});

/**
 * Round 7e: on an upright tablet and a laptop too, the player leaning over
 * the pool table for the break and the kicker behind the ball (then running
 * up and striking it) are all in the picture, clear of the controls.
 */
/** A new founder at this screen size, at the table games in 3D. */
async function atSize(browser: Browser, url: string | undefined, w: number, h: number) {
  const context = await browser.newContext({ baseURL: url, viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Pat Frame',
    handle: `tg_${letters(8)}`,
    company: `Studio ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /London/,
  });
  await expect(page.locator('[data-hud-bar]')).toBeVisible({ timeout: 30000 });
  return { context, page, errors, dialog: await lobby(page, true) };
}

for (const [w, h] of [
  [768, 1024],
  [1440, 900],
] as const) {
  test(`the pool player leaning over the table, in the picture at ${w}×${h}`, async ({
    browser,
  }, info) => {
    test.setTimeout(240_000);
    const { context, page, errors, dialog } = await atSize(browser, info.project.use.baseURL, w, h);
    await dialog.getByRole('button', { name: /8-ball pool/ }).click();
    await dialog.getByRole('button', { name: 'Play vs AI' }).click();
    await expect(dialog.locator('.pool-table canvas')).toBeVisible({ timeout: 15000 });
    await expectPoolPlayer(page, `the break at ${w}×${h}`);
    await dialog.locator('.pool-table canvas').scrollIntoViewIfNeeded();
    await snap(page, `pool-player-${w}x${h}`, info);
    expect(errors).toEqual([]);
    await context.close();
  });

  test(`the kicker behind the ball, then the kick, in the picture at ${w}×${h}`, async ({
    browser,
  }, info) => {
    test.setTimeout(240_000);
    const { context, page, errors, dialog } = await atSize(browser, info.project.use.baseURL, w, h);
    await dialog.getByRole('button', { name: /Football shootout/ }).click();
    await dialog.getByRole('button', { name: 'Play vs AI' }).click();
    await expect(dialog.locator('.shootout-pitch canvas')).toBeVisible({ timeout: 15000 });
    await expectKicker(page, `ready at ${w}×${h}`);
    await dialog.locator('.shootout-pitch canvas').scrollIntoViewIfNeeded();
    await snap(page, `shootout-kicker-${w}x${h}`, info);
    // The run-up and the strike stay in the picture.
    await expect(page.locator('.shootout-pitch canvas')).toHaveAttribute('data-turn', 'shoot', {
      timeout: 15000,
    });
    await swipeAt(page, -2.4, 1.6, 260, 0);
    await expect
      .poll(async () => (await pitchKicker(page))!.T, { timeout: 15000 })
      .toBeGreaterThan(0.3);
    expect(
      inFrame((await pitchKicker(page))!.kicker),
      'the kicker in the picture on the kick',
    ).toBe(true);
    await snap(page, `shootout-kick-${w}x${h}`, info);
    expect(errors).toEqual([]);
    await context.close();
  });
}
