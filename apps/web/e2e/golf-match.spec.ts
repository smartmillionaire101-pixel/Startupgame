import type { PlayerView } from '@runway/engine';
import {
  expect,
  expectGolfControlsClear,
  letters,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
  type Page,
} from './fixtures';

/**
 * Golf with a friend for money: the host invites a player in their city and
 * puts a stake in the pot, the friend accepts (their stake goes in too), both
 * play the hole (the engine plays every ball from the shot inputs) and the
 * lower score takes the pot. And the same against an AI friend.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.GOLF_MATCH_SHOTS;

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;
const balance = async (p: Page) => (await state(p)).accounts.local!.balance;

async function founder(page: Page, name: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `g_${letters(8)}`,
    company: `Fairway ${letters(5)}`,
    idea: 'Tee times for golf clubs',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

async function openClub(page: Page) {
  await expect(page.locator('[data-place="golf"], [data-badge="golf"]').first()).toBeAttached({
    timeout: 20_000,
  });
  await tapPlace(page, '[data-place="golf"]', 'cycle');
  const scene = page.locator('.golf-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  return scene;
}

/** Hold the swing button long enough for the power the meter marks (the pin). */
async function swing(page: Page) {
  const scene = page.locator('.golf-match-scene');
  const need = scene.locator('[data-golf-need]');
  const n = Number(await need.getAttribute('data-golf-need'));
  const lie = await need.getAttribute('data-golf-lie');
  const ms = Math.round((Math.max(8, n) / 110) * (lie === 'green' ? 2600 : 1300));
  const btn = scene.locator('[data-action="golf-swing"]');
  await expect(btn).toBeEnabled();
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Take your shots whenever it's your turn, on every page, until the match is over. */
async function playOut(pages: Page[], shot?: (p: Page) => Promise<void>) {
  let turns = 0;
  for (let guard = 0; guard < 400; guard++) {
    let over = 0;
    for (const p of pages) {
      const scene = p.locator('.golf-match-scene');
      const status = await scene.getAttribute('data-golf-match');
      if (status === 'finished' || status === 'cancelled') {
        over++;
        continue;
      }
      if (
        (await scene.getAttribute('data-golf-turn')) === 'me' &&
        (await scene.getAttribute('data-golf-phase')) === 'address'
      ) {
        // A picture mid-hole (the third shot), once.
        if (shot && ++turns === 3) {
          await shot(p);
          shot = undefined;
        }
        await swing(p);
      }
    }
    if (over === pages.length) return;
    await pages[0]!.waitForTimeout(400);
  }
  throw new Error('The match never ended');
}

test('two players golf for a stake: the pot is escrowed and the winner takes it', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(420_000);
  const other = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });
  const friend = await other.newPage();
  const shotPath = (name: string) =>
    SHOTS ? `${SHOTS}/${name}.png` : info.outputPath(`${name}.png`);
  try {
    await founder(page, 'Tiger Ade');
    const friendName = `Amaka ${letters(5)}`;
    await founder(friend, friendName);
    const friendId = (await state(friend)).me.id;
    const host0 = await balance(page);
    const friend0 = await balance(friend);
    const golf = (await state(page)).me.golf as unknown as {
      fee: number;
      match: { stakes: number[] };
    };
    const stake = golf.match.stakes[2]!;
    const fee = golf.fee;

    // The host invites Amaka from the golf club: 1 hole, the middle stake.
    const scene = await openClub(page);
    await scene.locator('[data-action="golf-friend"]').click();
    const sheet = scene.locator('[data-golf-invite]');
    await expect(sheet).toBeVisible();
    const row = sheet.locator(`[data-golf-friend="${friendId}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await sheet.locator(`[data-golf-stake="${stake}"]`).click();
    await sheet.locator('[data-golf-holes="1"]').click();
    await expect(sheet.locator('[data-golf-pot]')).toHaveAttribute(
      'data-golf-pot',
      String(stake * 2),
    );
    await page.screenshot({ path: shotPath('3a-invite-stake') });
    await sheet.locator('[data-action="golf-invite-send"]').click();
    await expect(scene).toHaveAttribute('data-golf-match', 'waiting', { timeout: 10_000 });
    // The stake went into the pot on invite.
    expect(await balance(page)).toBe(host0 - stake);

    // Amaka gets the notice and the invitation card, and accepts.
    const card = friend.locator('[data-golf-invite-card]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Tiger Ade invites you');
    await friend.screenshot({ path: shotPath('3b-friend-invite') });
    await card.locator('[data-action="golf-accept"]').click();
    // To the club (by bike if it's far).
    const chooser = friend.getByRole('dialog', { name: 'How do you want to get there?' });
    const theirs = friend.locator('.golf-match-scene');
    await expect
      .poll(
        async () => {
          if (await chooser.isVisible()) await chooser.locator('[data-mode="cycle"]').click();
          return theirs.isVisible();
        },
        { timeout: 120_000, intervals: [500] },
      )
      .toBe(true)
      .catch(async (e: unknown) => {
        await friend.screenshot({ path: info.outputPath('friend-after-accept.png') });
        throw e;
      });
    await expect(theirs).toHaveAttribute('data-golf-match', 'playing', { timeout: 15_000 });
    await expect(page.locator('.golf-match-scene')).toHaveAttribute('data-golf-match', 'playing', {
      timeout: 15_000,
    });
    expect(await balance(friend)).toBe(friend0 - stake - fee);
    await expect(page.locator('.golf-match-scene [data-golf-pot]').first()).toHaveAttribute(
      'data-golf-pot',
      String(stake * 2),
    );

    await playOut([page, friend], async (p) => {
      await p.screenshot({ path: shotPath('3c-match-hud') });
    });

    // The lower score took the pot: the winner's balance rose by it.
    // (The view lists every room in the city: find this host's.)
    const view = await state(page);
    const room = view.playRooms.find((r) => r.game === 'golf' && r.host === view.me.id)!;
    expect(room.status).toBe('finished');
    const hostEnd = await balance(page);
    const friendEnd = await balance(friend);
    if (room.winners.length === 1) {
      const [win, lose] = room.winners[0] === friendId ? [friend, page] : [page, friend];
      const [w0, l0] = room.winners[0] === friendId ? [friend0, host0] : [host0, friend0];
      expect(await balance(win)).toBe(w0 - stake - fee + 2 * stake);
      expect(await balance(lose)).toBe(l0 - stake - fee);
      await expect(win.locator('[data-golf-result-card]')).toHaveAttribute(
        'data-golf-result-card',
        'won',
        { timeout: 15_000 },
      );
      await win.screenshot({ path: shotPath('3d-result') });
    } else {
      expect(hostEnd).toBe(host0 - fee);
      expect(friendEnd).toBe(friend0 - fee);
      await page.screenshot({ path: shotPath('3d-result') });
    }
    await expect(page.locator('[data-golf-ledger]')).toContainText('Green fee');
  } finally {
    await other.close();
  }
});

test('golf against an AI friend: it accepts, pays in and plays its shots on the server', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await founder(page, 'Solo Golfer');
  const host0 = await balance(page);
  const golf = (await state(page)).me.golf as unknown as {
    fee: number;
    match: { stakes: number[] };
  };
  const stake = golf.match.stakes[1]!;
  const scene = await openClub(page);
  await scene.locator('[data-action="golf-friend"]').click();
  const sheet = scene.locator('[data-golf-invite]');
  // (Side-by-side runs share the world: each takes its own AI friend.)
  const ai = sheet.locator('[data-golf-ai="1"]').nth(info.parallelIndex % 3);
  await expect(ai).toBeVisible();
  await expect(ai).toContainText('handicap');
  await ai.click();
  await sheet.locator(`[data-golf-stake="${stake}"]`).click();
  await sheet.locator('[data-golf-holes="1"]').click();
  await sheet.locator('[data-action="golf-invite-send"]').click();
  const match = page.locator('.golf-match-scene');
  await expect(match).toHaveAttribute('data-golf-match', 'waiting');
  // The AI friend says yes within seconds; both stakes are in the pot.
  await expect(match).toHaveAttribute('data-golf-match', 'playing', { timeout: 30_000 });
  await expect(match.locator('[data-golf-pot]').first()).toHaveAttribute(
    'data-golf-pot',
    String(stake * 2),
  );
  // On your turn the controls keep to the edges: the scorecard is up in the
  // HUD with the pot, the clubs down the left, the swing button bottom-right.
  await expect
    .poll(
      async () =>
        `${await match.getAttribute('data-golf-turn')}:${await match.getAttribute('data-golf-phase')}`,
      { timeout: 60_000 },
    )
    .toBe('me:address');
  await expect(match.locator('.golf-mhud .golf-minicard')).toBeVisible();
  await expect(match.locator('.golf-mid [data-golf-turn-card]')).toContainText('Your shot');
  await expect(match.locator('.golf-clubs .golf-club').first()).toBeVisible();
  await expectGolfControlsClear(page, 'match');
  await playOut([page]);
  const view = await state(page);
  const room = view.playRooms.find((r) => r.game === 'golf' && r.host === view.me.id)!;
  expect(room.status).toBe('finished');
  expect(room.golf!.shots.some((s) => s.auto === 'ai')).toBe(true);
  const won = room.winners.length === 1 && room.winners[0] === room.host;
  const tie = room.winners.length > 1;
  expect(await balance(page)).toBe(host0 - golf.fee - stake + (won ? 2 * stake : tie ? stake : 0));
  await expect(match.locator('[data-golf-result-card]')).toBeVisible();
});
