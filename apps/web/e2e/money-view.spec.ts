import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Your money, findable: the top bar's cash opens your own account and the
 * company's (bank, revenue, spending), Company shows them up front, a
 * warning sits under the top bar when next payday won't be covered, and
 * the phone's home screen has a way back to the game. MONEY_SHOTS=<dir>
 * saves 390×844 screenshots.
 */
const SHOTS = process.env.MONEY_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function founder(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Money ${n}`,
    handle: `money_${n}`,
    company: `Tally ${letters(5)}`,
    idea: 'Ledgers for traders',
    market: /Lagos, Nigeria/,
  });
  await expect(page.locator('[data-topbar-cash]')).toBeVisible({ timeout: 30_000 });
}

/** The company, and the most a founder may pay themselves (10× the city's monthly cost of living). */
const companyOf = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    const s = (await r.json()) as {
      view: {
        companies: { id: string; status: string }[];
        market: { costOfLiving: number };
      };
    };
    return {
      id: s.view.companies.find((c) => c.status === 'active')!.id,
      maxSalary: Math.floor(s.view.market.costOfLiving * 10),
    };
  });

test('the money pill shows your money and your company’s', async ({ page }) => {
  await founder(page);
  await page.locator('[data-topbar-cash]').click();
  const sheet = page.locator('[data-money-sheet]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('In your account')).toBeVisible();
  const company = sheet.locator('[data-company-money]');
  await expect(company.getByText('In the company bank')).toBeVisible();
  await expect(company.getByText('Revenue last month')).toBeVisible();
  await expect(company.getByText('Spending per month')).toBeVisible();
  // Whole naira, no kobo (play-test #20).
  await expect(sheet.locator('.money-row b').first()).not.toContainText('.');
  // The company's Money screen (it has no tab of its own) is one tap on…
  await expect(company.getByRole('button', { name: 'Money and investors' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'All your money' })).toBeVisible();
  await shot(page, 'money-sheet');
  // …and "All your money" is yours: Me → Money, never the company's fundraising (#20).
  await sheet.getByRole('button', { name: 'All your money' }).click();
  await expect(page.getByRole('tab', { name: 'Money', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your wealth' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fundraising' })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-topbar-cash]').click();
  await company.getByRole('button', { name: 'Open Company' }).click();
  await expect(page.locator('.kpis').getByText('Company bank')).toBeVisible();
  await shot(page, 'company-kpis');
});

test('a warning before payday when the company can’t cover it', async ({ page }) => {
  await founder(page);
  const pill = page.locator('[data-topbar-cash]');
  await expect(pill).not.toHaveAttribute('data-payday-due');
  await expect(page.locator('[data-payday-warning]')).toHaveCount(0);
  // Pay yourself as much as you may, more than the company has: next payday is short.
  const { id, maxSalary } = await companyOf(page);
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'company.strategy', companyId: id, founderSalary: maxSalary } },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await page.reload();
  // The money pill gets a red ring (and says so); its sheet starts with the warning.
  await expect(pill).toHaveAttribute('data-payday-due', '', { timeout: 30_000 });
  await expect(pill).toHaveAttribute('aria-label', /Next payday is short/);
  await shot(page, 'payday-pill');
  await pill.click();
  const warning = page.locator('[data-money-sheet] [data-payday-warning]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Next payday');
  await shot(page, 'payday-warning');
  await warning.click();
  const sheet = page.locator('[data-payday-sheet]');
  await expect(sheet.getByText('Short by')).toBeVisible();
  await expect(sheet.getByText('Salaries next month')).toBeVisible();
  await shot(page, 'payday-sheet');
});

test('the phone’s home screen has a way back to the game', async ({ page }) => {
  await founder(page);
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone.locator('[data-app]').first()).toBeVisible();
  await shot(page, 'phone-exit');
  await phone.locator('[data-phone-exit]').click();
  await expect(phone).toBeHidden();
});
