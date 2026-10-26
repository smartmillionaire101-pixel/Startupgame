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

test('the top bar’s cash shows your money and your company’s', async ({ page }) => {
  await founder(page);
  await page.locator('[data-topbar-cash]').click();
  const sheet = page.locator('[data-money-sheet]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('In your account')).toBeVisible();
  const company = sheet.locator('[data-company-money]');
  await expect(company.getByText('In the company bank')).toBeVisible();
  await expect(company.getByText('Revenue last month')).toBeVisible();
  await expect(company.getByText('Spending per month')).toBeVisible();
  await shot(page, 'money-sheet');
  await company.getByRole('button', { name: 'Open Company' }).click();
  await expect(page.locator('.kpis').getByText('Company bank')).toBeVisible();
  await shot(page, 'company-kpis');
});

test('a warning before payday when the company can’t cover it', async ({ page }) => {
  await founder(page);
  await expect(page.locator('[data-payday-warning]')).toHaveCount(0);
  // Pay yourself as much as you may, more than the company has: next payday is short.
  const { id, maxSalary } = await companyOf(page);
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'company.strategy', companyId: id, founderSalary: maxSalary } },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await page.reload();
  const warning = page.locator('[data-payday-warning]');
  await expect(warning).toBeVisible({ timeout: 30_000 });
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
