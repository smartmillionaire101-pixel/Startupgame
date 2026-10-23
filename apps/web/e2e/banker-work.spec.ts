import { FIT, LENDER_FIT, STEPS, type ClientBand, type ClientShape } from '@runway/engine';
import {
  expect,
  letters,
  playAsGuest,
  setupPlayer,
  tab,
  tapPlace,
  test,
  type Page,
} from './fixtures';

/**
 * Banker work (bankers note: the server logs it as its release note): a new
 * banker whose licence is pending takes an advisory mandate from the Bank
 * screen, makes a call at each step and hands it in (the deal closes and
 * the fee is paid), then walks into an AI bank and meets its chief
 * executive (a lesson), and into the Chamber of Commerce to meet business
 * owners (clients for the bank once it's licensed).
 *
 * BANKER_SHOTS=<dir> saves screenshots of each step.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.BANKER_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/banker-work-${name}.png` });
};

interface ActiveMandate {
  id: string;
  band: ClientBand;
  shape: ClientShape;
  steps: { id: string; options: { id: string; kind: string | null }[] }[];
}
const activeMandate = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    const v = s.view ?? s;
    return (v.bankWork?.active?.[0] ?? null) as ActiveMandate | null;
  });

/** The best call at a step, from the client's numbers (what a careful banker picks). */
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

test('a banker takes and completes an advisory mandate, then meets an AI bank and the Chamber', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Kofi E2E',
    handle: `bw_${letters(8)}`,
    role: 'banker',
    backgroundId: 'b-wealthy',
    market: 'kigali',
    gender: 'male',
    bank: { name: `Umurage Trust ${letters(5)}`, bankType: 'microfinance' },
  });

  // The advisory desk: work while the licence is pending.
  await tab(page, 'Bank').click();
  const desk = page.locator('[data-bankwork]');
  await expect(desk.getByRole('heading', { name: /Advisory desk/ })).toBeVisible({
    timeout: 20_000,
  });
  expect(await desk.locator('[data-offer]').count()).toBeGreaterThanOrEqual(2);
  await expect(desk.getByText(/success fees are paid to you/)).toBeVisible();
  await shot(page, '1-desk');

  await desk.locator('[data-take-mandate]').first().click();
  const flow = desk.locator('[data-mandate]');
  await expect(flow).toBeVisible();
  const m = (await activeMandate(page))!;
  expect(m.steps.length).toBeGreaterThanOrEqual(3);
  for (const step of m.steps) {
    await expect(flow).toHaveAttribute('data-step', step.id);
    await flow.locator(`[data-option="${bestOption(m, step)}"]`).click();
    if (step !== m.steps.at(-1)) await flow.locator('[data-next-step]').click();
  }
  await shot(page, '2-mandate');
  await flow.locator('[data-hand-in]').click();
  const result = desk.locator('[data-deal-result]');
  await expect(result).toHaveAttribute('data-deal-result', 'closed');
  await expect(page.getByText(/Deal closed: .+ fee\./)).toBeVisible();
  await expect(desk.locator('[data-record="1"]')).toBeVisible();
  await result.scrollIntoViewIfNeeded();
  await shot(page, '3-deal');

  // An AI bank: meet its chief executive (a lesson about running a bank).
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, '[data-place^="lender:"]', 'walk');
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await expect(scene.locator('[data-action="banker-talk"]')).toBeVisible();
  await scene.locator('[data-action="banker-talk"]').click();
  const talks = scene.locator('[data-banker-talks]');
  await expect(talks).toBeVisible();
  await talks.locator('[data-talk="ceo"]').click();
  const said = talks.locator('[data-talk-result="ceo"]');
  await expect(said).toBeVisible();
  await expect(said.getByText('New lesson: your skills grew')).toBeVisible();
  await said.scrollIntoViewIfNeeded();
  await shot(page, '4-ai-bank');
  await expect(talks.locator('[data-talk="ceo"]')).toBeDisabled();
  await scene.getByRole('button', { name: 'Close' }).first().click();
  await expect(scene).toBeHidden();

  // The Chamber of Commerce: business owners who'll bank with you once you're licensed.
  await tapPlace(page, '[data-place="civic:kigali:chamber"]');
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await scene.locator('[data-action="banker-talk"]').click();
  const chamber = scene.locator('[data-banker-talks="place:kigali:chamber"]');
  await chamber.locator('[data-talk="owners"]').click();
  const met = chamber.locator('[data-talk-result="owners"] [data-met-clients="2"]');
  await expect(met).toBeVisible();
  await met.scrollIntoViewIfNeeded();
  await shot(page, '5-chamber');
  await scene.getByRole('button', { name: 'Close' }).first().click();

  // Back at the desk: the clients wait for the licence; the lesson is on record.
  await tab(page, 'Bank').click();
  await expect(desk.locator('[data-clients="2"]')).toBeVisible();
  await expect(desk.getByText(/What other bankers taught you: 1 of/)).toBeVisible();
});
