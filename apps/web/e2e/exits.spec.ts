import { devices, type Browser } from '@playwright/test';
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
 * Founder Journey 5 (§2.1 chapters 6–7, §7.4, FR-022): a founder with a
 * Friends & Family SAFE sells part of their shares in a secondary and sees
 * realised wealth (cash received, tax paid) apart from shares still on paper.
 * An investor opens the Capital app and buys shares on the stock market.
 */

async function command(page: Page, cmd: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: cmd },
  });
  if (!r.ok()) throw new Error(`Command failed: ${await r.text()}`);
  return r.json();
}

async function state(page: Page) {
  const r = await page.request.get('/api/state', { headers: { 'x-runway': '1' } });
  return (await r.json()).view;
}

async function investor(browser: Browser, tag: string) {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await withoutNetlifyDrawer(page);
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.quickStart',
    username: `inv_${tag}`,
    role: 'investor',
    name: `Ike${tag}`,
    market: 'lagos',
  });
  await expect(tab(page, 'Today')).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

test('a founder sells a secondary and sees realised vs unrealised wealth', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const tag = letters(5);
  await playAsGuest(a);
  await setupFounder(a, {
    name: 'Sade Exit',
    handle: `sade_${tag}`,
    company: `Exit Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(a, 'Today')).toBeVisible();

  // A SAFE round sets a price for the shares: open, a friend backs it, close.
  const companyId = (await state(a)).companies[0].id as string;
  await command(a, {
    type: 'ff.open',
    companyId,
    target: 200_000_000,
    valuationCap: 5_000_000_000,
    discountPct: 20,
  });
  const roundId = ((await state(a)).friendsRounds as { id: string; companyId: string }[]).find(
    (r) => r.companyId === companyId,
  )!.id;
  const b = await investor(browser, tag);
  await command(b.page, { type: 'ff.commit', roundId, amount: 50_000_000 });
  await b.ctx.close();
  await command(a, { type: 'ff.close', roundId });
  await a.reload();

  // Exit options on the Money tab: the wealth card and the secondary sale.
  await tab(a, 'Money').click();
  await a.getByRole('tab', { name: 'Exit' }).click();
  const realised = a.locator('[data-wealth="realised"]').first();
  await expect(realised).toContainText('₦0 received');
  const secondary = a.locator(`[data-secondary="${companyId}"]`);
  await expect(secondary.getByText('Secondary sale')).toBeVisible();
  await expect(secondary.getByText('Into your personal account')).toBeVisible();
  await secondary.getByRole('button', { name: /^Sell 5% of your shares/ }).click();
  await expect(a.getByText('Sold. The money is in your account.')).toBeVisible();

  // Realised: cash received and tax paid. The rest of the shares are still on paper.
  await expect(realised).not.toContainText('₦0 received');
  const me = await state(a);
  expect(me.me.wealth.realised.proceeds).toBeGreaterThan(0);
  expect(me.me.wealth.realised.tax).toBeGreaterThan(0);
  expect(me.me.wealth.shares.private).toBeGreaterThan(0);
  expect(me.me.wealth.liquid).toBe(me.accounts.local.balance);
  await expect(a.locator('[data-wealth="shares"]').first()).not.toHaveText('₦0');
  await expect(a.getByText('Private: no buyer yet').first()).toBeVisible();
});

test('an investor buys shares on the stock market', async ({ page, browser }) => {
  test.slow();
  const tag = letters(5);
  await playAsGuest(page);
  const b = await investor(browser, tag);
  const p = b.page;
  await p.getByRole('button', { name: /^Phone/ }).click();
  const phone = p.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="capital"]').click();
  await expect(phone.locator('[data-phone-app="capital"]')).toBeVisible();
  // Not a founder: the hub opens on the stock market.
  await expect(phone.getByRole('heading', { name: /Stock market/ })).toBeVisible();
  const row = phone.locator('[data-listed]').first();
  await expect(row).toBeVisible();
  await row.getByLabel('Amount to invest').fill('100k');
  await row.getByRole('button', { name: /^Buy about/ }).click();
  await expect(p.getByText(/Bought [\d,]+ shares\./)).toBeVisible();
  await expect(row.locator('[data-holding]')).toContainText('You hold');
  const view = await state(p);
  const held = (view.capital.market as { yourShares: number }[]).filter((x) => x.yourShares > 0);
  expect(held.length).toBe(1);
  // Shares are wealth on paper, not cash.
  expect(view.me.wealth.shares.sellable).toBeGreaterThan(0);
  await b.ctx.close();
});
