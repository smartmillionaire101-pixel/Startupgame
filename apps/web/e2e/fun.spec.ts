import { setupFounder } from './fixtures';
import { expect, letters, test, playAsGuest, tapPlace, type Page } from './fixtures';

/**
 * Wave 6 §C2 (docs/WAVE6-ALIVE-CITY.md): things to do and showrooms.
 * A nightclub leads with Dance; a car dealer and an appliance shop list
 * their catalogue and sell with `businessId`; Home shows what you bought.
 */

/** A founder in Lagos (every city has a nightclub, a car dealer and an appliance shop). */
async function founder(page: Page, name: string) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Vibe ${letters(5)}`,
    idea: 'Bookings for clubs and lounges',
    market: /Lagos, Nigeria/,
  });
  // The first answer after Start can be a cold start that loads the whole world.
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

interface Biz {
  id: string;
  kind: string;
  name: string;
  sells?: { slots?: string[]; cars?: boolean } | null;
}

/** The city's businesses, straight from the view. */
async function businesses(page: Page): Promise<Biz[]> {
  const s = (await page.request.get('/api/state').then((r) => r.json())) as {
    view?: { market?: { businesses?: Biz[] } };
  };
  return s.view?.market?.businesses ?? [];
}

/** Walk (or cycle) into a place and wait for its scene. */
async function enter(page: Page, placeId: string) {
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 20_000 });
  return scene;
}

const pocketOf = async (page: Page) =>
  Number(await page.locator('.place-scene [data-pocket]').first().getAttribute('data-pocket'));

test('a nightclub: Dance comes first, costs money and says what happened', async ({ page }) => {
  await founder(page, 'Kemi Dancer');
  const club = (await businesses(page)).find((b) => b.kind === 'nightclub');
  test.skip(!club, 'This build has no nightclub.');

  const scene = await enter(page, `biz:${club!.id}`);
  await expect(scene).toHaveAttribute('data-room', 'club');
  const tray = scene.getByRole('group', { name: 'What you can do here' });
  // Things to do lead the tray.
  await expect(tray.locator('.tray-card').first()).toHaveAttribute('data-action', /^fun:/);
  const fun = tray.locator('[data-action^="fun:"]');
  const dance = fun.filter({ hasText: /Danc/ });
  const go = (await dance.count()) ? dance.first() : fun.first();

  const before = await pocketOf(page);
  await expect(go).toBeEnabled();
  await go.click();
  // Wave 8: you watch it happen (Skip is always there), then the result card.
  await expect(scene.locator('.act-stage')).toBeAttached();
  await expect(scene.locator('.tray-result')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => pocketOf(page), { timeout: 8000 }).toBeLessThan(before);

  // Sometimes you meet someone: save them.
  const met = scene.locator('.tray-met');
  if (await met.count()) {
    await met.getByRole('button', { name: 'Save' }).click();
    await expect(met.getByText('Saved ✓')).toBeVisible({ timeout: 8000 });
  }
});

test('a car dealer lists cars; buy one and it’s parked at home', async ({ page }) => {
  await founder(page, 'Tobi Driver');
  const dealer = (await businesses(page)).find(
    (b) => b.sells?.cars === true || /car-dealer/.test(b.kind),
  );
  test.skip(!dealer, 'This build has no car dealer.');
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/command')) sent.push(r.postData() ?? '');
  });

  // From home: "Go to the showroom" for a car walks you to a dealer.
  let scene = await enter(page, 'home');
  await expect(scene).toHaveAttribute('data-room', 'apartment');
  // Wave 7: showrooms are under Edit in the walkable home.
  await scene.getByRole('button', { name: 'Edit' }).click();
  await scene.locator('[data-action="showroom:car"]').click();
  scene = page.locator('.place-scene[data-room="showroom"]');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  const dealerId = (await scene.getAttribute('data-scene'))!.replace(/^biz:/, '');

  await scene.locator('[data-action="showroom"]').click();
  const list = scene.getByRole('list', { name: 'Cars on the floor' });
  await expect(list.locator('[data-shop-item]').first()).toBeVisible();
  // The cheapest you can afford (two taps: it's a big purchase).
  const row = list.locator('[data-shop-item]:has(.shop-buy:enabled)').first();
  test.skip((await row.count()) === 0, 'Can’t afford a car in this build.');
  const carId = await row.getAttribute('data-shop-item');
  const buy = list.locator(`[data-shop-item="${carId}"] .shop-buy`);
  await buy.click();
  await expect(buy).toHaveText('Tap again to buy');
  await buy.click();
  await expect(list.locator(`[data-shop-item="${carId}"]`)).toHaveAttribute('data-owned', '1', {
    timeout: 8000,
  });
  expect(
    sent.some((b) => b.includes('"car.buy"') && b.includes(`"businessId":"${dealerId}"`)),
  ).toBe(true);

  await scene.getByRole('button', { name: 'Close' }).click();
  const home = await enter(page, 'home');
  await expect(home.locator('[data-car]')).toBeAttached();
});

test('an appliance shop sells a TV, and it shows in your flat', async ({ page }) => {
  await founder(page, 'Ada Watcher');
  const shop = (await businesses(page)).find(
    (b) => b.sells?.slots?.includes('tv') ?? /applian|electronic/.test(b.kind),
  );
  test.skip(!shop, 'This build has no shop that sells TVs.');

  // Your flat: every slot has a spot (Wave 7: an empty one is a "+" to shop for it).
  let scene = await enter(page, 'home');
  await expect(scene.locator('[data-furniture="tv"]')).toHaveAttribute('data-owned', '0');
  await expect(scene.locator('[data-furniture="fridge"]')).toBeAttached();
  await scene.getByRole('button', { name: 'Edit' }).click();
  await scene.locator('[data-action="showroom:appliance"]').click();
  scene = page.locator('.place-scene[data-room="appliance"]');
  await expect(scene).toBeVisible({ timeout: 20_000 });

  await scene.locator('[data-action="showroom"]').click();
  const tvs = scene.locator('[data-slot="tv"]');
  await expect(tvs.locator('[data-shop-item]').first()).toBeVisible();
  const tvId = await tvs
    .locator('[data-shop-item]:has(.shop-buy:enabled)')
    .first()
    .getAttribute('data-shop-item');
  const buy = tvs.locator(`[data-shop-item="${tvId}"] .shop-buy`);
  await buy.click();
  await expect(buy).toHaveText('Tap again to buy');
  await buy.click();
  await expect(tvs.locator('[data-owned="1"]')).toHaveCount(1, { timeout: 8000 });

  await scene.getByRole('button', { name: 'Close' }).click();
  const home = await enter(page, 'home');
  await expect(home.locator('[data-furniture="tv"]')).toHaveAttribute('data-owned', '1');
});
