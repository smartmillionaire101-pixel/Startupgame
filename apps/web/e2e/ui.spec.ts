import { expect, letters, playAsGuest, test, type Page } from './fixtures';

/** Wave 7 §D: the UI overhaul, measured on a small phone (360 px wide). */
test.use({ viewport: { width: 360, height: 780 } });

async function founder(page: Page) {
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill('Ada Overhaul');
  await page.getByLabel('Handle').fill(`ada_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Payments for market traders');
  await page.getByLabel('Company name').fill(`Ledger ${letters(5)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
}

test('the overhaul: one-line top bar, small avatar, a What-to-do chip, five tabs', async ({
  page,
}) => {
  await founder(page);

  // The top bar is one 48 px line at 360 px, with the phone in it.
  const bar = page.locator('.topbar');
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(56);
  const date = (await page.locator('.topbar-date').boundingBox())!;
  expect(date.height).toBeLessThan(24);
  await expect(page.locator('.topbar-date')).toHaveText(/^Y\d+ M\d+$/);
  await expect(bar.getByRole('button', { name: /^Phone/ })).toBeVisible();
  // Nothing in the bar overflows the screen.
  const right = await bar.evaluate((el) =>
    Math.max(...[...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect().right)),
  );
  expect(right).toBeLessThanOrEqual(360);

  // Your avatar is person-sized next to the buildings: 20–34 px at the default zoom.
  const fig = page.locator('.city-avatar .city-avatar-fig').first();
  await expect(fig).toBeAttached();
  const h = (await fig.boundingBox())!.height;
  expect(h).toBeGreaterThanOrEqual(20);
  expect(h).toBeLessThanOrEqual(34);

  // People are depth-sorted with the buildings (drawn inside the skyline's slots).
  await expect(page.locator('.city-skyline [data-depth-slot] .city-avatar')).toHaveCount(1);

  // "What to do now" is a collapsed chip; it opens as a sheet.
  const chip = page.locator('.hud-whatnow-chip');
  await expect(chip).toBeVisible();
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.height).toBeLessThanOrEqual(52);
  await expect(page.locator('.whatnow-btn')).toHaveCount(0);
  await chip.click();
  await expect(page.getByRole('dialog', { name: 'What to do now' })).toBeVisible();
  await page.getByRole('dialog', { name: 'What to do now' }).getByLabel('Close').click();

  // At most five tabs, each with an icon from the same set.
  const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('button');
  const n = await tabs.count();
  expect(n).toBeLessThanOrEqual(5);
  await expect(page.locator('.nav svg.icon')).toHaveCount(n);

  // The phone button opens the phone; the floating one is gone.
  await bar.getByRole('button', { name: /^Phone/ }).click();
  await expect(page.getByRole('dialog', { name: 'Phone' })).toBeVisible();
  await expect(page.locator('.phone-fab')).toBeHidden();
});

test('day one reads plainly: pre-revenue, new, investors in town', async ({ page }) => {
  await founder(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: /^Today/ }).click();
  await expect(page.getByText('Pre-revenue')).toBeVisible();
  await expect(page.getByText('Default dead')).toHaveCount(0);
  await expect(page.getByText('Public warning')).toHaveCount(0);
  // News lives behind Today now.
  await page.getByRole('button', { name: /^News/ }).click();
  await expect(page.getByRole('heading', { name: 'News', level: 1 })).toBeVisible();

  await nav.getByRole('button', { name: /^Money/ }).click();
  await expect(page.getByRole('heading', { name: 'Investors in town' })).toBeVisible();
  await expect(page.getByText('AI investors')).toHaveCount(0);
  // The first screen is short: under about 1.5 viewports.
  const tall = await page.evaluate(() => document.documentElement.scrollHeight / innerHeight);
  expect(tall).toBeLessThan(1.6);
});
