import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

/**
 * Founder guidance: the Company screen opens on the founder's stage (Idea,
 * its checklist and the next step), Pricing and spend checks the price as
 * it is typed, and a pitch to an AI fund comes back scored, answer by answer.
 */
test('a founder sees the stage tracker, a pricing warning and a scored pitch', async ({ page }) => {
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Kemi E2E',
    handle: `kemi_${tag}`,
    company: `Stall Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();

  // The stage tracker, at the top of the Company screen.
  await tab(page, 'Company').click();
  const stage = page.locator('[data-founder-stage]');
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute('data-founder-stage', 'idea');
  await expect(stage.getByText(/^Idea: \d of 3 done$/)).toBeVisible();
  await expect(stage.locator('[data-task="idea.discovery"]')).toBeVisible();
  await expect(page.locator('[data-next-task]')).toBeVisible();
  await expect(page.locator('[data-coming="first-customers"]')).toBeVisible();

  // A price far above what customers pay: a red check, with the figures, as you type.
  await page.getByRole('tab', { name: 'Customers' }).click();
  const pricing = page.locator('section.card').filter({ hasText: 'Pricing and spend' });
  await expect(pricing.locator('[data-founder-check="budget"]')).toHaveAttribute(
    'data-level',
    'good',
  );
  await pricing.getByLabel(/Price per customer per month/).fill('9000000');
  const budget = pricing.locator('[data-founder-check="budget"]');
  await expect(budget).toHaveAttribute('data-level', 'bad');
  await expect(budget).toContainText('is above their budget');
  await expect(pricing.locator('[data-check-headline]')).toContainText(
    'Your price is above what customers pay',
  );
  await expect(pricing.locator('[data-founder-check="runway"]')).toBeVisible();

  // Pitch AI funds (through the API) until one asks questions.
  const opened = await page.evaluate(async () => {
    const h = { 'x-runway': '1', 'content-type': 'application/json' };
    const s = await (await fetch('/api/state', { headers: h })).json();
    const c = s.view.companies[0];
    for (const f of s.view.market.funds.filter((x: { ai: boolean }) => x.ai)) {
      const r = await fetch('/api/commands', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          command: {
            type: 'pitch.start',
            companyId: c.id,
            fundId: f.id,
            slides: ['problem', 'product', 'team'],
            ask: f.check[0],
          },
        }),
      });
      if (!r.ok) continue;
      const out = await r.json();
      if (out.result.status === 'questions') return out.result.pitchId as string;
    }
    return null;
  });
  test.skip(!opened, 'No fund in this world asked questions of a brand-new founder.');
  await page.reload();

  // Answer honestly (the first choice is the true figure) and read the scores.
  await tab(page, 'Money').click();
  const card = page.locator('section.card').filter({ hasText: /has questions/ });
  await expect(card).toBeVisible();
  for (const field of await card.locator('.field').all())
    await field.locator('button.choice').first().click();
  await card.getByRole('button', { name: 'Answer' }).click();
  const result = page.locator(`[data-pitch-result="${opened}"]`);
  await expect(result).toBeVisible();
  await expect(result.locator('[data-answer-score]').first()).toBeVisible();
  await expect(result.getByText('That was the best answer.').first()).toBeVisible();
  await expect(result.getByText(/^Because:/).first()).toBeVisible();
  await expect(result.getByText(/avg \d+/)).toBeVisible();
  const pitch = await page.evaluate(async (id) => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view.pitches.find((p: { id: string }) => p.id === id);
  }, opened);
  expect(pitch.scores.length).toBeGreaterThan(0);
  // A pass names the real reason, with how to fix it.
  if (pitch.status === 'passed' && pitch.passWhy) {
    await expect(result.locator('[data-pass-why]')).toBeVisible();
    await expect(result.getByText('How to fix it:')).toBeVisible();
  }
});
