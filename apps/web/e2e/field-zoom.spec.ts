import { expect, pickLook, pickPath, test } from './fixtures';

/**
 * On a phone, a field whose text is under 16 px makes the browser zoom the
 * page in when you tap it, and the screen slides about (player: "the screen
 * keeps moving when you do certain things like open chat"). Every field on a
 * touch screen stays at 16 px or more.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('on a touch screen no field is small enough to zoom the page', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await pickPath(page, 'founder');
  await pickLook(page);
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  const sizes = await page
    .locator('input:visible, select:visible, textarea:visible')
    .evaluateAll((els) =>
      els.map((e) => ({
        field: e.getAttribute('aria-label') ?? e.id ?? e.tagName,
        px: parseFloat(getComputedStyle(e).fontSize),
      })),
    );
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((s) => s.px < 16)).toEqual([]);
});
