import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, tapPlace, test } from './fixtures';

/**
 * Wave 8 §B (docs/WAVE8-REAL-AND-SOCIAL.md): activities you watch happen.
 * A haircut sits you in the chair, the barber cuts, and your new look stays
 * on the map (and after a reload); a restaurant brings the plate; a club has
 * you dancing; the gym puts you on the treadmill; a flight shows the cabin
 * down the aisle. WAVE8_SHOTS=<dir> saves 390 × 844 screenshots.
 */

const SHOTS = process.env.WAVE8_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ viewport: { width: 390, height: 844 } });

async function founder(page: Page, name: string) {
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Fade ${letters(5)}`,
    idea: 'Bookings for barbers',
    gender: 'male',
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
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

async function enter(page: Page, placeId: string) {
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 20_000 });
  return scene;
}

/** Play an act from the tray: the stage shows, Skip is there, the result card ends it. */
async function play(
  page: Page,
  placeId: string,
  action: string,
  script: string,
  name: string,
  label?: RegExp,
) {
  const scene = await enter(page, placeId);
  const tray = scene.getByRole('group', { name: 'What you can do here' });
  const all = tray.locator(action);
  const go = (label ? all.filter({ hasText: label }) : all).first();
  await expect(go).toBeEnabled();
  const before = Number(await scene.locator('[data-pocket]').first().getAttribute('data-pocket'));
  await go.click();
  const stage = scene.locator(`.act-stage[data-act-script="${script}"]`);
  await expect(stage).toBeAttached();
  await expect(scene.getByRole('button', { name: 'Skip' })).toBeVisible();
  // The middle of the loop: walked in, at the station, doing it.
  await page.waitForTimeout(3600);
  await shot(page, name);
  const card = scene.locator('.act-result[data-act-result="ok"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  // The command went at the start: the money is gone.
  const after = Number(await scene.locator('[data-pocket]').first().getAttribute('data-pocket'));
  expect(after).toBeLessThan(before);
  await expect(card.locator('.act-chip').first()).toBeVisible();
  return { scene, card, stage };
}

test('a haircut: sit in the chair, the barber cuts, the new look stays on the map', async ({
  page,
}) => {
  await founder(page, 'Tunde Fresh');
  const barber = await businessOf(page, /barb|salon/);
  test.skip(!barber, 'This build has no barber or salon.');
  const placeId = `biz:${barber!.id}`;
  const scene = await enter(page, placeId);
  await expect(scene).toHaveAttribute('data-room', 'salon');
  await shot(page, 'haircut-before');
  const meId = await page.evaluate(async () => {
    const s = (await fetch('/api/state').then((r) => r.json())) as { view: { me: { id: string } } };
    return s.view.me.id;
  });
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  const oldHair = await map.locator('g.city-avatar [data-hair]').first().getAttribute('data-hair');

  const tray = scene.getByRole('group', { name: 'What you can do here' });
  await tray.locator('[data-action^="buy:"]').first().click();
  const stage = scene.locator('.act-stage[data-act-script="haircut"]');
  await expect(stage).toBeAttached();
  // Seated in the chair, cape on, the barber at work.
  const posed = stage.locator('[data-n="you-posed"]');
  await expect(posed).toBeVisible({ timeout: 4000 });
  await expect(posed.locator('.act-seated')).toBeAttached();
  await expect(stage.locator('[data-n="barber"]')).toBeVisible();
  await page.waitForTimeout(1600);
  await shot(page, 'haircut-mid');
  // The new look is revealed, and the card names it.
  const fresh = stage.locator('[data-n="you-new"]');
  await expect(fresh).toBeVisible({ timeout: 8000 });
  const card = scene.locator('.act-result[data-act-result="ok"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const look = card.locator('[data-new-look]');
  await expect(look).toContainText('New look');
  const style = await look.getAttribute('data-new-look');
  expect(style).toBeTruthy();
  expect(style).not.toBe(oldHair);
  await expect(fresh.locator(`[data-hair="${style}"]`)).toBeAttached();
  await shot(page, 'haircut-after');
  const saved = await page.evaluate((id) => localStorage.getItem(`runway.look.${id}`), meId);
  expect(JSON.parse(saved ?? '{}').hairStyle).toBe(style);

  await card.getByRole('button', { name: 'Done' }).click();
  await expect(scene.getByRole('group', { name: 'What you can do here' })).toBeVisible();
  // You, standing in the room, with the new cut.
  await expect(scene.locator(`.scene-you [data-hair="${style}"]`)).toBeAttached();
  await scene.getByRole('button', { name: 'Close' }).click();
  await expect(scene).toBeHidden();
  // On the map, and after a reload.
  await expect(map.locator('g.city-avatar [data-hair]').first()).toHaveAttribute(
    'data-hair',
    style!,
  );
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page
      .getByRole('application', { name: /Map of Lagos/ })
      .locator('g.city-avatar [data-hair]')
      .first(),
  ).toHaveAttribute('data-hair', style!);
});

test('eat at a restaurant: seated, the waiter brings the plate, a result card', async ({
  page,
}) => {
  await founder(page, 'Ada Eats');
  const food = await businessOf(page, /^restaurant$|buka|grill|chop/);
  test.skip(!food, 'This build has no restaurant.');
  const { scene, card, stage } = await play(
    page,
    `biz:${food!.id}`,
    '[data-action^="buy:"]',
    'meal',
    'restaurant',
    /plate|lunch|dinner|suya|grill|meat/i,
  );
  await expect(scene).toHaveAttribute('data-room', 'restaurant');
  await expect(stage.locator('[data-n="waiter"]')).toBeAttached();
  await expect(stage.locator('[data-n="dish"]')).toBeAttached();
  await expect(card).toContainText(/hunger|energy/);
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(stage).toBeHidden();
});

test('dance at a nightclub, then a workout at the gym', async ({ page }) => {
  await founder(page, 'Kola Moves');
  const club = await businessOf(page, /nightclub/);
  test.skip(!club, 'This build has no nightclub.');
  const { scene, card } = await play(
    page,
    `biz:${club!.id}`,
    '[data-action^="fun:"]',
    'dance',
    'nightclub',
  );
  await expect(scene.locator('.act-stage [data-n="dj"]')).toBeAttached();
  await card.getByRole('button', { name: 'Done' }).click();
  await scene.getByRole('button', { name: 'Close' }).click();

  const gym = await businessOf(page, /^gym$/);
  test.skip(!gym, 'This build has no gym.');
  const g = await play(page, `biz:${gym!.id}`, '[data-action^="fun:"]', 'workout', 'gym');
  await expect(g.scene.locator('.act-stage [data-n="coach"]')).toBeAttached();
});

test('Skip ends an act at once, and reduced motion plays stills', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await founder(page, 'Sade Quick');
  const club = await businessOf(page, /nightclub/);
  test.skip(!club, 'This build has no nightclub.');
  const scene = await enter(page, `biz:${club!.id}`);
  await scene
    .getByRole('group', { name: 'What you can do here' })
    .locator('[data-action^="fun:"]')
    .first()
    .click();
  await scene.getByRole('button', { name: 'Skip' }).click();
  await expect(scene.locator('.act-result[data-act-result="ok"]')).toBeVisible({
    timeout: 8000,
  });
});

test('a flight: the cabin down the aisle, with the trolley and your seat', async ({ page }) => {
  await founder(page, 'Femi Flyer');
  await tapPlace(page, '[data-place="airport"]', 'cycle');
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: 20_000 });
  const trip = page.getByRole('region', { name: 'Your trip' });
  // The ticket first, then check in for that flight.
  await trip
    .getByRole('list', { name: 'Where do you want to go?' })
    .getByRole('button', { name: 'Book a flight to London' })
    .click();
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await trip.getByRole('button', { name: 'Skip' }).click();
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await expect(trip.getByRole('button', { name: 'Go to the gate' })).toBeVisible({
    timeout: 4000,
  });
  await trip.getByRole('button', { name: 'Go to the gate' }).click();
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 6000 });
  const cabin = flight.locator('[data-cabin]');
  await expect(cabin).toBeVisible();
  await expect(cabin).toHaveAttribute('data-cabin', /economy|premium|business/);
  await expect(cabin.locator('[data-seat="you"]')).toBeAttached();
  await expect(cabin.locator('[data-trolley]')).toBeAttached();
  await expect(cabin.locator('[data-window]')).toBeVisible();
  await expect(cabin.locator('[data-flight-plane]')).toBeAttached();
  // The meal comes while the trolley is by your row.
  await expect
    .poll(async () => Number(await cabin.locator('[data-meal]').getAttribute('opacity')), {
      timeout: 6000,
    })
    .toBeGreaterThan(0.5);
  await shot(page, 'cabin');
  await flight.getByRole('button', { name: 'Skip' }).click();
  await expect(flight).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible();
});
