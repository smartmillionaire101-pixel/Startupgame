import { expect, letters, more, test, playAsGuest, tapPlace } from './fixtures';
import type { Page } from '@playwright/test';

/** Sign up a founder in a market (by its button label), straight into the City. */
async function founder(page: Page, market: RegExp, name: string) {
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: market }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Handle').fill(`${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Payments and bookings for restaurants');
  await page.getByLabel('Company name').fill(`Till ${letters(5)}`);
  await expect(page.getByText(/Available in/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  // The first answer after Start can be a cold start that loads the whole world.
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

/** Tap a building on the map: the avatar goes there (cycling, if it's far) and goes in. */
async function enter(page: Page, selector: string) {
  await tapPlace(page, selector, 'cycle');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await more(page);
  return sheet;
}

test('a founder eats out, works a shift and pitches a local business', async ({ page }) => {
  // San Francisco when this build has it, else Lagos.
  await page.goto('/');
  const meta = await page.request.get('/api/meta').then((r) => r.json());
  const sf = JSON.stringify(meta).includes('san-francisco');
  await founder(page, sf ? /San Francisco/ : /Lagos, Nigeria/, 'Rosa Market');

  const shops = page.locator('[data-place^="biz:"]');
  test.skip((await shops.count()) === 0, 'This build sends no local businesses.');

  // A restaurant (or any food place): buy a meal from your own pocket.
  const food = page.locator('[data-place^="biz:"][data-category="food"]');
  const sheet = await enter(
    page,
    (await food.count()) ? '[data-place^="biz:"][data-category="food"]' : '[data-place^="biz:"]',
  );
  // The owner is in the room (the scene's people), the menu under More.
  await expect(sheet.getByRole('button', { name: /, Owner$/ })).toBeAttached();
  const pocket = sheet.locator('[data-pocket]');
  const before = Number(await pocket.getAttribute('data-pocket'));
  const buy = sheet.locator('.biz-items').getByRole('button', { name: 'Buy', exact: true }).first();
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(before);

  await sheet.getByRole('button', { name: 'Close' }).click();

  // The Jobs board at the Hub lists every gig in town: take a shift.
  await page.getByRole('button', { name: /Places/ }).click();
  await page.getByRole('dialog', { name: 'Places' }).locator('[data-kind="hub"]').click();
  const hub = await more(page);
  await expect(hub.getByRole('heading', { name: 'Jobs board' })).toBeVisible({ timeout: 8000 });
  await hub.getByRole('button', { name: 'Take shift' }).first().click();
  await expect(page.locator('.toast-ok').last()).toBeVisible();
  await hub.getByRole('button', { name: 'Close' }).click();

  // Sell to them: walk into businesses until one will hear a pitch, and pitch.
  // The owner answers on a result card (yes, come back when…, or no).
  let pitched = false;
  for (let n = 0; n < 12 && !pitched; n++) {
    await page.getByRole('button', { name: /Places/ }).click();
    await page
      .getByRole('dialog', { name: 'Places' })
      .locator('[data-kind="business"]')
      .nth(n)
      .click();
    const shop = await more(page);
    await expect(shop.getByRole('heading', { name: 'Sell to them' })).toBeVisible({
      timeout: 8000,
    });
    const pitch = shop.getByRole('button', { name: /^Pitch Till / });
    if (await pitch.isEnabled()) {
      await pitch.click();
      await expect(shop.locator('.card-deal[role="status"]')).toBeVisible({ timeout: 8000 });
      pitched = true;
    }
    await shop.getByRole('button', { name: 'Close' }).click();
  }
  expect(pitched).toBe(true);

  // Your business customers are listed with the company's customers.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByRole('tab', { name: 'Customers' }).click();
  await expect(page.getByText('Business customers')).toBeVisible();

  // Events can be held at a hotel or event venue in town.
  await nav.getByRole('button', { name: 'City', exact: true }).click();
  await page.getByRole('button', { name: /Places/ }).click();
  await page.getByRole('dialog', { name: 'Places' }).locator('[data-kind="eventhall"]').click();
  const hall = await more(page);
  await expect(hall.getByRole('heading', { name: 'Host an event' })).toBeVisible({
    timeout: 8000,
  });
  await expect(hall.getByLabel('Where in town')).toBeVisible();
});

test('London has the Thames, Tower Bridge and red buses', async ({ page }) => {
  await founder(page, /London, United Kingdom/, 'Ada Thames');
  await expect(page.locator('[data-water="River Thames"]')).toBeAttached();
  await expect(page.locator('[data-bridge="Tower Bridge"]')).toBeAttached();
  await expect(page.locator('[data-vehicle^="routemaster"]').first()).toBeAttached();
  await expect(page.locator('[data-area="shoreditch"]').first()).toBeAttached();
  // The Places list is grouped by London's districts.
  await page.getByRole('button', { name: /Places/ }).click();
  const places = page.getByRole('dialog', { name: 'Places' });
  await expect(places.getByRole('heading', { name: 'The City' })).toBeVisible();
  await expect(places.getByRole('heading', { name: 'Shoreditch' })).toBeVisible();
});
