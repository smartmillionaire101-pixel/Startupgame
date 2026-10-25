import { expect, fillAboutYou, letters, pickLook, pickPath, test, type Page } from './fixtures';

/**
 * Founder Journey 6: the guided first session. A brand-new founder picks a
 * background on the entry screen, opens the phone (only a few apps show) and
 * checks their own balance, meets a contact at the café and picks an idea,
 * wins a first customer through the sales pipeline with coaching (one
 * recovery after a loss), sees the payment land in the business account,
 * pays a small expense from it and ends on the three objectives. A second
 * founder skips at step 1 and still has a full, valid game.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** FIRST_SESSION_SHOTS=<dir>: screenshots of each scene. */
const shot = async (page: Page, name: string) => {
  const dir = process.env.FIRST_SESSION_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};

/**
 * Nairobi by default: no other spec advances its month, so the guided founder's
 * company keeps its starting cash and its deals keep their deadlines while
 * parallel specs settle Lagos.
 */
async function enter(page: Page, background: string, city = 'Nairobi') {
  await page.goto('/');
  await pickPath(page, 'founder');
  await pickLook(page, { outfit: 'Blue' });
  await fillAboutYou(page, {
    name: 'Ada First',
    city,
    username: `fs_${letters(8)}`,
    email: `fs-${letters()}@example.com`,
    background: BACKGROUND_ID[background],
  });
  await shot(page, `entry-${background}`);
  await page.getByRole('button', { name: /^Play/ }).click();
  await expect(page.getByRole('application', { name: new RegExp(`Map of ${city}`) })).toBeVisible();
}

const coach = (page: Page) => page.locator('.coach');
/** Founder backgrounds by the name the specs use. */
const BACKGROUND_ID: Record<string, string> = {
  'Ex-engineer': 'f-engineer',
  Consultant: 'f-consultant',
  Dropout: 'f-dropout',
  'Ex-banker': 'f-banker',
};

