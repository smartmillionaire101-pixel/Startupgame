import { test, expect, letters, tab } from './fixtures';

test.use({ viewport: { width: 360, height: 780 } });
for (const role of ['founder', 'investor', 'banker'] as const) {
  test(`three fields enter immediately as ${role}; details persist from profile`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('textbox')).toHaveCount(2);
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await expect(page.getByLabel('Company name')).toHaveCount(0);
    await page.getByLabel('Username', { exact: true }).fill(`quick_${letters(8)}`);
    const email = `quick-${letters()}@example.com`;
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Join as').selectOption(role);
    await page.screenshot({ path: testInfo.outputPath('entry-mobile.png') });
    await page.getByRole('button', { name: 'Play now' }).click();
    await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
    const state = await page.request.get('/api/state').then((r) => r.json());
    expect(state.view.me.role).toBe(role);
    expect(state.view.companies).toHaveLength(0);
    expect(state.account.pendingEmail).toBe(email);
    await tab(page, 'Today').click();
    await tab(page, 'Me').click();
    await expect(page.getByText(`Email: ${email} (not confirmed)`)).toBeVisible();
    await page.getByLabel('Your name').fill('My New Name');
    await page.getByLabel('You are', { exact: true }).selectOption('male');
    if (role === 'investor') {
      await page.getByLabel('Sectors', { exact: true }).selectOption(['saas']);
      await page.getByLabel('Typical cheque', { exact: true }).fill('50k');
    }
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    if (role === 'founder')
      await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
    if (role === 'banker')
      await expect(page.getByRole('heading', { name: 'Start a bank' })).toBeVisible();
    await page.reload();
    await tab(page, 'Me').click();
    await expect(page.getByLabel('Your name')).toHaveValue('My New Name');
    await expect(page.getByLabel('You are', { exact: true })).toHaveValue('male');
    if (role === 'investor')
      await expect(page.getByLabel('Sectors', { exact: true })).toHaveValues(['saas']);
    expect(errors).toEqual([]);
  });
}
