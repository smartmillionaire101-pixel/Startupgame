/**
 * Phase 2: Simple mode, for players who aren't tech-savvy. Four tabs (City,
 * Today, My company, Me) with Money one big link away, the phone with
 * every app (names under the dock's icons too), a map whose buttons all
 * say what they do, one "What should I do now?" card that goes straight
 * there, the map's gestures shown once, and Settings to switch it off.
 * Everything fits a 390 × 844 phone without scrolling sideways.
 *
 * SIMPLE_SHOTS=<dir> saves screenshots of each screen.
 */
import { expect, letters, playAsGuest, setupFounder, tab, test, type Page } from './fixtures';

const SHOTS = process.env.SIMPLE_SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The page never scrolls sideways at phone width. */
async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test.use({ viewport: { width: 390, height: 844 } });

/**
 * The fixture plays specs in the normal game; these turn Simple mode on, and
 * the gesture hint back on, once (a reload keeps what the player chose).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('simple-seeded')) return;
      sessionStorage.setItem('simple-seeded', '1');
      localStorage.setItem('runway.simple', '1');
      // Anything but '1' is "not seen yet" (the fixture only fills it in when missing).
      localStorage.setItem('runway.gestureHint', '0');
    } catch {
      /* storage blocked */
    }
  });
});

async function founder(page: Page) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Sim Plea',
    handle: `simp_${letters(8)}`,
    company: `Easy ${letters(6)}`,
    idea: 'Invoices for market traders',
  });
  await expect(page.locator('html')).toHaveAttribute('data-simple', '1');
}

test('Simple mode: four tabs, a money link, big phone tiles and a calm map', async ({ page }) => {
  await founder(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Four tabs, each with its name.
  await expect(nav.getByRole('button')).toHaveCount(4);
  for (const name of ['City', 'Today', 'My company', 'Me'])
    await expect(tab(page, name)).toBeVisible();
  await expect(tab(page, 'Money')).toHaveCount(0);

  // The map's gestures, the first time: "Got it" puts them away for good.
  const hint = page.getByRole('note', { name: 'How to use the map' });
  await expect(hint).toContainText('Pinch to zoom');
  await shot(page, 'city-hint');
  await hint.getByRole('button', { name: 'Got it' }).click();
  await expect(hint).toBeHidden();

  // Every map button says what it does; zoom is a pinch, not a button.
  const hud = page.locator('.city-stage');
  await expect(hud.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
  await expect(hud.getByRole('button', { name: 'Zoom out' })).toHaveCount(0);
  // Sky views keeps its own button.
  await expect(page.getByTestId('sky-views-btn')).toContainText('Sky views');
  await expect(hud.getByRole('button', { name: 'Centre on me' })).toContainText('Me');
  await expect(hud.locator('.city-hud-bottom').getByText('Where to?')).toBeVisible();
  await expect(hud.locator('.city-hud-bottom').getByText('Who’s here')).toBeVisible();
  await expect(page.getByTestId('journey-chip')).toContainText('Journey');
  // The next step is a 💡 button (a red dot: not opened yet) that opens a small card.
  const bulb = page.getByRole('button', { name: 'What should I do now?' });
  await expect(bulb).toHaveAttribute('data-new', '');
  await expect(page.locator('.hud-whatnow-chip')).toHaveCount(0);
  await bulb.click();
  await expect(page.locator('.next-step-pop')).toContainText('What should I do now?');
  await noSideScroll(page);
  await shot(page, 'city-next-step');
  await page.locator('.next-step-pop').getByRole('button', { name: 'Close' }).click();
  await expect(bulb).not.toHaveAttribute('data-new', '');
  await noSideScroll(page);
  await shot(page, 'city');

  // Shown once: not again after a reload.
  await page.reload();
  await expect(page.locator('.city-stage')).toBeVisible();
  await expect(page.getByRole('note', { name: 'How to use the map' })).toHaveCount(0);

  // Today: the one next step first, a big button and a sentence.
  await tab(page, 'Today').click();
  const today = page.locator('main [data-next-step]');
  await expect(today).toBeVisible();
  await expect(today.getByRole('button')).toHaveCount(1);
  await noSideScroll(page);
  await shot(page, 'today');

  // My company: Money and investors is one big link away, and Back returns.
  await tab(page, 'My company').click();
  await noSideScroll(page);
  await shot(page, 'company');
  await page.getByRole('button', { name: /Money and investors/ }).click();
  await expect(page.locator('main .back-btn')).toBeVisible();
  await noSideScroll(page);
  await shot(page, 'money');
  await page.locator('main').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: /Money and investors/ })).toBeVisible();

  // Sheets close with "Back", top-left.
  await tab(page, 'City').click();
  await page.locator('.city-hud-bottom').getByRole('button', { name: 'Where to?' }).click();
  const where = page.getByRole('dialog', { name: 'Where to?' });
  await expect(where).toBeVisible();
  await shot(page, 'where-to');
  await where.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(where).toBeHidden();

  // The phone: every app, as in the normal phone, with names under the dock's icons too.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone.locator('[data-app]')).toHaveCount(22);
  await expect(phone.locator('.phone-dock .phone-app-label').first()).toBeVisible();
  await shot(page, 'phone');
  // Back says "Back".
  await phone.locator('[data-app="bank"]').click();
  await expect(phone.locator('.phone-back')).toContainText('Back');
  await shot(page, 'phone-bank');
  await phone.getByRole('button', { name: 'Back' }).click();
  await expect(phone.locator('.phone-apps')).toBeVisible();
  await phone.getByRole('button', { name: 'Close phone' }).click();
  await expect(phone).toBeHidden();
  await noSideScroll(page);
});

test('the next-step card goes straight there', async ({ page }) => {
  await founder(page);
  await page.getByRole('note', { name: 'How to use the map' }).getByRole('button').click();
  // A new founder's next step: talk to customers, at the Market.
  await page.getByRole('button', { name: 'What should I do now?' }).click();
  const card = page.locator('.next-step-pop');
  await expect(card).toContainText('Talk to customers about their problem', { timeout: 15_000 });
  await card.getByRole('button', { name: 'Go there' }).click();
  // Somewhere far asks how to get there (the ride chooser): walk.
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  if (
    await chooser.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    )
  )
    await chooser.locator('[data-mode="walk"]').click();
  await expect(page.getByRole('dialog')).toHaveAttribute('data-room', 'market', {
    timeout: 15_000,
  });
});

test('turning Simple mode off in Settings brings the normal tabs back', async ({ page }) => {
  await founder(page);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button')).toHaveCount(4);

  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="settings"]').click();
  await shot(page, 'settings');
  await phone.getByRole('switch', { name: 'Simple mode' }).uncheck({ force: true });
  await expect(page.locator('html')).not.toHaveAttribute('data-simple', /.*/);
  // The phone's Back is an icon again; close the phone.
  await expect(phone.locator('.phone-back')).not.toContainText('Back');
  await phone.getByRole('button', { name: 'Close phone' }).click();

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button')).toHaveCount(5);
  for (const name of ['City', 'Today', 'Company', 'Money', 'Me'])
    await expect(tab(page, name)).toBeVisible();
  await expect(page.locator('.city-stage').getByRole('button', { name: 'Zoom in' })).toBeVisible();

  // Me → Settings switches it back on, and the choice survives a reload.
  await tab(page, 'Me').click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.locator('[data-setting="simple"] input').check();
  await expect(nav.getByRole('button')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button')).toHaveCount(4);
  await noSideScroll(page);
});
