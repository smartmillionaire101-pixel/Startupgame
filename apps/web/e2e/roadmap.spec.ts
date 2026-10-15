import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

/**
 * The product roadmap (§6.3, FR-006): add a feature, build it over a month,
 * release it. In Dubai, which no other spec advances: the month it waits for
 * is its own, and it can't land in another spec's checks.
 */
test('a founder adds a feature to the roadmap, it progresses over a month, and ships', async ({
  page,
}) => {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Rhoda E2E',
    handle: `rhoda_${letters(6)}`,
    company: `Road Pay ${letters(5)}`,
    idea: 'Payments for market traders',
    market: /Dubai, United Arab Emirates/,
  });
  await expect(tab(page, 'Today')).toBeVisible();

  // The roadmap tab, empty at first.
  await tab(page, 'Company').click();
  await page.getByRole('tab', { name: 'Roadmap' }).click();
  await expect(page.getByRole('heading', { name: 'Product roadmap' })).toBeVisible();
  await expect(page.getByText('Add a feature to start.')).toBeVisible();

  // Pick two features from the catalogue: a bug bash (free) and the onboarding flow.
  await page.getByRole('button', { name: 'Add a feature' }).click();
  let sheet = page.getByRole('dialog', { name: 'Add a feature' });
  await expect(sheet.getByText('Analytics dashboard')).toBeVisible();
  await sheet.getByRole('button', { name: 'Add Bug bash to roadmap' }).click();
  await expect(page.getByText('Bug bash added to your roadmap.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a feature' }).click();
  sheet = page.getByRole('dialog', { name: 'Add a feature' });
  await sheet.getByRole('button', { name: 'Add Onboarding flow to roadmap' }).click();
  await expect(page.getByText('Onboarding flow added to your roadmap.')).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Bug bash progress' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await expect(page.getByText(/No one is building yet/).first()).toBeVisible();

  // Build for 120 hours this month: the roadmap gets most of it.
  await page.getByRole('tab', { name: 'Product' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Build yourself (40h)' }).click();
    await expect(page.getByText(/40h of building logged/).first()).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Roadmap' }).click();
  await expect(page.getByText(/This month: about [\d.]+ person-weeks of work/)).toBeVisible();
  await expect(page.getByText(/About 1 month left/).first()).toBeVisible();

  // A month passes (dev tools).
  await tab(page, 'Today').click();
  const settled = page.waitForResponse((r) => r.url().endsWith('/api/dev/settle'));
  await page.getByRole('button', { name: /Advance Dubai one month/ }).click();
  expect((await settled).status()).toBe(200);

  // The bug bash is finished; release it.
  await tab(page, 'Company').click();
  await page.getByRole('tab', { name: 'Roadmap' }).click();
  await expect(page.getByRole('meter', { name: 'Bug bash progress' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await expect(page.getByText(/2 of 2 person-weeks · Ready to release/)).toBeVisible();
  await page.getByRole('button', { name: 'Release Bug bash' }).click();
  const party = page.getByRole('status').filter({ hasText: 'Bug bash is live!' });
  await expect(party).toBeVisible();
  await party.getByRole('button', { name: 'Nice' }).click();
  await expect(party).toHaveCount(0);
  const shipped = page.locator('section.card').filter({
    has: page.getByRole('heading', { name: 'Shipped' }),
  });
  await expect(shipped.getByText('Bug bash')).toBeVisible();
  await expect(shipped.getByText(/Shipped clean|Shipped with/)).toBeVisible();
});
