import { digits, expect, test } from './fixtures';

/**
 * Smoke test that is safe to run against the live game: it checks the app,
 * the API and sign-in end to end, then deletes the account it created, so no
 * test player ever enters the shared world.
 */
test('the live site serves the app, the API and sign-in, and cleans up after itself', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).ok).toBe(true);
  const meta = await (await request.get('/api/meta')).json();
  expect(meta.markets.length).toBeGreaterThanOrEqual(3);
  const digest = await request.get('/api/digest?market=lagos');
  expect(digest.ok()).toBe(true);
  expect((await digest.json()).headlines).toBeDefined();
  // Unknown client routes fall back to the app shell.
  const deep = await request.get('/some/deep/link');
  expect(deep.ok()).toBe(true);
  expect(await deep.text()).toContain('<div id="root">');

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
  // Language switch works before sign-in.
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('button', { name: 'Envoyer le code' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();

  await page.getByLabel('Mobile number').fill(`+1555${digits(7)}`);
  await page.getByLabel('Date of birth').fill('1985-07-01');
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.getByText(/your code is \d{6}/i).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  // Signed in: onboarding starts with the three roles.
  await expect(page.getByRole('button', { name: /Founder/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Banker/ })).toBeVisible();

  // Clean up: delete the test account.
  const del = await page.evaluate(async () => {
    const r = await fetch('/api/account', { method: 'DELETE', headers: { 'x-runway': '1' } });
    return r.status;
  });
  expect(del).toBe(200);
});
