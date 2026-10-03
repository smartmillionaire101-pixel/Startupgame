import { expect, test } from '@playwright/test';

test('an investor screens an AI startup, does diligence and writes a first cheque', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Mobile number').fill(`+25471${Date.now().toString().slice(-7)}`);
  await page.getByLabel('Date of birth').fill('1988-11-02');
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.getByText(/Dev mode: your code is \d{6}/).textContent())!.match(
    /\d{6}/,
  )![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();

  await page.getByRole('button', { name: /Investor/ }).click();
  await page.getByRole('button', { name: /Exited founder/ }).click();
  await page.getByRole('button', { name: /Nairobi, Kenya/ }).click();
  await page.getByLabel('Your name').fill('Wanjiku E2E');
  await page.getByLabel('Handle').fill(`wanjiku_${Date.now().toString().slice(-5)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel(/Typical cheque/).fill('20k');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

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

  await page.getByRole('button', { name: 'Portfolio' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
});
