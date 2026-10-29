import {
  expect,
  letters,
  playAsGuest,
  salesConversation,
  setupFounder,
  test,
  type Page,
} from './fixtures';

/**
 * Founder Journey 2a: the sales pipeline. A founder opens the phone's Sales
 * app, finds leads, works one deal from the first call through discovery and
 * a demo (seeing the time and cost of each step before confirming, and the
 * customer's hidden budget once discovered), then sits down for the sales
 * conversation (round two: lead, price, terms, "Ask for the deal", a scored
 * result) and, after a loss, tries again. The signed deal shows up as a
 * customer from the pipeline.
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
  // Up to three rounds of five steps or more each: slow on a deploy preview.
  test.slow();
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
    // If it doesn't, say what the game said (an error toast) rather than just timing out.
    await expect(deal)
      .not.toHaveAttribute('data-deal-stage', before ?? '', { timeout: 20_000 })
      .catch(async (e: unknown) => {
        const toasts = await page.locator('.toast').allTextContents();
        throw new Error(
          `${action} left the deal at "${before}"; toasts: ${JSON.stringify(toasts)}\n${String(e)}`,
        );
      });
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
      // The proposal and the close are a conversation now (no one-click close).
      await expect(deal.locator('button[data-action="close"]')).toHaveCount(0);
      await salesConversation(page, deal);
      await expect(deal).toHaveAttribute('data-deal-stage', /won|lost/);
      if ((await deal.getAttribute('data-deal-stage')) === 'lost') {
        // The objection is named, with one more try: a fresh conversation.
        await expect(deal.getByText(/^Lost: /)).toBeVisible();
        await step(deal, 'recover');
        await salesConversation(page, deal);
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

/**
 * Round 7 #9 (player feedback: empty stages collapsed to thin strips with
 * turned labels, "LEAD 0 · DEMO 0", and looked broken): the Company screen's
 * Sales board on a laptop is a row of stage chips with their counts (empty
 * ones dimmed, never turned), the deal cards grouped below, and a tap on a
 * chip shows that stage. What you don't know yet folds into one line.
 */
test.describe('the sales board on a laptop', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('stage chips with counts, empty stages as dimmed chips, a tap filters', async ({ page }) => {
    await playAsGuest(page);
    const handle = `sb_${letters(8)}`;
    await setupFounder(page, {
      name: 'Ada Board',
      handle,
      company: `Board ${handle.slice(3)}`,
      idea: 'Payments for market traders',
    });
    await page
      .getByRole('button', { name: /^Company/ })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Sales' }).click();
    const sales = page.locator('[data-sales]').first();
    await sales.getByRole('button', { name: 'Find new leads' }).click();
    await expect(sales.locator('[data-deal-stage="lead"]').first()).toBeVisible();
    const leads = await sales.locator('[data-deal-stage="lead"]').count();

    // One row of chips: All open, the six stages, Won and Lost.
    const chips = sales.locator('[data-sales-stages]');
    await expect(chips).toBeVisible();
    await expect(chips.locator('[data-chip]')).toHaveCount(9);
    await expect(chips.locator('[data-chip="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.locator('[data-chip="lead"] .n')).toHaveText(String(leads));
    // An empty stage is a dimmed chip with its 0, not a column.
    await expect(chips.locator('[data-chip="demo"]')).toHaveClass(/is-empty/);
    await expect(chips.locator('[data-chip="demo"] .n')).toHaveText('0');
    await expect(sales.locator('.sales-col')).toHaveCount(1);
    await expect(sales.locator('.sales-col[data-stage="demo"]')).toHaveCount(0);
    // Nothing is written sideways, and the chips sit in one row.
    const sideways = await page.evaluate(
      () =>
        [...document.querySelectorAll('.sales *')].filter(
          (e) => getComputedStyle(e).writingMode !== 'horizontal-tb',
        ).length,
    );
    expect(sideways).toBe(0);
    const tops = await chips
      .locator('[data-chip]')
      .evaluateAll((els) => [
        ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))),
      ]);
    expect(tops).toHaveLength(1);

    // Before discovery, the unknowns fold into one line.
    const deal = sales.locator('[data-deal-stage="lead"]').first();
    await expect(deal.locator('[data-tofind]')).toBeVisible();
    await expect(deal.locator('[data-known="budget"]')).toBeHidden();

    // Call one lead: it moves to Contacted, and that chip counts it.
    await deal.locator('button[data-action="contact"]').click();
    await deal.locator('[data-confirm="contact"]').getByRole('button', { name: 'Confirm' }).click();
    await expect(chips.locator('[data-chip="contacted"] .n')).toHaveText('1');
    await expect(chips.locator('[data-chip="contacted"]')).not.toHaveClass(/is-empty/);

    // A tap shows that stage only; an empty stage says so; All open brings the rest back.
    await chips.locator('[data-chip="contacted"]').click();
    await expect(chips.locator('[data-chip="contacted"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(sales.locator('.sales-col')).toHaveCount(1);
    await expect(sales.locator('.sales-col[data-stage="contacted"]')).toBeVisible();
    await expect(sales.locator('[data-deal-stage="lead"]')).toHaveCount(0);
    await chips.locator('[data-chip="negotiation"]').click();
    await expect(sales.locator('[data-sales-none]')).toBeVisible();
    await chips.locator('[data-chip="all"]').click();
    await expect(sales.locator('[data-deal-stage="contacted"]')).toHaveCount(1);
    if (leads > 1) await expect(sales.locator('[data-deal-stage="lead"]')).toHaveCount(leads - 1);
  });
});
