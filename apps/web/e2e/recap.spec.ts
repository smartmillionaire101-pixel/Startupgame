/**
 * The month recap (Founder Journey 4b): a founder plays, a month passes and
 * "Your month" opens on its own, with personal and business money apart,
 * what's due next month and links to the details. It dismisses quickly and
 * opens again from Today.
 */
import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

test('a new month opens the recap with personal and business money, and it dismisses', async ({
  page,
}) => {
  // This spec is about the recap: let it open on its own.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.skipRecap', '0');
    } catch {
      /* storage blocked */
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Recap',
    handle: `recap_${letters(8)}`,
    company: `Recap ${letters(6)}`,
    idea: 'Bookkeeping for market traders',
  });

  // Play a little: build, then advance a month.
  await tab(page, 'Company').click();
  await page.getByRole('button', { name: 'Build yourself (40h)' }).click();
  await expect(page.getByText(/40h of building logged/)).toBeVisible();
  await tab(page, 'Today').click();
  // Nothing to recap on the first visit.
  const sheet = page.getByRole('dialog', { name: 'Your month' });
  await expect(sheet).toHaveCount(0);

  const settled = page.waitForResponse((r) => r.url().endsWith('/api/dev/settle'));
  await page.getByRole('button', { name: /Advance Lagos one month/ }).click();
  const res = await settled;
  expect(res.status(), await res.text()).toBe(200);

  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const personal = sheet.locator('[data-recap-section="personal"]');
  const business = sheet.locator('[data-recap-section="business"]');
  await expect(personal).toContainText('Your money (personal)');
  await expect(personal).toContainText('Money out');
  await expect(business).toContainText('Company money (business)');
  await expect(business).toContainText('Money in');
  // Next month's bills, with amounts: living costs for you, rent for the company.
  const tomorrow = sheet.locator('[data-recap-section="tomorrow"]');
  await expect(tomorrow.locator('[data-bill="living"]')).toContainText('₦');
  await expect(tomorrow.locator('[data-bill="rent"]')).toContainText('₦');
  await expect(sheet.getByRole('button', { name: 'See details' }).first()).toBeVisible();

  // Quick dismiss.
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet).toBeHidden();

  // It stays dismissed after a reload (the month is remembered)…
  await page.reload();
  await tab(page, 'Today').click();
  await expect(page.locator('[data-recap-open]')).toBeVisible({ timeout: 20_000 });
  await expect(sheet).toHaveCount(0);
  // …and opens again any time from Today.
  await page.locator('[data-recap-open]').click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});
