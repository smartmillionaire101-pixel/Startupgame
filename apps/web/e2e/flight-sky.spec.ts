import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * Phase 6b: the flight in 3D, on a phone (390 × 844). Board at Lagos; the
 * take-off over the city; the cabin at real size (your seat, the trolley,
 * the window light, the seat-back map, the meal); then the full sky: a
 * canvas really drawing (not blank, not one colour) with a cloud layer,
 * over the wing and out to the plane; the approach and the landing in
 * London. A second flight goes in your own jet, at night.
 *
 * The flight's sky follows `runway.flightClock`, so the light is the same
 * on every run. FLIGHT_SHOTS=<dir> saves a screenshot at every step (drawn
 * at full quality: antialiasing and the phone's pixels).
 */

const SHOTS = process.env.FLIGHT_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ viewport: { width: 390, height: 844 } });

/**
 * The flight runs this many times slower here (`runway.flightPace`): the
 * software renderer keeps the page busy, and screenshots draw at full
 * quality, slower still.
 */
const PACE = SHOTS ? 10 : 3;
const ms = (n: number) => n * PACE;
/**
 * Waits that don't follow the flight's pace (the city, the airport, the 3D
 * view getting ready): generous, because WebGL in headless Chromium is drawn
 * in software and other specs share the machine.
 */
const SLOW = 3;

async function board(page: Page, name: string, clock: string, tier?: number, pace = PACE) {
  await page.addInitScript(
    ({ clock, hq, pace }) => {
      try {
        localStorage.setItem('runway.mapQuality', '3d');
        localStorage.setItem('runway.flightClock', clock);
        localStorage.setItem('runway.flightPace', String(pace));
        if (hq) localStorage.setItem('runway.hq', '1');
      } catch {
        /* storage blocked */
      }
    },
    { clock, hq: !!SHOTS, pace },
  );
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Sky ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  if (tier) {
    const status = await page.evaluate(async (tier) => {
      const r = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-runway': '1' },
        body: JSON.stringify({ command: { type: 'player.lifestyle', tier } }),
      });
      return r.status;
    }, tier);
    expect(status).toBe(200);
    await page.reload();
  }
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  // These specs are about the flight: book it in the phone's Travel app and
  // go straight to the airport (the map tap and the ride there are covered
  // by travel-scenes, and are slow and flaky under a software renderer).
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  await phone
    .locator('[data-flight="london"]')
    .getByRole('button', { name: 'Book a flight to London' })
    .click();
  // Where to stay: the suggested hotel is picked; book flight + hotel.
  await phone.locator('[data-hotel-book]').click();
  // "Always skip rides" (the fixtures' setting) goes straight there; otherwise skip the trip.
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 * SLOW });
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  // The check-in animation (none with reduced motion).
  await trip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await expect(trip.getByRole('button', { name: 'Go to the gate' })).toBeVisible({
    timeout: 4000 * SLOW,
  });
  await trip.getByRole('button', { name: 'Go to the gate' }).click();
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  // A software renderer (as here) keeps the page busy: generous waits.
  await expect(flight).toBeVisible({ timeout: 20_000 * SLOW });
  return flight;
}

/** The canvas really draws: many colours, light and dark, not one flat fill. */
async function drawn(canvas: Locator) {
  // A page screenshot of the canvas's box: an element screenshot waits for
  // the element to hold still, which a busy software renderer may never do.
  const box = (await canvas.boundingBox())!;
  const png = PNG.sync.read(
    await canvas.page().screenshot({ clip: box, animations: 'allow', timeout: 60_000 }),
  );
  const seen = new Set<number>();
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 0; y < png.height; y += 4)
    for (let x = 0; x < png.width; x += 4) {
      const i = (y * png.width + x) * 4;
      const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
      seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l;
      sq += l * l;
      n++;
    }
  const mean = sum / n;
  return { colours: seen.size, spread: Math.sqrt(sq / n - mean * mean), mean };
}

async function waitPhase(flight: Locator, phase: string, timeout = 15_000) {
  await expect(flight).toHaveAttribute('data-flight-phase', phase, { timeout: timeout * PACE });
}

