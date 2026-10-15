/**
 * Phase 7: founder ambitions. A founder opens the Journey, picks an ambition
 * from the seven paths, sees its steps lead the main objective, finds it in
 * the month recap, then changes it. An investor (no founder journey) can
 * choose one too.
 */
import { expect, letters, playAsGuest, setupFounder, setupPlayer, tab, test } from './fixtures';

test('a founder picks an ambition, it leads the main objective and the recap, then changes it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Ambition',
    handle: `amb_${letters(8)}`,
    company: `Dream ${letters(6)}`,
    idea: 'Invoices for market traders',
  });

  await page.getByTestId('journey-chip').click();
  const sheet = page.getByRole('dialog', { name: 'Your journey' });
  const ambition = sheet.getByTestId('ambition');
  await expect(ambition).toHaveAttribute('data-ambition', 'none');
  // None chosen yet: the seven paths are on offer.
  await expect(ambition.locator('[data-ambition-option]')).toHaveCount(7);

  await ambition.locator('[data-ambition-option="serial"] button').click();
  await expect(ambition).toHaveAttribute('data-ambition', 'serial', { timeout: 15_000 });
  await expect(ambition).toContainText('Serial founder');
  await expect(ambition.locator('[data-step="serial.end"]')).toHaveAttribute('data-done', 'false');
  await expect(ambition.locator('[data-step="serial.companies"]')).toContainText('1 / 3');

  // Its next step leads the main objective.
  await expect(sheet.locator('[data-objective="main"]')).toContainText('Sell or close a company');

  // The month recap carries it.
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await tab(page, 'Today').click();
  await page.locator('[data-recap-open]').click();
  const recap = page.getByRole('dialog', { name: 'Your month' });
  await expect(recap.locator('[data-recap-section="ambition"]')).toContainText(
    'Serial founder: 0 of 3 steps done',
  );
  await expect(recap.locator('[data-recap-section="wealth"]')).toContainText('You can spend');
  await recap.getByRole('button', { name: 'Got it' }).click();

  // Change it: another path, and the main objective follows.
  await tab(page, 'City').click();
  await page.getByTestId('journey-chip').click();
  await ambition.getByRole('button', { name: 'Change' }).click();
  await ambition.locator('[data-ambition-option="unicorn"] button').click();
  await expect(ambition).toHaveAttribute('data-ambition', 'unicorn', { timeout: 15_000 });
  await expect(sheet.locator('[data-objective="main"]')).toContainText('Reach a $1bn valuation');
});

test('an investor chooses an ambition without a founder journey', async ({ page }) => {
  await playAsGuest(page);
  const meta = await page.request.get('/api/meta').then((r) => r.json());
  const lagos = meta.markets.find((m: { name: string }) => /Lagos/.test(m.name)).id;
  await setupPlayer(page, {
    type: 'player.create',
    handle: `ambi_${letters(8)}`,
    name: 'Ike Ambition',
    role: 'investor',
    backgroundId: 'i-first',
    market: lagos,
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 1_000_000_00 },
  });
  const res = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: { type: 'journey.ambition', id: 'angel' } },
  });
  expect(res.status(), await res.text()).toBe(200);
  const state = await page.request.get('/api/state').then((r) => r.json());
  expect(state.view.ambition.chosen).toBe('angel');
  expect(state.view.journey).toBeNull();
  const angel = state.view.ambition.options.find((o: { id: string }) => o.id === 'angel');
  expect(angel.steps.map((s: { id: string }) => s.id)).toEqual([
    'angel.first',
    'angel.portfolio',
    'angel.return',
  ]);
});
