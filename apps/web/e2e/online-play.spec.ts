import type { PlayerView } from '@runway/engine';
import {
  test,
  expect,
  letters,
  playAsGuest,
  setupFounder,
  withoutNetlifyDrawer,
  type Page,
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
  await expect(p.getByRole('button', { name: /^Together/ })).toBeVisible({ timeout: 30000 });
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
    await founder(friend, 'Friend Femi');

    // "● N online" opens the list of real players, grouped by city.
    const count = page.locator('.online-count');
    await expect(count).toHaveText(/\d+ online/);
    await count.click();
    const sheet = page.getByRole('dialog', { name: 'Online now' });
    await expect(sheet.getByRole('heading', { name: /In your city/ })).toBeVisible();
    const row = sheet.locator('.online-row', { hasText: 'Friend Femi' });
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText('London');
    await row.getByRole('button', { name: 'Invite to play' }).click();
    await row.getByRole('button', { name: 'Football' }).click();
    await expect(page.getByText('Invitation to play Football sent to Friend Femi.')).toBeVisible();
    await page.screenshot({ path: info.outputPath('online-now-mobile.png') });
    await sheet.getByRole('button', { name: 'Close' }).click();

    // Solo: football against an AI opponent, played to the end.
    const before = (await state(page)).accounts.local!.balance;
    await page.getByRole('button', { name: /^Together/ }).click();
    await page
      .getByRole('dialog', { name: 'Home and social experiences' })
      .getByRole('button', { name: /Play football or host/ })
      .click();
    const lobby = page.getByRole('dialog', { name: 'Play together' });
    await expect(lobby.getByRole('heading', { name: 'Nobody around? Play vs AI' })).toBeVisible();
    await lobby.getByLabel(/Stake per player/).fill('5');
    await expect(lobby.getByText(/Each AI player pays the same/)).toBeVisible();
    await lobby.getByRole('button', { name: 'Play vs AI' }).click();
    // An AI opponent sits down and the shootout starts at once.
    await expect(lobby.locator('.experience-scores > div')).toHaveCount(2, { timeout: 10000 });
    await expect(lobby.locator('.experience-scores')).toContainText('AI player');
    await expect(lobby.getByText(/Your penalty|You are in goal/)).toBeVisible();
    const finished = lobby.getByRole('heading', { name: /wins!$|^It’s a tie!$/ });
    for (let i = 0; i < 40 && !(await finished.isVisible()); i++) {
      const lane = lobby.locator('.experience-goal button').nth(i % 5);
      try {
        await expect(lane).toBeEnabled({ timeout: 8000 });
        await lane.click({ timeout: 2000 });
      } catch {
        // The shootout ended (or moved on) while we aimed.
      }
      // The AI answers at once: the kick is taken (or the shootout is over).
      await expect(lobby.locator('.experience-penalties span').nth(i).or(finished)).toBeVisible({
        timeout: 10000,
      });
    }
    await expect(finished).toBeVisible({ timeout: 10000 });
    const after = (await state(page)).accounts.local!.balance;
    // The winner takes the pot: up or down by one stake (£5).
    expect([before - 500, before + 500]).toContain(after);
    const room = (await state(page)).playRooms.find((r) => r.title === 'Penalties against AI')!;
    expect(room.status).toBe('finished');
    expect(room.ai).toHaveLength(1);
    expect(room.penalties.length).toBeGreaterThanOrEqual(10);
    await page.screenshot({ path: info.outputPath('football-vs-ai-mobile.png') });
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
