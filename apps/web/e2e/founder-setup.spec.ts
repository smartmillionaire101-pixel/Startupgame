import {
  expect,
  letters,
  playAsGuest,
  registerAndFund,
  setupPlayer,
  signUp,
  tab,
  test,
  withoutNetlifyDrawer,
  type Page,
} from './fixtures';

/**
 * Founder setup (player feedback: "I just started and it says I'm short of
 * pay day"): a new founder names the company, registers it (type and fee),
 * funds it with their own money, chooses an office and opens, with no payday
 * warning before there is anything to pay. A second founder applies for a
 * startup loan at a bank run by a banker player, with a business plan whose
 * checks run as they type, and the banker approves it on their desk.
 * Freetown for the bank (its months are advanced here; few specs use it).
 * Screenshots go to $SETUP_SHOTS when it is set.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.SETUP_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

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

const settle = async (page: Page, market: string) => {
  const r = await page.request.post('/api/dev/settle', {
    headers: { 'x-runway': '1' },
    data: { market },
  });
  expect(r.status(), await r.text()).toBe(200);
};

/** The Company screen's name form (step 1 of the setup). */
async function reserveName(page: Page, name: string) {
  await tab(page, 'Company').click();
  const form = page.locator('[data-company-setup]');
  await expect(form).toBeVisible();
  await expect(page.locator('.fsu-tracker [data-step="idea"]')).toHaveAttribute(
    'data-status',
    'current',
  );
  await form.getByLabel('Company name').fill(name);
  // No industry until there's an idea; then the one it sounds like (player feedback: a
  // health-care idea was founded as Business software, the old default).
  const industry = form.getByLabel('Industry', { exact: true });
  await expect(industry).toHaveValue('');
  await form.getByLabel('Idea in one line').fill('Health tech providing access to quality care');
  await expect(industry).toHaveValue('healthtech');
  await form.getByLabel('Idea in one line').fill('Deliveries and parcel tracking for shops');
  await expect(industry).toHaveValue('logistics');
  await form.getByLabel('Idea in one line').fill('A phone ledger for market traders');
  await expect(industry).toHaveValue('fintech');
  await industry.selectOption('fintech');
  // The company type and its fee come at registration, not here.
  await expect(form.getByLabel('Incorporation')).toHaveCount(0);
  const go = form.getByRole('button', { name: 'Reserve the name and continue' });
  await go.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await go.click();
  await expect(page.locator('[data-setup-register]')).toBeVisible();
}

async function register(page: Page) {
  const card = page.locator('[data-setup-register]');
  await card.locator('[data-type="local"]').click();
  const btn = card.getByRole('button', { name: /^Register / });
  await btn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await btn.click();
  await expect(page.locator('[data-setup-own]')).toBeVisible();
}

