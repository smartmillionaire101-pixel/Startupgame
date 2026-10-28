/**
 * Playtest round 7, the table games, end to end:
 *
 * - #16 two players looking for a quiz at once are paired, even from two
 *   venues (each from their own home here), and the second sees the first's
 *   table listed before looking;
 * - #23 a game from Messages: an invitation card with a stake held in the
 *   pot, accepted from the chat, both players taken to the same table, and
 *   the pot paid out (the guest leaves the game under way: the host wins);
 * - #18 a game nobody has played yet is cancelled ("Cancel game"), every
 *   entry back, with the same Keep playing / Cancel game question.
 */
import type { Browser, Locator, Page } from '@playwright/test';
import { expect, letters, playAsGuest, test, openTogether, withoutNetlifyDrawer } from './fixtures';

interface Room {
  id: string;
  game: string;
  status: string;
  stake: number;
  pot: number;
  members: { id: string }[];
}
interface State {
  me: { id: string; golf: { match: { stakes: number[] } } };
  accounts: { local: { balance: number } };
  playRooms: Room[];
  visits: { incoming: { id: string; hostId: string }[] };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as State;
  });
const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.json() };
  }, cmd);

/** A Johannesburg founder made through the API, on a phone. */
async function player(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const h = `qi_${letters(8)}`;
  const r = await command(page, {
    type: 'player.create',
    handle: h,
    name,
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'johannesburg',
    gender: 'female',
    company: {
      name: `Quiz ${h.slice(3)}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  });
  expect(r.status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function twoPlayers(browser: Browser, a: Page) {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });
  const b = await ctx.newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  const names = [`Ama${tag} Mensah`, `Bisi${tag} Ade`] as const;
  await player(a, names[0]);
  await player(b, names[1]);
  return { b, ctx, names, aId: (await state(a)).me.id, bId: (await state(b)).me.id };
}

async function lobby(p: Page) {
  const home = await openTogether(p);
  await home.getByRole('button', { name: /Play football or host/ }).click();
  return p.getByRole('dialog', { name: 'Play together' });
}

async function openChat(page: Page, name: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  while (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="messages"]').click();
  await phone.getByRole('button', { name: 'New message' }).click();
  await phone.getByLabel('Search people').fill(name.split(' ')[0]!);
  await phone.locator('.phone-row', { hasText: name }).first().click();
  await expect(phone.locator('[data-player-thread]')).toBeVisible();
  return phone;
}
const lastCard = (phone: Locator) => phone.locator('[data-card="play"]').last();
/** QUIZ_SHOTS=<dir> saves screenshots of each step there. */
const shot = async (page: Page, name: string) => {
  if (process.env.QUIZ_SHOTS)
    await page.screenshot({ path: `${process.env.QUIZ_SHOTS}/${name}.png` });
};

test('two players looking for a quiz at once are paired, from two venues', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(180_000);
  const { b, ctx, names, aId, bId } = await twoPlayers(browser, a);
  try {
    // B may sit at A's home table (an accepted visit), as in the game.
    await command(a, { type: 'visit.invite', toPlayerId: bId });
    const visit = (await state(b)).visits.incoming.find((v) => v.hostId === aId)!;
    await command(b, { type: 'visit.accept', inviteId: visit.id });
    const gameA = await lobby(a);
    await gameA.getByRole('button', { name: /Quiz night Think fast/ }).click();
    await gameA.getByRole('button', { name: 'Find an opponent' }).click();
    await expect(gameA.getByText(/Looking for a player in this city/)).toBeVisible();
    // B, at their own home (another venue), sees A's table waiting …
    const gameB = await lobby(b);
    await expect(gameB.locator('[data-rooms="elsewhere"]')).toContainText('Quiz night', {
      timeout: 10_000,
    });
    await gameB.getByRole('button', { name: /Quiz night Think fast/ }).click();
    await shot(b, 'quiz-lobby-elsewhere');
    // … and looking for an opponent puts B at it.
    await gameB.getByRole('button', { name: 'Find an opponent' }).click();
    await expect(gameB.locator('.experience-scores')).toContainText(names[0], { timeout: 10_000 });
    await expect(gameA.locator('.experience-scores')).toContainText(names[1], { timeout: 10_000 });
    const quiz = (await state(a)).playRooms.filter(
      (r) => r.game === 'quiz' && r.status !== 'cancelled',
    );
    expect(quiz).toHaveLength(1);
    expect(quiz[0]!.members.map((m) => m.id).sort()).toEqual([aId, bId].sort());
    await expect(gameA.getByRole('button', { name: 'Start game' })).toBeEnabled();
  } finally {
    await ctx.close();
  }
});

test('a game from Messages: accepted, both at the same table, the stake held and paid out', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(240_000);
  const { b, ctx, names, aId, bId } = await twoPlayers(browser, a);
  try {
    const stake = (await state(a)).me.golf.match.stakes[1]!;
    const a0 = (await state(a)).accounts.local.balance;
    const b0 = (await state(b)).accounts.local.balance;
    const aPhone = await openChat(a, names[1]);
    await aPhone.getByRole('button', { name: 'Do something together' }).click();
    await aPhone.getByRole('menuitem', { name: /Play a game/ }).click();
    const panel = aPhone.getByLabel('Play a game');
    await panel.locator('[data-play-game="quiz"]').click();
    await expect(panel.getByLabel('Where')).toBeVisible();
    await panel.locator(`[data-golf-stake="${stake}"]`).click();
    await shot(a, 'chat-play-panel');
    await panel.locator('[data-action="play-invite"]').click();
    await expect(lastCard(aPhone)).toHaveAttribute('data-card-status', 'waiting', {
      timeout: 10_000,
    });
    // The stake is in the pot as it's sent.
    await expect.poll(async () => (await state(a)).accounts.local.balance).toBe(a0 - stake);
    await aPhone.getByRole('button', { name: 'Close phone' }).click();
    // B has it as a notice and in the chat; accepting from the card takes B to the table.
    await expect(b.locator('[data-play-invite]')).toBeVisible({ timeout: 20_000 });
    await shot(b, 'play-invite-notice');
    const bPhone = await openChat(b, names[0]);
    const card = lastCard(bPhone);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await shot(b, 'chat-play-card');
    await card.locator('[data-action="play-accept"]').click();
    const gameB = b.getByRole('dialog', { name: 'Play together' });
    await expect(gameB).toBeVisible({ timeout: 10_000 });
    // A is taken to the same table.
    const gameA = a.getByRole('dialog', { name: 'Play together' });
    await expect(gameA).toBeVisible({ timeout: 20_000 });
    await expect(gameA.locator('.experience-scores')).toContainText(names[1]);
    const room = (await state(a)).playRooms.find(
      (r) => r.game === 'quiz' && r.status === 'waiting',
    )!;
    expect(room.members.map((m) => m.id)).toEqual([aId, bId]);
    expect(room.pot).toBe(2 * stake);
    await gameA.getByRole('button', { name: 'Start game' }).click();
    await expect(gameB.getByText(/^QUESTION 1 OF/)).toBeVisible({ timeout: 10_000 });
    // B leaves the game under way: the same question as every table game, and A wins the pot.
    await gameB.locator('[data-action="leave-game-ask"]').click();
    const ask = gameB.getByRole('alertdialog', { name: 'Leave the game?' });
    await expect(ask.getByRole('button', { name: 'Keep playing' })).toBeVisible();
    await shot(b, 'leave-game-ask');
    await ask.getByRole('button', { name: 'Leave game' }).click();
    await expect(gameB).toBeHidden();
    await expect(gameA.locator('[data-forfeit]')).toBeVisible({ timeout: 15_000 });
    expect((await state(a)).accounts.local.balance).toBe(a0 + stake);
    expect((await state(b)).accounts.local.balance).toBe(b0 - stake);
  } finally {
    await ctx.close();
  }
});

test('a game nobody has played yet is cancelled: every entry back, no forfeit', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await player(page, `Cara${letters(4)} Zulu`);
  const before = (await state(page)).accounts.local.balance;
  const game = await lobby(page);
  await game.getByRole('button', { name: /8-ball pool/ }).click();
  await game
    .getByLabel(/Stake per player/)
    .first()
    .fill('10');
  await game.getByRole('button', { name: 'Play vs AI' }).click();
  await expect(game.locator('.pool-table canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await state(page)).accounts.local.balance).toBe(before - 1000);
  // Closing asks the same question; Keep playing stays at the table.
  await game.getByRole('button', { name: 'Close games' }).click();
  const ask = game.getByRole('alertdialog', { name: 'Cancel the game?' });
  await expect(ask).toBeVisible();
  await shot(page, 'cancel-game-ask');
  await ask.getByRole('button', { name: 'Keep playing' }).click();
  await expect(ask).toBeHidden();
  await game.locator('[data-action="cancel-game"]').click();
  await game
    .getByRole('alertdialog', { name: 'Cancel the game?' })
    .getByRole('button', { name: 'Cancel game' })
    .click();
  await expect(game).toBeHidden();
  const after = await state(page);
  expect(after.accounts.local.balance).toBe(before);
  const pool = after.playRooms.find((r) => r.game === 'snooker')!;
  expect(pool.status).toBe('cancelled');
});
