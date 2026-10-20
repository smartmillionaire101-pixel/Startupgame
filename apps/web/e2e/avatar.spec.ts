import { devices } from '@playwright/test';
import {
  expect,
  letters,
  pickIdentity,
  playAsGuest,
  setupFounder,
  test,
  withoutNetlifyDrawer,
  type Page,
} from './fixtures';

/**
 * Phase 6a: real avatars. A new player passes the character creator on the
 * entry screen (it's skippable: a random look is already picked), then opens
 * Me → "Edit my look", changes skin, hair and top and saves. Their portrait
 * on Me, their figure on the map and what another player sees (presence and
 * the phone's people list) all show the new look. A second test checks the
 * creator in Simple mode. Everything fits 390 × 844 without scrolling sideways.
 *
 * AVATAR_SHOTS=<dir> saves screenshots.
 */
const SHOTS = process.env.AVATAR_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ viewport: { width: 390, height: 844 } });

/** The page never scrolls sideways at phone width. */
async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

const CITY = 'Kigali';
const map = (page: Page) => page.getByRole('application', { name: new RegExp(`Map of ${CITY}`) });
const fig = (page: Page) => map(page).locator('g.city-avatar [data-hair]').first();

/** Pick `want` in a creator row (or the first other option when it's already on); returns it. */
async function change(dialog: ReturnType<Page['getByRole']>, group: string, want: string) {
  const row = dialog.getByRole('group', { name: group, exact: true });
  const on = await row.locator(`button[data-value="${want}"]`).getAttribute('aria-pressed');
  const value =
    on === 'true'
      ? (await row.locator('button[aria-pressed="false"]').first().getAttribute('data-value'))!
      : want;
  const option = row.locator(`button[data-value="${value}"]`);
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  return value;
}

