import { setupPlayer } from './fixtures';
import { expect, letters, playAsGuest, tab, test } from './fixtures';

test('an investor screens an AI startup, does diligence and writes a first cheque', async ({
  page,
}) => {
  await playAsGuest(page);

  await setupPlayer(page, {
    type: 'player.create',
    name: 'Wanjiku E2E',
    handle: `wanjiku_${letters(6)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'nairobi',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await tab(page, 'Today').click();

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
