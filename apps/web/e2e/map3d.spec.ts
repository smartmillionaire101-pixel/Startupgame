import { expect, letters, playAsGuest, setupFounder, test, hudMore } from './fixtures';
import type { Page } from './fixtures';

// WebGL through software rendering, for this spec only: the flags slow the
// CSS-animated scenes (airport, flights) other specs time.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/**
 * Wave 9 §B: the city in 3D (WebGL). Playwright's Chromium draws it with
 * software WebGL (slow), so this spec only checks that it renders, keeps the
 * licence credit, and that a place opens from its label.
 */
test('The 3D city renders, credits OpenStreetMap, and a place opens from its label', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
    } catch {
      /* storage blocked */
    }
  });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tolu Three',
    handle: `tolu_${letters(6)}`,
    company: `Eko Cubes ${letters(5)}`,
    idea: 'Payments for market traders',
  });

  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  // The WebGL map: a canvas, built and drawing.
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  await expect(map.locator('canvas.c3-canvas')).toBeAttached();
  const drawn = await page.waitForFunction(
    () => {
      const s = (window as unknown as { __city3d?: { stats: { draws: number; tris: number } } })
        .__city3d;
      return s && s.stats.draws > 10 && s.stats.tris > 1000 ? s.stats : null;
    },
    null,
    { timeout: 60_000 },
  );
  expect(await drawn.jsonValue()).toBeTruthy();
  const credit = map.locator('[data-osm-credit]');
  await expect(credit).toBeVisible();
  await expect(credit).toHaveText('© OpenStreetMap contributors');
  await expect(page.locator('[data-landmark="Lekki–Ikoyi Link Bridge"]')).toBeAttached();
  // The accessible way in stays: the map's own buttons (zoom behind ⋯).
  await hudMore(page);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The Hub's badge floats over its building (a button named for it); tapping
  // it shows its name and card, and Go walks there and goes in.
  const hub = map.locator('[data-label="hub"]');
  await expect(hub).toBeVisible({ timeout: 30_000 });
  await expect(hub.getByRole('button', { name: 'The Hub' })).toBeAttached();
  await hub.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await hub.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await expect(hub).toHaveClass(/is-picked/);
  const card = map.getByRole('group', { name: 'The Hub' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Go' }).click();
  await expect(card).toBeHidden();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  if (await chooser.isVisible().catch(() => false))
    await chooser.locator('[data-mode="walk"]').click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
});

