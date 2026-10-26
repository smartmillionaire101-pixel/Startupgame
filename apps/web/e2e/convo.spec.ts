import { expect, letters, playAsGuest, salesConversation, setupFounder, test } from './fixtures';

/**
 * Round two (player feedback: "When I click interview customers I don't
 * really interview"; "I simply click and I have a customer. I should be
 * quizzed"). A founder walks to the Market and interviews a customer: meets
 * them, asks a question in each of three rounds, watches the notes fill in,
 * and reads the scored summary with the gain in customer understanding. Then
 * in Sales, they sit down with a prospect for a sales conversation (lead,
 * price against the budget band, terms, live win chance) and ask for the
 * deal: won or lost, scored, with the best call at each turn.
 */
test('a founder interviews a customer, then wins or loses a scored sales conversation', async ({
  page,
}) => {
  test.slow();
  await playAsGuest(page);
  const handle = `cv_${letters(8)}`;
  await setupFounder(page, {
    name: 'Ada Convo',
    handle,
    company: `Talk ${handle.slice(3)}`,
    idea: 'Payments for market traders',
  });
  const dir = process.env.CONVO_SHOTS;

  // The Market's stall: "Interview a customer" opens the interview.
  await page.getByRole('button', { name: /Places/ }).click();
  await page.getByRole('dialog', { name: 'Places' }).locator('[data-kind="stall"]').first().click();
  const room = page.getByRole('dialog').first();
  await expect(room).toHaveAttribute('data-room', 'market', { timeout: 10_000 });
  await page.locator('.tray-card[data-action="interview"]').click();
  const sheet = page.getByRole('dialog', { name: /^Customer interview/ });
  await expect(sheet).toBeVisible();
  const iv = sheet.locator('[data-interview]');
  await expect(iv).toHaveAttribute('data-interview', 'intro');
  await expect(sheet.locator('[data-understanding]')).toHaveText('0%');
  if (dir) await page.screenshot({ path: `${dir}/interview-meet.png` });
  await sheet.getByRole('button', { name: 'Start the interview' }).click();
  await expect(iv).toHaveAttribute('data-interview', 'round', { timeout: 15_000 });

  // Three rounds: three questions each; the answer comes back in character and the notes fill in.
  for (let round = 0; round < 3; round++) {
    const options = sheet.locator('button[data-question]');
    await expect(options).toHaveCount(3);
    // Ask the open question about a real past event where there is one (its id says so).
    const ids = await options.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-question')!),
    );
    const pick = ids.find((id) => id.includes('.best.')) ?? ids[0]!;
    await sheet.locator(`button[data-question="${pick}"]`).click();
    if (round < 2) {
      await expect(sheet.locator(`[data-round-review="${round}"]`)).toBeVisible({
        timeout: 15_000,
      });
      // Once asked, the round shows what kind each question was.
      await expect(sheet.locator(`[data-round-review="${round}"] [data-kind]`)).toHaveCount(3);
      await expect(sheet.locator('[data-answer]')).toBeVisible();
      if (round === 0) {
        await expect(sheet.locator('[data-note="pain"] dd')).not.toHaveText('not yet asked…');
        if (dir) await page.screenshot({ path: `${dir}/interview-round.png` });
      }
      await sheet.getByRole('button', { name: `Round ${round + 2}` }).click();
    }
  }

  // The summary: a score, each question marked with why, the question to ask next time, the gain.
  await expect(iv).toHaveAttribute('data-interview', 'summary', { timeout: 15_000 });
  const score = sheet.locator('[data-interview-score]');
  await expect(score).toHaveAttribute('data-interview-score', '100');
  await expect(sheet.locator('[data-mark]')).toHaveCount(3);
  await expect(sheet.getByText('Best question you missed')).toBeVisible();
  await expect(sheet.locator('[data-gain]')).toContainText('10%');
  if (dir) await page.screenshot({ path: `${dir}/interview-summary.png`, fullPage: true });
  await sheet.getByRole('button', { name: 'Done for today' }).click();
  await expect(sheet).toBeHidden();
  const state = await page.request.get('/api/state').then((r) => r.json());
  const c = state.view.companies[0];
  expect(Math.max(...(Object.values(c.product.discovery) as number[]))).toBeGreaterThan(0);
  expect(c.interviews.last.score).toBe(100);
  await room.getByRole('button', { name: 'Close' }).first().click();

  // Sales: find a lead, call them, then sit down for the conversation.
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await page
    .getByRole('button', { name: /^Phone/ })
    .first()
    .click();
  await expect(phone).toBeVisible();
  await phone.locator('[data-app="sales"]').click();
  const sales = phone.locator('[data-sales]');
  let outcome: 'won' | 'lost' | null = null;
  for (let round = 0; round < 3 && !outcome; round++) {
    await sales.getByRole('button', { name: 'Find new leads' }).click();
    const lead = sales.locator('[data-deal-stage="lead"]').first();
    await expect(lead).toBeVisible({ timeout: 15_000 });
    const id = await lead.getAttribute('data-deal');
    const deal = sales.locator(`[data-deal="${id}"]`);
    await deal.locator('button[data-action="contact"]').click();
    await deal.locator('[data-confirm="contact"]').getByRole('button', { name: 'Confirm' }).click();
    await expect(deal).toHaveAttribute('data-deal-stage', 'contacted', { timeout: 15_000 });
    const r = await salesConversation(page, deal);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    await expect(deal).toHaveAttribute('data-deal-stage', r.result);
    // The scored result stays on the deal card.
    await expect(deal.locator('button[data-action="talk-result"]')).toBeVisible();
    outcome = r.result;
    if (dir) {
      await deal.locator('button[data-action="talk-result"]').click();
      await page.screenshot({ path: `${dir}/sales-result.png`, fullPage: true });
      await page
        .getByRole('dialog', { name: /^Sales conversation/ })
        .getByRole('button', { name: 'Close', exact: true })
        .first()
        .click();
    }
  }
  expect(outcome).not.toBeNull();
  if (outcome === 'won')
    await expect(
      sales.getByRole('list', { name: 'Customers from your pipeline' }).locator('[data-account]'),
    ).toHaveCount(1);
});

