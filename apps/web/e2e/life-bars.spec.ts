import { expect, letters, playAsGuest, setupFounder, tab, test, type Page } from './fixtures';

/**
 * Phase 3 life bars: Energy, Health, Happiness and Stress under Me (what they
 * mean, how to change them), and trips that cost what they would: a long walk
 * takes game hours and energy, a taxi saves both for a fare. Shown when the
 * server has the life-bars release. LIFEBARS_SHOTS=<dir> saves 390×844
 * screenshots.
 */
const SHOTS = process.env.LIFEBARS_SHOTS;

const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    return (await r.json()) as {
      view: {
        me: {
          energy: number;
          hours: { left: number };
          bars?: { energy: number; health: number; happiness: number; stress: number };
        };
      };
    };
  });

async function tap(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.dispatchEvent('pointerdown', { pointerId: 3, clientX: 10, clientY: 10 });
  await el.dispatchEvent('pointerup', { pointerId: 3, clientX: 10, clientY: 10 });
}

test('life bars under Me, and a long walk that costs time and energy', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Bars ${n}`,
    handle: `bars_${n}`,
    company: `Lumen ${letters(5)}`,
    idea: 'Ledgers for traders',
    market: /Lagos, Nigeria/,
  });
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  const s0 = await state(page);
  test.skip(!s0.view.me.bars, 'The server has no life bars yet');

  // The bars are under Me and in the time pill's sheet (not on the HUD itself):
  // each one, what it's at, how to change it.
  await expect(page.locator('[data-hud-bar] [data-lifebars-sheet]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await tab(page, 'Me').click();
  const sheet = page.locator('[data-lifebars-sheet]');
  await expect(sheet).toBeVisible();
  for (const id of ['energy', 'health', 'happiness', 'stress'])
    await expect(sheet.locator(`[data-bar="${id}"] [role="meter"]`)).toBeVisible();
  await expect(sheet.locator('[data-bar="health"] [role="meter"]')).toHaveAttribute(
    'aria-valuenow',
    String(s0.view.me.bars!.health),
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lifebars-me.png`, fullPage: true });
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();

  // Across the Lagoon: each way of getting there says what it costs you.
  await tap(page, '[data-place="eventhall"]');
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  await expect(chooser).toBeVisible();
  const walk = chooser.locator('[data-mode="walk"] [data-ride-cost]');
  await expect(walk).toContainText(/−\d+ energy/);
  await expect(chooser.locator('[data-mode="taxi"] [data-ride-cost]')).toHaveText('No effort');
  await expect(chooser.locator('[data-ride-hours]')).toContainText('h left this month');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lifebars-chooser.png` });

  // Walking it takes the hours and the energy.
  await chooser.locator('[data-mode="walk"]').click();
  await expect(chooser).toBeHidden();
  await expect
    .poll(async () => (await state(page)).view.me.hours.left, { timeout: 10_000 })
    .toBeLessThan(s0.view.me.hours.left);
  const s1 = await state(page);
  expect(s1.view.me.energy).toBeLessThan(s0.view.me.energy);
});
