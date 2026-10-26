import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * Golf (player feedback: "they should actually play golf"): walk to the
 * city's golf course, play its three holes to the scorecard, and the green
 * fee is charged when you hand in your card.
 */

/** Hold the swing button for `ms` (the meter fills while it's held). */
async function swing(page: Page, ms: number) {
  const btn = page.locator('[data-action="golf-swing"]');
  await expect(btn).toBeEnabled({ timeout: 20_000 });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Play every hole to the scorecard; `shot` is called at moments worth a picture. */
export async function playRound(page: Page, shot?: (name: string) => Promise<void>) {
  const scene = page.locator('.golf-scene');
  for (let guard = 0; guard < 60; guard++) {
    await expect
      .poll(async () => scene.getAttribute('data-golf-phase'), { timeout: 30_000 })
      .toMatch(/address|holed|done/);
    if ((await scene.getAttribute('data-golf-stage')) === 'card') return;
    if ((await scene.getAttribute('data-golf-phase')) !== 'address') {
      await page.waitForTimeout(200);
      continue;
    }
    const chip = scene.locator('.golf-chip');
    const strokes = Number(await chip.getAttribute('data-golf-strokes'));
    const lie = await chip.getAttribute('data-golf-lie');
    // The meter marks the power that reaches the pin.
    const need = Number(await scene.locator('[data-golf-need]').getAttribute('data-golf-need'));
    const ms = Math.round((Math.max(8, need) / 110) * (lie === 'green' ? 2600 : 1300));
    if (strokes >= 6) {
      await scene.locator('[data-action="golf-pickup"]').click();
    } else if (lie === 'green') {
      if (shot) await shot('putt-address');
      await swing(page, ms);
      if (shot) {
        await page.waitForTimeout(500);
        await shot('putt-stroke');
      }
    } else {
      await swing(page, ms);
    }
    // Wait for the shot to finish.
    await expect
      .poll(async () => scene.getAttribute('data-golf-phase'), { timeout: 30_000 })
      .not.toBe('swing');
    if ((await scene.getAttribute('data-golf-stage')) === 'card') return;
  }
  throw new Error('The round never ended');
}

test('play three holes at the golf course: the scorecard, and the green fee is paid', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tiger Ade',
    handle: `tiger_${letters(6)}`,
    company: `Fairway ${letters(5)}`,
    idea: 'Tee times for golf clubs',
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  // The course is on the map, with its own label.
  await expect(page.locator('[data-place="golf"]').first()).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, '[data-place="golf"]', 'cycle');
  const scene = page.locator('.golf-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  await expect(scene).toHaveAttribute('data-room', 'golf');
  const pocket = scene.locator('[data-pocket]');
  const before = Number(await pocket.getAttribute('data-pocket'));
  await expect(scene.locator('[data-golf-intro]')).toContainText('Par');
  await scene.locator('[data-action="golf-start"]').click();
  await expect(scene).toHaveAttribute('data-golf-stage', 'play');
  // The course fills the screen; the clubs, the meter and the swing button sit over it.
  await expect(scene).toHaveClass(/is-play/);
  await expect(scene.locator('.golf-view .golf-tray .golf-clubs')).toBeVisible();
  await expect(scene.locator('.golf-view .golf-meter [data-golf-need]')).toBeAttached();
  await playRound(page);
  const card = scene.locator('[data-golf-scorecard]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-golf-total]')).toHaveText(/\d+/);
  // One score a hole (three holes) and the total.
  await expect(card.locator('tr.you td')).toHaveCount(4);
  await expect(card.locator('[data-golf-result="ok"]')).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('Green fee');
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(before);
  // The camera: a picture of the round to save or share.
  await card.locator('[data-action="golf-photo"]').click();
  const photo = page.getByRole('dialog', { name: 'Your round' });
  await expect(photo.locator('img.home-photo-big')).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(photo.locator('[data-action="save-photo"]')).toBeVisible();
  await photo.getByRole('button', { name: 'Close' }).first().click();
  await expect(photo).toBeHidden();
  await card.locator('[data-action="golf-done"]').click();
  await expect(scene).toBeHidden();
});
