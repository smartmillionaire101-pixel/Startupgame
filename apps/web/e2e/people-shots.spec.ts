import type { Locator } from '@playwright/test';
import {
  expect,
  letters,
  openMoney,
  pickPath,
  playAsGuest,
  setupFounder,
  setupPlayer,
  tapPlace,
  hudMore,
  openTogether,
  test,
  type Page,
} from './fixtures';

/**
 * Pictures for review of the screens whose people are the 3D ones
 * (../src/avatar/PersonPortrait.tsx, ../src/city/PersonSprite.tsx) and of
 * the shootout's stand of 3D fans (../src/experiences/stadium3d.ts), on a
 * 390 × 844 phone at 2×, once the pictures are drawn. Only with
 * PEOPLE_SHOTS=<dir>.
 */
const DIR = process.env.PEOPLE_SHOTS;
test.skip(!DIR, 'PEOPLE_SHOTS=<dir> takes the screenshots');
test.describe.configure({ mode: 'parallel' });
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

const state = async (p: Page) => (await (await p.request.get('/api/state')).json()).view;

/** Full quality pictures on this CPU-only GPU; the map Lite unless asked. */
async function hq(page: Page, map: 'lite' | '3d' = 'lite') {
  await page.addInitScript((m) => {
    try {
      localStorage.setItem('runway.hq', '1');
      localStorage.setItem('runway.mapQuality', m);
      localStorage.setItem('runway.lifeEventsPopup', '0');
    } catch {
      /* storage blocked */
    }
  }, map);
}

/** Wait for the people's pictures on screen to be drawn, then shoot. */
async function snap(page: Page, name: string, o: { full?: boolean; clip?: Locator } = {}) {
  await page.waitForTimeout(400);
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    const left = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('[data-sprite="loading"]').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) n++;
      });
      return n;
    });
    if (!left) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(250);
  const box = o.clip ? await o.clip.boundingBox() : null;
  await page.screenshot({
    path: `${DIR}/${name}.png`,
    fullPage: !!o.full,
    ...(box ? { clip: box } : {}),
  });
}

async function founder(page: Page, market = /London/) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Shots',
    handle: `ps_${letters(6)}`,
    company: `Shots ${letters(5)}`,
    idea: 'Payments for market traders',
    market,
  });
  await expect(page.locator('[data-hud-bar]')).toBeVisible({ timeout: 30_000 });
}

test('sign-up: careers and the look', async ({ page }) => {
  await hq(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pick your path' })).toBeVisible();
  await snap(page, 'signup-path');
  await pickPath(page, 'founder');
  await expect(page.getByRole('heading', { name: 'Your look' })).toBeVisible();
  await page.getByRole('radio', { name: 'Woman', exact: true }).check();
  await snap(page, 'signup-look');
});

test('the creator and the leaderboard', async ({ page }) => {
  test.setTimeout(300_000);
  await hq(page);
  await founder(page);
  await page.getByRole('button', { name: 'Me', exact: true }).click();
  const board = page.locator('.board').first();
  await board.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await snap(page, 'me-leaderboard');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Edit my look' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit my look' });
  await snap(page, 'creator-face');
  await edit.getByRole('tab', { name: 'Hair' }).click();
  await snap(page, 'creator-hair');
  await edit.getByRole('tab', { name: 'Top' }).click();
  await snap(page, 'creator-top');
});

