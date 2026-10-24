import { expect, letters, playAsGuest, setupFounder, setupPlayer, tab, test } from './fixtures';

/**
 * Today per role, and "What to do now" by time of day (player feedback:
 * "Today shows start a company. Should be to start a bank." and "What to do
 * is always clubbing; it should be a proper experience and based on time of
 * day").
 */
test.use({ viewport: { width: 390, height: 844 } });

test('a new banker’s Today starts their bank, not a company', async ({ page }) => {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Tobi E2E',
    handle: `tobi_${letters(6)}`,
    role: 'banker',
    backgroundId: 'b-commercial',
    market: 'accra',
    gender: 'male',
    bank: { name: `Volta Trust ${letters(5)}`, bankType: 'microfinance' },
  });
  await tab(page, 'Today').click();
  const start = page.locator('.banker-today');
  await expect(start.getByRole('heading', { name: /Start your bank/ })).toBeVisible({
    timeout: 15_000,
  });
  // Named; the shareholders' offers come next, on the Bank tab.
  await expect(start.locator('[data-stage="name"]')).toHaveClass(/done/);
  await expect(start.locator('[data-stage="shareholders"]')).toHaveAttribute(
    'aria-current',
    'step',
  );
  // Never the founder's "Start the company" form.
  await expect(page.getByRole('heading', { name: 'Start again' })).toHaveCount(0);
  await expect(page.getByText('Start the company')).toHaveCount(0);
  await page.locator('[data-step="negotiate"]').click();
  await expect(page.locator('[data-banker="negotiate"]')).toBeVisible({ timeout: 15_000 });
});

test('an investor’s Today shows their money and deals, not the founder form', async ({ page }) => {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Amani E2E',
    handle: `amani_${letters(6)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'nairobi',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await tab(page, 'Today').click();
  await expect(page.locator('.stat-label').filter({ hasText: 'Deployed' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Start again' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Start your bank/ })).toHaveCount(0);
});

test('"What to do now" suggests the morning in the morning', async ({ page }) => {
  // 07:00 UTC is 08:00 in Lagos: breakfast, the gym, cooking or the office, never a club.
  await page.clock.setFixedTime(new Date('2026-10-20T07:00:00Z'));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Bisi Morning',
    handle: `morning_${letters(8)}`,
    company: `Sunrise ${letters(6)}`,
    idea: 'Payments for market traders',
  });
  await tab(page, 'Today').click();
  const card = page.locator('section.card').filter({ hasText: 'What to do now' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  // The day at a glance, the morning marked now.
  await expect(card.locator('.whatnow-day > li')).toHaveCount(4);
  await expect(card.locator('.whatnow-day > li[aria-current]')).toHaveAttribute(
    'data-part',
    'morning',
  );
  await expect(card.getByText('Right now (morning):')).toBeVisible();
  const list = card.locator('.whatnow-list');
  await expect(list).toHaveAttribute('data-daypart', 'morning');
  const kinds = await list
    .locator('.whatnow-btn')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-suggestion')));
  expect(kinds.length).toBe(3);
  expect(kinds.some((k) => ['breakfast', 'gym', 'cook', 'work'].includes(k ?? ''))).toBe(true);
  expect(kinds).not.toContain('fun');
});