test('a new founder is guided from the flat to a first sale and the next objectives', async ({
  page,
}) => {
  // Sales outcomes are rolled: an unlucky run works through several deals.
  test.slow();
  await enter(page, 'Consultant');
  const card = coach(page);
  await expect(card).toHaveAttribute('data-tutorial-step', 'phone');
  await expect(card.getByText('Step 1 of 5')).toBeVisible();
  await shot(page, 'step1');

  // (a) The flat: open the phone. Only a few apps show; open the Bank.
  await card.getByRole('button', { name: 'Open my phone' }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await expect(phone.locator('[data-app="bank"]')).toBeVisible();
  await expect(phone.locator('[data-app="invest"]')).toHaveCount(0);
  await expect(phone.locator('[data-app="sales"]')).toHaveCount(0);
  await phone.locator('[data-app="bank"]').click();
  await expect(phone.locator('[data-coach-tip="bank"]')).toBeVisible();
  await expect(phone.locator('[data-balance]')).toBeVisible();
  await phone.getByRole('button', { name: 'Close phone' }).click();

  // (b) The café: a contact describes problems; pick an idea and name the company.
  await expect(card).toHaveAttribute('data-tutorial-step', 'idea');
  await card.getByRole('button', { name: 'Go to the café' }).click();
  const cafe = page.getByRole('dialog', { name: 'At the café' });
  await expect(cafe).toBeVisible();
  const idea = cafe.locator('[data-idea="tutor-match"]');
  await expect(idea.getByRole('meter', { name: 'Demand' })).toBeVisible();
  await expect(idea.getByRole('meter', { name: 'Fit with you' })).toBeVisible();
  await shot(page, 'cafe');
  await idea.getByRole('button', { name: 'Choose this idea' }).click();
  const company = `Tutor ${letters(6)}`;
  await cafe.getByLabel('Company name').fill(company);
  await cafe.getByRole('button', { name: `Start ${company}` }).click();
  await expect(cafe).toBeHidden();

  // (c) The first customer, with coaching at each step.
  await expect(card).toHaveAttribute('data-tutorial-step', 'sale');
  await card.getByRole('button', { name: 'Open Sales' }).click();
  await expect(phone.locator('[data-phone-app="sales"]')).toBeVisible();
  const sales = phone.locator('[data-sales]');
  const tip = sales.locator('[data-coach-tip="sales"]');
  await expect(tip).toContainText('Find new leads');
  await shot(page, 'sales');

  const step = async (deal: ReturnType<typeof sales.locator>, action: string) => {
    const before = await deal.getAttribute('data-deal-stage');
    await deal.locator(`button[data-action="${action}"]`).click();
    const confirm = deal.locator(`[data-confirm="${action}"]`);
    await expect(confirm).toBeVisible();
    if (action === 'propose') await confirm.getByLabel('Monthly price').fill('1');
    await confirm.getByRole('button', { name: 'Confirm' }).click();
    await expect(deal).not.toHaveAttribute('data-deal-stage', before ?? '', { timeout: 15_000 });
  };
  const next: Record<string, string> = {
    lead: 'contact',
    contacted: 'discover',
    discovery: 'demo',
    demo: 'propose',
    proposal: 'close',
    negotiation: 'close',
  };
  let won = false;
  let sawObjection = false;
  for (let round = 0; round < 3 && !won; round++) {
    await sales.getByRole('button', { name: 'Find new leads' }).click();
    await expect(sales.locator('[data-deal-stage="lead"]').first()).toBeVisible();
    const ids = await sales
      .locator('[data-deal-stage="lead"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-deal')!));
    for (const id of ids) {
      const deal = sales.locator(`[data-deal="${id}"]`);
      await expect(tip).toContainText('Call');
      // The longest path is nine steps: lead to close, a loss, recovery to discovery, then demo, propose and close again.
      for (let k = 0; k < 12; k++) {
        const stage = (await deal.getAttribute('data-deal-stage')) ?? '';
        if (stage === 'won') break;
        if (stage === 'lost') {
          if (!(await deal.locator('button[data-action="recover"]').count())) break;
          // The objection is named, with one recovery attempt.
          await expect(tip).toContainText('said no');
          sawObjection = true;
          await step(deal, 'recover');
          continue;
        }
        await step(deal, next[stage]!);
      }
      if ((await deal.getAttribute('data-deal-stage')) === 'won') {
        won = true;
        break;
      }
    }
  }
  if (!won) {
    // Never blocked on one roll: go on without a sale.
    expect(sawObjection).toBe(true);
    await tip.getByRole('button', { name: 'Go on without a sale' }).click();
  }
  await phone.getByRole('button', { name: 'Close phone' }).click();

  // (d) Business money: the payment is in the business account; pay a small cost from it.
  await expect(card).toHaveAttribute('data-tutorial-step', 'payment');
  if (won) await expect(card).toContainText('paid');
  await expect(card.locator('[data-account-kind="personal"]')).toBeVisible();
  const business = card.locator('[data-account-kind="business"] strong');
  const before = await business.textContent();
  await shot(page, 'payment');
  await card.locator('[data-expense="cards"]').click();

  // (e) What's next: the three objectives.
  await expect(card).toHaveAttribute('data-tutorial-step', 'end');
  await expect(card.locator('[data-objective="main"]')).toBeVisible();
  await expect(card.locator('[data-objective="opportunity"]')).toBeVisible();
  await expect(card.locator('[data-objective="personal"]')).toBeVisible();
  await expect(card.locator('[data-coach-chapter]')).toContainText('Chapter 1');
  await shot(page, 'end');

  const state = await page.request.get('/api/state').then((r) => r.json());
  expect(state.view.me.background.id).toBe('f-consultant');
  const c = state.view.companies[0];
  expect(c.starterIdea.id).toBe('tutor-match');
  expect(c.industry).toBe('edtech');
  expect(c.expenses).toHaveLength(1);
  if (won) expect(c.starterIdea.paid.amount).toBeGreaterThan(0);
  expect(before).toBeTruthy();
  await card.getByRole('button', { name: 'Finish tutorial' }).click();
  await expect(page.locator('.coach')).toHaveCount(0);

  // Saved across a reload: the tutorial stays finished, every app is back.
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Nairobi/ })).toBeVisible();
  await expect(page.locator('.coach')).toHaveCount(0);
  await page
    .getByRole('button', { name: /^Phone/ })
    .first()
    .click();
  await expect(phone.locator('[data-app="invest"]')).toBeVisible();
});

test('skipping the tutorial at step 1 leaves a full, valid game', async ({ page }) => {
  await enter(page, 'Dropout');
  const card = coach(page);
  await expect(card).toHaveAttribute('data-tutorial-step', 'phone');
  await card.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(page.locator('.coach')).toHaveCount(0);

  // All apps visible.
  await page
    .getByRole('button', { name: /^Phone/ })
    .first()
    .click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  for (const app of ['bank', 'map', 'messages', 'founder', 'invest', 'news', 'journey'])
    await expect(phone.locator(`[data-app="${app}"]`)).toBeVisible();
  await phone.getByRole('button', { name: 'Close phone' }).click();

  // Objectives shown: the journey with its three prompts.
  await page.getByTestId('journey-chip').click();
  await expect(page.locator('[data-objective="main"]')).toBeVisible();
  await expect(page.locator('[data-objective="opportunity"]')).toBeVisible();
  await expect(page.locator('[data-objective="personal"]')).toBeVisible();

  const state = await page.request.get('/api/state').then((r) => r.json());
  expect(state.view.me.background.id).toBe('f-dropout');
  expect(state.view.me.role).toBe('founder');
  expect(state.view.journey.chapters[0].steps[0].id).toBe('hustle.company');

  // Still skipped after a reload.
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Nairobi/ })).toBeVisible();
  await expect(page.locator('.coach')).toHaveCount(0);
});
