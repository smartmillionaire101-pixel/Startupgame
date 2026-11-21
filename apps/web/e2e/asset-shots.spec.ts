import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  tab,
  tapPlace,
  test,
  type Page,
} from './fixtures';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

/**
 * The CC0 model swap (Quaternius people and cars, public/models/): the same
 * views before and after, at phone and laptop size. ASSET_SHOTS=<dir> runs it
 * and saves `<ASSET_TAG>-<view>-<size>.png` there (ASSET_TAG: before|after),
 * with the draw calls and triangles of each 3D view in `<ASSET_TAG>-stats.json`.
 * Without ASSET_SHOTS it is skipped (slow on software WebGL).
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const DIR = process.env.ASSET_SHOTS;
const TAG = process.env.ASSET_TAG ?? 'after';
test.skip(!DIR, 'ASSET_SHOTS=<dir> takes the model screenshots');

const SIZES = [
  ['phone', 390, 844],
  ['laptop', 1280, 800],
] as const;

type Stats = { draws: number; tris: number };
function record(view: string, s: Stats | null) {
  if (!DIR || !s) return;
  mkdirSync(DIR, { recursive: true });
  const f = `${DIR}/${TAG}-stats.json`;
  const all = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, Stats>) : {};
  all[view] = s;
  writeFileSync(f, JSON.stringify(all, null, 2));
}

const stageStats = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __stage3d?: { stats: Stats } }).__stage3d;
    return s ? { ...s.stats } : null;
  });
const cityStats = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __city3d?: { stats: Stats } }).__city3d;
    return s ? { draws: s.stats.draws, tris: s.stats.tris } : null;
  });

/** Both sizes of one view (each drawn a moment at its size first). */
async function shots(page: Page, view: string, settle = 2500, before?: () => Promise<void>) {
  mkdirSync(DIR!, { recursive: true });
  for (const [size, w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    if (before) await before();
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${DIR}/${TAG}-${view}-${size}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function founder(page: Page, name: string, quality: '3d' | 'lite' = '3d') {
  await page.addInitScript(
    ([q, before]) => {
      localStorage.setItem('runway.mapQuality', q);
      // Full quality (antialiasing, shadows) on software WebGL, for pictures.
      localStorage.setItem('runway.hq', '1');
      // "Before": the game's own low-poly people and cars (the models turned off).
      if (before) localStorage.setItem('runway.models', 'off');
      else localStorage.removeItem('runway.models');
    },
    [quality, TAG === 'before'] as const,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Models ${letters(5)}`,
    idea: 'Guest lists for clubs',
    market: /Lagos/,
    gender: 'male',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 60_000 });
}

interface Biz {
  id: string;
  kind: string;
  open?: boolean;
}
async function businessOf(page: Page, re: RegExp): Promise<Biz | undefined> {
  const s = (await page.request.get('/api/state').then((r) => r.json())) as {
    view?: { market?: { businesses?: Biz[] } };
  };
  return (s.view?.market?.businesses ?? []).find((b) => b.open !== false && re.test(b.kind));
}

test('home: the player at home', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page, 'Hugo Home', 'lite');
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.setItem('runway.mapQuality', '3d');
    window.dispatchEvent(new StorageEvent('storage', { key: 'runway.mapQuality', newValue: '3d' }));
  });
  await expect(scene).toHaveClass(/is-3d/, { timeout: 90_000 });
  await page.waitForTimeout(6000);
  record('home', await stageStats(page));
  await shots(page, 'home', 4000);
});

test('a busy club, dancing, and a close-up of a walking character', async ({ page }) => {
  test.setTimeout(600_000);
  await founder(page, 'Kemi Nights');
  const club = await businessOf(page, /nightclub/);
  test.skip(!club, 'This build has no nightclub.');
  const placeId = `biz:${club!.id}`;
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 90_000 });
  await expect(scene.locator('.place-room')).toHaveClass(/is-3d/, { timeout: 90_000 });
  await page.waitForTimeout(6000);
  record('club', await stageStats(page));
  await shots(page, 'club', 3500);

  // Dance: you walk onto the floor (a close-up while walking), then dance.
  const tray = scene.getByRole('group', { name: 'What you can do here' });
  const go = tray.locator('[data-action^="fun:"]').first();
  await expect(go).toBeEnabled();
  await go.click();
  await expect(scene.locator('.act-stage')).toBeAttached();
  await page.evaluate(() => {
    const s = (window as unknown as { __stage3d?: { zoomBy(f: number): void } }).__stage3d;
    s?.zoomBy(2.6);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${TAG}-walk-closeup-phone.png` });
  await page.waitForTimeout(3000);
  record('club-dance', await stageStats(page));
  await page.screenshot({ path: `${DIR}/${TAG}-dance-closeup-phone.png` });
  await page.evaluate(() => {
    const s = (window as unknown as { __stage3d?: { zoomBy(f: number): void } }).__stage3d;
    s?.zoomBy(1 / 2.6);
  });
  await shots(page, 'dance', 1500);
});

test('people in the city streets', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page, 'Sade Streets');
  const map = page.getByRole('application', { name: /Map of/ });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 90_000 });
  const close = async () => {
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __city3d?: { rig: { dist: number; pitch: number }; zoomAt(f: number): void };
        }
      ).__city3d;
      if (!s) return;
      s.rig.pitch = 0.42;
      s.zoomAt(s.rig.dist / 36);
    });
  };
  await close();
  await page.waitForTimeout(8000);
  record('city', await cityStats(page));
  await shots(page, 'city', 5000, close);
});