test('make a look, edit it from Me, and see it on the map and from another player', async ({
  page,
  browser,
}) => {
  test.slow();
  // ---- Join: the creator is on the entry screen, and skippable.
  await page.goto('/');
  const name = `Ada Look ${letters(4)}`;
  await page.getByLabel('Username', { exact: true }).fill(`av_${letters(8)}`);
  await page.getByLabel('Email', { exact: true }).fill(`av-${letters()}@example.com`);
  await page.getByLabel('Join as').selectOption('investor');
  await pickIdentity(page, { name, city: CITY });
  await page.getByRole('button', { name: 'Make my look' }).click();
  const make = page.getByRole('dialog', { name: 'Make my look' });
  await expect(make.locator('[data-preview] svg.portrait')).toBeVisible();
  await noSideScroll(page);
  await shot(page, 'onboarding-creator');
  await make.getByRole('button', { name: 'Skip for now' }).click();
  await expect(make).toBeHidden();
  await page.getByRole('button', { name: 'Play now' }).click();
  await expect(map(page)).toBeVisible({ timeout: 30_000 });

  // The random look from the entry screen is saved: the map draws it.
  const state = async (p: Page) =>
    (await p.request.get('/api/state').then((r) => r.json())) as {
      view: { me: { id: string; appearance: Record<string, string> | null } };
    };
  const first = (await state(page)).view.me;
  expect(first.appearance).not.toBeNull();
  await expect(fig(page)).toHaveAttribute('data-hair', first.appearance!.hairStyle!);
  await expect(fig(page)).toHaveAttribute('data-skin', first.appearance!.skin!);
  await shot(page, 'map-before');

  // ---- Me → Edit my look: change skin, hair and top, and save.
  await page.getByRole('button', { name: 'Me', exact: true }).click();
  const mine = page.locator('[data-my-look] svg.portrait');
  await expect(mine).toBeVisible();
  await shot(page, 'me-before');
  await page.getByRole('button', { name: 'Edit my look' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit my look' });
  await expect(edit.getByRole('tab', { name: 'Face' })).toHaveAttribute('aria-selected', 'true');
  const skin = await change(edit, 'Skin tone', '#8d5524');
  await edit.getByRole('tab', { name: 'Hair' }).click();
  const hair = await change(edit, 'Hairstyle', 'locs');
  await edit.getByRole('tab', { name: 'Top' }).click();
  const topStyle = await change(edit, 'Top', 'kaftan');
  const topColor = await change(edit, 'Top colour', '#f59e0b');
  // The live preview follows every change.
  const preview = edit.locator('[data-preview] svg.portrait');
  await expect(preview).toHaveAttribute('data-hair', hair);
  await expect(preview).toHaveAttribute('data-skin', skin);
  await expect(preview).toHaveAttribute('data-top', topColor);
  await noSideScroll(page);
  await shot(page, 'creator-top');
  await edit.getByRole('tab', { name: 'Extras' }).click();
  await shot(page, 'creator-extras');
  await edit.getByRole('button', { name: 'Save my look' }).click();
  await expect(edit).toBeHidden();
  await expect(page.locator('.toasts')).toContainText('Look saved.');

  // The portrait on Me.
  await expect(mine).toHaveAttribute('data-hair', hair);
  await expect(mine).toHaveAttribute('data-skin', skin);
  await expect(mine).toHaveAttribute('data-top', topColor);
  await shot(page, 'me-after');
  const saved = (await state(page)).view.me;
  expect(saved.appearance).toMatchObject({ skin, hairStyle: hair, topStyle, topColor });

  // The figure on the map.
  await page.getByRole('button', { name: 'City', exact: true }).click();
  await expect(fig(page)).toHaveAttribute('data-hair', hair);
  await expect(fig(page)).toHaveAttribute('data-skin', skin);
  await expect(fig(page)).toHaveAttribute('data-top', topColor);
  await expect(fig(page)).toHaveAttribute('data-top-style', topStyle);
  await shot(page, 'map-after');

  // ---- Another player in the same city sees the new look.
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const ctxB = await browser.newContext({
    ...phone,
    viewport: { width: 390, height: 844 },
    baseURL: test.info().project.use.baseURL,
  });
  const b = await ctxB.newPage();
  await withoutNetlifyDrawer(b);
  await playAsGuest(b);
  await setupFounder(b, {
    name: 'Bola Seen',
    handle: `seen_${letters(6)}`,
    company: `Seen ${letters(5)}`,
    idea: 'Bookings for barbers',
    market: new RegExp(CITY),
  });
  await expect(map(b)).toBeVisible({ timeout: 30_000 });
  // Where A stands (the map reports it after a walk or on a heartbeat).
  const put = await page.request.post('/api/presence', {
    headers: { 'x-runway': '1' },
    data: { x: 3, y: 4, place: null },
  });
  expect(put.status()).toBe(204);
  const seen = (await b.request.get('/api/presence').then((r) => r.json())) as {
    players: { id: string; appearance: Record<string, string> | null }[];
  };
  expect(seen.players.find((p) => p.id === saved.id)?.appearance).toMatchObject({
    skin,
    hairStyle: hair,
    topColor,
  });
  // And the phone's people list draws A's face as A made it.
  await b.getByRole('button', { name: /^Phone/ }).click();
  const phoneB = b.getByRole('dialog', { name: 'Phone' });
  await phoneB.locator('[data-app="messages"]').click();
  await phoneB.getByRole('button', { name: 'New message' }).click();
  await phoneB.getByLabel('Search people').fill(name.split(' ')[0]!);
  const row = phoneB.locator('.phone-row', { hasText: name }).first();
  await expect(row.locator('svg.portrait')).toHaveAttribute('data-hair', hair);
  await expect(row.locator('svg.portrait')).toHaveAttribute('data-skin', skin);
  await shot(b, 'other-player-sees');
  await ctxB.close();
});

test('the creator in Simple mode: big swatches, no sideways scroll', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('simple-seeded')) return;
      sessionStorage.setItem('simple-seeded', '1');
      localStorage.setItem('runway.simple', '1');
    } catch {
      /* storage blocked */
    }
  });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Sim Look',
    handle: `siml_${letters(6)}`,
    company: `Simple ${letters(5)}`,
    idea: 'Invoices for market traders',
    market: new RegExp(CITY),
  });
  await expect(page.locator('html')).toHaveAttribute('data-simple', '1');
  await page.getByRole('button', { name: 'Me', exact: true }).click();
  await page.getByRole('button', { name: 'Edit my look' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit my look' });
  const swatch = edit.locator('.creator-swatch').first();
  expect((await swatch.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await noSideScroll(page);
  await shot(page, 'simple-creator-face');
  await edit.getByRole('tab', { name: 'Hair' }).click();
  await edit.getByRole('group', { name: 'Hairstyle' }).locator('[data-value="locs"]').click();
  await noSideScroll(page);
  await shot(page, 'simple-creator-hair');
  await edit.getByRole('button', { name: 'Random' }).click();
  await edit.getByRole('button', { name: 'Save my look' }).click();
  await expect(edit).toBeHidden();
});
