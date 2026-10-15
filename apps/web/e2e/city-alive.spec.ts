import { expect, letters, playAsGuest, setupFounder, tapPlace, test } from './fixtures';
import type { Page } from './fixtures';

// WebGL through software rendering (the traffic test draws the 3D city).
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/**
 * A city that feels alive: venues are full of named AI people (founders,
 * investors, bankers, owners, teams) — busiest at night in the clubs — each
 * tagged AI, and the streets carry traffic.
 */
async function founder(page: Page, name: string, quality: '3d' | 'lite', hour?: number) {
  await page.addInitScript(
    ([q, h]) => {
      try {
        localStorage.setItem('runway.mapQuality', q as string);
        if (h !== null) localStorage.setItem('runway.mapHour', String(h));
      } catch {
        /* storage blocked */
      }
    },
    [quality, hour ?? null] as const,
  );
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Night Owl ${letters(5)}`,
    idea: 'Bookings for clubs and lounges',
    market: /Lagos, Nigeria/,
  });
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  return map;
}

test('a club at night is full of AI people you can meet', async ({ page }) => {
  test.setTimeout(120_000);
  await founder(page, 'Ada Nightowl', 'lite', 23.5);
  const s = (await page.request.get('/api/state').then((r) => r.json())) as {
    view?: { market?: { businesses?: { id: string; kind: string }[] } };
  };
  const club = (s.view?.market?.businesses ?? []).find((b) => b.kind === 'nightclub');
  test.skip(!club, 'This build has no nightclub.');

  const placeId = `biz:${club!.id}`;
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await expect(scene).toHaveAttribute('data-room', 'club');

  // Several people in the room, and in Who's here.
  await expect(scene.locator('[data-occupant]')).not.toHaveCount(0);
  expect(await scene.locator('[data-occupant]').count()).toBeGreaterThanOrEqual(5);
  const strip = scene.locator('.who-strip');
  await expect(strip).toBeVisible();
  expect(Number(await strip.getAttribute('data-who-count'))).toBeGreaterThanOrEqual(6);

  // The list: named AI people with roles and companies, each tagged AI.
  await strip.click();
  const list = page.getByRole('list', { name: 'People here' });
  await expect(list).toBeVisible();
  const ai = list.locator('.who-row').filter({ has: page.locator('.who-ai') });
  expect(await ai.count()).toBeGreaterThanOrEqual(5);
  await expect(list.locator('.who-row', { hasText: ' · ' }).first()).toBeVisible();
  // Crowd roles from the world: founders, investors, bankers, owners, teams.
  const kinds = await list
    .locator('.who-row')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-kind')));
  expect(
    kinds.some((k) => ['founder', 'employee', 'banker', 'partner', 'owner'].includes(k ?? '')),
  ).toBe(true);
  await page.keyboard.press('Escape');

  // Tap someone in the room: their card says who they are, tagged AI, with Chat.
  const crowd = scene.locator('[data-occupant^="ai:employee:"], [data-occupant^="ai:founder:"]');
  if (await crowd.count()) {
    await crowd.first().dispatchEvent('click');
    const card = page.locator('.person-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('AI', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Chat' })).toBeVisible();
  }
});

test('the 3D streets carry traffic', async ({ page }) => {
  test.setTimeout(150_000);
  const map = await founder(page, 'Bayo Traffic', '3d');
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 60_000 });
  await expect
    .poll(async () => Number((await map.getAttribute('data-traffic')) ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(20);
  // The traffic around you is on the road, near where the camera looks.
  const local = await page.waitForFunction(
    () => {
      const a = (
        window as unknown as {
          __city3d?: { actors: { trafficCount(): number } };
        }
      ).__city3d?.actors;
      return a ? a.trafficCount() : null;
    },
    null,
    { timeout: 30_000 },
  );
  expect(await local.jsonValue()).toBeGreaterThan(20);
});
