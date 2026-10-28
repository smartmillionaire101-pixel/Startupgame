import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, tapPlace, test, type Page } from './fixtures';

/**
 * Buy mode at home as a picture catalogue (the feedback round): the home
 * stays in view above a dark panel; cards with the thing's picture,
 * footprint, stars, price and what it does for you; Owned and Design tabs
 * (floors and paint, try one on and keep it); and Pick several, a basket
 * and Buy all (one order each, through the ledger).
 *
 * BUY_SHOTS=<dir> saves phone-size screenshots of each step.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const SHOTS = process.env.BUY_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;

async function founder(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `buy_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Bola Buyer',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Nest ${h.slice(4)}`,
            industry: 'fintech',
            revenueModel: 'subscription',
            idea: 'Payments for market traders',
            incorporation: 'local',
          },
        },
      }),
    });
    return r.status;
  }, handle);
  expect(status).toBe(200);
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

test('Buy mode: picture cards, Owned, Design swatches, and a basket bought at once', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await founder(page);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await scene.getByRole('button', { name: 'Buy' }).click();
  const sheet = page.getByRole('dialog', { name: 'Buy mode' });
  await expect(sheet).toBeVisible();

  // Picture cards: the living room's things, each with its rendered picture.
  const cards = sheet.locator('[data-buy-item]');
  await expect(cards.first()).toBeVisible();
  const sofa = sheet.locator('[data-buy-item="sofa-2"]');
  await expect(sofa.locator('img')).toHaveAttribute('src', /\/thumbs\/furniture\/sofa-2\.webp$/);
  await expect
    .poll(() => sofa.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  // Round 7: no footprint badge on the cards (it read like a quantity).
  await expect(sheet.locator('.buy-foot')).toHaveCount(0);
  await expect(sofa.locator('.buy-stars')).toHaveText('★★');
  await expect(sofa.locator('.buy-boost')).toContainText('+Social +2');
  // New: the next step up in each slot (the basic one where you have none).
  await expect(sheet.locator('[data-buy-item="sofa-1"]')).toHaveAttribute('data-new', '1');
  await shot(page, '1-catalogue');

  // Owned: only what you have (a new flat may have nothing yet).
  await sheet.locator('[data-buy-tab="owned"]').click();
  const ownedCards = await sheet.locator('[data-buy-item]').count();
  if (ownedCards === 0) await expect(sheet.locator('.buy-empty')).toBeVisible();
  else await expect(sheet.locator('[data-buy-item][data-owned="0"]')).toHaveCount(0);

  // Design: floors and paint as swatches; a free paint goes on at a tap (play-test #18).
  await sheet.locator('[data-buy-tab="design"]').click();
  await expect(sheet.locator('[data-finish^="floor:"]').first()).toBeVisible();
  expect(await sheet.locator('[data-finish^="floor:"]').count()).toBeGreaterThanOrEqual(10);
  await expect(sheet.locator('[data-swatches="floor"] [data-state="now"]')).toHaveCount(1);
  await expect(sheet.locator('[data-finish="floor:marble"]')).toHaveAttribute(
    'data-state',
    'price',
  );
  await expect(sheet.locator('[data-finish="wall:sage"]')).toHaveAttribute('data-state', 'yours');
  await shot(page, '2-design');
  await sheet.locator('[data-finish="wall:sage"]').click();
  await expect(sheet.locator('[data-trying]')).toHaveCount(0);
  await expect.poll(async () => (await state(page)).me.homeStyle?.chosen.wall).toBe('sage');
  await expect(sheet.locator('[data-finish="wall:sage"]')).toHaveAttribute('data-state', 'now');
  // The Lite home's walls take the paint too.
  await expect(page.locator('.home-scene rect[data-wall-paint="#9fb59a"]')).toBeAttached();

  // Pick several: the basket fills, its total adds up, and Buy all orders each.
  await sheet.locator('[data-buy-tab="all"]').click();
  await sheet.locator('[data-action="pick-several"]').click();
  const basket = sheet.locator('.buy-basket');
  await expect(basket).toContainText('Basket empty');
  await expect(basket.locator('[data-action="buy-all"]')).toBeDisabled();
  await shot(page, '3-basket-empty');
  const view = await state(page);
  const prices = view.me.shop!.prices;
  await sheet.locator('[data-buy-item="plants-1"]').click();
  await sheet.locator('[data-buy-item="art-1"]').click();
  // One per slot: picking another tier of plants swaps it.
  await sheet.locator('[data-buy-item="plants-2"]').click();
  await sheet.locator('[data-buy-item="plants-1"]').click();
  await expect(sheet.locator('[data-buy-item="plants-2"]')).toHaveAttribute('data-picked', '0');
  await expect(basket).toHaveAttribute('data-basket', '2');
  await expect(basket).toHaveAttribute(
    'data-total',
    String(prices['plants-1']! + prices['art-1']!),
  );
  await expect(basket).toContainText('2 in basket');
  await shot(page, '4-basket');
  const before = view.accounts.local!.balance;
  await basket.locator('[data-action="buy-all"]').click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
  const after = await state(page);
  const mine = after.living.deliveries.filter((d) => d.owner === after.me.id && !d.complete);
  expect(mine.map((d) => d.item?.slot).sort()).toEqual(['art', 'plants']);
  expect(after.accounts.local!.balance).toBe(before - prices['plants-1']! - prices['art-1']!);
  // Then each is placed in turn, as ticked: the art (on a wall, player feedback), the plants.
  const bar = scene.getByRole('toolbar', { name: /Place/ });
  await expect(bar).toHaveAttribute('data-on-wall', '1');
  await shot(page, '5-placing');
  // Still on their way (play-test #40): the spot is kept for when they're unpacked.
  await expect(bar).toContainText('it goes here when you unpack the delivery');
  await scene.getByRole('button', { name: 'Keep this spot' }).click();
  await expect(bar).toHaveAttribute('aria-label', 'Place Plants');
  await expect(bar).not.toHaveAttribute('data-on-wall', '1');
  await scene.getByRole('button', { name: 'Keep this spot' }).click();
  await expect(bar).toBeHidden();
});

async function command(p: Page, command: unknown) {
  const r = await p.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { result: Record<string, unknown> };
}

/** Walk home on the (Lite) map, then draw the home in 3D (the way the settings do). */
async function home3d(page: Page) {
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    localStorage.setItem('runway.mapQuality', '3d');
    window.dispatchEvent(new StorageEvent('storage', { key: 'runway.mapQuality', newValue: '3d' }));
  });
  await expect(scene).toHaveClass(/is-3d/, { timeout: 90_000 });
  return scene;
}

