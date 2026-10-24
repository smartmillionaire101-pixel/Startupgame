import { FIT, LENDER_FIT, STEPS, type ClientBand, type ClientShape } from '@runway/engine';
import { expect, letters, playAsGuest, setupPlayer, tab, test, type Page } from './fixtures';

/**
 * Game feedback (the server logs FEEDBACK_NOTE as its release note):
 *  - a banker's advisory desk shows a reputation: no rating until the first
 *    mandate is handed in, then a star rating with the score, a referral from
 *    a client who heard about the deal, and the client sizes still to open;
 *  - the Events app puts banking and finance events first for a banker
 *    ("For you"; "All" is the whole calendar), and going to one brings a
 *    client who wants an adviser to the desk.
 *
 * BANKER_REP_SHOTS=<dir> saves screenshots of each step.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.BANKER_REP_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/banker-rep-${name}.png` });
};

interface ActiveMandate {
  id: string;
  band: ClientBand;
  shape: ClientShape;
  steps: { id: string; options: { id: string; kind: string | null }[] }[];
}
interface BankWorkState {
  active?: ActiveMandate[];
  offers?: { id: string; metAt: string | null; referredBy: string | null }[];
}
const bankWork = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    const v = s.view ?? s;
    return (v.bankWork ?? {}) as BankWorkState;
  });

/** The best call at a step, from the client's numbers. */
function bestOption(m: ActiveMandate, step: ActiveMandate['steps'][number]): string {
  if (step.id === 'lender')
    return [...step.options].sort(
      (a, b) =>
        (LENDER_FIT[b.kind ?? '']?.[m.band] ?? 0) - (LENDER_FIT[a.kind ?? '']?.[m.band] ?? 0),
    )[0]!.id;
  const table = FIT[step.id as keyof typeof FIT] ?? {};
  const fit = (id: string) => {
    const f = table[id] ?? {};
    if (step.id === 'buyers' && m.band === 'stretched') return f.stretched ?? 0;
    return (step.id === 'structure' || step.id === 'buyers' ? f[m.shape] : f[m.band]) ?? 0;
  };
  const opts = STEPS[step.id as keyof typeof STEPS].options.map((o) => o.id);
  return opts.sort((a, b) => fit(b) - fit(a))[0]!;
}

async function newBanker(page: Page) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Kemi E2E',
    handle: `br_${letters(8)}`,
    role: 'banker',
    backgroundId: 'b-wealthy',
    market: 'lagos',
    gender: 'female',
    bank: { name: `Eko Trust ${letters(5)}`, bankType: 'microfinance' },
  });
}

async function openApp(page: Page, app: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator(`[data-app="${app}"]`).click();
  await expect(phone.locator(`[data-phone-app="${app}"]`)).toBeVisible();
  return phone;
}

test('a banker’s desk shows a reputation, a referral and the clients still to open', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newBanker(page);
  await tab(page, 'Bank').click();
  const desk = page.locator('[data-bankwork]');
  await expect(desk.getByRole('heading', { name: /Your reputation/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(desk.locator('[data-reputation="none"]')).toBeVisible();
  await expect(desk.locator('[data-tier="small"]')).toHaveAttribute('data-open', 'true');
  await expect(desk.locator('[data-tier="big"]')).toHaveAttribute('data-open', 'false');
  await expect(
    desk.getByText('Score 80+ on 3 more mandates to unlock bigger clients.'),
  ).toBeVisible();

  // Take a mandate and make the best call at each step.
  await desk.locator('[data-take-mandate]').first().click();
  const flow = desk.locator('[data-mandate]');
  await expect(flow).toBeVisible();
  const m = (await bankWork(page)).active![0]!;
  for (const step of m.steps) {
    await expect(flow).toHaveAttribute('data-step', step.id);
    await flow.locator(`[data-option="${bestOption(m, step)}"]`).click();
    if (step !== m.steps.at(-1)) await flow.locator('[data-next-step]').click();
  }
  await flow.locator('[data-hand-in]').click();
  await expect(desk.locator('[data-deal-result]')).toHaveAttribute('data-deal-result', 'closed');

  // A rating now, the score on record, and a client who heard about it.
  const rep = desk.locator('[data-reputation]');
  await expect(rep).not.toHaveAttribute('data-reputation', 'none');
  await expect(rep.getByText(/Average score \d+ across 1 mandates/)).toBeVisible();
  await expect(rep.locator('[data-score]').first()).toBeVisible();
  const referral = desk.locator('[data-referral]');
  await expect(referral).toBeVisible();
  await expect(referral.getByText(/heard about your work for/)).toBeVisible();
  await expect(
    desk.getByText('Score 80+ on 2 more mandates to unlock bigger clients.'),
  ).toBeVisible();
  await rep.scrollIntoViewIfNeeded();
  await shot(page, '1-reputation');

  // The referral is a mandate like any other.
  await referral.locator('[data-take-mandate]').click();
  await expect(referral).toBeHidden();
  expect((await bankWork(page)).active!.length).toBe(1);
});

test('a banker sees banking events first and goes to one', async ({ page }) => {
  test.setTimeout(120_000);
  await newBanker(page);
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });

  const phone = await openApp(page, 'events');
  const forYou = phone.locator('[data-events="for-you"]');
  await expect(forYou).toBeVisible();
  await expect(phone.getByText(/Picked for a banker/)).toBeVisible();
  const cards = forYou.locator('[data-tech-event]');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  for (const a of await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-audience'))))
    expect(a).toBe('banker');
  // Startup events are still on, below.
  await expect(
    phone.locator('[data-events="also"] [data-audience="founder"]').first(),
  ).toBeAttached();
  await shot(page, '2-events');

  // Go to the first banking event.
  const first = cards.first();
  const title = (await first.locator('.item-title').textContent())!.trim();
  await first.getByRole('button', { name: 'Attend' }).click();
  await expect(first.locator('[data-attended]')).toBeVisible();
  await expect(page.getByText(/wants an adviser: it’s on your advisory desk/)).toBeVisible();
  await expect
    .poll(async () => ((await bankWork(page)).offers ?? []).some((o) => o.metAt === title))
    .toBe(true);

  // All: the whole calendar, in date order.
  await phone.getByRole('radio', { name: 'All' }).click();
  await expect(phone.locator('[data-events="all"]')).toBeVisible();
  await expect(
    phone.locator('[data-events="all"] [data-audience="founder"]').first(),
  ).toBeVisible();
});
