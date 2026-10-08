import { devices, type Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Sending money to a friend, as the players see it: the sender's balance on
 * screen drops by the amount and the fee, and the friend sees the money on
 * their next look (a reload here; the poll in a real session).
 */

interface State {
  me: { id: string };
  accounts: { local: { balance: number } };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view as State;
  });

async function founder(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `sm_${letters(8)}`;
  await setupFounder(page, {
    name,
    handle,
    company: `Kin ${handle.slice(3)}`,
    idea: 'Payments for market traders',
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function wallet(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="bank"]').click();
  await expect(phone.locator('[data-phone-app="bank"]')).toBeVisible();
  return phone;
}

/** The balance the wallet shows, in naira (the exact figure, e.g. "₦11,430,000"). */
const shown = async (phone: ReturnType<Page['getByRole']>) =>
  Number(
    (await phone.locator('[data-balance]').innerText()).replace(/[^\d.]/g, '').replace(/\.$/, ''),
  );

test('send money: the sender sees the debit and the friend sees the credit', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  await founder(a, `Ada${tag} Sender`);
  await founder(b, `Bola${tag} Friend`);
  const bId = (await state(b)).me.id;
  const a0 = (await state(a)).accounts.local.balance;
  const b0 = (await state(b)).accounts.local.balance;
  // The friend joined after A's page loaded: A's next look lists them.
  await a.reload();
  await expect(a.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });

  // B opens the wallet first and keeps it open: the money must show up there.
  const bWallet = await wallet(b);
  expect(await shown(bWallet)).toBe(b0 / 100);

  const aWallet = await wallet(a);
  expect(await shown(aWallet)).toBe(a0 / 100);
  await aWallet.locator('[data-send-money]').click();
  const flow = aWallet.locator('[data-send-step]');
  await flow.locator(`[data-friend="${bId}"]`).click();
  await flow.getByLabel('Amount', { exact: true }).fill('5000');
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: /^Send / }).click();
  await expect(flow.locator('[data-sent]')).toBeVisible({ timeout: 10_000 });

  // The ledger moved: amount + fee out of A, the amount into B.
  const a1 = (await state(a)).accounts.local.balance;
  const b1 = (await state(b)).accounts.local.balance;
  expect(b1 - b0).toBe(500_000);
  expect(a0 - a1).toBeGreaterThan(500_000);

  // A sees it at once: the confirmation and the wallet show the new balance.
  await expect(flow.locator('[data-sent]')).toContainText(`₦${(a1 / 100).toLocaleString('en-GB')}`);
  await expect.poll(() => shown(aWallet)).toBe(a1 / 100);
  // The pocket in the top bar stays short (₦11.4m) but carries the exact figure.
  await expect(a.locator('.topbar-cash')).toHaveAttribute(
    'title',
    `₦${(a1 / 100).toLocaleString('en-GB')}`,
  );

  // B sees it on the next look at the game (the poll; a reload here).
  await b.reload();
  await expect(b.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  expect(await shown(await wallet(b))).toBe(b1 / 100);
  await expect(b.locator('.topbar-cash')).toHaveAttribute(
    'title',
    `₦${(b1 / 100).toLocaleString('en-GB')}`,
  );
});
