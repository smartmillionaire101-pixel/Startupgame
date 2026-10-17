import { devices } from '@playwright/test';
import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  setupPlayer,
  tab,
  test,
  withoutNetlifyDrawer,
  type Page,
} from './fixtures';

/**
 * Chapter 3 (§2.1, §6.6, FR-013): a founder compares funding options, opens a
 * Friends & Family round, another player backs it from their Today screen,
 * and the founder closes it: the cash arrives and the cap table shows the SAFE.
 */

/** The founder's company cash, from the server's view of them. */
const cash = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view.companies[0].cash as number;
  });

test('a founder opens a Friends & Family round, a friend commits, the founder closes', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const tag = letters(5);
  await playAsGuest(a);
  await setupFounder(a, {
    name: 'Femi E2E',
    handle: `femi_${tag}`,
    company: `Kin Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(a, 'Today')).toBeVisible();

  // The funding chooser: every option side by side, with plain trade-offs.
  await tab(a, 'Money').click();
  await a.getByRole('tab', { name: 'Fund your company' }).click();
  const chooser = a.locator('section.card').filter({
    has: a.getByRole('heading', { name: /Fund your company/ }),
  });
  for (const option of [
    'bootstrap',
    'ff',
    'angel',
    'loan',
    'grant',
    'accelerator',
    'competition',
    'vc',
  ])
    await expect(chooser.locator(`[data-option="${option}"]`)).toBeVisible();
  await expect(chooser.getByText('No dilution, no interest')).toBeVisible();

  // Open a round: ₦2m target at a ₦50m cap, 20% discount.
  await a.getByLabel('Target (NGN)').fill('2m');
  await a.getByLabel('Valuation cap (NGN)').fill('50m');
  await a.getByRole('button', { name: 'Open the round' }).click();
  await expect(a.getByText('Your Friends & Family round is open.')).toBeVisible();
  await expect(a.getByText(/₦0 of ₦2(\.0)?m committed/)).toBeVisible();

  // A second player (an investor) backs it from Today.
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const ctxB = await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL });
  const b = await ctxB.newPage();
  await withoutNetlifyDrawer(b);
  await playAsGuest(b);
  const bName = `Tola${tag}`;
  await setupPlayer(b, {
    type: 'player.quickStart',
    username: `tola_${tag}`,
    role: 'investor',
    name: bName,
    market: 'lagos',
  });
  await expect(tab(b, 'Today')).toBeVisible({ timeout: 30_000 });
  await tab(b, 'Today').click();
  const back = b.locator('section.card').filter({
    has: b.getByRole('heading', { name: /Back a friend/ }),
  });
  await expect(back.getByText(`Kin Pay ${tag}`)).toBeVisible();
  await back.getByLabel(`Amount to commit to Kin Pay ${tag}`).fill('500k');
  await back.getByRole('button', { name: 'Commit' }).click();
  await expect(b.getByText('Committed. The money is held until the founder closes.')).toBeVisible();
  await expect(back.getByText(/You committed ₦500(\.0)?k/)).toBeVisible();
  await ctxB.close();

  // The founder sees the commitment and closes the round.
  await a.reload();
  await tab(a, 'Money').click();
  await a.getByRole('tab', { name: 'Fund your company' }).click();
  await expect(a.getByText(/₦500(\.0)?k of ₦2(\.0)?m committed/)).toBeVisible();
  await expect(a.locator('.ff-card').getByText(bName)).toBeVisible();
  const before = await cash(a);
  await a.getByRole('button', { name: 'Close the round' }).click();
  await a.getByRole('button', { name: /Close and take ₦500(\.0)?k/ }).click();
  await expect(a.getByText('Round closed. The money is in the company.')).toBeVisible();

  // Cash (exactly the commitment, once) and the cap table.
  await expect.poll(() => cash(a)).toBe(before + 500_000_00);
  await a.getByRole('tab', { name: 'Cap Table' }).click();
  await expect(
    a.getByText(new RegExp(`${bName}: ₦500(\\.0)?k at a ₦50(\\.0)?m cap`)),
  ).toBeVisible();
  await a.getByRole('tab', { name: 'Finance' }).click();
  await expect(a.getByLabel('Money lasts explainer')).toBeVisible();
  await expect(a.getByRole('heading', { name: 'Balance sheet' })).toBeVisible();
});
