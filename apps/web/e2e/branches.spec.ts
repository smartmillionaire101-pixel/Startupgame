import { expect, letters, playAsGuest, setupFounder, tab, test, type Page } from './fixtures';

/**
 * Branches you can run (round 4 player feedback from a London founder at
 * Series A: "I just opened my second branch but can't see anything on how to
 * get customers there or manage it in any way").
 *
 * A London founder opens a branch in Lagos from Company → Branches, gives it
 * a local marketing budget and hires a local sales rep; a month passes; the
 * branch has customers, revenue and a profit or loss in the Branches section,
 * its customers are in the Customers view with their city, "Sell in a second
 * city" is done, and Sales finds and shows leads from Lagos with a city filter.
 *
 * BRANCHES_SHOTS=<dir> saves phone-size screenshots.
 */

const SHOTS = process.env.BRANCHES_SHOTS;

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

/** Scroll something to the middle of the screen (clear of the bottom bar). */
const centre = (l: ReturnType<Page['locator']>) =>
  l.evaluate((e) => e.scrollIntoView({ block: 'center' }));

const companyTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

test('open a branch, give it a budget and a rep, and see its customers and revenue', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `br_${letters(8)}`;
  await setupFounder(page, {
    name: 'Lena Branches',
    handle,
    company: `Ledger ${handle.slice(3)}`,
    idea: 'Payments for market traders',
    market: /London/,
  });
  // Savings into the company, to pay for a fit-out in Lagos.
  const v0 = await state(page);
  const c0 = v0.companies[0];
  const savings: number = v0.accounts.local.balance;
  await command(page, {
    type: 'company.inject',
    companyId: c0.id,
    amount: Math.max(0, savings - 50_000),
  });
  await page.reload();

  // Company → Branches: nothing yet, and how to get going.
  await tab(page, 'Company').click();
  await companyTab(page, 'Branches').click();
  const section = page.locator('[data-branches]');
  await expect(section).toBeVisible();
  await expect(section.locator('[data-second-city="todo"]')).toBeVisible();
  await expect(section.getByText('How to grow a branch')).toBeVisible();

  // Open in Lagos.
  const opener = section.locator('.expansion-open');
  await opener
    .getByRole('radiogroup', { name: 'City' })
    .getByRole('radio', { name: 'Lagos' })
    .click();
  await opener
    .getByRole('radiogroup', { name: 'Neighbourhood' })
    .getByRole('radio')
    .and(page.locator(':not([disabled])'))
    .first()
    .click();
  await opener.getByRole('button', { name: /^Open in .*, Lagos$/ }).click();
  const card = section.locator('[data-branch-card]');
  await expect(card).toHaveCount(1);
  await expect(card.getByText(/, Lagos$/).first()).toBeVisible();
  await expect(section.locator('[data-second-city="todo"]')).toContainText('Customers there next');

  // Manage it: a local marketing budget and a local sales rep.
  await card.locator('[data-manage-branch]').click();
  const manage = card.locator('[data-branch-manage]');
  await expect(manage).toBeVisible();
  await manage.locator('[data-branch-budget-input]').fill('500k');
  await manage.locator('[data-branch-budget-save]').click();
  await expect(page.getByText(/a month on local marketing/)).toBeVisible();
  await manage.locator('[data-branch-hire="rep"]').click();
  await expect(page.getByText(/now sells for your .* branch/)).toBeVisible();
  await expect(manage.locator('[data-branch-staff="rep"]')).toHaveCount(1);
  const branchId = (await card.getAttribute('data-branch-card'))!;
  let b = (await state(page)).companies[0].expansion.branches.find(
    (x: { id: string }) => x.id === branchId,
  );
  expect(b.run.budget).toBe(500_000_00);
  await shot(page, 'branch-manage-before-month');

  // A month passes in Lagos (the branch trades) and in London (the books close).
  await settle(page, 'lagos');
  await settle(page, 'london');
  const v1 = await state(page);
  const c1 = v1.companies[0];
  b = c1.expansion.branches.find((x: { id: string }) => x.id === branchId);
  expect(b.run.customers).toBeGreaterThan(0);
  expect(b.run.last.revenue).toBeGreaterThan(0);
  expect(b.run.last.marketing).toBe(500_000_00);
  expect(c1.finance.history.at(-1).branches.revenue).toBeGreaterThan(0);
  expect(c1.customerBook.breakdown.branches).toBe(b.run.customers);
  await page.reload();

  // The Branches section: customers, revenue and profit or loss, and the step done.
  await tab(page, 'Company').click();
  await companyTab(page, 'Branches').click();
  const card2 = page.locator(`[data-branch-card="${branchId}"]`);
  await expect(card2.locator('[data-branch-customers]')).toHaveAttribute(
    'data-branch-customers',
    String(b.run.customers),
  );
  await expect(card2.locator('[data-branch-revenue]')).toHaveAttribute(
    'data-branch-revenue',
    String(b.run.last.revenue),
  );
  await expect(card2.getByText(/^(Profit|Loss) /)).toBeVisible();
  await expect(page.locator('[data-second-city="done"]')).toBeVisible();
  await expect(page.locator('[data-kpi="branch-customers"]')).toHaveText(String(b.run.customers));
  await page.locator('[data-branches]').scrollIntoViewIfNeeded();
  await shot(page, 'branches-section');
  await card2.locator('[data-manage-branch]').click();
  await centre(card2.locator('[data-branch-manage]'));
  await shot(page, 'branch-detail-manage');
  await centre(card2.locator('[data-branch-prospect="lagos"]'));
  await shot(page, 'branch-staff-and-leads');

  // Leads from Lagos: find some, then see Lagos in Sales (filtered).
  await card2.locator('[data-branch-prospect="lagos"]').click();
  await expect(page.getByText(/new leads? in Lagos/)).toBeVisible();
  await card2.locator('[data-branch-sales="lagos"]').click();
  await expect(companyTab(page, 'Sales')).toHaveAttribute('aria-selected', 'true');
  const sales = page.locator('[data-sales]');
  await expect(sales.locator('[data-sales-city="lagos"]')).toHaveAttribute('aria-checked', 'true');
  const lagosDeals = sales.locator('[data-deal]');
  await expect(lagosDeals.first()).toBeVisible();
  const cities = await sales
    .locator('[data-deal] [data-deal-city]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-deal-city')));
  expect(cities.length).toBe(await lagosDeals.count());
  expect(new Set(cities)).toEqual(new Set(['lagos']));
  await sales.locator('[data-sales-cities]').scrollIntoViewIfNeeded();
  await shot(page, 'sales-filtered-lagos');
  // And the Find leads button for the city is right there.
  await expect(sales.locator('[data-prospect-city="lagos"]')).toBeVisible();

  // Customers: the branch's customers, with their city, and the way back to Branches.
  await companyTab(page, 'Customers').click();
  const book = page.locator('[data-customer-book]');
  // The same total the engine counts now (another spec's month end can add market customers).
  const now = (await state(page)).companies[0];
  await expect(book.locator('[data-kpi="customers"]')).toHaveText(String(now.customerBook.total));
  expect(now.customerBook.breakdown.branches).toBeGreaterThan(0);
  const row = book.locator('[data-customer-row="branch"]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-customer-city', 'lagos');
  await expect(row.getByText(/Lagos/)).toBeVisible();
  await expect(row.getByText(/customers? at the branch/)).toBeVisible();
  await expect(book.locator('[data-revenue="branches"]')).toBeVisible();
  await centre(row);
  await shot(page, 'customers-branch-row');
  await book.locator('[data-customers-branches]').click();
  await expect(companyTab(page, 'Branches')).toHaveAttribute('aria-selected', 'true');
});
