import { devices, type Locator, type Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test, withoutNetlifyDrawer } from './fixtures';

/**
 * The bank statement and receipts, as two players see them: A sends B money
 * with a note; A's statement shows the amount and the fee going out with the
 * running balance after each, B's shows the amount coming in, and each
 * receipt carries the reference, the parties, the fee, the note and the
 * balance after.
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

const SHOTS = process.env.BANK_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** As the app writes amounts, to the naira: ₦11,424,950 (kobo rounded off). */
const naira = (minor: number) => `₦${Math.round(minor / 100).toLocaleString('en-GB')}`;

async function founder(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `bs_${letters(8)}`;
  await setupFounder(page, {
    name,
    handle,
    company: `Kin ${handle.slice(3)}`,
    idea: 'Payments for market traders',
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function bank(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="bank"]').click();
  await expect(phone.locator('[data-phone-app="bank"]')).toBeVisible();
  return phone;
}

async function statement(phone: Locator) {
  await phone.locator('[data-open-statement]').click();
  const s = phone.locator('[data-statement]');
  await expect(s).toBeVisible();
  await expect(s).not.toHaveAttribute('data-loading', /.*/, { timeout: 10_000 });
  return s;
}

const row = (receipt: Locator, label: string) =>
  receipt.locator('.bank-row').filter({ has: receipt.page().getByText(label, { exact: true }) });

test('bank statement: both players see the transfer, running balances and detailed receipts', async ({
  page: a,
  browser,
}) => {
  test.slow();
  await a.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const { defaultBrowserType: _, ...device } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({ ...device, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  const aName = `Ada${tag} Payer`;
  const bName = `Bola${tag} Payee`;
  await founder(a, aName);
  await founder(b, bName);
  const bId = (await state(b)).me.id;
  const a0 = (await state(a)).accounts.local.balance;
  const b0 = (await state(b)).accounts.local.balance;
  await a.reload();
  await expect(a.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });

  // A sends ₦5,000 with a note.
  const aPhone = await bank(a);
  await aPhone.locator('[data-send-money]').click();
  const flow = aPhone.locator('[data-send-step]');
  await flow.locator(`[data-friend="${bId}"]`).click();
  await flow.getByLabel('Amount', { exact: true }).fill('5000');
  await flow.getByLabel('Note', { exact: true }).fill('Suya on me');
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: /^Send / }).click();
  await expect(flow.locator('[data-sent]')).toBeVisible({ timeout: 10_000 });
  const a1 = (await state(a)).accounts.local.balance;
  const fee = a0 - a1 - 500_000;
  expect(fee).toBeGreaterThan(0);

  // A's statement: the fee and the transfer out, newest first, with the balance after each.
  const sa = await statement(aPhone);
  await expect(sa.locator('[data-statement-balance]')).toHaveText(naira(a1));
  const aLines = sa.locator('[data-tx-line]');
  const aFee = aLines.nth(0);
  const aSent = aLines.nth(1);
  await expect(aFee).toHaveAttribute('data-dir', 'out');
  await expect(aFee.locator('[data-amount]')).toHaveText(`−${naira(fee)}`);
  await expect(aFee.locator('[data-balance-after]')).toHaveText(naira(a1));
  await expect(aSent).toHaveAttribute('data-dir', 'out');
  await expect(aSent).toContainText(bName);
  await expect(aSent).toContainText('Suya on me');
  await expect(aSent.locator('[data-amount]')).toHaveText(`−${naira(500_000)}`);
  await expect(aSent.locator('[data-balance-after]')).toHaveText(naira(a0 - 500_000));
  const ref = await aSent.getAttribute('data-ref');
  expect(ref).toMatch(/^TX\d{8}$/);
  await expect(aFee).toHaveAttribute('data-ref', ref!);
  await shot(a, 'statement-sender');

  // Filters: money in hides the transfer; search finds it by the friend's name.
  await sa.locator('[data-dir-filter="in"]').click();
  await expect(sa).not.toHaveAttribute('data-loading', /.*/);
  await expect(sa.locator(`[data-tx-line][data-ref="${ref}"]`)).toHaveCount(0);
  await expect(sa.locator('[data-tx-line][data-dir="out"]')).toHaveCount(0);
  await sa.locator('[data-dir-filter="out"]').click();
  await expect(sa.locator(`[data-tx-line][data-ref="${ref}"]`)).toHaveCount(2);
  await sa.locator('[data-dir-filter="all"]').click();
  await sa.getByLabel('Search transactions').fill(`Bola${tag}`);
  await expect(sa.locator('[data-tx-line]')).toHaveCount(1);
  await expect(sa.locator('[data-total-out]')).toHaveText(`−${naira(500_000)}`);
  await expect(sa.locator('[data-total-in]')).toHaveText(`+${naira(0)}`);
  await shot(a, 'statement-search');

  // A's receipt: everything about the transaction.
  await sa.locator(`[data-tx-line][data-ref="${ref}"][data-dir="out"]`).last().click();
  const ra = aPhone.locator(`[data-receipt="${ref}"]`);
  await expect(ra).toBeVisible();
  await expect(ra.locator('[data-receipt-amount]')).toHaveText(`−${naira(500_000 + fee)}`);
  await expect(ra.locator('[data-receipt-status]')).toContainText('Completed');
  await expect(row(ra, 'Reference')).toContainText(ref!);
  await expect(row(ra, 'Type')).toContainText('Transfer');
  await expect(row(ra, 'From')).toContainText('You');
  await expect(row(ra, 'To')).toContainText(bName);
  await expect(row(ra, 'Amount')).toContainText(naira(500_000));
  await expect(row(ra, 'Fee')).toContainText(naira(fee));
  await expect(row(ra, 'Total debited')).toContainText(`−${naira(500_000 + fee)}`);
  await expect(row(ra, 'Note')).toContainText('Suya on me');
  await expect(row(ra, 'Balance after')).toContainText(naira(a1));
  await expect(row(ra, 'Date and time')).not.toContainText('Month');
  await ra.locator('[data-share-receipt]').click();
  await expect(ra.locator('[data-share-receipt]')).toHaveText('Copied');
  await shot(a, 'receipt-sender');

  // B's side: the money in, from A, with the note; the receipt has no fee.
  const b1 = (await state(b)).accounts.local.balance;
  expect(b1 - b0).toBe(500_000);
  await b.reload();
  await expect(b.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  const bPhone = await bank(b);
  // The Bank app's first screen lists it too.
  await expect(bPhone.locator(`[data-tx-line][data-ref="${ref}"]`)).toHaveAttribute(
    'data-dir',
    'in',
  );
  const sb = await statement(bPhone);
  const bIn = sb.locator(`[data-tx-line][data-ref="${ref}"]`);
  await expect(bIn).toHaveCount(1);
  await expect(bIn).toHaveAttribute('data-dir', 'in');
  await expect(bIn).toContainText(aName);
  await expect(bIn).toContainText('Suya on me');
  await expect(bIn.locator('[data-amount]')).toHaveText(`+${naira(500_000)}`);
  await expect(bIn.locator('[data-balance-after]')).toHaveText(naira(b1));
  await shot(b, 'statement-receiver');
  await bIn.click();
  const rb = bPhone.locator(`[data-receipt="${ref}"]`);
  await expect(rb.locator('[data-receipt-amount]')).toHaveText(`+${naira(500_000)}`);
  await expect(row(rb, 'From')).toContainText(aName);
  await expect(row(rb, 'To')).toContainText('You');
  await expect(row(rb, 'Fee')).toContainText(naira(0));
  await expect(row(rb, 'Total credited')).toContainText(`+${naira(500_000)}`);
  await expect(row(rb, 'Note')).toContainText('Suya on me');
  await expect(row(rb, 'Balance after')).toContainText(naira(b1));
  await shot(b, 'receipt-receiver');
});
