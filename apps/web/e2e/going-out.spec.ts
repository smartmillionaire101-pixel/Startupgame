import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Going out (player feedback: one app for leisure instead of a crowded map):
 * the phone's Going out app has the city's golf club, mall, places to eat,
 * tonight's bars and clubs, sky views, events and friends; each Go takes you
 * there.
 */

async function founderIn(page: Page, market = /Lagos/) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Ada Night',
    handle: `out_${letters(7)}`,
    company: `Out ${letters(5)}`,
    idea: 'Tickets for nights out',
    market,
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

async function openGoingOut(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  await phone.locator('[data-app="goingout"]').click();
  await expect(phone.locator('[data-phone-app="goingout"]')).toBeVisible();
  return phone;
}

/** Far places open the ride chooser: cycle (as the golf test does). */
async function ride(page: Page) {
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  const far = await chooser.waitFor({ timeout: 3000 }).then(
    () => true,
    () => false,
  );
  if (far) await chooser.locator('[data-mode="cycle"]').click();
}

test('Going out: golf, the mall, tonight and sky views, and Go to the golf club', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await founderIn(page);
  const phone = await openGoingOut(page);
  await expect(phone.locator('.going-hero')).toContainText('Lagos');
  await expect(phone.locator('[data-going-time]')).toHaveText(/\d\d:\d\d · \w+/);
  const golf = phone.locator('[data-going="golf"]');
  await expect(golf).toBeVisible({ timeout: 15_000 });
  await expect(golf).toContainText(/Par \d+/);
  await expect(golf.locator('[data-golf-fee]')).toContainText('Green fee');
  const mall = phone.locator('[data-going="mall"]');
  await expect(mall).toBeVisible();
  await expect(mall.locator('[data-shop]')).toHaveCount(17);
  const eat = phone.locator('[data-going="eat"]');
  await expect(eat).toBeVisible();
  await expect(eat.locator('[data-eat]').first()).toContainText(/\w · \w/);
  expect(await eat.locator('[data-eat]').count()).toBeLessThanOrEqual(6);
  const tonight = phone.locator('[data-going="tonight"]');
  await expect(tonight).toBeVisible();
  await expect(tonight.locator('[data-venue]').first()).toContainText('Now playing');
  // Tonight stays nightlife: no restaurants in it.
  await expect(tonight.locator('[data-kind="restaurant"], [data-kind="buka"]')).toHaveCount(0);
  expect(await tonight.locator('[data-venue]').count()).toBeLessThanOrEqual(6);
  await expect(phone.locator('[data-going="sky"]')).toBeVisible();
  await expect(phone.locator('[data-going="sky"] [data-sky]').first()).toBeVisible();
  await expect(phone.locator('[data-going="events"]')).toBeVisible();
  await expect(phone.locator('[data-going="friends"]')).toBeVisible();

  // Play a round: the phone closes and you arrive at the golf course.
  await golf.locator('[data-go="golf"]').click();
  await expect(phone).toBeHidden();
  await ride(page);
  const scene = page.locator('.golf-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-room', 'golf');
});

test('Going out: Go to a club from Tonight opens that venue', async ({ page }) => {
  test.setTimeout(120_000);
  await founderIn(page);
  const phone = await openGoingOut(page);
  const tonight = phone.locator('[data-going="tonight"]');
  await expect(tonight.locator('[data-venue]').first()).toBeVisible({ timeout: 15_000 });
  // A club if there is one open, else the first open venue.
  const open = tonight.locator('[data-venue]:not(.is-closed)');
  const club = open.and(tonight.locator('[data-kind="nightclub"]'));
  const row = (await club.count()) ? club.first() : open.first();
  const placeId = (await row.getAttribute('data-venue'))!;
  const genre = (await row.getAttribute('data-genre'))!;
  await row.getByRole('button', { name: /^Go to / }).click();
  await expect(phone).toBeHidden();
  await ride(page);
  const venue = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(venue).toBeVisible({ timeout: 30_000 });
  await expect(venue).toHaveAttribute('data-genre', genre);
});

test('Going out: Eat out lists the city’s places to eat, and Go opens one', async ({ page }) => {
  test.setTimeout(120_000);
  await founderIn(page);
  const phone = await openGoingOut(page);
  const eat = phone.locator('[data-going="eat"]');
  const rows = eat.locator('[data-eat]');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  // Real places from the map: Lagos's buka, bakery, cafés…
  await expect(eat).toContainText(/\d+ places to eat/);
  const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  for (const k of kinds) expect(k).not.toMatch(/nightclub|bar|pub|lounge/);
  await expect(rows.first().locator('.going-status')).toHaveText(/Open now|Closed now/);
  // More (n) shows the rest.
  const more = eat.getByRole('button', { name: /^More \(\d+\)$/ });
  if (await more.count()) {
    await more.click();
    expect(await rows.count()).toBeGreaterThan(6);
  }
  // An open one if there is one at this hour, else the first that's trading.
  const open = rows.and(eat.locator('[data-open]'));
  const row = (await open.count()) ? open.first() : rows.first();
  const placeId = (await row.getAttribute('data-eat'))!;
  const name = (await row.locator('.going-venue-name').textContent())!;
  await row.getByRole('button', { name: `Go to ${name}` }).click();
  await expect(phone).toBeHidden();
  await ride(page);
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toContainText(name);
});

test('Going out works abroad: in London, London’s golf, mall and nights out', async ({ page }) => {
  test.setTimeout(120_000);
  await founderIn(page);
  for (const command of [
    { type: 'travel.book', to: 'london' },
    { type: 'travel.fly', to: 'london' },
  ]) {
    const r = await page.request.post('/api/commands', {
      headers: { 'x-runway': '1' },
      data: { command },
    });
    expect(r.ok(), await r.text()).toBe(true);
  }
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  const phone = await openGoingOut(page);
  await expect(phone.locator('.going-hero')).toContainText('London');
  await expect(phone.locator('.going-hero')).toContainText('You’re visiting');
  await expect(phone.locator('[data-going="golf"]')).toBeVisible({ timeout: 15_000 });
  await expect(phone.locator('[data-going="mall"]')).toContainText('Borough Exchange Centre');
  await expect(phone.locator('[data-going="tonight"] [data-venue]').first()).toBeVisible();
  await expect(phone.locator('[data-going="eat"] [data-eat]').first()).toBeVisible();
  await expect(phone.locator('[data-going="eat"]')).toContainText(
    /British · |Indian · |Italian · /,
  );
  // The lifestyle tiers are one tab away.
  await phone.getByRole('radio', { name: 'By lifestyle' }).click();
  await expect(phone.getByText(/Your standard of living: level/)).toBeVisible();
});
