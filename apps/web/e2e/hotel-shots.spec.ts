import { expect, letters, playAsGuest, setupFounder, test, type Page, hudMore } from './fixtures';

/**
 * Screenshots of the three hotel rooms (budget, business, the suite) from the
 * front, the side, the back and turning round, close-ups of the suite's
 * rooms, in the light and dark themes. Only with HOTEL_SHOTS=<dir>.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const DIR = process.env.HOTEL_SHOTS;
test.skip(!DIR, 'HOTEL_SHOTS=<dir> takes the screenshots');

async function open(page: Page, tier: string) {
  await page.getByRole('button', { name: 'Today' }).click();
  const tools = page.locator('[data-home-preview]');
  await tools.scrollIntoViewIfNeeded();
  await tools.locator(`[data-preview-hotel="${tier}"]`).click();
  const room = page.locator('.home-scene[data-hotel-room]');
  await expect(room).toHaveAttribute('data-hotel-room', tier);
  await expect(room).toHaveClass(/is-3d/, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  return room;
}

/** A close-up round one of the room's things (its 2D hit target sits on the 3D floor). */
async function closeUp(page: Page, name: string, ids: string[], pad = 70) {
  const boxes = [];
  for (const id of ids) {
    const b = await page.locator(`[data-obj="${id}"]`).first().boundingBox();
    if (b) boxes.push(b);
  }
  if (!boxes.length) return;
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad * 1.6);
  const x1 = Math.min(390, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const y1 = Math.min(844, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  await page.screenshot({
    path: `${DIR}/${name}.png`,
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  });
}

for (const scheme of ['light', 'dark'] as const)
  test(`hotel rooms (${scheme})`, async ({ page }) => {
    test.setTimeout(1_200_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
    await page.clock.setFixedTime(
      new Date(scheme === 'dark' ? '2026-06-14T20:30:00Z' : '2026-06-14T11:30:00Z'),
    );
    await playAsGuest(page);
    await setupFounder(page, {
      name: 'Hana Hotels',
      handle: `hs_${letters(8)}`,
      company: `Stays ${letters(8)}`,
      idea: 'Tools for local businesses',
      market: /Lagos/,
    });
    const only = process.env.HOTEL_TIERS?.split(',');
    for (const tier of only ?? ['budget', 'business', 'luxury']) {
      const room = await open(page, tier);
      const shot = (n: string) => page.screenshot({ path: `${DIR}/${tier}-${n}-${scheme}.png` });
      await shot('front');
      // The camera's buttons are behind the rail's ⋯ (picking one closes it).
      const cam = async (name: string) => {
        await hudMore(room);
        await room.getByRole('button', { name, exact: true }).click();
      };
      if (tier === 'luxury') {
        await cam('Zoom in');
        await page.waitForTimeout(900);
        await shot('zoomed');
        await closeUp(page, `suite-living-${scheme}`, ['sofa', 'tv', 'dining']);
        await closeUp(page, `suite-bedroom-${scheme}`, ['bed', 'wardrobe']);
        await closeUp(page, `suite-bathroom-${scheme}`, ['bathtub', 'shower', 'toilet']);
        await cam('Zoom out');
        await page.waitForTimeout(600);
      }
      await cam('Turn');
      await page.waitForTimeout(900);
      await shot('side');
      await cam('Turn');
      await page.waitForTimeout(900);
      await shot('back');
      await cam('Turn');
      await page.waitForTimeout(900);
      await shot('side2');
      await cam('Turn');
      await page.waitForTimeout(900);
      // Zoomed out: the corridor and the neighbours' rooms.
      await cam('Zoom out');
      await cam('Zoom out');
      await page.waitForTimeout(900);
      await shot('corridor');
      await room.locator('[data-action="look-around"]').click();
      await page.waitForTimeout(3400);
      await shot('look');
      await room.getByRole('button', { name: 'Go out', exact: true }).click();
      await expect(room).toBeHidden();
    }
  });

/** A new player through the API (as e2e/holiday.spec.ts does). */
async function player(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const h = `hf_${letters(8)}`;
  const r = await api(page, {
    type: 'player.create',
    handle: h,
    name,
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'lagos',
    gender: 'female',
    company: {
      name: `Trip ${h.slice(3)}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  });
  expect(r.status).toBe(200);
}
const api = (page: Page, command: unknown) =>
  page.evaluate(async (command) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command }),
    });
    return { status: r.status, body: await r.json() };
  }, command);
const me = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as { me: { id: string }; holidays?: { id: string }[] };
  });

test('a friend next door on holiday: their door, knock, they come over', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(600_000);
  const b = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  const tag = letters(4);
  await player(a, `Ada${tag} Host`);
  await player(b, `Bola${tag} Guest`);
  const bId = (await me(b)).me.id;
  const aId = (await me(a)).me.id;
  expect((await api(a, { type: 'travel.book', to: 'london', hotel: 'luxury' })).status).toBe(200);
  expect((await api(a, { type: 'holiday.invite', inviteeIds: [bId], hostPays: true })).status).toBe(
    200,
  );
  const hid = (await me(b)).holidays![0]!.id;
  expect((await api(b, { type: 'holiday.accept', holidayId: hid })).status).toBe(200);
  expect((await api(a, { type: 'travel.fly', to: 'london' })).status).toBe(200);
  expect((await api(b, { type: 'travel.fly', to: 'london' })).status).toBe(200);
  for (const scheme of ['light', 'dark'] as const) {
    await a.clock.setFixedTime(
      new Date(scheme === 'dark' ? '2026-06-14T20:30:00Z' : '2026-06-14T11:30:00Z'),
    );
    await a.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await a.addInitScript(() => {
      for (const k of Object.keys(localStorage))
        if (k.startsWith('runway.lastSeen')) localStorage.removeItem(k);
      localStorage.setItem('runway.startAtHome', '1');
      localStorage.setItem('runway.mapQuality', '3d');
    });
    await a.reload();
    const room = a.locator('.home-scene[data-hotel-room]');
    await expect(room).toHaveClass(/is-3d/, { timeout: 90_000 });
    await a.waitForTimeout(1500);
    const knock = room.locator('[data-hotel-knock]');
    await expect(knock).toBeVisible();
    await a.screenshot({ path: `${DIR}/friend-door-${scheme}.png` });
    for (const dir of ['left', 'right'] as const) {
      await room.getByRole('button', { name: `Turn ${dir}` }).click();
      await a.waitForTimeout(900);
      await a.screenshot({ path: `${DIR}/friend-corridor-${dir}-${scheme}.png` });
      await room.getByRole('button', { name: `Turn ${dir === 'left' ? 'right' : 'left'}` }).click();
      await a.waitForTimeout(900);
    }
    await knock.click();
    // Bola opens the door (hotel.answer), and comes over.
    await expect
      .poll(
        async () =>
          ((await me(b)).holidays?.[0] as { knocks?: unknown[] } | undefined)?.knocks?.length,
      )
      .toBe(1);
    expect(
      (await api(b, { type: 'hotel.answer', holidayId: hid, from: aId, accept: true })).status,
    ).toBe(200);
    await a.waitForTimeout(4000);
    await expect(room.locator('[data-guest]')).toHaveCount(1);
    await a.screenshot({ path: `${DIR}/friend-visit-${scheme}.png` });
    await hudMore(room);
    await room.locator('[data-action="more"]').click();
    await a.screenshot({ path: `${DIR}/friend-more-${scheme}.png` });
    await room.locator('[data-hotel-more] [data-action="hotel-goodbye"]').click();
    await expect(room.locator('[data-guest]')).toHaveCount(0);
  }
});

test('Lite: the flat hotel room by tier', async ({ page }) => {
  test.setTimeout(300_000);
  for (const tier of ['budget', 'business', 'luxury']) {
    await page.context().clearCookies();
    await player(page, `Lia${letters(4)} Lite`);
    expect((await api(page, { type: 'travel.book', to: 'london', hotel: tier })).status).toBe(200);
    expect((await api(page, { type: 'travel.fly', to: 'london' })).status).toBe(200);
    await page.addInitScript(() => {
      for (const k of Object.keys(localStorage))
        if (k.startsWith('runway.lastSeen')) localStorage.removeItem(k);
      localStorage.setItem('runway.startAtHome', '1');
      localStorage.setItem('runway.mapQuality', 'lite');
    });
    await page.reload();
    const flat = page.locator('.place-scene[data-scene="home"]');
    await expect(flat).toBeVisible({ timeout: 30_000 });
    await expect(flat.locator(`[data-hotel-art="${tier}"]`)).toBeAttached();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/lite-${tier}.png` });
  }
});