test('the wardrobe and the avatar editor', async ({ page }) => {
  test.setTimeout(300_000);
  await founder(page, 'Ada Wardrobe');
  await tab(page, 'Me').click();
  await page.locator('[data-open-purchases]').click();
  const sheet = page.getByRole('dialog', { name: 'My purchases' });
  await expect(sheet).toBeVisible();
  await shots(page, 'wardrobe', 5000);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Edit my look' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit my look' });
  await expect(editor).toBeVisible();
  await shots(page, 'editor', 5000);
});

test('your car and the traffic, driving', async ({ page }) => {
  test.setTimeout(600_000);
  await page.addInitScript(() => localStorage.setItem('runway.skipRides', '0'));
  await founder(page, 'Dayo Driver');
  const map = page.getByRole('application', { name: /Map of/ });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 90_000 });
  const bought = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'car.buy', modelId: 'hatchback' } },
  });
  expect(bought.ok(), await bought.text()).toBe(true);
  type D = { hold(p: string, on: boolean): void };
  const drive = (p: string, on: boolean) =>
    page.evaluate(
      ([p, on]) => (window as unknown as { __drive?: D }).__drive?.hold(p as string, !!on),
      [p, on] as const,
    );
  // Each size its own drive (a new size ends a trip): off, then stopped so the chase camera settles.
  // Phone and laptop, then midday at laptop size (the traffic in daylight).
  for (const [size, w, h] of [...SIZES, ['day', 1280, 800] as const]) {
    if (size === 'day') await page.clock.setFixedTime(new Date('2026-06-14T11:30:00Z'));
    await page.setViewportSize({ width: w, height: h });
    await page.reload();
    await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 90_000 });
    const far = map.locator('[data-label="airport"]');
    await expect(far).toBeAttached({ timeout: 30_000 });
    await far.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    await far.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
    await map.locator('[data-badge-card="airport"]').getByRole('button', { name: 'Go' }).click();
    const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
    await expect(chooser).toBeVisible({ timeout: 15_000 });
    await chooser.locator('[data-mode="drive"]').click();
    await expect(map.locator('[data-drive-hud]')).toBeVisible({ timeout: 30_000 });
    await drive('go', true);
    await page.waitForTimeout(2500);
    await drive('go', false);
    await drive('brake', true);
    await page.waitForTimeout(6000);
    if (size === 'phone') record('drive', await cityStats(page));
    mkdirSync(DIR!, { recursive: true });
    await page.screenshot({ path: `${DIR}/${TAG}-drive-${size}.png` });
    if (process.env.ASSET_DEBUG)
      console.log(
        'near',
        JSON.stringify(
          await page.evaluate(() => {
            type V = {
              kind: string;
              x: number;
              y: number;
              dx: number;
              dy: number;
              v: number;
              e: number;
            };
            const a = (
              window as unknown as {
                __city3d: {
                  actors: {
                    pos: { x: number; y: number; heading: number };
                    local: { vehicles: V[] };
                  };
                };
              }
            ).__city3d.actors;
            return {
              you: a.pos,
              near: a.local.vehicles
                .filter((v) => v.e >= 0 && Math.hypot(v.x - a.pos.x, v.y - a.pos.y) < 25)
                .map((v) => ({
                  k: v.kind,
                  dx: +(v.x - a.pos.x).toFixed(1),
                  dy: +(v.y - a.pos.y).toFixed(1),
                  v: +v.v.toFixed(1),
                })),
            };
          }),
        ),
      );
    await drive('brake', false);
  }
});
