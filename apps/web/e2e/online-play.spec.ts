import type { PlayerView } from '@runway/engine';
import {
  test,
  expect,
  letters,
  playAsGuest,
  setupFounder,
  withoutNetlifyDrawer,
  type Page,
  openTogether,
} from './fixtures';

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;

async function founder(p: Page, name: string) {
  await playAsGuest(p);
  await setupFounder(p, {
    name,
    handle: `solo_${letters(8)}`,
    company: `Solo ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /London/,
  });
  await expect(p.locator('.topbar')).toBeVisible({ timeout: 30000 });
}

test('Online now lists a real player, and a solo player plays a penalty shootout against AI', async ({
  page,
  browser,
}, info) => {
  test.slow();
  const other = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });
  const friend = await other.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await withoutNetlifyDrawer(friend);
    await founder(page, 'Solo Sade');
    const friendName = `Friend ${letters(6)}`;
    await founder(friend, friendName);

    // "● N online" opens the list of real players, grouped by city.
    const count = page.locator('.online-count');
    await expect(count).toHaveText(/\d+ online/);
    await count.click();
    const sheet = page.getByRole('dialog', { name: 'Online now' });
    await expect(sheet.getByRole('heading', { name: /In your city/ })).toBeVisible();
    const row = sheet.locator('.online-row', { hasText: friendName });
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText('London');
    await row.getByRole('button', { name: 'Invite to play' }).click();
    await row.getByRole('button', { name: 'Football' }).click();
    await expect(
      page.getByText(`Invitation to play Football sent to ${friendName}.`),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('online-now-mobile.png') });
    await sheet.getByRole('button', { name: 'Close' }).click();

    // Solo: football against an AI opponent, played to the end.
    const before = (await state(page)).accounts.local!.balance;
    await (await openTogether(page)).getByRole('button', { name: /Play football or host/ }).click();
    const lobby = page.getByRole('dialog', { name: 'Play together' });
    await expect(lobby.getByRole('heading', { name: 'Nobody around? Play vs AI' })).toBeVisible();
    await lobby.getByLabel(/Stake per player/).fill('5');
    await expect(lobby.getByText(/Each AI player pays the same/)).toBeVisible();
    await lobby.getByRole('button', { name: 'Play vs AI' }).click();
    // An AI opponent sits down and the shootout starts at once.
    await expect(lobby.locator('.experience-scores > div')).toHaveCount(2, { timeout: 10000 });
    await expect(lobby.locator('.experience-scores')).toContainText('AI player');
    // The shootout's pitch, then the kicks and dives through the server (the
    // swipes and dive buttons themselves are played in table-games.spec.ts).
    await expect(lobby.locator('.shootout-pitch canvas')).toBeVisible({ timeout: 15000 });
    const finished = lobby.getByRole('heading', { name: /wins!$|It’s a tie/ });
    const shootout = async () =>
      (await state(page)).playRooms.find((r) => r.title === 'Penalties against AI')!;
    for (let i = 0; i < 60; i++) {
      const room = await shootout();
      if (room.status === 'finished') break;
      const kicks = room.penalties.length;
      await page.request.post('/api/commands', {
        headers: { 'x-runway': '1' },
        data: {
          command: {
            type: 'play.penalty',
            roomId: room.id,
            round: room.round,
            lane: i % 5,
            kick: { x: i % 2 ? 2.6 : -2.6, y: 1.2, power: 0.6, curve: 0 },
          },
        },
      });
      // The AI answers: the kick is taken (or the shootout is over).
      await expect
        .poll(
          async () => {
            const r = await shootout();
            return r.status === 'finished' || r.penalties.length > kicks;
          },
          { timeout: 20000 },
        )
        .toBe(true);
    }
    await expect(finished).toBeVisible({ timeout: 10000 });
    const after = (await state(page)).accounts.local!.balance;
    // The winner takes the pot: up or down by one stake (£5).
    expect([before - 500, before + 500]).toContain(after);
    const room = (await state(page)).playRooms.find((r) => r.title === 'Penalties against AI')!;
    expect(room.status).toBe('finished');
    expect(room.ai).toHaveLength(1);
    // Five each, but it ends once a side can't catch up (3-0 after six kicks at the earliest).
    expect(room.penalties.length).toBeGreaterThanOrEqual(6);
    await page.screenshot({ path: info.outputPath('football-vs-ai-mobile.png') });
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
