import type { PlayerView } from '@runway/engine';
import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';
import { businessRoom } from '../src/city/rooms';

/**
 * Pictures of the Lite (2D) scenes' people for review, once their sprites
 * (../src/city/PersonSprite.tsx) are drawn: rooms, acts, the civic doors,
 * a tech event, a competition, the mall, home, a hotel, golf and the map.
 * Only with LITE_SHOTS=<dir>.
 */
const DIR = process.env.LITE_SHOTS;
test.skip(!DIR, 'LITE_SHOTS=<dir> takes the screenshots');
test.describe.configure({ mode: 'parallel' });
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

const state = async (p: Page): Promise<PlayerView> =>
  (await (await p.request.get('/api/state')).json()).view;
const api = (page: Page, command: unknown) =>
  page.evaluate(async (command) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command }),
    });
    return { status: r.status, body: await r.text() };
  }, command);

async function founder(page: Page, market = /Lagos/) {
  // LITE_SPRITES=off: the flat figures only (a baseline to compare with).
  await page.addInitScript((off) => {
    try {
      localStorage.setItem('runway.hq', '1');
      localStorage.setItem('runway.mapQuality', 'lite');
      if (off) localStorage.setItem('runway.sprites', 'off');
    } catch {
      /* storage blocked */
    }
  }, process.env.LITE_SPRITES === 'off');
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Lite Shots',
    handle: `lite_${letters(6)}`,
    company: `Lite ${letters(5)}`,
    idea: 'Payments and bookings for restaurants',
    market,
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

/** Wait for the sprites on screen to be drawn (none left loading), then shoot. */
async function snap(page: Page, name: string, settle = 400) {
  await page.waitForTimeout(settle);
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    const left = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.person-sprite[data-sprite="loading"]').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) n++;
      });
      return n;
    });
    if (!left) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(200);
  const states = await page.evaluate(() => {
    const n: Record<string, number> = {};
    document.querySelectorAll('.person-sprite').forEach((el) => {
      const k = el.getAttribute('data-sprite') ?? '?';
      n[k] = (n[k] ?? 0) + 1;
    });
    return n;
  });
  console.log(`${name}: ${JSON.stringify(states)}`);
  const flat = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('.city-avatar-fig[data-hair]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (getComputedStyle(el).visibility !== 'visible' || b.width < 1) return;
      if (!(b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth)) return;
      const chain: string[] = [];
      for (let e: Element | null = el.parentElement; e && chain.length < 6; e = e.parentElement)
        chain.push(
          `${e.tagName}.${e.getAttribute('class') ?? ''}[${e.getAttribute('data-sprite') ?? ''}${e.getAttribute('data-n') ?? ''}]`,
        );
      out.push(`${Math.round(b.height)}px ${chain.join(' < ')}`);
    });
    return out;
  });
  if (flat.length) console.log(`  flat: ${flat.join('\n  flat: ')}`);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const ROOMS = ['restaurant', 'cafe', 'club', 'bar', 'gym', 'salon', 'office', 'cowork', 'shop'];

