import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

/**
 * Round 7, item 1: deploy previews run with dev tools on (e2e and testers use
 * the dev API), but the Dev tools card on Today stays hidden for players
 * unless the URL asks for it with ?dev=1. The flag lasts for the tab's
 * session; ?dev=0 hides it again. The dev API itself keeps working.
 */
test('the Dev tools card shows only with ?dev=1', async ({ page }) => {
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Dev E2E',
    handle: `dev_${tag}`,
    company: `Dev Flag ${tag}`,
    idea: 'Payments for market traders',
  });
  const card = page.locator('section.card').filter({ hasText: /^Dev tools/ });
  await tab(page, 'Today').click();
  await expect(page.getByRole('heading', { name: /today$/ }).first()).toBeVisible();
  await expect(card).toHaveCount(0);

  // The dev API is still on.
  const meta = await page.request.get('/api/meta').then((r) => r.json());
  expect(meta.devTools).toBe(true);

  await page.goto('/?dev=1');
  await tab(page, 'Today').click();
  await expect(card).toBeVisible();
  // Kept for the session, without the query.
  await page.goto('/');
  await tab(page, 'Today').click();
  await expect(card).toBeVisible();
  await page.goto('/?dev=0');
  await tab(page, 'Today').click();
  await expect(page.getByRole('heading', { name: /today$/ }).first()).toBeVisible();
  await expect(card).toHaveCount(0);
});
