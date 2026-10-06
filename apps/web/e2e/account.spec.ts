import { expect, letters, type Page, playAsGuest, randomEmail, tab, test } from './fixtures';

/** Guest → a founder in Lagos; returns the company name. */
async function onboardFounder(page: Page) {
  const company = `Keep Pay ${letters(5)}`;
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill('Kemi E2E');
  await page.getByLabel('Handle').fill(`kemi_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Savings for market traders');
  await page.getByLabel('Company name').fill(company);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(tab(page, 'Today')).toBeVisible();
  return company;
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Me', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
}

test('a guest saves their game with an email link, signs out, and logs back in by email', async ({
  page,
}) => {
  const company = await onboardFounder(page);
  const email = randomEmail();

  // Home nudges a guest to save once their first month is over.
  await tab(page, 'Today').click();
  await expect(page.getByText(/First customer/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep your game' })).toHaveCount(0);
  const settled = page.waitForResponse((r) => r.url().endsWith('/api/dev/settle'));
  await page.getByRole('button', { name: /Advance Lagos one month/ }).click();
  expect((await settled).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Keep your game' })).toBeVisible();

  // Save progress from the Me tab.
  await page.getByRole('button', { name: 'Me', exact: true }).click();
  await expect(page.getByText(/Playing as a guest/)).toBeVisible();
  await page.getByRole('button', { name: 'Save progress' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Save progress' });
  await expect(sheet.getByText(/your game lives only in this browser/)).toBeVisible();
  await sheet.getByLabel('Email').fill(email);
  await sheet.getByRole('button', { name: 'Email me a link' }).click();
  await expect(sheet.getByText(`we sent a link to ${email}`, { exact: false })).toBeVisible();
  // No email leaves a test server: it hands the link back instead.
  await sheet.getByRole('link', { name: 'Preview: open your sign-in link' }).click();
  await expect(page.getByText(`Progress saved. Log in with ${email} on any device.`)).toBeVisible();
  await expect(page).not.toHaveURL(/signin=/);

  // Saved: the email shows in Settings, and the guest banner is gone.
  await openSettings(page);
  await expect(page.getByText(`Saved as ${email}`)).toBeVisible();
  await expect(page.getByText(/Playing as a guest/)).toHaveCount(0);

  // A saved player signs out without a warning…
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Play now' })).toBeVisible();

  // …and logs back in with a new link: same player, same company.
  await page.getByRole('button', { name: 'Already saved? Log in' }).click();
  await page.getByLabel('Email').fill(email.toUpperCase());
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await page.getByRole('link', { name: 'Preview: open your sign-in link' }).click();
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();
  await tab(page, 'Company').click();
  await expect(page.getByText(company).first()).toBeVisible();
  await openSettings(page);
  await expect(page.getByText(`Saved as ${email}`)).toBeVisible();
});

test('a guest who signs out is warned they will lose their game', async ({ page }) => {
  await onboardFounder(page);
  await openSettings(page);
  await expect(page.getByText('Guest: not saved yet')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const warn = page.getByRole('dialog', { name: 'Leave this game?' });
  await expect(
    warn.getByText('You’ll lose this game unless you save it with an email.'),
  ).toBeVisible();

  // "Save progress" from the warning opens the save sheet instead of leaving.
  await warn.getByRole('button', { name: 'Save progress' }).click();
  const sheet = page.getByRole('dialog', { name: 'Save progress' });
  await expect(sheet.getByLabel('Email')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Guest: not saved yet')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page
    .getByRole('dialog', { name: 'Leave this game?' })
    .getByRole('button', { name: 'Leave anyway' })
    .click();
  await expect(page.getByRole('button', { name: 'Play now' })).toBeVisible();
});