test('rooms', async ({ page }) => {
  test.setTimeout(600_000);
  await founder(page);
  const view = await state(page);
  const biz = (
    (
      view.market as unknown as {
        businesses?: { id: string; kind: string; open?: boolean; look?: { shape?: string } }[];
      }
    ).businesses ?? []
  ).filter((b) => b.open !== false);
  const seen = new Set<string>();
  for (const b of biz) {
    const room = businessRoom(b.kind, b.look?.shape);
    if (!ROOMS.includes(room) || seen.has(room)) continue;
    const sel = `[data-place="biz:${b.id}"]`;
    if ((await page.locator(sel).count()) === 0) continue;
    seen.add(room);
    await tapPlace(page, sel, 'cycle');
    const scene = page.locator('.place-scene');
    if (
      !(await scene.waitFor({ timeout: 15_000 }).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await snap(page, `room-${room}`);
    await scene.getByRole('button', { name: 'Close' }).first().click();
    await expect(scene).toBeHidden();
  }
});

test('civic places', async ({ page }) => {
  test.setTimeout(400_000);
  await founder(page);
  for (const role of ['tax-office', 'high-court', 'stock-exchange', 'central-bank', 'tech-hub']) {
    const sel = `[data-place="civic:lagos:${role}"]`;
    if ((await page.locator(sel).count()) === 0) continue;
    await tapPlace(page, sel, 'cycle');
    const open = page.locator('.place-scene, .civic-door').first();
    await open.waitFor({ timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(1200);
    await snap(page, `civic-${role}`, 800);
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(500);
  }
});

test('acts: a meal and a haircut', async ({ page }) => {
  test.setTimeout(400_000);
  await founder(page);
  const view = await state(page);
  const biz =
    (
      view.market as unknown as {
        businesses?: { id: string; kind: string; look?: { shape?: string } }[];
      }
    ).businesses ?? [];
  for (const want of ['restaurant', 'salon', 'gym', 'club']) {
    const b = biz.find((x) => businessRoom(x.kind, x.look?.shape) === want);
    if (!b) continue;
    const sel = `[data-place="biz:${b.id}"]`;
    if ((await page.locator(sel).count()) === 0) continue;
    await page.waitForTimeout(1000);
    await tapPlace(page, sel, 'cycle');
    const scene = page.locator('.place-scene');
    if (
      !(await scene.waitFor({ timeout: 15_000 }).then(
        () => true,
        () => false,
      ))
    )
      continue;
    const buy = scene.locator('.tray-actions [data-action^="buy:"]').first();
    if (await buy.count()) {
      await buy.click();
      await page.waitForTimeout(2500);
      await snap(page, `act-${want}`, 0);
      const skip = scene.getByRole('button', { name: 'Skip' });
      await skip.click({ timeout: 5000 }).catch(() => null);
      const done = scene.getByRole('button', { name: 'Done' });
      await done.click({ timeout: 10_000 }).catch(() => null);
    }
    await scene.getByRole('button', { name: 'Close' }).first().click();
    await expect(scene).toBeHidden();
  }
});

async function openApp(page: Page, app: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  await phone.locator(`[data-app="${app}"]`).click();
  return phone;
}

test('tech event', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page);
  const s0 = await state(page);
  const on = (s0.market.techEvents ?? []).filter(
    (e) => e.status === 'on' && !e.past && !e.attended,
  );
  test.skip(on.length === 0, 'no events');
  const e = on.find((x) => x.venue.placeId === 'hub') ?? on[0]!;
  const phone = await openApp(page, 'events');
  await phone
    .locator(`[data-tech-event="${e.id}"]`)
    .getByRole('button', { name: 'Go to the venue' })
    .click();
  const scene = page.locator(`.tech-scene[data-tech-scene="${e.id}"]`);
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await snap(page, 'tech-intro');
  await scene.locator('[data-attend]').click();
  await expect(scene).toHaveAttribute('data-phase', 'talk', { timeout: 10_000 });
  await snap(page, 'tech-talk', 0);
});

test('competition', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page, /San Francisco/);
  const phone = await openApp(page, 'events');
  await phone.getByRole('radio', { name: /Competitions/ }).click();
  const card = phone.locator('[data-competition][data-status="open"]').first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /^Enter with / }).click();
  await card.getByRole('button', { name: 'Watch it on stage' }).click();
  const scene = page.getByRole('dialog', { name: /Pitch|Cup|Showdown|Battle/ });
  await expect(scene).toHaveAttribute('data-phase', 'live');
  await snap(page, 'competition-live');
});

