import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupPlayer, tab, test } from './fixtures';

/**
 * Investor deal flow (deal-flow release): a new investor goes to a tech
 * event from the Events app and founders pitch them (follow-up meeting,
 * invest); the pitches and what other investors taught them sit in
 * Portfolio → Pipeline. Then Fund I is pitched to the city's LPs as a
 * strategy: the checks run live, and LPs answer with questions, reasons and
 * commitments. A realistic first fund (more-games release): the form
 * suggests the size LPs take seriously, an oversized ask fails with next
 * steps, and Fund I at the suggested size is anchored and holds a first close.
 *
 * DEALFLOW_SHOTS=<dir> saves screenshots of each step.
 */

const SHOTS = process.env.DEALFLOW_SHOTS;
const shot = async (page: Page, name: string, prefix = 'dealflow') => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${prefix}-${name}.png` });
};

interface Pitch {
  companyId: string;
  hot: boolean;
  pitch: { ask: number; valuation: number; instrument: 'safe' | 'priced' };
}
interface State {
  market: {
    techEvents?: { id: string; status: string; ticket: number; founderPitches?: boolean }[];
  };
  investorDealFlow?: { pitches: Pitch[] } | null;
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as State;
  });

const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.json() };
  }, cmd);

async function newInvestor(page: Page) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: `Ife${letters(4)} Angel`,
    handle: `df_${letters(8)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'lagos',
    gender: 'female',
    investor: { sectors: ['fintech', 'saas'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  // Straight to the investor's own game (the guided first session has its own test).
  expect((await command(page, { type: 'investor.tutorial', action: 'skip' })).status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

/** Founders met at events, and cheques into up to `want` of them (AI founders say yes at once). */
async function angelDeals(page: Page, events: number, want: number) {
  const s0 = await state(page);
  const e = (s0.market.techEvents ?? [])
    // Founders pitch at startup and investor events, not at every banking one (feedback note).
    .filter((x) => x.status === 'on' && x.founderPitches !== false)
    .sort((a, b) => a.ticket - b.ticket);
  for (const x of e.slice(0, events))
    expect((await command(page, { type: 'techevent.attend', eventId: x.id })).status).toBe(200);
  const s1 = await state(page);
  let deals = 0;
  for (const p of s1.investorDealFlow!.pitches.filter((x) => !x.hot)) {
    if (deals >= want) break;
    const r = await command(page, {
      type: 'invest.propose',
      companyId: p.companyId,
      instrument: p.pitch.instrument,
      amount: Math.min(p.pitch.ask, 2000000),
      valuation: p.pitch.valuation,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    if (r.status === 200 && r.body.result?.status === 'accepted') deals++;
  }
  return deals;
}

async function openEvents(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  await phone.locator('[data-app="events"]').click();
  await expect(phone.locator('[data-phone-app="events"]')).toBeVisible();
  return phone;
}

test('a new investor at a tech event is pitched by founders and can follow up and invest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newInvestor(page);
  const s0 = await state(page);
  const e = (s0.market.techEvents ?? [])
    // Founders pitch at startup and investor events, not at every banking one (feedback note).
    .filter((x) => x.status === 'on' && x.founderPitches !== false)
    .sort((a, b) => a.ticket - b.ticket)[0]!;

  const phone = await openEvents(page);
  const card = phone.locator(`[data-tech-event="${e.id}"]`);
  await expect(card.getByText(/Founders here will pitch you/)).toBeVisible();
  await card.getByRole('button', { name: 'Attend' }).click();

  // Founders came up and pitched: each pitch has its traction, ask and valuation.
  const result = card.locator('[data-dealflow]');
  await expect(result).toBeVisible({ timeout: 10_000 });
  const pitches = result.locator('[data-pitch]');
  expect(await pitches.count()).toBeGreaterThanOrEqual(2);
  await expect(pitches.first().getByText(/Raising/)).toBeVisible();
  await pitches.first().scrollIntoViewIfNeeded();
  await shot(page, 'event-pitches');

  // A follow-up meeting (first call), then terms at the founder's ask.
  const s1 = await state(page);
  const target = s1.investorDealFlow!.pitches.find((p) => !p.hot)!;
  const row = result.locator(`[data-pitch="${target.companyId}"]`);
  await row.locator('[data-followup]').click();
  await expect(row.getByRole('button', { name: 'Met again ✓' })).toBeVisible();
  await row.locator('[data-invest]').click();
  await expect(page.getByText(/Accepted. You’re in.|Term sheet sent./).first()).toBeVisible();

  // Portfolio → Pipeline: the pitches met at events and what investors taught you.
  await phone.getByRole('button', { name: 'Close phone' }).first().click();
  await tab(page, 'Portfolio').click();
  await page.getByRole('radio', { name: 'Pipeline' }).click();
  await expect(page.getByText('Met at events')).toBeVisible();
  await expect(page.getByText('What other investors taught you')).toBeVisible();
  await page.getByText('Met at events').scrollIntoViewIfNeeded();
  await shot(page, 'pipeline');
});

test('Fund I is pitched to LPs as a strategy: live checks, an oversized ask, reasons and next steps', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newInvestor(page);
  // A record first: three cheques into founders met at an event.
  expect(await angelDeals(page, 2, 3)).toBe(3);
  await page.reload();

  await tab(page, 'Portfolio').click();
  const form = page.locator('[data-fund-pitch]');
  await expect(form).toBeVisible();
  // The form starts from the size LPs take seriously from this record.
  await expect(page.locator('[data-suggested]')).toContainText('LPs will take you seriously');
  // A broken plan first: six companies, no reserves. The checks say so as you type.
  await form.getByLabel('Companies to back').fill('6');
  const reserves = form.getByLabel('Kept for follow-ons');
  await reserves.getByRole('radio', { name: '0%', exact: true }).click();
  await expect(form.locator('[data-check="deploy"][data-level="bad"]')).toBeVisible();
  await expect(form.locator('[data-check="reserves"][data-level="bad"]')).toBeVisible();
  await form.locator('[data-check="deploy"]').scrollIntoViewIfNeeded();
  await shot(page, 'lp-checks');
  // Back to a strategy that adds up, but asking for ₦1.6bn: far more than this record supports.
  await form.getByLabel('Companies to back').fill('25');
  await reserves.getByRole('radio', { name: '50%', exact: true }).click();
  await expect(form.locator('[data-check="deploy"][data-level="good"]')).toBeVisible();
  await form.getByLabel(/Fund size/).fill('1.6b');
  await form
    .getByLabel('Why now, and why you’ll win (one line)')
    .fill('Pre-seed fintech for the traders I already back');
  await form.locator('[data-pitch-lps]').click();
  const review = page.locator('[data-review]');
  await expect(review).toBeVisible({ timeout: 10_000 });
  await expect(review).toHaveAttribute('data-review', 'no');
  await expect(review.locator('[data-question]').first()).toBeVisible();
  expect(await review.locator('[data-lp]').count()).toBeGreaterThanOrEqual(2);
  expect(await review.locator('[data-lp][data-commit="1"]').count()).toBe(0);
  await expect(review.getByText(/Track record: \d+ deals/)).toBeVisible();
  // What to do next, computed from the gap: a size that fits, more deals, a markup.
  const steps = review.locator('[data-next-steps]');
  await expect(steps.locator('[data-step="size"]')).toContainText(/Try .+ instead of ₦1\.6bn/);
  await expect(steps.locator('[data-step="deals"]')).toBeVisible();
  await review.getByText('Their answers').scrollIntoViewIfNeeded();
  await shot(page, 'lp-review');
});

test('a first fund raised at the suggested size: anchored, with a first close', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await newInvestor(page);
  // A handful of deals with founders met at events (and the investors met there).
  expect(await angelDeals(page, 4, 7)).toBeGreaterThanOrEqual(5);
  await page.reload();

  await tab(page, 'Portfolio').click();
  const form = page.locator('[data-fund-pitch]');
  await expect(form).toBeVisible();
  const suggested = page.locator('[data-suggested]');
  await expect(suggested).toContainText(/LPs will take you seriously up to about ₦\d/);
  // One tap: the suggested size, with a strategy that fits it.
  await form.getByLabel(/Fund size/).fill('1.6b');
  await suggested.locator('[data-use-size]').click();
  await expect(form.getByLabel(/Fund size/)).not.toHaveValue('1.6b');
  await expect(form.locator('[data-check="deploy"][data-level="good"]')).toBeVisible();
  await expect(form.locator('[data-check="ownership"][data-level="good"]')).toBeVisible();
  await suggested.scrollIntoViewIfNeeded();
  await shot(page, 'form', 'firstfund');
  await form
    .getByLabel('Why now, and why you’ll win (one line)')
    .fill('Pre-seed fintech for the traders I already back');
  await form.locator('[data-pitch-lps]').click();

  // The LPs' answers: one anchored the fund, others committed or wait for the first close.
  const review = page.locator('[data-review="ok"]');
  await expect(review).toBeVisible({ timeout: 10_000 });
  await expect(review.locator('[data-anchor]')).toContainText('anchored the fund');
  expect(await review.locator('[data-lp][data-commit="1"]').count()).toBeGreaterThanOrEqual(2);
  const center = (l: ReturnType<Page['locator']>) =>
    l.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // Let the alerts slide away before the pictures.
  await page.waitForTimeout(6_000);
  await center(review.getByText('Their answers'));
  await shot(page, 'review', 'firstfund');

  // The first close is held: the fund invests, and LPs who waited join month by month.
  const close = page.locator('[data-first-close="first"]');
  await expect(close).toContainText('First close held');
  await page.request.post('/api/dev/settle', {
    headers: { 'x-runway': '1' },
    data: { market: 'lagos' },
  });
  await page.reload();
  await tab(page, 'Portfolio').click();
  await expect(page.locator('[data-first-close]')).toBeVisible();
  await page.waitForTimeout(6_000);
  await center(page.locator('[data-first-close]'));
  await shot(page, 'close', 'firstfund');
  const s = (await state(page)) as State & {
    investorDealFlow?: { firstFund?: { fund?: { committed: number; target: number } } };
  };
  const fund = s.investorDealFlow!.firstFund!.fund!;
  expect(fund.committed).toBeGreaterThanOrEqual(fund.target / 2);
  expect(fund.committed).toBeLessThanOrEqual(fund.target * 1.02);
});
