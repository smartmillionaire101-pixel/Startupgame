import { setupPlayer, hudMore } from './fixtures';
import { expect, letters, playAsGuest, tab, test } from './fixtures';

/**
 * The investor career's main path (blueprint Phase 1–2, Appendix A): a new
 * investor goes through the first session to a real position, sees the
 * career ladder, puts money in the city index fund, and the map's Journey
 * button guides them on like a founder's.
 */
test('a new investor makes a first cheque in the first session, sees the ladder and buys the index', async ({
  page,
}) => {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Amara E2E',
    handle: `amara_${letters(6)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'lagos',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await tab(page, 'Portfolio').click();

  // Step 2: what you can invest (savings less six months of living costs).
  await expect(page.getByText(/First session · step 2 of 7/)).toBeVisible();
  await expect(page.locator('[data-investable]')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  // The café's three startups: shortlist one, a first call, a small SAFE.
  await page.locator('[data-pick]').first().getByRole('button', { name: 'Shortlist' }).click();
  await page.getByRole('button', { name: 'How fast are you growing?' }).click();
  await page.getByRole('button', { name: 'Send the SAFE (2h)' }).click();
  await expect(page.getByText(/Accepted. You’re in./)).toBeVisible();

  // The portfolio, then the ladder: the next rung is pinned.
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('[data-rung="syndicate"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Pin my next rung' }).click();
  await expect(page.getByText(/First session · step/)).toHaveCount(0);
  await expect(page.getByText('Your investor career')).toBeVisible();

  // The city exchange: buy the index fund.
  await page.getByRole('radio', { name: 'Markets' }).click();
  await expect(page.getByText('City index fund')).toBeVisible();
  await page.getByLabel('Amount for the index fund').fill('500000');
  await page.getByRole('button', { name: 'Buy the index' }).click();
  await expect(page.getByText(/of the index fund\./)).toBeVisible();

  // The investor journey: the map's Journey button follows the investor's chapter,
  // and its sheet says what to do next (back more startups) with a Go button.
  await tab(page, 'City').click();
  await hudMore(page);
  const chip = page.getByTestId('journey-chip');
  await expect(chip).toHaveAttribute('aria-label', /The First Cheque/);
  await chip.click();
  await expect(page.getByText('Back 3 startups').first()).toBeVisible();
});
