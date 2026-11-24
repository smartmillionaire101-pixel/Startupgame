import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';
import type { Page } from './fixtures';

// WebGL through software rendering (as map3d.spec.ts): the rides play on the 3D map.
test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

/**
 * Rides on the 3D map: a taxi (it comes to pick you up, then drives you,
 * its driver at the wheel and you in the back), the city's bus (Lagos: a
 * danfo, its passengers at the windows), cycling and walking play on the
 * real map with a camera following you, the card and Skip over it, and you
 * arrive. Lite keeps the drawn scenes (travel-scenes.spec.ts).
 *
 * RIDES3D_SHOTS=<dir> saves screenshots at full quality (`runway.hq`):
 * each ride mid-route, a keke and an okada ridden, and close-ups of the
 * street traffic's kekes and okadas.
 */

const SHOTS = process.env.RIDES3D_SHOTS;

type RideInfo = {
  kind: string | null;
  model: string | null;
  seated: number;
  crew: number;
  walking: boolean;
};
type City3d = {
  actors: {
    rideInfo(): RideInfo;
    setRide(spec: unknown): void;
    local?: {
      vehicles: { kind: string; x: number; y: number; dx: number; dy: number; e: number }[];
    };
  };
  rig: { x: number; y: number; dist: number; pitch: number; yaw: number };
  want: { x: number; y: number; dist: number };
  following: boolean;
  opts: { reduced: boolean };
  startChase(v?: { dist?: number; pitch?: number; ahead?: number }): void;
  endChase(): void;
  touch(ms?: number): void;
};

async function open3d(page: Page, name: string, market: RegExp, city: RegExp) {
  await page.addInitScript((hq) => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
      localStorage.removeItem('runway.skipRides');
      // A software GPU draws a few frames a second: rides last longer, to be
      // caught under way (four times at full quality, for screenshots).
      localStorage.setItem('runway.rideSlow', hq ? '4' : '3');
      if (hq) localStorage.setItem('runway.hq', '1');
    } catch {
      /* storage blocked */
    }
  }, !!SHOTS);
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Road Ledger ${letters(5)}`,
    idea: 'Payments for drivers',
    market,
  });
  const map = page.getByRole('application', { name: city });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  // The scene, for reading what you ride (as map3d.spec.ts reads __city3d).
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __city3d?: unknown };
      return !!w.__city3d;
    },
    null,
    { timeout: 60_000, polling: 500 },
  );
  if (SHOTS)
    // By day: the sky of today's noon (the map lights the real sun).
    await page.evaluate(() => {
      const d = new Date();
      const noon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0);
      (
        window as unknown as { __city3d: { setSunTime(at: number, hour: number): void } }
      ).__city3d.setSunTime(noon, 12);
    });
  return map;
}

/** Go to a place (a far one) by a mode: its label, Go, the chooser. */
async function rideTo(page: Page, placeId: string, mode: string) {
  const map = page.getByRole('application', { name: /Map of/ });
  // (A software GPU is slow: the map may suggest Lite. Keep 3D.)
  const keep = page.getByRole('button', { name: 'Keep 3D' });
  if (await keep.isVisible().catch(() => false)) await keep.click();
  const label = map.locator(`[data-label="${placeId}"]`);
  await expect(label).toBeAttached({ timeout: 30_000 });
  await label.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await label.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await map.locator(`[data-badge-card="${placeId}"]`).getByRole('button', { name: 'Go' }).click();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  // (dispatched: a software GPU at full quality leaves the page slow to answer clicks)
  await chooser.locator(`[data-mode="${mode}"]`).dispatchEvent('click');
  const scene = page.locator(`.ride-scene[data-ride-mode="${mode}"]`);
  await expect(scene).toBeVisible({ timeout: 15_000 });
  // Played on the map: no drawn scene, the map's canvas under the card.
  await expect(scene).toHaveAttribute('data-ride-3d', '1');
  await expect(scene.locator('.ride-stage')).toHaveCount(0);
  await expect(map.locator('canvas.c3-canvas')).toBeVisible();
  await expect(map).toHaveAttribute('data-ride3d', mode);
  return scene;
}

const info = (page: Page) =>
  page.evaluate(() => (window as unknown as { __city3d: City3d }).__city3d.actors.rideInfo());

/** Everyone in the vehicle drawn (the CC0 people have arrived). */
async function seated(page: Page, n: number) {
  await page.waitForFunction(
    (k) => (window as unknown as { __city3d: City3d }).__city3d.actors.rideInfo().seated >= k,
    n,
    { timeout: 60_000, polling: 250 },
  );
}

/** A screenshot after the map has drawn a few frames more. */
async function shot(page: Page, name: string, wait = 600) {
  if (!SHOTS) return;
  const keep = page.getByRole('button', { name: 'Keep 3D' });
  if (await keep.isVisible().catch(() => false)) await keep.dispatchEvent('click');
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/${name}-b.png` });
}

