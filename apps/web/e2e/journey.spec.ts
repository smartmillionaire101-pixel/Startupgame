/**
 * The founder journey: a new founder sees the Journey chip on the City,
 * opens it on Chapter 1 (The Hustle) with its steps, dismisses the main
 * objective for the next one, pins it, and takes a Go button to the Market.
 */
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

test('a new founder opens the Journey on Chapter 1 and follows a step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Journey',
    handle: `jour_${letters(8)}`,
    company: `Hustle ${letters(6)}`,
    idea: 'Invoices for market traders',
  });

  const chip = page.getByTestId('journey-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Chapter 1 · The Hustle');
  await chip.click();

  const sheet = page.getByRole('dialog', { name: 'Your journey' });
  await expect(sheet).toBeVisible();
  // Seven chapters; the first is where you are, the rest still to come.
  await expect(sheet.locator('[data-chapter]')).toHaveCount(7);
  const ch1 = sheet.locator('[data-chapter="1"]');
  await expect(ch1).toHaveClass(/journey-current/);
  await expect(ch1).toContainText('You are here');
  await expect(sheet.locator('[data-chapter="2"]')).toHaveClass(/journey-upcoming/);
  // Its steps: the company and the first-day customer are ticked already.
  await expect(ch1.locator('[data-step="hustle.company"]')).toHaveAttribute('data-done', 'true', {
    timeout: 15_000,
  });
  await expect(ch1.locator('[data-step="hustle.first-customer"]')).toHaveAttribute(
    'data-done',
    'true',
    { timeout: 15_000 },
  );
  const discovery = ch1.locator('[data-step="hustle.discovery"]');
  await expect(discovery).toHaveAttribute('data-done', 'false');
  await expect(discovery).toContainText('Talk to customers about their problem');
  await expect(ch1.locator('[data-step="hustle.customers"]')).toContainText('1 / 3');

  // Three objectives: main, an opportunity and something personal.
  const main = sheet.locator('[data-objective="main"]');
  await expect(main).toContainText('Talk to customers about their problem');
  await expect(sheet.locator('[data-objective="opportunity"]')).toBeVisible();
  await expect(sheet.locator('[data-objective="personal"]')).toBeVisible();

  // Not now: the next step takes its place. Pin it and it stays.
  await main.getByRole('button', { name: 'Not now: show me another' }).click();
  // Another Chapter 1 step takes its place (which one depends on what's done by now).
  await expect(main).not.toContainText('Talk to customers about their problem', {
    timeout: 15_000,
  });
  await main.getByRole('button', { name: 'Pin: keep this one here' }).click();
  await expect(main.getByRole('button', { name: 'Unpin' })).toHaveAttribute(
    'aria-pressed',
    'true',
    {
      timeout: 15_000,
    },
  );

  // Go walks to the Market's stalls.
  await discovery.getByRole('button', { name: 'Go' }).click();
  await expect(sheet).toBeHidden();
  const room = page.getByRole('dialog');
  await expect(room).toHaveAttribute('data-room', 'market', { timeout: 15_000 });
});
