import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
  type Page,
  hudMore,
} from './fixtures';

/**
 * Player feedback: "take pictures of their house and turn around the house".
 * In the 3D home: Look around turns the camera all the way round (a tap
 * stops it), Photo takes a picture of the view, saves it as a download and
 * keeps it in "Your photos" (this device only).
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/** Switch the map/home drawing quality the way the settings screen does (a storage event). */
async function quality(page: Page, q: '3d' | 'lite') {
  await page.evaluate((v) => {
    localStorage.setItem('runway.mapQuality', v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'runway.mapQuality', newValue: v }));
  }, q);
}

/** Walk home on the (Lite) map, then draw the home in 3D. */
async function openHome(page: Page) {
  await tapPlace(page, '[data-place="home"]', 'cycle');
  const scene = page.locator('.home-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await quality(page, '3d');
  await expect(scene).toHaveClass(/is-3d/, { timeout: 60_000 });
  return scene;
}

test('home: look around and take photos of it', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Pia Pictures',
    handle: `pics_${letters(8)}`,
    company: `Pics ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  const scene = await openHome(page);

  // The view controls are named round icons in the room's rail, and fit on a phone.
  const tools = scene.getByRole('group', { name: 'Home actions' });
  await expect(tools.getByRole('button', { name: 'Turn' })).toBeVisible();
  const look = tools.locator('[data-action="look-around"]');
  await expect(look).toHaveAttribute('data-looking', '0');

  // Look around: pressed again, it stops; a tap on the home stops it too.
  await look.click();
  await expect(look).toHaveAttribute('data-looking', '1');
  await expect(look).toHaveAttribute('aria-pressed', 'true');
  await look.click();
  await expect(look).toHaveAttribute('data-looking', '0');
  await look.click();
  await expect(look).toHaveAttribute('data-looking', '1');
  await scene.locator('svg.home-svg').click({ position: { x: 40, y: 200 } });
  await expect(look).toHaveAttribute('data-looking', '0');

  // A photo (behind ⋯): the picture, Save (a download) and Close.
  await hudMore(scene);
  await tools.locator('[data-action="photo"]').click();
  const sheet = page.getByRole('dialog', { name: 'Photo of your home' });
  await expect(sheet).toBeVisible();
  const big = sheet.locator('img.home-photo-big');
  await expect(big).toHaveAttribute('src', /^data:image\/jpeg/);
  // Something was drawn: the picture has a real size.
  await expect
    .poll(() => big.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 5000 })
    .toBeGreaterThan(50);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('link', { name: 'Save picture' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^my-home-[a-z0-9-]+\.jpg$/);
  await expect(sheet.locator('[data-photo]')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Close' }).last().click();
  await expect(sheet).toBeHidden();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('runway.homePhotos') ?? '[]').length),
  ).toBe(1);

  // Go out and come back: the photo is still in "Your photos", with the new one.
  await quality(page, 'lite');
  await scene.getByRole('button', { name: 'Go out', exact: true }).click();
  await expect(scene).toBeHidden();
  const again = await openHome(page);
  await hudMore(again);
  await again.locator('[data-action="photo"]').click();
  await expect(sheet).toBeVisible();
  const list = sheet.getByRole('list', { name: 'Your photos' });
  await expect(list.locator('[data-photo]')).toHaveCount(2);
  await expect(list.locator('img').first()).toHaveAttribute('src', /^data:image\/jpeg/);

  // Each one can be deleted.
  await list.locator('[data-photo]').last().getByRole('button', { name: 'Delete photo' }).click();
  await expect(list.locator('[data-photo]')).toHaveCount(1);

  // No sideways scroll on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
