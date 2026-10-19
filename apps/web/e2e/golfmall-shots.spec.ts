import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * Pictures of golf and the mall for review (SHOTS_DIR=… only): the 3D
 * course through a round, and the Lite side view.
 */
const DIR = process.env.SHOTS_DIR ?? '/tmp/shots';
test.describe.configure({ mode: 'parallel' });
test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

async function founder(page: Page, quality: '3d' | 'lite') {
  await page.addInitScript((q) => {
    try {
      localStorage.setItem('runway.mapQuality', q);
      localStorage.setItem('runway.golfSlow', '4');
    } catch {
      /* storage blocked */
    }
  }, quality);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tiger Ade',
    handle: `shot_${letters(6)}`,
    company: `Fairway ${letters(5)}`,
    idea: 'Tee times for golf clubs',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

async function hold(page: Page, ms: number, mid?: () => Promise<void>, at = ms) {
  const btn = page.locator('[data-action="golf-swing"]');
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(at);
  if (mid) await mid();
  await page.waitForTimeout(Math.max(0, ms - at));
  await page.mouse.up();
}

/** On the 3D map a place is an icon badge: tap it, then Go on its card. */
async function goTo(page: Page, id: string, quality: '3d' | 'lite') {
  if (quality === 'lite') return tapPlace(page, `[data-place="${id}"]`, 'cycle');
  await page.locator(`[data-badge="${id}"]`).first().click();
  await page.locator(`[data-badge-card="${id}"] [data-badge-go]`).click();
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  if (
    await chooser.waitFor({ timeout: 1500 }).then(
      () => true,
      () => false,
    )
  )
    await chooser.locator('[data-mode="cycle"]').click();
}

for (const quality of ['3d', 'lite'] as const)
  test(`golf shots ${quality}`, async ({ page }) => {
    test.skip(!process.env.SHOTS_DIR);
    test.setTimeout(900_000);
    await founder(page, quality);
    const snap = async (name: string) => {
      await page.screenshot({ path: `${DIR}/golf-${quality}-${name}.png` });
    };
    await goTo(page, 'golf', quality);
    const scene = page.locator('.golf-scene');
    await expect(scene).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    await snap('0-intro');
    await scene.locator('[data-action="golf-start"]').click();
    await page.waitForTimeout(4000);
    await snap('1-flyover');
    await expect(scene).toHaveAttribute('data-golf-phase', 'address', { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await snap('2-address');
    // Lite draws a beat behind on a busy machine: catch the top a little later there.
    if (quality === 'lite') await hold(page, 1300, () => snap('3-top-of-backswing'), 1250);
    else await hold(page, 1150, () => snap('3-top-of-backswing'), 1100);
    await page.waitForTimeout(1900);
    await snap('4-follow-through');
    await page.waitForTimeout(3500);
    await snap('5-ball-in-flight');
    await page.waitForTimeout(5000);
    await snap('6-landing');
    // Play on to the green and putt.
    for (let guard = 0; guard < 90; guard++) {
      await expect
        .poll(async () => scene.getAttribute('data-golf-phase'), { timeout: 60_000 })
        .toMatch(/address|holed|done/);
      if ((await scene.getAttribute('data-golf-stage')) === 'card') break;
      if ((await scene.getAttribute('data-golf-phase')) !== 'address') {
        await page.waitForTimeout(300);
        continue;
      }
      const chip = scene.locator('.golf-chip');
      const hole = await scene.getAttribute('data-golf-hole');
      const lie = await chip.getAttribute('data-golf-lie');
      const strokes = Number(await chip.getAttribute('data-golf-strokes'));
      const need = Number(await scene.locator('[data-golf-need]').getAttribute('data-golf-need'));
      const ms = Math.round((Math.max(8, need) / 110) * (lie === 'green' ? 2600 : 1300));
      if (strokes >= 6) await scene.locator('[data-action="golf-pickup"]').click();
      else if (lie === 'green') {
        await page.waitForTimeout(1200);
        await snap(`7-green-h${hole}-s${strokes}`);
        await hold(page, ms, () => snap(`8-putt-back-h${hole}`), Math.max(50, ms - 60));
        await page.waitForTimeout(2000);
        await snap(`9-putt-roll-h${hole}`);
      } else {
        await hold(page, ms);
        if (hole === '2' && strokes === 0) {
          await page.waitForTimeout(5000);
          await snap('5b-flight-hole2');
        }
      }
      await expect
        .poll(async () => scene.getAttribute('data-golf-phase'), { timeout: 120_000 })
        .not.toBe('swing');
      if ((await scene.getAttribute('data-golf-phase')) === 'holed') {
        await page.waitForTimeout(500);
        await snap(`10-holed-h${hole}`);
      }
    }
    await expect(scene.locator('[data-golf-scorecard]')).toBeVisible({ timeout: 60_000 });
    await expect(scene.locator('[data-golf-result="ok"]')).toBeVisible({ timeout: 20_000 });
    await snap('11-scorecard');
    await scene.locator('[data-action="golf-done"]').click();
    await page.waitForTimeout(quality === '3d' ? 4000 : 1000);
    await snap('12-map-at-the-course');
  });

for (const quality of ['3d', 'lite'] as const)
  test(`mall shots ${quality}`, async ({ page }) => {
    test.skip(!process.env.SHOTS_DIR);
    test.setTimeout(300_000);
    await founder(page, quality);
    const snap = async (name: string) => {
      await page.waitForTimeout(quality === '3d' ? 2500 : 600);
      await page.screenshot({ path: `${DIR}/mall-${quality}-${name}.png` });
    };
    await goTo(page, 'mall', quality);
    const scene = page.locator('.mall-scene');
    await expect(scene).toBeVisible({ timeout: 30_000 });
    await snap('1-concourse');
    await scene.locator('[data-shop="fashion"]').click();
    await scene.locator('[data-colour="#f59e0b"]').click();
    await scene.locator('.mall-item-name').filter({ hasText: 'Hoodie' }).click();
    await snap('2-fashion-trying-on');
    await scene.locator('[data-buy="top-hoodie"]').click();
    await expect(scene.locator('[data-mall-bought]')).toBeVisible();
    await snap('3-purchase-confirmation');
    await scene.locator('[data-action="mall-ok"]').click();
    await snap('4-new-outfit');
    await scene.locator('[data-action="mall-back"]').click();
    await scene.locator('[data-shop="phones"]').click();
    await snap('5-phones');
    await scene.locator('[data-action="mall-back"]').click();
    await scene.locator('[data-shop="home"]').click();
    await snap('6-home');
    await scene.locator('[data-action="mall-back"]').click();
    await scene.locator('[data-shop="supermarket"]').click();
    await snap('7-supermarket');
    await scene.locator('[data-action="mall-back"]').click();
    await scene.locator('[data-shop="foodcourt"]').click();
    await snap('8-foodcourt');
    await scene.locator('[data-action="mall-back"]').click();
    await scene.locator('[data-shop="cinema"]').click();
    await snap('9-cinema');
    await scene.getByRole('button', { name: 'Close' }).click();
    await snap('10-city-in-new-outfit');
  });
