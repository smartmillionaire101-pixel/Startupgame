import { expect, letters, playAsGuest, tab, test } from './fixtures';

test('an investor screens an AI startup, does diligence and writes a first cheque', async ({
  page,
}) => {
  await playAsGuest(page);

  await page.getByRole('button', { name: /Investor/ }).click();
  await page.getByRole('button', { name: /Exited founder/ }).click();
  await page.getByRole('button', { name: /Nairobi, Kenya/ }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill('Wanjiku E2E');
  await page.getByLabel('Handle').fill(`wanjiku_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel(/Typical cheque/).fill('20k');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await tab(page, 'Home').click();

  // First day: three AI startup pitches in the focus area.
  await expect(page.getByText(/wants to pitch you/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Deal flow' }).click();
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByRole('button', { name: 'First call (4h)' }).click();
  await expect(page.getByText('Diligence · level 1')).toBeVisible();
  await page.getByRole('button', { name: 'Send term sheet (2h)' }).click();
  await expect(
    page.getByText(/Accepted. You’re in.|Term sheet sent.|They walked away./),
  ).toBeVisible();

  await tab(page, 'Portfolio').click();
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
});
