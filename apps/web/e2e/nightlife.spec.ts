import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
  withoutNetlifyDrawer,
} from './fixtures';
import type { Page } from './fixtures';

/**
 * Nightlife of each city (player feedback: "the clubs and bars are the
 * same"): a club in Lagos and one in Johannesburg have their own style,
 * floor plan and music, and the tray speaks the venue's language.
 */
async function clubIn(page: Page, market: RegExp, name: string) {
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Night ${letters(5)}`,
    idea: 'Bookings for clubs and lounges',
    market,
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  const s = (await page.request.get('/api/state').then((r) => r.json())) as {
    view?: { market?: { businesses?: { id: string; kind: string; open?: boolean }[] } };
  };
  const club = (s.view?.market?.businesses ?? []).find(
    (b) => b.kind === 'nightclub' && b.open !== false,
  );
  if (!club) return null;
  const placeId = `biz:${club.id}`;
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 20_000 });
  // Still a club for the crowd and the acts.
  await expect(scene).toHaveAttribute('data-room', 'club');
  return scene;
}

test('a Lagos club and a Johannesburg club are different nights out', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const lagos = await clubIn(page, /Lagos, Nigeria/, 'Ada Afrobeats');
  test.skip(!lagos, 'This build has no nightclub.');
  await expect(lagos!).toHaveAttribute('data-nightlife', 'lagos-afrobeats-club');
  await expect(lagos!).toHaveAttribute('data-genre', 'afrobeats');
  await expect(lagos!.locator('[data-now-playing]')).toHaveText(/Now playing · Afrobeats/);
  await expect(lagos!.locator('[data-nightlife-art]')).toHaveAttribute(
    'data-nightlife-art',
    'lagos-afrobeats-club',
  );
  await expect(lagos!.locator('[data-prop="vip"]')).toBeAttached();
  await expect(lagos!.locator('.place-title')).toContainText('Afrobeats club');

  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: test.info().project.use.baseURL,
  });
  const jpage = await other.newPage();
  await withoutNetlifyDrawer(jpage);
  const joburg = await clubIn(jpage, /Johannesburg/, 'Thabo Piano');
  test.skip(!joburg, 'No Johannesburg club.');
  await expect(joburg!).toHaveAttribute('data-nightlife', 'joburg-amapiano');
  await expect(joburg!).toHaveAttribute('data-layout', 'warehouse');
  await expect(joburg!.locator('[data-now-playing]')).toHaveText(/Now playing · Amapiano/);
  await expect(joburg!.locator('[data-prop="vip"]')).toHaveCount(0);
  await other.close();
});
