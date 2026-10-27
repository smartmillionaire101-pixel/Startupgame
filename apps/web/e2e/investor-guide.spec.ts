import { setupPlayer } from './fixtures';
import { expect, letters, playAsGuest, tab, test } from './fixtures';

/**
 * The investor guide (player feedback: bring the banker's guidance to
 * investors): the stage tracker with its checklist and a senior partner's
 * rules at the top of the Portfolio, a first call scored against the
 * company's real numbers (best call and why), and a live warning when a
 * cheque is too big a share of your money.
 */
test('an investor sees the stage tracker, a scored first call and a cheque-size warning', async ({
  page,
}) => {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Ola E2E',
    handle: `ola_${letters(6)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'lagos',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await tab(page, 'Portfolio').click();

  // The stage tracker: angel first, with its checklist and the mentor's rules.
  const stage = page.locator('[data-investor-stage="angel"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByText(/To make your first investment: \d of 3 done/)).toBeVisible();
  await expect(stage.locator('[data-guide-item="first-call"]')).toBeVisible();
  await expect(stage.locator('[data-mentor]')).toContainText('senior partner');

  // The first session: a startup from the café, then a first call that is a decision.
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('[data-pick]').first().getByRole('button', { name: 'Shortlist' }).click();
  const ask = page.locator('[data-first-call-ask]');
  await expect(ask.getByText('What do you ask first?')).toBeVisible();
  await ask.getByRole('button', { name: 'How fast are you growing?' }).click();

  // The scored result: your call, the best call and why, in the company's numbers.
  const scored = page.locator('.career-tutorial [data-decision="first-call"]');
  await expect(scored).toBeVisible();
  await expect(scored).toContainText(/Best call|Defensible|Missed/);
  await expect(scored).toContainText('Your call: How fast are you growing?');
  await expect(scored).toContainText('💡');
  // The checklist moved on: the first call is done.
  await expect(page.locator('[data-guide-item="first-call"]')).toHaveClass(/done/);

  // A cheque far over a tenth of your money: a live warning with a smaller one offered.
  await page.getByRole('button', { name: 'Deal offers' }).click();
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByLabel(/^Amount/).fill('900000000');
  const check = page.locator('[data-cheque-check="bad"]');
  await expect(check.getByText('Too big a cheque')).toBeVisible();
  await expect(check.getByText(/This cheque is .* of your money: keep under 10%\./)).toBeVisible();
  await expect(check.getByRole('button', { name: /^Invest .*\(\d+%\)$/ })).toBeVisible();
  await expect(check.getByRole('button', { name: 'Invest anyway' })).toBeVisible();
  // A cheque inside the guide clears the warning.
  await page.getByLabel(/^Amount/).fill('1000');
  await expect(page.locator('[data-cheque-check="good"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send term sheet (2h)' })).toBeVisible();
});