test('player feedback: two speakers, a painting moved along a wall, every wall painted, Close', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await founder(page);
  // A speaker and a painting, delivered and unpacked.
  let last = 0;
  const ids: string[] = [];
  for (const itemId of ['sound-1', 'art-1']) {
    const r = await command(page, { type: 'home.order', itemId, delivery: 'express' });
    ids.push(r.result.id as string);
    last = Math.max(last, r.result.arrivesAt as number);
  }
  await page.waitForTimeout(Math.max(0, last - Date.now() + 1500));
  for (const id of ids) await command(page, { type: 'living.collect', deliveryId: id });
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  const scene = await home3d(page);
  const canvas = scene.locator('canvas[data-home-3d]');
  const sheet = page.getByRole('dialog', { name: 'Buy mode' });
  const bar = scene.getByRole('toolbar', { name: /Place/ });
  const me = (await state(page)).me;
  const placedAt = (k: string) =>
    page.evaluate(
      ([id, k]) => JSON.parse(localStorage.getItem(`runway.place.${id}.${k}`) ?? 'null'),
      [me.id, k] as const,
    );

  // "I can't buy one item multiple times": a second and a third speaker, each placed.
  const before = (await state(page)).accounts.local!.balance;
  const price = (await state(page)).me.shop!.prices['sound-1']!;
  for (let n = 1; n <= 2; n++) {
    await scene.getByRole('button', { name: 'Buy' }).click();
    await expect(sheet).toBeVisible();
    const more = sheet.locator('[data-buy-another="sound-1"]');
    await expect(more).toBeVisible();
    await more.click();
    await more.click();
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await expect(bar).toBeVisible();
    await expect(scene).toHaveAttribute('data-placing', /^sound#/);
    if (n === 2) await shot(page, '6-second-speaker');
    await bar.getByRole('button', { name: 'Put it here' }).click();
    await expect(bar).toBeHidden();
    await expect(scene).toHaveAttribute('data-extras', String(n));
  }
  const s1 = await state(page);
  const extras = s1.me.homeStyle!.extras;
  expect(extras.map((x) => x.itemId)).toEqual(['sound-1', 'sound-1']);
  expect(s1.accounts.local!.balance).toBe(before - 2 * price);
  // Each has its own spot, apart from the other and the first speaker.
  const spots = await Promise.all(extras.map((x) => placedAt(`sound#${x.id}`)));
  expect(spots.every(Boolean)).toBe(true);
  expect(spots[0]).not.toEqual(spots[1]);
  await scene.getByRole('button', { name: 'Buy' }).click();
  await expect(sheet.locator('[data-buy-item="sound-1"] [data-have]')).toHaveAttribute(
    'data-have',
    '3',
  );

  // "It just put it in my room": the painting moves along its wall, and up.
  await sheet.locator('[data-buy-item="art-1"]').click();
  await expect(sheet).toBeHidden();
  await expect(bar).toHaveAttribute('data-on-wall', '1');
  const from = await bar.getAttribute('data-at');
  // Along the wall (round the corner onto the next one where it ends), then up a step.
  await bar.getByRole('button', { name: 'Left' }).click();
  await expect(bar).not.toHaveAttribute('data-at', from!);
  await bar.getByRole('button', { name: 'Higher' }).click();
  await expect(bar).toHaveAttribute('data-ok', '1');
  const to = (await bar.getAttribute('data-at'))!;
  await shot(page, '7-painting-moved');
  // On a wall the button says what the hint says (play-test #40).
  await bar.getByRole('button', { name: 'Hang it here' }).click();
  await expect(bar).toBeHidden();
  const [x, y, rot] = to.split(',').map(Number);
  expect(await placedAt('art')).toEqual({ x, y, rot, lift: 1 });

  // Playtest #40: never over a window. Moved along a wall onto one, it lands beside it.
  const windows = ((await canvas.getAttribute('data-windows')) ?? '')
    .split(' ')
    .filter(Boolean)
    .map((s) => {
      const [wall, c, w] = s.split(':');
      return { wall: wall!, c: Number(c), w: Number(w) };
    });
  expect(windows.length).toBeGreaterThan(0);
  const grid = { w: Number((await canvas.getAttribute('data-grid'))!.split('x')[0]) };
  /** The outer wall a picture at "x,y,rot" hangs on, and its middle along it. */
  const onWall = (at: string) => {
    const [px, py, pr] = at.split(',').map(Number) as [number, number, number];
    if (pr === 0 && py === 0) return { wall: 'back', at: px + 0.5 };
    if (pr === 1 && px === 0) return { wall: 'left', at: py + 0.5 };
    if (pr === 3 && px === grid.w - 1) return { wall: 'right', at: py + 0.5 };
    return null;
  };
  // Half the widest painting and its frame, the window's frame, a gap (../src/home/windows).
  const over = (at: string) => {
    const o = onWall(at);
    return !!o && windows.some((w) => w.wall === o.wall && Math.abs(o.at - w.c) < w.w / 2 + 0.66);
  };
  await scene.getByRole('button', { name: 'Buy' }).click();
  await sheet.locator('[data-buy-item="art-1"]').click();
  await expect(sheet).toBeHidden();
  await expect(bar).toHaveAttribute('data-on-wall', '1');
  // Onto the back wall first (up, from the left wall's corner), then along it.
  const press = async (dir: 'Left' | 'Right' | 'Up') => {
    const was = (await bar.getAttribute('data-at'))!;
    await bar.getByRole('button', { name: dir }).click();
    await expect.poll(() => bar.getAttribute('data-at')).not.toBe(was);
    const now = (await bar.getAttribute('data-at'))!;
    expect(over(now), `${was} → ${now}`).toBe(false);
    return { was, now };
  };
  if (onWall((await bar.getAttribute('data-at'))!)?.wall !== 'back') {
    const { now } = await press('Up');
    expect(onWall(now)?.wall, now).toBe('back');
  }
  let skipped = false;
  for (let i = 0; i < 14 && !skipped; i++) {
    const { was, now } = await press('Right');
    const a = onWall(was)!;
    const b = onWall(now);
    expect(b?.wall, `${was} → ${now}`).toBe('back');
    // More than a tile: it went past a window, to just beside it.
    if (b && Math.abs(b.at - a.at) > 1) {
      const passed = windows.filter((w) => w.wall === 'back' && w.c > a.at && w.c < b.at);
      expect(passed.length, `${was} → ${now}`).toBeGreaterThan(0);
      // The tile before where it landed is over the window: it's right beside it.
      const [nx, ny, nr] = now.split(',').map(Number) as [number, number, number];
      expect(over(`${nx - 1},${ny},${nr}`), now).toBe(true);
      await expect(bar).toHaveAttribute('data-ok', '1');
      skipped = true;
      await shot(page, '7b-painting-beside-window');
    }
  }
  expect(skipped, 'moved along a wall onto a window').toBe(true);
  await bar.getByRole('button', { name: 'Hang it here' }).click();
  await expect(bar).toBeHidden();
  const hung = await placedAt('art');
  expect(over(`${hung.x},${hung.y},${hung.rot}`)).toBe(false);

  // "Not all of the walls change": trying a paint on paints every wall.
  await scene.getByRole('button', { name: 'Buy' }).click();
  await sheet.locator('[data-buy-tab="design"]').click();
  const was = ((await canvas.getAttribute('data-wall-paint')) ?? '').split(',');
  expect(was.length).toBeGreaterThan(0);
  // A paint you'd buy is tried on, the panel stepping down so the walls show.
  const tall = await sheet.evaluate((el) => el.getBoundingClientRect().height);
  await sheet.locator('[data-finish="wall:navy"]').click();
  await expect
    .poll(async () => (await canvas.getAttribute('data-wall-paint'))?.split(','))
    .toContain('#2f4163');
  const now = (await canvas.getAttribute('data-wall-paint'))!.split(',');
  // The outer walls in the paint, the inner ones a shade lighter: nothing as it was.
  expect(now.length).toBeLessThanOrEqual(2);
  for (const c of was) expect(now).not.toContain(c);
  await expect(sheet.locator('[data-trying="wall:navy"]')).toBeVisible();
  // Round 7: the panel steps down to its low height (from half).
  await expect(sheet).toHaveAttribute('data-height', 'low');
  expect(await sheet.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(tall * 0.9);
  await shot(page, '8-walls-navy');

  // "It refuses to close": a Close you can see, and Escape.
  const close = sheet.locator('[data-action="close-buy"]');
  await expect(close).toBeVisible();
  await expect(close).toHaveText(/Close/);
  await close.click();
  await expect(sheet).toBeHidden();
  // Closing puts the walls back as they are (the paint was only tried on).
  await expect
    .poll(async () => (await canvas.getAttribute('data-wall-paint'))?.split(','))
    .toEqual(was);
  // A paint that's yours (Sage green is free) goes on at once and stays (play-test #18).
  await scene.getByRole('button', { name: 'Buy' }).click();
  await sheet.locator('[data-buy-tab="design"]').click();
  await sheet.locator('[data-finish="wall:sage"]').click();
  await expect(sheet.locator('[data-finish="wall:sage"]')).toHaveAttribute('data-state', 'now');
  await expect.poll(async () => (await state(page)).me.homeStyle!.chosen.wall).toBe('sage');
  await close.click();
  await expect(sheet).toBeHidden();
  await expect
    .poll(async () => (await canvas.getAttribute('data-wall-paint'))?.split(','))
    .toContain('#9fb59a');
  await scene.getByRole('button', { name: 'Buy' }).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(scene).toBeVisible();
});
