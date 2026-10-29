import { expect, letters, playAsGuest, setupFounder, tab, test, openMoney } from './fixtures';

/**
 * Founder guidance: the Company screen opens on the founder's stage (Idea,
 * its checklist and the next step), Pricing and spend checks the price as
 * it is typed, and a pitch meeting with an AI fund comes back scored: what
 * moved the partner, in points (round 7: the meeting replaced the questions form).
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
  await expect(stage.getByText(/^Idea · \d\/3$/)).toBeVisible();
  await expect(stage.locator('[data-task="idea.discovery"]')).toBeVisible();
  // The figures the engine gives, on the right of the row.
  await expect(stage.locator('[data-task="idea.discovery"] .fg-task-meta')).toHaveText(
    /^\d+ of \d+ points$/,
  );
  // The next step's button sits inside the card (no separate "Next step" card).
  await expect(stage.locator('[data-next-task]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next step' })).toHaveCount(0);
  await expect(page.locator('[data-coming="first-customers"]')).toBeVisible();
  // "Why this stage?" is closed until tapped.
  await expect(stage.locator('[data-stage-why-text]')).toHaveCount(0);
  await stage.getByRole('button', { name: 'Why this stage?' }).click();
  await expect(stage.locator('[data-stage-why-text]')).toContainText('Finish all 3');
  await stage.getByRole('button', { name: 'Hide why' }).click();
  await expect(stage.locator('[data-stage-why-text]')).toHaveCount(0);

  // On the phone (412px): the card fits one screen, each stage name on at most two lines,
  // never broken inside a word ("customer / s").
  const tracker = page.locator('.fg-tracker');
  const h = (await tracker.boundingBox())!.height;
  expect(h).toBeLessThan(600);
  const names = await stage.locator('.fg-step-name').evaluateAll((els) =>
    els.map((e) => {
      const line = parseFloat(getComputedStyle(e).lineHeight);
      const range = document.createRange();
      range.selectNodeContents(e);
      const rows = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      return { text: e.textContent, lines: e.scrollHeight / line, rows: rows.size };
    }),
  );
  for (const n of names) {
    expect(n.lines, n.text ?? '').toBeLessThanOrEqual(2.05);
    // A word never splits: rows never outnumber the words.
    expect(n.rows, n.text ?? '').toBeLessThanOrEqual((n.text ?? '').split(' ').length);
  }
  // The next step's label is whole, not cut with "…".
  const go = stage.locator('.fg-go-label');
  expect(await go.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  // The stepper's short names, each on one line.
  const fc = names.find((n) => n.text === 'Customers')!;
  expect(fc.rows).toBe(1);
  expect(names.find((n) => n.text === 'Fit')!.rows).toBe(1);

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

  // Pitch AI funds (through the API) until one takes the meeting (gameplay note).
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
      if (out.result.status === 'meeting') return out.result.pitchId as string;
    }
    return null;
  });
  expect(opened, 'an AI fund that fits takes the meeting').not.toBeNull();
  await page.reload();

  // Play it honestly from the Money screen, and read the score: what moved him, in points.
  await openMoney(page);
  await page.locator('[data-meeting-resume]').click();
  const sheet = page.getByRole('dialog', { name: /^Pitch meeting/ });
  await sheet.locator('[data-opener]').first().click();
  await expect(sheet.locator('[data-reaction="opener"]')).toBeVisible();
  for (const q of ['traction', 'runway', 'competition']) {
    const honest = sheet.locator(`[data-turn="q-${q}"] [data-answer="true"]`);
    if (
      !(await honest.waitFor({ timeout: 3000 }).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await honest.click();
    await expect(sheet.locator(`[data-reaction="${q}"]`)).toBeVisible();
  }
  await sheet.locator('[data-ask-option="inside"]').click();
  const result = sheet.locator('[data-pitch-result]');
  await expect(result).toBeVisible();
  const pitch = await page.evaluate(async (id) => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view.pitches.find((p: { id: string }) => p.id === id);
  }, opened);
  const r = pitch.meeting.result;
  await expect(result).toHaveAttribute('data-pitch-score', String(r.score));
  await expect(sheet.locator('[data-moved-id]')).toHaveCount(r.moved.length);
  for (const m of r.moved as { id: string; points: number }[])
    await expect(sheet.locator(`[data-moved-id="${m.id}"]`)).toHaveAttribute(
      'data-points',
      String(m.points),
    );
  // An honest meeting: a term sheet, a pass (what held him back), or his partners next.
  expect(['term-sheet', 'passed', 'partners']).toContain(r.outcome);
  if (r.outcome === 'passed')
    await expect(sheet.getByRole('heading', { name: /^What held .+ back$/ })).toBeVisible();
  if (r.outcome === 'term-sheet')
    await expect(sheet.getByRole('heading', { name: /^What moved / })).toBeVisible();
});