test('a customer interview and a sales talk', async ({ page }) => {
  test.setTimeout(300_000);
  await hq(page);
  await founder(page, /Lagos/);
  await page.getByRole('button', { name: /Places/ }).click();
  await page.getByRole('dialog', { name: 'Places' }).locator('[data-kind="stall"]').first().click();
  await page.locator('.tray-card[data-action="interview"]').click();
  const sheet = page.getByRole('dialog', { name: /^Customer interview/ });
  await expect(sheet).toBeVisible();
  await snap(page, 'interview-meet');
  await sheet.getByRole('button', { name: 'Start the interview' }).click();
  await expect(sheet.locator('[data-interview]')).toHaveAttribute('data-interview', 'round', {
    timeout: 15_000,
  });
  await snap(page, 'interview-round');
  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.keyboard.press('Escape');

  const phone = page.getByRole('dialog', { name: 'Phone' });
  await page
    .getByRole('button', { name: /^Phone/ })
    .first()
    .click();
  await phone.locator('[data-app="sales"]').click();
  const sales = phone.locator('[data-sales]');
  await sales.getByRole('button', { name: 'Find new leads' }).click();
  const lead = sales.locator('[data-deal-stage="lead"]').first();
  await expect(lead).toBeVisible({ timeout: 15_000 });
  const deal = sales.locator(`[data-deal="${await lead.getAttribute('data-deal')}"]`);
  await deal.locator('button[data-action="contact"]').click();
  await deal.locator('[data-confirm="contact"]').getByRole('button', { name: 'Confirm' }).click();
  await expect(deal).toHaveAttribute('data-deal-stage', 'contacted', { timeout: 15_000 });
  await deal.locator('button[data-action="talk"]').click();
  const talk = page.getByRole('dialog', { name: /^Sales conversation/ });
  await expect(talk).toBeVisible();
  await snap(page, 'sales-talk');
});

test('a pitch meeting', async ({ page }) => {
  test.setTimeout(300_000);
  await hq(page);
  await founder(page, /Lagos/);
  const funds: string[] = await page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    const c = s.view.companies[0];
    return s.view.market.funds
      .filter(
        (f: { ai: boolean; sectors: string[] | 'any'; stages: string[] }) =>
          f.ai &&
          (f.sectors === 'any' || f.sectors.includes(c.industry)) &&
          f.stages.includes(c.nextStage),
      )
      .map((f: { id: string }) => f.id);
  });
  await openMoney(page);
  for (const id of funds.slice(0, 5)) {
    const more = page.locator('details.more-list:not([open]) summary');
    if (await more.count()) await more.first().click();
    const btn = page.locator(`[data-pitch-fund="${id}"]`);
    if (!(await btn.isEnabled())) continue;
    await btn.click();
    const deck = page.getByRole('dialog', { name: /^Pitch / });
    await deck.locator('[data-pitch-go]').click();
    const meeting = page.getByRole('dialog', { name: /^Pitch meeting/ });
    if (
      !(await meeting.waitFor({ timeout: 5000 }).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await expect(meeting.locator('.pm-scene')).toBeVisible();
    await snap(page, 'pitch-meeting');
    break;
  }
});

test('phone: social feed and events', async ({ page }) => {
  test.setTimeout(300_000);
  await hq(page);
  await founder(page, /Lagos/);
  // A milestone of your own in the feed.
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await page
    .getByRole('button', { name: /^Phone/ })
    .first()
    .click();
  await phone.locator('[data-app="social"]').click();
  await phone.getByLabel('Share a milestone').fill('First customer signed today!');
  await phone.getByRole('button', { name: 'Post' }).click();
  await snap(page, 'phone-social');
  await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="events"]').click();
  const sp = phone.locator('.phone-speakers').first();
  if (await sp.count()) await sp.scrollIntoViewIfNeeded();
  await snap(page, 'phone-events');
});

test('home: invite someone over', async ({ page }) => {
  test.setTimeout(300_000);
  await hq(page);
  await founder(page, /Lagos/);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await hudMore(scene);
  await scene.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(scene.getByRole('dialog', { name: 'Invite someone over' })).toBeVisible();
  await snap(page, 'home-invite');
});

