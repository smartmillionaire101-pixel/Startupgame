import { devices, type Page } from '@playwright/test';
import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
  withoutNetlifyDrawer,
} from './fixtures';

/**
 * Homes that are what they say: every home has a bathroom you can see (a
 * toilet, a basin, a shower, behind a door); a mansion has a ground floor,
 * an upstairs and a roof terrace joined by stairs; a penthouse has a balcony
 * to watch the city's skyline from, and its owner throws a party there that
 * another player comes to and watches the skyline at.
 *
 * HOME_SHOTS=<dir> also saves 390×844 screenshots.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.HOME_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** The dev tools' show home of a kind (read-only, furnished). */
async function preview(page: Page, kind: string, wealth: number) {
  await page.getByRole('button', { name: 'Today' }).click();
  const tools = page.locator('[data-home-preview]');
  await tools.scrollIntoViewIfNeeded();
  await tools.getByRole('button', { name: `Wealth ${wealth}` }).click();
  await tools.locator(`[data-preview-kind="${kind}"]`).click();
  const home = page.locator('.home-scene');
  await expect(home).toHaveAttribute('data-kind', kind);
  return home;
}

test('every home has a bathroom, and a mansion has floors joined by stairs', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Fola Floors',
    handle: `floors_${letters(8)}`,
    company: `Floors ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  for (const kind of ['studio', 'apartment', 'townhouse', 'villa', 'mansion', 'penthouse']) {
    const home = await preview(page, kind, 1);
    // The bathroom (on the ground floor of a house: the guest bathroom), its door and its things.
    await expect(home.locator('rect[data-room="bathroom"]').first()).toBeAttached();
    await expect(home.locator('[data-bath-door]').first()).toBeAttached();
    for (const thing of ['toilet', 'sink', 'shower'])
      await expect(home.locator(`[data-obj="${thing}"]`), `${kind}: ${thing}`).toBeAttached();
    await expect(home).toHaveAttribute(
      'data-floors',
      kind === 'mansion' ? '3' : kind === 'townhouse' || kind === 'villa' ? '2' : '1',
    );
    if (kind === 'studio') await shot(page, 'studio-bathroom');
    await home.getByRole('button', { name: 'Close' }).first().click();
    await expect(home).toBeHidden();
  }

  // A mansion: the grand staircase in the hall takes you up.
  const home = await preview(page, 'mansion', 3);
  await expect(home).toHaveAttribute('data-floor', '0');
  await expect(home.locator('rect[data-room="hall"]')).toBeAttached();
  const floors = home.getByRole('group', { name: 'Floors' });
  await expect(floors.getByRole('button')).toHaveText([
    'Roof terrace',
    'Upper floor',
    'Ground floor',
  ]);
  await shot(page, 'mansion-ground');
  await home.locator('[data-obj="stairs-up"]').click();
  await home.locator('[data-verb="floor"]').click();
  await expect(home).toHaveAttribute('data-floor', '1', { timeout: 10_000 });
  // Upstairs: the master bedroom and its en-suite, the family bathroom, bedrooms, a balcony.
  await expect(home.locator('[data-obj="bed"]')).toBeAttached();
  await expect(home.locator('rect[data-room="bathroom"]')).toHaveCount(2);
  await expect(home.locator('rect[data-room="balcony"]')).toBeAttached();
  await expect(home.locator('[data-obj="stairs-down"]')).toBeAttached();
  await expect(home.locator('[data-obj^="bedroom-bed-"]').first()).toBeAttached();
  await expect(floors.getByRole('button', { name: 'Upper floor' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shot(page, 'mansion-upstairs');
  // On up to the roof terrace by the next flight, and down by the floor buttons.
  await home.locator('[data-obj="stairs-roof"]').click();
  await home.locator('[data-verb="floor"]').click();
  await expect(home).toHaveAttribute('data-floor', '2', { timeout: 10_000 });
  await expect(home.locator('rect[data-room="terrace"]')).toBeAttached();
  await shot(page, 'mansion-roof');
  await floors.getByRole('button', { name: 'Ground floor' }).click();
  await expect(home).toHaveAttribute('data-floor', '0');
  await expect(home.locator('[data-obj="stairs-up"]')).toBeAttached();
});

/** A Lagos founder made through the API (the phone ready). */
async function player(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const h = `ph_${letters(8)}`;
  const status = await page.evaluate(
    async ({ h, name }) => {
      const r = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-runway': '1' },
        body: JSON.stringify({
          command: {
            type: 'player.create',
            handle: h,
            name,
            role: 'founder',
            backgroundId: 'f-engineer',
            market: 'lagos',
            gender: 'female',
            company: {
              name: `Sky ${h.slice(3)}`,
              industry: 'fintech',
              revenueModel: 'subscription',
              idea: 'Payments for market traders',
              incorporation: 'local',
            },
          },
        }),
      });
      return r.status;
    },
    { h, name },
  );
  expect(status).toBe(200);
}

const me = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return ((s.view ?? s) as { me: { id: string } }).me.id;
  });

test('a penthouse balcony: watch the skyline, and a party another player comes to', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(300_000);
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  await player(a, `Amara${tag} Host`);
  await player(b, `Bisi${tag} Guest`);
  const aId = await me(a);
  const bId = await me(b);
  // A lives at the top: a penthouse (lifestyle tier 5).
  const r = await a.evaluate(async () => {
    const res = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: { type: 'player.lifestyle', tier: 5 } }),
    });
    return res.status;
  });
  expect(r).toBe(200);
  await a.reload();
  await expect(a.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(a, '[data-place="home"]', 'cycle');
  const home = a.locator('.home-scene');
  await expect(home).toHaveAttribute('data-kind', 'penthouse', { timeout: 20_000 });

  // The balcony: watch the skyline, or host a party.
  await home.locator('[data-obj="skyline"]').click();
  const menu = home.getByRole('menu', { name: 'Balcony' });
  await expect(menu.locator('[data-verb="skyline"]')).toHaveText('Watch the skyline');
  await expect(menu.locator('[data-verb="party"]')).toHaveText('Host a party');
  await menu.locator('[data-verb="skyline"]').click();
  const sky = a.getByRole('dialog', { name: 'City panorama' });
  await expect(sky).toHaveAttribute('data-sky-view', 'penthouse:lagos', { timeout: 60_000 });
  await expect(sky.getByRole('heading', { name: 'Your balcony' })).toBeVisible();
  await expect(sky.locator('canvas')).toBeVisible({ timeout: 90_000 });
  await expect(sky).toHaveAttribute('data-sky-phase', 'look', { timeout: 30_000 });
  await a.waitForTimeout(2000);
  await shot(a, 'penthouse-skyline');
  await sky.getByRole('button', { name: 'Close panorama' }).click();
  await expect(sky).toHaveCount(0, { timeout: 30_000 });

  // A party: B is in town, A invites B over.
  await home.locator('[data-obj="skyline"]').click();
  await home.getByRole('menu', { name: 'Balcony' }).locator('[data-verb="party"]').click();
  const party = home.getByRole('dialog', { name: 'Host a party' });
  await expect(party).toBeVisible();
  await party.locator(`[data-party-invite="${bId}"]`).click();
  await expect(party.locator(`[data-party-invite="${bId}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await party.locator('[data-action="party-send"]').click();
  await expect(party).toBeHidden({ timeout: 10_000 });

  // B accepts, comes up, and watches the skyline from A's balcony.
  await b.reload();
  await expect(b.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  const bPhone = b.getByRole('dialog', { name: 'Phone' });
  await b.getByRole('button', { name: /^Phone/ }).click();
  await bPhone.locator('[data-app="events"]').click();
  const invite = bPhone.locator('[data-visit-invite]').first();
  await expect(invite).toBeVisible({ timeout: 10_000 });
  await invite.getByRole('button', { name: 'Accept' }).click();
  const visit = b.locator(`.home-scene[data-host-view="${aId}"]`);
  await expect(visit).toHaveAttribute('data-kind', 'penthouse', { timeout: 10_000 });
  await visit.locator('[data-obj="skyline"]').click();
  const guestMenu = visit.getByRole('menu', { name: 'Balcony' });
  await expect(guestMenu.locator('[data-verb="skyline"]')).toBeVisible();
  // Only the host throws the party.
  await expect(guestMenu.locator('[data-verb="party"]')).toHaveCount(0);
  await guestMenu.locator('[data-verb="skyline"]').click();
  const guestSky = b.getByRole('dialog', { name: 'City panorama' });
  await expect(guestSky).toHaveAttribute('data-sky-view', 'penthouse:lagos', { timeout: 60_000 });
  await expect(guestSky.getByRole('heading', { name: /’s balcony$/ })).toBeVisible();
  await expect(guestSky.locator('canvas')).toBeVisible({ timeout: 90_000 });
  await guestSky.getByRole('button', { name: 'Close panorama' }).click();
  await expect(guestSky).toHaveCount(0, { timeout: 30_000 });
});

test('a house on the market: the 3D tour goes up its floors', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tolu Tours',
    handle: `tours_${letters(8)}`,
    company: `Tours ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  // A mansion if one is listed (three floors), else the biggest house there is.
  const listing = await page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    const all = ((s.view ?? s).market.properties?.listings ?? []) as { id: string; tier: string }[];
    for (const tier of ['mansion', 'villa', 'house', 'townhouse']) {
      const l = all.find((x) => x.tier === tier);
      if (l) return l;
    }
    return null;
  });
  expect(listing, 'a house listed in Lagos').not.toBeNull();
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="homes"]').click();
  await phone.locator(`[data-listing="${listing!.id}"]`).click();
  const tour = phone.locator('[data-tour]');
  await expect(tour).toHaveClass(/is-3d/, { timeout: 90_000 });
  const canvas = tour.locator('canvas');
  await expect(canvas).toHaveAttribute('data-floor', '0');
  const floors = tour.getByRole('group', { name: 'Floors' });
  await expect(floors.locator('[data-tour-floor]')).toHaveCount(
    listing!.tier === 'mansion' ? 3 : 2,
  );
  await floors.locator('[data-tour-floor="1"]').click();
  await expect(canvas).toHaveAttribute('data-floor', '1', { timeout: 20_000 });
  await expect(floors.locator('[data-tour-floor="1"]')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, `tour-${listing!.tier}-upstairs`);
  if (listing!.tier === 'mansion') {
    await floors.locator('[data-tour-floor="2"]').click();
    await expect(canvas).toHaveAttribute('data-floor', '2', { timeout: 20_000 });
    await shot(page, 'tour-mansion-roof');
  }
  await floors.locator('[data-tour-floor="0"]').click();
  await expect(canvas).toHaveAttribute('data-floor', '0', { timeout: 20_000 });
});
