import { expect, letters, playAsGuest, setupFounder, tab, test, openMoney } from './fixtures';

/** Chapter 2 (§6.4, FR-007): open a role, find candidates, interview, hire; or pick an AI co-founder. */
test('a founder opens a role, sources candidates, interviews one and hires them', async ({
  page,
}) => {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Hana E2E',
    handle: `hana_${letters(6)}`,
    company: `Hire Pay ${letters(5)}`,
    idea: 'Payroll for small shops',
    market: /Lagos, Nigeria/,
  });
  await expect(tab(page, 'Today')).toBeVisible();
  await tab(page, 'Company').click();
  await page.getByRole('tab', { name: 'Team' }).click();

  // Team health names the gaps in plain words.
  await expect(page.getByRole('heading', { name: 'Team health' })).toBeVisible();
  await expect(page.getByText(/No engineer: you are the only one building/)).toBeVisible();

  // Post an engineering role (the fee is shown first).
  await expect(
    page.getByText('No open roles. Post one to start meeting candidates.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Post the job \(/ }).click();
  await expect(page.getByText('Job posted. Now find candidates for it.')).toBeVisible();

  // Find candidates.
  await page.getByRole('button', { name: 'Find candidates (2h)' }).click();
  await expect(page.getByText(/candidates applied\./).first()).toBeVisible();
  const card = page.locator('li.hire-cand').first();
  await expect(card.getByText(/CV says \d+/)).toBeVisible();
  await expect(card.getByText('Unknown until interviewed').first()).toBeVisible();

  // A technical interview reveals true skill; a culture one reveals fit.
  await card.getByRole('button', { name: 'Technical interview (3h)' }).click();
  await expect(page.getByText(/Interview with .* done: true skill \d+/)).toBeVisible();
  await expect(card.getByText(/\d+ \(checked\)/)).toBeVisible();
  await card.getByRole('button', { name: 'Culture interview (2h)' }).click();
  await expect(card.getByText(/(Great|Decent|Poor) fit/)).toBeVisible();
  await expect(card.getByRole('button', { name: /^Paid work trial \(6h \+ / })).toBeVisible();

  // Offer well above the ask: they accept, with a plain dilution note first.
  await card.getByRole('button', { name: 'Make an offer' }).click();
  const sheet = page.getByRole('dialog', { name: /Offer to/ });
  await expect(sheet.getByText(/No equity: your stake stays/)).toBeVisible();
  const salary = sheet.getByLabel(/Salary per month/);
  await salary.fill('20m');
  await sheet.getByRole('button', { name: 'Make offer (2h)' }).click();
  await expect(sheet.getByText('Accepted:')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();

  // They're on the team, with workload and leaving risk shown.
  await expect(page.getByRole('heading', { name: /Team · 1/ })).toBeVisible();
  await expect(page.getByText(/Leaving risk: (Low|Medium|High)/)).toBeVisible();
  await expect(page.getByText(/Workload \d+%/)).toBeVisible();
});

test('a founder chooses an AI co-founder and sees the cap table change', async ({ page }) => {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Kofi E2E',
    handle: `kofi_${letters(6)}`,
    company: `Duo Pay ${letters(5)}`,
    idea: 'Invoices for freelancers',
    market: /Lagos, Nigeria/,
  });
  await expect(tab(page, 'Today')).toBeVisible();
  await tab(page, 'Company').click();
  await page.getByRole('tab', { name: 'Team' }).click();

  // Both ways in are offered.
  await expect(page.getByRole('button', { name: 'Invite a real player' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose an AI co-founder' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose an AI co-founder' });
  await expect(
    sheet.getByText('Builds the product with you and leads the engineers.'),
  ).toBeVisible();
  await expect(sheet.getByText(/Your stake goes from 100\.0% to \d+\.\d%/).first()).toBeVisible();
  await sheet
    .getByRole('button', { name: /^Bring in .* \(4h\)$/ })
    .first()
    .click();
  await expect(sheet).toHaveCount(0);
  const joined = page.getByText(/is your CTO co-founder\./);
  await expect(joined).toBeVisible();
  const who = ((await joined.textContent()) ?? '').replace(/ is your CTO co-founder\.$/, '');
  await expect(page.getByText('Co-founder', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Team · 1/ })).toBeVisible();

  // The cap table shows them as an owner with founder shares.
  await openMoney(page);
  await page.getByRole('tab', { name: 'Cap Table' }).click();
  const row = page.getByRole('row').filter({ hasText: who }).filter({ hasText: 'founder' });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^\d+(\.\d)?%$/)).toBeVisible();
});
