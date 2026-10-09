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
} from './fixtures';
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
  await expect(p.getByRole('button', { name: /^Together/ })).toBeVisible({ timeout: 30000 });
}
const together = async (p: Page) => {
  await p.getByRole('button', { name: /^Together/ }).click();
  return p.getByRole('dialog', { name: 'Home and social experiences' });
};

test('two players discover a home game, play football and share a consenting skyline date', async ({
  page: a,
  browser,
}, info) => {
  test.slow();
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
    await gameA.getByRole('button', { name: 'Top left', exact: true }).click();
    await gameB.getByRole('button', { name: 'Bottom right', exact: true }).click();
    await expect(gameA.getByText('GOAL!', { exact: true })).toBeVisible({ timeout: 10000 });
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
    await expect(panorama.locator('canvas')).toBeVisible({ timeout: 20000 });
    await panorama.getByRole('button', { name: 'Palace of Westminster' }).click();
    await expect(panorama.getByText(/Houses of Parliament and Elizabeth Tower/)).toBeVisible();
    await a.waitForTimeout(1000);
    await a.screenshot({ path: info.outputPath('london-eye.png') });
    await panorama.getByRole('button', { name: 'Look right' }).click();
    await panorama.getByRole('button', { name: 'Let go' }).click();
    await expect(dateB.getByLabel('Holding hands')).toHaveCount(0, { timeout: 10000 });
    await panorama.getByRole('button', { name: 'End date' }).click();
    await expect(dateB.getByRole('button', { name: 'Invite on a date' })).toBeVisible({
      timeout: 10000,
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

test('a player writes a quiz on mobile, hosts two opponents and the winner receives the pot', async ({
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
    const beforeA = (await state(alice!)).accounts.local!.balance;
    const home = await together(host);
    await home.getByRole('button', { name: /Play football or host/ }).click();
    const lobby = host.getByRole('dialog', { name: 'Play together' });
    await lobby.getByRole('button', { name: /Quiz night Think fast/ }).click();
    await lobby.getByLabel('Room name').fill('Custom quiz evening');
    await lobby.getByLabel(/Stake per player/).fill('10');
    await lobby.getByLabel('Write my own questions').check();
    for (let n = 1; n <= 3; n++) {
      await lobby.getByLabel(`Question ${n}`, { exact: true }).fill(`What is ${n} plus one?`);
      for (let k = 1; k <= 4; k++)
        await lobby
          .getByLabel(`Question ${n} option ${k}`, { exact: true })
          .fill(k === 1 ? String(n + 1) : String(k + 6));
    }
    await lobby.getByRole('button', { name: 'Create room' }).click();
    for (const p of [alice!, bob!]) {
      const home = await together(p);
      await home.getByRole('button', { name: /Custom quiz evening/ }).click();
      await p
        .getByRole('dialog', { name: 'Play together' })
        .getByRole('button', { name: /^Join/ })
        .click();
    }
    await expect(lobby.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 10000 });
    await lobby.getByRole('button', { name: 'Start game' }).click();
    for (let n = 1; n <= 3; n++) {
      await expect(alice!.getByRole('heading', { name: `What is ${n} plus one?` })).toBeVisible({
        timeout: 10000,
      });
      await alice!.locator('.experience-answers button').nth(0).click();
      await bob!.locator('.experience-answers button').nth(1).click();
    }
    await expect(alice!.getByRole('heading', { name: 'Alice Player wins!' })).toBeVisible({
      timeout: 10000,
    });
    expect((await state(alice!)).accounts.local!.balance).toBe(beforeA + 1000);
    await alice!.screenshot({ path: info.outputPath('quiz-winner-mobile.png') });
  } finally {
    for (const c of contexts) await c.close();
  }
});

test('the 3D home shows a car collection and a van at the door', async ({ page }, info) => {
  test.slow();
  await page.setViewportSize({ width: 1000, height: 900 });
  await founder(page, 'Tomi Moving');
  const initial = await state(page);
  for (const car of initial.market.shop.cars.slice(0, 2))
    await command(page, { type: 'car.buy', modelId: car.id, keepCurrent: true });
  const furniture = initial.market.shop.furniture.find((f) => f.slot === 'tv')!;
  await command(page, { type: 'home.order', itemId: furniture.id });
  await page.reload();
  await tapPlace(page, '[data-place="home"]', 'cycle');
  await page.evaluate(() => {
    localStorage.setItem('runway.mapQuality', '3d');
    window.dispatchEvent(new StorageEvent('storage', { key: 'runway.mapQuality', newValue: '3d' }));
  });
  const home = page.locator('.home-scene');
  await expect(home).toHaveClass(/is-3d/, { timeout: 30000 });
  await expect(home.locator('canvas')).toBeVisible();
  const arrival = (await state(page)).living.deliveries.find((d) => !d.complete)!.arrivesAt;
  await page.waitForTimeout(Math.max(1000, arrival - Date.now() + 1000));
  await home.screenshot({ path: info.outputPath('home-van-garage.png') });
  expect((await state(page)).me.garage).toHaveLength(2);
  await home.getByRole('button', { name: /Home & friends/ }).click();
  const living = page.getByRole('dialog', { name: 'Home and social experiences' });
  await expect(living.getByRole('button', { name: 'Unpack delivery' })).toBeEnabled();
  await living.getByRole('button', { name: 'Unpack delivery' }).click();
});
