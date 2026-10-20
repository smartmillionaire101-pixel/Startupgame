import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

/**
 * A founder answers an AI fund's questions with their own numbers: under
 * each numeric question, "Or type your own:" takes a figure. Typing clears
 * the picked choice, picking a choice clears the box, and the typed figure
 * reaches the engine (whole customers; money in minor units).
 */
test('a founder types their own figures when a fund has questions', async ({ page }) => {
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tolu E2E',
    handle: `tolu_${tag}`,
    company: `Count Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();

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

  await tab(page, 'Money').click();
  const card = page.locator('section.card').filter({ hasText: /has questions/ });
  await expect(card).toBeVisible();
  const traction = card.locator('[data-figure="traction"]');
  const revenue = card.locator('[data-figure="revenue"]');
  await expect(traction).toBeVisible();
  await expect(revenue).toBeVisible();
  await expect(card.locator('[data-figure="runway"]')).toBeVisible();
  await expect(card.getByText('How many months will your company’s money last?')).toBeVisible();

  // Picking a choice, then typing: the choice is cleared.
  const tractionField = card
    .locator('.field')
    .filter({ has: page.locator('[data-figure="traction"]') });
  const firstChoice = tractionField.locator('button.choice').first();
  await firstChoice.click();
  await expect(firstChoice).toHaveAttribute('aria-pressed', 'true');
  await traction.fill('2.5');
  await expect(firstChoice).toHaveAttribute('aria-pressed', 'false');
  await expect(tractionField.getByText('A whole number, please')).toBeVisible();
  await traction.fill('3');

  // Typing, then picking a choice: the box is cleared.
  const revenueField = card
    .locator('.field')
    .filter({ has: page.locator('[data-figure="revenue"]') });
  await revenue.fill('12');
  await revenueField.locator('button.choice').first().click();
  await expect(revenue).toHaveValue('');
  await revenue.fill('0');

  const runwayField = card
    .locator('.field')
    .filter({ has: page.locator('[data-figure="runway"]') });
  await runwayField.locator('button.choice').first().click();
  await card.getByRole('button', { name: 'Answer' }).click();
  await expect(card).toHaveCount(0);

  const pitch = await page.evaluate(async (id) => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view.pitches.find((p: { id: string }) => p.id === id);
  }, opened);
  expect(pitch.figures).toEqual({ traction: 3, revenue: 0 });
  expect(pitch.status).not.toBe('questions');
});