/** Skip › (or the ride arrives first), then the place opens; close it. */
async function arrive(
  page: Page,
  scene: ReturnType<Page['locator']>,
  skip = true,
  then?: () => Promise<void>,
) {
  if (skip)
    await scene
      .getByRole('button', { name: 'Skip' })
      .dispatchEvent('click', undefined, { timeout: 5000 })
      .catch(() => undefined);
  await expect(scene).toBeHidden({ timeout: 150_000 });
  const map = page.getByRole('application', { name: /Map of/ });
  await expect(map).not.toHaveAttribute('data-ride3d', /./);
  const place = page.locator('.place-scene');
  await expect(place).toBeVisible({ timeout: 15_000 });
  await then?.();
  await place.getByRole('button', { name: 'Close' }).first().click();
  await expect(place).toBeHidden();
}

/** A vehicle of the street traffic seen close up (the traffic held still for the picture). */
async function closeUp(page: Page, kind: string, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(3000);
  const found = await page.evaluate((k) => {
    const s = (window as unknown as { __city3d: City3d }).__city3d;
    const vs = s.actors.local?.vehicles ?? [];
    let best: (typeof vs)[number] | null = null;
    let bd = Infinity;
    for (const v of vs) {
      if (v.kind !== k || v.e < 0) continue;
      const d = Math.hypot(v.x - s.rig.x, v.y - s.rig.y);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (!best) return false;
    s.opts.reduced = true;
    // The chase camera's reach (close in), not following you.
    s.startChase({ dist: 9, pitch: 0.3, ahead: 0 });
    s.following = false;
    const yaw = Math.PI - Math.atan2(best.dx, best.dy) + 0.7;
    Object.assign(s.rig, { x: best.x, y: best.y, dist: 8, pitch: 0.34, yaw });
    Object.assign(s.want, { x: best.x, y: best.y, dist: 8 });
    s.touch(3000);
    return true;
  }, kind);
  if (found) await shot(page, name, 3000);
  await page.evaluate(() => {
    const s = (window as unknown as { __city3d: City3d }).__city3d;
    s.opts.reduced = false;
    s.endChase();
    s.following = true;
    s.touch(1000);
  });
}

test('Rides play on the 3D map in Lagos: taxi, danfo, bike and on foot', async ({ page }) => {
  test.setTimeout(SHOTS ? 1_200_000 : 300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open3d(page, 'Tunde Rides', /Lagos, Nigeria/, /Map of Lagos/);
  // The street traffic, close up: kekes and okadas (with their riders).
  await closeUp(page, 'keke', 'lagos-traffic-keke');
  await closeUp(page, 'moto', 'lagos-traffic-okada');

  // Taxi: the booking card while the yellow taxi comes to you, then you're in the back.
  const taxi = await rideTo(page, 'airport', 'taxi');
  await expect(taxi.locator('.taxi-booking')).toBeVisible();
  if (SHOTS) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/lagos-taxi-pickup.png` });
  }
  await expect(taxi.getByRole('status')).toContainText(/Airport|min/);
  expect((await info(page)).kind).toBe('taxi');
  await expect(taxi.locator('.taxi.is-riding')).toBeAttached({ timeout: 8000 });
  await expect(taxi.locator('[data-mini-car]')).toBeAttached();
  await shot(page, 'lagos-taxi', 300);
  await seated(page, 2);
  expect(await info(page)).toMatchObject({ kind: 'taxi', model: 'cc0', crew: 2 });
  // Into the airport: its trip (the ticket desk) opens.
  await arrive(page, taxi, true, async () => {
    await expect(page.getByRole('region', { name: 'Your trip' })).toBeVisible({
      timeout: 30_000,
    });
  });

  // The danfo: a stop ticker over the map; passengers at the windows.
  const bus = await rideTo(page, 'eventhall', 'bus');
  await expect(bus.getByRole('status')).toContainText('Danfo');
  await expect(bus.locator('[data-stop-ticker] li.is-next')).toHaveCount(1);
  await seated(page, 6);
  expect(await info(page)).toMatchObject({ kind: 'danfo', model: 'code' });
  await shot(page, 'lagos-danfo');
  await arrive(page, bus);

  // Cycling: you on your bike, pedalling; this one rides all the way there.
  const bike = await rideTo(page, 'airport', 'cycle');
  await seated(page, 1);
  expect(await info(page)).toMatchObject({ kind: 'bike', model: 'code', crew: 1 });
  await shot(page, 'lagos-cycle');
  await arrive(page, bike, !!SHOTS);

  // On foot: you walk the pavement, the camera close behind.
  const walk = await rideTo(page, 'eventhall', 'walk');
  expect(await info(page)).toMatchObject({ kind: null, walking: true });
  await shot(page, 'lagos-walk');
  await arrive(page, walk);

  if (SHOTS) {
    // A keke and an okada ridden (the city's: Lagos rides them as taxis).
    for (const [spec, name] of [
      [
        { id: 'keke', body: '#facc15', accent: '#15803d', len: 0.38, wid: 0.24, h: 11 },
        'lagos-keke',
      ],
      [
        {
          id: 'okada',
          body: '#dc2626',
          accent: '#111827',
          len: 0.3,
          wid: 0.12,
          h: 11,
          extra: 'rider',
        },
        'lagos-okada',
      ],
    ] as const) {
      const ride = await rideTo(page, name === 'lagos-keke' ? 'airport' : 'eventhall', 'taxi');
      await expect(ride.locator('.taxi.is-riding')).toBeAttached({ timeout: 8000 });
      await page.evaluate((sp) => {
        const s = (window as unknown as { __city3d: City3d }).__city3d;
        s.actors.setRide(sp);
        s.startChase({ dist: 11, pitch: 0.42, ahead: 1 });
      }, spec);
      await seated(page, 2);
      await shot(page, name);
      await arrive(page, ride);
    }
  }
  // Skipping the ride from the chooser (as fixtures' tapPlace does): straight
  // into the airport's trip, with no ride on the map.
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  const label = map.locator('[data-label="airport"]');
  await label.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await label.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await map.locator('[data-badge-card="airport"]').getByRole('button', { name: 'Go' }).click();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  await chooser.locator('[data-mode="skip"]').dispatchEvent('click');
  await expect(page.getByRole('region', { name: 'Your trip' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ride-scene')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Rides play on the 3D map in London: a black cab and a red bus', async ({ page }) => {
  test.setTimeout(SHOTS ? 1_200_000 : 240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open3d(page, 'Ellie Rides', /London/, /Map of London/);
  await closeUp(page, 'moto', 'london-traffic-moto');

  const cab = await rideTo(page, 'eventhall', 'taxi');
  await expect(cab.locator('.taxi.is-riding')).toBeAttached({ timeout: 8000 });
  await seated(page, 2);
  expect(await info(page)).toMatchObject({ kind: 'taxi', model: 'cc0' });
  await shot(page, 'london-taxi');
  await arrive(page, cab);

  const bus = await rideTo(page, 'hub', 'bus');
  await expect(bus.locator('[data-stop-ticker]')).toBeVisible();
  await seated(page, 6);
  expect((await info(page)).kind).toBe('bus');
  await shot(page, 'london-bus');
  await arrive(page, bus);

  if (SHOTS) {
    const bike = await rideTo(page, 'eventhall', 'cycle');
    await seated(page, 1);
    await shot(page, 'london-cycle');
    await arrive(page, bike);
    const walk = await rideTo(page, 'hub', 'walk');
    await shot(page, 'london-walk');
    await arrive(page, walk);
  }
  expect(errors).toEqual([]);
});
