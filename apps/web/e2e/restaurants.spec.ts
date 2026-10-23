import { expect, letters, playAsGuest, setupFounder, tapPlace, test } from './fixtures';
import type { Page } from './fixtures';

/**
 * Restaurants of each city (player feedback: "All restaurants are the same.
 * Can we make different restaurants based on the different countries?"): a
 * Lagos buka and a sit-down Lagos restaurant are different rooms with
 * different menus, and a London curry house is neither.
 *
 * RESTAURANT_SHOTS=<dir> saves a 390×844 screenshot of each place visited;
 * RESTAURANT_CITIES="Lagos|London|…" picks the cities for the shots tests
 * (RESTAURANT_PREFIX names the files, RESTAURANT_PER how many per city).
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.RESTAURANT_SHOTS;
const FOOD =
  /^(restaurant|cafe|coffee-roaster|coffee-chain|bakery|buka|suya-spot|grill-house|chop-bar|waakye-stand|kibanda|koshary|shawarma|taqueria|dim-sum|curry-house|caff|food-truck)$/;

interface Biz {
  id: string;
  kind: string;
  name: string;
  open?: boolean;
}

async function founderIn(page: Page, market: RegExp) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('runway.mapQuality', '3d');
    localStorage.setItem('runway.hq', '1');
  });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Eats',
    handle: `eat_${letters(7)}`,
    company: `Eat ${letters(5)}`,
    idea: 'Bookings for restaurants',
    market,
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  const s = (await page.request.get('/api/state').then((r) => r.json())) as {
    view?: { market?: { businesses?: Biz[] } };
  };
  return (s.view?.market?.businesses ?? []).filter((b) => FOOD.test(b.kind) && b.open !== false);
}

async function visit(page: Page, b: Biz, shot?: string) {
  const placeId = `biz:${b.id}`;
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  // Right after the map loads, its card or the ride chooser can open late:
  // Go on the card, cycle in the chooser, until you're in.
  const go = page.locator(`[data-badge-card="${placeId}"] [data-badge-go]`);
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  for (let i = 0; i < 60 && !(await scene.isVisible()); i++) {
    if (await chooser.isVisible())
      await chooser
        .locator('[data-mode="cycle"]')
        .dispatchEvent('click', undefined, { timeout: 2000 })
        .catch(() => {});
    else if (i % 10 === 9 && (await go.count())) await go.first().dispatchEvent('click');
    await page.waitForTimeout(500);
  }
  await expect(scene).toBeVisible({ timeout: 30_000 });
  if (shot) {
    await expect(scene.locator('.place-room')).toHaveClass(/is-3d/, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
  }
  const info = {
    cuisine: await scene.getAttribute('data-cuisine'),
    style: await scene.getAttribute('data-food-style'),
    tier: await scene.getAttribute('data-food-tier'),
    title: (await scene.locator('.place-title').textContent()) ?? '',
    tray: (await scene.textContent()) ?? '',
  };
  await scene.getByRole('button', { name: 'Close' }).first().dispatchEvent('click');
  await expect(scene).toBeHidden();
  return info;
}

test('two Lagos places to eat are different rooms: a buka and a sit-down restaurant', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const lagos = await founderIn(page, /Lagos, Nigeria/);
  const buka = lagos.find((b) => b.kind === 'buka')!;
  const bistro = lagos.find((b) => b.kind === 'restaurant')!;
  expect(buka && bistro).toBeTruthy();
  const a = await visit(page, buka, SHOTS && `${SHOTS}/e2e-lagos-${buka.id}.png`);
  const b = await visit(page, bistro, SHOTS && `${SHOTS}/e2e-lagos-${bistro.id}.png`);
  expect(a.cuisine).toBe('Nigerian');
  expect(a.tier).toBe('1');
  expect(Number(b.tier)).toBeGreaterThan(1);
  expect(a.style).toMatch(/^lagos-/);
  expect(a.style).not.toBe(b.style);
  // The menu speaks the place's food.
  expect(a.tray).toMatch(/jollof|amala|ewedu|ofada|eba/i);
});

test('a London curry house is not a Lagos buka', async ({ page }) => {
  test.setTimeout(240_000);
  const london = await founderIn(page, /London/);
  const curry = london.find((x) => x.kind === 'curry-house')!;
  const c = await visit(page, curry, SHOTS && `${SHOTS}/e2e-london-${curry.id}.png`);
  expect(c.cuisine).toBe('Indian');
  expect(c.style).toMatch(/^london-/);
  expect(c.tray).toMatch(/curry|tikka|biryani|naan|lassi|korma/i);
});

const CITIES = (process.env.RESTAURANT_CITIES ?? 'Lagos|London|Dubai').split('|');
for (const city of CITIES)
  test(`restaurant shots: ${city}`, async ({ page }) => {
    test.skip(!SHOTS, 'RESTAURANT_SHOTS not set');
    test.setTimeout(400_000);
    const prefix = process.env.RESTAURANT_PREFIX ?? 'after';
    const per = Number(process.env.RESTAURANT_PER ?? 3);
    const list = await founderIn(page, new RegExp(city));
    // A sit-down restaurant, a street place and a café first.
    const pick: Biz[] = [];
    for (const want of [
      /restaurant|curry|dim-sum|grill/,
      /buka|chop|kibanda|waakye|koshary|shawarma|taqueria|suya|truck|caff/,
      /cafe|coffee|bakery/,
    ])
      for (const b of list)
        if (want.test(b.kind) && !pick.includes(b)) {
          pick.push(b);
          break;
        }
    for (const b of list) if (pick.length < per && !pick.includes(b)) pick.push(b);
    const slug = city.toLowerCase().replace(/[^a-z]+/g, '-');
    for (const b of pick.slice(0, per)) {
      const info = await visit(page, b, `${SHOTS}/${prefix}-${slug}-${b.kind}-${b.id}.png`);
      console.log(
        `${city} ${b.name} (${b.kind}) → ${info.style} ${info.cuisine} tier ${info.tier}`,
      );
    }
  });
