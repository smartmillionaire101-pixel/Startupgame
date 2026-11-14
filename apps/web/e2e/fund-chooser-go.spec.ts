import { expect, letters, openMoney, playAsGuest, setupFounder, test, tab } from './fixtures';

/**
 * Player feedback: "Pitch an angel" on Fund your company switched to the
 * Fundraising tab but left you at the bottom of the page, with the angels
 * folded away among other investors. It now opens the list of investors in
 * view, the angels first; "Pitch a fund" puts the funds first.
 */
test('Pitch an angel opens the investors, angels first and in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Angel ${n}`,
    handle: `angel_${n}`,
    company: `Seedling ${letters(5)}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();
  await openMoney(page);
  await page.getByRole('tab', { name: 'Fund your company' }).click();
  const angel = page.locator('[data-option="angel"] .fund-go');
  await angel.scrollIntoViewIfNeeded();
  test.skip(await angel.isDisabled(), 'No AI angels are investing in this city right now.');
  await angel.click();
  await expect(page.getByRole('tab', { name: 'Fundraising', selected: true })).toBeVisible();
  const first = page.locator('[data-fund-row]').first();
  await expect(first).toHaveAttribute('data-fund-row', 'angel');
  await expect(first).toBeInViewport();

  // "Pitch a fund": the funds first.
  await page.getByRole('tab', { name: 'Fund your company' }).click();
  const vc = page.locator('[data-option="vc"] .fund-go');
  await vc.scrollIntoViewIfNeeded();
  if (!(await vc.isDisabled())) {
    await vc.click();
    await expect(page.locator('[data-fund-row]').first()).toHaveAttribute('data-fund-row', 'fund');
  }
});
