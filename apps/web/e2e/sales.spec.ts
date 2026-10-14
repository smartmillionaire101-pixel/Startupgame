import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Founder Journey 2a: the sales pipeline. A founder opens the phone's Sales
 * app, finds leads, works one deal from the first call to "Ask for the deal"
 * (seeing the time and cost of each step before confirming, and the customer's
 * hidden budget once discovered) and, after a loss, tries again. The signed
 * deal shows up as a customer from the pipeline.
 */

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

test('a founder prospects, works a deal to signature and sees the customer', async ({ page }) => {
  await playAsGuest(page);
  const handle = `sa_${letters(8)}`;
  await setupFounder(page, {
    name: 'Ada Sales',
    handle,
    company: `Sell ${handle.slice(3)}`,
    idea: 'Payments for market traders',
  });
  const phone = await openSales(page);
  const sales = phone.locator('[data-sales]');
  await expect(sales.getByText('Sales pipeline')).toBeVisible();

  // Each step: the next-action button, then a confirm that shows the time (and cost).
  const step = async (deal: ReturnType<typeof sales.locator>, action: string) => {
    const before = await deal.getAttribute('data-deal-stage');
    await deal.locator(`button[data-action="${action}"]`).click();
    const confirm = deal.locator(`[data-confirm="${action}"]`);
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('[data-cost]')).toContainText(/Takes \d+h/);
    if (action === 'propose') await confirm.getByLabel('Monthly price').fill('1');
    await confirm.getByRole('button', { name: 'Confirm' }).click();
    await expect(confirm).toBeHidden();
    // Every step moves the deal on: wait for the board to show it before reading it.
    await expect(deal).not.toHaveAttribute('data-deal-stage', before ?? '', { timeout: 15_000 });
  };

  let won = false;
  for (let round = 0; round < 3 && !won; round++) {
    await sales.getByRole('button', { name: 'Find new leads' }).click();
    await expect(sales.locator('[data-deal-stage="lead"]').first()).toBeVisible();
    const ids = await sales
      .locator('[data-deal-stage="lead"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-deal')!));
    for (const id of ids) {
      const deal = sales.locator(`[data-deal="${id}"]`);
      // Before discovery the budget is unknown.
      await expect(deal.locator('[data-known="budget"]')).toHaveText('?');
      await step(deal, 'contact');
      await step(deal, 'discover');
      await expect(deal.locator('[data-known="budget"]')).not.toHaveText('?');
      await step(deal, 'demo');
      await step(deal, 'propose');
      await step(deal, 'close');
      await expect(deal).toHaveAttribute('data-deal-stage', /won|lost/);
      if ((await deal.getAttribute('data-deal-stage')) === 'lost') {
        // The objection is named, with one more try.
        await expect(deal.getByText(/^Lost: /)).toBeVisible();
        await step(deal, 'recover');
        // Recovery reopens the deal a stage or two back: work forward to the close again.
        const next: Record<string, string> = {
          contacted: 'demo',
          discovery: 'demo',
          demo: 'propose',
          proposal: 'close',
          negotiation: 'close',
        };
        for (let k = 0; k < 4; k++) {
          const action = next[(await deal.getAttribute('data-deal-stage')) ?? ''];
          if (!action) break;
          await step(deal, action);
          if (action === 'close') break;
        }
        await expect(deal).toHaveAttribute('data-deal-stage', /won|lost/);
      }
      if ((await deal.getAttribute('data-deal-stage')) === 'won') {
        won = true;
        break;
      }
    }
  }
  expect(won).toBe(true);
  const customers = sales.getByRole('list', { name: 'Customers from your pipeline' });
  await expect(customers.locator('[data-account]')).toHaveCount(1);
  await expect(sales.locator('[data-kpi="winrate"]')).not.toHaveText('—');

  // SALES_SHOTS=<dir>: the phone app, and the Company screen's stage columns on a wide screen.
  const dir = process.env.SALES_SHOTS;
  if (dir) {
    await sales.getByRole('button', { name: 'Find new leads' }).click();
    await page.screenshot({ path: `${dir}/sales-phone.png` });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .getByRole('button', { name: /^Company/ })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Sales' }).click();
    await page.screenshot({ path: `${dir}/sales-desktop.png`, fullPage: true });
  }
});
