import {
  expect,
  letters,
  playAsGuest,
  salesConversation,
  setupFounder,
  tab,
  test,
  type Page,
} from './fixtures';

/**
 * Customers you can see (round 3 player feedback from a London founder: "I
 * have about six paying customers now but their monies are not counted, and
 * I can't see how to track my customers, and I don't know how it calculates
 * that I have only 3 customers"; and "I have no idea how to remove my
 * company from hibernation").
 *
 * A founder signs a deal through the Sales pipeline, a month passes, and the
 * customer's payment is in that month's revenue; the customer is listed in
 * Company → Customers, and the same count shows on Today and the Company
 * screen. A company put to sleep says so, offers to wake from a refused
 * hire, and wakes with one tap so hiring works again.
 *
 * CUSTOMERS_SHOTS=<dir> saves phone-size screenshots.
 */

const SHOTS = process.env.CUSTOMERS_SHOTS;

/** A screenshot with no toast over it. */
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the e2e reads the view loosely
const state = (page: Page): Promise<any> =>
  page.request.get('/api/state').then((r) => r.json().then((j) => j.view));

async function command(page: Page, cmd: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: cmd },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).result;
}

async function settle(page: Page, market: string) {
  const r = await page.request.post('/api/dev/settle', {
    headers: { 'x-runway': '1' },
    data: { market },
  });
  expect(r.status(), await r.text()).toBe(200);
}

async function openSales(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="sales"]').click();
  await expect(phone.locator('[data-phone-app="sales"]')).toBeVisible();
  return phone;
}

/** Work leads in the Sales app until one signs (a paying customer). */
async function signADeal(page: Page) {
  const phone = await openSales(page);
  const sales = phone.locator('[data-sales]');
  const step = async (deal: ReturnType<typeof sales.locator>, action: string) => {
    const before = await deal.getAttribute('data-deal-stage');
    await deal.locator(`button[data-action="${action}"]`).click();
    const confirm = deal.locator(`[data-confirm="${action}"]`);
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Confirm' }).click();
    await expect(confirm).toBeHidden();
    await expect(deal).not.toHaveAttribute('data-deal-stage', before ?? '', { timeout: 20_000 });
  };
  for (let round = 0; round < 3; round++) {
    await sales.getByRole('button', { name: 'Find new leads' }).click();
    await expect(sales.locator('[data-deal-stage="lead"]').first()).toBeVisible();
    const ids = await sales
      .locator('[data-deal-stage="lead"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-deal')!));
    for (const id of ids) {
      const deal = sales.locator(`[data-deal="${id}"]`);
      await step(deal, 'contact');
      await step(deal, 'discover');
      await step(deal, 'demo');
      await salesConversation(page, deal);
      if ((await deal.getAttribute('data-deal-stage')) === 'lost') {
        await step(deal, 'recover');
        await salesConversation(page, deal);
      }
      if ((await deal.getAttribute('data-deal-stage')) === 'won') {
        // The pipeline's customer list says how they pay, and leads to every customer.
        await expect(
          sales.getByText('They pay every month end, straight into the company account.'),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(phone).toBeHidden();
        return;
      }
    }
    // Out of leads for the month: a new month brings more.
    await settle(page, (await state(page)).market.id);
  }
  throw new Error('never signed a deal');
}