test('a life event about a person', async ({ page }) => {
  test.setTimeout(600_000);
  await hq(page);
  await page.addInitScript(() => localStorage.setItem('runway.lifeEventsPopup', '1'));
  await playAsGuest(page);
  const n = letters(6);
  await setupPlayer(page, {
    type: 'player.create',
    name: `Life ${n}`,
    handle: `life_${n}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'accra',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await page.locator('[data-hud-bar]').waitFor();
  const people = [
    'life-friend-loan',
    'life-wedding',
    'life-family-visit',
    'life-neighbour',
    'life-cofounder',
    'life-journalist',
    'life-coffee',
    'life-staff-ill',
  ];
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() =>
      fetch('/api/dev/settle', {
        method: 'POST',
        headers: { 'x-runway': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ market: 'accra' }),
      }),
    );
    const s = await state(page);
    const open = (s.decisions.open as { life: boolean; template: string }[]).filter((e) => e.life);
    if (open.some((e) => people.includes(e.template))) break;
  }
  // Answer the others so the person's card pops up.
  for (let i = 0; i < 6; i++) {
    await page.reload();
    const card = page.locator('[data-life-event]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    const t = await card.getAttribute('data-life-template');
    if (people.includes(t!) || i === 5) break;
    await page.getByRole('dialog').filter({ has: card }).getByRole('button').first().click();
  }
  await snap(page, 'life-event');
});

test('the stadium: a goal in the shootout', async ({ page }) => {
  test.setTimeout(420_000);
  await hq(page, '3d');
  await founder(page);
  const home = await openTogether(page);
  await home.getByRole('button', { name: /Play football or host/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Play together' });
  await dialog.getByRole('button', { name: /Football shootout/ }).click();
  await dialog.getByRole('button', { name: 'Play vs AI' }).click();
  const canvas = dialog.locator('.shootout-pitch canvas');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await canvas.scrollIntoViewIfNeeded();
  // The stand of 3D fans (absent before it existed: then the painted one).
  await expect(canvas)
    .toHaveAttribute('data-crowd', 'calm', { timeout: 90_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  await snap(page, 'stadium-wide');
  await snap(page, 'stadium-pitch', { clip: canvas });
  // Shoot until a goal goes in; catch the stand celebrating.
  for (let k = 0; k < 12; k++) {
    const room = (await state(page)).playRooms.find(
      (r: { game: string; status: string }) => r.game === 'football' && r.status === 'playing',
    );
    if (!room) break;
    await expect(canvas).toHaveAttribute('data-turn', /shoot|dive/, { timeout: 30_000 });
    const turn = await canvas.getAttribute('data-turn');
    const n = room.penalties.length;
    if (turn === 'shoot') {
      const box = (await canvas.boundingBox())!;
      const [bx, by] = (await canvas.getAttribute('data-ball'))!.split(',').map(Number);
      const [gl, gt, gr, gb] = (await canvas.getAttribute('data-goal'))!.split(',').map(Number);
      const tx = gl! + (k % 2 ? 0.9 : 0.1) * (gr! - gl!),
        ty = gt! + 0.25 * (gb! - gt!);
      await page.mouse.move(box.x + bx!, box.y + by!);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(
          box.x + bx! + (tx - bx!) * (i / 8),
          box.y + by! + (ty - by!) * (i / 8),
        );
        await page.waitForTimeout(30);
      }
      await page.mouse.up();
    } else {
      await dialog.getByRole('button', { name: 'Stay in the middle', exact: true }).click();
    }
    await expect
      .poll(
        async () =>
          (await state(page)).playRooms.find((r: { id: string }) => r.id === room.id).penalties
            .length,
        { timeout: 30_000 },
      )
      .toBeGreaterThan(n);
    const p = (await state(page)).playRooms.find((r: { id: string }) => r.id === room.id).penalties[
      n
    ];
    // The ball lands about 1.1 s after the kick shows; the stand is up just after.
    const up = await expect(canvas)
      .toHaveAttribute('data-crowd', /home|away/, { timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    if (!up) await page.waitForTimeout(1500);
    if (p.goal && p.shooter === (await state(page)).me.id) {
      await page.waitForTimeout(250);
      await snap(page, 'stadium-goal-wide');
      const box = (await canvas.boundingBox())!;
      await page.screenshot({
        path: `${DIR}/stadium-goal-stands.png`,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height * 0.45 },
      });
      break;
    }
    await expect(canvas).toHaveAttribute('data-playing', '0', { timeout: 15_000 });
  }
});
