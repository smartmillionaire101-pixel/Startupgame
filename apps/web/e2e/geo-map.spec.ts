import { expect, letters, playAsGuest, tapPlace, test } from './fixtures';

/** Wave 8 §A: Lagos on its real map (OpenStreetMap). */
test('Lagos is drawn from OpenStreetMap, credited, and you can walk its real roads', async ({
  page,
}) => {
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Your name').fill('Femi Maps');
  await page.getByLabel('Handle').fill(`femi_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Delivery for island shops');
  await page.getByLabel('Company name').fill(`Eko Routes ${letters(5)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

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
