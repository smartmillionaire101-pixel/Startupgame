import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Founder Journey 4a: decision events and rivals. The month closes (dev
 * tools) until a decision appears on Today and the top bar shows a badge.
 * The founder opens it, sees every choice with its costs and the default
 * marked, picks one, and finds it under Recent decisions. The Company tab
 * shows the named rivals.
 */

/** Founder decisions waiting (Phase 5 life events share the list and the badge). */
const founderDecisions = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' }, cache: 'no-store' });
    const s = (await r.json()) as { view?: { decisions: { open: { life: boolean }[] } } };
    return (s.view?.decisions.open ?? []).filter((e) => !e.life).length;
  });

const settle = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/dev/settle', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ market: 'kigali' }),
    });
    return r.status;
  });

test('a decision appears, the founder chooses, and sees what happened', async ({ page }) => {
  test.setTimeout(120_000);
  await playAsGuest(page);
  const handle = `de_${letters(8)}`;
  await setupFounder(page, {
    name: 'Ada Decides',
    handle,
    company: `Choose ${handle.slice(3)}`,
    idea: 'Payments for market traders',
    // Kigali: this spec advances the month many times, so it keeps clear of the
    // Lagos world most other specs share (their month must not move under them).
    market: /Kigali/,
  });

  const badge = page.locator('[data-decisions-badge]');
  for (let i = 0; i < 12; i++) {
    expect(await settle(page)).toBe(200);
    // A life event alone (it shows the badge too) isn't what this spec is about.
    if (!(await founderDecisions(page))) continue;
    await page.reload();
    await page.locator('[data-hud-bar]').waitFor();
    // Give a slow deploy time to load the view: a decision missed here would take
    // its default at the next settlement and never show.
    const shown = await badge
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (shown) break;
  }
  await expect(badge).toBeVisible();

  // The badge takes you to Today with the first decision's sheet open.
  await badge.click();
  const card = page.locator('.card.decisions');
  await expect(card.getByRole('heading', { name: /Decisions/ })).toBeVisible();
  const row = card.locator('[data-decisions-open] .decision-row').first();
  const title = (await row.locator('b').textContent())!;

  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  const choices = sheet.locator('.decision-choice');
  expect(await choices.count()).toBeGreaterThanOrEqual(2);
  // The default (what happens if you don't answer) is marked.
  await expect(sheet.getByText('If you don’t decide')).toBeVisible();

  // Pick the first choice you can make.
  const pickable = sheet.locator('.decision-choice:has(button:text("Choose this"))').first();
  const label = (await pickable.locator('.spread b').textContent())!;
  await pickable.getByRole('button', { name: 'Choose this' }).click();
  await expect(sheet).toBeHidden();

  // It moves to Recent decisions with what you chose.
  await card.locator('.decisions-recent summary').click();
  await expect(card.locator('.decisions-recent').getByText(`You chose: ${label}`)).toBeVisible();

  // The Company tab shows the named rivals.
  await page.locator('nav [data-tab="company"]').click();
  const rivals = page.locator('.card.rivals');
  await expect(rivals.getByRole('heading', { name: /Rivals/ })).toBeVisible();
  expect(await rivals.locator('[data-rival]').count()).toBeGreaterThanOrEqual(2);
});