test('a signed customer’s payment counts in revenue, and every screen shows the same count', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `cu_${letters(8)}`;
  await setupFounder(page, {
    name: 'Lena Customers',
    handle,
    company: `Ledger ${handle.slice(3)}`,
    idea: 'Payments for market traders',
    market: /London/,
  });
  await signADeal(page);
  const before = (await state(page)).companies[0];
  const account = before.salesAccounts?.[0] ?? before.sales.accounts[0];
  expect(account).toBeTruthy();
  const monthly: number = account.monthly;
  const total: number = before.customerBook.total;

  // A month passes: the signed customer pays at the month end.
  await settle(page, before.market);
  const after = (await state(page)).companies[0];
  const pnl = after.finance.history.at(-1);
  expect(pnl.signedRevenue).toBe(monthly);
  expect(pnl.revenue).toBeGreaterThanOrEqual(monthly);
  await page.reload();

  // Today: the one count, and the way to the list.
  await tab(page, 'Today').click();
  const n = after.customerBook.total;
  expect(n).toBeGreaterThanOrEqual(total);
  const todayCount = page.locator('[data-customer-count]').first();
  await expect(todayCount).toHaveAttribute('data-customer-count', String(n));

  // The Company screen shows the same number, and the link opens the Customers view.
  await tab(page, 'Company').click();
  const companyCount = page.locator('[data-customer-count]').first();
  await expect(companyCount).toHaveAttribute('data-customer-count', String(n));
  await companyCount.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await shot(page, 'company-screen-customer-count');
  await companyCount.click();
  await expect(page.getByRole('tab', { name: 'Customers' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const book = page.locator('[data-customer-book]');
  await expect(book).toBeVisible();
  await expect(book.locator('[data-kpi="customers"]')).toHaveText(String(n));
  // The signed customer is listed, with what it pays and what it has paid.
  const row = book.locator('[data-customer-row="signed"]').filter({ hasText: account.name });
  await expect(row).toBeVisible();
  await expect(row.locator('[data-customer-monthly]')).toHaveAttribute(
    'data-customer-monthly',
    String(monthly),
  );
  await expect(row.locator('[data-customer-paid]')).toHaveAttribute(
    'data-customer-paid',
    String(monthly),
  );
  await expect(row.getByText('Active')).toBeVisible();
  // Last month's revenue counts it, and says where it came from.
  await expect(book.locator('[data-kpi="signed-revenue"]')).toBeVisible();
  await expect(book.locator('[data-revenue="signed"]')).toBeVisible();
  await book.locator('[data-customer-row="signed"]').first().scrollIntoViewIfNeeded();
  await shot(page, 'customers-view');
  await book.locator('[data-customer-month]').scrollIntoViewIfNeeded();
  await book.getByText('How this is calculated').click();
  await expect(book.getByText(/Signed customers pay their agreed monthly price/)).toBeVisible();
  await shot(page, 'customers-month-revenue-signed');
});

test('a hibernating company says so, offers to wake from a refused hire, and wakes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Wes Sleep',
    handle: `hb_${letters(8)}`,
    company: `Dozy ${letters(5)}`,
    idea: 'Payroll for small shops',
    market: /London/,
  });
  const c = (await state(page)).companies[0];
  await command(page, { type: 'company.hibernate', companyId: c.id, on: true });
  await page.reload();
  await tab(page, 'Company').click();
  const banner = page.locator('[data-hibernation]');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('heading', { name: 'Your company is hibernating' })).toBeVisible();
  await expect(banner.getByText(/No new deals, no hiring and no marketing/)).toBeVisible();
  await shot(page, 'hibernation-before-banner');

  // Hiring is refused, and the refusal offers to wake the company there and then.
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByRole('button', { name: /^Post the job \(/ }).click();
  const refused = page.locator('.toast').filter({ hasText: 'hibernates' });
  await expect(refused).toBeVisible();
  await expect(refused.locator('[data-toast-action]')).toHaveText('Wake up the company');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/hibernation-hire-refused-wake-action.png` });

  // Wake it from the banner.
  await page.locator('[data-hibernation]').scrollIntoViewIfNeeded();
  await page.locator('[data-wake]').click();
  await expect(page.getByText(/is awake: full pay and growth restart/)).toBeVisible();
  await expect(page.locator('[data-hibernation]')).toHaveCount(0);
  expect((await state(page)).companies[0].hibernating).toBe(false);
  await shot(page, 'hibernation-after-awake');

  // Hiring works again.
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByRole('button', { name: /^Post the job \(/ }).click();
  await expect(page.getByText('Job posted. Now find candidates for it.')).toBeVisible();

  // And it can be put to sleep on purpose, behind a confirmation.
  await page.getByRole('tab', { name: 'Product' }).click();
  const fold = page.locator('[data-fold="hibernate"]');
  await fold.locator('summary').click();
  await fold.getByRole('button', { name: 'Hibernate the company' }).click();
  await fold.getByRole('button', { name: /^Yes, hibernate/ }).click();
  await expect(page.locator('[data-hibernation]')).toBeVisible();
});
