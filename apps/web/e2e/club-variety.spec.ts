import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
  withoutNetlifyDrawer,
} from './fixtures';
import type { Browser } from '@playwright/test';
import type { Page } from './fixtures';

/**
 * Player feedback: "The clubs all look the same." Two clubs in one city
 * share their city's sound but each has its own look (palette, light rig,
 * dance floor, DJ booth, materials, its name over the bar), picked from the
 * venue itself, so the same club always looks the same.
 *
 * CLUB_SHOTS=<dir> saves a 390×844 screenshot of each club visited.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.CLUB_SHOTS;

interface Biz {
  id: string;
  kind: string;
  name: string;
  open?: boolean;
}

async function founderIn(page: Page, market: RegExp, name: string) {
  // Screenshots draw the 3D room at full quality; the checks need only its data.
  if (SHOTS)
    await page.addInitScript(() => {
      localStorage.setItem('runway.mapQuality', '3d');
      localStorage.setItem('runway.hq', '1');
    });
  await playAsGuest(page);
  await setupFounder(page, {
    name,
    handle: `${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`,
    company: `Club ${letters(5)}`,
    idea: 'Guest lists for clubs',
    market,
  });
  // The map's places (its labelled frame can lag behind on software WebGL).
  await expect(page.locator('[data-badge], [data-place]').first())
    .toBeAttached({ timeout: 90_000 })
    .catch(async (e: unknown) => {
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/failed-map-${name}.png` });
      throw e;
    });
  const s = (await page.request.get('/api/state').then((r) => r.json())) as {
    view?: { market?: { businesses?: Biz[] } };
  };
  return (s.view?.market?.businesses ?? []).filter(
    (b) => b.kind === 'nightclub' && b.open !== false,
  );
}

/** Into a club; its look, and a screenshot. Leaves the scene open. */
async function visit(page: Page, club: Biz, shot: string, strict = true) {
  const placeId = `biz:${club.id}`;
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  // (Abroad, two clubs on one street can share a badge: any club will do there.)
  const scene = page.locator(strict ? `.place-scene[data-scene="${placeId}"]` : '.place-scene');
  await expect(scene)
    .toBeVisible({ timeout: 90_000 })
    .catch(async (e: unknown) => {
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/failed-${shot}.png` });
      throw e;
    });
  await expect(scene).toHaveAttribute('data-room', 'club');
  if (SHOTS) {
    await expect(scene.locator('.place-room')).toHaveClass(/is-3d/, { timeout: 90_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/${shot}.png` });
  }
  return {
    scene,
    look: await scene.getAttribute('data-club-look'),
    tier: await scene.getAttribute('data-club-tier'),
  };
}

async function close(page: Page) {
  await page.locator('.place-scene .place-head').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.place-scene')).toHaveCount(0);
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: test.info().project.use.baseURL,
  });
  const p = await ctx.newPage();
  await withoutNetlifyDrawer(p);
  return { ctx, p };
}

test('two clubs in one city look different, and the same club looks the same', async ({
  page,
  browser,
}) => {
  test.setTimeout(SHOTS ? 720_000 : 420_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const clubs = await founderIn(page, /Lagos, Nigeria/, 'Kemi Nights');
  test.skip(clubs.length < 2, 'This build has fewer than two clubs in Lagos.');
  const a = await visit(page, clubs[0]!, 'lagos-1');
  await close(page);
  const b = await visit(page, clubs[1]!, 'lagos-2');
  expect(a.look).toBeTruthy();
  expect(b.look).toBeTruthy();
  // Same city, same sound, a different room.
  expect(a.look).not.toBe(b.look);
  // Its name is over the bar.
  await expect(b.scene).toHaveAttribute('data-club-sign', clubs[1]!.name.toUpperCase());
  await close(page);
  // Back to the first: it hasn't changed.
  const again = await visit(page, clubs[0]!, 'lagos-1-again');
  expect(again.look).toBe(a.look);
  // (Its 3D room stops drawing: software WebGL is shared by every page.)
  await close(page);

  // Another city, another price tier.
  const abroad = [
    [/Dubai/, 'Rami Marina', 'dubai'],
    [/London/, 'Lily Shoreditch', 'london'],
  ] as const;
  // (London too when taking screenshots: a raw Shoreditch room next to a luxe Marina one.)
  for (const [market, who, tag] of SHOTS ? abroad : abroad.slice(0, 1)) {
    const { ctx, p } = await newPage(browser);
    const there = await founderIn(p, market, who);
    if (there.length) {
      const v = await visit(p, there[0]!, `${tag}-1`, false);
      expect(v.look).toBeTruthy();
      expect(v.tier).toMatch(/^(street|mid|luxe)$/);
      await close(p);
      if (there[1] && SHOTS) {
        await visit(p, there[1], `${tag}-2`, false);
        await close(p);
      }
    }
    await ctx.close();
  }
});
