import { devices, type Browser, type Page } from '@playwright/test';
import { QUIZ_BANK } from '../../../packages/engine/src/data/quiz-bank';
import { expect, letters, playAsGuest, setupFounder, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Wave 12 §A (docs/WAVE12-DEEPER-EXPERIENCES.md): games you play for real.
 * A quiz night at a bar against AI players, where the stake goes to the
 * winner; a quiz hosted at home with your own questions and two real players;
 * pool against an AI player; football on the TV with a guest.
 *
 * GAMES_SHOTS=<dir> saves 390×844 screenshots along the way.
 */

const SHOTS = process.env.GAMES_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

interface State {
  me: { id: string };
  accounts: { local: { balance: number } };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view as State;
  });

const command = (page: Page, command: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.json() };
  }, command);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the game view, read loosely
const gameOf = (page: Page, id: string): Promise<any> =>
  page.evaluate(async (gid) => {
    const r = await fetch(`/api/games/${gid}`, { headers: { 'x-runway': '1' } });
    return (await r.json()).game;
  }, id);

async function founder(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const tag = letters(6);
  await setupFounder(page, {
    name,
    handle: `gm_${tag}`,
    company: `Games ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function newPlayer(browser: Browser, name: string) {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await withoutNetlifyDrawer(page);
  await founder(page, name);
  return page;
}

async function openGamesApp(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="games"]').click();
  await expect(phone.locator('[data-phone-app="games"]')).toBeVisible();
  return phone;
}

const screen = (page: Page) => page.locator('.gm-screen');

/** Answer the open question with the bank's right answer (as fast as we can). */
async function answerRight(page: Page) {
  const q = (await page.locator('.gm-q').innerText()).trim();
  const bank = QUIZ_BANK.find((b) => b.en[0] === q);
  expect(bank, `question in the bank: ${q}`).toBeTruthy();
  await page.locator('.gm-answer', { hasText: bank!.en[1] }).first().click();
}

test('quiz night at a bar: AI players, a stake, and the winner takes the pot', async ({ page }) => {
  test.setTimeout(180_000);
  await founder(page, 'Quiz Ada');
  const before = (await state(page)).accounts.local.balance;
  const phone = await openGamesApp(page);
  await shot(page, 'games-app');
  await phone.getByRole('button', { name: /Start a quiz night at/ }).click();
  const sheet = page.getByRole('dialog', { name: /Quiz night at/ });
  await expect(sheet).toBeVisible();
  // Three AI players, easy; a quarter of the max stake.
  await expect(sheet.locator('[data-ai-count="3"]')).toBeVisible();
  await sheet.getByRole('radio', { name: 'Easy' }).click();
  const stake = Number(await sheet.locator('[data-stake]').getAttribute('data-stake'));
  expect(stake).toBeGreaterThan(0);
  await shot(page, 'quiz-setup');
  await sheet.getByRole('button', { name: 'Set it up' }).click();
  // The lobby: four players (you and three AI regulars), the pot.
  await expect(screen(page)).toHaveAttribute('data-game-status', 'lobby');
  await expect(screen(page).locator('[data-seat="ai"]')).toHaveCount(3);
  await expect(screen(page).locator('[data-pot]')).toHaveAttribute('data-pot', String(stake * 4));
  await shot(page, 'quiz-lobby');
  await screen(page).getByRole('button', { name: 'Start the game' }).click();
  await expect(screen(page)).toHaveAttribute('data-game-status', 'playing');
  const id = (await screen(page).getAttribute('data-game'))!;
  const g0 = await gameOf(page, id);
  const n = g0.quizSetup.count as number;
  for (let i = 0; i < n; i++) {
    const quiz = page.locator(`[data-question="${i}"][data-quiz-phase="question"]`);
    await expect(quiz).toBeVisible({ timeout: 25_000 });
    if (i === 0) await shot(page, 'quiz-question');
    await answerRight(page);
    await expect(page.locator(`[data-question="${i}"][data-quiz-phase="reveal"]`)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.gm-answer.is-right.is-mine')).toBeVisible();
    if (i === 1) await shot(page, 'quiz-reveal');
  }
  // The result: you answered everything right, fastest: the whole pot is yours.
  await expect(screen(page)).toHaveAttribute('data-game-status', 'settled', { timeout: 20_000 });
  await expect(page.locator('[data-result="won"]')).toBeVisible();
  await shot(page, 'quiz-result');
  const g = await gameOf(page, id);
  expect(g.result.winners.map((w: { id: string }) => w.id)).toEqual([(await state(page)).me.id]);
  expect(g.result.yourPayout).toBe(stake * 4);
  expect((await state(page)).accounts.local.balance).toBe(before - stake + stake * 4);
});

test('a quiz hosted at home with your own questions, for two real players', async ({
  page: host,
  browser,
}) => {
  test.setTimeout(180_000);
  await founder(host, 'Host Kemi');
  const p1 = await newPlayer(browser, 'Player Tunde');
  const p2 = await newPlayer(browser, 'Player Bisi');
  const ids = await Promise.all([host, p1, p2].map(async (p) => (await state(p)).me.id));
  // The host has the two players in their contacts (met at a meetup).
  for (const [i, name] of [
    [1, 'Player Tunde'],
    [2, 'Player Bisi'],
  ] as const)
    expect((await command(host, { type: 'contact.save', personId: ids[i], name })).status).toBe(
      200,
    );

  const phone = await openGamesApp(host);
  await phone.getByRole('button', { name: /Host a quiz night/ }).click();
  const sheet = host.getByRole('dialog', { name: 'Host a quiz night' });
  await sheet.getByRole('button', { name: 'Fewer AI players' }).click();
  await sheet.getByRole('button', { name: 'Fewer AI players' }).click();
  await sheet.locator(`[data-invite="${ids[1]}"]`).click();
  await sheet.locator(`[data-invite="${ids[2]}"]`).click();
  await sheet.getByRole('radio', { name: 'Write my own' }).click();
  const questions = [
    ['What is the name of my dog?', 'Bingo', 'Rex', 'Lucky', 'Max'],
    ['Which street do I live on?', 'Allen Avenue', 'Broad Street', 'Marina Road', 'Awolowo Road'],
    ['What did I study?', 'Physics', 'Law', 'Medicine', 'Music'],
  ];
  for (let i = 0; i < 3; i++) {
    const d = sheet.locator(`[data-draft="${i}"]`);
    const [q, right, ...wrong] = questions[i]!;
    await d.getByLabel(`Question ${i + 1}`).fill(q!);
    await d.getByLabel('Right answer').fill(right!);
    for (let j = 0; j < 3; j++) await d.getByLabel(`Wrong answer ${j + 1}`).fill(wrong[j]!);
  }
  await shot(host, 'home-quiz-setup');
  await sheet.getByRole('button', { name: 'Set up my quiz' }).click();
  await expect(screen(host)).toHaveAttribute('data-game-status', 'lobby');
  await expect(screen(host).getByText(/you’re the quizmaster/i)).toBeVisible();
  const id = (await screen(host).getAttribute('data-game'))!;

  // Both players see the invitation in the Games app and join (their stakes go in).
  for (const p of [p1, p2]) {
    await p.reload();
    const ph = await openGamesApp(p);
    await ph.locator(`[data-game-row="${id}"]`).getByRole('button', { name: 'See invite' }).click();
    await expect(screen(p)).toHaveAttribute('data-game-status', 'lobby');
    await screen(p).getByRole('button', { name: /^Join/ }).click();
    await expect(screen(p).locator('.gm-seat.is-you')).toBeVisible();
  }
  await expect(screen(host).locator('[data-seat="player"]')).toHaveCount(2, { timeout: 10_000 });
  await shot(host, 'home-quiz-lobby');
  await screen(host).getByRole('button', { name: 'Start the game' }).click();

  for (let i = 0; i < 3; i++) {
    for (const p of [p1, p2])
      await expect(p.locator(`[data-question="${i}"][data-quiz-phase="question"]`)).toBeVisible({
        timeout: 25_000,
      });
    const text = (await p1.locator('.gm-q').innerText()).trim();
    const q = questions.find((x) => x[0] === text)!;
    // Tunde knows the host well; Bisi doesn't.
    await p1.locator('.gm-answer', { hasText: q[1]! }).click();
    await p2.locator('.gm-answer', { hasText: q[2]! }).click();
    if (i === 0) {
      await shot(p1, 'home-quiz-player');
      await shot(host, 'home-quiz-quizmaster');
    }
  }
  for (const p of [p1, p2, host])
    await expect(screen(p)).toHaveAttribute('data-game-status', 'settled', { timeout: 25_000 });
  await expect(p1.locator('[data-result="won"]')).toBeVisible();
  await expect(p2.locator('[data-result="lost"]')).toBeVisible();
  await shot(p1, 'home-quiz-result');
  const g = await gameOf(p1, id);
  expect(g.result.winners.map((w: { id: string }) => w.id)).toEqual([ids[1]]);
  expect(g.result.yourPayout).toBe(g.stake * 2);
});

test('pool against an AI player: aim, power, shots played out on the server', async ({ page }) => {
  test.setTimeout(240_000);
  await founder(page, 'Cue Ada');
  const phone = await openGamesApp(page);
  await phone.getByRole('button', { name: /^Pool at/ }).click();
  const sheet = page.getByRole('dialog', { name: /^Pool at/ });
  await expect(sheet.getByRole('radio', { name: 'An AI player' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet.getByRole('radio', { name: 'Easy' }).click();
  await sheet.getByRole('button', { name: 'Set it up' }).click();
  // One against an AI: straight on.
  await expect(screen(page)).toHaveAttribute('data-game-status', 'playing');
  const id = (await screen(page).getAttribute('data-game'))!;
  const table = page.locator('.gm-pool-table canvas');
  await expect(table).toBeVisible();
  await shot(page, 'pool-break');
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    const g = await gameOf(page, id);
    if (g.status === 'settled') break;
    if (!g.pool.yourTurn) {
      await page.waitForTimeout(500);
      continue;
    }
    // Wait for any animation to finish, then aim at a ball of ours (or any ball).
    await expect(page.locator('.gm-pool')).toHaveAttribute('data-your-turn', '1');
    await expect(page.getByRole('button', { name: 'Shoot' })).toBeEnabled({ timeout: 20_000 });
    const me = g.seats.find((s: { you: boolean }) => s.you).id;
    const grp = g.pool.groups?.[me];
    const balls = g.pool.balls as [number, number, number][];
    const want = balls.filter(([n]) =>
      grp === 'solids' ? n >= 1 && n <= 7 : grp === 'stripes' ? n >= 9 : n !== 0 && n !== 8,
    );
    const target = (want.length ? want : balls.filter(([n]) => n === 8))[0];
    if (target) {
      const box = (await table.boundingBox())!;
      const s = box.width / (99 + 15);
      await page.mouse.click(box.x + (target[1] + 7.5) * s, box.y + (target[2] + 7.5) * s);
    }
    if (i === 2) await shot(page, 'pool-aim');
    await page.getByRole('button', { name: 'Shoot' }).click();
    shots++;
    await expect
      .poll(async () => (await gameOf(page, id)).pool.seq, { timeout: 10_000 })
      .toBeGreaterThan(g.pool.seq);
  }
  expect(shots).toBeGreaterThan(0);
  const g = await gameOf(page, id);
  // Either the frame is over, or it is long: concede to finish it (the AI takes the pot).
  if (g.status !== 'settled') {
    await screen(page).getByRole('button', { name: 'Concede' }).click();
    await screen(page).getByRole('button', { name: 'Concede' }).last().click();
  }
  await expect(screen(page)).toHaveAttribute('data-game-status', 'settled', { timeout: 20_000 });
  const done = await gameOf(page, id);
  expect(done.result.winners.length).toBe(1);
  // Every shot the AI took is in the history: the server played it.
  expect(done.pool.seq).toBeGreaterThan(shots);
  await shot(page, 'pool-result');
});

test('football on the TV with a guest: a penalty shootout for a stake', async ({
  page: host,
  browser,
}) => {
  test.setTimeout(240_000);
  await founder(host, 'Host Ada');
  const guest = await newPlayer(browser, 'Guest Femi');
  const [hostId, guestId] = await Promise.all(
    [host, guest].map(async (p) => (await state(p)).me.id),
  );
  // Femi comes over to Ada's place.
  const inv = await command(host, { type: 'visit.invite', toPlayerId: guestId });
  expect(inv.status).toBe(200);
  expect(
    (await command(guest, { type: 'visit.accept', inviteId: inv.body.result.inviteId })).status,
  ).toBe(200);
  // "Let's play a video game": the guest starts football on the host's TV.
  await guest.reload();
  const phone = await openGamesApp(guest);
  await phone.getByRole('button', { name: /Football on the TV/ }).click();
  const sheet = guest.getByRole('dialog', { name: /Football at home/ });
  await expect(sheet.getByRole('radio', { name: 'A friend' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(sheet.locator(`[data-invite="${hostId}"]`)).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Set it up' }).click();
  await expect(screen(guest)).toHaveAttribute('data-game-status', 'lobby');
  const id = (await screen(guest).getAttribute('data-game'))!;
  const g0 = await gameOf(guest, id);
  // The host accepts from the Games app: the game starts.
  await host.reload();
  const hp = await openGamesApp(host);
  await hp.locator(`[data-game-row="${id}"]`).getByRole('button', { name: 'See invite' }).click();
  await screen(host).getByRole('button', { name: /^Join/ }).click();
  for (const p of [host, guest])
    await expect(screen(p)).toHaveAttribute('data-game-status', 'playing', { timeout: 10_000 });
  await shot(guest, 'football-start');

  const zones = ['Top left', 'Bottom right', 'Top right', 'Bottom left', 'Top centre'];
  for (let i = 0; i < 24; i++) {
    const g = await gameOf(host, id);
    if (g.status === 'settled') break;
    const k = g.football.kicks.at(-1);
    const shooter = k.shooter === hostId ? host : guest;
    const keeper = k.keeper === hostId ? host : guest;
    for (const [p, verb, z] of [
      [shooter, 'Shoot', zones[i % zones.length]!],
      [keeper, 'Dive', zones[(i * 3 + 1) % zones.length]!],
    ] as const) {
      const ctl = p.locator('.gm-fb-ctl');
      await expect(ctl.getByRole('group')).toBeVisible({ timeout: 15_000 });
      await ctl.getByRole('button', { name: z, exact: true }).click();
      if (i === 0 && verb === 'Shoot') await shot(p, 'football-aim');
      await ctl.getByRole('button', { name: verb, exact: true }).click();
    }
    await expect
      .poll(
        async () =>
          (await gameOf(host, id)).football.kicks.filter((x: { result: unknown }) => x.result)
            .length,
        {
          timeout: 10_000,
        },
      )
      .toBe(i + 1);
    if (i === 0) {
      await expect(guest.locator('[data-kick-result]')).toBeVisible({ timeout: 5000 });
      await shot(guest, 'football-kick');
    }
    // Let the kick play out before the next one.
    await expect(host.locator('[data-kick-result]')).toHaveCount(0, { timeout: 8000 });
  }
  for (const p of [host, guest])
    await expect(screen(p)).toHaveAttribute('data-game-status', 'settled', { timeout: 15_000 });
  const g = await gameOf(host, id);
  const paid = Object.values(g.result.winners).length;
  expect(paid).toBeGreaterThan(0);
  const winnerPage = g.result.winners[0].id === hostId ? host : guest;
  await expect(winnerPage.locator('[data-result="won"]')).toBeVisible();
  await shot(winnerPage, 'football-result');
  expect(g.stake).toBe(g0.stake);
});

test('darts at the bar against an AI player', async ({ page }) => {
  test.setTimeout(120_000);
  await founder(page, 'Darts Ada');
  const phone = await openGamesApp(page);
  await phone.getByRole('button', { name: /^Darts at/ }).click();
  await page
    .getByRole('dialog', { name: /^Darts at/ })
    .getByRole('button', { name: 'Set it up' })
    .click();
  await expect(screen(page)).toHaveAttribute('data-game-status', 'playing');
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('.gm-darts')).toHaveAttribute('data-darts', String(i));
    await page.getByRole('button', { name: i % 3 === 2 ? 'Bullseye' : 'Treble 20' }).click();
    if (i === 4) await shot(page, 'darts-play');
  }
  await expect(screen(page)).toHaveAttribute('data-game-status', 'settled', { timeout: 10_000 });
  await expect(page.locator('[data-result]')).toBeVisible();
  await shot(page, 'darts-result');
});