test('mall', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page);
  await tapPlace(page, '[data-place="mall"]', 'cycle');
  const scene = page.locator('.mall-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await snap(page, 'mall-concourse', 800);
  await scene.locator('[data-shop="fashion"]').click();
  await scene.locator('[data-colour="#f59e0b"]').click();
  await scene.locator('.mall-item-name:not([disabled])').first().click();
  await snap(page, 'mall-try-on', 800);
});

test('home and map', async ({ page }) => {
  test.setTimeout(400_000);
  await founder(page);
  await snap(page, 'city-map', 1500);
  const map = page.getByRole('application', { name: /Map of/ });
  // Zoomed in on the map, the passers-by (plus zooms in).
  await map.focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('+');
    await page.waitForTimeout(250);
  }
  await snap(page, 'city-map-zoomed', 1200);
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const home = page.locator('.home-scene');
  await expect(home).toBeVisible({ timeout: 30_000 });
  await snap(page, 'home', 1500);
});

test('golf', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page);
  await tapPlace(page, '[data-place="golf"]', 'cycle');
  const golf = page.locator('.golf-scene');
  await expect(golf).toBeVisible({ timeout: 30_000 });
  await golf.locator('[data-action="golf-start"]').click();
  await expect(golf).toHaveAttribute('data-golf-phase', 'address', { timeout: 60_000 });
  await snap(page, 'golf-address', 2000);
});

test('hotel', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page);
  expect((await api(page, { type: 'travel.book', to: 'london', hotel: 'business' })).status).toBe(
    200,
  );
  expect((await api(page, { type: 'travel.fly', to: 'london' })).status).toBe(200);
  await page.addInitScript(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('runway.lastSeen')) localStorage.removeItem(k);
    localStorage.setItem('runway.startAtHome', '1');
  });
  await page.reload();
  const flat = page.locator('.place-scene[data-scene="home"]');
  await expect(flat).toBeVisible({ timeout: 30_000 });
  await snap(page, 'hotel', 1000);
});

test('a room on a slow phone (CPU 4× slower)', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const view = await state(page);
  const biz = (
    (view.market as unknown as { businesses?: { id: string; kind: string }[] }).businesses ?? []
  ).find((b) => businessRoom(b.kind) === 'restaurant');
  test.skip(!biz, 'no restaurant');
  await page.evaluate(() => {
    const w = window as unknown as { longTasks: number[] };
    w.longTasks = [];
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => w.longTasks.push(Math.round(e.duration))),
    ).observe({ type: 'longtask' });
  });
  const t0 = Date.now();
  await tapPlace(page, `[data-place="biz:${biz!.id}"]`, 'cycle');
  const scene = page.locator('.place-scene');
  await scene.waitFor({ timeout: 30_000 });
  const opened = Date.now() - t0;
  const before = await page.evaluate(() => {
    const w = window as unknown as { longTasks: number[] };
    const n = w.longTasks.length;
    w.longTasks = [];
    return n;
  });
  // First paint: everyone is there at once (the flat figures, until their pictures come).
  const people = await scene.locator('[data-occupant]').count();
  const flat = await scene.locator('[data-occupant] .person-sprite[data-sprite="loading"]').count();
  await page.screenshot({ path: `${DIR}/slow-room-first.png` });
  const t1 = Date.now();
  await snap(page, 'slow-room-ready', 200);
  const ready = Date.now() - t1;
  // Still answers taps while pictures draw: open and close More.
  const tap0 = Date.now();
  await scene.getByRole('button', { name: 'More' }).click();
  await scene.getByRole('button', { name: /Back to the room/ }).click();
  const tap = Date.now() - tap0;
  const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  console.log(
    `slow: opened ${opened}ms (${before} long tasks on the way), people ${people} (${flat} flat at first), pictures ready +${ready}ms, ` +
      `More round trip ${tap}ms, long tasks ${long.length} [${long.join(' ')}] (max ${Math.max(0, ...long)}ms, ` +
      `>200ms: ${long.filter((x) => x > 200).length})`,
  );
});