test('a flight in 3D: the take-off, the cabin, the full sky over the clouds, the landing', async ({
  page,
}) => {
  test.setTimeout(180_000 * PACE);
  // Morning in Lagos, midday over the Sahara, the afternoon in London.
  const flight = await board(page, 'Ada Skies', '2026-06-15T08:30:00Z');
  const view = flight.locator('[data-flight3d]');
  await expect(view).toHaveAttribute('data-flight3d', 'ready', { timeout: 15_000 * SLOW });
  const canvas = view.locator('canvas[data-flight-canvas]');

  // Take-off: the roll, then the city falling away.
  await waitPhase(flight, 'takeoff');
  await expect(view).toHaveAttribute('data-cloud-layer', 'takeoff');
  await page.waitForTimeout(ms(700));
  await shot(page, '01-takeoff-roll');
  await page.waitForTimeout(ms(1900));
  await shot(page, '02-takeoff-climb');

  // The cabin: up the aisle, your seat, the trolley, the window light, the map, the meal.
  await waitPhase(flight, 'cruise');
  const cabin = flight.locator('[data-cabin]');
  await expect(cabin).toBeVisible();
  await expect(cabin).toHaveAttribute('data-cabin', 'economy');
  await expect(view).toHaveAttribute('data-flight-view', 'cabin');
  await expect(cabin.locator('[data-seat="you"]')).toContainText(/You · \d+A/);
  await expect(cabin.locator('[data-window]')).toBeVisible();
  await expect(cabin.locator('[data-flight-plane]')).toBeAttached();
  await expect(cabin.locator('[data-trolley]')).toBeAttached();
  await page.waitForTimeout(ms(900));
  await shot(page, '03-cabin-aisle');
  // The trolley comes down the aisle with your meal (on a slow test machine it
  // may already have served you and gone).
  await expect(cabin.locator('[data-trolley]')).toHaveAttribute(
    'data-trolley',
    /coming|here|gone/,
    {
      timeout: ms(6000),
    },
  );
  await expect
    .poll(async () => Number(await cabin.locator('[data-meal]').getAttribute('opacity')), {
      timeout: ms(6000),
    })
    .toBeGreaterThan(0.5);
  await shot(page, '04-cabin-seat-meal');
  const inside = await drawn(canvas);
  expect(inside.colours).toBeGreaterThan(60);
  await page.waitForTimeout(ms(1500));
  await shot(page, '05-cabin-window');

  // The full sky: a canvas drawing many colours, a cloud layer, over the wing then outside.
  await waitPhase(flight, 'sky');
  await expect(view).toHaveAttribute('data-flight-view', 'outside');
  await expect(view).toHaveAttribute('data-cloud-layer', 'sky');
  expect(Number(await view.getAttribute('data-clouds'))).toBeGreaterThan(20);
  await expect(view).toHaveAttribute('data-sky-part', /dawn|day|dusk|night/);
  await expect(flight).toContainText('Above the clouds');
  await page.waitForTimeout(ms(1100));
  await shot(page, '06-sky-wing');
  const sky = await drawn(canvas);
  expect(sky.colours).toBeGreaterThan(40);
  expect(sky.spread).toBeGreaterThan(8);
  await page.waitForTimeout(ms(2300));
  await shot(page, '07-sky-plane');

  // The approach through the clouds, the touchdown, and London.
  await waitPhase(flight, 'landing');
  await expect(view).toHaveAttribute('data-cloud-layer', 'landing');
  await page.waitForTimeout(ms(900));
  await shot(page, '08-landing-approach');
  await page.waitForTimeout(ms(1900));
  await shot(page, '09-landing-touchdown');
  // A slow machine can reach London before this look: the landing is drawn if it's still up.
  if (await canvas.isVisible()) expect((await drawn(canvas)).colours).toBeGreaterThan(40);
  await expect(flight).toBeHidden({ timeout: ms(20_000) * SLOW });
  // London's 3D map loads after the landing: slow on a busy software renderer.
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible({
    timeout: 15_000 * SLOW,
  });
});

test('your own jet at night: the club chairs, the moon and the stars, Skip still works', async ({
  page,
}) => {
  test.setTimeout(180_000 * PACE);
  // Late evening in Lagos: night all the way.
  const flight = await board(page, 'Jide Jetset', '2026-06-15T21:30:00Z', 5);
  const view = flight.locator('[data-flight3d]');
  await expect(view).toHaveAttribute('data-flight3d', 'ready', { timeout: 15_000 * SLOW });
  await page.waitForTimeout(ms(2600));
  await shot(page, '10-jet-takeoff-night');
  await waitPhase(flight, 'cruise');
  const cabin = flight.locator('[data-cabin]');
  await expect(cabin).toHaveAttribute('data-cabin', 'private');
  await page.waitForTimeout(ms(1200));
  await shot(page, '11-jet-cabin');
  await expect
    .poll(async () => Number(await cabin.locator('[data-meal]').getAttribute('opacity')), {
      timeout: ms(6000),
    })
    .toBeGreaterThan(0.5);
  await shot(page, '12-jet-cabin-seat');
  await waitPhase(flight, 'sky');
  await expect(view).toHaveAttribute('data-sky-part', 'night');
  await page.waitForTimeout(ms(3600));
  await shot(page, '13-jet-sky-night');
  const sky = await drawn(view.locator('canvas'));
  expect(sky.colours).toBeGreaterThan(20);
  await waitPhase(flight, 'landing');
  await page.waitForTimeout(ms(2800));
  await shot(page, '14-jet-landing-night');
  // Forced: the busy software renderer can keep it from settling for the check.
  await flight.getByRole('button', { name: 'Skip' }).click({ force: true });
  await expect(flight).toBeHidden({ timeout: 15_000 * SLOW });
  // London's 3D map loads after the landing: slow on a busy software renderer.
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible({
    timeout: 15_000 * SLOW,
  });
});

test('golden hour: a dusk sky over the cloud deck, and a still flight with reduced motion', async ({
  page,
}) => {
  test.setTimeout(150_000 * PACE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Mid-afternoon in Lagos: the sun low over the route by the cruise.
  // Each still holds 1.6 s; slowed down here so the checks see them.
  const flight = await board(page, 'Bola Dusk', '2026-06-15T15:00:00Z', undefined, 8);
  const view = flight.locator('[data-flight3d]');
  // Reduced motion: the cabin, then the sky, each a still, then London.
  await waitPhase(flight, 'cruise');
  await expect(flight.locator('[data-cabin]')).toBeVisible();
  await waitPhase(flight, 'sky');
  await expect(view).toHaveAttribute('data-sky-part', /dusk|day/);
  await page.waitForTimeout(800);
  expect((await drawn(view.locator('canvas'))).colours).toBeGreaterThan(30);
  await shot(page, '15-dusk-sky-still');
  await expect(flight).toBeHidden({ timeout: 30_000 * SLOW });
});
