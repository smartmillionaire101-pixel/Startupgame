import type { PlayerView } from '@runway/engine';
import {
  test,
  expect,
  letters,
  playAsGuest,
  setupFounder,
  withoutNetlifyDrawer,
  type Page,
  tapPlace,
  openTogether,
} from './fixtures';
// Software WebGL, so the 3D home (and the sky views) really draw on CI.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;
async function command(p: Page, command: unknown) {
  const response = await p.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function founder(p: Page, name: string) {
  await playAsGuest(p);
  await setupFounder(p, {
    name,
    handle: `social_${letters(8)}`,
    company: `Studio ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /London/,
  });
  await expect(p.locator('.topbar')).toBeVisible({ timeout: 30000 });
}
const together = (p: Page) => openTogether(p);

test('two players discover a home game, play football and share a consenting skyline date', async ({
  page: a,
  browser,
}, info) => {
  // Two players, a game and a date, then the London Eye drawn on software
  // WebGL (see skyviews.spec.ts): two minutes locally, double on CI.
  test.setTimeout(360_000);
  await a.setViewportSize({ width: 1280, height: 900 });
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 1280, height: 900 },
  });
  const b = await context.newPage();
  await withoutNetlifyDrawer(b);
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  b.on('pageerror', (e) => errors.push(e.message));
  try {
    await founder(a, 'Ada Host');
    await founder(b, 'Bola Friend');
    const aId = (await state(a)).me.id,
      bId = (await state(b)).me.id;
    await command(a, { type: 'visit.invite', toPlayerId: bId });
    const invitation = (await state(b)).visits.incoming.find((v) => v.hostId === aId)!;
    await command(b, { type: 'visit.accept', inviteId: invitation.id });
    let home = await together(a);
    await home.getByRole('button', { name: /Play football or host/ }).click();
    const gameA = a.getByRole('dialog', { name: 'Play together' });
    await gameA.getByLabel('Room name').fill('London derby');
    await gameA.getByRole('button', { name: /Create room/ }).click();
    const homeB = await together(b);
    await homeB.getByRole('button', { name: /London derby/ }).click();
    const gameB = b.getByRole('dialog', { name: 'Play together' });
    await gameB.getByRole('button', { name: /^Join/ }).click();
    await expect(gameA.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 10000 });
    await gameA.getByRole('button', { name: 'Start game' }).click();
    // The host takes the first kick: a swipe from the ball up to the top left corner.
    const pitch = gameA.locator('.shootout-pitch canvas');
    await expect(pitch).toHaveAttribute('data-turn', 'shoot', { timeout: 10000 });
    await pitch.scrollIntoViewIfNeeded();
    const box = (await pitch.boundingBox())!;
    const [bx, by] = (await pitch.getAttribute('data-ball'))!.split(',').map(Number);
    const [gl, gt, gr, gb] = (await pitch.getAttribute('data-goal'))!.split(',').map(Number);
    const to = { x: box.x + gl! + (gr! - gl!) * 0.15, y: box.y + gt! + (gb! - gt!) * 0.3 };
    await a.mouse.move(box.x + bx!, box.y + by!);
    await a.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await a.mouse.move(
        box.x + bx! + (to.x - box.x - bx!) * (i / 8),
        box.y + by! + (to.y - box.y - by!) * (i / 8),
      );
      await a.waitForTimeout(30);
    }
    await a.mouse.up();
    await gameB.getByRole('button', { name: 'Dive bottom right', exact: true }).click();
    await expect(gameA.locator('.shootout-banner')).toHaveText(
      /GOAL!|SAVED!|post|crossbar|Wide|Over/,
      { timeout: 10000 },
    );
    await a.screenshot({ path: info.outputPath('football.png') });
    await gameA.getByRole('button', { name: 'Close games' }).click();
    await gameB.getByRole('button', { name: 'Close games' }).click();
    home = await together(a);
    await home.getByLabel('Invite a player').selectOption(bId);
    await home.getByLabel('Where shall we go?').selectOption('london-eye');
    await home.getByRole('button', { name: 'Invite on a date' }).click();
    const dateB = await together(b);
    await dateB.getByRole('button', { name: 'Accept date' }).click();
    await home.getByRole('button', { name: 'Offer your hand' }).click();
    await dateB.getByRole('button', { name: 'Hold hands', exact: true }).click();
    await expect(home.getByLabel('Holding hands')).toBeVisible({ timeout: 10000 });
    await home.getByRole('button', { name: 'Step into the view' }).click();
    const panorama = a.getByRole('dialog', { name: 'City panorama' });
    // London loads on software WebGL here: as long as the sky-view spec allows.
    await expect(panorama.locator('canvas')).toBeVisible({ timeout: 90_000 });
    await panorama.getByRole('button', { name: 'Palace of Westminster' }).click();
    await expect(panorama.getByText(/Houses of Parliament and Elizabeth Tower/)).toBeVisible({
      timeout: 30_000,
    });
    await a.waitForTimeout(1000);
    await a.screenshot({ path: info.outputPath('london-eye.png') });
    await panorama.getByRole('button', { name: 'Look right' }).click();
    await panorama.getByRole('button', { name: 'Let go' }).click();
    await expect(dateB.getByLabel('Holding hands')).toHaveCount(0, { timeout: 30_000 });
    await panorama.getByRole('button', { name: 'End date' }).click();
    await expect(dateB.getByRole('button', { name: 'Invite on a date' })).toBeVisible({
      timeout: 30_000,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('a paid home order arrives and can be unpacked, and paid flight bookings survive reload', async ({
  page,
}, info) => {
  test.slow();
  await founder(page, 'Kemi Home');
  const initial = await state(page);
  const furniture = initial.market.shop.furniture.find((f) => f.slot === 'tv')!;
  await command(page, { type: 'home.order', itemId: furniture.id });
  await page.reload();
  const home = await together(page);
  await expect(home.getByRole('button', { name: 'Unpack delivery' })).toBeDisabled();
  await expect(home.getByRole('button', { name: 'Unpack delivery' })).toBeEnabled({
    timeout: 40000,
  });
  await home.getByRole('button', { name: 'Unpack delivery' }).click();
  await expect(home.getByText('No deliveries on the way.')).toBeVisible();
  expect((await state(page)).me.home.items.some((i) => i.itemId === furniture.id)).toBeTruthy();
  const before = (await state(page)).accounts.local!.balance;
  await command(page, { type: 'travel.book', to: 'lagos' });
  const booked = await state(page);
  expect(booked.accounts.local!.balance).toBeLessThan(before);
  await page.reload();
  expect((await state(page)).me.flightTicket?.to).toBe('lagos');
  await command(page, { type: 'travel.fly', to: 'lagos' });
  expect((await state(page)).accounts.local!.balance).toBe(booked.accounts.local!.balance);
  await page.screenshot({ path: info.outputPath('arrival.png') });
});

test('quiz night on mobile: questions come from the bank, three players are matched and the pot is paid', async ({
  page: host,
  browser,
}, info) => {
  test.slow();
  const contexts = await Promise.all(
    [1, 2].map(() =>
      browser.newContext({
        baseURL: info.project.use.baseURL,
        viewport: { width: 390, height: 844 },
      }),
    ),
  );
  const [alice, bob] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await withoutNetlifyDrawer(alice!);
    await withoutNetlifyDrawer(bob!);
    await founder(host, 'Quizmaster Grace');
    await founder(alice!, 'Alice Player');
    await founder(bob!, 'Bola Player');
    const hostId = (await state(host)).me.id;
    for (const p of [alice!, bob!]) {
      await command(host, { type: 'visit.invite', toPlayerId: (await state(p)).me.id });
      const invite = (await state(p)).visits.incoming.find((v) => v.hostId === hostId)!;
      await command(p, { type: 'visit.accept', inviteId: invite.id });
    }
    const balance = async (p: Page) => (await state(p)).accounts.local!.balance;
    const before = [await balance(host), await balance(alice!), await balance(bob!)];
    const home = await together(host);
    await home.getByRole('button', { name: /Play football or host/ }).click();
    const lobby = host.getByRole('dialog', { name: 'Play together' });
    await lobby.getByRole('button', { name: /Quiz night Think fast/ }).click();
    // No writing questions any more: the bank fills the quiz.
    await expect(lobby.getByText('Write my own questions')).toHaveCount(0);
    await lobby.getByLabel(/Stake per player/).fill('10');
    await lobby.getByRole('button', { name: 'Find an opponent' }).click();
    await expect(lobby.getByText(/Looking for a player in this city/)).toBeVisible();
    // Each player is in the room before we start (on a slow deploy a Join can
    // land late, and two players are already enough to start a game).
    const inRoom = async (id: string) =>
      ((await state(host)).playRooms ?? []).some(
        (r: { game: string; members: { id: string }[] }) =>
          r.game === 'quiz' && r.members.some((m) => m.id === id),
      );
    for (const p of [alice!, bob!]) {
      const id = (await state(p)).me.id;
      const home = await together(p);
      await home.getByRole('button', { name: /Quiz night/ }).click();
      const join = p.getByRole('dialog', { name: 'Play together' }).getByRole('button', {
        name: /^Join/,
      });
      await join.click();
      if (
        !(await expect
          .poll(() => inRoom(id), { timeout: 15000 })
          .toBe(true)
          .then(
            () => true,
            () => false,
          ))
      )
        await join.click({ timeout: 5000 }).catch(() => {});
      await expect.poll(() => inRoom(id), { timeout: 20000 }).toBe(true);
    }
    await expect(lobby.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 10000 });
    await lobby.getByRole('button', { name: 'Start game' }).click();
    const players = [host, alice!, bob!];
    // Answer each question as it comes. On a slow deploy a question can time out before
    // everyone answers; then the game moves on, and so do we (never wait for a past one).
    const questionOn = async (p: Page) => {
      const text = await p
        .getByRole('dialog', { name: 'Play together' })
        .getByText(/^QUESTION \d+ OF 10$/)
        .textContent({ timeout: 1000 })
        .catch(() => null);
      return Number(/QUESTION (\d+)/.exec(text ?? '')?.[1] ?? 0);
    };
    const over = alice!.getByRole('heading', { name: /wins!|tie/ });
    for (let n = 1; n <= 10; n++) {
      for (const [i, p] of players.entries()) {
        await expect
          .poll(async () => (await over.isVisible()) || (await questionOn(p)) >= n, {
            timeout: 30000,
          })
          .toBe(true);
        if ((await questionOn(p)) !== n) continue;
        await p
          .locator('.experience-answers button')
          .nth(i)
          .click({ timeout: 5000 })
          .catch(() => {});
      }
    }
    await expect(alice!.getByRole('heading', { name: /wins!|tie/ })).toBeVisible({
      timeout: 15000,
    });
    const after = [await balance(host), await balance(alice!), await balance(bob!)];
    // Money is conserved: the pot went to one winner, or back to everyone.
    expect(after.reduce((x, y) => x + y, 0)).toBe(before.reduce((x, y) => x + y, 0));
    const won = after.map((v, i) => v - before[i]!);
    expect([
      [-1000, -1000, 2000],
      [0, 0, 0],
    ]).toContainEqual([...won].sort((x, y) => x - y));
    await alice!.screenshot({ path: info.outputPath('quiz-winner-mobile.png') });
  } finally {
    for (const c of contexts) await c.close();
  }
});

test.describe('the 3D home', () => {
  test('the 3D home shows a car collection and a van at the door', async ({ page }, info) => {
    test.slow();
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
    await founder(page, 'Tomi Moving');
    const initial = await state(page);
    for (const car of initial.market.shop.cars.slice(0, 2))
      await command(page, { type: 'car.buy', modelId: car.id, keepCurrent: true });
    expect((await state(page)).me.garage).toHaveLength(2);
    const furniture = initial.market.shop.furniture.find((f) => f.slot === 'tv')!;
    await command(page, { type: 'home.order', itemId: furniture.id });
    await page.reload();
    await tapPlace(page, '[data-place="home"]', 'cycle');
    const home = page.locator('.home-scene');
    await expect(home).toHaveClass(/is-3d/, { timeout: 45_000 });
    const canvas = home.locator('canvas[data-home-3d]');
    await expect(canvas).toBeVisible();
    // Both cars parked in bays of their own, and the van coming down the street.
    await expect(canvas).toHaveAttribute('data-cars', '2', { timeout: 15_000 });
    await expect(canvas).toHaveAttribute('data-van', /coming|here/, { timeout: 15_000 });
    // It arrives 30 seconds after the order.
    await expect(canvas).toHaveAttribute('data-van', 'here', { timeout: 45_000 });
    await home.screenshot({ path: info.outputPath('home-van-garage.png') });
    await home.getByRole('button', { name: /Home & friends/ }).click();
    const living = page.getByRole('dialog', { name: 'Home and social experiences' });
    const unpack = living.getByRole('button', { name: 'Unpack delivery' });
    await expect(unpack).toBeEnabled({ timeout: 15_000 });
    await unpack.click();
    await expect
      .poll(async () => (await state(page)).living.deliveries.filter((d) => !d.complete).length, {
        timeout: 15_000,
      })
      .toBe(0);
  });
});