/**
 * Player feedback: "when I select health tech it just give me the same
 * questions… If I select a health tech my client base needs have to be
 * different same if I select logistics". A health-tech founder is asked about
 * patients and clinics, a logistics founder about deliveries and drivers, and
 * neither hears a payments question. CONVO_SHOTS saves round 2 of each.
 */
for (const { industry, idea, own } of [
  {
    industry: 'healthtech',
    idea: 'Health tech providing access to quality care',
    own: /doctor|clinic|patient|care|health/i,
  },
  {
    industry: 'logistics',
    idea: 'Same-day deliveries for shops',
    own: /deliver|parcel|courier|driver|pickup/i,
  },
])
  test(`a ${industry} founder's interview asks about ${industry}`, async ({ page }) => {
    await playAsGuest(page);
    const handle = `iv_${letters(8)}`;
    await setupFounder(page, {
      name: 'Ada Mmna',
      handle,
      company: `Mmna ${handle.slice(3)}`,
      idea,
      industry,
    });
    await page.getByRole('button', { name: /Places/ }).click();
    await page
      .getByRole('dialog', { name: 'Places' })
      .locator('[data-kind="stall"]')
      .first()
      .click();
    await expect(page.getByRole('dialog').first()).toHaveAttribute('data-room', 'market', {
      timeout: 10_000,
    });
    await page.locator('.tray-card[data-action="interview"]').click();
    const sheet = page.getByRole('dialog', { name: /^Customer interview/ });
    await sheet.getByRole('button', { name: 'Start the interview' }).click();
    const options = sheet.locator('button[data-question]');
    await expect(options).toHaveCount(3, { timeout: 15_000 });
    const fintech = /\b(payments?|payouts?|transfers?|owes?|ledger|loans?|bank)\b/i;
    const asked: string[] = [];
    for (let round = 0; round < 2; round++) {
      const texts = await options.allTextContents();
      asked.push(...texts);
      for (const q of texts) expect(q, `round ${round + 1}`).not.toMatch(fintech);
      const ids = await options.evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-question')!),
      );
      await sheet
        .locator(`button[data-question="${ids.find((id) => id.includes('.best.'))}"]`)
        .click();
      await expect(sheet.locator(`[data-round-review="${round}"]`)).toBeVisible({
        timeout: 15_000,
      });
      await expect(sheet.locator('[data-answer]').last()).not.toHaveText(fintech);
      await sheet.getByRole('button', { name: `Round ${round + 2}` }).click();
      if (round === 0) {
        await expect(options).toHaveCount(3);
        await options.last().scrollIntoViewIfNeeded();
        if (process.env.CONVO_SHOTS)
          await page.screenshot({
            path: `${process.env.CONVO_SHOTS}/interview-${industry}-round2.png`,
          });
      }
    }
    expect(asked.join(' ')).toMatch(own);
  });
