import { expect, letters, playAsGuest, setupFounder, tapPlace, test } from './fixtures';

/** Wave 8 §A: Lagos on its real map (OpenStreetMap). */
test('Lagos is drawn from OpenStreetMap, credited, and you can walk its real roads', async ({
  page,
}) => {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Femi Maps',
    handle: `femi_${letters(6)}`,
    company: `Eko Routes ${letters(5)}`,
    idea: 'Delivery for island shops',
    gender: 'male',
  });

  const map = page.getByRole('application', { name: /Map of Lagos/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  // The real map: painted on a canvas under the city, with the credit the licence asks for.
  await expect(map.locator('canvas.city-geo-canvas')).toBeAttached();
  const credit = map.locator('[data-osm-credit]');
  await expect(credit).toBeVisible();
  await expect(credit).toHaveText('© OpenStreetMap contributors');
  await expect(credit).toHaveAttribute('href', /openstreetmap\.org\/copyright/);
  // A landmark at its real place.
  await expect(page.locator('[data-landmark="Lekki–Ikoyi Link Bridge"]')).toBeAttached();

  // Walk to the Hub next door along the real roads, and go in.
  await tapPlace(page, '[data-place="hub"]', 'walk');
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // A bank on Lagos Island is across the Lagoon: far, so you choose how to go.
  await tapPlace(page, '[data-place^="lender:"]', 'taxi');
  const lobby = page.getByRole('dialog');
  await expect(lobby).toBeVisible({ timeout: 15_000 });
  await expect(lobby).toHaveAttribute('data-room', 'bank');
});
