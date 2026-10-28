import { devices, type Page } from '@playwright/test';
import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  setupPlayer,
  tab,
  tapPlace,
  test,
  withoutNetlifyDrawer,
  hudMore,
} from './fixtures';

/**
 * Player feedback fixes: the office's "Manage company" opens the Company
 * screen; the Journey sits with the map's buttons instead of a banner over
 * the map; notifications take you where you act (a payment to its receipt,
 * a deal to its card).
 */

const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return s.view as { me: { id: string }; companies: { id: string }[] };
  });

const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.text() };
  }, cmd);

async function founder(page: Page, name: string) {
  await playAsGuest(page);
  const handle = `om_${letters(8)}`;
  await setupFounder(page, {
    name,
    handle,
    company: `Desk ${handle.slice(3)}`,
    idea: 'Payments for market traders',
  });
  await expect(tab(page, 'City')).toHaveAttribute('aria-current', 'page');
}

/** Whether a box covers the middle of the map (the central 30% × 30%). */
function coversCentre(
  box: { x: number; y: number; width: number; height: number },
  map: { x: number; y: number; width: number; height: number },
) {
  const cx0 = map.x + map.width * 0.35;
  const cx1 = map.x + map.width * 0.65;
  const cy0 = map.y + map.height * 0.35;
  const cy1 = map.y + map.height * 0.65;
  return box.x < cx1 && box.x + box.width > cx0 && box.y < cy1 && box.y + box.height > cy0;
}

test('the office opens the Company screen, and the HUD keeps the map clear', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await founder(page, 'Ada Office');

  // The Journey is an icon button with the map's buttons (behind ⋯): no chapter
  // banner over the map.
  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible();
  await hudMore(page);
  const chip = page.getByTestId('journey-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', /Chapter 1 · The Hustle/);
  await expect(chip).not.toContainText('Hustle');
  await expect(page.locator('[data-hud-rail] [data-testid="journey-chip"]')).toBeVisible();
  await expect(page.locator('.journey-celebrate')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(chip).toBeHidden();

  // Nothing on the HUD covers the centre of the map, on two phone sizes.
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 780 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    const m = (await map.boundingBox())!;
    for (const el of await page
      .locator('.city-hud > *, [data-hud-rail] > *, .hud-top > *, .hud-sub > *')
      .all()) {
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      expect(
        coversCentre(box, m),
        `${await el.getAttribute('class')} covers the map at ${size.width}px`,
      ).toBe(false);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Into the office: "Manage company" opens the Company screen with its tabs.
  await tapPlace(page, '[data-place="office"]');
  const scene = page.locator('.place-scene');
  await scene.waitFor({ timeout: 10_000 });
  const manage = scene.getByRole('button', { name: /Manage company/ });
  await expect(manage).toBeVisible();
  await manage.click();
  await expect(scene).toBeHidden();
  await expect(tab(page, 'Company')).toHaveAttribute('aria-current', 'page');
  const tabs = page.getByRole('tablist');
  await expect(tabs).toBeVisible();
  for (const name of ['Product', 'Roadmap', 'Sales', 'Customers', 'Team', 'Board']) {
    await tabs.getByRole('tab', { name, exact: true }).click();
    await expect(tabs.getByRole('tab', { name, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
  await expect(page.locator('[data-screen-error]')).toHaveCount(0);

  // The HUD's company chip opens the Company screen too.
  await tab(page, 'City').click();
  await page.locator('[data-hud-company]').click();
  await expect(tab(page, 'Company')).toHaveAttribute('aria-current', 'page');

  expect(errors).toEqual([]);
});

test('notifications open what they are about: a payment’s receipt, a deal’s card', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const newPage = async () => {
    const p = await (
      await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
    ).newPage();
    await withoutNetlifyDrawer(p);
    return p;
  };
  const tag = letters(4);
  await founder(a, `Ada${tag} Notes`);
  const me = await state(a);
  const companyId = me.companies[0]!.id;

  // A friend sends money; an investor proposes a deal.
  const b = await newPage();
  await founder(b, `Bola${tag} Payer`);
  const sent = await command(b, { type: 'money.send', toPlayerId: me.me.id, amount: 500_000 });
  expect(sent.status, sent.body).toBe(200);

  const c = await newPage();
  await playAsGuest(c);
  const meta = await c.request.get('/api/meta').then((r) => r.json());
  const lagos = meta.markets.find((m: { name: string }) => /Lagos/.test(m.name)).id;
  await setupPlayer(c, {
    type: 'player.create',
    handle: `inv_${letters(8)}`,
    name: `Chi${tag} Angel`,
    role: 'investor',
    backgroundId: 'i-first',
    market: lagos,
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 1_000_000_00 },
  });
  const offer = await command(c, {
    type: 'invest.propose',
    companyId,
    instrument: 'safe',
    amount: 100_000_00,
    valuation: 50_000_000_00,
    proRata: false,
    boardSeat: false,
    vetoOnSale: false,
  });
  expect(offer.status, offer.body).toBe(200);

  // The payment's alert opens its receipt in the Bank app.
  await a.reload();
  await a.getByRole('button', { name: /^Phone/ }).click();
  const ph = a.getByRole('dialog', { name: 'Phone' });
  await ph.locator('[data-app="alerts"]').click();
  const payment = ph.locator('.phone-alert', { hasText: /sent you/ }).first();
  await expect(payment).toHaveAttribute('data-target', 'phone');
  await payment.click();
  await expect(ph.locator('[data-phone-app="bank"]')).toBeVisible();
  await expect(ph.locator('[data-receipt]')).toBeVisible();

  // The deal's alert on Today opens its card.
  await ph.getByRole('button', { name: 'Close' }).first().click();
  await tab(a, 'Today').click();
  const deal = a.locator('.inbox-item', { hasText: /New deal card/ }).first();
  await expect(deal).toBeVisible();
  await deal.click();
  // The Money screen (no tab of its own: the money pill and Company lead there).
  await expect(a.getByRole('heading', { name: 'Money', level: 1 })).toBeVisible();
  await expect(a.getByRole('dialog', { name: 'Deal card' })).toBeVisible();

  expect(errors).toEqual([]);
});
