import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, letters, playAsGuest, setupPlayer, tab, test, type Page } from './fixtures';

/**
 * Phase 5 life events: BitLife-style cards. An investor (life events reach
 * everyone, not just founders) closes months with the dev tools until
 * something happens in their life. The card pops up on its own over the
 * City: a picture, the story, big choice buttons with what each costs. They
 * choose, and the card shows what happened and how their bars moved; the
 * top bar's life bars move with it. The event is kept under Recent
 * decisions on Today. In Simple mode the choices are big.
 *
 * Accra: no other spec waits on its month (banker.spec only moves it on).
 * LIFE_SHOTS=<dir> saves 390×844 screenshots.
 */
const SHOTS = process.env.LIFE_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};

interface LifeState {
  view?: {
    me: { bars?: { energy: number; health: number; happiness: number; stress: number } };
    decisions: { open: { id: string; life: boolean }[] };
  };
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' }, cache: 'no-store' });
    return (await r.json()) as LifeState;
  });
const settle = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/dev/settle', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ market: 'accra' }),
    });
    return r.status;
  });

/** A new investor in Accra, with the pop-up on (and Simple mode as asked). */
async function newInvestor(page: Page, simple: boolean) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((s) => {
    try {
      localStorage.setItem('runway.lifeEventsPopup', '1');
      localStorage.setItem('runway.simple', s ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }, simple);
  await playAsGuest(page);
  const n = letters(6);
  await setupPlayer(page, {
    type: 'player.create',
    name: `Life ${n}`,
    handle: `life_${n}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'accra',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await page.locator('.topbar').waitFor();
}

/** Close months until a life event is waiting. */
async function untilLifeEvent(page: Page) {
  for (let i = 0; i < 12; i++) {
    expect(await settle(page)).toBe(200);
    const s = await state(page);
    if (s.view?.decisions.open.some((e) => e.life)) return;
  }
  throw new Error('No life event in 12 months');
}

test('a life event pops up, the player chooses, and sees what happened', async ({ page }) => {
  test.slow();
  await newInvestor(page, false);
  await untilLifeEvent(page);
  await page.reload();

  // The card opens on its own over the City.
  const card = page.locator('[data-life-event]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const sheet = page.getByRole('dialog').filter({ has: card });
  await expect(sheet.locator('.life-card-pic')).not.toBeEmpty();
  await expect(sheet.locator('.life-card-story')).not.toBeEmpty();
  await expect(sheet.locator('.life-card-default')).toContainText(
    'If you don’t choose by the end of the month',
  );
  const buttons = sheet.locator('.life-choice-btn');
  expect(await buttons.count()).toBeGreaterThanOrEqual(2);
  await shot(page, 'life-event-card');

  const before = (await state(page)).view!.me.bars!;
  const choice = sheet.locator('.life-choice-btn:not([disabled])').first();
  const label = (await choice.locator('.life-choice-label').textContent())!;
  await choice.click();

  // What happened, and how the bars moved.
  const result = sheet.locator('[data-life-result]');
  await expect(result).toBeVisible();
  await expect(result).toContainText(`You chose: ${label}`);
  const changes = result.locator('[data-life-change]');
  expect(await changes.count()).toBeGreaterThanOrEqual(1);
  const bar = result.locator('[data-life-change][data-delta]').first();
  if (await bar.count()) {
    const key = (await bar.getAttribute('data-life-change')) as keyof typeof before;
    const delta = Number(await bar.getAttribute('data-delta'));
    const after = (await state(page)).view!.me.bars!;
    expect(after[key] - before[key]).toBe(delta);
    // Me shows the new value.
    await tab(page, 'Me').click();
    await expect(
      page.locator(`[data-lifebars-sheet] [data-bar="${key}"] [role="meter"]`),
    ).toHaveAttribute('aria-valuenow', String(after[key]));
  }
  await shot(page, 'life-event-result');
  await sheet.getByRole('button', { name: 'OK' }).click();
  await expect(card).toBeHidden();

  // It's kept on Today with what you chose.
  await tab(page, 'Today').click();
  const decisions = page.locator('.card.decisions');
  await decisions.locator('.decisions-recent summary').click();
  await expect(decisions.locator('.decisions-recent')).toContainText(`You chose: ${label}`);
  await shot(page, 'life-event-today');
});

test('Simple mode: the choices are big buttons', async ({ page }) => {
  test.slow();
  await newInvestor(page, true);
  await untilLifeEvent(page);
  await page.reload();
  const card = page.locator('[data-life-event]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const box = await card.locator('.life-choice-btn').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(64);
  expect(box!.width).toBeGreaterThan(300);
  await shot(page, 'life-event-simple');
});
