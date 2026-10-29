import { expect, letters, playAsGuest, setupFounder, tab, test, openMoney } from './fixtures';

/**
 * The investor asks about your real numbers (round 7: the pitch meeting
 * replaced the questions form, where you could type your own figures). His
 * questions and the side column show the company's own figures; a stretch
 * is tagged as something he will check in diligence, and the claim is kept
 * for diligence. A meeting left half-way can be picked up from the Money
 * screen, or left: that ends it without putting the fund off.
 */
test('a pitch meeting asks about your real numbers, and can be left half-way', async ({ page }) => {
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Tolu E2E',
    handle: `tolu_${tag}`,
    company: `Count Pay ${tag}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'Today')).toBeVisible();

  // Pitch AI funds (through the API) until one takes the meeting.
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
      if (out.result.status === 'meeting') return { pitchId: out.result.pitchId, fundId: f.id };
    }
    return null;
  });
  expect(opened, 'an AI fund that fits takes the meeting').not.toBeNull();
  const pitchOf = () =>
    page.evaluate(async (id) => {
      const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
      return s.view.pitches.find((p: { id: string }) => p.id === id);
    }, opened!.pitchId);
  const facts = (await pitchOf()).meeting.facts;
  await page.reload();

  // Mid-way: the Money screen offers to pick it up.
  await openMoney(page);
  await page.locator('[data-meeting-resume]').click();
  const sheet = page.getByRole('dialog', { name: /^Pitch meeting/ });
  // His side has your numbers.
  await expect(sheet.locator('[data-fact="customers"]')).toHaveText(String(facts.customers));
  await expect(sheet.locator('[data-fact="runway"]')).toContainText(
    facts.runway === null ? 'never runs out' : `${Math.round(facts.runway)} months`,
  );
  await sheet.locator('[data-opener]').first().click();
  // His first question is about them, from your numbers.
  const q = sheet.locator('[data-question="traction"]');
  await expect(q).toContainText(
    facts.customers === 0
      ? 'no paying customers'
      : facts.customers === 1
        ? 'one paying customer'
        : `${facts.customers} paying customers`,
  );
  await expect(q.locator('.pm-from.num')).toHaveText('from your numbers');
  // A stretch: tagged, and kept for diligence.
  const stretch = sheet.locator('[data-turn="q-traction"] [data-answer="stretch"]');
  await expect(stretch.locator('.pm-from.check')).toContainText('will check this in diligence');
  await stretch.click();
  await expect(sheet.locator('[data-reaction="traction"]')).toContainText('We’ll check');
  expect((await pitchOf()).meeting.questions[0].answer.id).toBe('stretch');

  // Leave it half-way: no verdict, and the fund can be pitched again.
  await sheet.locator('[data-pitch-leave]').click();
  await expect(sheet.getByRole('heading', { name: 'You left the meeting' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-meeting-resume]')).toHaveCount(0);
  const left = await pitchOf();
  expect(left.meeting.left).toBe(true);
  expect(left.meeting.result).toBeNull();
  await page.locator('summary').filter({ hasText: 'Pitch history' }).click();
  await expect(page.getByText('Left the meeting').first()).toBeVisible();
  const again = await page.evaluate(async (fundId) => {
    const h = { 'x-runway': '1', 'content-type': 'application/json' };
    const s = await (await fetch('/api/state', { headers: h })).json();
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        command: {
          type: 'pitch.start',
          companyId: s.view.companies[0].id,
          fundId,
          slides: ['problem'],
          ask: s.view.market.funds.find((f: { id: string }) => f.id === fundId).check[0],
        },
      }),
    });
    return (await r.json()).result?.status;
  }, opened!.fundId);
  expect(again).toBe('meeting');
});
