import { expect, letters, more, test, playAsGuest, tapPlace } from './fixtures';
import type { Page } from '@playwright/test';

/** Sign up a founder in Lagos, choosing Female or Male on the way. */
async function founder(page: Page, name: string, gender: 'Female' | 'Male' = 'Female') {
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  // Who you are: two avatar previews; nothing goes on until you pick.
  const pick = page.getByRole('group', { name: 'You are' });
  await expect(pick.getByRole('button', { name: 'Female', exact: true })).toBeVisible();
  await expect(pick.locator('svg')).toHaveCount(2);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Handle').fill(`${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Payments and bookings for restaurants');
  await page.getByLabel('Company name').fill(`Chop ${letters(5)}`);
  await expect(page.getByText(/Available in/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await pick.getByRole('button', { name: gender, exact: true }).click();
  await expect(pick.getByRole('button', { name: gender, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible();
}

test('onboarding asks Female or Male, and the choice is sent', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/command'))
      sent.push(r.postData() ?? '');
  });
  await founder(page, 'Kadi Gender', 'Male');
  expect(sent.some((b) => b.includes('"player.create"') && b.includes('"gender":"male"'))).toBe(
    true,
  );
});

test('walk into a restaurant: a full scene with people, and buy a meal from the tray', async ({
  page,
}) => {
  await founder(page, 'Ayo Diner');
  const food = page.locator('[data-place^="biz:"][data-category="food"]');
  test.skip((await food.count()) === 0, 'This build sends no local businesses.');

  await tapPlace(page, '[data-place^="biz:"][data-category="food"]', 'cycle');
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 10_000 });
  await expect(scene).toHaveAttribute('role', 'dialog');
  // An illustrated room, with the owner and other people in it doing things.
  await expect(scene).toHaveAttribute('data-room', /restaurant|cafe|bar|club|shop/);
  const people = scene.locator('[data-occupant]');
  expect(await people.count()).toBeGreaterThan(1);
  await expect(scene.getByRole('button', { name: /, Owner$/ })).toBeAttached();
  await expect(scene.locator('[data-act]').first()).toBeAttached();

  // Tap someone: their person card opens over the room.
  await scene.getByRole('button', { name: /, Owner$/ }).dispatchEvent('click');
  const card = page.getByRole('dialog').filter({ hasText: 'Business owner' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Close' }).click();

  // The tray: 2–4 things to do, and More.
  const tray = scene.getByRole('group', { name: 'What you can do here' });
  const cards = tray.locator('.tray-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  expect(await cards.count()).toBeLessThanOrEqual(4);
  const pocket = scene.locator('[data-pocket]');
  const before = Number(await pocket.getAttribute('data-pocket'));
  const buy = tray.locator('[data-action^="buy:"]').first();
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(page.locator('.toast-ok').last()).toBeVisible();
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(before);

  // More: everything else (the menu, gigs, selling to them).
  await more(page);
  await expect(scene.getByRole('heading', { name: 'Sell to them' })).toBeVisible();
  await scene.getByRole('button', { name: /Back to the room/ }).click();
  await expect(tray).toBeVisible();
  await scene.getByRole('button', { name: 'Close' }).click();
  await expect(scene).toBeHidden();
});

test('"What to do now" taps through, on the City and on Home', async ({ page }) => {
  await founder(page, 'Bisi Nowish');
  const card = page.locator('.hud-whatnow');
  await expect(card).toBeVisible();
  const items = card.locator('.whatnow-btn');
  expect(await items.count()).toBe(3);
  await items.first().click();
  // You walk (or cycle) there and go in.
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await scene.getByRole('button', { name: 'Close' }).click();

  // It can be tucked away and brought back.
  await card.getByRole('button', { name: 'Hide' }).click();
  await expect(card).toBeHidden();
  await page.getByRole('button', { name: /What to do now/ }).click();
  await expect(card).toBeVisible();

  // On Home too: a tap opens the City and takes you there.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: /^Home/ }).click();
  const home = page.locator('section.card').filter({ hasText: 'What to do now' });
  await expect(home).toBeVisible();
  await home.locator('.whatnow-btn').first().click();
  await expect(nav.getByRole('button', { name: 'City', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: 15_000 });
});
