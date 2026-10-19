import { expect, letters, playAsGuest, setupFounder, test, type Page } from './fixtures';

/**
 * Player feedback: "when the user gets to the hotel, show the room with
 * bathrooms like the original home, and no button to fly home when the guest
 * just arrived". Abroad, your hotel opens as a 3D room drawn like your home
 * (a bed, a bathroom behind a door, a wardrobe, your suitcase), sized by the
 * tier you booked, titled with the hotel's name; its tray is Sleep, Freshen
 * up, Go out and More (flying home is under More). Lite keeps the flat room,
 * without Fly home in its tray either.
 *
 * HOTEL_SHOTS=<dir> saves 390×844 screenshots of the three tiers.
 */
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS = process.env.HOTEL_SHOTS;

async function command(page: Page, command: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}

interface View {
  me: {
    energy: number;
    destinations: { id: string; hotels?: { tier: string; name: string; affordable: boolean }[] }[];
    location?: { hotel?: { tier: string; name: string } } | null;
  };
}
const state = async (page: Page) =>
  ((await page.request.get('/api/state').then((r) => r.json())) as { view: View }).view;

test('landing in London with a hotel: a 3D room with a bathroom, no Fly home in the tray', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-06-14T12:30:00Z'));
  await playAsGuest(page);
  await setupFounder(page, {
    name: `Tia Traveller`,
    handle: `room_${letters(8)}`,
    company: `Roam ${letters(6)}`,
    idea: 'Payments for travellers',
    market: /Lagos/,
  });
  // Book London with a hotel (a business hotel if you can afford it) and fly.
  const hotels = (await state(page)).me.destinations.find((d) => d.id === 'london')!.hotels!;
  const pick = hotels.find((h) => h.tier === 'business' && h.affordable) ?? hotels[0]!;
  expect(pick.affordable).toBe(true);
  await command(page, { type: 'travel.book', to: 'london', hotel: pick.tier });
  await command(page, { type: 'travel.fly', to: 'london' });
  expect((await state(page)).me.location?.hotel).toMatchObject({ tier: pick.tier });

  // A new session in London opens in your hotel room, in 3D.
  // Set as the page loads: the open page marks itself seen as it unloads.
  await page.addInitScript(() => {
    // Every load counts as coming back after a while (a new session).
    for (const k of Object.keys(localStorage))
      if (k.startsWith('runway.lastSeen')) localStorage.removeItem(k);
    if (sessionStorage.getItem('hotel-room-reset')) return;
    sessionStorage.setItem('hotel-room-reset', '1');
    localStorage.setItem('runway.startAtHome', '1');
    localStorage.setItem('runway.mapQuality', '3d');
  });
  await page.reload();
  const room = page.locator('.home-scene[data-hotel-room]');
  await expect(room).toBeVisible({ timeout: 60_000 });
  await expect(room).toHaveAttribute('data-hotel-room', pick.tier);
  await expect(room).toHaveAttribute('data-room', 'hotel');
  await expect(room).toHaveClass(/is-3d/, { timeout: 90_000 });
  // The bathroom: a shower, a toilet and a basin, behind a door.
  await expect(room).toHaveAttribute('data-bathroom', /shower.*toilet.*sink/);
  await expect(room.locator('canvas[data-home-3d]')).toHaveAttribute('data-bathrooms', '1');
  await expect(room.locator('[data-bath-door]').first()).toBeAttached();
  for (const thing of ['bed', 'wardrobe', 'suitcase', 'shower', 'toilet', 'sink'])
    await expect(room.locator(`[data-obj="${thing}"]`), thing).toBeAttached();
  // Titled with the hotel you booked, the tier under it.
  await expect(room.locator('h2').first()).toHaveText(pick.name);
  await expect(room.locator('[data-hotel-tier]')).toHaveAttribute('data-hotel-tier', pick.tier);
  // Look around and Photo are there; nothing of your own home (Buy, Edit, Invite).
  await expect(room.locator('[data-action="look-around"]')).toBeVisible();
  await expect(room.locator('[data-action="photo"]')).toBeVisible();
  const tray = room.getByRole('navigation', { name: 'Hotel room actions' });
  await expect(tray.getByRole('button')).toHaveText([/Sleep/, /Freshen up/, /Go out/, /More/]);
  await expect(room.locator('[data-action="fly-home"]')).toHaveCount(0);
  await expect(room.getByRole('button', { name: /^(🛒\s*)?Buy$|^(🛋\s*)?Edit$/ })).toHaveCount(0);
  await expect(room.locator('.home-plus')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/arrived-${pick.tier}.png` });

  // Sleep after the flight: you walk to the bed and rest (the home's own act).
  await tray.locator('[data-action="hotel-sleep"]').click();
  // (Walking to the bed is frame-paced: slow under a software renderer on CI.)
  await expect(room.locator('.home-float').first()).toBeAttached({ timeout: 60_000 });

  // Flying home is under More.
  await tray.locator('[data-action="more"]').click();
  const more = room.locator('[data-hotel-more]');
  await expect(more).toBeVisible();
  await expect(more.getByRole('button', { name: 'Fly home' })).toBeVisible();
  await more.getByRole('button', { name: 'Close' }).click();
  await expect(more).toBeHidden();

  // Go out: back to the map of London.
  await tray.locator('[data-action="go-out"]').click();
  await expect(room).toBeHidden();
  await expect(page.getByRole('application', { name: /Map of London/ })).toBeVisible({
    timeout: 30_000,
  });

  // Lite: the flat hotel room, still without Fly home in its tray.
  await page.evaluate(() => {
    localStorage.setItem('runway.mapQuality', 'lite');
  });
  await page.reload();
  const flat = page.locator('.place-scene[data-scene="home"]');
  await expect(flat).toBeVisible({ timeout: 20_000 });
  await expect(flat).toHaveAttribute('data-room', 'hotel');
  await expect(flat.locator('.tray-actions [data-action="fly-home"]')).toHaveCount(0);
  await expect(flat.locator('.tray-actions [data-action="hotel-sleep"]')).toBeVisible();
  await flat.locator('.tray-actions [data-action="go-out"]').click();
  await expect(flat).toBeHidden();
});

test('the three hotel rooms: budget, business and a luxury suite with a tub', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('runway.mapQuality', '3d'));
  await page.clock.setFixedTime(new Date('2026-06-14T11:30:00Z'));
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Hana Hotels',
    handle: `hotels_${letters(8)}`,
    company: `Stays ${letters(8)}`,
    idea: 'Tools for local businesses',
    market: /Lagos/,
  });
  const sizes: Record<string, number> = {};
  for (const tier of ['budget', 'business', 'luxury']) {
    await page.getByRole('button', { name: 'Today' }).click();
    const tools = page.locator('[data-home-preview]');
    await tools.scrollIntoViewIfNeeded();
    await tools.locator(`[data-preview-hotel="${tier}"]`).click();
    const room = page.locator('.home-scene[data-hotel-room]');
    await expect(room).toHaveAttribute('data-hotel-room', tier);
    await expect(room).toHaveClass(/is-3d/, { timeout: 90_000 });
    await expect(room.locator('canvas[data-home-3d]')).toHaveAttribute('data-bathrooms', '1');
    await expect(room).toHaveAttribute(
      'data-bathroom',
      tier === 'luxury' ? 'shower toilet sink bathtub' : 'shower toilet sink',
    );
    sizes[tier] = Number(await room.getAttribute('data-plan-w'));
    if (tier === 'business') {
      await expect(room.locator('[data-obj="desk"]')).toBeAttached();
      await expect(room.locator('[data-obj="armchair"]')).toBeAttached();
    }
    if (tier === 'luxury') await expect(room.locator('[data-obj="sofa"]')).toBeAttached();
    await page.waitForTimeout(1500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tier}.png` });
    await room.getByRole('button', { name: 'Close' }).first().click();
    await expect(room).toBeHidden();
  }
  expect(sizes.business).toBeGreaterThan(sizes.budget!);
  expect(sizes.luxury).toBeGreaterThan(sizes.business!);
});