test('a new founder registers, funds the company with their own money, leases an office and opens', async ({
  page,
}) => {
  await page.goto('/');
  await signUp(page, {
    role: 'founder',
    name: 'Adaeze Setup',
    city: 'Lagos',
    username: `su_${letters(8)}`,
    email: `su-${letters()}@example.com`,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
  // Skip the guided tour: this spec is about the setup.
  const skip = page.locator('.coach').getByRole('button', { name: 'Skip tutorial' });
  if (await skip.isVisible()) await skip.click();

  const name = `Iwe ${letters(6)}`;
  await reserveName(page, name);
  // Nothing to pay yet: no payday warning, ever, before the office.
  await expect(page.locator('[data-payday-due], [data-payday-warning]')).toHaveCount(0);
  await expect(page.locator('.fsu-tracker [data-step="register"]')).toHaveAttribute(
    'data-status',
    'current',
  );
  await shot(page, 'setup-1-register');
  const savingsBefore = (await state(page)).accounts.local.balance as number;
  await register(page);
  let v = await state(page);
  const fee = v.companies[0].setup.registered.fee as number;
  expect(v.accounts.local.balance).toBe(savingsBefore - fee);

  // Fund: half the savings as shares.
  const own = page.locator('[data-setup-own]');
  const slider = own.getByLabel('Your own money');
  const max = Number(await slider.getAttribute('max'));
  // A value on the slider's steps (the browser snaps anything else).
  const step = Number(await slider.getAttribute('step'));
  // The label under the slider follows it (player feedback: it stayed "½ of savings" at 18%).
  const now = own.locator('[data-own-pct]');
  await slider.fill(String(Math.round((max * 0.18) / step) * step));
  await expect(now).toHaveAttribute('data-own-pct', '18');
  await expect(now).toHaveText('18% of savings');
  await expect(own.getByText('½ of savings')).toHaveCount(0);
  await slider.fill(String(Math.round(max / 2 / step) * step));
  await expect(now).toHaveText('50% of savings');
  const amount = Number(await own.locator('[data-own-amount]').getAttribute('data-own-amount'));
  expect(amount).toBeGreaterThan(0);
  // The runway estimate counts what the slider puts in.
  await expect(page.locator('[data-setup-runway]')).not.toHaveAttribute('data-setup-runway', '0');
  await shot(page, 'setup-2-fund');
  await own.getByRole('button', { name: /^Put / }).click();
  await expect(own.locator('[data-own-in]')).toBeVisible();
  v = await state(page);
  expect(v.companies[0].cash).toBe(amount);
  expect(v.companies[0].nextMonth).toBeNull();
  await expect(page.locator('[data-payday-due], [data-payday-warning]')).toHaveCount(0);

  // Office: five choices in different districts, with rent and the runway after.
  await page.getByRole('button', { name: 'Next: choose an office' }).first().click();
  const office = page.locator('[data-setup-office]');
  await expect(office).toBeVisible();
  await expect(office.locator('[data-office]')).toHaveCount(5);
  await office.locator('[data-office="cowork"]').click();
  await shot(page, 'setup-3-office');
  await office.getByRole('button', { name: /^Lease \d+ desks in / }).click();

  // Open: the done card hands over to the stage tracker.
  const done = page.locator('[data-setup-done]');
  await expect(done).toBeVisible();
  await expect(page.locator('[data-founder-stage]')).toBeVisible();
  await shot(page, 'setup-4-done');
  v = await state(page);
  const c = v.companies[0];
  expect(c.setup.step).toBe('done');
  expect(c.setup.office.id).toBe('cowork');
  // Rent is now a real cost, measured against the capital chosen.
  expect(c.nextMonth.costs).toBeGreaterThan(0);
  expect(c.nextMonth.short).toBe(0);
});

/** A licensed player bank in Freetown, through the licence process by commands. */
async function licensedBank(page: Page): Promise<{ id: string; name: string }> {
  await playAsGuest(page);
  const name = `Lagoon ${letters(5)}`;
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Ngozi Banker',
    handle: `ng_${letters(6)}`,
    role: 'banker',
    backgroundId: 'b-commercial',
    market: 'freetown',
    gender: 'female',
    bank: { name, bankType: 'microfinance' },
  });
  let v = await state(page);
  const id = v.banker.bank.id as string;
  await command(page, { type: 'bank.terms', bankId: id, chosen: ['g1', 'g2', 'g3'] });
  await command(page, { type: 'bank.sign', bankId: id });
  await command(page, { type: 'place.book', placeId: 'freetown:central-bank' });
  await settle(page, 'freetown');
  await command(page, { type: 'bank.interview', bankId: id, answers: [1, 0, 2, 1] });
  v = await state(page);
  const lic = v.banker.bank.licence;
  await command(page, { type: 'bank.plan', bankId: id, ...lic.suggestedPlan });
  for (const role of ['ceo', 'cro', 'compliance', 'aml']) {
    const best = [...lic.candidates[role]]
      .filter((x: { id: string }) => x.id !== 'self')
      .sort((a: { quality: number }, b: { quality: number }) => b.quality - a.quality)[0];
    await command(page, { type: 'bank.hire', bankId: id, role, candidateId: best.id });
  }
  await command(page, {
    type: 'bank.setup',
    bankId: id,
    system: 'premium',
    district: lic.districts[0].id,
  });
  await settle(page, 'freetown');
  v = await state(page);
  expect(v.bank.status).toBe('licensed');
  return { id, name };
}

