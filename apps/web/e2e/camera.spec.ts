import { writeFileSync } from 'node:fs';
import { expect, letters, playAsGuest, setupFounder, tab, test } from './fixtures';

/**
 * The camera (player feedback): a founder turns the company's numbers into a
 * picture to save or share, and it's kept with their photos.
 */
test('a founder shares a picture of the company’s results', async ({ page }) => {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Cam Era',
    handle: `cam_${letters(8)}`,
    company: `Snaps ${letters(6)}`,
    idea: 'Invoices for market traders',
  });
  await tab(page, 'Company').click();
  await page.locator('[data-action="company-photo"]').click();
  const photo = page.getByRole('dialog', { name: 'Your company’s results' });
  await expect(photo.locator('img.home-photo-big')).toHaveAttribute('src', /^data:image\/jpeg/);
  await expect(photo.locator('[data-action="save-photo"]')).toHaveAttribute(
    'download',
    /results-.+\.jpg$/,
  );
  // CAMERA_SHOTS=<file.jpg> saves the card for review.
  if (process.env.CAMERA_SHOTS) {
    const src = (await photo.locator('img.home-photo-big').getAttribute('src'))!;
    writeFileSync(process.env.CAMERA_SHOTS, Buffer.from(src.split(',')[1]!, 'base64'));
  }
  // Kept on this device with the other photos.
  await expect(photo.locator('.home-photo-list li')).toHaveCount(1);
});
