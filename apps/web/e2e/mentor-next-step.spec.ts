import { expect, letters, more, playAsGuest, setupFounder, tapPlace, test } from './fixtures';
import type { Page } from './fixtures';

/**
 * Round 3: the Hub mentor's "Do the next step", tapped inside the Hub's
 * scene, leaves the room for the step: the Company screen's checklist for
 * a price to fix, the Market for customers to talk to. (A step at the Hub
 * itself used to close the room and open it again: nothing happened.)
 *
 * MENTOR_SHOTS=<dir> saves phone-size screenshots of where it leads.
 */
test.use({ viewport: { width: 390, height: 844 } });
const SHOTS = process.env.MENTOR_SHOTS;

async function command(page: Page, command: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBe(true);
}

async function founderAtHub(page: Page, opts: { lowPrice: boolean }) {
  const tag = letters(5);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Helen E2E',
    handle: `mentor_${tag}`,
    company: `Stall Pay ${tag}`,
    idea: 'Payments for market traders',
    market: /London/,
  });
  if (opts.lowPrice) {
    // Customers known, and a price far below their budget: the next step is the price.
    const s = await page.request.get('/api/state').then((r) => r.json());
    const c = s.view.companies[0] as { id: string; targetSegments: string[] };
    await command(page, {
      type: 'company.discovery',
      companyId: c.id,
      segmentKey: c.targetSegments[0],
    });
    await command(page, { type: 'company.strategy', companyId: c.id, price: 21 });
    await page.reload();
  }
  await tapPlace(page, '[data-place="hub"]', 'walk');
  const scene = await more(page);
  const mentor = scene.locator('.fg-mentor');
  await expect(mentor).toBeVisible();
  return mentor;
}

test('the mentor’s next step opens the Company checklist from inside the Hub', async ({ page }) => {
  const mentor = await founderAtHub(page, { lowPrice: true });
  const next = mentor.getByRole('button', { name: 'Do the next step' });
  await expect(next).toHaveAttribute('data-mentor-next', 'idea.price');
  await next.click();
  // The room is gone and the Company screen's stage checklist is in front.
  await expect(page.locator('.place-scene')).toHaveCount(0);
  const stage = page.locator('[data-founder-stage]');
  await expect(stage).toBeVisible();
  await expect(stage.locator('[data-next-task="idea.price"]')).toBeVisible();
  await expect(page.locator('[data-tab="company"]')).toHaveAttribute('aria-current', 'page');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/next-step-from-hub-company.png` });
});

test('the mentor’s next step walks to the Market from inside the Hub', async ({ page }) => {
  const mentor = await founderAtHub(page, { lowPrice: false });
  const next = mentor.getByRole('button', { name: 'Do the next step' });
  await expect(next).toHaveAttribute('data-mentor-next', 'idea.discovery');
  await next.click();
  // The Hub closes and the Market's stalls open (next door in London).
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await expect(scene).toHaveAttribute('data-scene', /^stall:/);
  await expect(page.locator('.fg-mentor')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/next-step-from-hub-market.png` });
});