test('a founder applies for a startup loan at a player bank and the banker approves it', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const bankerCtx = await browser.newContext();
  const banker = await bankerCtx.newPage();
  // The fixture's page settings (Lite map, no pop-ups) for the extra contexts too.
  await withoutNetlifyDrawer(banker);
  const bank = await licensedBank(banker);

  const founderCtx = await browser.newContext();
  const page = await founderCtx.newPage();
  await withoutNetlifyDrawer(page);
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.quickStart',
    username: `sf_${letters(8)}`,
    role: 'founder',
    name: 'Adaeze Loan',
    market: 'freetown',
  });
  const skip = page.locator('.coach').getByRole('button', { name: 'Skip tutorial' });
  if (await skip.isVisible()) await skip.click();
  await reserveName(page, `Ledger ${letters(6)}`);
  await register(page);

  // Pick the player bank's startup loan, with an amount and a term.
  let v = await state(page);
  const ask = Math.round((v.market.costOfLiving as number) * 2);
  const loans = page.locator('[data-setup-loans]');
  const row = loans.locator(`[data-bank="${bank.id}"]`);
  await expect(row).toContainText(bank.name);
  await row.getByRole('button', { name: 'Pick' }).click();
  await loans.getByLabel('Amount').fill(String(ask / 100));
  await loans.getByLabel('Term (months)').fill('36');
  await page.getByRole('button', { name: 'Next: write the plan for the loan' }).click();

  // The plan: checks update as you type; a red check blocks sending.
  const plan = page.locator('[data-setup-plan]');
  await expect(plan).toBeVisible();
  const c = v.companies[0];
  const price = c.price as number;
  const margin = price - Math.round(price * 0.1);
  const pay = Math.ceil(ask / 10);
  const monthly = Math.max(c.setup.runway.monthly as number, pay * 5);
  await plan.getByLabel('Cost to serve').fill(String(Math.round(price * 0.1) / 100));
  await plan.getByLabel('Monthly costs').fill(String(monthly / 100));
  await plan.getByLabel('Customers, month 6').fill(String(Math.ceil(monthly / margin)));
  await plan.getByLabel('The ask').fill(String(ask / 100));
  await plan.getByLabel('Months it lasts').fill('60');
  await expect(plan.locator('[data-setup-check="runway"]')).toHaveAttribute('data-level', 'bad');
  await expect(plan.getByRole('button', { name: 'Send the plan' })).toBeDisabled();
  await expect(plan.getByText('Fix the red check to send.')).toBeVisible();
  await plan.getByLabel('Months it lasts').fill('1');
  await expect(plan.locator('[data-level="bad"]')).toHaveCount(0);
  await shot(page, 'setup-5-plan');
  await plan.getByRole('button', { name: 'Send the plan' }).click();
  const answer = page.locator('[data-bank-answer]');
  await expect(answer).toHaveAttribute('data-bank-answer', 'open');
  await expect(answer).toContainText('The banker reads your plan');

  // The banker's desk: the plan, the bank-side checks, Approve / Counter / Decline.
  await banker.reload();
  await tab(banker, 'Bank').click();
  const app = banker.locator('[data-application]');
  await expect(app).toBeVisible({ timeout: 15_000 });
  await expect(app.locator('[data-plan-text]')).toContainText('A phone ledger for market traders');
  for (const id of ['repayment', 'customers', 'credit', 'capital', 'single'])
    await expect(app.locator(`[data-setup-check="${id}"]`)).toBeVisible();
  await expect(app.locator('[data-reason]')).toHaveCount(5);
  await shot(banker, 'setup-6-banker-desk');
  await app.getByRole('button', { name: /^Approve / }).click();
  await expect(banker.locator('[data-application]')).toHaveCount(0);

  // The founder sees the result and the money is in the company.
  await page.reload();
  await tab(page, 'Company').click();
  await expect(page.locator('[data-bank-answer]')).toHaveAttribute('data-bank-answer', 'accepted');
  v = await state(page);
  expect(v.companies[0].cash).toBe(ask);
  await shot(page, 'setup-7-approved');
  await bankerCtx.close();
  await founderCtx.close();
});

/**
 * Round 7, item 2: a leased office is a place you go to. A London founder
 * leases co-working desks; the done card and the Company screen have "Go to
 * office", which walks to the office, standing in the district it was leased
 * in (listed there under Places), and inside is a co-working room.
 */
test('a leased co-working office in London can be visited', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await signUp(page, {
    role: 'founder',
    name: 'Obi Office',
    city: 'London',
    username: `of_${letters(8)}`,
    email: `of-${letters()}@example.com`,
  });
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible();
  const skip = page.locator('.coach').getByRole('button', { name: 'Skip tutorial' });
  if (await skip.isVisible()) await skip.click();
  await reserveName(page, `Desk ${letters(6)}`);
  await registerAndFund(page);
  await page.getByRole('button', { name: 'Next: choose an office' }).first().click();
  const office = page.locator('[data-setup-office]');
  await office.locator('[data-office="cowork"]').click();
  await office.getByRole('button', { name: /^Lease \d+ desks in / }).click();
  const done = page.locator('[data-setup-done]');
  await expect(done).toBeVisible();
  const district = (await state(page)).companies[0].setup.office.district as string;

  // On the Company screen, and on the done card.
  await expect(page.locator('[data-go-office="office"]')).toHaveCount(2);
  await done.locator('[data-go-office="office"]').click();
  const scene = page.locator('.place-scene[data-scene="office"]');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-room', 'cowork');
  await scene.getByRole('button', { name: 'Close' }).first().click();
  await expect(scene).toBeHidden();

  // Places lists it in the district it was leased in.
  await page.getByRole('button', { name: /Places/ }).click();
  const places = page.getByRole('dialog', { name: 'Places' });
  await expect(places.locator(`[data-area="${district}"] [data-kind="office"]`)).toHaveCount(1);
});
