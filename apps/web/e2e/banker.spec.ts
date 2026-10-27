import {
  expect,
  letters,
  playAsGuest,
  setupPlayer,
  tab,
  tapPlace,
  test,
  type Page,
  hudMore,
} from './fixtures';

/**
 * Bankers: a new banker negotiates with the shareholders (offers side by
 * side, a counter-offer, voting shares), signs and files, books and attends
 * the fit-and-proper interview at the Central Bank, completes the licence
 * checklist (plan, key people, systems, a branch, a first client), gets the
 * licence at month end, sets pricing and follows the banker journey.
 * Accra (other specs that settle a month use it too). Screenshots go to
 * $BANKER_SHOTS when it is set.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.BANKER_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

const settle = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/dev/settle', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ market: 'accra' }),
    });
    return r.status;
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the e2e reads the view loosely
const state = (page: Page): Promise<any> => page.request.get('/api/state').then((r) => r.json());

async function centralBank(page: Page) {
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, '[data-place="civic:accra:central-bank"]');
}

test('a new banker negotiates, files, passes the Central Bank interview and gets the licence', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Ama E2E',
    handle: `ama_${letters(6)}`,
    role: 'banker',
    backgroundId: 'b-commercial',
    market: 'accra',
    gender: 'female',
    bank: { name: `Adinkra Trust ${letters(5)}`, bankType: 'microfinance' },
  });

  // A. Negotiate before you sign: three offers side by side, and the first session.
  await tab(page, 'Bank').click();
  const neg = page.locator('[data-banker="negotiate"]');
  await expect(neg).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.banker-tutorial')).toBeVisible();
  await expect(page.locator('[data-banker-step="negotiate"]')).toBeVisible();
  await expect(neg.locator('.offer-table th[data-offer]')).toHaveCount(3);
  await neg.locator('.offer-table').scrollIntoViewIfNeeded();
  await shot(page, 'banker-A-1-offers');

  // Take the family office's non-voting money and the strategic group's.
  // (Controlled by the server: the box ticks once the command lands.)
  await neg.locator('[data-take="g2"]').click();
  await expect(neg.locator('[data-take="g2"]')).toBeChecked();
  await neg.locator('[data-take="g3"]').click();
  await expect(neg.locator('[data-take="g3"]')).toBeChecked();
  const ownBefore = await neg.locator('[data-control]').textContent();
  // Counter the strategic group once.
  await neg
    .getByLabel(/^Counter /)
    .nth(2)
    .selectOption('price');
  await expect(page.getByText(/They agreed\.|They held firm on their terms\./)).toBeVisible();
  // Voting shares: three votes per share keep control with you.
  await neg.locator('[data-dual-class]').click();
  await expect(neg.locator('[data-dual-class]')).toBeChecked();
  await expect(neg.locator('[data-control]')).not.toHaveText(ownBefore ?? '');
  await expect(neg.locator('[data-policy-rights="yes"]')).toBeVisible();
  await neg.locator('[data-preview]').scrollIntoViewIfNeeded();
  await shot(page, 'banker-A-2-control');
  await neg.locator('[data-sign]').click();
  await expect(page.getByText('Signed. Your licence application is filed.')).toBeVisible();

  // B. The licence is the work: tracker and checklist.
  const lic = page.locator('[data-banker="licence"]');
  await expect(lic).toBeVisible();
  await expect(lic.locator('[data-review-day]')).toContainText(/Review: day \d+ of 30/);
  await expect(page.locator('[data-banker-step="book"]')).toBeVisible();
  await shot(page, 'banker-A-3-tracker');

  // Book the fit-and-proper interview at the Central Bank.
  await centralBank(page);
  const door = page.locator('.civic-door');
  await expect(door).toHaveAttribute('data-civic-closed', 'appointment', { timeout: 15_000 });
  await door.locator('[data-book-appointment]').click();
  await expect(page.getByText(/Appointment booked at Central Bank: Day \d+/)).toBeVisible();
  await shot(page, 'banker-B-1-booked');
  await door.getByRole('button', { name: 'Back to the street' }).click();

  // Later on the game clock (a month on, from the dev tools): go in and answer.
  expect(await settle(page)).toBe(200);
  await page.reload();
  await centralBank(page);
  const go = page.locator('[data-action="bank-interview"]');
  await expect(go).toBeVisible({ timeout: 15_000 });
  await go.click();
  const interview = page.locator('.bank-interview');
  await expect(interview).toBeVisible({ timeout: 15_000 });
  await interview.getByLabel(/Keep a buffer above the minimum/).check();
  await interview.getByLabel(/A written credit policy/).check();
  await interview.getByLabel(/Refuse until they document the source/).check();
  await interview.getByLabel(/An independent board/).check();
  await shot(page, 'banker-B-2-interview');
  await interview.locator('[data-answer-interview]').click();
  await expect(page.getByText(/Interview passed: \d+\/100\./).first()).toBeVisible();
  // Play-test #13: the result stays on the card once the questions are answered.
  await expect(interview.locator('[data-interview-result="passed"]')).toContainText(
    /Interview passed: \d+\/100\./,
  );
  await page.getByRole('button', { name: 'Close' }).first().click();

  // The rest of the checklist on the Bank tab.
  await tab(page, 'Bank').click();
  await expect(lic).toBeVisible();
  await expect(lic.locator('[data-check="interview"]')).toHaveClass(/done/);
  await expect(lic.locator('[data-plan-check="capital"]')).toHaveAttribute(
    'data-level',
    /good|warn/,
  );
  await lic.locator('[data-file-plan]').click();
  await expect(page.getByText('Business plan filed with the regulator.')).toBeVisible();
  await expect(lic.getByText('Approved in principle')).toBeVisible();
  const view = (await state(page)).view;
  const cands = view.banker.bank.licence.candidates as Record<
    string,
    { id: string; quality: number }[]
  >;
  for (const role of ['ceo', 'cro', 'compliance', 'aml']) {
    const best = [...cands[role]!].sort((a, b) => b.quality - a.quality)[0]!;
    await lic.locator(`[data-hire="${role}:${best.id}"]`).click();
    await expect(lic.locator(`[data-hire="${role}:${best.id}"]`)).toBeDisabled();
  }
  await lic.locator('[data-system="premium"]').click();
  await expect(lic.locator('[data-system="premium"]')).toBeDisabled();
  await lic.locator('[data-lease]').click();
  await expect(page.getByText('Branch leased.')).toBeVisible();
  await lic.locator('[data-client]').first().click();
  await expect(page.getByText('They’ll bank with you when you open.')).toBeVisible();
  await expect(lic.locator('.licence-checklist li.done')).toHaveCount(8);
  await lic.locator('.licence-checklist').scrollIntoViewIfNeeded();
  await shot(page, 'banker-B-3-checklist');

  // Month end: the regulator decides.
  expect(await settle(page)).toBe(200);
  await page.reload();
  await tab(page, 'Bank').click();
  await expect(page.getByText(/Licensed ·/)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'banker-B-4-licensed');
  await page.getByLabel('Deposit rate (%)').fill('8');
  await page.getByRole('button', { name: 'Save pricing' }).click();
  await expect(page.getByText('Pricing updated.')).toBeVisible();
  // Play-test #16: the city's companies ask the new bank for loans.
  await expect(page.locator('[data-loan-requests-hint]')).toBeVisible();
  const bankId = (await state(page)).view.bank.id as string;
  await expect(page.getByText('Your move').first()).toBeVisible();

  // Play-test #15: in your own bank you get the owner's desk, not the customer counter.
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, `[data-place="playerbank:${bankId}"]`);
  const desk = page.locator('[data-action="bank:desk"]');
  await expect(desk).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-action="bank:account"]')).toHaveCount(0);
  await desk.click();
  await expect(page.getByRole('heading', { name: 'Loan requests' })).toBeVisible();
  await shot(page, 'banker-B-5-own-bank');
  await page.getByRole('button', { name: 'Close' }).first().click();

  // C. The banker journey: chapter 1 done, the next one current.
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await hudMore(page);
  await page.getByTestId('journey-chip').click();
  const journey = page.getByTestId('journey');
  await expect(journey).toBeVisible();
  await expect(journey.getByText('The Licence')).toBeVisible();
  await expect(journey.getByText('Open for Business').first()).toBeVisible();
  await shot(page, 'banker-C-1-journey');
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.locator('[data-whatnow-open]').click();
  await expect(page.locator('.journey-objectives')).toBeVisible();
  await shot(page, 'banker-C-2-whatnow');
});
