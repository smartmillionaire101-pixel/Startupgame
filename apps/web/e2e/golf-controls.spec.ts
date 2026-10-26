import {
  expect,
  expectGolfControlsClear,
  letters,
  playAsGuest,
  setupFounder,
  tapPlace,
  test,
} from './fixtures';

// WebGL on the CPU, so the 3D course draws in a headless browser.
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

/**
 * The controls keep to the edges (player feedback: the tray took the bottom
 * third and the centred swing button sat on the ball and the aim line): a
 * full-height course, clubs down the left, aim bottom-left, the swing button
 * and an upright meter bottom-right, on a short phone and a tall one, in 3D
 * and in Lite.
 */
test.describe('golf: the controls leave the ball and the aim clear', () => {
  for (const quality of ['3d', 'lite'] as const)
    for (const height of [660, 915])
      test(`${quality} at 412×${height}`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: 412, height });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript((q) => {
          try {
            localStorage.setItem('runway.mapQuality', q);
          } catch {
            /* storage blocked */
          }
        }, quality);
        await playAsGuest(page);
        await setupFounder(page, {
          name: 'Tiger Ade',
          handle: `clear_${letters(6)}`,
          company: `Fairway ${letters(5)}`,
          idea: 'Tee times for golf clubs',
        });
        await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({
          timeout: 30_000,
        });
        await tapPlace(page, '[data-place="golf"]', 'cycle');
        const scene = page.locator('.golf-scene');
        await expect(scene).toBeVisible({ timeout: 30_000 });
        await scene.locator('[data-action="golf-start"]').click();
        await expect(scene).toHaveAttribute('data-golf-phase', 'address', { timeout: 30_000 });
        await expect(
          scene.locator(quality === '3d' ? '[data-golf-3d]' : '[data-golf-2d]'),
        ).toBeAttached();
        // The course fills the screen: the view runs from the top to the bottom.
        const view = (await scene.locator('.golf-view').boundingBox())!;
        const all = (await scene.boundingBox())!;
        expect(view.y).toBeLessThanOrEqual(all.y + 1);
        expect(view.y + view.height).toBeGreaterThanOrEqual(all.y + all.height - 1);
        // Clubs down the left, aim bottom-left, swing bottom-right with its meter beside it.
        const clubs = (await scene.locator('.golf-clubs').boundingBox())!;
        const left = (await scene.locator('[data-action="golf-left"]').boundingBox())!;
        const swing = (await scene.locator('[data-action="golf-swing"]').boundingBox())!;
        const meter = (await scene.locator('.golf-meter').boundingBox())!;
        expect(clubs.x).toBeLessThan(20);
        expect(clubs.width).toBeLessThan(90);
        expect(clubs.height).toBeGreaterThan(clubs.width);
        expect(left.x).toBeLessThan(40);
        expect(left.y + left.height).toBeGreaterThan(all.y + all.height - 90);
        expect(swing.x + swing.width).toBeGreaterThan(all.x + all.width - 40);
        expect(swing.y + swing.height).toBeGreaterThan(all.y + all.height - 90);
        expect(meter.x + meter.width).toBeLessThanOrEqual(swing.x);
        await expect(scene.locator('.golf-meter .golf-bar-sweet')).toBeAttached();
        await expect(scene.locator('.golf-meter .golf-bar-lunge')).toBeAttached();
        await expect(scene.locator('.golf-meter [data-golf-need]')).toBeAttached();
        await expect(scene.locator('.golf-mid')).toContainText('hold to swing');
        await expectGolfControlsClear(page, `${quality} ${height} address`);
        if (process.env.SHOTS_DIR)
          await page.screenshot({
            path: `${process.env.SHOTS_DIR}/golf-${quality}-${height}-a.png`,
          });
        // Aim off to one side: still clear.
        await scene.locator('[data-action="golf-right"]').click();
        await scene.locator('[data-action="golf-right"]').click();
        await expect(scene.locator('[data-golf-aim]')).toHaveAttribute('data-golf-aim', /^[1-9]/);
        await expectGolfControlsClear(page, `${quality} ${height} aimed right`);
        // Hold the swing: the meter fills beside the thumb and the reading shows in the middle.
        await page.mouse.move(swing.x + swing.width / 2, swing.y + swing.height / 2);
        await page.mouse.down();
        await expect(scene).toHaveAttribute('data-golf-phase', 'charging');
        await expect(scene.locator('.golf-read b')).toHaveText(/^\d+%/);
        await expect
          .poll(async () => Number(await scene.locator('.golf-meter').getAttribute('data-power')))
          .toBeGreaterThan(5);
        await expect(scene.locator('.golf-meter-pct')).toHaveText(/^\d+%$/);
        await expect(scene.locator('.golf-carry')).toContainText('Carries about');
        await expectGolfControlsClear(page, `${quality} ${height} charging`);
        if (process.env.SHOTS_DIR)
          await page.screenshot({
            path: `${process.env.SHOTS_DIR}/golf-${quality}-${height}-c.png`,
          });
        await page.mouse.up();
        await expect(scene).not.toHaveAttribute('data-golf-phase', 'charging');
      });
});
