import { test, expect, fillAboutYou, letters, pickLook, pickPath, tab } from './fixtures';

test.use({ viewport: { width: 360, height: 780 } });
for (const role of ['founder', 'investor', 'banker'] as const) {
  test(`name, sex, city and three fields enter immediately as ${role}; details persist from profile`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // Three short steps: the path, the look, then about you (the only typing).
    await pickPath(page, role);
    await pickLook(page, { gender: 'Man' });
    await expect(page.getByRole('textbox')).toHaveCount(3);
    await expect(page.getByRole('combobox')).toHaveCount(role === 'founder' ? 1 : 0);
    await expect(page.getByLabel('Company name')).toHaveCount(0);
    const email = `quick-${letters()}@example.com`;
    const city = role === 'banker' ? 'London' : 'Lagos';
    await fillAboutYou(page, {
      name: `Quick ${role}`,
      username: `quick_${letters(8)}`,
      email,
      city,
    });
    await page.screenshot({ path: testInfo.outputPath('entry-mobile.png') });
    await page.getByRole('button', { name: /^Play/ }).click();
    await expect(
      page.getByRole('application', { name: new RegExp(`Map of ${city}`) }),
    ).toBeVisible();
    const state = await page.request.get('/api/state').then((r) => r.json());
    expect(state.view.me.role).toBe(role);
    expect(state.view.market.name).toBe(city);
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
