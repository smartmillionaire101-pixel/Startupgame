import { setupPlayer } from './fixtures';
import { expect, letters, playAsGuest, tab, test } from './fixtures';

test('a banker applies for a licence in Accra, gets it, and sets pricing', async ({ page }) => {
  await playAsGuest(page);

  await setupPlayer(page, {
    type: 'player.create',
    name: 'Ama E2E',
    handle: `ama_${letters(6)}`,
    role: 'banker',
    backgroundId: 'b-wealthy',
    market: 'accra',
    gender: 'female',
    bank: { name: `Adinkra Trust ${letters(5)}`, bankType: 'microfinance' },
  });

  await tab(page, 'Bank').click();
  await expect(page.getByText('Applying')).toBeVisible();

  // Two game months later the central bank decides.
  await tab(page, 'Today').click();
  for (let i = 0; i < 2; i++) {
    const settled = page.waitForResponse((r) => r.url().endsWith('/api/dev/settle'));
    await page.getByRole('button', { name: /Advance Accra one month/ }).click();
    const res = await settled;
    expect(res.status(), await res.text()).toBe(200);
    await expect(page.getByText(/Advanced to month \d+\./).last()).toBeVisible();
  }
  await tab(page, 'Bank').click();
  await expect(page.getByText(/Licensed ·/)).toBeVisible();
  await page.getByLabel('Deposit rate (%)').fill('8');
  await page.getByRole('button', { name: 'Save pricing' }).click();
  await expect(page.getByText('Pricing updated.')).toBeVisible();
});
