import { expect, pickPath, test, type Page } from './fixtures';

/**
 * The three sign-up steps on a 412 × 915 phone and a 1280 × 800 screen: no
 * sideways scrolling, the look step fits the phone without scrolling, every
 * city shows its own skyline, and the email is checked on the field.
 * SIGNUP_SHOTS=<dir> saves screenshots of each step.
 */
const SHOTS = process.env.SIGNUP_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const noSideScroll = async (page: Page, width: number) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );

test.describe('phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('path, look (EN and FR) and about you, with every city’s skyline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Pick your path' })).toBeVisible();
    await page.getByRole('radio', { name: 'Founder', exact: true }).check();
    await noSideScroll(page, 412);
    await shot(page, '1-path');
    await page.getByRole('button', { name: /^Continue/ }).click();

    // The look: the whole step and its Next button fit the phone.
    await expect(page.getByRole('heading', { name: 'Your look' })).toBeVisible();
    await page.getByRole('radio', { name: 'Woman', exact: true }).check();
    await page.getByRole('radio', { name: 'Braids', exact: true }).check();
    await page.getByRole('radio', { name: 'Skin tone 3' }).check();
    const next = page.getByRole('button', { name: /^Next/ });
    const box = (await next.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(915);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      915,
    );
    await noSideScroll(page, 412);
    await shot(page, '2-look');
    await page.getByRole('radio', { name: 'Man', exact: true }).check();
    await page.getByRole('radio', { name: 'Red', exact: true }).check();
    await expect(page.locator('.su-stage-big [data-preview]')).toHaveAttribute(
      'data-top',
      '#dc2626',
    );
    await shot(page, '2-look-man');
    await page.getByRole('radio', { name: 'Woman', exact: true }).check();
    await page.getByRole('radio', { name: 'Your look’s colour' }).check();
    // In French.
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('heading', { name: 'Votre look' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      915,
    );
    await shot(page, '2-look-fr');
    await page.getByRole('button', { name: 'English' }).click();
    await next.click();

    // About you.
    await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
    await page.getByLabel('Your name', { exact: true }).fill('Ada Okafor');
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue(/^ada_okafor\d*$/);
    await expect(page.locator('#su-username-st')).toHaveText('✓ Available');
    const cities = page.getByRole('radiogroup', { name: 'Your city' });
    const strip = page.locator('.su-stage-strip');
    const seen = new Set<string>();
    for (const radio of await cities.getByRole('radio').all()) {
      await radio.check();
      const id = await strip.getAttribute('data-city');
      await expect(strip.locator('[data-skyline]')).toHaveAttribute('data-skyline', id!);
      seen.add(id!);
    }
    expect(seen.size).toBe(10);
    await cities.getByRole('radio', { name: 'London', exact: true }).check();
    await page.getByLabel('Email', { exact: true }).fill('ada.okafor@gmail.com');
    await page.getByLabel('Email', { exact: true }).blur();
    await expect(page.getByText('✓ Looks good')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Play/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I’m 18 or older' }).check();
    await expect(page.getByRole('button', { name: /^Play/ })).toBeEnabled();
    await noSideScroll(page, 412);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '3-about');
    if (SHOTS) {
      await page.addStyleTag({ content: '.su-dock{position:static}' });
      await page.screenshot({ path: `${SHOTS}/3-about-full.png`, fullPage: true });
      await page.addStyleTag({ content: '.su-dock{position:sticky}' });
    }

    // A half-typed email is caught on the field.
    await page.getByLabel('Email', { exact: true }).fill('ada@gmail');
    await page.getByLabel('Email', { exact: true }).blur();
    const err = page.getByRole('alert');
    await expect(err).toHaveText('Add the end of your email, like ada@gmail.com');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Email', { exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 160));
    await shot(page, '3-about-email-error');

    // A city from the new skylines.
    await page.getByLabel('Email', { exact: true }).fill('ada.okafor@gmail.com');
    await cities.getByRole('radio', { name: 'Nairobi', exact: true }).check();
    await expect(page.locator('#su-username-st')).toHaveText('✓ Available');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '3-about-nairobi');
  });
});

test.describe('desktop', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });

  test('the live avatar on the left, the steps on the right', async ({ page }) => {
    await page.goto('/');
    await pickPath(page, 'founder');
    await expect(page.getByRole('heading', { name: 'Your look' })).toBeVisible();
    await page.getByRole('radio', { name: 'Woman', exact: true }).check();
    await page.getByRole('radio', { name: 'Braids', exact: true }).check();
    await expect(page.locator('.su-stage-side')).toBeVisible();
    await expect(page.locator('.su-stage-big')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Next: About you/ })).toBeVisible();
    await noSideScroll(page, 1280);
    await shot(page, 'desktop-2-look');
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Ada Okafor');
    await page.getByRole('radio', { name: 'Accra', exact: true }).check();
    await expect(page.locator('.su-stage-side')).toHaveAttribute('data-city', 'accra');
    await shot(page, 'desktop-3-about');
  });
});