/** Open the 3D map of a new founder's Lagos. */
async function open3d(page: Page, name: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.mapQuality', '3d');
    } catch {
      /* storage blocked */
    }
  });
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Eko Wheels ${letters(5)}`,
    idea: 'Payments for market traders',
  });
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  return map;
}

/**
 * Wave 10 §B: with a car of your own, the ride chooser offers to drive it;
 * the car takes the road (its own lane, a chase camera) and you drive it:
 * the route card, GO and BRAKE, and a choice of ways at a junction (another
 * way re-routes you). Then you arrive. Buses stop at shelters along their routes.
 */
test('Driving your own car across the 3D city', async ({ page }) => {
  test.setTimeout(240_000);
  // The trip plays (the suite skips rides elsewhere): the controls show on the map.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.skipRides', '0');
    } catch {
      /* storage blocked */
    }
  });
  const map = await open3d(page, 'Dayo Driver');
  const bought = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'car.buy', modelId: 'motorbike' } },
  });
  expect(bought.ok(), await bought.text()).toBe(true);
  await page.reload();
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  const stops = await page.waitForFunction(
    () =>
      (
        window as unknown as { __city3d?: { actors: { stops(): number } } }
      ).__city3d?.actors.stops(),
    null,
    { timeout: 30_000 },
  );
  expect(await stops.jsonValue()).toBeGreaterThan(0);

  // Somewhere far: the airport. The chooser leads with your own car.
  const far = map.locator('[data-label="airport"]');
  await expect(far).toBeAttached({ timeout: 30_000 });
  await far.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await far.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await map.locator('[data-badge-card="airport"]').getByRole('button', { name: 'Go' }).click();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  const drive = chooser.locator('[data-mode="drive"]');
  await expect(drive).toBeVisible();
  await expect(drive).toContainText('Drive');
  await expect(drive).toContainText(/Fuel|Charged/);
  await drive.click();

  // On the road: the route card (next turn, where to, minutes and ETA), the pedals.
  const hud = map.locator('[data-drive-hud]');
  await expect(hud).toBeVisible({ timeout: 30_000 });
  const card = hud.locator('[data-drive-card]');
  await expect(card).toContainText(/Turn (left|right)|Arrive at/);
  await expect(card).toContainText(/\d+ min/);
  await expect(card).toContainText(/ETA \d\d:\d\d/);
  await expect(card.getByRole('button', { name: /Skip/ })).toBeVisible();
  const go = hud.locator('[data-drive-pedal="go"]');
  await expect(go).toBeVisible();
  await expect(hud.locator('[data-drive-pedal="brake"]')).toBeVisible();
  // Hold GO: the car drives off.
  await go.dispatchEvent('pointerdown', { pointerId: 3, clientX: 300, clientY: 800 });
  await expect(go).toHaveAttribute('aria-pressed', 'true');
  // A junction with a choice: brake there (a software GPU draws a frame a
  // second, so the moment is caught from the car itself), then take another way.
  type D = {
    view(): { ways: unknown[] | null; reroutes: number };
    hold(w: 'go' | 'brake', on: boolean): void;
  };
  await page.waitForFunction(
    () => {
      const d = (window as unknown as { __drive?: D }).__drive;
      if (!d?.view().ways) return false;
      d.hold('go', false);
      d.hold('brake', true);
      return true;
    },
    null,
    { timeout: 90_000, polling: 50 },
  );
  const ways = hud.locator('[data-drive-way]');
  await expect(ways.first()).toBeVisible();
  await expect(hud.locator('[data-drive-way][data-route]')).toHaveCount(1);
  const other = hud.locator('[data-drive-way]:not([data-route])').first();
  await other.click();
  await expect(hud.getByRole('status').filter({ hasText: 'New route' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __drive?: D }).__drive!.view().reroutes),
  ).toBe(1);
  await page.evaluate(() => (window as unknown as { __drive?: D }).__drive!.hold('brake', false));
  // Then there (holding GO, or the car takes you once left alone): the airport opens.
  await expect(page.getByRole('dialog', { name: /Airport/ })).toBeVisible({ timeout: 120_000 });
  await expect(map).not.toHaveAttribute('data-driving', '1');
});

/**
 * Player feedback: "Driving my car is broken… it keeps breaking up and then
 * glitching and then taking me out of the car." A thumb on the pedals presses
 * and lets go, over and over, and drifts a little: none of that is a tap or a
 * drag on the map behind them (which panned the camera off the car, let go of
 * GO, and started a new trip, ending the drive). DRIVE_SHOTS=<dir> saves a
 * picture after each press.
 */
test('A long drive with real pedal presses keeps you in the car', async ({ page }) => {
  test.setTimeout(240_000);
  const shots = process.env.DRIVE_SHOTS;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.skipRides', '0');
    } catch {
      /* storage blocked */
    }
  });
  const map = await open3d(page, 'Kemi Cruise');
  const bought = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'car.buy', modelId: 'motorbike' } },
  });
  expect(bought.ok(), await bought.text()).toBe(true);
  await page.reload();
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  const far = map.locator('[data-label="airport"]');
  await expect(far).toBeAttached({ timeout: 30_000 });
  await far.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await far.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await map.locator('[data-badge-card="airport"]').getByRole('button', { name: 'Go' }).click();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  await chooser.locator('[data-mode="drive"]').click();
  await expect(chooser).toBeHidden();

  const hud = map.locator('[data-drive-hud]');
  await expect(hud).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-driving', '1');
  type D = { view(): { left: number } };
  type W = { __drive?: D | null; __drive0?: D | null };
  const left = () => page.evaluate(() => (window as unknown as W).__drive?.view().left ?? -1);
  const same = () =>
    page.evaluate(() => {
      const w = window as unknown as W;
      return !!w.__drive && w.__drive === w.__drive0;
    });
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__drive0 = w.__drive;
  });
  const start = await left();
  expect(start).toBeGreaterThan(0);

  const go = hud.locator('[data-drive-pedal="go"]');
  const brake = hud.locator('[data-drive-pedal="brake"]');
  const centre = async (l: typeof go) => {
    const b = (await l.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  // At least 25 s and eight presses of driving (a software GPU is slow): hold
  // GO (the thumb drifts), let go, a dab of BRAKE.
  const t0 = Date.now();
  let presses = 0;
  let lastLeft = start;
  let moved = 0;
  let arrived = false;
  while (Date.now() - t0 < 25_000 || presses < 8) {
    presses++;
    const g = await centre(go);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 12, g.y - 10, { steps: 4 });
    await page.waitForTimeout(1500);
    await page.mouse.up();
    // A junction's ways: the route's, tapped for real.
    const way = hud.locator('[data-drive-way][data-route]');
    if (await way.isVisible().catch(() => false))
      await way.click({ timeout: 2000 }).catch(() => {});
    if (await brake.isVisible().catch(() => false)) {
      const b = await centre(brake);
      await page.mouse.click(b.x, b.y, { delay: 100 });
    }
    if (shots) await page.screenshot({ path: `${shots}/drive-${presses}.png` });
    const l = await left();
    // Genuinely there: the trip may end on its own (and the airport opens).
    if (l < 1) {
      arrived = true;
      break;
    }
    // Still the same drive: the map didn't ask for another trip.
    await expect(chooser).toBeHidden();
    expect(await same(), 'still driving the same car').toBe(true);
    await expect(map).toHaveAttribute('data-driving', '1');
    if (l < lastLeft) moved++;
    lastLeft = l;
  }
  // Each press of GO moves the car on (a junction or a car in front may hold it up once or twice).
  expect(moved, 'the car keeps moving').toBeGreaterThanOrEqual(Math.min(4, presses - 2));
  if (!arrived) expect(lastLeft).toBeLessThan(start);
  expect(errors).toEqual([]);
});
