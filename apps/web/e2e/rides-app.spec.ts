import type { Page } from '@playwright/test';
import { expect, letters, playAsGuest, setupFounder, test } from './fixtures';

/**
 * A ride booked in the phone's Rides app goes straight there: the ride scene
 * plays and you arrive, with no second "How do you want to get there?" on
 * the map. From the map and from home (the ride picks you up there).
 *
 * RIDES_SHOTS=<dir> saves screenshots.
 */

const SHOTS = process.env.RIDES_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rides-${name}.png` });
};

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  // The shared fixture skips rides; here they play.
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('runway.skipRides');
    } catch {
      /* storage blocked */
    }
  });
});

async function founder(page: Page) {
  await playAsGuest(page);
  const n = letters(6);
  await setupFounder(page, {
    name: `Rida ${n}`,
    handle: `rida_${n}`,
    company: `Rideshare ${letters(5)}`,
    idea: 'Payments for drivers',
    market: /Lagos, Nigeria/,
  });
}

/** Phone → Rides → the Event Hall (across town) → a taxi → Book. */
async function bookTaxi(page: Page, open: () => Promise<void>) {
  await open();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await phone.locator('[data-app="rides"]').click();
  await phone.getByRole('searchbox', { name: 'Where to?' }).fill('Event');
  await phone.locator('[data-place="eventhall"]').click();
  await phone.locator('[data-mode="taxi"]').click();
  await shot(page, 'book');
  await phone.getByRole('button', { name: /^Book / }).click();
  await expect(phone).toBeHidden();
}

/** The taxi plays, you arrive at the Event Hall, and nobody asks how again. */
async function arrives(page: Page) {
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  const scene = page.locator('.ride-scene[data-ride-mode="taxi"]');
  await expect(scene).toBeVisible({ timeout: 10_000 });
  await expect(chooser).toBeHidden();
  // The card shows the fare paid in the app.
  await expect(scene.locator('.ride-card-fare')).toHaveText(/₦/);
  await scene
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(scene).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.place-scene[data-scene="eventhall"]')).toBeVisible({
    timeout: 10_000,
  });
  await expect(chooser).toBeHidden();
}

test('a ride booked in the Rides app goes straight there from the map', async ({ page }) => {
  test.slow();
  await founder(page);
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible({
    timeout: 30_000,
  });
  await bookTaxi(page, () => page.getByRole('button', { name: /^Phone/ }).click());
  await arrives(page);
  await shot(page, 'arrived');
});

test('a ride booked in the Rides app picks you up from home', async ({ page }) => {
  test.slow();
  await page.addInitScript(() => {
    localStorage.setItem('runway.startAtHome', '1');
    for (const k of Object.keys(localStorage))
      if (k.startsWith('runway.lastSeen')) localStorage.removeItem(k);
  });
  await founder(page);
  const home = page.locator('.place-scene[data-scene="home"]');
  await expect(home).toBeVisible({ timeout: 30_000 });
  await bookTaxi(page, () => home.locator('[data-home-phone]').click());
  await shot(page, 'from-home');
  await arrives(page);
});
